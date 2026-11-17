// Hauntology Tabletop Print Kit — Prop #5: Haunting Flipper (Seat Pawn Flap)
// Colour: Bone (#e9e4d8, warm white)
// Size: 36 W x 56 H x 3.6 D mm card + bottom servo hub (total 66.5 mm H; print 6x)
// Sticker details: Front seat portrait sticker (32 x 52 mm) in 0.4 mm pocket; flat back for ghost sticker (32 x 52 mm)
// Mechanism: Bottom hub slips over SG90 servo horn and flips 180 degrees when wrong Accusation revealed
// Print orientation: Flat on back face (Z = 0), zero supports.

include <_common.scad>

flap_w = 36.0;
flap_h = 56.0;
flap_t = 3.6;

module prop_05_flap_pawn() {
  difference() {
    union() {
      // 1. Crooked Gothic Coffin-Headstone Flap Card (keeps 32 x 52 sticker backing & <= 41 mm width < 50 mm pitch!)
      hull() {
        translate([0, flap_h / 2, 0])
          chamfer_box(flap_w, flap_h, flap_t, r = 4.2, ch_bot = 0.4, ch_top = 0.5);
        // Pointed asymmetric gothic tombstone peak at Y = 61
        translate([1.4, flap_h + 4.8, 0])
          cylinder(h = flap_t - 0.4, d1 = 6.2, d2 = 4.6);
      }
      // Subtle gothic iron shoulder cusp ears at Y = 44 (total width 40.8 mm << 50 mm seat pitch!)
      for (sx = [-1, 1]) {
        hull() {
          translate([sx * (flap_w / 2 - 1.5), 40.0, 0]) cylinder(h = flap_t - 0.3, d = 4.0);
          translate([sx * (flap_w / 2 + 1.8), 46.5, 0]) cylinder(h = flap_t - 0.5, d = 2.2);
          translate([sx * (flap_w / 2 - 1.0), 50.0, 0]) cylinder(h = flap_t - 0.3, d = 3.6);
        }
      }

      // 2. Bottom Servo Pivot Stem & Collar Hub (Y = -13.3..2, centered on X = 0, 10 mm thick with >= 1.2 mm walls around horn slot)
      hull() {
        translate([0, 2.0, 0]) cylinder(h = flap_t, d = 14.4);
        translate([0, -6.5, 0]) cylinder(h = 10.0, d = 13.2);
      }
      translate([0, -6.5, 0])
        cylinder(h = 10.0, d = 13.2);
      translate([-6.6, -13.3, 0])
        cube([13.2, 6.8, 10.0]);
    }

    // 3. Front (+Z) 0.4 mm Recessed Sticker Pocket for Seat Portrait (32 x 52 mm)
    translate([0, flap_h / 2, flap_t - sticker_depth])
      linear_extrude(height = sticker_depth + 0.5)
        rrect2d(32.0, 52.0, r = 3.0);

    // 4. Open-Bottom Keyed SG90 Spline Bore & Horn Socket in Stem (cross-pin aligned right through horn slot at z_local = 2.2!)
    translate([0, -13.4, 5.0])
      rotate([-90, 0, 0]) {
        cylinder(h = 11.5, d = sg90_spline_d);
        hull() {
          cylinder(h = 4.2, d = sg90_horn_hub_d);
          translate([5.2, 0, 0]) cylinder(h = 4.2, d = 3.8);
          translate([-5.2, 0, 0]) cylinder(h = 4.2, d = 3.8);
        }
        // Cross-pin hole aligned right through the horn slot (z_local = 2.2 -> Y = -11.2) to lock onto the horn's own holes!
        translate([0, 0, 2.2])
          rotate([0, 90, 0])
            cylinder(h = 16.0, d = 2.0, center = true);
      }
  }
}

color(col_bone) prop_05_flap_pawn();
