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
      // 1. Rounded-arch pawn flap card (X = -18..18, Y = 0..56, Z = 0..3.6)
      translate([0, flap_h / 2, 0])
        chamfer_box(flap_w, flap_h, flap_t, r = 4.5, ch_bot = 0.4, ch_top = 0.5);

      // 2. Bottom Servo Pivot Stem & Collar Hub (Y = -10.5..2, centered on X = 0)
      hull() {
        translate([0, 2.0, 0]) cylinder(h = flap_t, d = 14.0);
        translate([0, -6.5, 0]) cylinder(h = 6.4, d = 11.6);
      }
      translate([0, -6.5, 0])
        cylinder(h = 6.4, d = 11.6);
    }

    // 3. Front (+Z) 0.4 mm Recessed Sticker Pocket for Seat Portrait (32 x 52 mm)
    translate([0, flap_h / 2, flap_t - sticker_depth])
      linear_extrude(height = sticker_depth + 0.5)
        rrect2d(32.0, 52.0, r = 3.0);

    // 4. Open-Bottom Keyed SG90 Servo Shaft & Horn Socket in Stem (starts at Y = -13.0 so bottom entry at Y = -12.3 is 100% open!)
    translate([0, -13.0, 3.2])
      rotate([-90, 0, 0]) {
        cylinder(h = 11.5, d = sg90_spline_d);
        // Keyed anti-rotation horn slot at bottom entry (Y = -13.0..-9.5)
        hull() {
          cylinder(h = 3.6, d = sg90_horn_hub_d);
          translate([5.0, 0, 0]) cylinder(h = 3.6, d = 3.2);
          translate([-5.0, 0, 0]) cylinder(h = 3.6, d = 3.2);
        }
        // Set-screw / horn pin cross hole
        translate([0, 0, 6.5])
          rotate([0, 90, 0])
            cylinder(h = 16.0, d = 2.0, center = true);
      }
  }
}

color(col_bone) prop_05_flap_pawn();
