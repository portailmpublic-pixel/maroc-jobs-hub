const cheerio = require('cheerio');
const { fetchHtml, clean, toAbsolute, slug } = require('../utils');

const BASE = 'https://www.glassdoor.com';
const LIST = `${BASE}/Job/maroc-jobs-SRCH_IL.0,5_IN223.htm`;

async function scrape() {
  const html = await fetchHtml(LIST);
  if (/captcha|challenge|robot|datadome|perimeterx/i.test(html.slice(0, 5000)) && !html.includes('JobsList')) {
    throw new Error('Glassdoor captcha-wall — offres visibles via glassdoor.com dans le navigateur');
  }
  const $ = cheerio.load(html);
  const jobs = [];
  $('li[data-test="jobListing"], ul.JobsList__jobsList li, a.JobCard_jobTitle').each((_, el) => {
    const $el = $(el);
    const $a = $el.is('a') ? $el : $el.find('a.JobCard_jobTitle, a[data-test="job-title"]').first();
    const title = clean($a.text());
    if (!title || title.length < 4) return;
    const href = $a.attr('href') || '';
    const ctx = $el.closest('li').length ? $el.closest('li') : $el.parent();
    const company = clean(ctx.find('.EmployerProfile_compactName, [data-test="employer-name"]').first().text());
    const city = clean(ctx.find('.JobCard_location, [data-test="job-location"]').first().text()).split(',')[0].trim() || 'Maroc';
    jobs.push({
      id: `glassdoor-${slug(title + company + city)}`,
      source: 'glassdoor', sourceLabel: 'Glassdoor',
      title, company, city,
      contract: '', sector: '', fonction: '',
      diploma: '', experience: '',
      postsCount: 1,
      description: `${title} — ${company}, ${city}`,
      requirements: [],
      publishedDate: null, deadline: null, concoursDate: null,
      url: toAbsolute(href, BASE), status: 'open'
    });
  });
  const seen = new Map();
  for (const j of jobs) if (!seen.has(j.id)) seen.set(j.id, j);
  if (!seen.size) throw new Error('Glassdoor page vide/bloquée — offres visibles via glassdoor.com dans le navigateur');
  return [...seen.values()].slice(0, 40);
}

module.exports = { key: 'glassdoor', label: 'Glassdoor', url: BASE, scrape };
