import cv2
import numpy as np
import os

img_good = cv2.imread('C:/Users/MECH MIND/.gemini/antigravity/brain/cdbab5f0-24c1-455f-91c2-d5686631da65/.user_uploaded/media_1790859319044.png')
img_bad = cv2.imread('C:/Users/MECH MIND/.gemini/antigravity/brain/cdbab5f0-24c1-455f-91c2-d5686631da65/.user_uploaded/media_1790859328793.png')

# Convert to grayscale
gray_good = cv2.cvtColor(img_good, cv2.COLOR_BGR2GRAY)
gray_bad = cv2.cvtColor(img_bad, cv2.COLOR_BGR2GRAY)

# Absolute difference
diff = cv2.absdiff(gray_good, gray_bad)

# Threshold to isolate significant differences (defects)
# Since defects are bright dust/scratches on dark background, bad > good
# Let's just use absdiff and threshold
_, thresh = cv2.threshold(diff, 40, 255, cv2.THRESH_BINARY)

# Find contours
contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

# Draw red circles around defects on the bad image
output_img = img_bad.copy()
for cnt in contours:
    area = cv2.contourArea(cnt)
    if area > 2: # Filter noise
        x, y, w, h = cv2.boundingRect(cnt)
        center = (x + w//2, y + h//2)
        radius = max(w, h) + 5
        cv2.circle(output_img, center, radius, (0, 0, 255), 2)

out_path = 'C:/Users/MECH MIND/.gemini/antigravity/brain/cdbab5f0-24c1-455f-91c2-d5686631da65/scratch/defects_highlighted.png'
os.makedirs(os.path.dirname(out_path), exist_ok=True)
cv2.imwrite(out_path, output_img)
print(f"Saved to {out_path}")
