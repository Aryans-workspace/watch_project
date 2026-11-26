import re

with open('Application/App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

pattern = r'''    if \(checkKey === "check6"\) \{\s*fetch\([^}]+\}\s*\}\s*\)\.catch\(err => console\.error\("Failed to launch AI Hub", err\)\);\s*\}'''

replacement = r'''    if (checkKey === "check6") {
      fetch(${API_URL}/launch-ai-hub, {
        method: 'POST',
        headers: { 'Authorization': Bearer  }
      }).catch(err => console.error("Failed to launch AI Hub", err));
    }'''

content = re.sub(pattern, replacement, content)

with open('Application/App.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Fixed syntax")
