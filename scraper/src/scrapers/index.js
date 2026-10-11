const rekrute = require('./rekrute');
const emploiPublic = require('./emploiPublic');
const jawb = require('./jawb');
const dreamjob = require('./dreamjob');
const stellantis = require('./stellantis');
const anapec = require('./anapec');
const indeed = require('./indeed');
const glassdoor = require('./glassdoor');
const marocannonces = require('./marocannonces');
const emploiMa = require('./emploiMa');
const jobsquare = require('./jobsquare');

const SCRAPERS = [rekrute, emploiPublic, jawb, dreamjob, stellantis, anapec, indeed, glassdoor, marocannonces, emploiMa, jobsquare];

async function runAll(selected) {
  const results = [];
  const list = selected ? SCRAPERS.filter((s) => selected.includes(s.key)) : SCRAPERS;
  for (const s of list) {
    const started = Date.now();
    try {
      const jobs = await s.scrape();
      results.push({ source: s.key, label: s.label, ok: true, count: jobs.length, ms: Date.now() - started, jobs });
    } catch (e) {
      results.push({ source: s.key, label: s.label, ok: false, count: 0, ms: Date.now() - started, error: e.message, jobs: [] });
    }
  }
  return results;
}

module.exports = { SCRAPERS, runAll };
