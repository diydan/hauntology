import { scrub } from '../../lib/worldlabs-spike.mjs';

// The MCP protocol part of the dev server (world-pipeline task 0): JSON-RPC 2.0 over newline-delimited messages, the tools
// listed in tools/worldlabs-mcp/README.md. `handleMessage` is pure over a client, so the tests drive it without a process.

export const PROTOCOL_VERSION = '2024-11-05';

export const TOOLS = [
  {
    name: 'worldlabs_generate_from_image',
    description: 'SPENDS CREDITS. Makes one world from one local picture (jpg, jpeg, png or webp). Give max_credits: the call is refused if the model could cost more. Returns an operation id; read it with worldlabs_get_operation.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Local path to the picture.' },
        name: { type: 'string', description: 'Display name, at most 80 characters.' },
        model: { type: 'string', enum: ['marble-1.0-draft', 'marble-1.0', 'marble-1.1', 'marble-1.1-plus'], default: 'marble-1.0-draft' },
        pano: { type: 'boolean', description: 'The picture is an equirectangular panorama.', default: false },
        max_credits: { type: 'number', description: 'The most this call may cost. Required.' },
      },
      required: ['path', 'max_credits'],
      additionalProperties: false,
    },
  },
  {
    name: 'worldlabs_get_operation',
    description: 'Reads an operation (free). Once done, the spend ledger takes the real cost.',
    inputSchema: { type: 'object', properties: { operation_id: { type: 'string' } }, required: ['operation_id'], additionalProperties: false },
  },
  {
    name: 'worldlabs_get_world',
    description: 'Reads one world (free). Asset addresses are described, not returned. save_fixture writes a scrubbed copy to the fixture folder.',
    inputSchema: {
      type: 'object',
      properties: { world_id: { type: 'string' }, save_fixture: { type: 'boolean', default: false } },
      required: ['world_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'worldlabs_list_worlds',
    description: 'Lists worlds on the account (free). The endpoint is not yet verified against the service.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'worldlabs_spend_status',
    description: 'The spend ledger: credits spent, the caps, the last runs. Free and local.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

const text = (value) => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] });
const fail = (message) => ({ content: [{ type: 'text', text: message }], isError: true });

/** Runs one tool. Every answer passes through the client's redaction, so the key cannot appear in a reply. */
export async function callTool(client, name, args = {}) {
  const redact = (s) => client._redact(s);
  try {
    switch (name) {
      case 'worldlabs_generate_from_image': {
        if (typeof args.max_credits !== 'number') return fail('max_credits is required: the most this call may cost, in credits.');
        const r = await client.generate({ path: args.path, name: args.name, model: args.model, isPano: args.pano === true, maxCredits: args.max_credits });
        return text({ operation_id: r.operationId, estimate: r.estimate, balance_before: r.balanceBefore, next: 'read it with worldlabs_get_operation' });
      }
      case 'worldlabs_get_operation': {
        const op = await client.operation(String(args.operation_id ?? ''));
        return text({ ...op, response: op.response ? client.worldSummary(op.response) : undefined });
      }
      case 'worldlabs_get_world': {
        const w = await client.world(String(args.world_id ?? ''));
        const summary = client.worldSummary(w);
        const saved = args.save_fixture === true ? client.saveFixture(`world-${w.world_id ?? w.id ?? 'unknown'}`, w) : undefined;
        return text(saved === undefined ? summary : { ...summary, fixture: saved });
      }
      case 'worldlabs_list_worlds':
        return text(scrub(await client.listWorlds()));
      case 'worldlabs_spend_status':
        return text(client.spendStatus());
      default:
        return fail(`unknown tool ${name}`);
    }
  } catch (e) {
    return fail(redact(e?.message ?? e).slice(0, 500));
  }
}

/** One JSON-RPC message in, the reply out (or null for a notification). */
export async function handleMessage(client, msg) {
  const reply = (result) => ({ jsonrpc: '2.0', id: msg.id, result });
  const error = (code, message) => ({ jsonrpc: '2.0', id: msg?.id ?? null, error: { code, message } });
  if (msg === null || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return error(-32600, 'invalid request');
  const isNotification = msg.id === undefined;
  switch (msg.method) {
    case 'initialize':
      return reply({ protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: 'worldlabs-dev', version: '0.1.0' } });
    case 'notifications/initialized':
      return null;
    case 'ping':
      return isNotification ? null : reply({});
    case 'tools/list':
      return reply({ tools: TOOLS });
    case 'tools/call': {
      const name = msg.params?.name;
      if (typeof name !== 'string') return error(-32602, 'tools/call needs a tool name');
      return reply(await callTool(client, name, msg.params?.arguments ?? {}));
    }
    default:
      return isNotification ? null : error(-32601, `method not found: ${msg.method}`);
  }
}
