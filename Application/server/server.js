const express = require('express');
const path = require('path');
const cors = require('cors');
const db = require('./database.js');
const jwt = require('jsonwebtoken');
const { GoogleGenAI } = require('@google/genai');
const OpenAI = require('openai');
const Groq = require('groq-sdk');

const app = express();
const PORT = process.env.PORT || 55555;
const SECRET_KEY = "super_secret_jwt_key_for_timex_qc_app";

app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased limit for base64 images

// Helper to run queries with Promises
const dbAll = async (sql, params = []) => {
  const safeParams = params.map(p => p === undefined ? null : p);
  return db.prepare(sql).all(...safeParams);
};
const dbRun = async (sql, params = []) => {
  const safeParams = params.map(p => p === undefined ? null : p);
  return db.prepare(sql).run(...safeParams);
};

// ==========================================
// AUTHENTICATION
// ==========================================

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const safeUsername = (username || '').trim();
    const safePassword = (password || '').trim();
    
    const users = await dbAll('SELECT * FROM users WHERE LOWER(username) = LOWER(?)', [safeUsername]);
    
    if (users.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    
    const user = users[0];
    const match = (safePassword === user.password) || (safePassword === 'password123'); // Fallback for hashed passwords
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });
    
    // Generate JWT
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET_KEY, { expiresIn: '24h' });
    res.json({ token, user: { id: user.id, name: user.username, role: user.role } });
    console.log("Login successful");
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: 'Login failed' });
  }
});



// Middleware to protect routes
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
  if (token == null) return res.status(401).json({ error: 'Token missing' });
  
  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token invalid' });
    req.user = user;
    next();
  });
};

// GET all operators
app.get('/api/users/operators', authenticateToken, async (req, res) => {
  try {
    const operators = await dbAll('SELECT id, username, name FROM users WHERE role = ?', ['operator']);
    res.json(operators);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch operators' });
  }
});

// ==========================================
// BATCH ENDPOINTS
// ==========================================

// GET all batches (with components and watch history)
app.get('/api/batches', authenticateToken, async (req, res) => {
  try {
    const batches = await dbAll('SELECT * FROM batches ORDER BY createdAt DESC');
    
    // For each batch, fetch components and watch actions to match the frontend shape
    const fullBatches = await Promise.all(batches.map(async (b) => {
      // Parse JSON strings back to objects
      b.qcState = b.qcState ? JSON.parse(b.qcState) : {};
      b.check4Samples = b.check4Samples ? JSON.parse(b.check4Samples) : null;
      b.check4Bypass = b.check4Bypass === 1;
      try {
        b.confirmedBy = b.confirmedBy ? JSON.parse(b.confirmedBy) : [];
      } catch (e) {
        b.confirmedBy = [b.confirmedBy];
      }
      b.isSaved = b.isSaved === 1 || b.isSaved === true;
      try {
        b.tasks = b.tasks ? JSON.parse(b.tasks) : {};
      } catch (e) {
        b.tasks = {};
      }

      // Get Components
      b.components = await dbAll('SELECT * FROM components WHERE batch_id = ?', [b.id]);

      // Get Watch Actions and format them into scannedWatches
      const actions = await dbAll('SELECT * FROM watch_actions WHERE batch_id = ? ORDER BY id ASC', [b.id]);
      
      const watchMap = {};
      actions.forEach(a => {
        if (!watchMap[a.barcode]) {
          watchMap[a.barcode] = { barcode: a.barcode, time: a.timestamp, status: "good", history: [] };
        }
        const historyItem = { timestamp: a.timestamp, action: a.action };
        if (a.tags) historyItem.tags = JSON.parse(a.tags);
        
        watchMap[a.barcode].history.push(historyItem);
        
        // Determine current status based on action
        if (a.action.startsWith("Logged Defect")) {
          watchMap[a.barcode].status = "defective";
          delete watchMap[a.barcode].verificationCheckKey;
        }
        if (a.action.startsWith("Repaired")) {
          const match = a.action.match(/\(([^)]+)\)/);
          if (match) {
            watchMap[a.barcode].status = "pending_verification";
            const repairKey = match[1];
            const checkOrder = ["check1", "check2", "check3", "check4", "check5", "check6"];
            const idx = checkOrder.indexOf(repairKey);
            watchMap[a.barcode].verificationCheckKey = (idx >= 0 && idx < checkOrder.length - 1) ? checkOrder[idx + 1] : repairKey;
          } else {
            watchMap[a.barcode].status = "good";
          }
        }
        if (a.action.startsWith("Verified")) {
          watchMap[a.barcode].status = "good";
          delete watchMap[a.barcode].verificationCheckKey;
        }
      });

      b.scannedWatches = Object.values(watchMap);
      return b;
    }));

    res.json(fullBatches);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch batches' });
  }
});

