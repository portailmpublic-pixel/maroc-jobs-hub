const cheerio = require('cheerio');
const { fetchHtml, clean, toAbsolute, slug } = require('../utils');

const BASE = 'https://jawb.ma';
const LIST = `${BASE}/offres`;

async function scrape() {
  const html = await fetchHtml(LIST);
  const $ = cheerio.load(html);
  const jobs = [];
  $('a.offre-card[href^="/offres/"]').each((_, a) => {
    const $a = $(a);
    const href = $a.attr('href') || '';
    if (!href || href === '/offres') return;
    const text = clean($a.text());
    if (!text) return;
    const company = clean($a.find('img').first().attr('alt') || '');
    const title = clean($a.find('h2, h3, .offre-title').first().text() || text.slice(0, 90));
    const metaLine = text;
    const cityM = metaLine.match(/(Casablanca|Rabat|Tanger|Marrakech|Agadir|Fès|Fes|Meknès|Kenitra|Kénitra|Oujda|Tétouan|Mohammedia|Inezgane|Tiflet|Salé|Témara|Nouaceur|El Jadida)/i);
    const contractM = metaLine.match(/(CDI|CDD|Intérim|Interim|Stage|Freelance|CI\b|ANAPEC)/i);
    jobs.push({
      id: `jawb-${slug(href)}`,
      source: 'jawb',
      sourceLabel: 'Jawb.ma',
      title: title || `Offre ${href.split('/').pop()}`,
      company, city: cityM ? cityM[1] : 'Maroc',
      contract: contractM ? contractM[1] : '',
      sector: '', fonction: '',
      diploma: '', experience: '',
      postsCount: 1,
      description: text.slice(0, 400),
      requirements: [],
      publishedDate: null, deadline: null, concoursDate: null,
      url: toAbsolute(href, BASE), status: 'open'
    });
  });
  return jobs.slice(0, 80);
}

module.exports = { key: 'jawb', label: 'Jawb.ma', url: BASE, scrape };
