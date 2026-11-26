import re

with open('Application/App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

target = '''  const handleOpenQCDefectLogging = (id, checkKey) => {
    setSelectedBatchId(id);
    setSelectedCheckKey(checkKey);
    setView("qcDefectLogging");
  };'''

replacement = '''  const handleOpenQCDefectLogging = (id, checkKey) => {
    if (checkKey === "check6") {
      fetch(${API_URL}/launch-ai-hub, { 
        method: 'POST', 
        headers: { 'Authorization': Bearer  }
      }).catch(err => console.error("Failed to launch AI Hub", err));
    }
    setSelectedBatchId(id);
    setSelectedCheckKey(checkKey);
    setView("qcDefectLogging");
  };'''

content = content.replace(target, replacement)

with open('Application/App.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated handleOpenQCDefectLogging")
