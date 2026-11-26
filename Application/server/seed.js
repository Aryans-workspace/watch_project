const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    
    for (let i = 1; i <= 12; i++) {
      const username = `OP${i}`;
      db.run(`INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)`, [username, "password123", "operator"], (err) => {
        if (err) {
          console.error(`Error inserting ${username}:`, err.message);
        } else {
          console.log(`Seeded ${username}`);
        }
      });
    }

    setTimeout(() => {
      db.close();
    }, 1000);
  }
});
