// Hauntology Tabletop Print Kit — Prop #20: Rear Cut-Wires Hardware (5 Terminal Sockets & SET Bezel)
// Colour: Tarnished Silver (#c9c9d4)
// Size: 150.5 W x 39.5 D x 14.0 H mm (6 separate pieces on one bed; the 5 wire-anchor grommets are built directly into prop-01-chest-body!)
// Layout matches the +Y back wall of Master 3-in-1 Chest (sockets at X = -65..+37 @ 25.5 mm pitch, SET bezel at X = +64.5)
// Print orientation: Flat on flange base (Z = 0), zero supports (6 connected components).

include <_common.scad>

module single_terminal_socket() {
  difference() {
    union() {
      // Top bevelled flange (18 mm OD x 3.2 mm)
      cylinder(h = 3.2, d1 = 18.0, d2 = 16.8);
      // Press-fit barrel stem (14.15 mm OD + 4 crush ribs = 14.45 mm across ribs for snug press-fit into 14.3 mm panel bore;
      // protrudes 6 mm into the wide-open rear soldering bay for easy direct soldering!)
      translate([0, 0, 3.2]) {
        cylinder(h = 10.8, d1 = 14.15, d2 = 13.95);
        for (ang = [45, 135, 225, 315]) {
          rotate([0, 0, ang])
            hull() {
              translate([7.0, 0, 0]) cylinder(h = 8.4, d = 0.45);
              translate([6.8, 0, 10.4]) cylinder(h = 0.2, d = 0.3);
            }
        }
      }
    }
    // Central plug shroud bore (6.25 mm ID) stepping at 45 deg to 4.15 mm standard banana-jack / contact-pin seat at bottom
    translate([0, 0, -0.5])
      cylinder(h = 2.2, d1 = 8.4, d2 = 6.25);
    translate([0, 0, 1.5])
      cylinder(h = 8.6, d = 6.25);
    translate([0, 0, 10.0])
      cylinder(h = 1.2, d1 = 6.25, d2 = 4.15);
    translate([0, 0, 11.1])
      cylinder(h = 4.0, d = 4.15);
    // Exposed rear solder-tab / contact wire slot
    translate([0, 0, 11.5])
      cube([16.0, 2.2, 6.0], center = true);
  }
}

module prop_20_terminal_blocks() {
  // 1. Five Terminal Socket Collars at exact 25.5 mm chest pitch (X = -65.0 .. +37.0, Y = +9.25 -> maps to Z = 45.0 on chest!)
  for (i = [0 : 4]) {
    translate([-65.0 + i * 25.5, 9.25, 0])
      single_terminal_socket();
  }

  // 2. SET Pushbutton Trim Bezel Ring (X = +64.5, Y = -9.25 -> maps to Z = 26.5 on chest, 12+ mm clear of 5th socket on bed!)
  translate([64.5, -9.25, 0])
  difference() {
    cylinder(h = 3.6, d1 = 24.0, d2 = 21.6);
    translate([0, 0, -0.5])
      cylinder(h = 5.0, d = 16.4);
  }
}

color(col_silver) prop_20_terminal_blocks();
