// Notifications: WhatsApp (CallMeBot free / Meta Cloud API / webhook)
// + inbox feed (data/notifications.json) polled by the Web UI and the APK,
// + one-click export of snapshots to the APK project.
const fs = require('fs');
const path = require('path');
const { load } = require('./db');
const { daysUntil } = require('./utils');

const NOTIFY_FILE = path.join(__dirname, '..', 'data', 'notify.json');
const INBOX_FILE = path.join(__dirname, '..', 'data', 'notifications.json');
// ../../MarocJobs-APK/app/public from backend/ — override with APK_PUBLIC_DIR (cloud CI)
const APK_PUBLIC = process.env.APK_PUBLIC_DIR
  ? path.resolve(process.env.APK_PUBLIC_DIR)
  : path.resolve(__dirname, '..', '..', '..', 'MarocJobs-APK', 'app', 'public');

const DEFAULTS = {
  phone: '212663369080',
  enabled: true,
  onlyNew: true,
  maxItems: 8,
  autoExportApk: true,
  channels: {
    callmebot: { enabled: false, apikey: '' },
    meta: { enabled: false, token: '', phoneNumberId: '' },
    webhook: { enabled: false, url: '' },
  },
  lastSend: null,
};

function getConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(NOTIFY_FILE, 'utf8'));
    return { ...DEFAULTS, ...raw, channels: { ...DEFAULTS.channels, ...(raw.channels || {}) } };
  } catch {
    return JSON.parse(JSON.stringify(DEFAULTS));
  }
}

function saveConfig(patch) {
  const cfg = getConfig();
  const next = { ...cfg, ...patch };
  if (patch.channels) {
    next.channels = { ...cfg.channels };
    for (const k of Object.keys(patch.channels)) {
      const incoming = { ...(patch.channels[k] || {}) };
      // masked secrets coming back from the UI ('••••ab12') mean "keep existing"
      for (const f of ['apikey', 'token']) {
        if (incoming[f] && String(incoming[f]).includes('•')) delete incoming[f];
      }
      next.channels[k] = { ...(cfg.channels[k] || {}), ...incoming };
    }
  }
  if (next.phone) next.phone = String(next.phone).replace(/[+\s-]/g, '');
  fs.writeFileSync(NOTIFY_FILE, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function readInbox(limit = 30) {
  try {
    const all = JSON.parse(fs.readFileSync(INBOX_FILE, 'utf8'));
    return Array.isArray(all) ? all.slice(0, limit) : [];
  } catch {
    return [];
  }
}

function pushInbox(entry) {
  let all = [];
  try { all = JSON.parse(fs.readFileSync(INBOX_FILE, 'utf8')) || []; } catch {}
  all.unshift({ id: `n${Date.now()}`, at: new Date().toISOString(), ...entry });
  try { fs.writeFileSync(INBOX_FILE, JSON.stringify(all.slice(0, 50), null, 2), 'utf8'); } catch {}
  return all[0];
}

// ---- sending channels ----
async function sendCallMeBot(phone, text, apikey) {
  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(apikey)}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    const body = await r.text();
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}: ${body.slice(0, 120)}` };
    if (/ERROR|not authorized|not activated/i.test(body)) return { ok: false, error: body.slice(0, 160) };
    return { ok: true, info: body.slice(0, 120) };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    clearTimeout(t);
  }
}

async function sendMeta(phone, text, { token, phoneNumberId }) {
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: phone, type: 'text', text: { body: text } }),
    });
    const body = await r.text();
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}: ${body.slice(0, 160)}` };
    return { ok: true, info: body.slice(0, 120) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function sendWebhook(phone, text, url) {
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, text, at: new Date().toISOString(), from: 'maroc-jobs-hub' }),
    });
    const body = await r.text();
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}: ${body.slice(0, 160)}` };
    return { ok: true, info: body.slice(0, 120) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function sendWhatsApp(text, cfg = getConfig()) {
  const results = [];
  if (!cfg.enabled) return [{ channel: 'none', ok: false, error: 'notifications disabled' }];
  const { phone, channels } = cfg;
  if (channels.callmebot && channels.callmebot.enabled) {
    if (!channels.callmebot.apikey) results.push({ channel: 'callmebot', ok: false, error: 'apikey manquant — activez CallMeBot puis collez la clé' });
    else results.push({ channel: 'callmebot', ...(await sendCallMeBot(phone, text, channels.callmebot.apikey)) });
  }
  if (channels.meta && channels.meta.enabled) {
    if (!channels.meta.token || !channels.meta.phoneNumberId) results.push({ channel: 'meta', ok: false, error: 'token ou phoneNumberId manquant' });
    else results.push({ channel: 'meta', ...(await sendMeta(phone, text, channels.meta)) });
  }
  if (channels.webhook && channels.webhook.enabled) {
    if (!channels.webhook.url) results.push({ channel: 'webhook', ok: false, error: 'url manquante' });
    else results.push({ channel: 'webhook', ...(await sendWebhook(phone, text, channels.webhook.url)) });
  }
  if (!results.length) return [{ channel: 'none', ok: false, error: 'aucun canal activé — activez CallMeBot (gratuit) dans la config' }];
  return results;
}

// ---- digest message (French, compact for WhatsApp) ----
function buildDigest({ newJobs = [], trigger = 'cron' } = {}) {
  const all = load().jobs;
  const urgent = all
    .filter((j) => j.deadline && daysUntil(j.deadline) !== null && daysUntil(j.deadline) >= 0 && daysUntil(j.deadline) <= 3)
    .sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''))
    .slice(0, 5);
  const concours = newJobs.filter((j) => j.kind === 'concours').length;
  const lines = [`🇲🇦 Maroc Jobs Hub — ${newJobs.length} nouveauté(s) (${trigger})`];
  const top = newJobs.slice(0, 8);
  for (const j of top) {
    const tag = j.kind === 'concours' ? '🏛️' : '💼';
    lines.push(`${tag} ${j.title} — ${j.company || ''} (${j.city || ''})${j.deadline ? ` ⏰${j.deadline}` : ''}`);
  }
  if (concours) lines.push(`🏛️ dont ${concours} concours État (dossiers d'entraînement dispo dans l'onglet Exams)`);
  if (urgent.length) {
    lines.push('⏰ Deadlines ≤ 3j :');
    for (const j of urgent) lines.push(`- ${j.title} (${j.deadline})`);
  }
  lines.push(`📊 Total suivi : ${all.length} offres. Ouvrez l'app/onglet Offres pour le détail.`);
  return lines.join('\n').slice(0, 1500);
}

