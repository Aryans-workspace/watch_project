// =============================================================
// STEP 1: Proofmaster M - Tablet Style Base Case
// =============================================================
// Redesigned based on your feedback:
// - It is now a flat, tablet-style cuboidal block (25mm thick)
// - No longer a solid wedge.
// - It is angled upright at 65 degrees in the 3D preview to match the real stand.
// =============================================================

$fn = 80;

// ---- STEP 4: PRINTING & ASSEMBLY TOGGLES ----
print_layout = true; // Set to true to lay parts flat on the bed for 3D printing

// ---- STEP 1: TABLET CASE PARAMETERS ----
tablet_w     = 230;   // Extended to 230mm to fit the landscape display on the right
tablet_h     = 180;   // Height of the tablet face (bottom to top)
tablet_thick = 25;    // Thickness of the tablet

// ---- CHAMBER DIMENSIONS ----
ch_w     = 104;   // Chamber width
ch_h     = 117;   // Chamber length/height
ch_deep  = 20;    // Depth of the void (leaves 5mm of floor on a 25mm tablet)
ch_xoff  = 16;    // Offset from left edge
ch_yoff  = 35;    // Offset from bottom edge
ch_r     = 12;    // Corner rounding radius

hinge_ear_w = 7;  // 7mm ears for extreme strength
hinge_clearance = 0.5; // Gap between moving plastic parts to prevent fusing
hinge_ear_r = 12;
hinge_pin_r = 3.2; // M6 bolt clearance hole (6.4mm diameter)

// ---- STEP 3: CLOSING LID PARAMETERS ----
lid_depth = 30;   // How deep the lid dome is
lid_wall = 3;     // Wall thickness of the hollow lid
lid_hinge_w = 30; // Total outer hinge assembly width is 45mm (7+31+7). Perfect for a 60mm screw!

// ---- STEP 2: WATCH PEDESTAL PARAMETERS ----
ped_w = 46;       // Width of the pedestal base
ped_base_h = 6;   // Height of the rectangular base
ped_u_w = 24;     // Width of the upright section
ped_u_h = 16;     // Height of the upright straight section
ped_t = 8;        // Thickness of each pedestal support
ped_spacing = 38.1; // Distance between the two pedestals (1.5 inches)
ped_h = 40;       // Height of the pedestal

// ---- RENDER PARAMETERS ----
machine_slant_angle = 80; // The angle the machine rests at on the table
lid_open_angle = -120;      // Angle to swing the lid open in preview (0 for closed)

// =============================================================
// HELPER MODULES
// =============================================================
module rounded_rect(w, h, r) {
    hull() {
        translate([r, r]) circle(r=r);
        translate([w-r, r]) circle(r=r);
        translate([w-r, h-r]) circle(r=r);
        translate([r, h-r]) circle(r=r);
    }
}

