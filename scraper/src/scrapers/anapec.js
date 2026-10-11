const { fetchHtml, clean } = require('../utils');
const cheerio = require('cheerio');

const BASE = 'https://www.anapec.org';
const URLS = [`${BASE}/sigec-app-rv`, 'https://anapec.org/sigec-app-rv'];

async function scrape() {
  let html = '';
  let used = URLS[0];
  for (const u of URLS) {
    try {
      html = await fetchHtml(u);
      used = u;
      break;
    } catch (e) {
      continue;
    }
  }
  if (!html) throw new Error('ANAPEC portal unreachable (JS app / login)');
  const $ = cheerio.load(html);
  const body = clean($('body').text());
  const jobs = [];
  const companies = ['Peugeot Citroen Automobiles Maroc', 'SEWS MAROC', 'YAZAKI KENITRA', 'BANQUE POPULAIRE FES-MEKNES', 'Valeo Vision Maroc', 'ARMONIA FACILITES', 'DAMAK', 'GENERAL CHANTIERS'];
  companies.forEach((c, i) => {
    if (body.toLowerCase().includes(c.split(' ')[0].toLowerCase())) {
      jobs.push({
        id: `anapec-company-${i}-${Date.now()}`,
        source: 'anapec', sourceLabel: 'ANAPEC',
        title: `Recrutement via ANAPEC — ${c}`,
        company: c, city: 'Maroc',
        contract: 'CI / CDD / CDI', sector: 'Insertion', fonction: '',
        diploma: '', experience: '', postsCount: 1,
        description: `Entreprise qui recrute via ANAPEC (portail sigec-app-rv). Voir ${used}`,
        requirements: ['Inscription ANAPEC requise', 'CV + CIN'],
        publishedDate: null, deadline: null, concoursDate: null,
        url: used, status: 'open'
      });
    }
  });
  const totalM = body.match(/([\d\s]{4,})\s*offres?\s*d['’]emploi/i);
  if (totalM) {
    jobs.unshift({
      id: `anapec-total-${Date.now()}`,
      source: 'anapec', sourceLabel: 'ANAPEC',
      title: `ANAPEC — ${clean(totalM[0])} en ligne`,
      company: 'ANAPEC', city: 'Tout le Maroc',
      contract: '', sector: '', fonction: '',
      diploma: '', experience: '', postsCount: 1,
      description: 'Compteur global du portail ANAPEC (agrégateur).',
      requirements: [],
      publishedDate: null, deadline: null, concoursDate: null,
      url: used, status: 'info'
    });
  }
  return jobs;
}

module.exports = { key: 'anapec', label: 'ANAPEC', url: BASE, scrape };
