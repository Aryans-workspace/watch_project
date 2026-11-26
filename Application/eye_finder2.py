import sys
from PIL import Image, ImageDraw

img = Image.open('public/ai_logo.jpg').convert('RGB')
w, h = img.size

# Look in the expected region for the right eye
# Left: 55% to 70%, Top: 40% to 60%
eye_pixels = []
for y in range(int(h*0.40), int(h*0.60)):
    for x in range(int(w*0.55), int(w*0.70)):
        r, g, b = img.getpixel((x, y))
        # Eye is very dark
        if r < 30 and g < 30 and b < 30:
            eye_pixels.append((x, y))

if not eye_pixels:
    print("Could not find eye")
    sys.exit(1)

min_x = min([p[0] for p in eye_pixels])
max_x = max([p[0] for p in eye_pixels])
min_y = min([p[1] for p in eye_pixels])
max_y = max([p[1] for p in eye_pixels])

print(f"Right Eye BBox: {min_x}-{max_x}, {min_y}-{max_y}")

# Sample eyelid color (gold from above the eye)
sample_y = min_y - int(h*0.02)
sample_x = (min_x + max_x) // 2
color = img.getpixel((sample_x, sample_y))

# Create a winking frame
# Draw a rectangle covering the eye with the eyelid color
draw = ImageDraw.Draw(img)
draw.rectangle([min_x - 5, min_y - 5, max_x + 5, max_y + 5], fill=color)
# Draw a darker curve for the closed eyelash
draw.line([min_x, max_y - (max_y-min_y)//3, max_x, max_y - (max_y-min_y)//3], fill=(30, 20, 10), width=8)

img.save('public/ai_logo_wink.jpg')
print("Saved winking frame")
