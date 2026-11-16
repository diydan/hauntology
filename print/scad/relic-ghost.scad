// Hauntology Tabletop Print Kit — Relic (extra): the optimised ghost as a Relic miniature
// Colour: Bone (#e9e4d8)
// Size: ~36.7 W x 19.3 D x 48.5 H mm (Ø14.6 mm foot with Ø6.1 mm centre socket)
// The ghost is the smooth, support-free body from tools/ghost-print/make-ghost-print.py (profile "relic": 0.68 x the printable ghost,
// no flare, centred on its base), saved as print/reference/relic-ghost-body.stl. It stands on the standard Relic foot: a flat
// Ø14.6 mm foot with a Ø6.1 mm socket for the token peg and a 45-degree corbel up to the body. The shoulders under the cloth are
// 45-degree chamfers, and each eye is a deep socket (about 2.5 mm) to paint black, 6.5 mm apart and high on the head. No sticker: the QR is on the token.
// Print orientation: Flat on the foot (Z = 0), zero supports.
// Not one of the six Relics the game knows (r1 to r6): it has no token text yet.

include <_common.scad>

module relic_ghost() {
  // 1. Standard Relic foot and socket (z = 0..4.5); the corbel's top is wide enough to carry the body's base corners
  relic_pedestal_base(h = 4.5, top_d = 20.6);

  // 2. The ghost, its flat base 0.3 mm into the foot so the two fuse
  translate([0, 0, 4.2])
    import("../reference/relic-ghost-body.stl", convexity = 10);
}

color(col_bone) relic_ghost();
