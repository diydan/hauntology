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

      // 3. Crooked Tapered Gothic Coffin-Vault Corner Buttresses (trimmed clean on +X mate face below)
      for (sx = [-1, 1], sy = [-1, 1]) {
        hull() {
          translate([sx * (vault_w / 2 - 2.0), sy * (vault_d / 2 - 2.0), 0])
            chamfer_box(13.2, 13.2, 6.0, r = 2.4, ch_bot = 1.0, ch_top = 0.4);
          translate([sx * (vault_w / 2 - 4.0), sy * (vault_d / 2 - 4.0), vault_h - 6.0])
            chamfer_box(10.0, 10.0, 5.8, r = 2.0, ch_bot = 0.2, ch_top = 0.5);
        }
      }

      // Wrought-iron vertical side strap pilasters on front & left walls (clear of clasp & +X dovetail!)
      for (fx = [-48.0, 48.0]) {
        translate([fx, -vault_d / 2 + 0.5, 0])
          chamfer_box(5.4, 3.0, vault_h - 3.0, r = 0.9, ch_bot = 0.6, ch_top = 0.6);
      }
      for (sy_off = [-26.0, 26.0]) {
        translate([-vault_w / 2 + 0.5, sy_off, 0])
          chamfer_box(3.0, 5.4, vault_h - 3.0, r = 0.9, ch_bot = 0.6, ch_top = 0.6);
      }

      // 4. Rear twin spring-hinge knuckles (X = -56, +56; Y = +63.6, Z = 79.0 mm — root tucked inside Y <= 58 rear wall so zero Z = 63.5 step!)
      for (hx = [-56.0, 56.0]) {
        hull() {
          translate([hx, vault_d / 2 + 5.6, vault_h - 1.0])
            rotate([0, 90, 0])
              cylinder(h = 16.0, d = 8.2, center = true);
          translate([hx, vault_d / 2 - 2.2, vault_h - 15.5])
            cube([16.0, 3.6, 2.0], center = true);
        }
      }

      // Internal right-wall thickening boss behind dovetail mortise (X = 75.8..83.0 -> 0.8 mm clear of tray X <= 75.0)
      translate([vault_w / 2 - 3.6, -10.0, 19.0])
        cube([7.2, 22.0, 38.0], center = true);
    }

    // 5. Interior Vault Chamber (158.8 x 108.8 mm clear inside)
    translate([0, 0, 3.6])
      chamfer_box(vault_w - 2 * v_wall, vault_d - 2 * v_wall, vault_h, r = 2.0, ch_bot = 0.8, ch_top = 0);

    // 6. Front Clasp Escutcheon Recess (36.4 x 24.4 x 1.2 mm at top front)
    translate([0, -vault_d / 2 + 0.6, vault_h - 14.0])
      cube([36.6, 2.4, 24.6], center = true);
    // Latch bolt window through front wall (Z = 63.5..72.5)
    translate([2.25, -vault_d / 2, vault_h - 7.5])
      cube([32.5, 10.0, 18.0], center = true);

    // 7. Right-Wall (+X) Female Dovetail Mortise (open mouth at X = +83.0) & Cable Pass-Through to Keypad Pod
    translate([vault_w / 2 + 0.05, -10.0, 0])
      rotate([0, 0, 90])
        dovetail_mortise(h = 34.0, n_w = 8.0, f_w = 11.4, d_len = 4.5, clr = clear_move);
    // Keep right (+X) outer mate face flat at X = +83.0 (trimming plinth & bolster overhang) so keypad pod sits flush
    translate([vault_w / 2 + 4.0, 0, vault_h / 2])
      cube([8.0, vault_d + 10.0, vault_h + 2.0], center = true);
    // Teardrop-topped cable conduit between vault chest and keypad pod
    translate([vault_w / 2, 16.0, 12.0])
      rotate([0, 90, 0])
        hull() {
          cylinder(h = 12.0, d = 8.0, center = true);
          translate([-4.2, 0, 0]) cylinder(h = 12.0, d = 1.6, center = true);
        }

    // 8. Crooked Haunted Timber Plank V-grooves (kept clear of vertical iron pilasters so zero floating outer slivers!)
    for (idx = [0 : 2]) {
      zp = 22 + idx * 20;
      tilt = (idx % 2 == 0) ? 2.0 : -1.8;
      // Back (+Y) full span; Front (-Y) center span between X = +-48 pilasters
      translate([0, vault_d / 2 + 0.1, zp])
        rotate([0, tilt, 0])
          rotate([45, 0, 0])
            cube([vault_w - 22, 1.4, 1.4], center = true);
      translate([0, -vault_d / 2 - 0.1, zp])
        rotate([0, tilt, 0])
          rotate([45, 0, 0])
            cube([82.0, 1.4, 1.4], center = true);
      // Left (-X) center span between Y = +-26 pilasters
      translate([-(vault_w / 2 + 0.1), 0, zp])
        rotate([tilt, 0, 0])
          rotate([0, 45, 0])
            cube([1.4, 40.0, 1.4], center = true);
    }

    // 9. Rear Hinge Pin Bore (3.5 mm teardropped ID at Y = +63.6, Z = 79.0 mm, coaxial with lid hinge barrels) + central torsion-spring leg notch
    for (hx = [-56.0, 56.0]) {
      hull() {
        translate([hx, vault_d / 2 + 5.6, vault_h - 1.0])
          rotate([0, 90, 0])
            cylinder(h = 20.0, d = 3.5, center = true);
        translate([hx, vault_d / 2 + 5.6, vault_h + 0.1])
          rotate([0, 90, 0])
            cylinder(h = 20.0, d = 0.8, center = true);
      }
    }
    translate([0, vault_d / 2 + 0.2, vault_h - 4.5])
      cube([5.0, 1.6, 9.5], center = true);
  }

  // 10. Upper-Front SG90 Latch Servo Cradle on 45-Degree Self-Supporting Gusset Bracket
  //     Positioned at Z = 48.0..67.0 right behind the front latch window (Z = 68) with the 45-deg gusset
  //     clearing the top of the 6-Relic Tray (Z = 22..37, Y >= -50) with >= 1.2 mm vertical headroom!
  translate([5.5, -vault_d / 2 + v_wall, 0])
  difference() {
    hull() {
      // Top servo platform (Z = 48.0..67.0, Y = -0.5..+14.7 from inner front wall)
      translate([0, 6.7, 48.0])
        chamfer_box(sg90_flange_w + 5.0, sg90_body_d + 3.5, 19.0, r = 2.0, ch_bot = 0.4, ch_top = 0.6);
      // 45-degree support root into front wall (reaches Z = 38.2 at Y = -50.0, completely above Z = 37.0 tray!)
      translate([0, 0.5, 34.5])
        cube([sg90_flange_w + 5.0, 2.0, 2.0], center = true);
    }
    // SG90 Servo Cavity (top of cradle at Z = 67.0, shaft pointing up +Z into keeper loop at Z = 68..71)
    translate([0, 6.7, 58.0])
      cube([sg90_body_w, sg90_body_d, 20.0], center = true);
    translate([0, 6.7, 65.5])
      cube([sg90_flange_w, sg90_body_d, 3.6], center = true);
    for (sx = [-1, 1]) {
      translate([sx * sg90_hole_span / 2, 6.7, 54.5])
        cylinder(h = 13.0, d = sg90_m2_pilot_d);
    }
    // Wire routing groove down front wall
    translate([14.0, 2.0, 46.0])
      cube([5.0, 5.0, 24.0], center = true);
  }

  // 11. Four Corner Support Pillars holding the removable 6-Relic Tray at Z = 22 mm (sunk into floor z = 3.0)
  for (sx = [-1, 1], sy = [-1, 1]) {
    translate([sx * (vault_w / 2 - v_wall - 4.0), sy * (vault_d / 2 - v_wall - 4.0), 3.0])
      chamfer_box(9.0, 9.0, 19.0, r = 1.2, ch_bot = 0, ch_top = 0.4);
  }
}

color(col_leather) prop_15_vault_chest();
