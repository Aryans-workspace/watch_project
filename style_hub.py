import re

with open('hub.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace green with brass
content = content.replace('#00ff66', '#dfc16d')
# Replace background colors to match app
content = content.replace('background: #0a0d14', 'background: #090b0e; font-family: "Roboto", sans-serif;')
content = content.replace('background: #111', 'background: rgba(23, 26, 31, 1); border-bottom: 2px solid #dfc16d;')
content = content.replace('border-color: #00ff66', 'border-color: #dfc16d')

# If needed add font import
if 'fonts.googleapis.com' not in content:
    content = content.replace('<head>', '<head>\\n    <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">')

with open('hub.py', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated hub.py styling")
