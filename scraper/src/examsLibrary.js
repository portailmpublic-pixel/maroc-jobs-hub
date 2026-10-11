// Exams Library: real downloadable practice files for every concours offer.
// Generates one PDF "dossier d'entraînement" per offer x per year (last 5 years),
// cached on disk. Zero dependency: minimal built-in PDF writer (WinAnsi).
const fs = require('fs');
const path = require('path');
const { load } = require('./db');
const { clean, fold, slug } = require('./utils');
const { last5Years } = require('./exams');

const LIB_DIR = path.join(__dirname, '..', 'data', 'exams-library');
const LIB_V = 7;

function ensureDir() {
  try { fs.mkdirSync(LIB_DIR, { recursive: true }); } catch {}
}

// ---------- specialty family detection ----------
function familyOf(job) {
  const b = fold([job.specialty, job.fonction, job.title].join(' '));
  if (/informatique|developpement|logiciel|reseau|systeme|data|digital|telecom/.test(b)) return 'info';
  if (/administrat|gestion|compta|finance|jurid|rh\b|ressources|secretar|assistant/.test(b)) return 'gestion';
  if (/enseign|education|professeur|maitre|pedagog|formation|universit|chercheur|conference/.test(b)) return 'education';
  if (/sante|pharma|medic|infirmier|soignant|hopital|biolog/.test(b)) return 'sante';
  if (/technicien|maintenance|electri|mecanic|genie|bâtiment|travaux|ouvrier|atelier/.test(b)) return 'technique';
  return 'generic';
}

const FAMILY_LABEL = {
  info: 'Informatique / Développement',
  gestion: 'Administration / Gestion',
  education: 'Éducation / Enseignement',
  sante: 'Santé / Pharmacie',
  technique: 'Technique / Maintenance',
  generic: 'Culture générale + logique',
};

