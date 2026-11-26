from PIL import Image

img = Image.open('public/ai_logo.png').convert('RGBA')
w, h = img.size

# We want to shrink the subject to about 85% of its current size
# to add some transparent padding around it.
new_subject_size = int(w * 0.82)

# Resize the subject
subject = img.resize((new_subject_size, new_subject_size), Image.Resampling.LANCZOS)

# Create a new transparent image of the ORIGINAL size
new_img = Image.new('RGBA', (w, h), (255, 255, 255, 0))

# Paste the shrunk subject in the center
offset = (w - new_subject_size) // 2
new_img.paste(subject, (offset, offset))

new_img.save('public/ai_logo.png')
print(f"Subject shrunk from {w} to {new_subject_size} within the original frame.")
