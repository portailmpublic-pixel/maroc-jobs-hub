const cheerio = require('cheerio');
const { fetchHtml, clean, toAbsolute, slug } = require('../utils');

const BASE = 'https://www.emploi.ma';
const LISTS = [
  `${BASE}/recherche-jobs-maroc`,
  `${BASE}/recherche-jobs-maroc/technicien`
];

async function scrape() {
  let html = '';
  for (const u of LISTS) {
    try {
      html = await fetchHtml(u);
      if (html && html.length > 20000) break;
    } catch (e) {
      continue;
    }
  }
  if (!html || html.length < 20000) throw new Error('Emploi.ma anti-bot (403) — offres visibles via emploi.ma dans le navigateur');
  const $ = cheerio.load(html);
  const jobs = [];
  $('a[href*="/offre"], a[href*="/job"], .job-card a, article a').each((_, a) => {
    const $a = $(a);
    const href = $a.attr('href') || '';
    if (!href || href === '#') return;
    const title = clean($a.text());
    if (!title || title.length < 8 || title.length > 160) return;
    if (/accueil|contact|connexion|inscription|newsletter/i.test(title)) return;
    const ctx = clean($a.closest('article, li, div').text());
    const cityM = ctx.match(/(Casablanca|Rabat|Tanger|Marrakech|Agadir|Fès|Fes|Meknès|Kénitra|Kenitra|Oujda|Tétouan|Mohammedia|Salé|El Jadida|Nador)/i);
    const id = `emploi-ma-${slug(href)}`;
    if (jobs.some((j) => j.id === id)) return;
    jobs.push({
      id, source: 'emploi-ma', sourceLabel: 'Emploi.ma',
      title, company: '', city: cityM ? cityM[1] : 'Maroc',
      contract: '', sector: '', fonction: '',
      diploma: '', experience: '',
      postsCount: 1, description: ctx.slice(0, 300),
      requirements: [],
      publishedDate: null, deadline: null, concoursDate: null,
      url: toAbsolute(href, BASE), status: 'open'
    });
  });
  if (!jobs.length) throw new Error('Emploi.ma structure inattendue — offres visibles via emploi.ma dans le navigateur');
  return jobs.slice(0, 40);
}

module.exports = { key: 'emploi-ma', label: 'Emploi.ma', url: BASE, scrape };