// ---------- QCM banks: 12 per family, 10 picked per year (rotation) ----------
function bank(fam) {
  const B = {
    info: [
      ["Un algorithme se caractérise d'abord par :", ["sa longueur", "une suite finie d'instructions non ambiguës", "son langage", "sa vitesse"], 1, "Un algorithme = séquence finie, précise et ordonnée d'opérations."],
      ["La complexité O(n log n) est typique :", ["du tri à bulles", "du tri fusion (merge sort)", "de la recherche linéaire", "d'une boucle simple"], 1, "Le tri fusion divise (log n) puis fusionne (n)."],
      ["En SQL, pour éviter les doublons on utilise :", ["GROUP BY", "ORDER BY", "SELECT DISTINCT", "HAVING"], 2, "DISTINCT élimine les lignes en double du résultat."],
      ["Une clé primaire doit être :", ["modifiable souvent", "unique et non nulle", "toujours numérique", "partagée"], 1, "Unicite + NOT NULL = identifiant fiable de la ligne."],
      ["Le protocole HTTPS repose sur :", ["FTP", "TLS/SSL", "SMTP", "DHCP"], 1, "TLS chiffre la communication HTTP (port 443)."],
      ["En POO, l'encapsulation consiste à :", ["hériter deux classes", "masquer l'état interne derrière des méthodes", "dupliquer le code", "supprimer les objets"], 1, "Attributs privés + accesseurs = couplage faible."],
      ["Git : la commande qui enregistre un instantané local est :", ["git push", "git commit", "git clone", "git fetch"], 1, "commit = photo locale ; push = envoi distant."],
      ["Une adresse IPv4 comporte :", ["64 bits", "32 bits", "128 bits", "16 bits"], 1, "4 octets = 32 bits (ex : 192.168.1.1)."],
      ["Lequel est un SGBD relationnel :", ["MongoDB", "Redis", "PostgreSQL", "Neo4j"], 2, "PostgreSQL = tables + SQL + ACID."],
      ["Tester d'abord, coder ensuite : c'est :", ["le debug", "le TDD", "le refactoring", "le versioning"], 1, "Test-Driven Development : test rouge, vert, refactor."],
      ["Le DNS sert à :", ["chiffrer les mails", "traduire un nom de domaine en adresse IP", "compresser les images", "filtrer le spam"], 1, "DNS = annuaire (ex : domaine -> 93.184.216.34)."],
      ["Une sauvegarde 3-2-1 signifie :", ["3 copies, 2 supports différents, 1 hors site", "3 jours de rétention", "2 serveurs, 1 switch", "1 seul fichier zip"], 0, "Règle de résilience contre panne + rançongiciel."],
    ],
    gestion: [
      ["Un budget prévisionnel sert à :", ["constater le passé", "anticiper recettes et dépenses", "payer les impôts", "clôturer l'exercice"], 1, "Pilotage : prévoir, comparer réalisé vs prévu, ajuster."],
      ["L'amortissement linéaire d'un bien sur 5 ans donne un taux de :", ["10 %", "20 %", "25 %", "5 %"], 1, "100 / 5 = 20 % par an."],
      ["Un acte administratif unilatéral est :", ["un contrat signé", "une décision imposée par l'administration", "un jugement", "une facture"], 1, "Ex : arrêté, décision de nomination."],
      ["Le principe de continuité du service public impose :", ["la grève totale", "un fonctionnement régulier et continu", "la fermeture annuelle", "le bénévolat"], 1, "Le service ne doit pas s'interrompre brutalement."],
      ["En comptabilite, le bilan oppose :", ["charges et produits", "actif et passif", "débit et avoir", "brut et net"], 1, "Actif (emplois) = Passif (ressources)."],
      ["La TVA collectée moins la TVA déductible donne :", ["la TVA à décaisser", "le chiffre d'affaires", "le résultat net", "la marge brute"], 0, "Seule la valeur ajoutee est reversée à l'État."],
      ["Un marché public garantit notamment :", ["le gré à gré systématique", "l'égalité d'accès et la transparence", "le secret des prix", "l'absence de contrôle"], 1, "Principes : liberté d'accès, égalité, transparence."],
      ["Le tableau de bord de gestion sert à :", ["archiver les factures", "suivre des indicateurs et décider", "payer les salaires", "recruter"], 1, "Indicateurs synthétiques = aide à la décision."],
      ["Un organigramme représente :", ["les flux de trésorerie", "la structure hiérarchique", "le plan comptable", "les horaires"], 1, "Qui depend de qui, quelles unités."],
      ["La séparation ordonnateur / comptable vise à :", ["ralentir les paiements", "prévenir les détournements", "doubler les salaires", "centraliser tout"], 1, "Celui qui ordonne ne manie pas les fonds."],
      ["Un PV de réunion doit contenir au minimum :", ["la météo du jour", "date, participants, décisions", "les blagues échangées", "le menu"], 1, "Traçabilité : qui était la, quoi décidé, qui fait quoi."],
      ["Le classement chrono d'un courrier repose sur :", ["la couleur du papier", "l'ordre des dates", "le nom du signataire", "le hasard"], 1, "Tri antichrono le plus courant (recent d'abord)."],
    ],
    education: [
      ["La taxonomie de Bloom place au sommet :", ["mémoriser", "comprendre", "créer/évaluer", "appliquer"], 2, "Du bas (mémoire) vers le haut (creation)."],
      ["Une évaluation diagnostique se fait :", ["en fin d'année", "avant l'apprentissage", "pendant l'examen final", "après le diplôme"], 1, "Elle repère les acquis et besoins initiaux."],
      ["La différenciation pédagogique consiste à :", ["donner le même exercice à tous", "adapter selon besoins et rythmes", "supprimer les devoirs", "noter plus sévèrement"], 1, "Même objectif, chemins variés."],
      ["Un objectif SMART doit être notamment :", ["secret", "mesurable", "modeste", "solitaire"], 1, "Spécifique, Mesurable, Atteignable, Réaliste, Temporel."],
      ["Le travail en groupe développe d'abord :", ["la compétition", "la coopération et la communication", "l'isolement", "la triche"], 1, "Conflit socio-cognitif = progrès."],
      ["La remédiation intervient :", ["avant tout cours", "après un constat de difficulté", "à la place du cours", "jamais"], 1, "Re-enseigner autrement ce qui bloque."],
      ["Un portfolio d'apprentissage permet à l'élève de :", ["tricher", "suivre et montrer ses progrès", "dormir", "copier"], 1, "Collection réfléchie de traces + auto-évaluation."],
      ["La classe inversée consiste à :", ["supprimer le professeur", "découvrir le cours à la maison, pratiquer en classe", "inverser les notes", "changer de salle"], 1, "Le temps de classe sert à l'entraînement guide."],
      ["Un QCM bien construit évite :", ["les distracteurs plausibles", "les indices involontaires", "les consignes claires", "le barème"], 1, "Options homogènes, sans donner la réponse."],
      ["L'étayage (scaffolding) signifie :", ["laisser l'élève seul", "soutenir puis retirer l'aide progressivement", "punir", "noter"], 1, "Aide ajustee à la zone proximale de développement."],
      ["Le climat de classe influence :", ["rien du tout", "l'engagement et les résultats", "seulement le bruit", "la cantine"], 1, "Sécurité affective = disponibilité cognitive."],
      ["Évaluer une compétence, c'est observer :", ["la récitation", "la mobilisation de ressources en situation", "l'écriture", "le silence"], 1, "Agir avec pertinence face à une situation complexe."],
    ],
    sante: [
      ["L'asepsie vise à :", ["tuer tous les microbes partout", "prévenir l'apport de micro-organismes", " Guérir les plaies", "désinfecter l'air uniquement"], 1, "Prévention (mains, matériel stérile) avant tout geste."],
      ["La tension arterielle normale d'un adulte est d'environ :", ["9/5", "12/8", "18/12", "22/14"], 1, "120/80 mmHg au repos."],
      ["Le lavage hygiénique des mains dure au minimum :", ["5 secondes", "30 secondes", "3 minutes", "10 minutes"], 1, "30 s savon ou friction hydro-alcoolique."],
      ["Un médicament générique est :", ["moins efficace", "bioéquivalent au princeps", "sans principe actif", "interdit"], 1, "Même principe actif, même dosage, moins cher."],
      ["La chaîne du froid des vaccins impose environ :", ["+2 à +8 C", "-20 C", "+20 C", "0 C pile"], 0, "Rupture = perte d'efficacité, à tracer."],
      ["Devant une hémorragie externe, premier geste :", ["garrot systématique", "compression directe", "pansement serré lâche", "rien"], 1, "Compriment + appel secours ; garrot si échec."],
      ["L'IMC se calcule par :", ["poids / taille", "poids / taille au carre", "taille / poids", "poids + taille"], 1, "kg / m2 ; normal entre 18,5 et 25."],
      ["Le secret professionnel du soignant :", ["n'existe pas", "protege les infos du patient", "ne couvre que le médecin", "cesse au décès"], 1, "Déontologie + loi, sauf exceptions légales."],
      ["Un effet indésirable grave doit être :", ["caché", "déclaré (pharmacovigilance)", "ignoré", "payé"], 1, "Tout effet suspect = signalement."],
      ["La glycémie normale à jeun est d'environ :", ["0,4 g/L", "1 g/L", "2,5 g/L", "5 g/L"], 1, "0,7 à 1,1 g/L ; diabète si >= 1,26 à deux reprises."],
      ["La désinfection diffère de la stérilisation car elle :", ["détruit tout", "réduit sans tout éliminer (spores)", "ne sert à rien", "ne concerne que l'eau"], 1, "Stérile = absence totale de micro-organismes viables."],
      ["Le tri des déchets de soins (DASRI) utilise des sacs :", ["noirs", "jaunes", "verts", "transparents"], 1, "Jaune = infectieux, filière dédiée."],
    ],
    technique: [
      ["La loi d'Ohm s'ecrit :", ["P = U x I", "U = R x I", "E = m c2", "F = m a"], 1, "Tension = résistance x intensité."],
      ["En triphasé 400 V, la tension simple vaut environ :", ["400 V", "230 V", "110 V", "690 V"], 1, "400 / racine(3) ~ 230 V."],
      ["Un disjoncteur protege contre :", ["les coupures EDF", "surcharges et courts-circuits", "la foudre uniquement", "les vols"], 1, "Magnetique (court-circuit) + thermique (surcharge)."],
      ["L'habilitation électrique HTA concerne :", ["la basse tension", "la haute tension", "le gaz", "l'eau"], 1, "H = haute tension, délivrée par l'employeur."],
      ["Un EPI en atelier, c'est :", ["un logiciel", "un equipement de protection individuelle", "une machine", "un syndicat"], 1, "Casque, gants, lunettes, chaussures de sécurité."],
      ["La maintenance préventive se fait :", ["après la panne", "avant la panne, planifiée", "jamais", "au hasard"], 1, "Visites systématiques = moins d'arrêts."],
      ["Un plan en coupe montre :", ["l'extérieur du bâtiment", "l'intérieur tranche verticalement", "le budget", "le planning"], 1, "Hauteurs, niveaux, épaisseurs visibles."],
      ["Le béton armé associe :", ["bois et verre", "béton (compression) et acier (traction)", "plâtre et peinture", "sable et eau"], 1, "Complémentarité mécanique des deux matériaux."],
      ["Souder TIG utilise comme gaz de protection :", ["l'oxygène", "l'argon", "l'hydrogène", "l'air"], 1, "Gaz inerte anti-oxydation du bain de fusion."],
      ["Un manomètre mesure :", ["la température", "la pression", "le débit", "le niveau"], 1, "Ex : pression d'un circuit hydraulique."],
      ["Avant toute intervention, la consignation impose :", ["de se dépêcher", "séparer, condamner, vérifier l'absence", "de couper à la main", "rien"], 2, "VAT (vérificateur d'absence de tension) obligatoire."],
      ["Le couple de serrage se mesure en :", ["bars", "newton-mètres", "watts", "decibels"], 1, "Clé dynamométrique = serrage maîtrise."],
    ],
    generic: [
      ["La Constitution marocaine en vigueur date de :", ["1996", "2011", "2021", "1962"], 1, "Referendum du 1er juillet 2011."],
      ["Le Parlement marocain comprend :", ["une seule chambre", "deux chambres", "trois chambres", "aucune"], 1, "Chambre des représentants + Chambre des conseillers."],
      ["La région est une collectivite territoriale depuis :", ["2015", "1971", "2000", "2020"], 0, "Regionalisation avancée : 12 régions."],
      ["Un dahir est :", ["une loi votée", "un acte royal", "un arrêté ministériel", "un jugement"], 1, "Signé par le Roi, publié au Bulletin officiel."],
      ["La fonction publique repose notamment sur :", ["le piston", "le mérite et l'égalité d'accès", "le hasard", "l'ancienneté seule"], 1, "Concours = mérite, transparence."],
      ["Lequel est un droit fondamental :", ["conduire sans permis", "l'éducation", "stationner partout", "tout photographier"], 1, "Droits : education, sante, expression..."],
      ["Le dirham marocain est géré par :", ["le FMI", "Bank Al-Maghrib", "la Bourse", "les banques privées"], 1, "Banque centrale = politique monétaire."],
      ["L'echelle d'une carte 1/100 000 signifie :", ["1 cm = 100 km", "1 cm = 1 km", "1 cm = 100 m", "1 cm = 10 km"], 1, "1 cm carte = 100 000 cm terrain = 1 km."],
      ["Si 3 ouvriers font un mur en 6 jours, 6 ouvriers (même rythme) en :", ["12 jours", "3 jours", "6 jours", "9 jours"], 1, "Proportionnalite inverse : double effectif = moitié du temps."],
      ["La suite 2, 6, 12, 20, ... : le terme suivant est :", ["28", "30", "24", "36"], 1, "Écarts +4, +6, +8, +10 -> 30."],
      ["Le contraire de 'ephemere' est :", ["bref", "durable", "rapide", "leger"], 1, "Ephemere = qui dure très peu."],
      ["Un texte argumentatif cherche à :", ["raconter", "convaincre", "décrire", "divertir"], 1, "Thèse + arguments + exemples."],
    ],
  };
  return B[fam] || B.generic;
}

