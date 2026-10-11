const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const { load } = require('./db');
const { clean, fold, fetchHtml } = require('./utils');

const CACHE_FILE = path.join(__dirname, '..', 'data', 'exams.json');

function last5Years() {
  const y = new Date().getFullYear();
  return [y - 4, y - 3, y - 2, y - 1, y];
}

function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveCache(c) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(c, null, 2), 'utf8');
  } catch {}
}

// ---- smart keyword extraction from a concours offer ----
const STOP = new Set([
  'concours', 'recrutement', 'grade', 'echelle', 'échelle', 'eme', 'ème', '1er', '2e', '3e',
  '1ere', 'postes', 'poste', 'h/f', 'f/h', 'maroc', 'public', 'etat', 'état', 'avec', 'pour',
  'des', 'les', 'dans', 'sur', 'ès', 'aux', 'une', 'un', 'de', 'du', 'la', 'le', 'et', 'en'
]);

function keywordsOf(job) {
  const raw = [job.fonction, job.specialty, job.title].filter(Boolean).join(' ');
  // remove "Concours —" prefix, parenthesized bits, grade/echelle mentions kept minimal
  let t = String(raw)
    .replace(/^concours\s*[—–-]\s*/i, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[—–|/\\]/g, ' ')
    .replace(/\b\d+\s*postes?\b/gi, ' ')
    .replace(/\b\d{4}\b/g, ' ');
  const words = t.split(/\s+/)
    .map((w) => w.replace(/[^A-Za-zÀ-ÿ0-9+.#]/g, ''))
    .filter((w) => w && w.length > 1 && !STOP.has(fold(w)));
  // keep order, dedupe, max 6
  const seen = new Set();
  const out = [];
  for (const w of words) {
    const k = fold(w);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(w);
    if (out.length >= 6) break;
  }
  return { keywords: out, keywordStr: out.join(' ') };
}

function orgShort(company) {
  if (!company) return '';
  let c = clean(String(company));
  // shorten common ministries / universities
  c = c
    .replace(/Ministère de /i, 'Min. ')
    .replace(/Université /i, 'Univ. ')
    .replace(/Société Nationale des Transports et de la Logistique/i, 'SNTL');
  // keep first 5 words max
  const parts = c.split(/\s+/).slice(0, 5).join(' ');
  return parts;
}

function buildPack(job) {
  const years = last5Years();
  const { keywords, keywordStr } = keywordsOf(job);
  const org = orgShort(job.company || '');
  const base = [org, keywordStr].filter(Boolean).join(' ').trim() || clean(job.title.replace(/^concours\s*[—–-]\s*/i, '').slice(0, 60));
  const packs = years.map((year) => {
    const qMain = `concours ${base} épreuve PDF ${year} Maroc`.replace(/\s+/g, ' ').trim();
    const qAlt = `concours ${base} sujet corrigé ${year}`.replace(/\s+/g, ' ').trim();
    const eq = encodeURIComponent(qMain);
    const eqAlt = encodeURIComponent(qAlt);
    const orgQ = encodeURIComponent(`site:emploi-public.ma concours ${base} ${year}`);
    return {
      year,
      query: qMain,
      queryAlt: qAlt,
      keywords,
      searchUrls: {
        google: `https://www.google.com/search?q=${eq}`,
        googlePdf: `https://www.google.com/search?q=${eq}+filetype:pdf`,
        corrige: `https://www.google.com/search?q=${eqAlt}`,
        bing: `https://www.bing.com/search?q=${eq}`,
        duckduckgo: `https://duckduckgo.com/?q=${eq}`,
        emploiPublic: `https://www.google.com/search?q=${orgQ}`,
      },
      archiveHint: `Sur emploi-public.ma : chercher « ${base} » puis filtrer l'année ${year} — avis + pièces jointes (sujets/épreuves PDF).`,
      files: [], // real PDFs (filled by live discovery)
      links: [], // web pages / archives (open in browser, not downloadable as PDF)
    };
  });
  return {
    offerId: job.id,
    offerTitle: job.title,
    company: job.company || '',
    specialty: job.specialty || '',
    fonction: job.fonction || '',
    city: job.city || '',
    url: job.url || '',
    base,
    keywords,
    years,
    packs,
  };
}

// ---- live discovery: Bing RSS + DuckDuckGo HTML, best-effort ----
// Returns { files: [real PDFs], links: [web pages] } — never mix them.
async function discoverForQuery(query, limit = 6) {
  const pdfs = [];
  const pages = [];
  const seen = new Set();
  const isPdfUrl = (url, title) =>
    /\.pdf(\?|#|$)/i.test(url || '') || (/pdf/i.test(title || '') && /\.pdf|download|telecharg/i.test(url || ''));
  const push = (title, url, source) => {
    if (!url || !/^https?:\/\//i.test(url)) return;
    if (seen.has(url)) return;
    // skip search-engine internals
    if (/bing\.com|google\.com\/url|duckduckgo\.com\/y\.js|g\.doubleclick/i.test(url)) return;
    // skip search-result pages themselves
    if (/google\.com\/search|bing\.com\/search|duckduckgo\.com\/\?q/.test(url)) return;
    seen.add(url);
    const item = {
      title: clean(title || url).slice(0, 140) || url,
      url,
      source,
      isPdf: isPdfUrl(url, title),
      kind: isPdfUrl(url, title) ? 'pdf' : 'page',
      // correction bucket: title hints at corrigé/solution (shown with the exam if it exists)
      isCorrection: /corrig|correction|solution|soluce|answer|bareme|barème/i.test(title || ''),
    };
    if (item.kind === 'pdf') {
      if (pdfs.length < limit) pdfs.push(item);
    } else {
      if (pages.length < limit) pages.push(item);
    }
  };

  async function bingPass(q) {
    try {
      const rssUrl = `https://www.bing.com/search?format=rss&q=${encodeURIComponent(q)}`;
      const xml = await fetchHtml(rssUrl, { timeout: 12000 });
      const $ = cheerio.load(xml, { xmlMode: true });
      $('item').each((_, el) => {
        if (pdfs.length + pages.length >= limit * 2) return false;
        const title = $(el).find('title').text();
        let link = $(el).find('link').text();
        if (!link) {
          const desc = $(el).find('description').text();
          const m = desc && desc.match(/https?:\/\/[^"'\s<>]+/);
          if (m) link = m[0];
        }
        if (link) push(title, link.trim(), 'Bing');
      });
    } catch {}
  }

  // Pass A: biased to PDFs. Pass B: general pages (archives, avis).
  await bingPass(query + ' filetype:pdf');
  if (pdfs.length + pages.length < 4) {
    await bingPass(query);
  }

  // DuckDuckGo fallback only if almost nothing found
  if (pdfs.length + pages.length < 3) {
    try {
      const ddg = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const html = await fetchHtml(ddg, { timeout: 12000 });
      const $ = cheerio.load(html);
      $('a.result__a, a.result-link').each((_, a) => {
        if (pdfs.length + pages.length >= limit * 2) return false;
        const href = $(a).attr('href');
        const title = $(a).text();
        if (!href) return;
        let real = href;
        const m = href.match(/uddg=([^&]+)/);
        if (m) {
          try { real = decodeURIComponent(m[1]); } catch {}
        }
        push(title, real, 'DuckDuckGo');
      });
    } catch {}
  }
  return { files: pdfs.slice(0, limit), links: pages.slice(0, limit) };
}

const EXAMS_CACHE_V = 2;

async function searchOffer(job, { refresh = false, perYear = 5 } = {}) {
  const cache = loadCache();
  const hit = cache[job.id];
  if (!refresh && hit && hit.v === EXAMS_CACHE_V && hit.packs) {
    return { ...hit, cached: true };
  }
  const pack = buildPack(job);
  // live discovery per year, sequential-ish in small batches to stay fast
  const YEARS_BATCH = 2;
  for (let i = 0; i < pack.packs.length; i += YEARS_BATCH) {
    const slice = pack.packs.slice(i, i + YEARS_BATCH);
    await Promise.all(slice.map(async (p) => {
      try {
        const found = await discoverForQuery(p.query, perYear);
        p.files = found.files;
        p.links = found.links;
      } catch {
        p.files = [];
        p.links = [];
      }
    }));
  }
  const record = { ...pack, v: EXAMS_CACHE_V, updatedAt: new Date().toISOString(), cached: false };
  cache[job.id] = record;
  saveCache(cache);
  return record;
}

// HEAD/GET probe so the UI can show real type + size before downloading.
async function probeUrl(target) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    let r;
    try {
      r = await fetch(target, { method: 'HEAD', signal: ctrl.signal, redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36' } });
    } catch {
      r = null;
    }
    let ct = r && r.headers ? (r.headers.get('content-type') || '') : '';
    let size = r && r.headers ? r.headers.get('content-length') : null;
    let finalUrl = (r && r.url) || target;
    // Some servers reject HEAD — fall back to a ranged GET for headers only.
    if (!r || !r.ok) {
      const c2 = new AbortController();
      const t2 = setTimeout(() => c2.abort(), 15000);
      try {
        const g = await fetch(target, { signal: c2.signal, redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36', Range: 'bytes=0-0' } });
        ct = g.headers.get('content-type') || ct;
        size = g.headers.get('content-length') || size;
        finalUrl = g.url || finalUrl;
        try { await g.arrayBuffer(); } catch {}
      } catch {} finally { clearTimeout(t2); }
    }
    const isPdf = /pdf/i.test(ct) || /\.pdf(\?|#|$)/i.test(finalUrl);
    return { url: target, finalUrl, contentType: ct || 'unknown', size: size ? parseInt(size, 10) : null, isPdf, kind: isPdf ? 'pdf' : (/html/i.test(ct) ? 'page' : 'file') };
  } finally {
    clearTimeout(t);
  }
}

function concoursOffers(filter = '') {
  let jobs = load().jobs.filter((j) => j.kind === 'concours');
  if (filter) {
    const s = fold(filter);
    jobs = jobs.filter((j) => fold([j.title, j.company, j.specialty, j.fonction, j.city].join(' ')).includes(s));
  }
  jobs = [...jobs].sort((a, b) => (b.publishedDate || '').localeCompare(a.publishedDate || ''));
  return jobs.map((j) => {
    const { keywords, keywordStr } = keywordsOf(j);
    return {
      id: j.id, title: j.title, company: j.company || '', specialty: j.specialty || '',
      fonction: j.fonction || '', city: j.city || '', postsCount: j.postsCount || 1,
      publishedDate: j.publishedDate || '', deadline: j.deadline || '', concoursDate: j.concoursDate || '',
      url: j.url || '', keywords, keywordStr,
    };
  });
}

module.exports = { last5Years, buildPack, searchOffer, concoursOffers, keywordsOf, loadCache, probeUrl, discoverForQuery };
