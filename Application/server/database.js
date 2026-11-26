const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

// Connect to SQLite database using Node's built-in robust module
const dbPath = path.resolve(__dirname, 'database_new.sqlite');
const db = new DatabaseSync(dbPath);

console.log('Connected to the SQLite database via node:sqlite.');

// Enable foreign keys
db.exec('PRAGMA foreign_keys = ON;');

// Auto-initialize schema and default seed accounts if database is fresh
const schemaPath = path.resolve(__dirname, 'schema.sql');
if (fs.existsSync(schemaPath)) {
  try {
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schemaSql);
  } catch (err) {
    console.error('Error applying schema.sql:', err.message);
  }
}

module.exports = db;