function courseQuestions(fam) {
  const Q = {
    info: [
      "Expliquez la différence entre une base SQL et NoSQL, avec un exemple d'usage de chacune.",
      "Décrivez les étapes d'une mise en production sans interruption de service.",
      "Qu'est-ce que l'injection SQL et comment s'en proteger (3 mesures) ?",
    ],
    gestion: [
      "Distinguez ordonnateur et comptable public, et expliquez l'intérêt de leur séparation.",
      "Présentez les étapes d'élaboration d'un budget annuel d'un service.",
      "Qu'est-ce qu'un marché public ? Citez ses grands principes.",
    ],
    education: [
      "Définissez la différenciation pédagogique et donnez 2 exemples concrets.",
      "Qu'est-ce qu'une évaluation formative ? En quoi diffère-t-elle du contrôle sommatif ?",
      "Proposez une séance de 55 minutes incluant un travail de groupe.",
    ],
    sante: [
      "Décrivez la conduite à tenir devant un patient fébrile aux urgences (tri, constantes, hygiène).",
      "Expliquez la chaîne du froid vaccinale et les risques de rupture.",
      "Citez 5 règles d'hygiène des mains et quand les appliquer.",
    ],
    technique: [
      "Décrivez la procédure de consignation électrique avant intervention.",
      "Expliquez la différence entre maintenance préventive et corrective (exemples).",
      "Lisez un plan : que vérifiez-vous avant de lancer des travaux ?",
    ],
    generic: [
      "Présentez l'organisation administrative du Maroc (État, régions, communes).",
      "Expliquez le principe du concours dans la fonction publique.",
      "Rédigez un paragraphe argumenté : pourquoi le service public exige-t-il exemplarité ?",
    ],
  };
  return Q[fam] || Q.generic;
}

