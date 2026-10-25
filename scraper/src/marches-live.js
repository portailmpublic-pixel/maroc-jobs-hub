// Live Marchés Publics collector.
//
// Source: https://appeldoffres.ma/marches (public listing, mirrors PMMP + BDC
// consultations, with a direct link to the official marchespublics.gov.ma page).
// The official portal itself returns HTTP 503 to datacenter / non-Moroccan IPs,
// so we read this public mirror and keep the official link on every offer.
//
// Output: scraper/data/marches-live.json (rolling archive, deduplicated).
// The export step (export-marches.js) merges this archive with the historical
// manually-imported offers and writes app/public/marches.json.

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const BASE = 'https://appeldoffres.ma';
const DATA_DIR = path.join(__dirname, '..', 'data');
const ARCHIVE = path.join(DATA_DIR, 'marches-live.json');
const MAX_PAGES = Number(process.env.MARCHES_MAX_PAGES || 200);
const CONCURRENCY = Number(process.env.MARCHES_CONCURRENCY || 4);
const KEEP_CLOSED_DAYS = Number(process.env.MARCHES_KEEP_CLOSED_DAYS || 60);
const UA = 'ASSOULI-AUTOX/1.4 (+https://github.com/portailmpublic-pixel/maroc-jobs-hub)';

// Same taxonomy as the APK (app/src/App.jsx -> MKEYWORDS). Keep in sync.
const KEYWORDS = [
  { id: 'topographie', label: 'Topographie', terms: ['topograph', 'geometre', 'cadastre', 'leve'] },
  { id: 'etudes', label: 'Études', terms: ['etude', 'ingenierie', 'conception', 'diagnostic', 'schema directeur'] },
  { id: 'travaux', label: 'Travaux', terms: ['travaux', 'travail', 'chantier', 'realisation', 'amenagement'], sectors: ['btp / travaux'] },
  { id: 'fournitures', label: 'Fournitures', terms: ['fourniture', 'achat', 'acquisition', 'livraison', 'materiel', 'equipement'], sectors: ['fournitures'] },
  { id: 'services', label: 'Services', terms: ['service', 'prestation', 'location', 'organisation'], sectors: ['services generaux'] },
  { id: 'batiment', label: 'Bâtiment', terms: ['batiment', 'construction', 'genie civil', 'btp', 'amenagement', 'agencement'], sectors: ['btp / travaux'] },
  { id: 'routes', label: 'Routes', terms: ['route', 'voirie', 'piste', 'autoroute', 'chaussee', 'ouvrage d art', 'signalisation'] },
  { id: 'eau', label: 'Eau', terms: ['eau', 'assainissement', 'hydraulique', 'forage', 'adduction', 'irrigation', 'onee', 'abhm', 'abhs', 'abhb', 'abhd', 'epuration'] },
  { id: 'informatique', label: 'Informatique', terms: ['informatique', 'logiciel', 'systeme', 'digital', 'numerique', 'reseau', 'serveur', 'ordinateur', 'licence', 'cyber', 'messagerie', 'workspace'], sectors: ['informatique & digital'] },
  { id: 'formation', label: 'Formation', terms: ['formation', 'seminaire', 'atelier', 'coaching'], sectors: ['formation'] },
  { id: 'maintenance', label: 'Maintenance', terms: ['maintenance', 'entretien', 'reparation', 'depannage'], sectors: ['maintenance'] },
  { id: 'audit', label: 'Audit', terms: ['audit', 'expertise', 'controle', 'verification', 'certification'] },
  { id: 'assistance', label: 'Assistance', terms: ['assistance', 'maitrise', 'conseil', 'accompagnement', 'appui'], sectors: ['etudes & conseil'] },
  { id: 'construction', label: 'Construction', terms: ['construction', 'batiment', 'genie civil', 'travaux'], sectors: ['btp / travaux'] },
  { id: 'electricite', label: 'Électricité', terms: ['electricite', 'electrique', 'eclairage', 'solaire', 'photovoltaique', 'poteaux', 'cablage'], sectors: ['electricite'] },
  { id: 'plomberie', label: 'Plomberie', terms: ['plomberie', 'fluides', 'sanitaire', 'canalisation', 'pompe', 'motopompe'], sectors: ['plomberie & fluides'] },
  { id: 'sante', label: 'Santé', terms: ['sante', 'medical', 'medicament', 'hopital', 'pharmaceutique', 'irm', 'scanner', 'ambulance'], sectors: ['sante & medical'] },
  { id: 'transport', label: 'Transport', terms: ['transport', 'logistique', 'vehicule', 'engins', 'carburant', 'fourgon', 'camion'], sectors: ['transport & logistique'] },
  { id: 'securite', label: 'Sécurité', terms: ['securite', 'gardiennage', 'surveillance', 'alarme', 'incendie'], sectors: ['securite & gardiennage'] },
  { id: 'nettoyage', label: 'Nettoyage', terms: ['nettoyage', 'proprete', 'dechets', 'espaces verts', 'jardinage'], sectors: ['nettoyage'] },
  { id: 'mobilier', label: 'Mobilier', terms: ['mobilier', 'ameublement', 'meuble'], sectors: ['mobilier'] },
  { id: 'communication', label: 'Communication', terms: ['impression', 'communication', 'publicite', 'evenementiel', 'reception', 'signaletique'], sectors: ['impression & communication'] },
  { id: 'hotellerie', label: 'Hôtellerie', terms: ['hotel', 'restauration', 'traiteur', 'hebergement'], sectors: ['hotellerie & restauration'] },
];