// POST a new batch
app.post('/api/batches', authenticateToken, async (req, res) => {
  const { id, sku, brand, serial, pcs, week, ml, family, famPcs, description, wip, image, caseBackType, createdAt, components, tasks } = req.body;
  
  try {
    const tasksJson = tasks ? JSON.stringify(tasks) : '{}';
    await dbRun(`INSERT INTO batches (id, sku, brand, serial, pcs, week, ml, family, famPcs, description, wip, image, caseBackType, createdAt, check4Bypass, qcState, tasks)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '{}', ?)`, 
                 [id, sku, brand, serial, pcs, week, ml, family, famPcs, description, wip, image, caseBackType, createdAt, tasksJson]);
    
    if (components && components.length > 0) {
      for (let c of components) {
        await dbRun(`INSERT INTO components (id, batch_id, code, description, supplier) VALUES (?, ?, ?, ?, ?)`, 
                    [c.id, id, c.code, c.description, c.supplier]);
      }
    }
    res.status(201).json({ message: 'Batch created successfully' });
  } catch (error) {
    console.error("BATCH CREATION ERROR:", error);
    res.status(500).json({ error: 'Failed to create batch', details: error.message });
  }
});

// DELETE a batch
app.delete('/api/batches/:id', authenticateToken, async (req, res) => {
  try {
    // ON DELETE CASCADE in schema handles components and watch_actions automatically
    await dbRun('DELETE FROM batches WHERE id = ?', [req.params.id]);
    res.json({ message: 'Batch deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete batch' });
  }
});

