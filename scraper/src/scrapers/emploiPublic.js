const cheerio = require('cheerio');
const { fetchHtml, clean, parseFrDate, toAbsolute, slug, normCity } = require('../utils');

const BASE = 'https://www.emploi-public.ma';
const LIST = `${BASE}/fr/concours-liste`;

function stripText(html) {
  return clean(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
}

async function enrich(job, url) {
  try {
    const text = stripText(await fetchHtml(url, { timeout: 15000 }));
    const specM = text.match(/Spécialité\s*:?\s*(.+?)\s*(Grade :|Nombre de postes|Type de|Région :|Accueil|Concours de recrutement|Description|Détail de|Téléchargement|$)/i);
    if (specM) {
      const spec = clean(specM[1].replace(/^[–—\-:;]+/, '').replace(/\s*[–—\-]\s*/g, ' ; ').replace(/\s*icon\s*/gi, ' ').replace(/\s+/g, ' ').trim()).slice(0, 220);
      if (spec && spec.length > 2) {
        job.specialty = spec;
        job.requirements.push(`Spécialité: ${spec}`);
      }
    }
    const concM = text.match(/Date du concours\s*(\d{1,2} [A-Za-zéû]+ \d{4})/);
    if (concM && !job.concoursDate) job.concoursDate = parseFrDate(concM[1]);
    const pubM = text.match(/Date de publication\s*(\d{1,2} [A-Za-zéû]+ \d{4})/);
    if (pubM && !job.publishedDate) job.publishedDate = parseFrDate(pubM[1]);
    const postM = text.match(/Nombre de postes\s*:\s*(\d+)/);
    if (postM) job.postsCount = parseInt(postM[1], 10);
    const KNOWN = ['Casablanca', 'Rabat', 'Tanger', 'Marrakech', 'Agadir', 'Fès', 'Meknès', 'Oujda', 'Kénitra', 'Tétouan', 'Mohammedia', 'Salé', 'Dakhla', 'Laâyoune', 'Laayoune', 'Taroudant', 'Ouarzazate', 'Settat', 'El Jadida', 'Nador', 'Béni Mellal', 'Essaouira', 'Safi', 'Khouribga', 'Berkane', 'Guelmim', 'Tiznit', 'Errachidia', 'Guercif', 'Fkih Ben Salah', 'Sidi Ifni', 'Tata', 'Larache', 'Khemisset', 'Azilal'];
    const regM = text.match(/Région\s*:?\s*([A-Za-zéû\-\s']{3,60}?)\s*(\(\d+ poste|Grade|Nombre de postes|Type de|$)/i);
    let found = '';
    if (regM) {
      const first = clean(regM[1]).split(/[\s\-–\/,]+/).filter(Boolean)[0];
      if (first && !/^(tous|toutes|nationale?|maroc)$/i.test(first)) found = first;
    }
    if (!found) {
      const hay = `${job.title} ${job.company}`;
      const hits = KNOWN.map((c) => ({ c, i: hay.search(new RegExp(c.replace(/[ây]/g, '[aâ]'), 'i')) })).filter((h) => h.i >= 0).sort((a, b) => a.i - b.i);
      const multi = hits.filter((h) => h.c.includes(' '));
      const single = hits.filter((h) => !h.c.includes(' '));
      if (multi.length) found = multi.sort((a, b) => b.c.length - a.c.length)[0].c;
      else if (single.length) found = single[0].c;
    }
    if (found) job.city = normCity(found);
  } catch (e) {
    return;
  }
}

async function scrape() {
  const html = await fetchHtml(LIST);
  const $ = cheerio.load(html);
  const jobs = [];
  $('a.card[href*="/fr/concours/details/"]').each((_, a) => {
    const $a = $(a);
    const href = $a.attr('href') || '';
    const title = clean($a.find('h3.card-title').text());
    if (!title) return;
    const org = clean($a.find('.card-text').text());
    const msg = clean($a.find('.card-msg').text());
    const footer = clean($a.find('.card-footer').text());
    const posteM = footer.match(/(\d+)\s*poste/i);
    const limM = footer.match(/Limite[^:]*:\s*([0-9]{1,2}\s+[A-Za-zéû]+\s+[0-9]{4})/i);
    const deadline = limM ? parseFrDate(limM[1]) : null;
    const uuid = (href.match(/details\/([a-f0-9-]+)/i) || [])[1] || slug(title + org);
    const reqs = [];
    if (org) reqs.push(`Organisme: ${org}`);
    if (msg) reqs.push(`Urgence: ${msg}`);
    reqs.push('Dossier via emploi-public.ma (dépôt en ligne ou papier selon avis)');
    jobs.push({
      id: `emploi-public-${uuid}`,
      source: 'emploi-public',
      sourceLabel: 'Emploi Public',
      title: `Concours — ${title}`,
      company: org, city: 'Maroc',
      contract: 'Fonction publique',
      sector: 'Public', fonction: title,
      specialty: '',
      diploma: '', experience: '',
      postsCount: posteM ? parseInt(posteM[1], 10) : 1,
      description: `${title} — ${org}. ${footer}`,
      requirements: reqs,
      publishedDate: null, deadline, concoursDate: null,
      url: toAbsolute(href, BASE), status: 'open'
    });
  });
  for (let i = 0; i < jobs.length; i += 4) {
    await Promise.all(jobs.slice(i, i + 4).map((j) => enrich(j, j.url)));
  }
  return jobs;
}

module.exports = { key: 'emploi-public', label: 'Emploi Public', url: BASE, scrape, enrich };
