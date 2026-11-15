// Hauntology Tabletop Print Kit — Prop #15: Relic Vault (Main Chest Body)
// Colour: Leather (#6b4d33)
// Size: 170 W x 122 D x 80 H mm (interior 152 x 102 mm holds the 3x2 Relic Tray)
// Hardware: Rear spring-hinge knuckles, front internal SG90 latch cradle, right-wall dovetail for keypad pod
// Print orientation: Flat on chest base (Z = 0), zero supports.

include <_common.scad>

vault_w = 166.0; // +3.2 mm plinth = 169.2 mm total width (fits 180 mm bed with margin)
vault_d = 116.0;
vault_h = 80.0;
v_wall  = 3.6;

module prop_15_vault_chest() {
  difference() {
    union() {
      // 1. Main vault chest body
      chamfer_box(vault_w, vault_d, vault_h, r = 3.6, ch_bot = 1.0, ch_top = 0.6);

      // 2. Stepped base plinth & upper rim moulding
      chamfer_box(vault_w + 3.2, vault_d + 3.2, 6.0, r = 4.0, ch_bot = 1.0, ch_top = 1.2);

      // 3. Four corner iron-strap bolsters
      for (sx = [-1, 1], sy = [-1, 1]) {
        translate([sx * (vault_w / 2 - 4.0), sy * (vault_d / 2 - 4.0), 0])
          chamfer_box(10.0, 10.0, vault_h, r = 2.0, ch_bot = 1.0, ch_top = 0.4);
      }

      // 4. Rear twin spring-hinge knuckles (X = -56, +56; Z = vault_h - 3.5)
      for (hx = [-56.0, 56.0]) {
        hull() {
          translate([hx, vault_d / 2 + 2.2, vault_h - 3.5])
            rotate([0, 90, 0])
              cylinder(h = 16.0, d = 8.8, center = true);
          translate([hx, vault_d / 2 - 1.0, vault_h - 12.0])
            cube([16.0, 2.0, 2.0], center = true);
        }
      }
    }

    // 5. Interior Vault Chamber (152.4 x 102.4 mm clear inside above the tray ledge)
    translate([0, 0, 3.6])
      chamfer_box(vault_w - 2 * v_wall, vault_d - 2 * v_wall, vault_h, r = 2.0, ch_bot = 0.8, ch_top = 0);

    // 6. Front Clasp Escutcheon Recess (36.4 x 24.4 x 1.2 mm at top front)
    translate([0, -vault_d / 2 + 0.6, vault_h - 14.0])
      cube([36.6, 2.4, 24.6], center = true);
    // Latch bolt window through front wall
    translate([0, -vault_d / 2, vault_h - 12.0])
      cube([28.0, 10.0, 9.0], center = true);

    // 7. Right-Wall (+X) Female Dovetail Mortise & Cable Pass-Through to Keypad Pod
    translate([vault_w / 2 - 4.2, -10.0, 0])
      rotate([0, 0, 90])
        dovetail_mortise(h = 34.0, n_w = 8.0, f_w = 11.4, d_len = 4.5, clr = clear_move);
    // Teardrop-topped cable conduit between vault chest and keypad pod
    translate([vault_w / 2, 16.0, 12.0])
      rotate([0, 90, 0])
        hull() {
          cylinder(h = 12.0, d = 8.0, center = true);
          translate([-4.2, 0, 0]) cylinder(h = 12.0, d = 1.6, center = true);
        }

    // 8. Plank V-grooves on front, back and sides
    for (zp = [22, 42, 62]) {
      for (sy = [-1, 1])
        translate([0, sy * (vault_d / 2 + 0.1), zp])
          rotate([45, 0, 0])
            cube([vault_w - 18, 1.4, 1.4], center = true);
      for (sx = [-1, 1])
        translate([sx * (vault_w / 2 + 0.1), 0, zp])
          rotate([0, 45, 0])
            cube([1.4, vault_d - 18, 1.4], center = true);
    }

    // 9. Rear Hinge Pin Bore (3.4 mm ID)
    for (hx = [-56.0, 56.0]) {
      translate([hx, vault_d / 2 + 2.2, vault_h - 3.5])
        rotate([0, 90, 0])
          cylinder(h = 20.0, d = 3.4, center = true);
    }
  }

  // 10. Internal SG90 Latch Servo Cradle on Front Floor & Corner Tray Support Ledges
  translate([0, -vault_d / 2 + v_wall + 9.0, 3.6])
    sg90_cradle_block(wall = 2.6);

  // Four corner support pillars holding the removable 6-Relic Tray at Z = 26 mm above the servo
  for (sx = [-1, 1], sy = [-1, 1]) {
    translate([sx * (vault_w / 2 - v_wall - 4.0), sy * (vault_d / 2 - v_wall - 4.0), 3.6])
      chamfer_box(8.0, 8.0, 22.0, r = 1.2, ch_bot = 0.2, ch_top = 0.4);
  }
}

color(col_leather) prop_15_vault_chest();
