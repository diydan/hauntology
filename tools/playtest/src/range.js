// Byte ranges for video (Safari will not play or seek a video unless the server answers `Range`). Shared by the local server and the Worker.

/** "bytes=a-b", "bytes=a-" or "bytes=-n" against a file of `size` bytes: [start, end] (inclusive) or null when it cannot be met. */
export function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header || '');
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let start = m[1] === '' ? size - Number(m[2]) : Number(m[1]);
  const end = m[1] === '' || m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  if (m[1] === '') start = Math.max(0, start);
  return start <= end && start < size ? [start, end] : null;
}
