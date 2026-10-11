const cheerio = require('cheerio');
const { fetchHtml, clean, toAbsolute, slug } = require('../utils');

const BASE = 'https://jobs.groupe-psa.com';
const LIST = `${BASE}/offre-de-emploi/liste-toutes-offres.aspx?changefacet=1&facet_JobCountry=128`;

async function scrape() {
  const html = await fetchHtml(LIST);
  const $ = cheerio.load(html);
  const jobs = [];
  $('a[href*="emploi-"]').each((_, a) => {
    const href = $(a).attr('href') || '';
    if (!/_\d+\.aspx/.test(href)) return;
    const title = clean($(a).text());
    if (!title || title.length < 5) return;
    const ref = (href.match(/_(\d+)\.aspx/) || [])[1] || '';
    const ctx = clean($(a).closest('li, tr, div').text());
    const cityM = ctx.match(/(Kénitra|Kenitra|Casablanca)/i);
    jobs.push({
      id: `stellantis-${ref || slug(title)}`,
      source: 'stellantis', sourceLabel: 'Stellantis Kénitra',
      title, company: 'Stellantis', city: cityM ? cityM[1] : 'Kénitra',
      contract: 'CDI', sector: 'Automobile', fonction: title,
      diploma: /Bac\+2/i.test(ctx) ? 'Bac+2' : '',
      experience: /3.+5\s*ans/i.test(ctx) ? '3-5 ans' : '',
      postsCount: 1, description: ctx.slice(0, 400),
      requirements: [`Réf: ${ref}`, 'CDI Stellantis Maroc'].filter(Boolean),
      publishedDate: null, deadline: null, concoursDate: null,
      url: toAbsolute(href, BASE), status: 'open'
    });
  });
  const seen = new Map();
  for (const j of jobs) if (!seen.has(j.id)) seen.set(j.id, j);
  return [...seen.values()].slice(0, 60);
}

module.exports = { key: 'stellantis', label: 'Stellantis Kénitra', url: BASE, scrape };