function caseStudy(fam, year) {
  const C = {
    info: `Étude de cas ${year} : une commune veut numériser ses demandes d'actes (naissance, résidence). 1) Proposez une architecture simple (base, API, hébergement). 2) Listez 5 exigences de sécurité. 3) Plan de déploiement en 4 phases avec délais.`,
    gestion: `Étude de cas ${year} : votre direction constate un dépassement budgétaire de 12 % au 1er semestre. 1) Analysez 3 causes possibles. 2) Proposez un plan d'économies chiffré. 3) Rédigez la note au directeur (10 lignes).`,
    education: `Étude de cas ${year} : une classe de 38 élèves, 10 en difficulté de lecture. 1) Diagnostic (outils). 2) Plan de remédiation sur 6 semaines. 3) Comment évaluez-vous le progrès ?`,
    sante: `Étude de cas ${year} : campagne de vaccination en milieu rural (2000 personnes). 1) Logistique et chaîne du froid. 2) Équipe et rôles. 3) Communication et suivi des effets.`,
    technique: `Étude de cas ${year} : pannes répétitives d'un groupe froid d'un bâtiment public. 1) Diagnostic méthodique (5 vérifications). 2) Plan de maintenance préventive annuelle. 3) Devis estimatif des pièces.`,
    generic: `Étude de cas ${year} : grand afflux au guichet d'une administration (300 usagers/jour). 1) Diagnostic de l'attente. 2) Reorganisation (tickets, plages, agents). 3) 3 indicateurs de suivi.`,
  };
  return C[fam] || C.generic;
}

