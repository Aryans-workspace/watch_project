from PIL import Image

img = Image.open('public/ai_logo.png').convert('RGBA')

# Get the bounding box of all non-transparent pixels
bbox = img.getbbox()

if bbox:
    cropped = img.crop(bbox)
    w, h = cropped.size
    # Make it a perfect square based on the max dimension
    size = max(w, h)
    
    # Create a new transparent square image
    new_img = Image.new('RGBA', (size, size), (255, 255, 255, 0))
    
    # Paste the cropped image into the center
    offset_x = (size - w) // 2
    offset_y = (size - h) // 2
    new_img.paste(cropped, (offset_x, offset_y))
    
    new_img.save('public/ai_logo.png')
    print(f"Perfectly centered and squared to {size}x{size}")
else:
    print("Image is empty")
