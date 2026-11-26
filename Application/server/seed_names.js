const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    const fakeNames = [
      "Marco Rossi", "Giuseppe Russo", "Mario Ferrari", "Luigi Esposito", "Giovanni Bianchi", 
      "Roberto Romano", "Antonio Colombo", "Davide Ricci", "Paolo Marino", "Luca Greco", 
      "Alessandro Bruno", "Andrea Gallo"
    ];

    for (let i = 1; i <= 12; i++) {
      const username = `OP${i}`;
      const name = fakeNames[i-1];
      db.run(`UPDATE users SET name = ? WHERE username = ?`, [name, username], (err) => {
        if (err) {
          console.error(`Error updating ${username}:`, err.message);
        } else {
          console.log(`Updated ${username} with name ${name}`);
        }
      });
    }

    setTimeout(() => {
      db.close();
    }, 1000);
  }
});
