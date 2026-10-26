import fs from 'node:fs';
import { enrichJobs } from '../app/src/jobEnrichment.js';

const raw = JSON.parse(fs.readFileSync(new URL('../app/public/jobs.json', import.meta.url), 'utf8'));
const jobs = enrichJobs(raw.jobs || raw);
const fields = ['contract', 'diploma', 'experience', 'specialty', 'sector', 'fonction', 'requirements'];
const counts = Object.fromEntries(fields.map((f) => [f, 0]));
const inferred = Object.fromEntries(fields.map((f) => [f, 0]));
const values = Object.fromEntries(fields.map((f) => [f, new Map()]));

for (const job of jobs) {
  for (const field of fields) {
    const value = job[field];
    const filled = Array.isArray(value) ? value.length > 0 : Boolean(String(value || '').trim());
    if (!filled) counts[field] += 1;
    if (job._inferred && job._inferred[field]) inferred[field] += 1;
    if (filled) {
      const key = Array.isArray(value) ? value.length + ' points' : String(value);
      const map = values[field];
      map.set(key, (map.get(key) || 0) + 1);
    }
  }
}

console.log('Offres :', jobs.length);
console.log('\nChamps vides après enrichissement :');
for (const field of fields) console.log(`  ${field}: ${counts[field]}`);
console.log('\nChamps déduits :');
for (const field of fields) console.log(`  ${field}: ${inferred[field]}`);
console.log('\nValeurs les plus fréquentes :');
for (const field of fields) {
  const top = [...values[field].entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log(`  ${field}: ${top.map(([v, n]) => `${v} (${n})`).join(' · ')}`);
}

const empty = jobs.filter((job) => fields.some((field) => {
  const value = job[field];
  return Array.isArray(value) ? !value.length : !String(value || '').trim();
}));
console.log('\nFiches encore incomplètes :', empty.length);
if (empty.length) console.log(empty.slice(0, 5).map((j) => j.id));

console.log('\nExemples :');
for (const id of ['marocannonces-0', 'jobsquare-0', 'rekrute-186871']) {
  const job = jobs.find((j) => j.id === id);
  if (!job) continue;
  console.log(JSON.stringify({
    id: job.id,
    title: job.title,
    contract: job.contract,
    diploma: job.diploma,
    experience: job.experience,
    specialty: job.specialty,
    sector: job.sector,
    fonction: job.fonction,
    requirements: job.requirements,
    inferred: job._inferred,
  }, null, 2));
}

for (const source of ['jobsquare', 'marocannonces', 'jawb']) {
  const sample = jobs.filter((j) => j.source === source).slice(0, 3);
  console.log(`\n--- ${source} ---`);
  for (const job of sample) {
    console.log(JSON.stringify({
      title: job.title,
      contract: job.contract,
      diploma: job.diploma,
      experience: job.experience,
      specialty: job.specialty,
      sector: job.sector,
      fonction: job.fonction,
      requirements: job.requirements,
    }, null, 2));
  }
}
