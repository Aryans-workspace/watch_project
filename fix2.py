with open('Application/App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

bad = '''    const handleOpenQCDefectLogging = (id, checkKey) => {
    if (checkKey === "check6") {
      fetch(/launch-ai-hub, { 
        method: 'POST', 
        headers: { 'Authorization': Bearer  }
      }).catch(err => console.error("Failed to launch AI Hub", err));
    }
    setSelectedBatchId(id);'''

good = '''    const handleOpenQCDefectLogging = (id, checkKey) => {
    if (checkKey === "check6") {
      fetch(${API_URL}/launch-ai-hub, { 
        method: 'POST', 
        headers: { 'Authorization': Bearer  }
      }).catch(err => console.error("Failed to launch AI Hub", err));
    }
    setSelectedBatchId(id);'''

content = content.replace(bad, good)

with open('Application/App.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Done.")
