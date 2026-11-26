import re

with open('Application/App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

pattern = r'\{selectedCheckKey === "check6" && \(\s*<div style=\{\{ position: "relative", paddingTop: "20px" \}\}>\s*<AIDefectTwin />\s*</div>\s*\)\}\s*'

content = re.sub(pattern, '', content)

with open('Application/App.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Removed duplicates")
