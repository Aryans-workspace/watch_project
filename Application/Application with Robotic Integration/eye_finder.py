import sys
from PIL import Image

img = Image.open('public/ai_logo.jpg').convert('RGB')
w, h = img.size

# Look for dark pixels in the middle-right area
# The image is presumably a square. The right eye should be around x: 50% to 75%, y: 40% to 60%
right_eye_pixels = []
for y in range(int(h*0.35), int(h*0.65)):
    for x in range(int(w*0.50), int(w*0.75)):
        r, g, b = img.getpixel((x, y))
        if r < 40 and g < 40 and b < 40: # dark pixel
            right_eye_pixels.append((x, y))

if not right_eye_pixels:
    print("Could not find right eye")
    sys.exit(1)

min_x = min([p[0] for p in right_eye_pixels])
max_x = max([p[0] for p in right_eye_pixels])
min_y = min([p[1] for p in right_eye_pixels])
max_y = max([p[1] for p in right_eye_pixels])

print(f"Right Eye Bounding Box: X({min_x}-{max_x}), Y({min_y}-{max_y})")

# Sample color just above the eye for the eyelid
eyelid_color = img.getpixel((min_x + (max_x - min_x)//2, min_y - 5))
print(f"Eyelid Color: {eyelid_color}")
