const cheerio = require('cheerio');
const { fetchHtml, clean, toAbsolute, slug } = require('../utils');

const BASE = 'https://ma.indeed.com';
const URLS = [
  `${BASE}/jobs?q=&l=Maroc&fromage=7&sort=date`,
  `${BASE}/jobs?q=technicien&l=Maroc&fromage=14&sort=date`
];

async function scrape() {
  let html = '';
  for (const u of URLS) {
    try {
      html = await fetchHtml(u);
      if (html.includes('job_seen_beacon') || html.includes('jobTitle')) break;
    } catch (e) {
      continue;
    }
  }
  if (!html || (!html.includes('job_seen_beacon') && !html.includes('jobTitle'))) {
    throw new Error('Indeed bot-wall (403/captcha) — offres visibles via ma.indeed.com dans le navigateur');
  }
  const $ = cheerio.load(html);
  const jobs = [];
  $('div.job_seen_beacon, td.resultContent').each((_, el) => {
    const $el = $(el);
    const $t = $el.find('h2.jobTitle a, a.jcs-JobTitle').first();
    const title = clean($t.text() || $el.find('h2.jobTitle').text());
    if (!title) return;
    const href = $t.attr('href') || '';
    const jk = (href.match(/jk=([a-z0-9]+)/i) || [])[1] || slug(title);
    const company = clean($el.find('[data-testid="company-name"]').text());
    const city = clean($el.find('[data-testid="text-location"]').text()).split(',')[0].trim() || 'Maroc';
    const dateTxt = clean($el.find('span.date').text());
    jobs.push({
      id: `indeed-${jk}`,
      source: 'indeed', sourceLabel: 'Indeed Maroc',
      title, company, city,
      contract: '', sector: '', fonction: '',
      diploma: '', experience: '',
      postsCount: 1,
      description: `${title} — ${company}, ${city} (${dateTxt})`,
      requirements: [],
      publishedDate: null, deadline: null, concoursDate: null,
      url: href ? toAbsolute(href, BASE) : `${BASE}/jobs?q=&l=Maroc`,
      status: 'open'
    });
  });
  return jobs.slice(0, 40);
}

module.exports = { key: 'indeed', label: 'Indeed Maroc', url: BASE, scrape };
