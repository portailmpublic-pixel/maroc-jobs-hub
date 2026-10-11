const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'jobs.json');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

async function fetchHtml(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeout || 25000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'user-agent': UA,
        'accept-language': 'fr-FR,fr;q=0.9,en;q=0.7',
        accept: 'text/html,application/xhtml+xml',
        ...(opts.headers || {})
      }
    });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status} for ${url}`);
      err.status = res.status;
      throw err;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    let text = null;
    const ct = res.headers.get('content-type') || '';
    const m = ct.match(/charset=([\w-]+)/i);
    if (m) {
      try { text = new TextDecoder(m[1], { fatal: true }).decode(buf); } catch { text = null; }
    }
    if (text === null) {
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
      catch { text = new TextDecoder('windows-1252').decode(buf); }
    }
    return text;
  } finally {
    clearTimeout(t);
  }
}

function clean(s) {
  if (!s) return '';
  return String(s).replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();
}

function parseFrDate(s) {
  if (!s) return null;
  const m = String(s).match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    let y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    const d = `${y}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
    return d;
  }
  const months = { janvier: '01', fevrier: '02', 'février': '02', mars: '03', avril: '04', mai: '05', juin: '06', juillet: '07', aout: '08', 'août': '08', septembre: '09', octobre: '10', novembre: '11', decembre: '12', 'décembre': '12' };
  const m2 = String(s).toLowerCase().match(/(\d{1,2})\s+([a-zéû]+)\s+(\d{4})/);
  if (m2 && months[m2[2]]) {
    return `${m2[3]}-${months[m2[2]]}-${String(m2[1]).padStart(2, '0')}`;
  }
  return null;
}

