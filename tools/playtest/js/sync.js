// Clock sync between a device and the server, NTP style. Pure: the clock is passed in.
// A sample is { t0, ts, t1 }: the device clock when it sent the ping, the server clock in the answer, and the device clock on receipt.

/** One sample to { rtt, offset }: offset is server clock minus device clock, assuming a symmetric trip. */
export function sampleOffset({ t0, ts, t1 }) {
  const rtt = t1 - t0;
  return { rtt, offset: ts - (t0 + rtt / 2), err: rtt / 2 };
}

/**
 * The best offset from many samples: the one with the smallest round trip, since its error bound (half the trip)
 * is the smallest. Returns null when there are no usable samples. `err` is that bound in milliseconds.
 */
export function estimateOffset(samples) {
  let best = null;
  for (const s of samples) {
    if (![s.t0, s.ts, s.t1].every(Number.isFinite) || s.t1 < s.t0) continue;
    const o = sampleOffset(s);
    if (!best || o.rtt < best.rtt) best = o;
  }
  return best;
}

/** The server's clock as the device estimates it. */
export const serverNow = (deviceNow, offset) => deviceNow + offset;
/** The device clock reading at which a server timestamp happens. */
export const deviceTimeFor = (serverTime, offset) => serverTime - offset;
