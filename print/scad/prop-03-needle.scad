// Hauntology Tabletop Print Kit — Prop #3: Haunt Needle (Wrought-Iron Skeletal Gauge Pointer)
// Colour: Tarnished Silver (#c9c9d4)
// Size: ~74 L x 18 W x 6.6 H mm (64 mm spear tip radius, compact tail clears lower bezel opening)
// Mechanism: Underside pocket fits SG90 servo horn with 0.15 mm press-fit clearance
// Print orientation: Flat on back (Z = 0), zero supports.

include <_common.scad>

module prop_03_needle() {
  difference() {
    union() {
      // 1. Central circular boss hub with gothic turret cap at pivot (0,0) (sized for flush Ø5.4 M2 spline-screw counterbore!)
      cylinder(h = 5.6, d1 = 17.6, d2 = 15.6);
      translate([0, 0, 5.6])
        cylinder(h = 1.0, d1 = 11.4, d2 = 8.8);

      // 2. Wrought-iron gnarled skeletal pointer spine (+X direction to 64 mm)
      //    Stays thick enough over X = 0..19 for a full-length SG90 single-arm horn recess!
      hull() {
        translate([4.0, 0, 0]) cylinder(h = 4.2, d = 8.4);
        translate([18.5, 0, 0]) cylinder(h = 4.0, d = 6.4);
      }
      linear_extrude(height = 3.2)
        burton_gnarled_path_2d(
          [[15.0, 0.0], [26.0, 1.3], [36.0, -1.1], [47.0, 0.7], [53.0, 0.0]],
          [2.8,          2.4,         2.1,          1.8,         1.6]
        );

      // Ornate wrought-iron spiral scroll spur rising asymmetrically off mid-shaft (X ~ 28)
      hull() {
        translate([26.0, 1.2, 0]) cylinder(h = 3.0, d = 3.0);
        translate([27.5, 4.8, 0]) cylinder(h = 3.0, d = 2.0);
      }
      translate([28.0, 5.6, 0])
        rotate([0, 0, -35])
          linear_extrude(height = 3.0)
            burton_spiral_2d(turns = 1.0, r0 = 0.8, r1 = 4.8, w = 1.5, dir = -1, steps = 16);
      // Balancing tiny lower thorn cusp at X ~ 36
      translate([36.0, -1.0, 0])
        hull() {
          cylinder(h = 3.0, d = 3.0);
          translate([-3.2, -3.4, 0]) cylinder(h = 2.6, d = 1.1);
        }

      // Pierced gothic spearhead tip (X = 50..64 mm)
      hull() {
        translate([50.5, 0, 0]) cylinder(h = 3.0, d = 3.2);
        translate([54.5,  3.2, 0]) cylinder(h = 2.8, d = 1.8);
        translate([54.5, -3.2, 0]) cylinder(h = 2.8, d = 1.8);
        translate([64.0, 0, 0]) cylinder(h = 2.4, d = 1.4);
      }

      // 3. Compact crescent wrought-iron counterweight tail (-X direction, reach <= 9.2 mm < 10 mm lower opening!)
      hull() {
        translate([-2.0, 0, 0]) cylinder(h = 4.2, d = 6.8);
        translate([-6.4, 0, 0]) cylinder(h = 4.2, d = 5.4);
      }
      hull() {
        translate([-6.4, 0, 0]) cylinder(h = 3.6, d = 4.6);
        translate([-8.2,  3.4, 0]) cylinder(h = 3.2, d = 1.6);
        translate([-8.2, -3.4, 0]) cylinder(h = 3.2, d = 1.6);
      }
    }

    // Diamond piercing inside gothic spearhead
    translate([55.2, 0, -0.5])
      cylinder(h = 4.5, d = 2.8, $fn = 4);

    // Flatten bottom at Z = 0
    translate([0, 0, -5.0])
      cube([200, 100, 10.0], center = true);

    // 4. Keyed SG90 Single-Arm Horn Recess on Underside (18.65 mm reach fits standard SG90 horn; 0.25 mm sacrificial bridge + top M2 screw counterbore!)
    translate([0, 0, -0.1])
      hull() {
        cylinder(h = 3.2, d = sg90_horn_hub_d);
        translate([16.5, 0, 0])
          cylinder(h = 3.2, d = sg90_horn_tip_d);
      }
    translate([0, 0, 3.35])
      cylinder(h = 4.5, d = 2.4);
    translate([0, 0, 5.0])
      cylinder(h = 2.2, d = 5.4);
    translate([10.0, 0, 3.35])
      cylinder(h = 3.0, d = 1.8);
  }
}

color(col_silver) prop_03_needle();
