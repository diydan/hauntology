/**
 * The operator's command for the world switch on a running Worker (world-pipeline 4.4): look at it, close it, open it.
 * It calls `GET /admin/status` and `POST /admin/kill`, which exist only where `ADMIN_TOKEN` is set.
 *
 * The token comes from the environment (`ADMIN_TOKEN`), never from an argument (an argument shows in the process list), and is
 * never printed. It is sent only over https, or over http to a loopback address for a local Worker, and a redirect is not
 * followed (it would carry the token to another host).
 */

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);
const ACTIONS = { status: null, close: true, open: false };

/** The base address if the token may be sent to it, else a reason. */
export function checkBase(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, reason: "that is not an address" };
  }
  if (u.username !== "" || u.password !== "") return { ok: false, reason: "the address must not hold a user name or password" };
  if (u.protocol === "https:" || (u.protocol === "http:" && LOOPBACK.has(u.hostname))) return { ok: true, origin: u.origin };
  return { ok: false, reason: "the token is sent only over https (or http to localhost)" };
}

export const USAGE = "usage: ADMIN_TOKEN=... node tools/worldgen-switch.mjs <https://your-worker> status|close|open\n  (or set HAUNTOLOGY_URL instead of the address)";

const describe = (body) => {
  const lines = [`world making: ${String(body.worldGen).toUpperCase()}`];
  if (Array.isArray(body.reasons) && body.reasons.length > 0) lines.push(`  because: ${body.reasons.join(", ")}`);
  if (body.dayCapReached === true) lines.push("  the day cap is reached");
  if (body.totalCapReached === true) lines.push("  the total cap is reached");
  return lines.join("\n");
};

/** Runs one command. `io` is `{ fetch, log, error }`; returns the exit code. */
export async function run(argv, env, io = {}) {
  const fetcher = io.fetch ?? fetch;
  const log = io.log ?? ((t) => console.log(t));
  const error = io.error ?? ((t) => console.error(t));

  const [first, second] = argv;
  const action = second ?? first;
  const base = second !== undefined ? first : env.HAUNTOLOGY_URL;
  const known = (a) => typeof a === "string" && Object.hasOwn(ACTIONS, a);
  if (!known(action) || base === undefined || (second === undefined && !known(first))) {
    error(USAGE);
    return 1;
  }
  const token = typeof env.ADMIN_TOKEN === "string" ? env.ADMIN_TOKEN.trim() : "";
  if (token === "") {
    error("ADMIN_TOKEN is not set. Put the operator's token in your own shell (never in chat or a file in the repo).");
    return 1;
  }
  const checked = checkBase(base);
  if (!checked.ok) {
    error(`refusing to send the token: ${checked.reason}`);
    return 1;
  }

  const on = ACTIONS[action];
  const init = {
    method: on === null ? "GET" : "POST",
    headers: { Authorization: `Bearer ${token}`, ...(on === null ? {} : { "Content-Type": "application/json" }) },
    ...(on === null ? {} : { body: JSON.stringify({ on }) }),
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  };
  let res;
  try {
    res = await fetcher(`${checked.origin}/admin/${on === null ? "status" : "kill"}`, init);
  } catch {
    error("could not reach the Worker");
    return 1;
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* not JSON */
  }
  if (res.status === 200 && body !== null && typeof body === "object" && typeof body.worldGen === "string") {
    log(describe(body));
    return 0;
  }
  // Nothing from the answer is printed but its status and its stable code, so a reply can never echo the token back.
  const code = body !== null && typeof body === "object" && typeof body.code === "string" && /^[a-z_]{1,40}$/.test(body.code) ? ` (${body.code})` : "";
  error(res.status === 404 ? "no operator routes there: ADMIN_TOKEN is not set on that Worker, or the address is wrong" : `the Worker refused: HTTP ${res.status}${code}`);
  return 1;
}
