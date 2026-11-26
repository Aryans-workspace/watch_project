from PIL import Image

img = Image.open('public/ai_logo.png')
w, h = img.size

# We want a 1:1 square crop from the center
size = min(w, h)
left = (w - size) // 2
top = (h - size) // 2
right = left + size
bottom = top + size

cropped = img.crop((left, top, right, bottom))
cropped.save('public/ai_logo.png')
print("Cropped to 1:1")
