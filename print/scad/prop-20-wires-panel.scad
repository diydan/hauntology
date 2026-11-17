// Hauntology Tabletop Print Kit — Prop #20: Cut Wires Board (Lightweight Ribbed Fuse-Box Panel)
// Colour: Ink / Dark Iron (#262229)
// Size: 155 W x 125 H x 28.8 D mm (ribbed & vaulted underside shell: ~58% less filament than solid block)
// Sticker details: 10 recessed number pockets 1 to 5 (11 x 13 mm), "SET" pocket (26 x 11 mm), "paired" pocket (30 x 8 mm)
// Hardware: Five left wire-anchor wells, five right terminal socket wells, 16 mm SET button hole, 5 mm LED hole, vaulted ESP32 bay
// Print orientation: Flat on base (Z = 0), no supports (all underside cavities have <= 44-deg vaulted roofs).

include <_common.scad>

panel_w = 150.0;
panel_h = 120.0;
panel_d = 21.5;

module vault_bay_x(x0, y0, w, d, z_vert, z_peak, ridge_w = 2.0) {
  translate([x0, y0, -0.1])
    hull() {
      linear_extrude(height = z_vert + 0.1) rrect2d(w, d, r = 1.8);
      translate([0, 0, z_peak + 0.1]) linear_extrude(height = 0.3) rrect2d(ridge_w, max(4.0, d - 2 * (z_peak - z_vert)), r = 0.8);
    }
}