// =============================================================
// TABLET BASE CASE
// =============================================================
module base_case() {
    difference() {
        // ---------------------------------------------------------
        // 1. ADDITIVE GEOMETRY (The solid tablet + hinge ears)
        // ---------------------------------------------------------
        union() {
            // Main Tablet Body (simple flat cuboid with slightly rounded corners on the face)
            hull() {
                translate([5, 5, 0]) cylinder(r=5, h=tablet_thick);
                translate([tablet_w-5, 5, 0]) cylinder(r=5, h=tablet_thick);
                translate([5, tablet_h-5, 0]) cylinder(r=5, h=tablet_thick);
                translate([tablet_w-5, tablet_h-5, 0]) cylinder(r=5, h=tablet_thick);
            }
            
            // Hinge Mounts (Ears/Sockets)            // Centered hinge ears for a single short 30mm bolt (with clearance)
            translate([ch_xoff + ch_w/2 - (lid_hinge_w/2 + hinge_clearance + hinge_ear_w), tablet_h - 20, tablet_thick]) {
                // Left Ear
                hull() {
                    cube([hinge_ear_w, 20, 1]); // base pad aligns perfectly with top edge
                    translate([0, 10, hinge_ear_r]) rotate([0, 90, 0]) cylinder(r=hinge_ear_r, h=hinge_ear_w);
                }
                
                // Right Ear (shifted by left ear + lid barrel width + clearances)
                translate([hinge_ear_w + lid_hinge_w + 2*hinge_clearance, 0, 0])
                hull() {
                    cube([hinge_ear_w, 20, 1]);
                    translate([0, 10, hinge_ear_r]) rotate([0, 90, 0]) cylinder(r=hinge_ear_r, h=hinge_ear_w);
                }
            }
        }
        
        // ---------------------------------------------------------
        // 2. SUBTRACTIVE GEOMETRY (The voids and cuts)
        // ---------------------------------------------------------
        
        // A. Main Chamber Void (cut straight down into the tablet)
        translate([ch_xoff, ch_yoff, tablet_thick - ch_deep])
        linear_extrude(ch_deep + 5) 
            rounded_rect(ch_w, ch_h, ch_r);
            
        // B. Shallow Gasket/Lid Lip Groove (slightly larger than chamber)
        translate([ch_xoff - 4, ch_yoff - 4, tablet_thick - 3])
        linear_extrude(5) 
            rounded_rect(ch_w + 8, ch_h + 8, ch_r + 2);
            
        // C. Base Magnet Hole (bottom center, replaces mechanical latch socket)
        // 30mm diameter (r=15), 8mm deep hole for flush magnet fitment
        translate([ch_xoff + ch_w/2, 16, tablet_thick - 8])
        cylinder(r=15, h=8.1);
        
        // G. Lid Hinge Heel Clearance Pocket
        // Recess cut into the tablet between the centered hinge ears
        translate([ch_xoff + ch_w/2 - (lid_hinge_w/2 + hinge_clearance + 1), tablet_h - 25, tablet_thick - 10])
        cube([lid_hinge_w + 2*hinge_clearance + 2, 30, 20]);
        
        // H. Continuous Hinge Hole (Clearance for M6 Bolts)
        // Subtracted through both ears at once
        translate([ch_xoff - 2, tablet_h - 10, tablet_thick + hinge_ear_r])
        rotate([0, 90, 0])
        cylinder(r=hinge_pin_r, h=ch_w + 4);
            
        // I. Authentic Witschi Display Recess (Landscape)
        translate([132, 90, tablet_thick - 2])
        linear_extrude(5)
            rounded_rect(85, 65, 4);
            
        // J. Small Left Indicator/Button
        translate([145, 45, tablet_thick - 2])
        cylinder(r=2, h=5);
        
        // K. Large Right Button/Sensor Hole
        translate([205, 45, tablet_thick - 2])
        cylinder(r=6, h=5);
    }
    
    // Large Right Button Insert (Dark Blue)
    color("DarkBlue")
    translate([205, 45, tablet_thick - 1.9])
    cylinder(r=5.5, h=2.5);
}


// =============================================================
// STEP 2: WATCH PEDESTALS (NEW DESIGN)
// =============================================================

module single_pedestal() {
    // Calculate the required cut angle so the pedestal sits flush on the floor
    cut_angle = 90 - machine_slant_angle;
    
    difference() {
        // Stand the 2D profile upright and center the extrusion
        rotate([90, 0, 0])
        linear_extrude(ped_t, center=true) {
            union() {
                // Base rectangular plate (extended down for the flush cut)
                translate([-ped_w/2, -10]) 
                    square([ped_w, ped_base_h + 10]);
                
                // Upright stem
                translate([-ped_u_w/2, 0]) 
                    square([ped_u_w, ped_base_h + ped_u_h]);
                    
                // Rounded top (semi-circle)
                translate([0, ped_base_h + ped_u_h]) 
                    circle(d=ped_u_w);
            }
        }
        
        // Slice the bottom so it sits flush when rotated
        rotate([-cut_angle, 0, 0])
        translate([-50, -50, -50])
        cube([100, 100, 50]);
    }
}

module watch_pedestal() {
    // To make the pedestal point perfectly horizontal to the ground (parallel to blue line),
    // we rotate it by (90 - machine_slant_angle).
    horizontal_correction = 90 - machine_slant_angle;
    
    // Adjust spacing along the slanted floor so horizontal spacing is exactly 1.5 inches
    spacing_on_floor = ped_spacing / cos(horizontal_correction);
    
    translate([0, -spacing_on_floor/2, 0]) rotate([horizontal_correction, 0, 0]) single_pedestal();
    translate([0, spacing_on_floor/2, 0]) rotate([horizontal_correction, 0, 0]) single_pedestal();
}

