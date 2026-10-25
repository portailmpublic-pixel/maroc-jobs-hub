// Builds app/public/marches.json from:
//   - scraper/data/marches-live.json  (live PMMP/BDC mirror, refreshed twice a day)
//   - scraper/data/marches/*.json     (historical manually-imported offers)
//
// Deduplicates, recomputes open/soon/closed at build time, and writes a compact
// payload for the APK. Run after `npm run scrape:marches` in the GitHub Action.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const LIVE_FILE = path.join(DATA_DIR, 'marches-live.json');
const LEGACY_DIR = path.join(DATA_DIR, 'marches');
const OUT_DIR = process.env.APK_PUBLIC_DIR
  ? path.resolve(process.env.APK_PUBLIC_DIR)
  : path.resolve(__dirname, '..', 'app', 'public');

const DAY = 86400000;
const KEEP_CLOSED_DAYS = Number(process.env.MARCHES_KEEP_CLOSED_DAYS || 90);
const MAX_OFFERS = Number(process.env.MARCHES_MAX_OFFERS || 2200);

function norm(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function sourceId(url) {
  const s = String(url || '');
  const m = s.match(/refConsultation=(\d+)/i)
    || s.match(/\/show\/(\d+)/i)
    || s.match(/\/(\d{4,})(?:\/)?(?:[?#]|$)/);
  return m ? m[1] : '';
}

function endOf(o) {
  if (!o.dateLimiteIso) return null;
  const t = new Date(o.dateLimiteIso).getTime();
  if (isNaN(t)) return null;
  return o.dateOnly ? t + DAY - 1 : t;
}

function statusOf(o, now) {
  const end = endOf(o);
  if (end === null) return 'unknown';
  if (end < now) return 'closed';
  if (end - now <= 7 * DAY) return 'soon';
  return 'open';
}

function keyOf(o) {
  const sid = sourceId(o.portalHref) || sourceId(o.dceUrl);
  if (sid) return 'src-' + sid;
  return 'ref-' + norm(o.ref) + '|' + norm(o.organisme).slice(0, 60);
}

function pick(o) {
  const sid = sourceId(o.portalHref) || sourceId(o.dceUrl);
  let id = sid ? 'ad-' + sid : (o.id || keyOf(o));
  if (/[=?#&]/.test(id)) id = keyOf(o);
  const out = {
    id,
    ref: o.ref || '',
    organisme: o.organisme || '',
    objet: o.objet || '',
    ville: o.ville || '',
    dateLimite: o.dateLimite || '',
    dateLimiteIso: o.dateLimiteIso || '',
    typeProcedure: o.typeProcedure || '',
    categorie: o.categorie || '',
    modePassation: o.modePassation || '',
    dceUrl: o.dceUrl || o.portalHref || '',
    portalHref: o.portalHref || o.dceUrl || '',
    source: o.source || '',
    keywords: Array.isArray(o.keywords) ? o.keywords : [],
  };
  if (o.dateOnly) out.dateOnly = true;
  if (o.estimation) out.estimation = o.estimation;
  if (o.caution) out.caution = o.caution;
  if (o.typeAnnonce) out.typeAnnonce = o.typeAnnonce;
  if (o.lieuOuverture) out.lieuOuverture = o.lieuOuverture;
  if (o.contact) out.contact = o.contact;
  if (o.adresseRetrait) out.adresseRetrait = o.adresseRetrait;
  if (o.adresseDepot) out.adresseDepot = o.adresseDepot;
  if (o.prixAcquisition) out.prixAcquisition = o.prixAcquisition;
  if (o.dceSize) out.dceSize = o.dceSize;
  if (o.qc) out.qc = o.qc;
  if (o.detailUrl) out.detailUrl = o.detailUrl;
  if (o.seenAt) out.seenAt = o.seenAt;
  if (o.firstSeenAt) out.firstSeenAt = o.firstSeenAt;
  if (o.docs && o.docs.length) out.docs = o.docs;
  if (o.counts && Object.keys(o.counts).length) out.counts = o.counts;
  return out;
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

const now = Date.now();
const map = new Map();

// Historical offers first; live offers then enrich/override them.
const legacy = [];
if (fs.existsSync(LEGACY_DIR)) {
  for (const f of fs.readdirSync(LEGACY_DIR)) {
    if (!f.endsWith('.json')) continue;
    try { legacy.push(JSON.parse(fs.readFileSync(path.join(LEGACY_DIR, f), 'utf8'))); }
    catch (e) { console.error('skip', f, e.message); }
  }
}
for (const o of legacy) {
  if (!o) continue;
  const k = keyOf(o);
  map.set(k, { ...o, _legacy: true });
}

const live = readJson(LIVE_FILE);
const liveOffers = Array.isArray(live) ? live : (live && live.offers) || [];
let added = 0, enriched = 0;
for (const o of liveOffers) {
  if (!o) continue;
  const k = keyOf(o);
  const old = map.get(k);
  if (old) {
    map.set(k, {
      ...old,
      ...o,
      docs: (o.docs && o.docs.length) ? o.docs : old.docs,
      counts: (o.counts && Object.keys(o.counts).length) ? o.counts : old.counts,
      contact: o.contact || old.contact,
      adresseRetrait: o.adresseRetrait || old.adresseRetrait,
      adresseDepot: o.adresseDepot || old.adresseDepot,
      prixAcquisition: o.prixAcquisition || old.prixAcquisition,
      dceSize: o.dceSize || old.dceSize,
    });
    enriched += 1;
  } else {
    map.set(k, o);
    added += 1;
  }
}

const offers = [];
for (const o of map.values()) {
  const status = statusOf(o, now);
  if (status === 'closed') {
    const end = endOf(o);
    if (end !== null && end < now - KEEP_CLOSED_DAYS * DAY) continue;
  }
  offers.push({ ...pick(o), status });
}

offers.sort((a, b) => {
  const rank = (s) => (s === 'closed' ? 1 : s === 'unknown' ? 2 : 0);
  const ra = rank(a.status), rb = rank(b.status);
  if (ra !== rb) return ra - rb;
  const ta = a.dateLimiteIso ? new Date(a.dateLimiteIso).getTime() : 0;
  const tb = b.dateLimiteIso ? new Date(b.dateLimiteIso).getTime() : 0;
  return ra === 0 ? ta - tb : tb - ta;
});

const list = offers.slice(0, MAX_OFFERS);
const out = {
  updatedAt: new Date().toISOString(),
  source: 'marchespublics.gov.ma (via appeldoffres.ma)',
  total: list.length,
  open: list.filter((o) => o.status === 'open' || o.status === 'soon').length,
  offers: list,
};

fs.mkdirSync(OUT_DIR, { recursive: true });
const target = path.join(OUT_DIR, 'marches.json');
fs.writeFileSync(target, JSON.stringify(out), 'utf8');

// Petit manifeste pour les notifications en arrière-plan : le téléphone le lit
// toutes les 15 min sans télécharger les 2 Mo du catalogue complet.
const seen = list.map((o) => o.firstSeenAt).filter(Boolean).sort();
const newestAt = seen.length ? seen[seen.length - 1] : out.updatedAt;
const new24h = list.filter((o) => {
  const t = o.firstSeenAt ? Date.parse(o.firstSeenAt) : 0;
  return t && t >= now - DAY;
}).length;
const meta = {
  updatedAt: out.updatedAt,
  total: out.total,
  open: out.open,
  new24h,
  newestAt,
};
const metaTarget = path.join(OUT_DIR, 'marches-meta.json');
fs.writeFileSync(metaTarget, JSON.stringify(meta), 'utf8');

console.log(JSON.stringify({
  ok: true,
  dir: OUT_DIR,
  total: out.total,
  open: out.open,
  new24h,
  newestAt,
  added,
  enriched,
  legacy: legacy.length,
  bytes: fs.statSync(target).size,
}));
