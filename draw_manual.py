import cv2
import numpy as np

img = cv2.imread('C:/Users/MECH MIND/.gemini/antigravity/brain/cdbab5f0-24c1-455f-91c2-d5686631da65/.user_uploaded/media_1790859328793.png')

# Defects: (x, y, radius, label, text_offset_x, text_offset_y)
defects = [
    (520, 490, 100, "Heavy Dust Scattering", 30, 110),
    (270, 461, 30, "Dust Speck", -120, -10),
    (414, 430, 35, "Stray Dust", -50, -45),
    (530, 340, 45, "Crystal Scratch", 45, -20),
    (545, 265, 35, "Bezel Scuff (1 o'clock)", 40, -10),
    (414, 685, 25, "Bezel Scuff (6 o'clock)", -80, 40),
    (650, 360, 40, "Outer Case Dust", 45, 10)
]

# We will draw a semi-transparent overlay
overlay = img.copy()

for (x, y, r, label, tx, ty) in defects:
    # Draw thick red circle
    cv2.circle(img, (x, y), r, (0, 0, 255), 3)
    
    # Draw text background
    text_x, text_y = x + tx, y + ty
    
    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = 0.6
    thickness = 2
    (text_w, text_h), _ = cv2.getTextSize(label, font, font_scale, thickness)
    
    cv2.rectangle(img, (text_x - 5, text_y - text_h - 5), (text_x + text_w + 5, text_y + 5), (0, 0, 0), -1)
    cv2.putText(img, label, (text_x, text_y), font, font_scale, (0, 255, 255), thickness)

out_path = 'C:/Users/MECH MIND/.gemini/antigravity/brain/cdbab5f0-24c1-455f-91c2-d5686631da65/scratch/defects_manual.png'
cv2.imwrite(out_path, img)
print(f"Saved to {out_path}")
