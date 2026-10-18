// Builds app/public/marches.json (Marchés Publics) from scraper/data/marches/*.json.
// Data source: Offer Analyzer (marchespublics.gov.ma) — re-import new folders with
// the same layout (Offers_Data/Offer_*/offer_info.json + metadata.json) then run this.
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data', 'marches');
const OUT_DIR = process.env.APK_PUBLIC_DIR
  ? path.resolve(process.env.APK_PUBLIC_DIR)
  : path.resolve(__dirname, '..', 'app', 'public');

const DAY = 86400000;
function statusOf(o) {
  if (!o.dateLimiteIso) return 'unknown';
  const end = new Date(o.dateLimiteIso).getTime() + DAY - 1; // valid through the day
  const d = end - Date.now();
  if (d < 0) return 'closed';
  if (d <= 7 * DAY) return 'soon';
  return 'open';
}

const offers = [];
for (const f of fs.existsSync(DATA_DIR) ? fs.readdirSync(DATA_DIR) : []) {
  if (!f.endsWith('.json')) continue;
  try { offers.push(JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'))); } catch (e) { console.error('skip', f, e.message); }
}

const list = offers
  .map((o) => ({ ...o, status: statusOf(o) }))
  .sort((a, b) => (b.dateLimiteIso || '').localeCompare(a.dateLimiteIso || ''));

const out = {
  updatedAt: new Date().toISOString(),
  total: list.length,
  open: list.filter((o) => o.status === 'open' || o.status === 'soon').length,
  offers: list,
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'marches.json'), JSON.stringify(out, null, 2), 'utf8');
console.log(JSON.stringify({ ok: true, dir: OUT_DIR, total: out.total, open: out.open }));
