import cv2
import numpy as np
import os

img_good = cv2.imread('C:/Users/MECH MIND/.gemini/antigravity/brain/cdbab5f0-24c1-455f-91c2-d5686631da65/.user_uploaded/media_1790859319044.png')
img_bad = cv2.imread('C:/Users/MECH MIND/.gemini/antigravity/brain/cdbab5f0-24c1-455f-91c2-d5686631da65/.user_uploaded/media_1790859328793.png')

gray_good = cv2.cvtColor(img_good, cv2.COLOR_BGR2GRAY)
gray_bad = cv2.cvtColor(img_bad, cv2.COLOR_BGR2GRAY)

# Find shift and align bad image to good image
shift, error = cv2.phaseCorrelate(np.float64(gray_bad), np.float64(gray_good))
x_shift, y_shift = shift

M = np.float32([[1, 0, x_shift], [0, 1, y_shift]])
rows, cols = gray_bad.shape
gray_bad_aligned = cv2.warpAffine(gray_bad, M, (cols, rows))

# Blur to ignore tiny noise
gray_good_blur = cv2.GaussianBlur(gray_good, (3, 3), 0)
gray_bad_blur = cv2.GaussianBlur(gray_bad_aligned, (3, 3), 0)

# Compute absolute difference
diff = cv2.absdiff(gray_good_blur, gray_bad_blur)

# Create a circular mask for the dial
# Let's guess the center and radius
mask = np.zeros_like(gray_good)
center_x, center_y = cols // 2, rows // 2
radius = 210  # approximate radius of the black dial
cv2.circle(mask, (center_x, center_y), radius, 255, -1)

# Apply mask
diff_masked = cv2.bitwise_and(diff, diff, mask=mask)

# Threshold
_, thresh = cv2.threshold(diff_masked, 45, 255, cv2.THRESH_BINARY)

# Find contours
contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

output_img = img_bad.copy()
# Draw the mask boundary in blue to show what we segmented
cv2.circle(output_img, (center_x, center_y), radius, (255, 0, 0), 2)

for cnt in contours:
    area = cv2.contourArea(cnt)
    if 1 < area < 400: # Filter noise and massive lighting blobs
        x, y, w, h = cv2.boundingRect(cnt)
        center = (x + w//2, y + h//2)
        r = max(w, h) + 3
        cv2.circle(output_img, center, r, (0, 0, 255), 2)

out_path = 'C:/Users/MECH MIND/.gemini/antigravity/brain/cdbab5f0-24c1-455f-91c2-d5686631da65/scratch/defects_segmented.png'
cv2.imwrite(out_path, output_img)
print(f"Saved to {out_path}")