const MONTHS = {
  janv: 0, jan: 0, fevr: 1, fev: 1, mars: 2, avr: 3, mai: 4, juin: 5,
  juil: 6, aout: 7, aou: 7, sept: 8, sep: 8, oct: 9, nov: 10, dec: 11,
};

function norm(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function clean(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function absolute(href) {
  if (!href) return '';
  if (/^https?:\/\//i.test(href)) return href;
  return BASE + (href.startsWith('/') ? href : '/' + href);
}

function sourceId(url) {
  const s = String(url || '');
  const m = s.match(/refConsultation=(\d+)/i)
    || s.match(/\/show\/(\d+)/i)
    || s.match(/\/(\d{4,})(?:\/)?(?:[?#]|$)/);
  if (m) return m[1];
  const slug = s.split('?')[0].split('/').filter(Boolean).pop() || s;
  return slug.slice(-80);
}

function parseFrenchDate(raw) {
  const s = clean(raw);
  const m = s.match(/(\d{1,2})\s+([a-zéûôà]+)\.?\s+(\d{4})(?:\s*[·•]\s*(\d{1,2}):(\d{2}))?/i);
  if (!m) return null;
  const day = Number(m[1]);
  const key = norm(m[2]).slice(0, 4);
  const month = MONTHS[key] ?? MONTHS[norm(m[2])];
  const year = Number(m[3]);
  if (month === undefined) return null;
  const hasTime = m[4] !== undefined;
  const hh = hasTime ? Number(m[4]) : 23;
  const mm = hasTime ? Number(m[5]) : 59;
  const d = new Date(year, month, day, hh, mm, 0, 0);
  if (isNaN(d)) return null;
  const pad = (n) => String(n).padStart(2, '0');
  const iso = `${year}-${pad(month + 1)}-${pad(day)}T${pad(hh)}:${pad(mm)}:00`;
  return {
    iso,
    dateOnly: !hasTime,
    display: `${pad(day)}/${pad(month + 1)}/${year}${hasTime ? ' ' + pad(hh) + ':' + pad(mm) : ''}`,
  };
}

function tagsFor(title, secteur, procedure) {
  const hay = norm([title, secteur, procedure].join(' '));
  const sector = norm(secteur);
  const tokens = hay.split(' ').filter(Boolean);
  const tags = [];
  for (const kw of KEYWORDS) {
    let hit = (kw.sectors || []).includes(sector);
    if (!hit) {
      hit = kw.terms.some((term) => {
        const t = norm(term);
        if (!t) return false;
        if (t.includes(' ')) return hay.includes(t);
        if (t.length <= 3) return tokens.includes(t);
        return tokens.some((tok) => tok.startsWith(t));
      });
    }
    if (hit) tags.push(kw.id);
  }
  return tags;
}

function parseCard($, el) {
  const c = $(el);
  const link = c.find('a[href^="/marche/"]').first();
  const href = link.attr('href') || '';
  const title = clean(c.find('.dc-title').attr('title') || c.find('.dc-title').text());
  const ref = clean(c.find('.dc-ref').text());
  const secteur = clean(c.find('.dc-type').text());
  const procedure = clean(c.find('.dc-procedure').text());
  const organisme = clean(c.find('.dc-buyer span').last().text() || c.find('.dc-buyer').text());
  const ville = clean(c.find('.dc-place').text()).replace(/^\s*[^\p{L}\p{N}]+/u, '');
  const sourceEl = c.find('.dc-source').first();
  const sourceUrl = sourceEl.attr('href') || '';
  const sourceName = clean(sourceEl.text()).replace(/^Source\s*/i, '');
  const qc = clean(c.find('.dc-qc-badge').text());
  const estimation = clean(c.find('.dc-money-estimate').text());
  const caution = clean(c.find('.dc-money-caution').text());
  const closeRaw = clean(c.find('.dc-close-value').text()).replace(/\s*J-\d+\s*$/, '');
  const deadline = parseFrenchDate(closeRaw);
  const id = 'ad-' + (sourceId(sourceUrl) || sourceId(href));
  if (!title || !href) return null;

  const now = new Date().toISOString();
  const offer = {
    id,
    ref,
    organisme,
    sousOrganisme: '',
    objet: title,
    ville,
    caution,
    estimation,
    dateLimite: deadline ? deadline.display : closeRaw,
    dateLimiteIso: deadline ? deadline.iso : '',
    dateOnly: deadline ? deadline.dateOnly : true,
    typeProcedure: [secteur, procedure].filter(Boolean).join(' | '),
    categorie: secteur,
    modePassation: procedure,
    typeAnnonce: sourceName,
    lieuOuverture: ville,
    dceUrl: sourceUrl,
    portalHref: sourceUrl,
    detailUrl: absolute(href),
    dceSize: sourceName,
    source: 'appeldoffres.ma',
    qc,
    seenAt: now,
    firstSeenAt: now,
    lastSeenAt: now,
    keywords: tagsFor(title, secteur, procedure),
  };
  if (estimation) offer.estimation = estimation;
  if (caution) offer.caution = caution;
  return offer;
}

async function fetchText(url, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, {
        headers: {
          'User-Agent': UA,
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'fr-FR,fr;q=0.9',
          'Cache-Control': 'no-cache',
        },
        signal: AbortSignal.timeout(30000),
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.text();
    } catch (e) {
      lastErr = e;
      await new Promise((res) => setTimeout(res, 800 * (i + 1)));
    }
  }
  throw lastErr;
}

function totalFrom(html) {
  const text = clean(html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' '));
  const m = text.match(/AO ouverts\s*([\d][\d\s\u00a0\u202f]*)/i)
    || text.match(/([\d][\d\s\u00a0\u202f]*)\s*appels d[’']offres ouverts/i);
  if (!m) return 0;
  return Number(m[1].replace(/[^\d]/g, '')) || 0;
}

function pagesOf(total) {
  return Math.max(1, Math.ceil(total / 12));
}

async function run() {
  const started = Date.now();
  console.log('Marchés live — start');
  const firstHtml = await fetchText(BASE + '/marches');
  const $first = cheerio.load(firstHtml);
  const total = totalFrom(firstHtml);
  const pages = Math.min(MAX_PAGES, pagesOf(total));
  console.log(`source total=${total || '?'} pages=${pages}`);

  const byId = new Map();
  const addPage = (html, page) => {
    const $ = cheerio.load(html);
    let n = 0;
    $('article').each((_, el) => {
      const offer = parseCard($, el);
      if (offer && !byId.has(offer.id)) {
        byId.set(offer.id, offer);
        n += 1;
      }
    });
    if (page % 20 === 0 || page === 1) console.log(`page ${page}/${pages}: +${n} (total ${byId.size})`);
    return n;
  };

  addPage(firstHtml, 1);
  const queue = [];
  for (let p = 2; p <= pages; p++) queue.push(p);

  let failed = 0;
  async function worker() {
    while (queue.length) {
      const page = queue.shift();
      try {
        const html = await fetchText(BASE + '/marches?page=' + page);
        if (!addPage(html, page)) {
          // An empty page can be the real end of the list.
          console.log(`page ${page}: no cards`);
        }
      } catch (e) {
        failed += 1;
        console.warn(`page ${page} failed: ${e.message}`);
      }
      await new Promise((res) => setTimeout(res, 120));
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  if (!byId.size) throw new Error('no offers parsed');
  if (failed > pages * 0.25) throw new Error(`too many failed pages (${failed}/${pages})`);

  // Merge with the rolling archive: keep firstSeenAt, keep recently closed offers.
  // Also heals ids written by the first version (query-string ids).
  let previous = [];
  try {
    const prev = JSON.parse(fs.readFileSync(ARCHIVE, 'utf8'));
    previous = Array.isArray(prev) ? prev : (prev.offers || []);
  } catch {}
  const previousById = new Map();
  for (const o of previous) {
    if (!o) continue;
    const sid = sourceId(o.portalHref) || sourceId(o.dceUrl);
    if (sid) o.id = 'ad-' + sid;
    if (!o.id || /[=?#&]/.test(o.id)) continue;
    previousById.set(o.id, o);
  }
  previous = [...previousById.values()];
  const merged = [];
  const now = Date.now();
  const cutoff = now - KEEP_CLOSED_DAYS * 86400000;
  const seen = new Set();

  for (const offer of byId.values()) {
    const old = previousById.get(offer.id);
    if (old) {
      offer.firstSeenAt = old.firstSeenAt || old.seenAt || offer.firstSeenAt;
      if (!offer.dateLimiteIso) offer.dateLimiteIso = old.dateLimiteIso || '';
      if (!offer.keywords.length) offer.keywords = old.keywords || [];
    }
    const end = offer.dateLimiteIso ? new Date(offer.dateLimiteIso).getTime() : now;
    if (end + 86400000 < cutoff && !previousById.has(offer.id)) continue;
    merged.push(offer);
    seen.add(offer.id);
  }
  for (const old of previous) {
    if (seen.has(old.id)) continue;
    const end = old.dateLimiteIso ? new Date(old.dateLimiteIso).getTime() : 0;
    if (end + 86400000 < cutoff) continue;
    merged.push(old);
    seen.add(old.id);
  }

  merged.sort((a, b) => {
    const da = a.dateLimiteIso || '';
    const db = b.dateLimiteIso || '';
    return da.localeCompare(db);
  });

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const payload = {
    updatedAt: new Date().toISOString(),
    source: 'appeldoffres.ma (PMMP + BDC)',
    total,
    scraped: byId.size,
    failedPages: failed,
    offers: merged,
  };
  fs.writeFileSync(ARCHIVE, JSON.stringify(payload), 'utf8');
  console.log(`done: scraped=${byId.size} archived=${merged.length} failed=${failed} in ${Math.round((Date.now() - started) / 1000)}s`);
}

run().catch((e) => {
  console.error('Marchés live FAILED:', e.message);
  process.exitCode = 1;
});
