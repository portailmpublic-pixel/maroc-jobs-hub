const cheerio = require('cheerio');
const { fetchHtml, clean, parseFrDate, toAbsolute, slug } = require('../utils');

const BASE = 'https://www.rekrute.com';
const LIST = `${BASE}/offres-emploi-maroc.html`;

async function scrape() {
  const html = await fetchHtml(LIST);
  const $ = cheerio.load(html);
  const jobs = [];
  $('li.post-id').each((_, li) => {
    const $li = $(li);
    const $a = $li.find('a.titreJob').first();
    if (!$a.length) return;
    const href = $a.attr('href') || '';
    const fullTitle = clean($a.text());
    const parts = fullTitle.split('|').map((s) => s.trim());
    const title = parts[0] || fullTitle;
    let city = '';
    if (parts[1]) city = parts[1].replace(/\(Maroc\)/i, '').trim();
    const url = toAbsolute(href.split('?')[0], BASE);
    const idMatch = href.match(/-(\d+)\.html/);
    const extId = idMatch ? idMatch[1] : slug(title + city);
    const company = clean($li.find('img.photo').first().attr('alt') || $li.find('img.photo').first().attr('title') || '');
    const desc = clean($li.find('.holder .info span').first().text() || $li.find('.holder .info').first().text());
    const dateText = clean($li.find('em.date').text());
    const dates = [...dateText.matchAll(/(\d{2}\/\d{2}\/\d{4})/g)].map((m) => m[1]);
    const publishedDate = dates[0] ? parseFrDate(dates[0]) : null;
    const deadline = dates[1] ? parseFrDate(dates[1]) : null;
    const postsMatch = dateText.match(/Postes[^:]*:\s*(\d+)/i);
    const meta = {};
    $li.find('.info ul li').each((__, el) => {
      const t = clean($(el).text());
      if (/Secteur/i.test(t)) meta.sector = t.replace(/.*?:/, '').trim();
      else if (/Fonction/i.test(t)) meta.fonction = t.replace(/.*?:/, '').trim();
      else if (/Exp.*requise/i.test(t)) meta.experience = t.replace(/.*?:/, '').trim();
      else if (/Niveau.*tude/i.test(t)) meta.diploma = t.replace(/.*?:/, '').trim();
      else if (/Type de contrat/i.test(t)) meta.contract = t.replace(/.*?:/, '').trim();
    });
    let contract = '';
    if (meta.contract) contract = meta.contract.split('-')[0].trim();
    const requirements = [];
    if (meta.diploma) requirements.push(`Diplôme: ${meta.diploma}`);
    if (meta.experience) requirements.push(`Expérience: ${meta.experience}`);
    if (meta.sector) requirements.push(`Secteur: ${meta.sector}`);
    if (meta.fonction) requirements.push(`Fonction: ${meta.fonction}`);
    jobs.push({
      id: `rekrute-${extId}`,
      source: 'rekrute',
      sourceLabel: 'ReKrute',
      title, company, city,
      contract: contract || 'CDI',
      sector: meta.sector || '', fonction: meta.fonction || '',
      specialty: meta.fonction || '',
      diploma: meta.diploma || '', experience: meta.experience || '',
      postsCount: postsMatch ? parseInt(postsMatch[1], 10) : 1,
      description: desc, requirements,
      publishedDate, deadline, concoursDate: null,
      url, status: 'open'
    });
  });
  return jobs;
}

module.exports = { key: 'rekrute', label: 'ReKrute', url: BASE, scrape };
