const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const parser = require('cron-parser');
const { runAll } = require('./scrapers');
const { upsert, load } = require('./db');

const RUNS_FILE = path.join(__dirname, '..', 'data', 'runs.json');
const SCHED_FILE = path.join(__dirname, '..', 'data', 'schedule.json');

const DEFAULTS = { cron: '0 6 * * *', tz: 'Africa/Casablanca', enabled: true };

function getConfig() {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(SCHED_FILE, 'utf8')) };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveConfig(cfg) {
  fs.writeFileSync(SCHED_FILE, JSON.stringify(cfg, null, 2), 'utf8');
  return cfg;
}

function nextRun(cfg) {
  try {
    return parser.parseExpression(cfg.cron, { tz: cfg.tz }).next().toISOString();
  } catch {
    return null;
  }
}

function readRuns() {
  try {
    return JSON.parse(fs.readFileSync(RUNS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function logRun(entry) {
  const runs = readRuns();
  runs.unshift({ at: new Date().toISOString(), ...entry });
  fs.writeFileSync(RUNS_FILE, JSON.stringify(runs.slice(0, 30), null, 2), 'utf8');
}

async function runOnce(trigger) {
  const started = Date.now();
  console.log(`[schedule:${trigger}] scraping all sources...`);
  let results = [];
  try {
    results = await runAll();
  } catch (e) {
    const fail = { trigger, ok: 0, failed: ['scheduler:' + e.message], added: 0, updated: 0, purged: 0, total: load().jobs.length, ms: Date.now() - started };
    logRun(fail);
    console.log(`[schedule:${trigger}] FAILED ${e.message}`);
    return fail;
  }
  let jobs = [];
  for (const r of results) jobs = jobs.concat(r.jobs);
  const beforeIds = new Set(load().jobs.map((j) => j.id));
  const store = upsert(jobs);
  const newJobs = jobs.filter((j) => !beforeIds.has(j.id));
  const summary = {
    trigger,
    ok: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).map((r) => r.source),
    added: store.added,
    updated: store.updated,
    purged: store.purged || 0,
    total: store.total,
    ms: Date.now() - started
  };
  logRun(summary);
  console.log(`[schedule:${trigger}] done +${store.added} ~${store.updated} x${store.purged || 0} total=${store.total}`);
  // Alerts: WhatsApp digest + inbox (APK) + auto-export snapshots — never breaks the run
  try {
    const notify = require('./notify');
    notify.notifyRun({ newJobs, trigger }).then((n) => {
      console.log(`[notify] inbox="${n.entry.title}" whatsapp=${n.sent.map((s) => `${s.channel}:${s.ok ? 'OK' : 'KO'}`).join(',')}`);
    }).catch((e) => console.log('[notify] skipped:', e.message));
    const cfg = notify.getConfig();
    if (cfg.autoExportApk) {
      const ex = notify.exportApk();
      console.log(`[export-apk] ${ex.ok ? `OK jobs=${ex.jobs} alerts=${ex.alerts}` : 'KO ' + ex.error}`);
    }
  } catch (e) {
    console.log('[notify] skipped:', e.message);
  }
  return summary;
}

let task = null;

function apply(cfg) {
  if (!cfg.enabled) {
    if (task) {
      task.stop();
      task = null;
    }
    console.log('[schedule] disabled');
    return { ...cfg, nextRun: null, active: false };
  }
  if (!cron.validate(cfg.cron)) {
    console.log(`[schedule] invalid cron "${cfg.cron}" — keeping previous task`);
    const cur = getConfig();
    return { ...cur, nextRun: task ? nextRun(cur) : null, active: !!task, error: 'invalid cron expression' };
  }
  if (task) {
    task.stop();
    task = null;
  }
  task = cron.schedule(cfg.cron, () => runOnce('cron'), { timezone: cfg.tz });
  const next = nextRun(cfg);
  console.log(`[schedule] active "${cfg.cron}" (${cfg.tz}) next=${next}`);
  return { ...cfg, nextRun: next, active: true };
}

function start() {
  let cfg = getConfig();
  if (process.env.SCRAPE_CRON || process.env.SCRAPE_TZ) {
    cfg = saveConfig({
      cron: process.env.SCRAPE_CRON || cfg.cron,
      tz: process.env.SCRAPE_TZ || cfg.tz,
      enabled: process.env.DISABLE_SCHEDULE === '1' ? false : cfg.enabled
    });
  }
  const state = apply(cfg);
  if (process.env.RUN_ON_START === '1') runOnce('startup');
  return state;
}

function update(patch) {
  const cfg = { ...getConfig(), ...patch };
  if (cfg.enabled && !cron.validate(cfg.cron)) {
    return { ...cfg, nextRun: null, active: !!task, error: 'invalid cron expression' };
  }
  return apply(saveConfig(cfg));
}

module.exports = { start, update, getConfig, runOnce, readRuns, nextRun };