// =============================================================
// STEP 3: CLOSING LID
// =============================================================

module closing_lid() {

    difference() {
        // 1. OUTER SHELL (Domed shape)
        hull() {
            // Hinge barrel (top)
            translate([ch_xoff + ch_w/2, tablet_h - 10, tablet_thick + hinge_ear_r])
            rotate([0, 90, 0])
            cylinder(r=hinge_ear_r, h=lid_hinge_w, center=true);
            
            // Domed top surface (raised outwards)
            translate([ch_xoff + 10, ch_yoff + 20, tablet_thick + lid_depth - 2])
            linear_extrude(2) rounded_rect(ch_w - 20, ch_h - 40, ch_r);
            
            // Base rim (sits flush on the tablet over the gasket lip)
            translate([ch_xoff - 2, ch_yoff - 2, tablet_thick])
            linear_extrude(1) rounded_rect(ch_w + 4, ch_h + 4, ch_r);
            
            // Magnet Flap Extension (sweeps down smoothly to encase the 30mm magnet)
            translate([ch_xoff + ch_w/2, 16, tablet_thick])
            cylinder(r=18, h=9); // 36mm wide flap, 9mm thick to hold 8mm hole
        }
        
        // 2. INNER CAVITY (Hollowing it out)
        hull() {
            // Inner dome top
            translate([ch_xoff + 10 + lid_wall, ch_yoff + 20 + lid_wall, tablet_thick + lid_depth - 2 - lid_wall])
            linear_extrude(2) rounded_rect(ch_w - 20 - 2*lid_wall, ch_h - 40 - 2*lid_wall, ch_r);
            
            // Inner base (cuts out the inside)
            translate([ch_xoff - 2 + lid_wall, ch_yoff - 2 + lid_wall, tablet_thick - 1]) 
            linear_extrude(2.1) rounded_rect(ch_w + 4 - 2*lid_wall, ch_h + 4 - 2*lid_wall, ch_r);
        }
        
        // 3. HINGE PIN CLEARANCE HOLE
        translate([ch_xoff + ch_w/2, tablet_h - 10, tablet_thick + hinge_ear_r])
        rotate([0, 90, 0])
        cylinder(r=hinge_pin_r + 0.2, h=lid_hinge_w + 10, center=true);
        


        // 4. LID MAGNET HOLE
        // Flush 8mm deep pocket for the 30mm magnet.
        // Aligns perfectly with the base magnet hole when the lid is closed.
        translate([ch_xoff + ch_w/2, 16, tablet_thick - 0.1])
        cylinder(r=15, h=8.1);
        
        // 5. HINGE CLEARANCES
        // 5a. Remove all lid material outside the central hinge stalk (overlap by 0.1mm for manifold safety)
        // Cut away left side
        translate([-50, tablet_h - 25, tablet_thick - 5])
        cube([50 + ch_xoff + ch_w/2 - lid_hinge_w/2 + 0.1, 50, 100]);
        
        // Cut away right side
        translate([ch_xoff + ch_w/2 + lid_hinge_w/2 - 0.1, tablet_h - 25, tablet_thick - 5])
        cube([100, 50, 100]);
        
        // 5b. Radial clearance slots for the base ears
        // Ensures the lid's flat cut faces don't swing backwards into the ears! (overlap by 0.1mm)
        // Left ear slot
        translate([30, tablet_h - 10, tablet_thick + hinge_ear_r])
        rotate([0, 90, 0])
        cylinder(r=17, h=22.1);
        
        // Right ear slot
        translate([ch_xoff + ch_w/2 + lid_hinge_w/2 - 0.1, tablet_h - 10, tablet_thick + hinge_ear_r])
        rotate([0, 90, 0])
        cylinder(r=17, h=20);
        
        // 6. GASKET LIP CLEARANCE GROOVE
        // A groove to accommodate the 1mm raised gasket lip so the lid shuts 100% flush
        translate([ch_xoff - 4.5, ch_yoff - 4.5, tablet_thick - 0.1])
        linear_extrude(1.5) 
            difference() {
                rounded_rect(ch_w + 9, ch_h + 9, ch_r + 4.5);
                translate([3, 3, 0]) rounded_rect(ch_w + 3, ch_h + 3, ch_r + 1.5);
            }
    }
}