async function notifyRun({ newJobs = [], trigger = 'cron' } = {}) {
  const cfg = getConfig();
  const entry = {
    kind: newJobs.length ? 'nouvelles-offres' : 'veille',
    title: newJobs.length ? `+${newJobs.length} nouvelle(s) offre(s)` : 'Veille sans nouveauté',
    body: buildDigest({ newJobs, trigger }),
    counts: { new: newJobs.length, concours: newJobs.filter((j) => j.kind === 'concours').length, total: load().jobs.length },
    trigger,
  };
  pushInbox(entry);
  let sent = [{ channel: 'none', ok: false, error: 'skipped' }];
  if (cfg.enabled && (!cfg.onlyNew || newJobs.length > 0)) {
    sent = await sendWhatsApp(entry.body, cfg);
    const okAny = sent.some((r) => r.ok);
    cfg.lastSend = { at: new Date().toISOString(), ok: okAny, results: sent.map((r) => ({ channel: r.channel, ok: r.ok, error: r.error || null })) };
    try { fs.writeFileSync(NOTIFY_FILE, JSON.stringify(cfg, null, 2), 'utf8'); } catch {}
  }
  return { entry, sent };
}

// ---- APK export (snapshots the phone app reads on refresh) ----
function apkPayload() {
  const db = load();
  // full fields — the APK presents exactly the same data as the web app
  const jobs = db.jobs.map((j) => ({
    id: j.id, source: j.source, sourceLabel: j.sourceLabel, title: j.title,
    company: j.company, city: j.city, contract: j.contract, kind: j.kind,
    category: j.category || 'autre',
    sector: j.sector, fonction: j.fonction, occupation: j.occupation, specialty: j.specialty,
    diploma: j.diploma, experience: j.experience,
    postsCount: j.postsCount, description: j.description, requirements: j.requirements || [],
    publishedDate: j.publishedDate, deadline: j.deadline, concoursDate: j.concoursDate, url: j.url,
  }));
  return { updatedAt: db.updatedAt, total: jobs.length, jobs };
}

