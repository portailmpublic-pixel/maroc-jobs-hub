// Complète les champs « Informations clés » des offres à partir de tout ce
// que la source publie (intitulé, description, catégorie, métier, exigences).
// Objectif : aucune fiche ne doit afficher « Non précisé » alors que la donnée
// peut être déduite de l'offre. Les valeurs déduites sont signalées dans l'UI.

const cleanText = (value) => String(value == null ? '' : value)
  .replace(/\u00a0/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const fold = (value) => cleanText(value)
  .toLowerCase()
  .replace(/œ/g, 'oe')
  .replace(/æ/g, 'ae')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const unique = (list) => {
  const seen = new Set();
  return list.filter((item) => {
    const key = fold(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const asText = (value) => {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean).join(' ');
  return cleanText(value);
};

const CATEGORY_LABEL = {
  'metiers-industrie': 'Industrie / Technique',
  stages: 'Stage / Éducation',
  autre: 'Services / Autres',
};

// ---------------------------------------------------------------
// Contrat
// ---------------------------------------------------------------
function normalizeContract(raw) {
  const value = cleanText(raw);
  if (!value) return '';
  const f = fold(value);
  if (/cdi\s*\/\s*cdd|ci\s*\/\s*cdd/.test(f)) return 'CDI / CDD';
  if (f === 'ci') return 'CDI';
  if (/\bcdi\b/.test(f)) return 'CDI';
  if (/\bcdd\b/.test(f)) return 'CDD';
  if (f.includes('stage')) return 'Stage';
  if (f.includes('interim')) return 'Intérim';
  if (f.includes('freelance')) return 'Freelance';
  if (f.includes('temps partiel') || f.includes('part time') || f.includes('part-time')) return 'Temps partiel';
  if (f.includes('temps plein') || f.includes('full time') || f.includes('full-time')) return 'Temps plein';
  if (f.includes('mission')) return 'Mission';
  if (f.includes('concours')) return 'Concours';
  if (f.includes('fonction publique')) return 'Fonction publique';
  if (f.includes('anapec')) return 'Contrat ANAPEC';
  if (f.includes('apprentissage') || f.includes('alternance')) return 'Alternance';
  if (f === 'autre' || f === 'indifferent' || f === 'non precise') return '';
  return value;
}

function inferContract(job, all) {
  if (job.kind === 'concours' || /\bconcours\b/.test(all)) return 'Concours / Fonction publique';
  if (job.source === 'emploi-public') return 'Fonction publique';
  if (/\bstage\b|stagiaire|alternance|apprentissage/.test(all)) return 'Stage';
  if (/\bcdi\b/.test(all) && /\bcdd\b/.test(all)) return 'CDI / CDD';
  if (/\bcdi\b/.test(all)) return 'CDI';
  if (/\bcdd\b/.test(all)) return 'CDD';
  if (/interim/.test(all)) return 'Intérim';
  if (/freelance|independant/.test(all)) return 'Freelance';
  if (/temps partiel|part time|part-time/.test(all)) return 'Temps partiel';
  if (/contrat de mission|mission freelance|mission d.interim/.test(all)) return 'Mission';
  if (/apprentissage|alternance/.test(all)) return 'Alternance';
  if (/anapec/.test(all)) return 'Contrat ANAPEC';
  if (/journee de recrutement|journee recrutement|recrutement le\b/.test(all)) return 'Événement de recrutement';
  if (/temps plein|full time|full-time/.test(all)) return 'Temps plein';
  return 'Temps plein';
}

// ---------------------------------------------------------------
// Diplôme
// ---------------------------------------------------------------
function normalizeDiploma(raw) {
  const value = cleanText(raw);
  if (!value) return '';
  return value
    .replace(/Bac\s*\+\s*/gi, 'Bac+')
    .replace(/\s+Minimum\b/gi, ' minimum')
    .replace(/\s+Maximum\b/gi, ' maximum')
    .replace(/\s+et plus\s+minimum\b/gi, ' et plus')
    .replace(/\s+et plus\b/gi, ' et plus');
}

function inferDiploma(job, all) {
  const explicit = [
    [/sans diplome|aucun diplome|non exige|no diploma|sans niveau/, 'Aucun diplôme exigé'],
    [/doctorat|phd|these de doctorat|maitre de conferences|professeur.*universite/, 'Doctorat'],
    [/bac\s*\+\s*([45])\s*\/\s*([45])/, (m) => `Bac+${m[1]}/${m[2]}`],
    [/bac\s*\+\s*5|bac\+5|master|mastere|mba/, 'Bac+5'],
    [/bac\s*\+\s*4|bac\+4/, 'Bac+4'],
    [/bac\s*\+\s*3|bac\+3|licence|bachelor/, 'Bac+3'],
    [/bac\s*\+\s*2|bac\+2|dut|bts|deug|technicien specialise|ofppt/, 'Bac+2'],
    [/bac\s*pro|bac pro|\bcap\b|\bbep\b|niveau bac|baccalaureat|\bbac\b/, 'Bac'],
    [/ingenieur|engineer/, 'Bac+5 (ingénieur)'],
  ];
  for (const [re, label] of explicit) {
    const match = all.match(re);
    if (match) return typeof label === 'function' ? label(match) : label;
  }

  if (job.kind === 'concours' || job.source === 'emploi-public') {
    if (/technicien/.test(all)) return 'Bac+2';
    if (/administrateur/.test(all)) return 'Bac+5';
    if (/infirmier/.test(all)) return 'Bac+3';
    if (/pharmacien|medecin|maitre de conferences/.test(all)) return 'Doctorat';
    if (/ingenieur/.test(all)) return 'Bac+5';
    return 'Diplôme requis (avis officiel)';
  }

  if (job.category === 'stages' || /\bstage\b|stagiaire/.test(all)) return 'Étudiant / jeune diplômé';

  if (/pharmacien|medecin|anesthesiste|avocat|notaire|chimiste/.test(all)) return 'Doctorat';
  if (/infirmier|sage.?femme|kinesitherapeute/.test(all)) return 'Bac+3';
  if (/direction|directeur|ingenieur|consultant|auditeur|architecte|enseignant|data|developpeur|devops|administrateur systemes|responsable/.test(all)) {
    return 'Bac+5';
  }
  if (/comptable|commercial|conseiller clientele|charge clientele|ressources humaines|recruteur|marketing|logistique|technicien|analyste|designer|coordinateur|support it|juriste|charge d.affaires/.test(all)) {
    return 'Bac+2/3';
  }
  if (/agent de production|operateur|manutentionnaire|chauffeur|livreur|magasinier|cariste|electricien|soudeur|mecanicien|peintre|macon|carreleur|couvreur|menuisier|plombier|securite|gardien|nettoyage|femme de chambre|serveur|commis|cuisinier|hotellerie|restauration|vente terrain|pompiste|ouvrier/.test(all)) {
    return 'Niveau Bac / CAP';
  }
  return 'Selon profil';
}

// ---------------------------------------------------------------
// Expérience
// ---------------------------------------------------------------
function normalizeExperience(raw) {
  const value = cleanText(raw);
  if (!value) return '';
  const f = fold(value);
  const ranges = [...f.matchAll(/(\d+)\s*(?:a|-|–)\s*(\d+)\s*ans?/g)];
  if (ranges.length) {
    return `${ranges[0][1]} à ${ranges[ranges.length - 1][2]} ans`;
  }
  const plus = f.match(/(\d+)\s*\+\s*ans?/);
  if (plus) return `${plus[1]} ans et +`;
  if (/^debutant|debutant accepte|jeune diplome/.test(f)) return 'Débutant accepté';
  if (/^junior/.test(f)) return '1 à 3 ans';
  if (/^intermediaire/.test(f)) return '3 à 5 ans';
  if (/^confirme/.test(f)) return '5 à 10 ans';
  if (/^expert/.test(f)) return '10 à 20 ans';
  if (/^tres senior/.test(f)) return '20 ans et +';
  if (/premiere experience/.test(f)) return 'Première expérience';
  if (/experience exigee|experience requise/.test(f)) return 'Expérience exigée';
  const single = f.match(/(\d+)\s*ans?/);
  if (single) return /minimum|min\b|et plus/.test(f) ? `${single[1]} ans et +` : `${single[1]} ans`;
  return '';
}

function inferExperience(job, all) {
  const range = all.match(/(\d+)\s*(?:a|-|–)\s*(\d+)\s*ans?/);
  if (range) return `${range[1]} à ${range[2]} ans`;
  const plus = all.match(/(\d+)\s*\+\s*ans?/);
  if (plus) return `${plus[1]} ans et +`;
  if (/debutant|jeune diplome|premiere experience/.test(all)) return 'Débutant accepté';
  if (/junior/.test(all)) return '1 à 3 ans';
  if (/confirme/.test(all)) return '3 à 5 ans';
  if (/senior/.test(all)) return '5 ans et +';
  if (/expert/.test(all)) return '10 ans et +';
  if (/experience exigee|experience requise/.test(all)) return 'Expérience exigée';
  const single = all.match(/(\d+)\s*ans?/);
  if (single && !/il y a/.test(all)) return `${single[1]} ans`;

  if (job.category === 'stages' || /\bstage\b|stagiaire/.test(all)) return 'Première expérience';
  if (job.kind === 'concours' || job.source === 'emploi-public') return 'Selon l’avis officiel';

  if (/direction|directeur|responsable|manager|ingenieur|consultant|auditeur|architecte|pharmacien|medecin|enseignant|data|developpeur|devops/.test(all)) {
    return '3 à 5 ans';
  }
  if (/comptable|commercial|conseiller|ressources humaines|recruteur|marketing|logistique|technicien|analyste|designer|coordinateur|support it|juriste/.test(all)) {
    return '1 à 3 ans';
  }
  if (/agent|operateur|manutentionnaire|chauffeur|livreur|magasinier|cariste|electricien|soudeur|mecanicien|peintre|macon|carreleur|couvreur|menuisier|plombier|securite|gardien|nettoyage|femme de chambre|serveur|commis|cuisinier|hotellerie|restauration|vente terrain|pompiste|ouvrier/.test(all)) {
    return 'Débutant accepté';
  }
  return 'Selon profil';
}

// ---------------------------------------------------------------
// Métier / spécialité / secteur
// ---------------------------------------------------------------
const OCCUPATION_LABELS = [
  ['finance, comptabilite & assurance', 'Finance / Comptabilité'],
  ['commerce, vente & immobilier', 'Commerce / Vente'],
  ['administration, secretariat & support', 'Administration / Secrétariat'],
  ['marketing, communication & medias', 'Marketing / Communication'],
  ['informatique, tech & digital', 'Informatique / Digital'],
  ['transport, logistique & supply chain', 'Transport / Logistique'],
  ['sante, medical & social', 'Santé / Social'],
  ['direction, management & entrepreneuriat', 'Direction / Management'],
  ['education, formation & coaching', 'Éducation / Formation'],
  ['tourisme, hotellerie & loisirs', 'Tourisme / Hôtellerie'],
  ['btp, construction & immobilier technique', 'BTP / Construction'],
  ['restauration, horeca & metiers de bouche', 'Restauration / Horeca'],
  ['juridique, fiscalite & conformite', 'Juridique / Fiscalité'],
];

function cleanOccupation(raw) {
  let value = cleanText(raw).replace(/…+$/g, '').trim();
  if (!value) return '';
  const f = fold(value);
  for (const [prefix, label] of OCCUPATION_LABELS) {
    if (f.startsWith(prefix)) return label;
  }
  value = value
    .replace(/\s+(Débutant|Débutante|Confirmé|Confirmée|Senior|Junior|Expert|Expérimenté|Expérimentée)\b/gi, '')
    .replace(/\s+\d+\s*[-+]\s*\d*\s*ans?\b/gi, '')
    .replace(/\s*[-–—]\s*$/g, '');
  return cleanText(value);
}

const FAMILIES = [
  {
    id: 'commercial',
    specialty: 'Commercial / Vente / Relation client',
    sector: 'Commerce / Distribution',
    re: /commercial|vente|vendeur|conseiller.*clientele|charge.*clientele|gestionnaire.*clientele|teleconseiller|teleoperateur|teleprospecteur|caissier|guichet|business develop|account manager|merchandis|customer support|service client|relation client|technico.?commercial|pre.?vendeur|immobilier|charge d.affaires|\bsav\b|call center|centre d.appels/,
  },
  {
    id: 'marketing',
    specialty: 'Marketing / Communication / Design',
    sector: 'Marketing / Communication',
    re: /marketing|communication|designer|infographiste|graphiste|videos|video|contenu|content|media|community manager|seo|tiktok|redacteur|e.?commerce/,
  },
  {
    id: 'finance',
    specialty: 'Gestion / Comptabilité / Finance',
    sector: 'Banque / Finance / Assurance',
    re: /comptab|finance|audit|controle.*gestion|fiscal|tresorerie|paie|banque|assurance|credit|risque|recouvr|actuariat|bourse|change|raf\b/,
  },
  {
    id: 'it',
    specialty: 'Informatique / Digital',
    sector: 'Informatique / Digital',
    re: /developpeur|developer|software|data ops|data engineer|data analyst|data scientist|machine learning|\bia\b|devops|informatique|systeme|dba|base de donnees|reseau|network|cyber|support it|helpdesk|hotline|full.?stack|front.?end|back.?end|\bapi\b|cloud|erp|\bcrm\b|digital|administrateur system|infrastructure|workplace|reporting programmer|security specialist|projets si|pmo si/,
  },
  {
    id: 'rh',
    specialty: 'Ressources humaines',
    sector: 'Services aux entreprises',
    re: /ressources humaines|\brh\b|recruteur|recrutement|talent|charge.*paie|gestionnaire.*paie|charge de formation/,
  },
  {
    id: 'logistics',
    specialty: 'Logistique / Transport',
    sector: 'Transport / Logistique',
    re: /logistique|stock|chauffeur|livreur|manutention|magasinier|cariste|picker|approvision|transport|douane|import|export|dispatch|flotte|parc\b|preparateur de commandes|inventoriste|pointeur|acheteur|achat/,
  },
  {
    id: 'health',
    specialty: 'Santé / Médical',
    sector: 'Santé / Médical',
    re: /pharmacien|soignant|medecin|anesthesiste|panseur|laboratoire|sante|infirmier|aide soignant|delegue medical|agent pharmacie|chimiste/,
  },
  {
    id: 'education',
    specialty: 'Éducation / Formation',
    sector: 'Éducation / Formation',
    re: /enseignant|educateur|formateur|professeur|maitre de conferences|preparateur physique|aide educatrice|animateur.*(enfance|jeunesse|socio|pedagogique|culturel)/,
  },
  {
    id: 'legal',
    specialty: 'Juridique / Conformité',
    sector: 'Juridique / Conseil',
    re: /juriste|juridique|avocat|notaire|fiscalite|conformite|reglementaire/,
  },
  {
    id: 'hospitality',
    specialty: 'Hôtellerie / Restauration / Tourisme',
    sector: 'Hôtellerie / Tourisme',
    re: /hotellerie|hotel|restauration|restaurant|cuisine|cuisinier|serveur|commis|chef de rang|femme de chambre|gouvernant|receptionniste|concierge|butler|majordome|nounou|hammam|spa\b|tourisme|voyage|reservation|cabin crew|personnel navigant|hotesse|steward|viennoiserie|patissier|plongeur|barman/,
  },
  {
    id: 'security',
    specialty: 'Sécurité / Gardiennage',
    sector: 'Sécurité / Gardiennage',
    re: /securite|surveillance|gardien|veilleur|pompier/,
  },
  {
    id: 'cleaning',
    specialty: 'Nettoyage / Services généraux',
    sector: 'Services généraux',
    re: /nettoyage|menage|jardinier|paysagiste|entretien|laveur|surface/,
  },
  {
    id: 'industry',
    specialty: 'Industrie / Technique / BTP',
    sector: 'Industrie / BTP',
    re: /ingenieur|technicien|agent de production|operateur|mecanicien|electricien|soudeur|chaudronnier|outilleur|maintenance|froid|climatisation|solaire|peintre|macon|menuisier|plombier|carreleur|couvreur|usinage|cnc|production|qualite|hse|qhse|chantier|btp|dessinateur|architecte|topographe|conducteur de travaux|carrossier|ouvrier|monteur|poseur|eclairagiste|faisceau|fluides|cvc|hydraulique|electrotechnique|automatisme|robotique|lean|methodes|planificateur|responsable technique|directeur technique/,
  },
  {
    id: 'admin',
    specialty: 'Administration / Secrétariat',
    sector: 'Services aux entreprises',
    re: /administration|secretariat|assistante|assistant|accueil|standardiste|back office|saisie|facturation|office manager|charge administratif|agent administratif/,
  },
  {
    id: 'direction',
    specialty: 'Direction / Management',
    sector: 'Direction / Management',
    re: /directeur|responsable|manager|chef de projet|chef de departement|coordinateur|consultant|analyste|\bpmo\b|superviseur|encadrement|team leader/,
  },
  {
    id: 'stage',
    specialty: 'Stage / Première expérience',
    sector: 'Éducation / Formation',
    re: /\bstage\b|stagiaire|alternance|apprentissage/,
  },
];

function familyFor(all) {
  return FAMILIES.find((family) => family.re.test(all)) || null;
}

const COMPANY_SECTOR_RULES = [
  [/stellantis|renault|psa|automobile|auto hall|fca group|jameel motors|\bcac\b|ferroviaire|aeronaut|aerospace/, 'Automobile / Aéronautique'],
  [/bank|banque|attijari|yousr|umnia|cih|baridcash|credit|axa|assurance|wafa|finance/, 'Banque / Finance / Assurance'],
  [/hotel|resort|pickalbatros|nobu|lifestyle hotel|tourisme|travel/, 'Hôtellerie / Tourisme'],
  [/universite|ministere|province|commune|prefecture|fondation|ecole|institution|um6p|campus|emploi public/, 'Secteur public / Éducation'],
  [/informatique|technologies|digital|software|hps|alten|capgemini|cgi|mobiblanc|neosys|skylark|boostlab|exmc|akkodis|segula/, 'Informatique / Digital'],
  [/btp|construction|immobilier|real estate|vital fer|ciment|travaux/, 'BTP / Immobilier'],
  [/pharma|clinique|hopital|oncorad|akdital|sante|medical/, 'Santé / Médical'],
  [/agro|bel\b|distribution|carrefour|label.vie|marjane|bim|commerce/, 'Agroalimentaire / Distribution'],
  [/telecom|orange|inwi|maroc telecom|hit radio|media/, 'Télécoms / Médias'],
  [/transport|logistic|fret|douane/, 'Transport / Logistique'],
  [/industrie|industrial|metal|siderurgie|sebn|usine|production/, 'Industrie'],
];

function inferSpecialty(job, all, family, occupation) {
  if (family) return family.specialty;
  if (occupation && !/^(autre|offre d.emploi|recrutement)$/i.test(occupation)) return occupation;
  return CATEGORY_LABEL[job.category] || 'Services / Autres';
}

function inferSector(job, all, family, company) {
  const fromCompany = COMPANY_SECTOR_RULES.find(([re]) => re.test(company));
  if (fromCompany) return fromCompany[1];
  if (job.kind === 'concours' || job.source === 'emploi-public') return 'Secteur public';
  if (family) return family.sector;
  return CATEGORY_LABEL[job.category] || 'Services / Autres';
}

function inferFonction(job, occupation, family) {
  if (job.kind === 'concours') {
    const title = cleanText(job.title)
      .replace(/^concours\s*[—–-]\s*/i, '')
      .replace(/\s*[—–-]\s*\d+\s*postes?.*$/i, '')
      .trim();
    if (title) return title;
  }
  if (occupation) return occupation;
  return family ? family.specialty : 'Profil à préciser';
}

// ---------------------------------------------------------------
// Points clés / profil
// ---------------------------------------------------------------
const SKILL_RULES = [
  [/\bexcel\b/, 'Excel'],
  [/\bword\b/, 'Word'],
  [/\bsage\b/, 'SAGE'],
  [/autocad/, 'AutoCAD'],
  [/solidworks/, 'SolidWorks'],
  [/catia/, 'CATIA'],
  [/\bpython\b/, 'Python'],
  [/\bjava\b/, 'Java'],
  [/javascript|\bjs\b/, 'JavaScript'],
  [/\breact\b/, 'React'],
  [/angular/, 'Angular'],
  [/node\.?js/, 'Node.js'],
  [/\bphp\b/, 'PHP'],
  [/\bsql\b/, 'SQL'],
  [/mysql/, 'MySQL'],
  [/oracle/, 'Oracle'],
  [/linux/, 'Linux'],
  [/\bgit\b/, 'Git'],
  [/docker/, 'Docker'],
  [/kubernetes|\bk8s\b/, 'Kubernetes'],
  [/aws|azure|gcp|cloud/, 'Cloud'],
  [/cisco/, 'Cisco'],
  [/tcp.?ip|reseaux?/, 'Réseaux'],
  [/cybersecurite|securite informatique/, 'Cybersécurité'],
  [/figma/, 'Figma'],
  [/photoshop/, 'Photoshop'],
  [/illustrator/, 'Illustrator'],
  [/premiere pro|montage video/, 'Montage vidéo'],
  [/\bseo\b/, 'SEO'],
  [/google ads|adwords/, 'Google Ads'],
  [/\bcrm\b/, 'CRM'],
  [/\berp\b/, 'ERP'],
  [/comptabilite/, 'Comptabilité'],
  [/fiscalite/, 'Fiscalité'],
  [/\bpaie\b/, 'Paie'],
  [/\baudit\b/, 'Audit'],
  [/controle de gestion/, 'Contrôle de gestion'],
  [/budget/, 'Budget'],
  [/reporting/, 'Reporting'],
  [/\bvente\b/, 'Vente'],
  [/negociation/, 'Négociation'],
  [/relation client|service client/, 'Relation client'],
  [/prospection/, 'Prospection'],
  [/marketing/, 'Marketing'],
  [/communication/, 'Communication'],
  [/recrutement/, 'Recrutement'],
  [/formation/, 'Formation'],
  [/logistique/, 'Logistique'],
  [/supply chain/, 'Supply chain'],
  [/\bachat/, 'Achats'],
  [/\bstock\b/, 'Gestion de stock'],
  [/transport/, 'Transport'],
  [/douane/, 'Douane'],
  [/maintenance/, 'Maintenance'],
  [/qualite/, 'Qualité'],
  [/\bhse\b|\bqhse\b/, 'HSE'],
  [/lean|six sigma/, 'Lean / Six Sigma'],
  [/autocad|\bdao\b|\bcao\b/, 'CAO / DAO'],
  [/lecture de plans|plans? techniques?/, 'Lecture de plans'],
  [/soudure|\btig\b|\bmig\b/, 'Soudure TIG/MIG'],
  [/hydraulique/, 'Hydraulique'],
  [/electrique|electrotechnique/, 'Électrotechnique'],
  [/froid|climatisation/, 'Froid / Climatisation'],
  [/solaire|photovoltaique/, 'Solaire / Photovoltaïque'],
  [/permis b/, 'Permis B'],
  [/permis c/, 'Permis C'],
  [/caces/, 'CACES'],
];

const LANGUAGE_RULES = [
  [/francais|\bfrench\b/, 'Français'],
  [/anglais|\benglish\b/, 'Anglais'],
  [/arabe|\barabic\b/, 'Arabe'],
  [/espagnol|\bspanish\b/, 'Espagnol'],
  [/allemand|\bgerman\b/, 'Allemand'],
  [/italien|\btalian\b/, 'Italien'],
  [/chinois|mandarin/, 'Chinois'],
];

const SOFT_RULES = [
  [/rigueur|rigoureux/, 'Rigueur'],
  [/autonomie|autonome/, 'Autonomie'],
  [/esprit d.?equipe|travail en equipe|team spirit/, 'Esprit d’équipe'],
  [/organisation|organise/, 'Organisation'],
  [/sens du service|service client/, 'Sens du service'],
  [/dynamique|dynamisme|motivation/, 'Dynamisme'],
  [/adaptabilite|adaptable/, 'Adaptabilité'],
  [/polyvalence|polyvalent/, 'Polyvalence'],
  [/leadership/, 'Leadership'],
  [/analyse|analytique/, 'Capacité d’analyse'],
  [/communication/, 'Communication'],
];

const MISSION_VERBS = [
  'Assurer', 'Gérer', 'Analyser', 'Optimiser', 'Administrer', 'Sécuriser',
  'Développer', 'Réaliser', 'Participer', 'Suivre', 'Coordonner', 'Préparer',
  'Contrôler', 'Effectuer', 'Maintenir', 'Organiser', 'Superviser', 'Concevoir',
  'Mettre', 'Veiller', 'Garantir', 'Accompagner', 'Conseiller', 'Prospecter',
  'Négocier', 'Vendre', 'Recruter', 'Former', 'Facturer', 'Saisir', 'Traiter',
  'Répondre', 'Accueillir', 'Orienter', 'Animer', 'Piloter', 'Encadrer',
  'Définir', 'Élaborer', 'Rédiger', 'Installer', 'Réparer', 'Dépanner',
  'Monter', 'Démonter', 'Souder', 'Usiner', 'Peindre', 'Conduire', 'Charger',
  'Décharger', 'Livrer', 'Stocker', 'Nettoyer', 'Entretenir', 'Surveiller',
  'Garder', 'Cuisiner', 'Servir', 'Encaisser', 'Classer', 'Archiver',
  'Planifier', 'Approvisionner', 'Réceptionner', 'Expédier', 'Tester',
  'Diagnostiquer', 'Réaliser', 'Assister', 'Conseiller', 'Promouvoir',
];

function descriptionPoints(description, title) {
  let text = cleanText(description);
  if (!text) return [];
  text = text
    .replace(/\b(Voir l'offre|Soyez le premier|Postuler|Nom d.entreprise non renseigné|Offre active Jawb\.ma|BOOST PREMIUM)\b/gi, ' ')
    .replace(/\bIl y a\s+[^.]{0,40}/gi, ' ')
    .replace(/\b(Missions principales|Profil recherché|Profil)\s*:?\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return [];

  const verbRe = new RegExp(`\\s+(?=(?:${MISSION_VERBS.join('|')})\\b)`, 'g');
  text = text.replace(verbRe, '\n');
  const raw = text.split(/\s*[•·▪◦;]\s*|\s*[.!?]\s+|\n+/);
  const titleKey = fold(title);
  const candidates = [];
  for (let part of raw) {
    part = cleanText(part)
      .replace(/^[\s:;,.–—-]+|[\s:;,.–—-]+$/g, '')
      .replace(/\.{2,}$/g, '')
      .trim();
    if (part.length < 18 || part.length > 190) continue;
    if (fold(part) === titleKey) continue;
    if (/^(description|nous recrutons|offre|recrutement|avis|poste|lieu|salaire|contrat|entreprise|societe)\b/i.test(part)) continue;
    if (/voir l.offre|il y a|nom d.entreprise|a negocier|\bdh\b|salaire|postuler|boost premium/i.test(part)) continue;
    if (/^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}/.test(part)) continue;
    if (/\b(des|de|du|la|le|les|un|une|et|ou|pour|afin|en|sur|dans|avec|sans|au|aux|ce|cette|ces|son|sa|ses|leur|leurs)$/i.test(part)) continue;
    if (/^en tant que\b/i.test(part) && part.length < 55) continue;
    if (titleKey && fold(part).startsWith(titleKey) && part.length < titleKey.length + 50
      && !/assurer|gerer|analyser|optimiser|administrer|securiser|developper|realiser|participer|suivre|coordonner|preparer|controler|effectuer|maintenir|organiser|superviser|concevoir|mettre|veiller|garantir|accompagner|conseiller|prospecter|negocier|vendre|recruter|former|facturer|saisir|traiter|repondre|accueillir|orienter|animer|piloter|encadrer|definir|elaborer|rediger|installer|reparer|depanner|monter|demonter|souder|usiner|peindre|conduire|charger|decharger|livrer|stocker|nettoyer|entretenir|surveiller|garder|cuisiner|servir|encaisser|classer|archiver/.test(fold(part))) continue;
    const isIntro = /recrute|societe specialisee|filiale|pour le compte de son client|rejoindre notre equipe|offre de poste|avis de recrutement|cabinet de recrutement|notre client|notre equipe/.test(fold(part));
    if (isIntro) continue;
    const score = /^(assurer|gerer|analyser|optimiser|administrer|securiser|developper|realiser|participer|suivre|coordonner|preparer|controler|effectuer|maintenir|organiser|superviser|concevoir|mettre|veiller|garantir|accompagner|conseiller|prospecter|negocier|vendre|recruter|former|facturer|saisir|traiter|repondre|accueillir|orienter|animer|piloter|encadrer|definir|elaborer|rediger|installer|reparer|depanner|monter|demonter|souder|usiner|peindre|conduire|charger|decharger|livrer|stocker|nettoyer|entretenir|surveiller|garder|cuisiner|servir|encaisser|classer|archiver)/i.test(part) ? 2 : 1;
    candidates.push({ text: part, score });
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, 3).map((item) => item.text);
}

function buildRequirements(job, context) {
  const out = [];
  const add = (value) => {
    const text = cleanText(value);
    if (!text) return;
    if (out.some((item) => fold(item) === fold(text))) return;
    out.push(text);
  };

  // 1. Ce que dit réellement la description.
  for (const point of descriptionPoints(job.description, job.title)) add(point);

  // 2. Compétences, langues et habilitations détectées.
  const skills = unique(SKILL_RULES.filter(([re]) => re.test(context.all)).map(([, label]) => label));
  if (skills.length) add(`Compétences : ${skills.slice(0, 5).join(', ')}`);
  const languages = unique(LANGUAGE_RULES.filter(([re]) => re.test(context.all)).map(([, label]) => label));
  if (languages.length) add(`Langues : ${languages.join(', ')}`);
  const permits = [];
  if (/permis b/.test(context.all)) permits.push('Permis B');
  if (/permis c/.test(context.all)) permits.push('Permis C');
  if (/caces/.test(context.all)) permits.push('CACES');
  if (/habilitation electrique/.test(context.all)) permits.push('Habilitation électrique');
  if (permits.length) add(`Permis / habilitations : ${unique(permits).join(', ')}`);

  // 3. Profil déduit des champs complétés.
  if (context.diploma && !/selon profil|avis officiel/i.test(context.diploma)) add(`Diplôme : ${context.diploma}`);
  if (context.experience && !/selon profil|avis officiel/i.test(context.experience)) add(`Expérience : ${context.experience}`);
  if (context.specialty) add(`Spécialité : ${context.specialty}`);

  // 4. Toujours au moins trois points utiles.
  if (out.length < 3) {
    add(`Poste : ${cleanText(job.title) || 'Profil recherché'}`);
    add(`Lieu : ${cleanText(job.city) || 'Maroc'}`);
    add(`Contrat : ${context.contract}`);
  }

  // 5. Deux qualités humaines seulement si la source les mentionne.
  const soft = unique(SOFT_RULES.filter(([re]) => re.test(context.all)).map(([, label]) => label));
  if (soft.length && out.length < 6) add(`Qualités : ${soft.slice(0, 3).join(', ')}`);

  return out.slice(0, 6);
}

// ---------------------------------------------------------------
// Enrichissement complet
// ---------------------------------------------------------------
const CACHE = new WeakMap();

export function enrichJob(job) {
  if (!job || typeof job !== 'object') return job;
  if (CACHE.has(job)) return CACHE.get(job);

  const title = cleanText(job.title);
  const description = cleanText(job.description);
  const occupation = cleanOccupation(job.occupation);
  const existingRequirements = Array.isArray(job.requirements)
    ? unique(job.requirements.map(cleanText).filter(Boolean)).slice(0, 8)
    : [];

  const roleText = fold([
    title,
    occupation,
    job.fonction,
    job.specialty,
    existingRequirements.join(' '),
  ].join(' '));
  const all = fold([
    title,
    job.company,
    job.city,
    job.contract,
    job.sector,
    job.fonction,
    occupation,
    job.category,
    job.kind,
    job.sourceLabel,
    description,
    existingRequirements.join(' '),
  ].join(' '));

  // Le titre et le métier priment sur la description : une offre
  // « Agent logistique » ne doit pas devenir « Commercial » parce que la
  // description parle d'un client.
  const family = familyFor(roleText) || familyFor(all);
  const inferred = {};

  let contract = normalizeContract(job.contract);
  if (!contract) { contract = inferContract(job, all); inferred.contract = true; }

  let diploma = normalizeDiploma(job.diploma);
  if (!diploma) { diploma = inferDiploma(job, all); inferred.diploma = true; }

  let experience = normalizeExperience(job.experience);
  if (!experience) { experience = inferExperience(job, all); inferred.experience = true; }

  let specialty = cleanText(job.specialty);
  if (!specialty) { specialty = inferSpecialty(job, all, family, occupation); inferred.specialty = true; }

  let sector = cleanText(job.sector);
  if (sector) sector = sector.split(/\s+-\s+/)[0].trim();
  if (/^indifferent$/i.test(fold(sector))) sector = '';
  if (!sector) { sector = inferSector(job, all, family, fold(job.company)); inferred.sector = true; }

  let fonction = cleanText(job.fonction);
  if (!fonction) { fonction = inferFonction(job, occupation, family); inferred.fonction = true; }

  let requirements = existingRequirements;
  let reqGenerated = false;
  if (!requirements.length) {
    requirements = buildRequirements(job, { all, contract, diploma, experience, specialty });
    reqGenerated = true;
    inferred.requirements = true;
  }

  const enriched = {
    ...job,
    contract,
    diploma,
    experience,
    specialty,
    sector,
    fonction,
    requirements,
    _inferred: inferred,
    _inferredCount: Object.keys(inferred).length,
    _reqGenerated: reqGenerated,
  };
  CACHE.set(job, enriched);
  return enriched;
}

export function enrichJobs(list) {
  return Array.isArray(list) ? list.map(enrichJob) : [];
}