// =============================================================
// RENDER & PREVIEW
// =============================================================// =============================================================
// DESKTOP STAND
// =============================================================
module machine_stand() {
    stand_w = tablet_w + 10; // Total width is 240 (5mm overhang on each side)
    clearance = 1; // 1mm total clearance (0.5mm per side) for easy drop-in
    
    color("DimGray")
    difference() {
        // Main Base Station Wedge (Shifted -5 left so it is perfectly centered around the tablet)
        translate([-5, 0, 0])
        hull() {
            // Front smooth rounded lip (moved forward to -35 to fully wrap the front of the tablet)
            translate([0, -35, 2]) rotate([0, 90, 0]) cylinder(r=2, h=stand_w);
            // Back smooth rounded tail
            translate([0, 50, 2]) rotate([0, 90, 0]) cylinder(r=2, h=stand_w);
            
            // Tall back support (holds the back of the slanted tablet)
            // Moved forward to Y=0 to physically encompass and touch the tablet's slanted back face
            translate([0, 0, 0]) cube([stand_w, 30, 60]);
            
            // Front lip support (moved forward and made taller to physically capture the front of the tablet)
            translate([0, -35, 0]) cube([stand_w, 15, 35]);
        }
        
        // Tablet Slot Cutout (The exact size of the tablet + clearance)
        // The clearance provides exactly 0.5mm space on all 5 mating surfaces (left, right, bottom, front, back)
        drop_z = 10;
        translate([-clearance/2, 0, drop_z]) // Perfectly match the tablet position in the assembly
        rotate([machine_slant_angle, 0, 0])
        translate([0, -clearance/2, -clearance/2]) // 0.5mm clearance on bottom and back faces
        cube([tablet_w + clearance, tablet_h + 20, 25 + clearance]);
        
        // Hollow out the center to save massive amounts of plastic and create a sleek U-shape
        // Leaves exactly 35mm thick support arms on the left and right
        translate([30, -100, 5])
        cube([tablet_w - 60, 300, 100]);
        
        // Ensure the bottom is completely flat at Z=0
        translate([-50, -50, -20])
        cube([stand_w + 100, 200, 20]);
    }
}

if (print_layout) {
    // 1. Tablet Base Case (Center)
    color("WhiteSmoke") base_case();
    
    // 2. Pedestals (Moved far away to the right)
    translate([tablet_w + 100, 40, 0])
    rotate([90 - machine_slant_angle, 0, 0])
    single_pedestal();
    
    translate([tablet_w + 100, 90, 0])
    rotate([90 - machine_slant_angle, 0, 0])
    single_pedestal();
    
    // 3. Closing Lid (Moved massively below the tablet)
    translate([0, -200, tablet_thick])
    rotate([180, 0, 0]) // Flip it upside down to print the rim flat on the bed
    color("DarkGray")
    closing_lid();
    
    // 4. Machine Stand (Moved massively above the tablet)
    translate([0, tablet_h + 150, 0])
    machine_stand();
} else {
    // Assembled preview
    drop_z = 10; // Tablet sits in the 10mm deep slot of the stand
    
    // Desktop Stand
    machine_stand();
    
    // Angled base case
    color("WhiteSmoke")
    translate([0, 0, drop_z])
    rotate([machine_slant_angle, 0, 0])
    base_case();
    
    // Position the pedestals inside the chamber void
    color("Silver")
    translate([0, 0, drop_z])
    rotate([machine_slant_angle, 0, 0])
    translate([ch_xoff + ch_w/2, ch_yoff + ch_h/2, tablet_thick - ch_deep])
    watch_pedestal();
    
    // Position the closing lid and hinge hardware
    translate([0, 0, drop_z])
    rotate([machine_slant_angle, 0, 0]) {
        // Hinge rotation math for the lid
        color("DarkGray")
        translate([ch_xoff + ch_w/2, tablet_h - 10, tablet_thick + hinge_ear_r])
        rotate([lid_open_angle, 0, 0])
        translate([-(ch_xoff + ch_w/2), -(tablet_h - 10), -(tablet_thick + hinge_ear_r)])
        closing_lid();
    }
}