// ---------- minimal PDF writer ----------
const WINANSI_EXTRA = { '€': 128, '‚': 130, '„': 132, '…': 133, '†': 134, '‡': 135, '‰': 137, 'Š': 138, '‹': 139, 'Œ': 140, '‘': 145, '’': 146, '“': 147, '”': 148, '•': 149, '–': 150, '—': 151, '˜': 152, '™': 153, 'š': 154, '›': 155, 'œ': 156, 'Ÿ': 159, '«': 171, '»': 187 };
function sanitize(s) {
  return String(s || '')
    .replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...')
    .replace(/[↗↘✓☐☑⚠✅❌⏰📕🔗📅🎯📋]/g, '')
    .normalize('NFC');
}
function pdfEscape(s) {
  s = sanitize(s);
  let out = '';
  for (const ch of s) {
    const code = ch.codePointAt(0);
    if (ch === '(' || ch === ')' || ch === '\\') { out += '\\' + ch; continue; }
    if (code < 128) { out += ch; continue; }
    if (WINANSI_EXTRA[ch] !== undefined) { out += String.fromCharCode(WINANSI_EXTRA[ch]); continue; }
    if (code >= 192 && code <= 255) { out += ch; continue; }
    out += '?';
  }
  return out;
}
function toBytes(s) {
  const buf = Buffer.alloc(s.length);
  for (let i = 0; i < s.length; i++) buf[i] = s.charCodeAt(i) & 0xff;
  return buf;
}
function wrap(text, maxChars) {
  const words = sanitize(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxChars) {
      if (cur) lines.push(cur);
      cur = w.length > maxChars ? w.slice(0, maxChars) : w;
      let rest = w.length > maxChars ? w.slice(maxChars) : '';
      while (rest) { lines.push(rest.slice(0, maxChars)); rest = rest.slice(maxChars); }
      if (w.length > maxChars) cur = '';
    } else {
      cur = (cur + ' ' + w).trim();
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

function buildPdfDoc(title, blocks) {
  // blocks: {style:'title'|'h1'|'h2'|'p'|'bullet'|'q'|'opt'|'answer'|'hr'|'space', text}
  const W = 595, H = 842, ML = 56, MR = 56, TOP = 60, BOT = 56;
  const pages = [];
  let ops = [];
  let y = H - TOP;
  const lineH = (size) => size * 1.42;
  function need(h) {
    if (y - h < BOT) {
      pages.push(ops);
      ops = [];
      y = H - TOP;
    }
  }
  function textLine(str, x, size, bold) {
    need(lineH(size));
    ops.push(`BT /F${bold ? 'B' : 'R'} ${size} Tf ${x.toFixed(1)} ${y.toFixed(1)} Td (${pdfEscape(str)}) Tj ET`);
    y -= lineH(size);
  }
  const CONTENT_W = W - ML - MR;
  function para(str, size, opts = {}) {
    const maxChars = Math.floor(CONTENT_W / (size * 0.52));
    for (const ln of wrap(str, maxChars)) textLine(ln, ML + (opts.indent || 0), size, !!opts.bold);
  }
  for (const b of blocks) {
    if (b.style === 'space') { y -= 8; continue; }
    if (b.style === 'hr') {
      need(14);
      ops.push(`0.6 0.65 0.9 RG 0.8 w ${ML} ${y.toFixed(1)} m ${W - MR} ${y.toFixed(1)} l S`);
      y -= 12;
      continue;
    }
    if (b.style === 'title') {
      y -= 4;
      for (const ln of wrap(b.text, 34)) textLine(ln, ML, 20, true);
      y -= 4;
      continue;
    }
    if (b.style === 'h1') {
      y -= 6;
      for (const ln of wrap(b.text, 58)) textLine(ln, ML, 13, true);
      y -= 2;
      continue;
    }
    if (b.style === 'h2') {
      y -= 4;
      for (const ln of wrap(b.text, 66)) textLine(ln, ML, 11, true);
      continue;
    }
    if (b.style === 'bullet') { para('- ' + b.text, 10, { indent: 10 }); continue; }
    if (b.style === 'q') { y -= 2; para(b.text, 10, { bold: true }); continue; }
    if (b.style === 'opt') { para(b.text, 10, { indent: 16 }); continue; }
    if (b.style === 'answer') { para(b.text, 9.5, { indent: 16 }); continue; }
    para(b.text, 10);
  }
  pages.push(ops);

  // Assemble PDF with footer page numbers.
  // Object numbering: 1=catalog, 2=pages, 3=font regular, 4=font bold,
  // 5=shared ToUnicode CMap, then per page: dict (6,8,10...) + stream (7,9,11...).
  // /Encoding /WinAnsiEncoding + /ToUnicode guarantee correct display AND
  // correct copy-paste of accented letters in every viewer.
  const WINANSI_U = { 0x80: '20AC', 0x82: '201A', 0x83: '0192', 0x84: '201E', 0x85: '2026', 0x86: '2020', 0x87: '2021', 0x88: '02C6', 0x89: '2030', 0x8A: '0160', 0x8B: '2039', 0x8C: '0152', 0x8E: '017D', 0x91: '2018', 0x92: '2019', 0x93: '201C', 0x94: '201D', 0x95: '2022', 0x96: '2013', 0x97: '2014', 0x98: '02DC', 0x99: '2122', 0x9A: '0161', 0x9B: '203A', 0x9C: '0153', 0x9E: '017E', 0x9F: '0178' };
  let bf = '';
  for (let b = 0x20; b <= 0xff; b++) {
    const hx = b.toString(16).padStart(2, '0');
    bf += `<${hx}> <${WINANSI_U[b] || b.toString(16).padStart(4, '0')}>\n`;
  }
  const cmap = `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<00> <FF>\nendcodespacerange\n224 beginbfchar\n${bf}endbfchar\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n`;
  const objects = [];
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  const kidRefs = pages.map((_, i) => `${6 + i * 2} 0 R`).join(' ');
  objects.push(`<< /Type /Pages /Kids [${kidRefs}] /Count ${pages.length} >>`);
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding /ToUnicode 5 0 R >>');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding /ToUnicode 5 0 R >>');
  objects.push(`<< /Length ${toBytes(cmap).length} >>\nstream\n${cmap}endstream`);
  pages.forEach((pageOps, idx) => {
    const footer = `BT /FR 8 Tf ${ML.toFixed(1)} 32 Td (Page ${idx + 1}/${pages.length} - Maroc Jobs Hub - Dossier d'entrainement) Tj ET`;
    const stream = pageOps.join('\n') + '\n' + footer + '\n';
    const len = toBytes(stream).length;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /FR 3 0 R /FB 4 0 R >> >> /Contents ${6 + idx * 2 + 1} 0 R >>`);
    objects.push(`<< /Length ${len} >>\nstream\n${stream}endstream`);
  });
  let pdf = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(toBytes(pdf).length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefPos = toBytes(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return { buffer: toBytes(pdf), pages: pages.length };
}

// ---------- pack content ----------
function pickQcm(fam, year) {
  const b = bank(fam);
  const out = [];
  // step 5 is coprime with 12 -> 10 distinct questions, year-shifted
  for (let i = 0; i < 10; i++) out.push(b[(year * 7 + i * 5) % b.length]);
  return out;
}
const LETTERS = ['A', 'B', 'C', 'D'];

function headBlocks(job, year, fam) {
  const title = clean(String(job.title || '').replace(/^concours\s*[—–-]\s*/i, '')) || 'Concours';
  const org = job.company || 'Fonction publique';
  const spec = job.specialty || job.fonction || FAMILY_LABEL[fam];
  return { title, org, spec };
}

function sujetBlocks(job, year, fam) {
  const { title, org, spec } = headBlocks(job, year, fam);
  const qcm = pickQcm(fam, year);
  const cours = courseQuestions(fam);
  const blocks = [
    { style: 'title', text: `Concours - Sujet d'entraînement ${year}` },
    { style: 'p', text: `${title}` },
    { style: 'p', text: `Organisme : ${org}  |  Spécialité : ${spec}` },
    { style: 'p', text: `Domaine : ${FAMILY_LABEL[fam]}  |  Durée indicative : 2h  |  Barème : QCM 10 pts + Rédaction 6 pts + Cas 4 pts` },
    { style: 'hr' },
    { style: 'p', text: `Consignes : répondez d'abord seul et en temps limite. Cochez une seule réponse par QCM. Le corrigé détaillé est dans le fichier Corrigé séparé — à consulter après l'épreuve.` },
    { style: 'h1', text: `PARTIE 1 - QCM (10 points, 1 pt / question)` },
  ];
  qcm.forEach(([q, opts, ,], i) => {
    blocks.push({ style: 'q', text: `Q${i + 1}. ${q}` });
    opts.forEach((o, j) => blocks.push({ style: 'opt', text: `[ ] ${LETTERS[j]}. ${o}` }));
    blocks.push({ style: 'space' });
  });
  blocks.push({ style: 'h1', text: 'PARTIE 2 - Questions de cours (6 points, 2 pts / question)' });
  cours.forEach((c, i) => {
    blocks.push({ style: 'q', text: `C${i + 1}. ${c}` });
    blocks.push({ style: 'p', text: '(Réponse rédigée : 8 à 12 lignes attendues.)' });
    blocks.push({ style: 'space' });
  });
  blocks.push({ style: 'h1', text: 'PARTIE 3 - Étude de cas pratique (4 points)' });
  blocks.push({ style: 'p', text: caseStudy(fam, year) });
  blocks.push({ style: 'space' });
  blocks.push({ style: 'p', text: `Fin du sujet — ouvrez le fichier Corrigé ${year} pour vérifier vos réponses.` });
  return { blocks, qcmCount: qcm.length };
}

function corrigeBlocks(job, year, fam) {
  const { title, org, spec } = headBlocks(job, year, fam);
  const qcm = pickQcm(fam, year);
  const blocks = [
    { style: 'title', text: `Concours - Corrigé ${year}` },
    { style: 'p', text: `${title}` },
    { style: 'p', text: `Organisme : ${org}  |  Spécialité : ${spec}` },
    { style: 'p', text: `Domaine : ${FAMILY_LABEL[fam]}  |  À consulter après avoir traité le Sujet ${year}.` },
    { style: 'hr' },
    { style: 'h1', text: `CORRIGÉ QCM - bonnes réponses` },
  ];
  qcm.forEach(([q, opts, ans, why], i) => {
    blocks.push({ style: 'answer', text: `Q${i + 1}. ${LETTERS[ans]}. ${opts[ans]} -- ${why}` });
  });
  blocks.push({ style: 'space' });
  blocks.push({ style: 'h2', text: 'Éléments de corrigé (cours + cas) :' });
  blocks.push({ style: 'bullet', text: 'C1 : définir les notions clés, citer le cadre (loi/texte ou référence technique), donner 1 exemple marocain.' });
  blocks.push({ style: 'bullet', text: 'C2 : structurer en 3 temps (constat / méthode / résultat) avec chiffres ou délais.' });
  blocks.push({ style: 'bullet', text: 'C3 : proposer un plan d’action concret, nommer les acteurs et les indicateurs de suivi.' });
  blocks.push({ style: 'bullet', text: 'Cas : noter la démarche (diagnostic, solution, planning, contrôle) autant que le résultat final.' });
  blocks.push({ style: 'space' });
  blocks.push({ style: 'h2', text: 'Conseils méthode :' });
  blocks.push({ style: 'bullet', text: 'Lisez tout le sujet en 5 minutes puis commencez par ce que vous maîtrisez.' });
  blocks.push({ style: 'bullet', text: 'QCM : éliminez 2 options avant de trancher ; ne laissez aucune case vide.' });
  blocks.push({ style: 'bullet', text: 'Rédaction : phrases courtes, vocabulaire du domaine, conclusion en 2 lignes.' });
  blocks.push({ style: 'bullet', text: 'Refaites ce dossier à J-7 puis à J-1 pour ancrer les réflexes.' });
  return { blocks, qcmCount: qcm.length };
}

function packBlocks(job, year, fam) {
  const s = sujetBlocks(job, year, fam);
  const c = corrigeBlocks(job, year, fam);
  // full pack = sujet + corrigé (kept for compatibility)
  return { blocks: [...s.blocks, ...c.blocks.slice(4)], qcmCount: s.qcmCount };
}

function fileNameFor(job, year, kind = 'sujet') {
  const base = slug(`${job.company || 'concours'}-${job.specialty || job.fonction || 'general'}`.slice(0, 50)) || 'concours';
  // NOTE: keep ASCII-only (Content-Disposition + disk safety) — display title carries accents instead
  const prefix = kind === 'corrige' ? 'Corrige' : 'Epreuve';
  return `${prefix}-${year}-${base}-v${LIB_V}.pdf`;
}

function diskName(job, year, kind = 'sujet') {
  return `${job.id}-${year}-${kind}-v${LIB_V}.pdf`;
}

function normKind(k) {
  return k === 'corrige' ? 'corrige' : 'sujet';
}

function listLibrary(job) {
  ensureDir();
  const out = [];
  for (const year of last5Years()) {
    for (const kind of ['sujet', 'corrige']) {
      const fp = path.join(LIB_DIR, diskName(job, year, kind));
      let size = null;
      try { size = fs.statSync(fp).size; } catch {}
      out.push({
        year,
        kind,
        title: kind === 'corrige'
          ? `Corrigé ${year} - ${job.specialty || job.fonction || 'Concours'}`
          : `Sujet d'entraînement ${year} - ${job.specialty || job.fonction || 'Concours'}`,
        detail: kind === 'corrige' ? 'Corrigé détaillé + méthode' : '10 QCM + 3 cours + 1 cas',
        filename: fileNameFor(job, year, kind),
        url: `/api/exams/file?offerId=${encodeURIComponent(job.id)}&year=${year}&part=${kind}`,
        size,
        ready: size !== null,
      });
    }
  }
  return out;
}

function getOrBuild(job, year, kind = 'sujet') {
  ensureDir();
  kind = normKind(kind);
  const fp = path.join(LIB_DIR, diskName(job, year, kind));
  try {
    const buf = fs.readFileSync(fp);
    if (buf.slice(0, 5).toString() === '%PDF-') return { buffer: buf, filename: fileNameFor(job, year, kind), kind };
  } catch {}
  const fam = familyOf(job);
  const { blocks } = kind === 'corrige' ? corrigeBlocks(job, Number(year), fam) : sujetBlocks(job, Number(year), fam);
  const title = `${kind === 'corrige' ? 'Corrigé' : 'Sujet'} ${year} - ${job.company || ''}`;
  const { buffer } = buildPdfDoc(title, blocks);
  try { fs.writeFileSync(fp, buffer); } catch {}
  return { buffer, filename: fileNameFor(job, year, kind), kind };
}

function findJob(offerId) {
  const jobs = load().jobs;
  return jobs.find((j) => j.id === offerId && j.kind === 'concours') || jobs.find((j) => j.id === offerId) || null;
}

module.exports = { familyOf, FAMILY_LABEL, listLibrary, getOrBuild, findJob, fileNameFor, diskName, LIB_DIR, LIB_V };
