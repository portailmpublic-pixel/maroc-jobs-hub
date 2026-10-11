const cheerio = require('cheerio');
const { fetchHtml, clean, toAbsolute, slug } = require('../utils');

const BASE = 'https://www.marocannonces.com';
const LIST = `${BASE}/emploi.html`;

function toISO(label) {
  const t = new Date();
  if (/aujourd/i.test(label)) return t.toISOString().slice(0, 10);
  if (/hier/i.test(label)) { t.setDate(t.getDate() - 1); return t.toISOString().slice(0, 10); }
  const m = label.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    let y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    return `${y}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  }
  return null;
}

async function scrape() {
  const html = await fetchHtml(LIST);
  const $ = cheerio.load(html);
  const jobs = [];
  $('a[href*="/annonce/"]').each((_, a) => {
    const $a = $(a);
    const $holder = $a.find('div.holder');
    if (!$holder.length) return;
    const title = clean($holder.find('h3').first().text());
    if (!title || title.length < 4) return;
    const href = $a.attr('href') || '';
    const city = clean($holder.find('span.location').first().text()) || 'Maroc';
    const $li = $a.closest('li');
    const dateLabel = clean($li.find('em.date').first().text());
    const idm = href.match(/annonce\/(\d+)/);
    jobs.push({
      id: `marocannonces-${idm ? idm[1] : slug(title + city)}`,
      source: 'marocannonces', sourceLabel: 'MarocAnnonces',
      title, company: '', city,
      contract: '', sector: '', fonction: '',
      diploma: '', experience: '',
      postsCount: 1,
      description: `${title} — ${city} (${dateLabel})`,
      requirements: [],
      publishedDate: toISO(dateLabel), deadline: null, concoursDate: null,
      url: toAbsolute(href, BASE), status: 'open'
    });
  });
  const seen = new Map();
  for (const j of jobs) if (!seen.has(j.id)) seen.set(j.id, j);
  return [...seen.values()].slice(0, 60);
}

module.exports = { key: 'marocannonces', label: 'MarocAnnonces', url: BASE, scrape };
