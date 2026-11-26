import sys
from PIL import Image

img_path = '/Users/mac_of_ram/.gemini/antigravity/brain/63d3e124-948c-44ab-8db0-928ad5498c77/.user_uploaded/media__1785422471728.jpg'
try:
    img = Image.open(img_path).convert('RGBA')
except Exception as e:
    print("Error opening image:", e)
    sys.exit(1)

data = img.getdata()
new_data = []
# target color #dfc16d -> RGB (223, 193, 109)
TR, TG, TB = 223, 193, 109

for r, g, b, a in data:
    # Remove gray background (assuming light gray background)
    if abs(r - g) < 20 and abs(g - b) < 20 and r > 160:
        new_data.append((255, 255, 255, 0)) # transparent
    else:
        # Convert to grayscale for luminance
        lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255.0
        # Colorize using target color
        nr = int(TR * lum * 1.5)
        ng = int(TG * lum * 1.5)
        nb = int(TB * lum * 1.5)
        # Cap at 255
        new_data.append((min(nr, 255), min(ng, 255), min(nb, 255), 255))

img.putdata(new_data)
img.save('public/ai_logo.png', 'PNG')
print("Saved recolored transparent image to public/ai_logo.png")
