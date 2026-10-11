// Supabase sync: uploads the exams library (PDFs + index) to Supabase
// Storage so the APK can read & download files straight from the web.
// Needs a PUBLIC bucket (default 'exams'). Works with plain fetch, no deps.
const fs = require('fs');
const path = require('path');

const SUPA_FILE = path.join(__dirname, '..', 'data', 'supabase.json');

const DEFAULTS = {
  url: 'https://wplztrdufmyydtmazxyp.supabase.co',
  key: 'sb_publishable_EJ0ZZC2dG6Wb7j779NvYMA_shw1lrZ6',
  bucket: 'exams',
  enabled: true,
  autoSync: true,
  lastSync: null,
};

function getConfig() {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(SUPA_FILE, 'utf8')) };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveConfig(patch) {
  const cfg = getConfig();
  const next = { ...cfg, ...patch };
  // masked key coming back from UI means "keep existing"
  if (next.key && String(next.key).includes('•')) next.key = cfg.key;
  if (next.url) next.url = String(next.url).replace(/\/$/, '');
  fs.writeFileSync(SUPA_FILE, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function headers(cfg, extra = {}) {
  return { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, ...extra };
}

async function getBucket(cfg) {
  const r = await fetch(`${cfg.url}/storage/v1/bucket/${encodeURIComponent(cfg.bucket)}`, { headers: headers(cfg) });
  const body = await r.text();
  if (r.status === 404 || /Bucket not found|NoSuchBucket/i.test(body)) return null;
  if (!r.ok) throw new Error(`bucket check HTTP ${r.status}: ${body.slice(0, 120)}`);
  return JSON.parse(body);
}

async function createBucket(cfg) {
  const r = await fetch(`${cfg.url}/storage/v1/bucket`, {
    method: 'POST',
    headers: headers(cfg, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ name: cfg.bucket, public: true }),
  });
  const body = await r.text();
  if (!r.ok) throw new Error(`create bucket HTTP ${r.status}: ${body.slice(0, 160)}`);
  return body;
}

async function uploadObject(cfg, storagePath, buffer, contentType) {
  const r = await fetch(`${cfg.url}/storage/v1/object/${encodeURIComponent(cfg.bucket)}/${storagePath}`, {
    method: 'POST',
    headers: headers(cfg, { 'Content-Type': contentType, 'x-upsert': 'true' }),
    body: buffer,
  });
  const body = await r.text();
  if (!r.ok) throw new Error(`upload ${storagePath} HTTP ${r.status}: ${body.slice(0, 160)}`);
  return body;
}

function publicUrl(cfg, storagePath) {
  return `${cfg.url}/storage/v1/object/public/${cfg.bucket}/${storagePath}`;
}

// Uploads every library PDF + the index (with absolute public urls).
// Returns {ok, files, offers, indexUrl} or {ok:false, error, needsSetup}
async function syncExams() {
  const cfg = getConfig();
  if (!cfg.url || !cfg.key) return { ok: false, error: 'Supabase URL/key missing in config' };
  const examsLibrary = require('./examsLibrary');
  const { last5Years } = require('./exams');
  const { load } = require('./db');
  const notify = require('./notify');

  const bucket = await getBucket(cfg).catch((e) => { throw e; });
  if (!bucket) {
    try {
      await createBucket(cfg);
    } catch (e) {
      return { ok: false, needsSetup: true, error: `Bucket '${cfg.bucket}' missing and anon key cannot create it: ${e.message}` };
    }
  }

  const jobs = load().jobs.filter((j) => j.kind === 'concours');
  let files = 0;
  const errors = [];
  const offers = [];
  for (const job of jobs) {
    const list = [];
    for (const year of last5Years()) {
      for (const kind of ['sujet', 'corrige']) {
        try {
          examsLibrary.getOrBuild(job, year, kind);
          const disk = examsLibrary.diskName(job, year, kind);
          const buf = fs.readFileSync(path.join(examsLibrary.LIB_DIR, disk));
          const storagePath = `pdfs/${disk}`;
          await uploadObject(cfg, storagePath, buf, 'application/pdf');
          files++;
          list.push({
            year, kind,
            title: kind === 'corrige' ? `Corrigé ${year}` : `Sujet ${year}`,
            detail: kind === 'corrige' ? 'Corrigé détaillé + méthode' : '10 QCM + 3 cours + 1 cas',
            file: `exams/${disk}`,
            url: publicUrl(cfg, storagePath),
            size: buf.length,
          });
        } catch (e) {
          errors.push(`${job.id}/${year}/${kind}: ${e.message}`);
        }
      }
    }
    offers.push({
      id: job.id, title: job.title, company: job.company || '', specialty: job.specialty || '',
      fonction: job.fonction || '', city: job.city || '', url: job.url || '',
      familyLabel: examsLibrary.FAMILY_LABEL[examsLibrary.familyOf(job)],
      files: list,
    });
  }
  const index = { updatedAt: new Date().toISOString(), years: last5Years(), total: offers.length, offers, supabase: true };
  const indexBuf = Buffer.from(JSON.stringify(index, null, 2), 'utf8');
  await uploadObject(cfg, 'exams-index.json', indexBuf, 'application/json');
  // local APK snapshot also carries the absolute urls (APK prefers url, falls back to file)
  try { fs.writeFileSync(path.join(notify.APK_PUBLIC, 'exams-index.json'), JSON.stringify(index, null, 2), 'utf8'); } catch {}

  const done = { ok: errors.length === 0, files, offers: offers.length, indexUrl: publicUrl(cfg, 'exams-index.json'), errors: errors.slice(0, 5) };
  const c = getConfig();
  c.lastSync = { at: new Date().toISOString(), ...done };
  try { fs.writeFileSync(SUPA_FILE, JSON.stringify(c, null, 2), 'utf8'); } catch {}
  return done;
}

module.exports = { getConfig, saveConfig, getBucket, syncExams, publicUrl };
