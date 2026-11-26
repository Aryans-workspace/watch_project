const { DatabaseSync } = require('node:sqlite');
const path = require('path');

// Connect to SQLite database using Node's built-in robust module
const dbPath = path.resolve(__dirname, 'database_new.sqlite');
const db = new DatabaseSync(dbPath);

console.log('Connected to the SQLite database via node:sqlite.');

// Enable foreign keys
db.exec('PRAGMA foreign_keys = ON;');

module.exports = db;
