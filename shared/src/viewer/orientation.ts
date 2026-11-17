import { finiteOr, type Mat4, type Quat, type Vec3 } from "./types";

/**
 * The manifest orientation fix (Requirement 1.4, world-viewer task 2.1): the `upFix`
 * rotation followed by the uniform `scale`, as one column-major matrix, so the world's
 * up direction becomes +Y in scaled world units. The rotation is applied first, then the
 * scale: `M = S * R`. A quaternion that is not four finite numbers of non-zero length
 * becomes the identity rotation, and a scale that is not positive and finite becomes 1,
 * so a bad manifest cannot turn the world inside out (the determinant stays positive).
 */
export function orientationTransform(orientation: { upFix: Quat; scale: number }): Mat4 {
  const raw: Quat = [
    finiteOr(orientation.upFix[0], 0),
    finiteOr(orientation.upFix[1], 0),
    finiteOr(orientation.upFix[2], 0),
    finiteOr(orientation.upFix[3], 0),
  ];
  const len = Math.hypot(raw[0], raw[1], raw[2], raw[3]);
  const [x, y, z, w] = len > 0 ? [raw[0] / len, raw[1] / len, raw[2] / len, raw[3] / len] : [0, 0, 0, 1];
  const s = orientation.scale > 0 && Number.isFinite(orientation.scale) ? orientation.scale : 1;

  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;

  // Column-major: each group of four is one column of S * R.
  return [
    (1 - (yy + zz)) * s, (xy + wz) * s, (xz - wy) * s, 0,
    (xy - wz) * s, (1 - (xx + zz)) * s, (yz + wx) * s, 0,
    (xz + wy) * s, (yz - wx) * s, (1 - (xx + yy)) * s, 0,
    0, 0, 0, 1,
  ];
}

/** Applies a column-major matrix to a point (the viewer's matrices carry no translation). */
export function transformPoint(m: Mat4, v: Vec3): Vec3 {
  const [x, y, z] = v;
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

/** The determinant of the upper 3x3 part: positive means handedness is preserved. */
export function determinant3(m: Mat4): number {
  return (
    m[0] * (m[5] * m[10] - m[9] * m[6]) -
    m[4] * (m[1] * m[10] - m[9] * m[2]) +
    m[8] * (m[1] * m[6] - m[5] * m[2])
  );
}
