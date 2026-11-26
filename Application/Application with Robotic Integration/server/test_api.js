
const jwt = require('jsonwebtoken');
const SECRET_KEY = 'super_secret_jwt_key_for_timex_qc_app'; // from server.js

const token = jwt.sign({ id: 1, role: 'manager', name: 'Admin' }, SECRET_KEY);

fetch('http://localhost:5000/api/batches', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
  body: JSON.stringify({
    id: 'test-batch-api', sku: 'test', brand: 'test', serial: 'test', pcs: 1, 
    week: '1', ml: '1', family: '1', famPcs: 1, description: 'test', wip: 'test', 
    image: 'test', caseBackType: 'Screwing case back', createdAt: '2026-07-31', 
    tasks: {check1: 2}
  })
}).then(r => r.text()).then(console.log).catch(console.error);

