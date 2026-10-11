const cheerio = require('cheerio');
const { fetchHtml, clean, toAbsolute, slug } = require('../utils');

const BASE = 'https://www.jobsquare.ma';
const LISTS = [`${BASE}/jobs/`, BASE];

function dateISO(s) {
  const m = String(s || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function push(jobs, seen, o) {
  if (!o.title || seen.has(o.id)) return;
  seen.set(o.id, o);
  jobs.push(o);
}

async function scrape() {
  const jobs = [];
  const seen = new Map();
  for (const listUrl of LISTS) {
    let html = '';
    try {
      html = await fetchHtml(listUrl);
    } catch (e) {
      continue;
    }
    const $ = cheerio.load(html);
    $('a.job-card[href*="/job/"]').each((_, a) => {
      const $a = $(a);
      const href = $a.attr('href') || '';
      const title = clean($a.find('.job-card__title').first().text());
      if (!title) return;
      const compRaw = clean($a.find('.job-card__company').first().text());
      const company = compRaw.split('●')[0].split('•').map((s) => s.trim()).filter(Boolean)[0] || compRaw.split(',')[0];
      const locTag = clean($a.find('.job-card__tag--location').first().text());
      const city = (locTag.split(',')[0] || '').trim() || 'Maroc';
      const type = clean($a.find('.job-card__tag--type').first().text());
      const idm = href.match(/\/job\/(\d+)/);
      const postsM = title.match(/(\d+)\s*postes?/i);
      push(jobs, seen, {
        id: `jobsquare-${idm ? idm[1] : slug(title + city)}`,
        source: 'jobsquare', sourceLabel: 'Jobsquare',
        title, company, city,
        contract: type || '', sector: '', fonction: '',
        diploma: '', experience: '',
        postsCount: postsM ? parseInt(postsM[1], 10) : 1,
        description: `${title} — ${company}, ${locTag}`,
        requirements: [],
        publishedDate: dateISO(clean($a.find('.job-card__tag--date').first().text())),
        deadline: null, concoursDate: null,
        url: toAbsolute(href, BASE), status: 'open'
      });
    });
    $('div.sj-job-card').each((_, el) => {
      const $el = $(el);
      const $t = $el.find('.sj-card-title a').first();
      const title = clean($t.text());
      if (!title) return;
      const href = $t.attr('href') || '';
      const idm = href.match(/\/job\/(\d+)/) || [null, $el.attr('id')];
      const company = clean($el.find('.sj-card-company a').first().text());
      const locTag = clean($el.find('.sj-card-tags .sj-loc').first().text());
      const city = (locTag.split(',')[0] || '').trim() || 'Maroc';
      const type = clean($el.find('.sj-card-tags .sj-type').first().text());
      const desc = clean($el.find('.sj-card-desc').first().text()).slice(0, 300);
      const postsM = title.match(/(\d+)\s*postes?/i);
      push(jobs, seen, {
        id: `jobsquare-${idm[1] || slug(title + city)}`,
        source: 'jobsquare', sourceLabel: 'Jobsquare',
        title, company, city,
        contract: type || '', sector: '', fonction: '',
        diploma: '', experience: '',
        postsCount: postsM ? parseInt(postsM[1], 10) : 1,
        description: desc || `${title} — ${company}, ${locTag}`,
        requirements: [],
        publishedDate: dateISO(clean($el.find('.sj-card-date').first().text())),
        deadline: null, concoursDate: null,
        url: toAbsolute(href, BASE), status: 'open'
      });
    });
    if (jobs.length >= 20) break;
  }
  if (!jobs.length) throw new Error('Jobsquare structure inattendue');
  return jobs.slice(0, 60);
}

module.exports = { key: 'jobsquare', label: 'Jobsquare', url: BASE, scrape };