// Static exams bundle for the APK: index + PDF files (direct web download).
// Same Sujet + Corrigé content as the web app.
function exportExams() {
  const examsLibrary = require('./examsLibrary');
  const { last5Years } = require('./exams');
  if (!fs.existsSync(APK_PUBLIC)) return { ok: false, error: `dossier APK introuvable (${APK_PUBLIC})` };
  const dir = path.join(APK_PUBLIC, 'exams');
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  fs.mkdirSync(dir, { recursive: true });
  const jobs = load().jobs.filter((j) => j.kind === 'concours');
  let files = 0;
  const offers = jobs.map((job) => {
    const list = [];
    for (const year of last5Years()) {
      for (const kind of ['sujet', 'corrige']) {
        examsLibrary.getOrBuild(job, year, kind);
        const disk = examsLibrary.diskName(job, year, kind);
        const src = path.join(examsLibrary.LIB_DIR, disk);
        try {
          fs.copyFileSync(src, path.join(dir, disk));
          const size = fs.statSync(src).size;
          files++;
          list.push({
            year, kind,
            title: kind === 'corrige' ? `Corrigé ${year}` : `Sujet ${year}`,
            detail: kind === 'corrige' ? 'Corrigé détaillé + méthode' : '10 QCM + 3 cours + 1 cas',
            file: `exams/${disk}`,
            size,
          });
        } catch {}
      }
    }
    return {
      id: job.id, title: job.title, company: job.company || '', specialty: job.specialty || '',
      fonction: job.fonction || '', city: job.city || '', url: job.url || '',
      familyLabel: examsLibrary.FAMILY_LABEL[examsLibrary.familyOf(job)],
      files: list,
    };
  });
  const index = { updatedAt: new Date().toISOString(), years: last5Years(), total: offers.length, offers };
  fs.writeFileSync(path.join(APK_PUBLIC, 'exams-index.json'), JSON.stringify(index, null, 2), 'utf8');
  return { ok: true, offers: offers.length, files };
}

function exportApk() {
  if (!fs.existsSync(APK_PUBLIC)) return { ok: false, error: `dossier APK introuvable (${APK_PUBLIC})` };
  const payload = apkPayload();

  // Détecte les offres réellement nouvelles par rapport au dernier snapshot
  // public, puis ajoute une alerte que l'APK lit en arrière-plan.
  try {
    const oldPath = path.join(APK_PUBLIC, 'jobs.json');
    if (fs.existsSync(oldPath)) {
      const old = JSON.parse(fs.readFileSync(oldPath, 'utf8'));
      const oldJobs = Array.isArray(old) ? old : (old.jobs || []);
      const oldIds = new Set(oldJobs.map((j) => j && j.id).filter(Boolean));
      const freshJobs = oldIds.size ? payload.jobs.filter((j) => !oldIds.has(j.id)) : [];
      if (freshJobs.length) {
        pushInbox({
          kind: 'nouvelles-offres',
          title: `+${freshJobs.length} nouvelle(s) offre(s)`,
          body: buildDigest({ newJobs: freshJobs, trigger: 'cloud' }),
          counts: {
            new: freshJobs.length,
            concours: freshJobs.filter((j) => j.kind === 'concours').length,
            total: payload.total,
          },
          trigger: 'cloud',
        });
      }
    }
  } catch {}

  const inbox = readInbox(30);
  const alerts = {
    updatedAt: new Date().toISOString(),
    phone: getConfig().phone,
    total: payload.total,
    alerts: inbox.map((n) => ({ id: n.id, at: n.at, title: n.title, body: n.body, counts: n.counts, kind: n.kind })),
  };
  fs.writeFileSync(path.join(APK_PUBLIC, 'jobs.json'), JSON.stringify(payload, null, 2), 'utf8');
  fs.writeFileSync(path.join(APK_PUBLIC, 'alerts.json'), JSON.stringify(alerts, null, 2), 'utf8');
  const ex = exportExams();
  return { ok: true, dir: APK_PUBLIC, jobs: payload.total, alerts: alerts.alerts.length, exams: ex.ok ? { offers: ex.offers, files: ex.files } : { error: ex.error } };
}

module.exports = { getConfig, saveConfig, readInbox, pushInbox, sendWhatsApp, buildDigest, notifyRun, exportApk, exportExams, apkPayload, APK_PUBLIC };
