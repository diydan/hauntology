include <_common.scad>;

// Hinged Victorian Oval Locket — Back Bowl & Stand (Antique Brass #d4a84b)
// Part 1 of 2 (mates with relic-locket-lid.stl via a 1.75 mm PLA filament hinge pin).
// Keepsake hollow on -Y opens when the cameo front door swings 0..145 deg around X=-15.4, Y=-2.1.
// Support-free (+Z upright): pedestal socket bottom, <= 42 deg scroll buttresses & vaulted keepsake arch.

$fa = 3;
$fs = 0.25;

module locket_oval_2d(rx, ry) {
  scale([rx, ry]) circle(r = 1, $fn = 64);
}

module relic_locket() {
  Zc = 26.0;       // center of 26x32 oval (bottom edge Z = 10.0, top Z = 42.0)
  Hx = -15.4;      // hinge pin X (outside oval X=-13.0; coaxial with relic-locket-lid)
  Hy = -2.1;       // hinge pin Y in front of parting plane Y=0
  kn_d = 4.0;      // outer knuckle dia (r=2.0)
  pin_d = 2.15;    // 1.75 mm PLA filament hinge pin bore

  color(col_lantern)
  difference() {
    union() {
      // 1. Standard Relic pedestal foot + Ø6.1 mm token socket
      relic_pedestal_base(h = 4.5, top_d = 18.0);

      // 2. Tapered gothic stem neck (Z = 4.5 .. 9.6, strictly below oval bottom Z = 10.0)
      translate([0, 0, 4.5])
        cylinder(h = 4.8, d1 = 18.0, d2 = 8.4);
      // Rear neck post connecting stem cleanly to oval back (Y >= +0.15)
      hull() {
        translate([0, 2.4, 8.8]) cylinder(h = 0.6, d = 4.2);
        translate([0, 2.6, 11.2]) cylinder(h = 0.6, d = 4.2);
      }

      // 3. Asymmetric Victorian scroll buttresses (stay behind Y = +0.2 until hinge rise):
      //    Left (-X) sweeps smoothly up at <= 42 deg with seamless sphere joints (no stepped seam).
      hull() {
        translate([-5.4, 2.2, 5.4]) sphere(d = 3.6);
        translate([-10.8, 2.0, 10.8]) sphere(d = 3.4);
      }
      hull() {
        translate([-10.8, 2.0, 10.8]) sphere(d = 3.4);
        translate([Hx, Hy, 17.4]) cylinder(h = 0.6, d = kn_d);
      }
      //    Right (+X) mirrors the graceful scroll curve cleanly into the beveled oval rim
      hull() {
        translate([5.4, 2.2, 5.4]) sphere(d = 3.6);
        translate([8.8, 2.6, 15.2]) sphere(d = 3.2);
      }

      // 4. Main Locket Back Bowl (Y = +0.08 .. +4.8, outer 26x32 mm oval centered at Z = 26)
      translate([0, 0.08, Zc])
        rotate([-90, 0, 0]) {
          linear_extrude(height = 1.52)
            locket_oval_2d(13.0, 16.0);
          hull() {
            translate([0, 0, 1.42])
              linear_extrude(height = 0.1)
                locket_oval_2d(13.0, 16.0);
            translate([0, 0, 4.72])
              linear_extrude(height = 0.1)
                locket_oval_2d(9.8, 12.8);
          }
        }

      // 5. Embossed heirloom back rosette crest (+Y back face)
      translate([0, 4.8, Zc])
        rotate([-90, 0, 0]) {
          difference() {
            linear_extrude(height = 0.45, scale = 0.90)
              locket_oval_2d(7.8, 10.6);
            translate([0, 0, 0.15])
              linear_extrude(height = 0.5)
                locket_oval_2d(6.4, 9.2);
          }
          linear_extrude(height = 0.40, scale = 0.85)
            locket_oval_2d(3.2, 4.6);
        }

      // 6. Lower Hinge Knuckle (Z = 17.4 .. 25.7, 8.3 mm tall) + angled web clear of Lid X>=-13.2
      translate([Hx, Hy, 17.4])
        cylinder(h = 8.3, d = kn_d);
      difference() {
        hull() {
          translate([Hx + 0.6, Hy + 0.4, 17.4])
            cylinder(h = 8.3, d = 1.8);
          translate([-11.6, 2.5, 17.6])
            cylinder(h = 8.1, d = 2.4);
        }
        // Keep bridge web strictly clear of closed Lid rim (X >= -13.2, Y <= +0.08)
        translate([-13.2, -3.5, 17.0])
          cube([4.0, 3.60, 9.2]);
      }

      // 7. Right-side Clasp Catch Saddle & Friction Detent (anchored inside oval bowl so zero floating start!)
      hull() {
        translate([12.2, 2.2, 21.4]) cylinder(h = 0.8, d = 1.8);
        translate([13.2, 1.8, 23.8]) cylinder(h = 4.4, d = 1.8);
      }
      hull() {
        translate([11.8, 1.2, 22.0]) sphere(r = 0.55);
        translate([13.55, -0.65, 24.0]) cylinder(h = 4.0, d = 0.85);
      }

      // 8. Top Crown Bail (Z = 41.2 .. 50.0, centered at Y = +2.4 behind Y=0 parting seam)
      translate([0, 2.4, 41.2])
        cylinder(h = 3.4, d1 = 4.6, d2 = 3.6);
      translate([0, 2.4, 46.6])
        rotate([90, 0, 0])
          difference() {
            cylinder(h = 2.8, d = 6.8, center = true);
            hull() {
              translate([0, -0.2, 0]) cylinder(h = 4.0, d = 3.2, center = true);
              translate([0, 1.6, 0]) cylinder(h = 4.0, d = 0.4, center = true);
            }
          }
    }

    // --- Subtracted Features ---

    // A. Vaulted Keepsake Interior Hollow on -Y (Y = +0.0..+2.4)
    hull() {
      translate([0, 0.0, Zc])
        rotate([-90, 0, 0])
          linear_extrude(height = 0.15)
            locket_oval_2d(8.6, 11.4);
      translate([0, 2.3, Zc - 2.3])
        rotate([-90, 0, 0])
          linear_extrude(height = 0.15)
            locket_oval_2d(6.2, 7.8);
    }

    // B. Coaxial Filament Hinge Bore (Ø2.15 mm) vertically through lower knuckle & scroll exit
    translate([Hx, Hy, 12.2])
      cylinder(h = 14.0, d = pin_d);
  }
}

relic_locket();
