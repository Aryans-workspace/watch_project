import re

with open('Application/App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

target = '''              <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
                {selectedCheckKey === "check2" && (
                  <div style={{ position: "relative", paddingTop: "20px" }}>
                     <ProofmasterTwin />
                  </div>
                )}'''

replacement = target + '''
                {selectedCheckKey === "check6" && (
                  <div style={{ position: "relative", paddingTop: "20px" }}>
                     <AIDefectTwin />
                  </div>
                )}'''

if target in content:
    content = content.replace(target, replacement)
    with open('Application/App.jsx', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Injected successfully.")
else:
    print("Target not found.")
