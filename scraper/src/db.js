const fs = require('fs');
const { DATA_FILE, daysUntil, normCity, categorize, classify, todayISO, occupation } = require('./utils');

function load() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const db = JSON.parse(raw);
    for (const j of db.jobs || []) {
      if (j.city) j.city = normCity(j.city);
      j.daysLeft = daysUntil(j.deadline);
      j.category = categorize(j);
      j.kind = classify(j);
      j.occupation = occupation(j);
      if (!j.specialty && j.source === 'rekrute' && j.fonction) j.specialty = j.fonction;
      if (!j.specialty) j.specialty = '';
      if (!j.pay) j.pay = '';
      if (!j.duration) j.duration = '';
      if (!j.note) j.note = '';
      if (j.noDiploma === undefined) j.noDiploma = j.kind === 'gig';
      if (!j.firstSeen) j.firstSeen = (j.scrapedAt || j.publishedDate || todayISO()).slice(0, 10);
    }
    return db;
  } catch {
    return { updatedAt: null, jobs: [] };
  }
}

function purgeExpiredConcours() {
  const db = load();
  const today = todayISO();
  const kept = [];
  let purged = 0;
  for (const j of db.jobs) {
    if (classify(j) === 'concours' && j.deadline && j.deadline < today) {
      purged++;
      continue;
    }
    kept.push(j);
  }
  if (purged) {
    db.jobs = kept;
    save(db);
  }
  return purged;
}

function save(db) {
  db.updatedAt = new Date().toISOString();
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf8');
}

function upsert(jobs) {
  const db = load();
  const byId = new Map(db.jobs.map((j) => [j.id, j]));
  let added = 0;
  let updated = 0;
  for (const j of jobs) {
    j.daysLeft = daysUntil(j.deadline);
    j.scrapedAt = new Date().toISOString();
    if (!j.firstSeen) j.firstSeen = j.publishedDate || j.scrapedAt.slice(0, 10);
    if (byId.has(j.id)) {
      const prev = byId.get(j.id);
      byId.set(j.id, { ...prev, ...j, firstSeen: prev.firstSeen || j.firstSeen });
      updated++;
    } else {
      byId.set(j.id, j);
      added++;
    }
  }
  db.jobs = [...byId.values()];
  save(db);
  const purged = purgeExpiredConcours();
  const finalTotal = load().jobs.length;
  return { added, updated, purged, total: finalTotal };
}

function all() {
  return load().jobs;
}

function insert(job) {
  const db = load();
  if (db.jobs.some((j) => j.id === job.id)) {
    const err = new Error('id already exists');
    err.code = 'DUPLICATE';
    throw err;
  }
  db.jobs.unshift(job);
  save(db);
  return job;
}

function remove(id) {
  const db = load();
  const n = db.jobs.length;
  db.jobs = db.jobs.filter((j) => j.id !== id);
  if (db.jobs.length === n) return false;
  save(db);
  return true;
}

module.exports = { load, save, upsert, all, insert, remove, purgeExpiredConcours };
