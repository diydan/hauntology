// Hauntology Tabletop Print Kit — Prop #15: Relic Vault (Main Chest Body)
// Colour: Leather (#6b4d33)
// Size: 169.2 W x 124.2 D x 80.9 H mm (interior 158.8 x 108.8 mm holds the 150 x 100 mm 6-Relic Tray)
// Hardware: Rear spring-hinge knuckles, upper-front 45-deg gusseted SG90 latch cradle right behind the latch window,
//           4 corner tray ledges, right-wall dovetail & cable conduit for keypad pod
// Print orientation: Flat on chest base (Z = 0), zero supports (1 connected component).

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

      // 2. Stepped base plinth
      chamfer_box(vault_w + 3.2, vault_d + 3.2, 6.0, r = 4.0, ch_bot = 1.0, ch_top = 1.2);

      // 3. Four corner iron-strap bolsters
      for (sx = [-1, 1], sy = [-1, 1]) {
        translate([sx * (vault_w / 2 - 4.0), sy * (vault_d / 2 - 4.0), 0])
          chamfer_box(10.0, 10.0, vault_h, r = 2.0, ch_bot = 1.0, ch_top = 0.4);
      }

      // 4. Rear twin spring-hinge knuckles (X = -56, +56; Y = +60.2, Z = vault_h - 2.0 = 78.0 mm — coaxial with lid!)
      for (hx = [-56.0, 56.0]) {
        hull() {
          translate([hx, vault_d / 2 + 2.2, vault_h - 2.0])
            rotate([0, 90, 0])
              cylinder(h = 16.0, d = 8.8, center = true);
          translate([hx, vault_d / 2 - 1.5, vault_h - 11.0])
            cube([16.0, 3.0, 2.0], center = true);
        }
      }
    }

    // 5. Interior Vault Chamber (158.8 x 108.8 mm clear inside)
    translate([0, 0, 3.6])
      chamfer_box(vault_w - 2 * v_wall, vault_d - 2 * v_wall, vault_h, r = 2.0, ch_bot = 0.8, ch_top = 0);

    // 6. Front Clasp Escutcheon Recess (36.4 x 24.4 x 1.2 mm at top front)
    translate([0, -vault_d / 2 + 0.6, vault_h - 14.0])
      cube([36.6, 2.4, 24.6], center = true);
    // Latch bolt window through front wall (Z = 63.5..72.5)
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

    // 9. Rear Hinge Pin Bore (3.4 mm ID at Z = vault_h - 2.0 = 78.0 mm, coaxial with lid hinge barrels)
    for (hx = [-56.0, 56.0]) {
      translate([hx, vault_d / 2 + 2.2, vault_h - 2.0])
        rotate([0, 90, 0])
          cylinder(h = 20.0, d = 3.4, center = true);
    }
  }

  // 10. Upper-Front SG90 Latch Servo Cradle on 45-Degree Self-Supporting Gusset Bracket
  //     Positioned at Z = 44..64 right behind the front latch window (Z = 68) so the SG90 latch hook
  //     sweeps directly through the lid keeper hasp AND stays completely clear of the 6-Relic Tray!
  translate([0, -vault_d / 2 + v_wall, 0])
  difference() {
    hull() {
      // Top servo platform (Z = 46..64, Y = -1..+17 from inner front wall)
      translate([0, 8.0, 46.0])
        chamfer_box(sg90_flange_w + 5.2, sg90_body_d + 4.8, 18.0, r = 2.0, ch_bot = 0.4, ch_top = 0.6);
      // 45-degree support root into front wall at Z = 28..46 (zero overhangs > 45 deg!)
      translate([0, 0.5, 28.0])
        cube([sg90_flange_w + 5.2, 2.0, 2.0], center = true);
    }
    // SG90 Servo Cavity (top of cradle at Z = 64, shaft pointing up +Z so horn sweeps horizontally into keeper loop at Z = 67!)
    translate([0, 8.0, 54.0])
      cube([sg90_body_w, sg90_body_d, 22.0], center = true);
    translate([0, 8.0, 62.6])
      cube([sg90_flange_w, sg90_body_d, 3.4], center = true);
    for (sx = [-1, 1]) {
      translate([sx * sg90_hole_span / 2, 8.0, 52.0])
        cylinder(h = 13.0, d = sg90_m2_pilot_d);
    }
    // Wire routing groove down front wall
    translate([14.0, 2.0, 40.0])
      cube([5.0, 5.0, 32.0], center = true);
  }

  // 11. Four Corner Support Pillars holding the removable 6-Relic Tray at Z = 22 mm (sunk into floor z = 3.0)
  for (sx = [-1, 1], sy = [-1, 1]) {
    translate([sx * (vault_w / 2 - v_wall - 4.0), sy * (vault_d / 2 - v_wall - 4.0), 3.0])
      chamfer_box(9.0, 9.0, 19.0, r = 1.2, ch_bot = 0, ch_top = 0.4);
  }
}

color(col_leather) prop_15_vault_chest();
