import re

with open('Application/AIDefectTwin.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("backgroundColor: '#0a0d14'", "backgroundColor: '#090b0e'")
content = content.replace("background: '#111'", "background: 'rgba(23, 26, 31, 1)'")
content = content.replace("borderBottom: '1px solid #333'", "borderBottom: '2px solid #dfc16d'")
content = content.replace("boxShadow: '0 0 10px #00ff66'", "boxShadow: '0 0 10px #dfc16d'")
content = content.replace("background: '#00ff66'", "background: '#dfc16d'")
content = content.replace("fontFamily: 'sans-serif'", "fontFamily: 'Roboto, sans-serif'")

with open('Application/AIDefectTwin.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated React twin styling")
