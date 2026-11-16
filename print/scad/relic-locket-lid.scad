include <_common.scad>;

// Hinged Victorian Oval Locket — Cameo Front Door (Antique Brass #d4a84b)
// Part 2 of 2 (hinges onto relic-locket.stl via a 1.75 mm PLA filament pin).
// Printed FLAT on its parting rim at Z = 0 (zero supports).
// Assembled closed transform onto relic-locket: translate([0, 0, 26.0]) rotate([90, 0, 0])

$fa = 3;
$fs = 0.25;

module locket_lid_oval_2d(rx, ry) {
  scale([rx, ry]) circle(r = 1, $fn = 64);
}

module relic_locket_lid() {
  // Coordinates match relic-locket when placed via translate([0, 0, 26.0]) rotate([90, 0, 0]):
  //   X_stl -> X_world
  //   Y_stl -> Z_world - 26.0  (+Y_stl toward bail, -Y_stl toward pedestal)
  //   Z_stl -> -Y_world        (Z_stl = 0 is parting rim; +Z_stl is front cameo face)
  Hx = -15.4;
  Hz = 2.1;        // corresponds to Hy = -2.1 in world
  kn_d = 4.0;      // r = 2.0 coaxial with Body lower knuckle
  pin_d = 2.15;    // 1.75 mm PLA filament pin bore

  color(col_lantern)
  difference() {
    union() {
      // 1. Cameo Door Outer Shell (Z_stl = 0 .. 4.8) + delicate gothic crown finial at +Y_stl
      linear_extrude(height = 1.6)
        locket_lid_oval_2d(13.0, 16.0);
      hull() {
        translate([-2.8, 14.5, 0]) cylinder(h = 1.6, d = 2.4);
        translate([ 2.8, 14.5, 0]) cylinder(h = 1.6, d = 2.4);
        translate([ 0.5, 18.8, 0]) cylinder(h = 1.4, d = 1.3);
      }
      hull() {
        translate([0, 0, 1.5])
          linear_extrude(height = 0.1)
            locket_lid_oval_2d(13.0, 16.0);
        translate([0, 0, 4.7])
          linear_extrude(height = 0.1)
            locket_lid_oval_2d(9.8, 12.8);
      }

      // 2. Beaded Pearl Cameo Border (18 brass pearls around 16x22 mm frame)
      for (i = [0 : 17]) {
        a = i * 360 / 18;
        translate([9.3 * cos(a), 12.3 * sin(a), 4.55])
          sphere(d = 1.55);
      }

      // 3. Upper Hinge Knuckle (Y_stl = +0.2 .. +8.5 -> assembled Z_world = 26.2 .. 34.5)
      //    Leaves 0.50 mm axial gap above Body's lower knuckle (25.7), full flat contact pad at Z_stl = 0,
      //    and >= 0.85 mm wall over teardrop pin apex.
      hull() {
        translate([Hx, 0.2, Hz])
          rotate([-90, 0, 0])
            cylinder(h = 8.3, d = kn_d);
        translate([Hx, 0.2, Hz + 1.5])
          rotate([-90, 0, 0])
            cylinder(h = 8.3, d = 2.0);
        translate([Hx - 0.8, 0.2, 0])
          cube([1.6, 8.3, 0.5]);
      }
      // Solid hinge arm bridging knuckle cleanly into Lid's upper-left oval shoulder (flush on Z_stl = 0)
      hull() {
        translate([Hx + 0.8, 0.2, Hz])
          rotate([-90, 0, 0])
            cylinder(h = 8.3, d = 2.8);
        translate([Hx + 0.2, 0.2, 0])
          cube([3.8, 8.3, 0.5]);
        translate([-11.6, 0.3, 0.0])
          cube([1.4, 8.0, 3.6]);
      }

      // 4. Right-Side Elastic Snap-Clasp Arm & Thumb Pull (+X, Y_stl = -2.0 .. +2.0)
      hull() {
        translate([12.6, -2.0, 1.4])
          cube([2.2, 4.0, 0.9]);
        translate([14.4, -1.8, 0.0])
          cube([1.2, 3.6, 2.0]);
      }
      // Scalloped thumb fingernail lip
      translate([15.2, 0.0, 0.0])
        cylinder(h = 1.6, r = 1.1);
    }

    // --- Subtracted Features ---

    // A. Front 16.0 x 22.0 mm Oval Cameo Sticker Pocket (0.40 mm deep, r3 sticker)
    translate([0, 0, 4.8 - sticker_depth])
      linear_extrude(height = sticker_depth + 0.4)
        locket_lid_oval_2d(8.0, 11.0);

    // B. Vaulted Keepsake Interior Hollow (<= 45-deg self-supporting dome tapering to 8.4 mm width < 10 mm bridge limit!)
    hull() {
      translate([0, 0, -0.1])
        linear_extrude(height = 0.2)
          locket_lid_oval_2d(8.0, 10.8);
      translate([0, 0, 3.8])
        linear_extrude(height = 0.1)
          locket_lid_oval_2d(4.2, 7.0);
    }

    // C. Coaxial Horizontal Filament Pin Bore (Ø2.15 mm) along Y_stl with teardrop apex
    hull() {
      translate([Hx, -0.5, Hz])
        rotate([-90, 0, 0])
          cylinder(h = 10.0, d = pin_d);
      translate([Hx, -0.5, Hz + pin_d * 0.62])
        rotate([-90, 0, 0])
          cylinder(h = 10.0, d = 0.4);
    }

    // D. Hinge-arc clearance relief along lower-left Lid rim (Y_stl = -9.2 .. +0.2)
    translate([Hx, -9.2, Hz])
      rotate([-90, 0, 0])
        cylinder(h = 9.4, r = 3.25);

    // E. Clasp pocket relief for Body's right detent bead & catch saddle
    translate([12.8, -2.6, -0.1])
      cube([1.65, 5.2, 1.45]);
  }
}

relic_locket_lid();
