
const jwt = require('jsonwebtoken');
const SECRET_KEY = 'super_secret_jwt_key_for_timex_qc_app'; // from server.js

const token = jwt.sign({ id: 1, role: 'manager', name: 'Admin' }, SECRET_KEY);

fetch('http://localhost:5000/api/batches', {
  method: 'GET',
  headers: { 'Authorization': 'Bearer ' + token }
}).then(r => r.text()).then(console.log).catch(console.error);