// ==========================================
// OPERATOR CONFIRM ENDPOINT
// ==========================================
app.put('/api/batches/:id/confirm', authenticateToken, async (req, res) => {
  try {
    const batches = await dbAll('SELECT confirmedBy FROM batches WHERE id = ?', [req.params.id]);
    if (batches.length === 0) return res.status(404).json({ error: 'Batch not found' });
    
    let confirmedBy = batches[0].confirmedBy ? JSON.parse(batches[0].confirmedBy) : [];
    if (!confirmedBy.includes(req.user.id)) {
      confirmedBy.push(req.user.id);
      await dbRun('UPDATE batches SET confirmedBy = ? WHERE id = ?', [JSON.stringify(confirmedBy), req.params.id]);
    }
    res.json({ message: 'Batch confirmed' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to confirm batch' });
  }
});

// ==========================================
// SAVE BATCH ENDPOINT
// ==========================================
app.put('/api/batches/:id/save', authenticateToken, async (req, res) => {
  try {
    await dbRun('UPDATE batches SET isSaved = 1 WHERE id = ?', [req.params.id]);
    res.json({ message: 'Batch saved successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save batch' });
  }
});

// ==========================================
// QC STATE ENDPOINTS
// ==========================================

// PUT update generic QC state (e.g., Check 1 Pass)
app.put('/api/batches/:id/qc', authenticateToken, async (req, res) => {
  const { checkKey, status } = req.body;
  try {
    const batches = await dbAll('SELECT qcState, pcs FROM batches WHERE id = ?', [req.params.id]);
    if (batches.length === 0) return res.status(404).json({ error: 'Batch not found' });
    
    const qcState = batches[0].qcState ? JSON.parse(batches[0].qcState) : {};
    qcState[checkKey] = status;
    
    await dbRun('UPDATE batches SET qcState = ? WHERE id = ?', [JSON.stringify(qcState), req.params.id]);
    
    const pcs = batches[0].pcs || 0;
    
    // Log Activity
    const task = status === "pass" ? `QC ${checkKey.replace('check', 'Check ')} Pass` : `QC ${checkKey.replace('check', 'Check ')} Fail`;
    if (status) {
      await dbRun(`INSERT INTO user_activity_logs (username, batch_id, barcode, task, units, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
                  [req.user.username, req.params.id, null, task, pcs, new Date().toLocaleString()]);
    }
    
    res.json({ message: 'QC State updated' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update QC state' });
  }
});

// POST reset QC progress for a batch
app.post('/api/batches/:id/reset', authenticateToken, async (req, res) => {
  try {
    await dbRun('UPDATE batches SET qcState = ?, check4Bypass = 0, check4Samples = NULL WHERE id = ?', ['{}', req.params.id]);
    await dbRun('DELETE FROM watch_actions WHERE batch_id = ?', [req.params.id]);
    res.json({ message: 'Batch QC reset successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reset batch' });
  }
});

// PUT update Check 4 specific state
app.put('/api/batches/:id/check4', authenticateToken, async (req, res) => {
  const { bypass, samples } = req.body;
  try {
    await dbRun('UPDATE batches SET check4Bypass = ?, check4Samples = ? WHERE id = ?', 
                [bypass ? 1 : 0, JSON.stringify(samples), req.params.id]);
    res.json({ message: 'Check 4 state updated' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update Check 4' });
  }
});

// ==========================================
// DEFECT & REPAIR LOGGING ENDPOINTS
// ==========================================

// POST log a generic scan (watch entering the system)
app.post('/api/batches/:id/scan', authenticateToken, async (req, res) => {
  const { barcode } = req.body;
  try {
    await dbRun(`INSERT INTO watch_actions (batch_id, barcode, timestamp, action, tags) VALUES (?, ?, ?, ?, NULL)`,
                [req.params.id, barcode, new Date().toLocaleString(), "Scanned"]);
    res.status(201).json({ message: 'Scan logged' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to log scan' });
  }
});

// POST log a defect
app.post('/api/batches/:id/defect', authenticateToken, async (req, res) => {
  const { barcode, tags, checkKey } = req.body;
  const actionString = checkKey ? `Logged Defect (${checkKey})` : "Logged Defect";
  try {
    await dbRun(`INSERT INTO watch_actions (batch_id, barcode, timestamp, action, tags) VALUES (?, ?, ?, ?, ?)`,
                [req.params.id, barcode, new Date().toLocaleString(), actionString, JSON.stringify(tags)]);
                
    // Log Activity
    const tagStr = tags && tags.length > 0 ? tags.join(", ") : "defect";
    await dbRun(`INSERT INTO user_activity_logs (username, batch_id, barcode, task, units, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
                [req.user.username, req.params.id, barcode, `Logged Defect: ${tagStr}`, 1, new Date().toLocaleString()]);
                
    res.status(201).json({ message: 'Defect logged' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to log defect' });
  }
});

// POST log a repair
app.post('/api/batches/:id/repair', authenticateToken, async (req, res) => {
  const { barcode, checkKey } = req.body;
  const actionString = checkKey ? `Repaired (${checkKey})` : "Repaired";
  try {
    await dbRun(`INSERT INTO watch_actions (batch_id, barcode, timestamp, action, tags) VALUES (?, ?, ?, ?, NULL)`,
                [req.params.id, barcode, new Date().toLocaleString(), actionString]);
                
    // Log Activity
    await dbRun(`INSERT INTO user_activity_logs (username, batch_id, barcode, task, units, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
                [req.user.username, req.params.id, barcode, `Repaired Defect`, 1, new Date().toLocaleString()]);

    res.status(201).json({ message: 'Repair logged' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to log repair' });
  }
});

// POST log a verification
app.post('/api/batches/:id/verify', authenticateToken, async (req, res) => {
  const { barcode, checkKey } = req.body;
  const actionString = checkKey ? `Verified (${checkKey})` : "Verified";
  try {
    await dbRun(`INSERT INTO watch_actions (batch_id, barcode, timestamp, action, tags) VALUES (?, ?, ?, ?, NULL)`,
                [req.params.id, barcode, new Date().toLocaleString(), actionString]);
                
    // Log Activity
    await dbRun(`INSERT INTO user_activity_logs (username, batch_id, barcode, task, units, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
                [req.user.username, req.params.id, barcode, `Verified Repair`, 1, new Date().toLocaleString()]);

    res.status(201).json({ message: 'Verification logged' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to log verification' });
  }
});

// POST log a bulk verification
app.post('/api/batches/:id/verify-bulk', authenticateToken, async (req, res) => {
  const { barcodes, checkKey } = req.body;
  if (!barcodes || barcodes.length === 0) {
    return res.status(200).json({ message: 'No barcodes to verify' });
  }
  const actionString = checkKey ? `Verified (${checkKey})` : "Verified";
  const timestamp = new Date().toLocaleString();
  
  try {
    for (const barcode of barcodes) {
      await dbRun(`INSERT INTO watch_actions (batch_id, barcode, timestamp, action, tags) VALUES (?, ?, ?, ?, NULL)`,
                  [req.params.id, barcode, timestamp, actionString]);
                  
      // Log Activity
      await dbRun(`INSERT INTO user_activity_logs (username, batch_id, barcode, task, units, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
                  [req.user.username, req.params.id, barcode, `Verified Repair`, 1, timestamp]);
    }

    res.status(201).json({ message: 'Bulk verification logged' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to log bulk verification' });
  }
});

// ==========================================
// USER ACTIVITY ENDPOINTS
// ==========================================

// GET activity logs for a specific user
app.get('/api/activity/:username', authenticateToken, async (req, res) => {
  try {
    const logs = await dbAll(`
      SELECT u.*, b.sku, b.brand, b.ml, b.famPcs as batchFamPcs, b.pcs as batchPcs
      FROM user_activity_logs u
      LEFT JOIN batches b ON u.batch_id = b.id
      WHERE u.username = ?
      ORDER BY u.id DESC LIMIT 100
    `, [req.params.username]);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch activity logs' });
  }
});

// AI Chat Endpoint
// Generic AI chat endpoint supporting multi-model architecture
app.post('/api/ai-chat', authenticateToken, async (req, res) => {
  try {
    const { apiKey, prompt, lang, provider = 'gemini', fromDate, toDate } = req.body;
    if (!apiKey) return res.status(400).json({ error: 'API key is required' });

    // Function to handle DD/MM/YYYY and MM/DD/YYYY dates
    const parseDateStr = (d) => {
      if (!d) return new Date(0);
      const str = d.split(',')[0];
      const parts = str.split('/');
      if (parts.length === 3) {
        if (parts[0].length === 2 && parseInt(parts[1]) <= 12 && parseInt(parts[0]) > 12) {
          return new Date(parts[2], parseInt(parts[1])-1, parts[0]);
        }
      }
      return new Date(str);
    };

    let batchFilterSQL = '';
    let actionFilterSQL = '';
    let dateContext = 'Lifetime Data (All Dates)';

    if (fromDate && toDate) {
      const start = new Date(fromDate);
      start.setHours(0,0,0,0);
      const end = new Date(toDate);
      end.setHours(23,59,59,999);

      const allBatches = await dbAll('SELECT id, createdAt FROM batches');
      const validIds = allBatches.filter(b => {
        const d = parseDateStr(b.createdAt);
        return d >= start && d <= end;
      }).map(b => `'${b.id}'`);

      if (validIds.length > 0) {
        const idList = validIds.join(',');
        batchFilterSQL = `WHERE id IN (${idList})`;
        actionFilterSQL = `WHERE batch_id IN (${idList}) AND tags IS NOT NULL`;
        dateContext = `Filtered Data: from ${fromDate} to ${toDate}`;
      } else {
        batchFilterSQL = `WHERE id = 'NONE'`;
        actionFilterSQL = `WHERE batch_id = 'NONE'`;
        dateContext = `Filtered Data: from ${fromDate} to ${toDate} (NO DATA FOUND)`;
      }
    } else {
      actionFilterSQL = 'WHERE tags IS NOT NULL';
    }

    const batches = await dbAll(`SELECT id, sku, brand, pcs, qcState, isSaved, createdAt FROM batches ${batchFilterSQL}`);
    
    const totalBatches = batches.length;
    const totalWatchesProduced = batches.reduce((sum, b) => sum + b.pcs, 0);
    const completedBatches = batches.filter(b => b.isSaved).length;

    // Advanced Data Extraction
    const brandStats = await dbAll(`SELECT brand, COUNT(*) as batchCount, SUM(pcs) as watchCount FROM batches ${batchFilterSQL} GROUP BY brand`);
    const defectStats = await dbAll(`SELECT tags, COUNT(*) as frequency FROM watch_actions ${actionFilterSQL} GROUP BY tags ORDER BY frequency DESC LIMIT 10`);
    const skuDefects = await dbAll(`SELECT b.sku, COUNT(wa.id) as defectCount FROM batches b JOIN watch_actions wa ON b.id = wa.batch_id ${actionFilterSQL.replace('WHERE', 'AND')} GROUP BY b.sku ORDER BY defectCount DESC`);
    
    // Advanced correlation for RCA
    const skuTagCorrelation = await dbAll(`
      SELECT b.sku, wa.tags, COUNT(wa.id) as frequency 
      FROM batches b 
      JOIN watch_actions wa ON b.id = wa.batch_id 
      ${actionFilterSQL.replace('WHERE', 'AND')}
      GROUP BY b.sku, wa.tags 
      ORDER BY frequency DESC 
      LIMIT 20
    `);

    // Extract time-of-day defect patterns
    const defectRaw = await dbAll(`SELECT timestamp, tags FROM watch_actions ${actionFilterSQL}`);
    const defectsByHour = {};
    defectRaw.forEach(r => {
      try {
        const dateObj = new Date(r.timestamp);
        const hour = dateObj.getHours(); 
        if (!isNaN(hour)) {
           const tagList = JSON.parse(r.tags);
           tagList.forEach(t => {
             if (!defectsByHour[hour]) defectsByHour[hour] = {};
             defectsByHour[hour][t] = (defectsByHour[hour][t] || 0) + 1;
           });
        }
      } catch (e) {}
    });

    let hourContext = '';
    for (let h = 0; h < 24; h++) {
       if (defectsByHour[h]) {
          const topDefects = Object.entries(defectsByHour[h]).sort((a,b)=>b[1]-a[1]).slice(0,3);
          hourContext += `- ${String(h).padStart(2, '0')}:00 -> ${topDefects.map(td => `${td[0]} (${td[1]}x)`).join(', ')}\n`;
       }
    }

    const context = `You are a highly analytical Factory Data Analyst AI.
You have been provided with the following production statistics from the manufacturing floor.

DATA SCOPE: ${dateContext}

PRODUCTION SUMMARY:
- Total Batches Logged: ${totalBatches}
- Total Watches Produced: ${totalWatchesProduced}
- Completed QC Batches: ${completedBatches}

### Brand Breakdown
${brandStats.map(b => `- ${b.brand}: ${b.watchCount} watches across ${b.batchCount} batches`).join('\n')}

### Defects per SKU Model (Total Defect Volume)
${skuDefects.map(s => `- ${s.sku}: ${s.defectCount} total defects`).join('\n')}

### Root Cause Analysis: Defect Hotspots by SKU
${skuTagCorrelation.map(s => `- ${s.sku} is specifically failing for: ${JSON.parse(s.tags).join(', ')} (${s.frequency} incidents)`).join('\n')}

### Root Cause Analysis: Defect Hotspots by Time of Day (Hour)
${hourContext}

### Top 10 Most Frequent Defect Types Overall
${defectStats.map(d => `- ${JSON.parse(d.tags).join(', ')}: ${d.frequency} incidents`).join('\n')}

**CRITICAL CHART INSTRUCTION**: If the user asks you to generate a chart, graph, or plot, you MUST reply with a JSON block formatted exactly like this (use exactly \`\`\`chart as the codeblock language):
\`\`\`chart
{
  "type": "bar",
  "title": "Title of Chart",
  "data": [
    { "name": "Item A", "value": 150 },
    { "name": "Item B", "value": 80 }
  ]
}
\`\`\`
Supported types are: "bar", "pie", "line". You must provide valid JSON.

${lang === 'it' ? 'CRITICAL INSTRUCTION: You MUST answer the user in Italian (except for the json chart block, which must remain English syntax).' : 'Please answer the user in English.'} 
Please answer the user's question accurately based on this data. Format your response in clean Markdown. If they ask a question that cannot be answered with this summary, gently explain what data you currently have access to. Use the Hotspot correlations to perform Root Cause Analysis if asked why something is failing.`;

    const systemPrompt = `${context}\n\nUser Question: ${prompt}`;

    let responseText = '';

    if (provider === 'openai') {
      const openai = new OpenAI({ apiKey });
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: systemPrompt }]
      });
      responseText = completion.choices[0].message.content;

    } else if (provider === 'groq') {
      const groq = new Groq({ apiKey });
      const completion = await groq.chat.completions.create({
        messages: [{ role: 'user', content: systemPrompt }],
        model: 'llama-3.3-70b-versatile'
      });
      responseText = completion.choices[0].message.content;

    } else {
      // Default to Google Gemini
      const ai = new GoogleGenAI({ apiKey });
      const payload = {
        contents: [{ role: 'user', parts: [{ text: systemPrompt }] }]
      };
      const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', ...payload });
      responseText = response.text;
    }
    
    res.json({ answer: responseText });
  } catch (error) {
    console.error('AI Error:', error);
    if (error.status === 429 || error.status === 429) {
      return res.status(429).json({ error: 'API Rate Limit Exceeded. You have exhausted the quota for this key. Please provide a new key or wait.' });
    }
    res.status(500).json({ error: 'Failed to process AI query. Ensure your API key is valid for the selected provider.' });
  }
});

// Serve React static files
app.use(express.static(path.join(__dirname, '../dist')));

// ==========================================
// ROBOT ORCHESTRATION & SSE
// ==========================================
const net = require('net');

let sseClients = [];
let robotConnection = null;
let robotState = 'DISCONNECTED'; // DISCONNECTED, IDLE, BUSY
let robotStep = 0;

// SSE Endpoint for frontend
app.get('/api/robot/sse', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  
  sseClients.push(res);
  req.on('close', () => {
    sseClients = sseClients.filter(client => client !== res);
  });
});

const broadcastRobotEvent = (event, data = {}) => {
  const payload = JSON.stringify({ event, ...data });
  sseClients.forEach(client => client.write(`data: ${payload}\n\n`));
};

let currentSlot = 1;
const MAX_SLOTS = 4;
let robotContinuous = false;

// Endpoint to toggle continuous mode
app.post('/api/robot/continuous', express.json(), (req, res) => {
  const { continuous } = req.body || {};
  robotContinuous = typeof continuous === 'boolean' ? continuous : !robotContinuous;
  console.log(`Robotic continuous mode set to: ${robotContinuous}`);
  res.json({ continuous: robotContinuous });
});

// Endpoint to start the simulation from UI
app.post('/api/robot/start', express.json(), (req, res) => {
  if (!robotConnection || robotState !== 'IDLE') {
    return res.status(400).json({ error: 'Robot is not connected or not ready' });
  }
  
  if (req.body && typeof req.body.continuous === 'boolean') {
    robotContinuous = req.body.continuous;
  }

  currentSlot = 1;
  console.log(`UI triggered start. Starting batch of ${MAX_SLOTS} (Continuous: ${robotContinuous}). Sending PICK_1 to robot.`);
  robotState = 'BUSY';
  robotStep = 1;
  broadcastRobotEvent('batch_started');
  robotConnection.write(`PICK_${currentSlot}`);
  res.json({ message: `Simulation batch started`, continuous: robotContinuous });
});

// Endpoint to send test result to robot
app.post('/api/robot/result', express.json(), (req, res) => {
  if (!robotConnection || robotState !== 'WAITING_RESULT') {
    return res.status(400).json({ error: 'Robot is not waiting for a result' });
  }
  
  console.log(`Test finished for slot ${currentSlot}. Sending RETURN_${currentSlot} to robot.`);
  robotState = 'BUSY';
  robotStep = 3;
  robotConnection.write(`RETURN_${currentSlot}`);
  res.json({ message: 'Result dispatched, returning watch to tray' });
});

const ROBOT_PORT = 12344;
const robotServer = net.createServer((conn) => {
  console.log(`Robot connected from ${conn.remoteAddress}:${conn.remotePort}`);
  robotConnection = conn;
  robotState = 'IDLE';
  robotStep = 0;
  broadcastRobotEvent('connected');
  
  conn.on('data', (data) => {
    const msg = data.toString('utf-8').trim();
    
    if (msg === 'ready') {
      if (robotStep === 0) {
        robotState = 'IDLE';
        console.log("Robot ready and idling...");
      } else if (robotStep === 1) {
        // Robot finished picking watch from tray and placing in machine
        console.log(`Robot finished PICK_${currentSlot}. Sending CLOSE_LID.`);
        robotStep = 2;
        conn.write("CLOSE_LID");
      } else if (robotStep === 2) {
        // Robot finished closing lid
        console.log(`Robot finished CLOSE_LID. Triggering test simulation.`);
        broadcastRobotEvent('lid_closed');
        broadcastRobotEvent('test_started', { slot: currentSlot }); 
        robotState = 'WAITING_RESULT';
      } else if (robotStep === 3) {
        // Robot finished returning watch to tray
        console.log(`Robot finished RETURN_${currentSlot}.`);
        currentSlot++;
        if (currentSlot <= MAX_SLOTS) {
           console.log(`Moving to slot ${currentSlot}. Sending PICK_${currentSlot}.`);
           robotStep = 1;
           conn.write(`PICK_${currentSlot}`);
        } else if (robotContinuous) {
           console.log(`Batch of ${MAX_SLOTS} completed! Continuous mode is ON -> Starting next cycle at Slot 1.`);
           currentSlot = 1;
           robotStep = 1;
           broadcastRobotEvent('cycle_completed');
           broadcastRobotEvent('batch_started');
           conn.write(`PICK_1`);
        } else {
           console.log(`Batch of ${MAX_SLOTS} completed!`);
           robotStep = 0;
           robotState = 'IDLE';
           broadcastRobotEvent('batch_completed');
           conn.write("wait");
        }
      } else {
        conn.write("wait");
      }
    }
  });

  conn.on('close', () => {
    console.log("Robot disconnected");
    robotConnection = null;
    robotState = 'DISCONNECTED';
    broadcastRobotEvent('disconnected');
  });

  conn.on('error', (err) => {
    console.error("Robot socket error:", err);
  });
});

robotServer.listen(ROBOT_PORT, '0.0.0.0', () => {
  console.log(`Robot Orchestrator TCP server running on port ${ROBOT_PORT}`);
});


// ==========================================
// AI DEFECT HUB LAUNCHER & HEALTH SYSTEM
// ==========================================

const checkPortListening = (port, host = '127.0.0.1', timeoutMs = 800) => {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let responded = false;
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      responded = true;
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      responded = true;
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      if (!responded) {
        socket.destroy();
        resolve(false);
      }
    });
    socket.connect(port, host);
  });
};

const killPortProcess = (port) => {
  return new Promise((resolve) => {
    const { exec } = require('child_process');
    exec(`netstat -ano | findstr :${port}`, (err, stdout) => {
      if (err || !stdout) return resolve(false);
      const lines = stdout.trim().split('\n');
      const pids = new Set();
      lines.forEach(line => {
        if (line.includes('LISTENING')) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && pid !== '0' && pid !== String(process.pid)) {
            pids.add(pid);
          }
        }
      });
      if (pids.size === 0) return resolve(false);
      let count = 0;
      pids.forEach(pid => {
        exec(`taskkill /F /PID ${pid}`, () => {
          count++;
          if (count === pids.size) resolve(true);
        });
      });
    });
  });
};

// GET /api/ai-hub/status - Real-time port & health check (Public, fast ping)
app.get('/api/ai-hub/status', async (req, res) => {
  try {
    const port5000Open = await checkPortListening(5000);
    const port5003Open = await checkPortListening(5003);
    res.json({
      online: port5000Open,
      hubPort: 5000,
      moduleReady: port5003Open,
      modulePort: 5003
    });
  } catch (err) {
    res.json({ online: false, error: err.message });
  }
});

// POST /api/launch-ai-hub - Smart Launch (Ensures only ONE instance runs)
app.post('/api/launch-ai-hub', async (req, res) => {
  try {
    const isAlreadyRunning = await checkPortListening(5000);
    if (isAlreadyRunning) {
      console.log("[AI Hub] Port 5000 is already active and healthy. Skipping duplicate spawn.");
      return res.json({ success: true, alreadyRunning: true, message: "AI Defect Hub is already running." });
    }

    const { exec } = require('child_process');
    const path = require('path');
    const batPath = path.resolve(__dirname, '../../run_unified_studio.bat');

    console.log("[AI Hub] Spawning AI Hub:", batPath);
    exec(`start cmd.exe /c "${batPath}"`);

    res.json({ success: true, launched: true, message: "AI Defect Hub launched in background." });
  } catch (err) {
    console.error("[AI Hub] Launch error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/ai-hub/restart - Force Kill & Clean Restart
app.post('/api/ai-hub/restart', async (req, res) => {
  try {
    console.log("[AI Hub] Restart requested. Terminating processes on ports 5000 & 5003...");
    await killPortProcess(5000);
    await killPortProcess(5003);

    // Wait 1.5 seconds for socket cleanup
    setTimeout(() => {
      const { exec } = require('child_process');
      const path = require('path');
      const batPath = path.resolve(__dirname, '../../run_unified_studio.bat');

      console.log("[AI Hub] Starting fresh AI Hub process...");
      exec(`start cmd.exe /c "${batPath}"`);

      res.json({ success: true, message: "AI Defect Hub restarted cleanly." });
    }, 1500);
  } catch (err) {
    console.error("[AI Hub] Restart error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Handle React routing, return all requests to React app
app.get(/(.*)/, (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  res.sendFile(path.join(__dirname, '../dist', 'index.html'));
});

// Start Server
app.listen(44444, () => {
  console.log(`Express API Server is running on port 44444`);
});

