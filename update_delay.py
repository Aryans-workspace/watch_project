import re

with open('Application/AIDefectTwin.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("4000", "8000")

with open('Application/AIDefectTwin.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated delay to 8000ms")