function daysUntil(isoDate) {
  if (!isoDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(isoDate + 'T00:00:00');
  return Math.round((d - today) / 86400000);
}

function toAbsolute(href, base) {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function slug(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

const CITY_ALIASES = {
  fes: 'Fès', kenitra: 'Kénitra', kénitra: 'Kénitra', casablanca: 'Casablanca',
  rabat: 'Rabat', tanger: 'Tanger', marrakech: 'Marrakech', agadir: 'Agadir',
  oujda: 'Oujda', meknes: 'Meknès', 'meknès': 'Meknès', mohammedia: 'Mohammedia',
  tetouan: 'Tétouan', 'tétouan': 'Tétouan', temara: 'Témara', 'témara': 'Témara',
  inezgane: 'Inezgane', 'el jadida': 'El Jadida', nouaceur: 'Nouaceur',
  dakhla: 'Dakhla', nador: 'Nador', settat: 'Settat', tiflet: 'Tiflet',
  maroc: 'Maroc', 'tout le maroc': 'Tout le Maroc', sale: 'Salé', 'salé': 'Salé'
};

function normCity(s) {
  if (!s) return s;
  const t = clean(s);
  const key = t.toLowerCase();
  if (CITY_ALIASES[key]) return CITY_ALIASES[key];
  if (t === t.toUpperCase() || t === t.toLowerCase()) {
    return t.split(' ').map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w)).join(' ');
  }
  return t;
}

const TRADE_PATTERNS = [
  /soude/, /chaudron/, /tuyau/, /piping/, /mecanic/, /maintenance/,
  /technicien/, /electri/, /outill/, /usinag/, /tourneur/, /fraiseur/,
  /\bcnc\b/, /\btig\b/, /\bmig\b/, /forgeron/, /rondier/, /metall/,
  /siderurg/, /automobile/, /aeronaut/, /\bbtp\b/, /genie civil/,
  /chantier/, /topographe/, /operateur/, /hvac/, /climatisation/,
  /plomb/, /sanitaire/, /menuis/, /charpent/, /ebenist/, /cabl/,
  /peintre/, /peinture/, /carross/,
  /macon/, /coffr/, /ferraill/, /carrel/, /platr/, /plaquiste/, /staff/,
  /serrur/, /vitr/, /couvr/, /etanch/, /aluminium/,
  /coutur/, /tailleur/, /coiff/, /soude/, /soudage/, /\barc\b/,
  /chaudier/, /grut/, /conducteur.*engin/, /froid/, /frigoriste/,
  /solaire/, /photovoltaique/, /depann/, /courant/,
  /controle.*qualite/, /controleur.*qualite/, /fabrication/, /production.*(qualite|maintenance|operateur)/
];

const TRADE_SECTORS = [
  'automobile', 'aeronautique', 'btp', 'genie civil', 'metallurgie',
  'siderurgie', 'industrie', 'ferroviaire', 'chimie', 'artisanat',
  'menuiserie', 'plomberie', 'electricite', 'peinture', 'maconnerie',
  'climatisation', 'soudure', 'chaudronnerie'
];

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function fold(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const OCCUPATION_RULES = [
  [/soude/, 'Soudeur'],
  [/chaudron/, 'Chaudronnier'],
  [/tuyau|piping/, 'Tuyauteur'],
  [/mecanic/, 'Mécanicien'],
  [/electri/, 'Électricien'],
  [/outill/, 'Outilleur'],
  [/peintre|peinture/, 'Peintre'],
  [/menuis|ebenist|charpent|aluminium/, 'Menuisier'],
  [/plomb|sanitaire/, 'Plombier'],
  [/macon|coffr|ferraill/, 'Maçon / Coffreur'],
  [/carrel/, 'Carreleur'],
  [/platr|plaquiste|staffeur/, 'Plâtrier'],
  [/serrur/, 'Serrurier'],
  [/vitr/, 'Vitrier'],
  [/couvr|etanch/, 'Couvreur / Étancheur'],
  [/carross/, 'Carrossier'],
  [/coutur|tailleur/, 'Couturier'],
  [/coiff/, 'Coiffeur'],
  [/chaudier/, 'Chaudronnier'],
  [/grut|conducteur.*engin/, 'Conducteur d’Engins'],
  [/froid|frigoriste/, 'Froid / Climatisation'],
  [/solaire|photovoltaique/, 'Installateur Solaire'],
  [/depann/, 'Dépanneur'],
  [/usinag|\bcnc\b/, 'Opérateur Usinage (CNC)'],
  [/forgeron/, 'Forgeron'],
  [/comptable/, 'Comptable'],
  [/conseiller.*clientele|charge.*clientele|gestionnaire.*clientele/, 'Conseiller Clientèle'],
  [/vendeur|commercial|vendeuse|recouvr/, 'Commercial'],
  [/juriste|avocat/, 'Juriste'],
  [/devops/, 'Ingénieur DevOps'],
  [/ingenieur.*electri|electri.*ingenieur/, 'Ingénieur Électrique'],
  [/developpeur|developer/, 'Développeur'],
  [/data scientist|machine learning|data analyst|data engineer|consolideur/, 'Data / IA'],
  [/ingenieur|engineer/, 'Ingénieur'],
  [/administrateur.*system|administrateur.*reseau|dba\b|database/, 'Administrateur Systèmes / DBA'],
  [/administrateur/, 'Administrateur'],
  [/technicien.*reseau|technicien.*infrastructure/, 'Technicien Réseaux'],
  [/technicien.*maintenance/, 'Technicien Maintenance'],
  [/technicien.*laboratoire|operateur.*laboratoire/, 'Technicien Laboratoire'],
  [/technicien/, 'Technicien'],
  [/helpdesk|support technique/, 'Support IT'],
  [/agent.*production|operateur.*production|\bproduction\b/, 'Agent de Production'],
  [/pharmacien/, 'Pharmacien'],
  [/infirmier|aide soignant/, 'Soignant'],
  [/medecin/, 'Médecin'],
  [/enseignant|professeur|maitre.*primaire|maitresse/, 'Enseignant'],
  [/chauffeur|livreur/, 'Chauffeur-Livreur'],
  [/manutention/, 'Manutentionnaire'],
  [/pilote|captain|commandant.*bord/, 'Pilote'],
  [/hotesse|steward/, 'Personnel Navigant Commercial'],
  [/directeur.*technique/, 'Directeur Technique'],
  [/directeur/, 'Directeur'],
  [/responsable.*ressources|responsable.*paie|responsable.*rh\b|ressources humaines|human resources|\brh\b|hrbp|hr business/, 'Responsable RH'],
  [/responsable/, 'Responsable'],
  [/manager|chef.*projet|product owner|scrum|\blead\b/, 'Manager / Chef de Projet'],
  [/coordinat/, 'Coordinateur'],
  [/consultant|consultante/, 'Consultant'],
  [/analyste|analyst/, 'Analyste'],
  [/designer|infographiste|graphiste/, 'Designer / Infographiste'],
  [/architecte/, 'Architecte'],
  [/auditeur|audit/, 'Auditeur'],
  [/controleur.*gestion|controle.*gestion/, 'Contrôleur de Gestion'],
  [/controleur.*qualite|controle.*qualite/, 'Contrôleur Qualité'],
  [/recruteur|charge.*recrutement|talent/, 'Recruteur'],
  [/marketing|communication/, 'Marketing / Communication'],
  [/logistique|logistic|supply chain|\bstock\b/, 'Logistique / Stock'],
  [/teleoper|teleconseiller|centre.*appel|call center/, 'Téléconseiller'],
  [/after.?care/, 'Cadre Service After-Care'],
  [/vendeuse.*parfumerie|merchandiser|vendeur.*terrain/, 'Vente Terrain'],
  [/caissier|guichet/, 'Caissier / Guichet'],
  [/securite|gardien|surveillant/, 'Sécurité'],
  [/cuisinier|chef.*cuisine|serveur|barman|gouvernant|receptionniste|concierge/, 'Hôtellerie / Restauration'],
  [/coiffeur|estheti/, 'Beauté'],
  [/plombier/, 'Plombier'],
  [/menuisier/, 'Menuisier'],
  [/peintre/, 'Peintre'],
  [/macon/, 'Maçon'],
  [/stagiaire|stage|intern/, 'Stagiaire']
];

function occupation(job) {
  let t = fold(String(job.title || '').replace(/^concours\s*[—–-]\s*/i, ''));
  for (const [re, label] of OCCUPATION_RULES) {
    if (re.test(t)) return label;
  }
  const f = fold(job.fonction || '');
  for (const [re, label] of OCCUPATION_RULES) {
    if (re.test(f)) return label;
  }
  let fb = clean(String(job.title || '').replace(/^concours\s*[—–-]\s*/i, ''))
    .replace(/\([^)]*\)/g, ' ').split(/[—–|]/)[0]
    .replace(/\b(H\/F|F\/H|H\/M)\b/gi, ' ')
    .replace(/\d+\+?\s*(postes?|ans)\b/gi, ' ')
    .replace(/\d[\d\s]*\s*DH\b/gi, ' ')
    .replace(/\s+/g, ' ').trim().replace(/[\d\s\-–\/]+$/, '').trim();
  if (fb.length > 48) fb = fb.slice(0, 48).trim() + '…';
  return fb || 'Autre';
}

function classify(job) {
  if (job.kind === 'concours' || job.kind === 'emploi') return job.kind;
  if (job.source === 'emploi-public') return 'concours';
  const blob = fold([job.title, job.contract].join(' '));
  if (blob.includes('concours')) return 'concours';
  return 'emploi';
}

function todayISO() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

function categorize(job) {
  const blob = norm([job.title, job.company, job.sector, job.fonction, job.description, (job.requirements || []).join(' ')].join(' '));
  // Stages category: contract contains Stage or title mentions stage/stagiaire
  const contract = String(job.contract || '').toLowerCase();
  const title = String(job.title || '').toLowerCase();
  if (contract.includes('stage') || title.includes('stagiaire') || title.includes(' stage ')) return 'stages';
  if (TRADE_PATTERNS.some((re) => re.test(blob))) return 'metiers-industrie';
  const sec = norm(job.sector);
  if (TRADE_SECTORS.some((s) => sec.includes(s))) return 'metiers-industrie';
  return 'autre';
}

module.exports = { fetchHtml, clean, parseFrDate, daysUntil, toAbsolute, slug, normCity, categorize, fold, classify, todayISO, occupation, DATA_FILE };
