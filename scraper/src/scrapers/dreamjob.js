const cheerio = require('cheerio');
const { fetchHtml, clean, parseFrDate, toAbsolute, slug } = require('../utils');

const BASE = 'https://www.dreamjob.ma';
const LISTS = [`${BASE}/emploi/`, `${BASE}/emploi-public/`];

async function scrape() {
  const jobs = [];
  for (const listUrl of LISTS) {
    let html;
    try {
      html = await fetchHtml(listUrl);
    } catch (e) {
      continue;
    }
    const $ = cheerio.load(html);
    $('article, .post, h2 a, h3 a').each((_, el) => {
      const $el = $(el);
      const $a = $el.is('a') ? $el : $el.find('a').first();
      const href = $a.attr('href') || '';
      if (!href.includes('dreamjob.ma')) {
        if (!href.startsWith('/emploi') && !href.startsWith('/stage') && !href.startsWith('/emploi-public')) return;
      }
      const title = clean($a.text());
      if (!title || title.length < 8) return;
      if (/accueil|contact|recruter|advertise/i.test(title)) return;
      const $card = $el.closest('article, .post, li, div');
      const cardText = clean($card.text());
      const dateM = cardText.match(/(\d{2}\/\d{2}\/\d{4})/);
      const cityM = cardText.match(/(Casablanca|Rabat|Tanger|Marrakech|Agadir|Fès|Fes|Meknès|Mohammedia|Kénitra|Kenitra|Oujda|Tétouan|Témara|Nouaceur|Bouskoura|Melloussa|Dakhla|Laâyoune|Safi|Jorf)/i);
      const url = toAbsolute(href, BASE);
      const id = `dreamjob-${slug(url)}`;
      if (jobs.some((j) => j.id === id)) return;
      jobs.push({
        id, source: 'dreamjob', sourceLabel: 'Dreamjob.ma',
        title, company: '', city: cityM ? cityM[1] : 'Maroc',
        contract: /stage/i.test(title + cardText) ? 'Stage' : /concours/i.test(title) ? 'Concours' : '',
        sector: '', fonction: '',
        diploma: '', experience: '',
        postsCount: (cardText.match(/(\d+)\s*postes?/i) || [])[1] ? parseInt(cardText.match(/(\d+)\s*postes?/i)[1], 10) : 1,
        description: cardText.slice(0, 400),
        requirements: [],
        publishedDate: dateM ? parseFrDate(dateM[1]) : null,
        deadline: null, concoursDate: null,
        url, status: 'open'
      });
    });
  }
  return jobs.slice(0, 80);
}

module.exports = { key: 'dreamjob', label: 'Dreamjob.ma', url: BASE, scrape };
