const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

const skus = [
  { sku: "TIMEX-MARLIN-01", brand: "Timex", family: "Marlin Collection", desc: "Classic Marlin mechanical." },
  { sku: "VERSACE-GOLD-02", brand: "Versace", family: "Versace Medusa", desc: "Gold chain bracelet luxury watch." },
  { sku: "TIMEX-EXP-03", brand: "Timex", family: "Expedition Series", desc: "Rugged outdoor watch." },
  { sku: "VERSACE-LEATHER-04", brand: "Versace", family: "Versace Medusa", desc: "Rose gold case with leather strap." },
  { sku: "TIMEX-WATERBURY-05", brand: "Timex", family: "Waterbury Collection", desc: "Vintage style cream dial." },
  { sku: "FERRAGAMO-SILVER-06", brand: "Ferragamo", family: "Ferragamo Classico", desc: "Silver minimalist dress watch." },
  { sku: "TIMEX-Q-07", brand: "Timex", family: "Q Timex", desc: "Retro Pepsi bezel quartz watch." },
  { sku: "VERSACE-SPORT-08", brand: "Versace", family: "Versace Sport", desc: "Aggressive black PVD chronograph." },
  { sku: "FERRAGAMO-GOLD-09", brand: "Ferragamo", family: "Ferragamo Classico", desc: "Gold case with brown leather strap." },
  { sku: "TIMEX-IRONMAN-10", brand: "Timex", family: "Ironman Triathlon", desc: "Digital sporty watch." }
];

const outputDir = path.resolve(__dirname, '../synthetic_data/excel_files');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log("Generating 50 Excel files...");

for (const item of skus) {
  for (let b = 1; b <= 5; b++) {
    const batchId = `${item.sku}-BATCH-00${b}`;
    const filename = `${Math.floor(Math.random() * 900 + 100)}-2026 - ${item.sku}_00${b}.xlsx`;
    
    // Create the structured data mimicking the user's Excel file
    // The user's excel file had specific headers like FAM. PCS, PCS, etc.
    const data = [
      ["SKU", "Brand", "Serial", "PCS", "Week", "ML", "FAM. PCS", "Description", "WIP", "CaseBack"],
      [item.sku, item.brand, `SN-${Math.floor(Math.random()*10000)}`, 40, `W${Math.floor(Math.random()*52)+1}`, "ML-01", 200, item.desc, "WIP-01", "Screw"]
    ];

    const ws = xlsx.utils.aoa_to_sheet(data);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Sheet1");

    xlsx.writeFile(wb, path.join(outputDir, filename));
    console.log(`Generated: ${filename}`);
  }
}

console.log("Excel generation complete.");
