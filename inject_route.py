import re

with open('Application/server/server.js', 'r', encoding='utf-8') as f:
    content = f.read()

target = '''// Handle React routing, return all requests to React app'''

new_route = '''
// ==========================================
// AI DEFECT HUB LAUNCHER
// ==========================================
app.post('/api/launch-ai-hub', authenticateToken, (req, res) => {
  const { exec } = require('child_process');
  const path = require('path');
  
  // Resolve path to the root folder bat file
  const batPath = path.resolve(__dirname, '../../run_unified_studio.bat');
  
  console.log("Launching AI Hub:", batPath);
  
  // Start the batch script in a new console window so user can see/close it
  exec(start cmd.exe /c "");
  
  res.json({ success: true, message: "AI Defect Hub launched in background." });
});

// Handle React routing, return all requests to React app'''

content = content.replace(target, new_route)

with open('Application/server/server.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Injected route")