module prop_20_wires_panel() {
  difference() {
    union() {
      // 1. Main fuse-box enclosure body + gothic tapered corner pilasters
      chamfer_box(panel_w, panel_h, panel_d, r = 5.0, ch_bot = 0.8, ch_top = 0.8);
      for (sx = [-1, 1], sy = [-1, 1]) {
        hull() {
          translate([sx * (panel_w / 2 - 4.0), sy * (panel_h / 2 - 4.0), 0])
            chamfer_box(13.0, 13.0, 7.0, r = 2.4, ch_bot = 0.8, ch_top = 0.4);
          translate([sx * (panel_w / 2 - 5.2), sy * (panel_h / 2 - 5.2), panel_d - 4.0])
            chamfer_box(10.0, 10.0, 4.0, r = 2.0, ch_bot = 0.2, ch_top = 0.6);
        }
      }

      // 2. Raised Gothic Ironwork Perimeter Framing Moulding on Top Deck + 4 Corner Rivets
      difference() {
        translate([0, 0, panel_d - 1.0])
          chamfer_box(panel_w - 1.6, panel_h - 1.6, 3.0, r = 4.6, ch_bot = 0.2, ch_top = 0.6);
        translate([0, 0, panel_d - 1.5])
          linear_extrude(height = 4.5)
            rrect2d(panel_w - 12.0, panel_h - 12.0, r = 3.0);
      }
      for (sx = [-1, 1], sy = [-1, 1]) {
        translate([sx * (panel_w / 2 - 5.2), sy * (panel_h / 2 - 5.2), panel_d + 1.4])
          cylinder(h = 1.4, d1 = 3.8, d2 = 1.4, $fn = 4);
      }
    }

    // 3. Five Left-Side Wire Anchor Socket Wells (X = -44, Y = 36..-36; 10.4 x 10.4 mm, Z = 3.5..21.5) + Number Sticker Pockets
    for (i = [0 : 4]) {
      wy = 36.0 - i * 18.0;
      translate([-44.0, wy, 3.5])
        linear_extrude(height = panel_d)
          rrect2d(10.4, 10.4, r = 1.2);
      translate([-44.0, wy, -0.5])
        cylinder(h = 5.0, d = 5.0);

      translate([-60.0, wy, panel_d - sticker_depth])
        linear_extrude(height = sticker_depth + 0.6)
          rrect2d(11.0, 13.0, r = 1.2);
    }

    // 4. Five Right-Side Terminal Socket Wells (X = 38, Y = 36..-36; 14.3 mm ID, Z = 3.5..21.5) + Number Sticker Pockets
    for (i = [0 : 4]) {
      wy = 36.0 - i * 18.0;
      translate([38.0, wy, 3.5])
        cylinder(h = panel_d, d = 14.3);
      translate([38.0, wy, -0.5])
        cylinder(h = 5.0, d = 8.4);

      translate([56.0, wy, panel_d - sticker_depth])
        linear_extrude(height = sticker_depth + 0.6)
          rrect2d(11.0, 13.0, r = 1.2);

      // 45-deg vaulted underside wire trenches connecting left anchors & right terminals into central ESP32 bay
      translate([-3.0, wy, -0.1])
        hull() {
          cube([84.0, 4.8, 2.4], center = true);
          translate([0, 0, 3.2]) cube([84.0, 1.2, 0.4], center = true);
        }
    }

    // 5. 16 mm SET Pushbutton Mounting Hole (X = 12, Y = -46) + 45-deg Vaulted Underside Nut Chamber (leaves 4.2 mm panel)
    translate([12.0, -46.0, -0.5])
      cylinder(h = panel_d + 2.0, d = 16.2);
    translate([12.0, -44.0, -0.1])
      hull() {
        linear_extrude(height = 11.4) rrect2d(22.4, 24.0, r = 2.0);
        translate([0, -2.0, 17.3]) cylinder(h = 0.3, d = 16.4);
      }
    translate([-14.0, -46.0, panel_d - sticker_depth])
      linear_extrude(height = sticker_depth + 0.6)
        rrect2d(26.0, 11.0, r = 1.2);

    // 6. 5 mm "paired" LED Mounting Hole (X = -44, Y = 50) + 45-deg Underside LED Pocket & Wire Trench
    translate([-44.0, 50.0, -0.5])
      cylinder(h = panel_d + 2.0, d = 5.2);
    translate([-44.0, 50.0, -0.1])
      hull() {
        linear_extrude(height = 13.0) rrect2d(12.0, 12.0, r = 1.6);
        translate([0, 0, 17.5]) cylinder(h = 0.3, d = 5.6);
      }
    hull() {
      translate([-31.0, 48.0, 1.2]) cube([28.0, 4.8, 2.6], center = true);
      translate([-31.0, 48.0, 3.4]) cube([28.0, 1.2, 0.4], center = true);
    }
    translate([-18.0, 50.0, panel_d - sticker_depth])
      linear_extrude(height = sticker_depth + 0.6)
        rrect2d(30.0, 8.0, r = 1.0);

    // 7. Central Vaulted Underside ESP32 & Wiring Bay (28.8 mm self-centering PCB pocket at Z = 0..6.5, seats PCB at Z = 7.0)
    translate([-4.0, 6.0, -0.1])
      hull() {
        linear_extrude(height = 6.6) rrect2d(28.8, 92.0, r = 2.0);
        translate([0, 0, 19.3]) linear_extrude(height = 0.3) rrect2d(2.0, 66.0, r = 0.8);
      }
    for (sx = [-1, 1], sy = [-1, 1]) {
      translate([-4.0 + sx * esp32_hole_d / 2, 12.0 + sy * esp32_hole_w / 2, 7.5])
        cylinder(h = 9.5, d = sg90_m2_pilot_d);
    }

    // 7b. Low-Wall Vaulted Weight-Relief Coffers under Left & Right Flanks (starts sloping right from Z = 4.5..7.5 -> minimal perimeter plastic!):
    vault_bay_x(-62.0, 0.0, 20.8, 112.0, 8.8, 19.0, 2.0);
    vault_bay_x(-28.6, -4.0, 15.8, 104.0, 11.4, 19.0, 2.0);
    vault_bay_x(20.6, 13.5, 15.8, 85.0, 11.4, 19.0, 2.0);
    vault_bay_x(60.0, 0.0, 24.8, 112.0, 6.8, 19.0, 2.0);
    vault_bay_x(-39.0, -50.0, 19.6, 12.0, 13.5, 19.0, 11.0);

    // 8. Rear 45-deg Gabled USB-C cable exit notch at Y = panel_h / 2
    translate([-4.0, panel_h / 2, 4.6])
      rotate([90, 0, 0])
        hull() {
          cube([esp32_usb_w, esp32_usb_h, 44.0], center = true);
          translate([0, esp32_usb_h / 2 + 5.6, 0]) cylinder(h = 44.0, d = 1.6, center = true);
        }
  }
}

color(col_ink) prop_20_wires_panel();
