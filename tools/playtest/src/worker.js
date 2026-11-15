// Entry point of the playtest Worker. Static pages are served by the assets binding; only /api/* reaches this code.
import { LabRoom } from './lab-room.js';
import { handle } from './route.js';

export { LabRoom };
export default { fetch: (request, env) => handle(request, env) };
