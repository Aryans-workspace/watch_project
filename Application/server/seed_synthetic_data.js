const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

const dbRun = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function(err) { err ? reject(err) : resolve(this) }));

const artifactDir = '/Users/mac_of_ram/.gemini/antigravity/brain/63d3e124-948c-44ab-8db0-928ad5498c77';

const skus = [
  { sku: "TIMEX-MARLIN-01", brand: "Timex", image: "watch_timex_marlin_1785355753613.jpg", family: "Marlin Collection", desc: "Classic Marlin mechanical." },
  { sku: "VERSACE-GOLD-02", brand: "Versace", image: "watch_versace_chain_1785355762867.jpg", family: "Versace Medusa", desc: "Gold chain bracelet luxury watch." },
  { sku: "TIMEX-EXP-03", brand: "Timex", image: "watch_timex_expedition_1785355772645.jpg", family: "Expedition Series", desc: "Rugged outdoor watch." },
  { sku: "VERSACE-LEATHER-04", brand: "Versace", image: "watch_versace_leather_1785355789498.jpg", family: "Versace Medusa", desc: "Rose gold case with leather strap." },
  { sku: "TIMEX-WATERBURY-05", brand: "Timex", image: "watch_timex_waterbury_1785355798684.jpg", family: "Waterbury Collection", desc: "Vintage style cream dial." },
  { sku: "FERRAGAMO-SILVER-06", brand: "Ferragamo", image: "watch_ferragamo_silver_1785355807129.jpg", family: "Ferragamo Classico", desc: "Silver minimalist dress watch." },
  { sku: "TIMEX-Q-07", brand: "Timex", image: "watch_timex_q_1785355827063.jpg", family: "Q Timex", desc: "Retro Pepsi bezel quartz watch." },
  { sku: "VERSACE-SPORT-08", brand: "Versace", image: "watch_versace_sport_1785355835502.jpg", family: "Versace Sport", desc: "Aggressive black PVD chronograph." },
  { sku: "FERRAGAMO-GOLD-09", brand: "Ferragamo", image: "watch_ferragamo_gold_1785355844523.jpg", family: "Ferragamo Classico", desc: "Gold case with brown leather strap." },
  { sku: "TIMEX-IRONMAN-10", brand: "Timex", image: "watch_timex_ironman_1785355853601.jpg", family: "Ironman Triathlon", desc: "Digital sporty watch." }
];

const defects = [
  "Dust on dial",
  "Scratched case back",
  "Faulty hands",
  "Incorrect strap",
  "Crown malfunction",
  "Water resistance fail"
];

function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime())).toISOString();
}

async function seed() {
  console.log("Starting DB seed...");
  
  // Create 10 SKUs, each with 5 batches of 40 PCS
  for (const item of skus) {
    const base64Image = fs.existsSync(path.join(artifactDir, item.image)) 
      ? `data:image/jpeg;base64,${fs.readFileSync(path.join(artifactDir, item.image)).toString('base64')}`
      : "";

    for (let b = 1; b <= 5; b++) {
      const batchId = `${item.sku}-BATCH-00${b}`;
      
      // We simulate all batches passing check 6
      const qcStateObj = {
        check1: { count: 40, completedAt: randomDate(new Date(2026, 6, 1), new Date(2026, 6, 28)) },
        check2: { count: 40, completedAt: randomDate(new Date(2026, 6, 1), new Date(2026, 6, 28)) },
        check3: { count: 40, completedAt: randomDate(new Date(2026, 6, 1), new Date(2026, 6, 28)) },
        check4: { count: 40, completedAt: randomDate(new Date(2026, 6, 1), new Date(2026, 6, 28)) },
        check5: { count: 40, completedAt: randomDate(new Date(2026, 6, 1), new Date(2026, 6, 28)) },
        check6: { count: 40, completedAt: randomDate(new Date(2026, 6, 1), new Date(2026, 6, 28)) }
      };

      await dbRun(`INSERT INTO batches (id, sku, brand, serial, pcs, week, ml, family, famPcs, description, wip, image, caseBackType, createdAt, check4Bypass, check4Samples, qcState, confirmedBy, isSaved) 
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          batchId, item.sku, item.brand, `SN-${Math.floor(Math.random()*10000)}`, 40, `W${Math.floor(Math.random()*52)+1}`, "ML-01", item.family, 200, item.desc, "WIP-01", base64Image, "Screw", randomDate(new Date(2026, 5, 1), new Date(2026, 6, 1)), 0, "[]", JSON.stringify(qcStateObj), "admin", 1
        ]
      );

      // Components
      await dbRun(`INSERT INTO components (id, batch_id, code, description, supplier) VALUES (?, ?, ?, ?, ?)`,
        [`COMP-DIAL-${batchId}`, batchId, "D-100", "Dial", "Supplier A"]);
      await dbRun(`INSERT INTO components (id, batch_id, code, description, supplier) VALUES (?, ?, ?, ?, ?)`,
        [`COMP-STRAP-${batchId}`, batchId, "S-200", "Strap", "Supplier B"]);

      // Watches QC logic
      for (let w = 1; w <= 40; w++) {
        const barcode = `${batchId}-W${w.toString().padStart(3, '0')}`;
        
        // Log "Scanned" for checks 1 through 6
        for(let check = 1; check <= 6; check++) {
          await dbRun(`INSERT INTO watch_actions (batch_id, barcode, timestamp, action, tags) VALUES (?, ?, ?, ?, NULL)`,
            [batchId, barcode, qcStateObj[`check${check}`].completedAt, `Scanned (check${check})`]);
          
          // 20% chance of failing a random check (let's say we only simulate fails for checks 1-5)
          if (check < 6 && Math.random() < 0.20) {
            const defect = defects[Math.floor(Math.random() * defects.length)];
            const failTime = randomDate(new Date(2026, 6, 1), new Date(2026, 6, 28));
            
            // Log defect
            await dbRun(`INSERT INTO watch_actions (batch_id, barcode, timestamp, action, tags) VALUES (?, ?, ?, ?, ?)`,
              [batchId, barcode, failTime, `Logged Defect (check${check})`, JSON.stringify([defect])]);
            
            // Log repair
            await dbRun(`INSERT INTO watch_actions (batch_id, barcode, timestamp, action, tags) VALUES (?, ?, ?, ?, NULL)`,
              [batchId, barcode, failTime, `Repaired (check${check})`]);
              
            // Log verify
            await dbRun(`INSERT INTO watch_actions (batch_id, barcode, timestamp, action, tags) VALUES (?, ?, ?, ?, NULL)`,
              [batchId, barcode, failTime, `Verified (check${check})`]);
              
            // Add activity logs
            await dbRun(`INSERT INTO user_activity_logs (username, batch_id, barcode, task, units, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
              ["operator", batchId, barcode, `Logged Defect: ${defect}`, 1, failTime]);
            await dbRun(`INSERT INTO user_activity_logs (username, batch_id, barcode, task, units, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
              ["operator", batchId, barcode, `Repaired Defect`, 1, failTime]);
            await dbRun(`INSERT INTO user_activity_logs (username, batch_id, barcode, task, units, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
              ["admin", batchId, barcode, `Verified Repair`, 1, failTime]);
          }
        }
      }
      console.log(`Generated batch: ${batchId}`);
    }
  }
  console.log("Database seeded successfully!");
}

seed().catch(console.error);
