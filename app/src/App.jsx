import React, { useEffect, useMemo, useRef, useState } from 'react';

const DEFAULT_REMOTE = 'https://raw.githubusercontent.com/portailmpublic-pixel/maroc-jobs-hub/master/app/public/jobs.json';
const LS_REMOTE = 'mjh_remote_url';
const LS_SEEN = 'mjh_alerts_seen';

const ICONS = {
  menu: <path d="M4 7h16M4 12h10M4 17h16" />,
  refresh: <><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></>,
  sliders: <><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="3" /><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 13h18" /></>,
  cap: <><path d="m2 9 10-5 10 5-10 5z" /><path d="M6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5M22 9v6" /></>,
  landmark: <><path d="M3 10 12 4l9 6" /><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" /></>,
  file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>,
  chart: <path d="M5 20v-9M12 20V4M19 20v-6" />,
  bell: <><path d="M6 9a6 6 0 1 1 12 0c0 6 2 7.5 2 7.5H4S6 15 6 9z" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
  building: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h2M13 8h2M9 12h2M13 12h2M10 21v-4h4v4" /></>,
  pin: <><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  arrow: <path d="M7 17 17 7M8 7h9v9" />,
  download: <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  plug: <path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4" />,
  scale: <><path d="M12 3v3M7 6l-3.2 6.4a3.2 3.2 0 0 0 6.4 0L7 6zM17 6l-3.2 6.4a3.2 3.2 0 0 0 6.4 0L17 6zM8.5 21h7M12 12v9" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m3.5 8 8.5 6 8.5-6" /></>,
  phone: <path d="M5 4h4l1.8 4.2-2.2 1.4a11.5 11.5 0 0 0 4.8 4.8l1.4-2.2L19 14v4a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z" />,
  gavel: <><path d="m5 9 4 4M9.5 4.5 14 9M12.5 7.5l4.5 4.5M4 20h9M15 14l5-5M18.5 17.5 21 15" /></>,
};

function Icon({ n, size = 20 }) {
  return (
    <svg className="ic" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[n]}</svg>
  );
}

function hueOf(s) { return ((String(s || '?').charCodeAt(0) || 63) * 47) % 360; }

function daysUntil(deadline) {
  if (!deadline) return null;
  const d = new Date(deadline + 'T23:59:59');
  if (isNaN(d)) return null;
  const now = new Date();
  return Math.ceil((d - now) / 86400000);
}

function deadlineInfo(j) {
  const d = daysUntil(j.deadline);
  if (!j.deadline) return { label: 'Sans limite', cls: 'b-muted' };
  if (d === null) return { label: j.deadline, cls: 'b-muted' };
  if (d < 0) return { label: `Clôturé • ${j.deadline}`, cls: 'b-red' };
  if (d === 0) return { label: `Dernier jour • ${j.deadline}`, cls: 'b-red pulse' };
  if (d <= 3) return { label: `J-${d} • ${j.deadline}`, cls: 'b-red' };
  if (d <= 7) return { label: `J-${d} • ${j.deadline}`, cls: 'b-orange' };
  return { label: `J-${d} • ${j.deadline}`, cls: 'b-green' };
}

async function openLink(url) {
  try {
    const { Browser } = await import('@capacitor/browser').catch(() => ({}));
    if (Browser && Browser.open) { await Browser.open({ url }); return; }
  } catch {}
  window.open(url, '_blank', 'noopener');
}

// ---- Notifications téléphone (barre d'état Android) ----
async function setupNotifications() {
  try {
    const cap = await import('@capacitor/core').catch(() => null);
    if (!cap || !cap.Capacitor || !cap.Capacitor.isNativePlatform()) return;
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') await LocalNotifications.requestPermissions();
    try {
      await LocalNotifications.createChannel({
        id: 'updates',
        name: 'Nouveautés ELASSOULI',
        description: 'Nouvelles offres, marchés publics, concours et examens',
        importance: 5,
        visibility: 1,
        vibration: true,
      });
    } catch {}
  } catch {}
}

async function notifyPhone(title, body) {
  try {
    const cap = await import('@capacitor/core').catch(() => null);
    if (!cap || !cap.Capacitor || !cap.Capacitor.isNativePlatform()) return false;
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') return false;
    await LocalNotifications.schedule({
      notifications: [{
        id: Math.floor(Math.random() * 2000000000),
        title: String(title || 'ASSOULI AUTOX').slice(0, 64),
        body: String(body || 'Nouvelles offres disponibles').slice(0, 240),
        channelId: 'updates',
        schedule: { at: new Date(Date.now() + 400) },
        autoCancel: true,
      }],
    });
    return true;
  } catch { return false; }
}

// Stage detection: backend category first, contract/title fallback (old snapshots)
function isStageJob(j) {
  if (!j) return false;
  if (j.category === 'stages') return true;
  const c = String(j.contract || '').toLowerCase();
  if (c.includes('stage')) return true;
  const t = String(j.title || '').toLowerCase();
  return t.includes('stagiaire') || /(^|[\s(-])stage([\s).,-]|$)/.test(t);
}

// ============================================================
//  AUTH — comptes locaux + code de vérification par e-mail
//  L'e-mail est envoyé DEPUIS portailm.public@gmail.com (SMTP Gmail)
//  via le plugin natif SmtpMail (Android).
// ============================================================
const LS_ACCOUNTS = 'mjh_accounts_v1';
const LS_SESSION = 'mjh_session_v1';

function loadAccounts() {
  try { const a = JSON.parse(localStorage.getItem(LS_ACCOUNTS) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
}
function saveAccounts(list) { try { localStorage.setItem(LS_ACCOUNTS, JSON.stringify(list)); } catch {} }
function readSession() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_SESSION) || 'null');
    if (!s || !s.email) return null;
    return loadAccounts().some((a) => a.email === s.email && a.verified) ? s : null;
  } catch { return null; }
}
function writeSession(s) { try { localStorage.setItem(LS_SESSION, JSON.stringify(s)); } catch {} }
function clearSession() { try { localStorage.removeItem(LS_SESSION); } catch {} }

async function hashPassword(password, salt) {
  const data = `${salt}::${password}::elassouli-offers`;
  try {
    if (window.crypto && window.crypto.subtle) {
      const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {}
  let h1 = 0x811c9dc5, h2 = 0x1000193;
  for (let i = 0; i < data.length; i++) {
    const c = data.charCodeAt(i);
    h1 ^= c; h1 = Math.imul(h1, 16777619);
    h2 = (Math.imul(h2 ^ c, 2246822519) >>> 0);
  }
  return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
}
function newSalt() {
  try { const a = new Uint8Array(16); window.crypto.getRandomValues(a); return Array.from(a).map((b) => b.toString(16).padStart(2, '0')).join(''); } catch { return String(Math.random()).slice(2) + Date.now().toString(16); }
}
function makeCode() { return String(Math.floor(100000 + Math.random() * 900000)); }
function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim()); }

// Envoie le code DEPUIS portailm.public@gmail.com vers l'adresse de l'utilisateur.
async function sendVerificationEmail({ to, code, name }) {
  const cap = await import('@capacitor/core').catch(() => null);
  if (cap && cap.Capacitor && typeof cap.Capacitor.isNativePlatform === 'function' && cap.Capacitor.isNativePlatform()) {
    try {
      const SmtpMail = cap.registerPlugin('SmtpMail');
      await SmtpMail.send({ to, code, name: name || '' });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String((e && (e.message || e.error)) || e) };
    }
  }
  return { ok: false, error: 'web' };
}

function AuthScreen({ onAuthed }) {
  const [mode, setMode] = useState('login'); // login | signup | verify | reset | resetverify
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [codeInfo, setCodeInfo] = useState(null);
  const [showPw, setShowPw] = useState(false);

  function resetMsgs() { setErr(''); setInfo(''); }

  function scaffold() {
    // crée le code + envoie l'e-mail
    const code = makeCode();
    setCodeInfo({ code, exp: Date.now() + 10 * 60 * 1000, email: email.trim().toLowerCase() });
    return code;
  }

  async function deliver(kind) {
    const target = email.trim().toLowerCase();
    setBusy(true); resetMsgs();
    const code = scaffold();
    const r = await sendVerificationEmail({ to: target, code, name });
    setBusy(false);
    if (r.ok) {
      setInfo(`Code envoyé à ${target} depuis portailm.public@gmail.com`);
      setMode(kind);
      return true;
    }
    setErr(`Impossible d'envoyer l'e-mail : ${r.error === 'web' ? 'envoi disponible dans l’application Android' : r.error}`);
    return false;
  }

  async function doSignup() {
    resetMsgs();
    if (name.trim().length < 2) return setErr('Entrez votre nom complet.');
    if (!validEmail(email)) return setErr('Adresse e-mail invalide.');
    if (password.length < 6) return setErr('Mot de passe : 6 caractères minimum.');
    if (password !== confirm) return setErr('Les deux mots de passe ne correspondent pas.');
    const target = email.trim().toLowerCase();
    if (loadAccounts().some((a) => a.email === target)) return setErr('Un compte existe déjà avec cet e-mail. Connectez-vous.');
    await deliver('verify');
  }

  async function completeSignup() {
    resetMsgs();
    if (!codeInfo) return setErr('Code expiré — renvoyez un code.');
    if (Date.now() > codeInfo.exp) return setErr('Code expiré. Renvoyez un nouveau code.');
    if (codeInput.trim() !== codeInfo.code) return setErr('Code incorrect. Vérifiez votre e-mail.');
    const target = codeInfo.email;
    const salt = newSalt();
    const hash = await hashPassword(password, salt);
    const accounts = loadAccounts().filter((a) => a.email !== target);
    const acc = { name: name.trim(), email: target, salt, hash, verified: true, createdAt: new Date().toISOString() };
    accounts.push(acc); saveAccounts(accounts);
    const sess = { email: target, name: acc.name, since: new Date().toISOString() };
    writeSession(sess);
    onAuthed(sess);
  }

  async function doLogin() {
    resetMsgs();
    const target = email.trim().toLowerCase();
    if (!validEmail(target)) return setErr('Adresse e-mail invalide.');
    const acc = loadAccounts().find((a) => a.email === target);
    if (!acc) return setErr('Aucun compte avec cet e-mail. Créez un compte.');
    setBusy(true);
    const h = await hashPassword(password, acc.salt);
    setBusy(false);
    if (h !== acc.hash) return setErr('Mot de passe incorrect.');
    acc.lastLogin = new Date().toISOString();
    saveAccounts(loadAccounts().map((a) => (a.email === target ? acc : a)));
    const sess = { email: target, name: acc.name, since: new Date().toISOString() };
    writeSession(sess);
    onAuthed(sess);
  }

  async function doResetRequest() {
    resetMsgs();
    const target = email.trim().toLowerCase();
    if (!validEmail(target)) return setErr('Adresse e-mail invalide.');
    if (!loadAccounts().some((a) => a.email === target)) return setErr('Aucun compte avec cet e-mail.');
    await deliver('resetverify');
  }

  async function completeReset() {
    resetMsgs();
    if (!codeInfo || Date.now() > codeInfo.exp) return setErr('Code expiré. Renvoyez un code.');
    if (codeInput.trim() !== codeInfo.code) return setErr('Code incorrect.');
    if (password.length < 6) return setErr('Nouveau mot de passe : 6 caractères minimum.');
    if (password !== confirm) return setErr('Les deux mots de passe ne correspondent pas.');
    const target = codeInfo.email;
    const salt = newSalt();
    const hash = await hashPassword(password, salt);
    saveAccounts(loadAccounts().map((a) => (a.email === target ? { ...a, salt, hash, verified: true } : a)));
    setInfo('Mot de passe mis à jour. Connectez-vous.');
    setPassword(''); setConfirm(''); setCodeInput(''); setCodeInfo(null);
    setMode('login');
  }

  async function resend() {
    resetMsgs();
    setBusy(true);
    const code = makeCode();
    setCodeInfo({ code, exp: Date.now() + 10 * 60 * 1000, email: email.trim().toLowerCase() });
    const r = await sendVerificationEmail({ to: email.trim().toLowerCase(), code, name });
    setBusy(false);
    if (r.ok) setInfo('Nouveau code envoyé.');
    else setErr(`Renvoi impossible${r.error === 'web' ? ' (application Android uniquement)' : ' : ' + r.error}`);
  }

  const isVerify = mode === 'verify' || mode === 'resetverify';

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <img src="./app-icon.png" alt="ASSOULI AUTOX" className="auth-logo" />
        <h1 className="auth-title">ELASSOULI <b>OFFERS</b></h1>
        <p className="auth-sub">Plateforme sécurisée — offres d'emploi, marchés publics, concours & exams</p>

        <div className="auth-tabs">
          <button className={'auth-tab' + (mode === 'login' ? ' active' : '')} onClick={() => { setMode('login'); resetMsgs(); }}>Connexion</button>
          <button className={'auth-tab' + (mode === 'signup' ? ' active' : '')} onClick={() => { setMode('signup'); resetMsgs(); }}>Créer un compte</button>
        </div>

        {mode === 'signup' && (
          <label className="auth-field"><span>Nom complet</span>
            <input className="auth-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex : Soulaymane Elassouli" autoComplete="name" />
          </label>
        )}

        {!isVerify && (
          <label className="auth-field"><span>Adresse e-mail</span>
            <input className="auth-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@exemple.com" autoComplete="email" inputMode="email" />
          </label>
        )}

        {isVerify && (
          <>
            <p className="auth-note"><Icon n="mail" size={16} /> Code envoyé à <b>{codeInfo ? codeInfo.email : email}</b> par <b>portailm.public@gmail.com</b></p>
            <label className="auth-field"><span>Code de vérification (6 chiffres)</span>
              <input className="auth-input auth-code" value={codeInput} onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="••••••" inputMode="numeric" autoComplete="one-time-code" />
            </label>
          </>
        )}

        {!isVerify && (
          <label className="auth-field"><span>{mode === 'reset' ? 'Nouveau mot de passe' : 'Mot de passe'}</span>
            <div className="auth-pw">
              <input className="auth-input" type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
              <button className="auth-eye" type="button" onClick={() => setShowPw(!showPw)} aria-label="Afficher"><Icon n="eye" size={18} /></button>
            </div>
          </label>
        )}

        {(mode === 'signup' || mode === 'reset') && (
          <label className="auth-field"><span>Confirmer le mot de passe</span>
            <input className="auth-input" type={showPw ? 'text' : 'password'} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
          </label>
        )}

        {err && <div className="auth-error">{err}</div>}
        {info && <div className="auth-ok">{info}</div>}

        {mode === 'login' && (
          <>
            <button className="auth-btn" disabled={busy} onClick={doLogin}>{busy ? 'Connexion…' : 'Se connecter'}</button>
            <button className="auth-link" onClick={() => { setMode('reset'); resetMsgs(); }}>Mot de passe oublié ?</button>
          </>
        )}
        {mode === 'signup' && (
          <>
            <button className="auth-btn" disabled={busy} onClick={doSignup}>{busy ? 'Envoi du code…' : 'Créer mon compte'}</button>
            <p className="auth-legal">Un code de vérification à 6 chiffres sera envoyé depuis portailm.public@gmail.com.</p>
          </>
        )}
        {mode === 'verify' && (
          <>
            <button className="auth-btn" disabled={busy} onClick={completeSignup}>{busy ? 'Vérification…' : 'Vérifier et créer le compte'}</button>
            <button className="auth-link" disabled={busy} onClick={resend}>Renvoyer le code</button>
          </>
        )}
        {mode === 'reset' && (
          <>
            <button className="auth-btn" disabled={busy} onClick={doResetRequest}>{busy ? 'Envoi du code…' : 'Recevoir un code de réinitialisation'}</button>
            <button className="auth-link" onClick={() => { setMode('login'); resetMsgs(); }}>Retour à la connexion</button>
          </>
        )}
        {mode === 'resetverify' && (
          <>
            <button className="auth-btn" disabled={busy} onClick={completeReset}>Enregistrer le nouveau mot de passe</button>
            <button className="auth-link" disabled={busy} onClick={resend}>Renvoyer le code</button>
          </>
        )}

        <p className="auth-foot">Connexion sécurisée • code envoyé par e-mail • vos données restent sur l'appareil</p>
      </div>
    </div>
  );
}

// ---- Marchés : régions du Maroc + mots-clés ----
const MREGIONS = [
  ['Tanger-Tétouan-Al Hoceïma', ['tanger', 'tetouan', 'larache', 'hoceima', 'chefchaouen', 'ouezzane', 'mdiq', 'fnideq', 'assilah', 'asilah', 'ksar el kebir', 'ksar kebir']],
  ['Oriental', ['oujda', 'ouijda', 'nador', 'berkane', 'taourirt', 'jerada', 'figuig', 'guercif', 'driouch']],
  ['Fès-Meknès', ['fes', 'meknes', 'taza', 'ifrane', 'boulemane', 'sefrou', 'taounate', 'hajeb', 'moulay yacoub']],
  ['Rabat-Salé-Kénitra', ['rabat', 'sale', 'kenitra', 'skhirat', 'temara', 'tiflet', 'sidi kacem', 'sidi slimane', 'khemisset', 'khémisset']],
  ['Béni Mellal-Khénifra', ['beni mellal', 'khouribga', 'fquih ben salah', 'khenifra', 'azilal']],
  ['Casablanca-Settat', ['casablanca', 'mohammedia', 'settat', 'berrechid', 'jadida', 'sidi bennour', 'nouaceur', 'mediouna', 'benslimane']],
  ['Marrakech-Safi', ['marrakech', 'safi', 'essaouira', 'kelaa', 'chichaoua', 'haouz', 'rechidia', 'youssoufia']],
  ['Souss-Massa', ['agadir', 'inezgane', 'taroudant', 'tiznit', 'chtouka', 'ait melloul', 'biougra']],
  ['Drâa-Tafilalet', ['errachidia', 'ouarzazate', 'zagora', 'tinghir', 'midelt']],
  ['Guelmim-Oued Noun', ['guelmim', 'tan-tan', 'tan tan', 'sidi ifni', 'assa']],
  ['Laâyoune-Sakia El Hamra', ['laayoune', 'laâyoune', 'boujdour', 'tarfaya']],
  ['Dakhla-Oued Ed-Dahab', ['dakhla', 'aousserd', 'oued eddahab']],
];
function regionsOf(ville) {
  const v = String(ville || '').toLowerCase();
  if (!v.trim()) return [];
  return MREGIONS.filter(([, keys]) => keys.some((k) => v.includes(k))).map(([r]) => r);
}
const MKEYWORDS = [
  ['Topographie', ['topograph']],
  ['Études', ['etude', 'étude']],
  ['Travaux', ['travaux']],
  ['Fournitures', ['fourniture']],
  ['Services', ['service']],
  ['Bâtiment', ['batiment', 'bâtiment']],
  ['Routes', ['route', 'voirie']],
  ['Eau', ['eau ', 'assainissement', 'abhm', 'abhs', 'abhb', 'abhd']],
  ['Informatique', ['informatique', 'logiciel', 'système', 'systeme', 'digital']],
  ['Formation', ['formation']],
  ['Maintenance', ['maintenance', 'entretien']],
  ['Audit', ['audit']],
  ['Assistance', ['assistance', 'maîtrise', 'maitrise']],
  ['Construction', ['construction', 'bâtiment', 'batiment']],
];

function MainApp({ session, onLogout }) {
  const [jobs, setJobs] = useState([]);
  const [updatedAt, setUpdatedAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('dash');
  const [kind, setKind] = useState('all');
  const [query, setQuery] = useState('');
  const [city, setCity] = useState('');
  const [source, setSource] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [toast, setToast] = useState('');
  const [remote, setRemote] = useState(() => { try { return localStorage.getItem(LS_REMOTE) || DEFAULT_REMOTE; } catch { return DEFAULT_REMOTE; } });
  const [alerts, setAlerts] = useState([]);
  const [alertsUpdated, setAlertsUpdated] = useState('');
  const [seen, setSeen] = useState(() => { try { return localStorage.getItem(LS_SEEN) || ''; } catch { return ''; } });
  const [menuOpen, setMenuOpen] = useState(false);
  const [dlMsg, setDlMsg] = useState('');
  // ---- Exams (same Sujet + Corrige data as the web app) ----
  const [examIndex, setExamIndex] = useState(null);
  const [examSelId, setExamSelId] = useState('');
  const [examQ, setExamQ] = useState('');
  const [examFam, setExamFam] = useState('');
  const [examYearF, setExamYearF] = useState('');
  const [examOpen, setExamOpen] = useState(false);
  const [practiced, setPracticed] = useState(() => { try { return JSON.parse(localStorage.getItem('mjh_apk_practiced') || '{}'); } catch { return {}; } });
  // ---- Marchés Publics (Offer Analyzer data) ----
  const [marches, setMarches] = useState([]);
  const [marchesUpdated, setMarchesUpdated] = useState('');
  const [mStatus, setMStatus] = useState('open');
  const [mCat, setMCat] = useState('');
  const [mVille, setMVille] = useState('');
  const [mSel, setMSel] = useState(null);
  const [mType, setMType] = useState('');
  const [mRegion, setMRegion] = useState('');
  const [mKw, setMKw] = useState('');

  function togglePracticed(offerId, year) {
    setPracticed((prev) => {
      const next = { ...prev };
      const k = `${offerId}-${year}`;
      if (next[k]) delete next[k]; else next[k] = 1;
      try { localStorage.setItem('mjh_apk_practiced', JSON.stringify(next)); } catch {}
      return next;
    });
  }

  // Direct file download on APK: save to device then open share sheet (no browser detour).
  // Web fallback: blob anchor download. Last resort: open link in browser.
  async function downloadFile(url, safeName) {
    showToast('⬇ Téléchargement du fichier…');
    setDlMsg('');
    try {
      const cap = await import('@capacitor/core').catch(() => ({}));
      const isNative = cap && cap.Capacitor && typeof cap.Capacitor.isNativePlatform === 'function' && cap.Capacitor.isNativePlatform();
      if (isNative) {
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        const r = await fetch(url, { cache: 'no-store' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const buf = await r.arrayBuffer();
        if (!buf.byteLength) throw new Error('fichier vide');
        const bytes = new Uint8Array(buf);
        let bin = '';
        const CH = 8192;
        for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
        const saved = await Filesystem.writeFile({ path: safeName, data: btoa(bin), directory: Directory.Cache });
        try {
          const { Share } = await import('@capacitor/share');
          await Share.share({ title: safeName, text: safeName, url: saved.uri, dialogTitle: 'Fichier téléchargé — ouvrir / enregistrer' });
        } catch {
          await openLink(saved.uri);
        }
        showToast('✅ Fichier téléchargé sur l’appareil');
        return;
      }
      throw new Error('web');
    } catch (e) {
      if (String((e && e.message) || e) !== 'web') {
        setDlMsg('⚠️ ' + (e.message || 'échec') + ' — ouverture navigateur…');
      }
      try {
        const r = await fetch(url, { cache: 'no-store' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const blob = await r.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = safeName;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
        showToast('✅ Fichier téléchargé');
      } catch {
        openLink(url);
      }
    }
  }

  function downloadExamFile(f, label) {
    const safeName = (String(label || (f && f.title) || 'epreuve').replace(/[^\wÀ-ÿ-]+/gi, '-').slice(0, 50) || 'epreuve') + '.pdf';
    return downloadFile(examFileUrl(f), safeName);
  }

  function remoteBase(remoteUrl) {
    const u = (remoteUrl || '').trim();
    if (!u) return '';
    return u.replace(/[^/]*$/, '').replace(/\/$/, '');
  }

  // URL of a Marché doc (AVIS PDF): absolute remote first, else bundled copy
  function marcheDocUrl(d) {
    if (/^https?:\/\//i.test(d.url || '')) return d.url;
    const base = remoteBase(remote);
    const rel = (base ? base + '/' : './') + d.file;
    try { return new URL(rel, window.location.href).href; } catch { return rel; }
  }

  async function loadMarches(remoteUrl) {
    const base = remoteBase(remoteUrl);
    const urls = base ? [base + '/marches.json'] : [];
    urls.push('./marches.json');
    for (const u of urls) {
      try {
        const r = await fetch(u, { cache: 'no-store' });
        if (!r.ok) continue;
        const data = await r.json();
        if (data && data.offers) { setMarches(data.offers); setMarchesUpdated(data.updatedAt || ''); return; }
      } catch {}
    }
  }

  // Direct-from-web file URL: Supabase absolute url first, else remote/bundled copy
  function examFileUrl(f) {
    if (/^https?:\/\//i.test(f.url || '')) return f.url;
    const base = remoteBase(remote);
    const rel = (base ? base + '/' : './') + f.file;
    try { return new URL(rel, window.location.href).href; } catch { return rel; }
  }

  async function loadExams(remoteUrl) {
    const base = remoteBase(remoteUrl);
    const urls = base ? [base + '/exams-index.json'] : [];
    urls.push('./exams-index.json');
    for (const u of urls) {
      try {
        const r = await fetch(u, { cache: 'no-store' });
        if (!r.ok) continue;
        const data = await r.json();
        if (data && data.offers) {
          setExamIndex(data);
          if (!examSelId && data.offers.length) setExamSelId(data.offers[0].id);
          return;
        }
      } catch {}
    }
  }
  const [spin, setSpin] = useState(0);
  const startY = useRef(0);

  // Current section visual: icon + label follow the page the user chose
  const section = tab === 'jobs'
    ? (kind === 'stages' ? { icon: './app-icon.png', ico: 'cap', label: 'Stages & Pré-embauche' }
      : kind === 'emploi' ? { icon: './app-icon.png', ico: 'briefcase', label: 'Emplois CDI/CDD' }
      : { icon: './app-icon.png', ico: 'search', label: 'Toutes les offres' })
    : tab === 'concours' ? { icon: './app-icon.png', ico: 'landmark', label: 'Concours État' }
    : tab === 'marches' ? { icon: './app-icon.png', ico: 'scale', label: 'Marchés Publics' }
    : tab === 'exams' ? { icon: './app-icon.png', ico: 'file', label: 'Exams & Corrigés' }
    : tab === 'dash' ? { icon: './app-icon.png', ico: 'chart', label: 'Dashboard' }
    : tab === 'alerts' ? { icon: './app-icon.png', ico: 'bell', label: 'Alertes nouveautés' }
    : { icon: './app-icon.png', ico: 'sliders', label: 'Configuration' };

  function showToast(t) { setToast(t); setTimeout(() => setToast(''), 2600); }

  async function loadBundled() {
    const r = await fetch('./jobs.json', { cache: 'no-store' });
    if (!r.ok) throw new Error('jobs.json introuvable');
    const data = await r.json();
    const list = Array.isArray(data) ? data : data.jobs || [];
    return { list, updatedAt: data.updatedAt || '' };
  }

  async function loadAlerts(remoteUrl) {
    const urls = [];
    if ((remoteUrl || '').trim()) {
      const base = remoteUrl.trim();
      urls.push(base.replace(/jobs\.json(\?.*)?$/, 'alerts.json'));
      if (!/alerts\.json/.test(urls[0])) urls.push(base.replace(/[^/]*$/, 'alerts.json'));
    }
    urls.push('./alerts.json');
    for (const u of urls) {
      try {
        const r = await fetch(u, { cache: 'no-store' });
        if (!r.ok) continue;
        const data = await r.json();
        const list = Array.isArray(data) ? data : data.alerts || [];
        if (list.length || data.alerts) {
          setAlerts(list);
          setAlertsUpdated(data.updatedAt || '');
          // Notification immédiate si l'alerte contient de vraies nouveautés
          try {
            const top = list[0];
            if (top && top.at) {
              const lastAt = localStorage.getItem('mjh_last_alert_at') || '';
              const fresh = top.counts ? Number(top.counts.new || 0) > 0 : true;
              localStorage.setItem('mjh_last_alert_at', top.at);
              if (lastAt && top.at > lastAt && fresh) {
                const body = String(top.body || '').split('\n').filter(Boolean).slice(0, 3).join(' • ').slice(0, 220);
                notifyPhone(top.title || 'Alerte nouveautés', body || 'Nouvelles offres disponibles');
              }
            }
          } catch {}
          return;
        }
      } catch {}
    }
  }

  async function refresh(manual = true, silent = false) {
    if (manual) { setRefreshing(true); setSpin((s) => s + 1); }
    else if (!silent) setLoading(true);
    try {
      let list = [], upd = '';
      const remoteUrl = (remote || '').trim();
      if (remoteUrl) {
        try {
          const r = await fetch(remoteUrl, { cache: 'no-store' });
          if (r.ok) {
            const data = await r.json();
            list = Array.isArray(data) ? data : data.jobs || [];
            upd = data.updatedAt || new Date().toISOString();
            if (list.length) {
              const prevCount = Number(localStorage.getItem('mjh_last_remote_jobs') || 0);
              localStorage.setItem('mjh_last_remote_jobs', String(list.length));
              if (prevCount > 0 && list.length > prevCount) {
                notifyPhone(`Nouvelles offres • ${list.length - prevCount}`, `${list.length} offres suivies. Ouvrez ASSOULI AUTOX pour les consulter.`);
              }
              setJobs(list); setUpdatedAt(upd); if (!silent) showToast(`Actualisé (distant) • ${list.length} offres`); loadAlerts(remoteUrl); loadExams(remoteUrl); loadMarches(remoteUrl); return;
            }
          }
        } catch (e) { /* fallback local */ }
      }
      const b = await loadBundled();
      setJobs(b.list); setUpdatedAt(b.updatedAt);
      if (!silent) showToast(`Actualisé • ${b.list.length} offres`);
      loadAlerts(remoteUrl); loadExams(remoteUrl); loadMarches(remoteUrl);
    } catch (e) {
      if (!silent) showToast('Erreur actualisation: ' + e.message);
    } finally {
      setRefreshing(false); setLoading(false);
    }
  }

  useEffect(() => { setupNotifications(); refresh(false); }, []);
  // Auto-refresh: every 30 min + each time the app comes back to foreground
  useEffect(() => {
    const AUTO_MS = 30 * 60 * 1000;
    const tick = () => refresh(false, true);
    const interval = setInterval(tick, AUTO_MS);
    const onVis = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('resume', tick); // Capacitor resume event
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('resume', tick); };
  }, [remote]);
  useEffect(() => { try { localStorage.setItem(LS_REMOTE, remote); } catch {} }, [remote]);
  useEffect(() => {
    if (tab === 'alerts') {
      const now = new Date().toISOString();
      setSeen(now);
      try { localStorage.setItem(LS_SEEN, now); } catch {}
    }
  }, [tab]);

  const unread = alerts.filter((a) => !seen || (a.at || '') > seen).length;

  // Contextual filter lists: options follow the current page (concours page → concours values, stages → stages values…)
  const baseJobs = useMemo(() => {
    if (tab === 'concours') return jobs.filter((j) => j.kind === 'concours');
    if (tab === 'jobs' && kind === 'stages') return jobs.filter(isStageJob);
    if (tab === 'jobs' && kind === 'emploi') return jobs.filter((j) => (j.kind || 'emploi') === 'emploi' && !isStageJob(j));
    return jobs;
  }, [jobs, tab, kind]);

  const sources = useMemo(() => {
    const m = {};
    baseJobs.forEach((j) => { m[j.source] = j.sourceLabel || j.source; });
    return Object.entries(m).sort((a, b) => a[1].localeCompare(b[1]));
  }, [baseJobs]);

  const cities = useMemo(() => {
    const m = {};
    baseJobs.forEach((j) => { if (j.city) m[j.city] = (m[j.city] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 40);
  }, [baseJobs]);

  const specialties = useMemo(() => {
    const m = {};
    baseJobs.forEach((j) => { if (j.specialty) m[j.specialty] = (m[j.specialty] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 40);
  }, [baseJobs]);

  const stats = useMemo(() => {
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    let thisWeek = 0, urgent = 0, concours = 0, stages = 0;
    jobs.forEach((j) => {
      if (j.publishedDate && new Date(j.publishedDate) >= weekAgo) thisWeek++;
      const d = daysUntil(j.deadline);
      if (d !== null && d >= 0 && d <= 7) urgent++;
      if (j.kind === 'concours') concours++;
      if (isStageJob(j)) stages++;
    });
    return { total: jobs.length, thisWeek, urgent, concours, stages };
  }, [jobs]);

  const filtered = useMemo(() => {
    let l = [...jobs];
    if (kind === 'stages') l = l.filter(isStageJob);
    else if (kind !== 'all') l = l.filter((j) => (j.kind || 'emploi') === kind);
    if (kind === 'emploi') l = l.filter((j) => !isStageJob(j));
    if (urgentOnly) l = l.filter((j) => { const d = daysUntil(j.deadline); return d !== null && d >= 0 && d <= 7; });
    if (city) l = l.filter((j) => (j.city || '').toLowerCase().includes(city.toLowerCase()));
    if (source) l = l.filter((j) => j.source === source);
    if (specialty) l = l.filter((j) => (j.specialty || '') === specialty);
    if (query.trim()) {
      const s = query.trim().toLowerCase();
      l = l.filter((j) => [j.title, j.company, j.city, j.description, (j.requirements || []).join(' ')].join(' ').toLowerCase().includes(s));
    }
    l.sort((a, b) => (b.publishedDate || '').localeCompare(a.publishedDate || ''));
    return l;
  }, [jobs, kind, query, city, source, specialty, urgentOnly]);

  // Same data views as the web app
  const concoursList = useMemo(() => {
    let l = jobs.filter((j) => j.kind === 'concours');
    if (urgentOnly) l = l.filter((j) => { const d = daysUntil(j.deadline); return d !== null && d >= 0 && d <= 7; });
    if (query.trim()) {
      const s = query.trim().toLowerCase();
      l = l.filter((j) => [j.title, j.company, j.specialty, j.fonction, j.city].join(' ').toLowerCase().includes(s));
    }
    if (city) l = l.filter((j) => (j.city || '').toLowerCase().includes(city.toLowerCase()));
    if (specialty) l = l.filter((j) => (j.specialty || '') === specialty);
    l.sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999'));
    return l;
  }, [jobs, query, city, specialty, urgentOnly]);

  const contracts = useMemo(() => {
    const m = {};
    jobs.forEach((j) => { if (j.contract && j.contract !== '—') m[j.contract] = (m[j.contract] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [jobs]);

  const kinds = useMemo(() => {
    let emploi = 0, concours = 0;
    jobs.forEach((j) => { if (j.kind === 'concours') concours++; else emploi++; });
    return { emploi, concours };
  }, [jobs]);

  const examOffers = useMemo(() => {
    let list = (examIndex && examIndex.offers) || [];
    if (examFam) list = list.filter((o) => o.familyLabel === examFam);
    if (examYearF) list = list.filter((o) => o.files.some((f) => String(f.year) === String(examYearF)));
    if (examQ.trim()) {
      const s = examQ.trim().toLowerCase();
      list = list.filter((o) => [o.title, o.company, o.specialty, o.fonction, o.familyLabel].join(' ').toLowerCase().includes(s));
    }
    return list;
  }, [examIndex, examQ, examFam, examYearF]);

  const examFamilies = useMemo(() => {
    const m = {};
    ((examIndex && examIndex.offers) || []).forEach((o) => { const k = o.familyLabel || 'Autres'; m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [examIndex]);

  const examTotals = useMemo(() => {
    let sujets = 0, corriges = 0, years = 0;
    ((examIndex && examIndex.offers) || []).forEach((o) => {
      const ys = new Set();
      o.files.forEach((f) => { ys.add(f.year); if (f.kind === 'corrige') corriges++; else sujets++; });
      years += ys.size;
    });
    return { sujets, corriges, years };
  }, [examIndex]);

  const examPracticed = useMemo(() => {
    let done = 0, total = 0;
    ((examIndex && examIndex.offers) || []).forEach((o) => {
      const ys = [...new Set(o.files.map((f) => f.year))];
      total += ys.length;
      done += ys.filter((y) => practiced[`${o.id}-${y}`]).length;
    });
    return { done, total };
  }, [examIndex, practiced]);

  const examSel = useMemo(() => {
    const list = (examIndex && examIndex.offers) || [];
    return list.find((o) => o.id === examSelId) || null;
  }, [examIndex, examSelId]);

  const examYears = useMemo(() => {
    if (!examSel) return [];
    return [...new Set(examSel.files.map((f) => f.year))].sort().reverse();
  }, [examSel]);

  // ---- Marchés Publics views ----
  const mStats = useMemo(() => {
    let open = 0, soon = 0, closed = 0;
    marches.forEach((m) => { if (m.status === 'open') open++; else if (m.status === 'soon') soon++; else closed++; });
    return { total: marches.length, open: open + soon, soon, closed };
  }, [marches]);

  const mCats = useMemo(() => {
    const m = {};
    marches.forEach((o) => { if (o.categorie) m[o.categorie] = (m[o.categorie] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [marches]);

  const mVilles = useMemo(() => {
    const m = {};
    marches.forEach((o) => String(o.ville || '').split(/[,;]/).forEach((v) => {
      const k = v.trim(); if (k) m[k] = (m[k] || 0) + 1;
    }));
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 30);
  }, [marches]);

  const mFiltered = useMemo(() => {
    let l = [...marches];
    if (mStatus === 'open') l = l.filter((m) => m.status === 'open' || m.status === 'soon');
    else if (mStatus === 'closed') l = l.filter((m) => m.status === 'closed');
    if (mCat) l = l.filter((m) => (m.categorie || '') === mCat);
    if (mVille) l = l.filter((m) => String(m.ville || '').toLowerCase().includes(mVille.toLowerCase()));
    if (mType) l = l.filter((m) => ((m.modePassation || String(m.typeProcedure || '').split('|')[0]).trim()) === mType);
    if (mRegion) l = l.filter((m) => regionsOf(m.ville).includes(mRegion));
    if (mKw) {
      const terms = (MKEYWORDS.find(([k]) => k === mKw) || [mKw, [mKw.toLowerCase()]])[1];
      l = l.filter((m) => {
        const hay = [m.objet, m.categorie, m.typeProcedure, m.modePassation, m.organisme].join(' ').toLowerCase();
        return terms.some((t) => hay.includes(t));
      });
    }
    if (query.trim()) {
      const s = query.trim().toLowerCase();
      l = l.filter((m) => [m.ref, m.organisme, m.objet, m.ville, m.typeProcedure, m.modePassation].join(' ').toLowerCase().includes(s));
    }
    return l;
  }, [marches, mStatus, mCat, mVille, mType, mRegion, mKw, query]);
  const mTypes = useMemo(() => {
    const m = {};
    marches.forEach((o) => {
      const t = (o.modePassation || String(o.typeProcedure || '').split('|')[0]).trim();
      if (t) m[t] = (m[t] || 0) + 1;
    });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [marches]);
  const mRegionList = useMemo(() => {
    const m = {};
    marches.forEach((o) => regionsOf(o.ville).forEach((r) => { m[r] = (m[r] || 0) + 1; }));
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [marches]);

  function mDeadline(m) {
    if (!m.dateLimiteIso) return { label: 'Sans date', cls: 'b-muted', d: null };
    const end = new Date(m.dateLimiteIso).getTime() + 86400000 - 1;
    const d = Math.ceil((end - Date.now()) / 86400000);
    const raw = m.dateLimite || m.dateLimiteIso.slice(0, 16).replace('T', ' ');
    if (d < 0) return { label: `Clôturé • ${raw}`, cls: 'b-red', d };
    if (d === 0) return { label: `Dernier jour • ${raw}`, cls: 'b-red pulse', d };
    if (d <= 3) return { label: `J-${d} • ${raw}`, cls: 'b-red', d };
    if (d <= 7) return { label: `J-${d} • ${raw}`, cls: 'b-orange', d };
    return { label: `J-${d} • ${raw}`, cls: 'b-green', d };
  }

  function onTouchStart(e) { startY.current = e.touches[0].clientY; }
  function onTouchEnd(e) {
    const dy = e.changedTouches[0].clientY - startY.current;
    if (dy > 110 && window.scrollY <= 5 && !refreshing) refresh(true);
  }

  function goTab(t, k) {
    setTab(t);
    if (k !== undefined) setKind(k);
    setMenuOpen(false);
    setExamOpen(false);
    setQuery(''); setCity(''); setSource(''); setSpecialty(''); setUrgentOnly(false);
    setMSel(null); setMCat(''); setMVille(''); setMStatus('open'); setMType(''); setMRegion(''); setMKw('');
    try { window.scrollTo({ top: 0 }); } catch {}
  }

  return (
    <div className="phone" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {menuOpen && <div className="drawer-overlay" onClick={() => setMenuOpen(false)} />}
      <aside className={'drawer' + (menuOpen ? ' open' : '')}>
        <div className="drawer-brand"><img src="./app-icon.png" alt="ASSOULI AUTOX" className="drawer-logo" /><span><b>ELASSOULI</b> <em>OFFERS</em></span></div>
        <div className="drawer-account"><Icon n="check" size={14} /><span>{session.email}</span></div>
        <p className="muted">ASSOULI AUTOX • {stats.total} offres • {mStats.total} marchés publics • {(updatedAt || '').slice(0, 10) || 'hors-ligne'}</p>
        <nav className="drawer-nav">
          <button className={tab === 'jobs' && kind === 'all' ? 'active' : ''} onClick={() => goTab('jobs', 'all')}><span className="dn-l"><Icon n="search" size={19} />Toutes les offres</span></button>
          <button className={tab === 'jobs' && kind === 'emploi' ? 'active' : ''} onClick={() => goTab('jobs', 'emploi')}><span className="dn-l"><Icon n="briefcase" size={19} />Emplois CDI/CDD</span></button>
          <button className={tab === 'jobs' && kind === 'stages' ? 'active' : ''} onClick={() => goTab('jobs', 'stages')}><span className="dn-l"><Icon n="cap" size={19} />Stages</span>{stats.stages > 0 && <b className="count">{stats.stages}</b>}</button>
          <button className={tab === 'concours' ? 'active' : ''} aria-current={tab === 'concours' ? 'page' : undefined} onClick={() => goTab('concours')}><span className="dn-l"><Icon n="landmark" size={19} />Concours État</span></button>
          <button className={tab === 'marches' ? 'active' : ''} aria-current={tab === 'marches' ? 'page' : undefined} onClick={() => goTab('marches')}><span className="dn-l"><Icon n="scale" size={19} />Marchés Publics</span>{mStats.open > 0 && <b className="count">{mStats.open}</b>}</button>
          <button className={tab === 'exams' ? 'active' : ''} aria-current={tab === 'exams' ? 'page' : undefined} onClick={() => goTab('exams')}><span className="dn-l"><Icon n="file" size={19} />Exams & Corrigés</span></button>
          <button className={tab === 'dash' ? 'active' : ''} onClick={() => goTab('dash')}><span className="dn-l"><Icon n="chart" size={19} />Dashboard</span></button>
          <button className={tab === 'alerts' ? 'active' : ''} aria-current={tab === 'alerts' ? 'page' : undefined} onClick={() => goTab('alerts')}><span className="dn-l"><Icon n="bell" size={19} />Alertes</span>{unread > 0 && <b className="count red">{unread}</b>}</button>
          <button className={tab === 'setup' ? 'active' : ''} onClick={() => goTab('setup')}><span className="dn-l"><Icon n="sliders" size={19} />Configuration</span></button>
        </nav>
        <button className="apply drawer-refresh" onClick={() => { setMenuOpen(false); refresh(true); }}><Icon n="refresh" size={18} /> Actualiser</button>
        <button className="ghost drawer-refresh" onClick={onLogout}><Icon n="close" size={18} /> Se déconnecter</button>
      </aside>
      <header className="topbar">
        <div className="hero-top">
          <div className="brand-wrap">
            <button className="menu-btn" onClick={() => setMenuOpen(true)} title="Menu" aria-label="Menu"><Icon n="menu" /></button>
            <img src="./app-icon.png" alt="logo" className="brand-logo" />
            <div className="brand"><b>ELASSOULI</b> <span>OFFERS</span></div>
          </div>
          <div className="top-actions">
            <button className="refresh" onClick={() => setTab('setup')} title="Configuration" aria-label="Configuration"><Icon n="sliders" /></button>
            <button className={'refresh' + (refreshing ? ' spinning' : '')} onClick={() => refresh(true)} title="Actualiser" aria-label="Actualiser"><Icon n="refresh" /></button>
          </div>
        </div>
      </header>
      <section className="hero">
        <p className="hero-sub">ASSOULI AUTOX • offres, stages, concours & exams • actualisez à chaque ouverture</p>
        <div className="hero-stats">
          <div className="hstat"><b>{stats.total}</b><span>offres</span></div>
          <div className="hstat green"><b>{stats.thisWeek}</b><span>≤ 7 jours</span></div>
          <div className="hstat orange"><b>{stats.urgent}</b><span>urgentes</span></div>
          <div className="hstat stages"><b>{stats.stages}</b><span>stages</span></div>
          <div className="hstat violet"><b>{stats.concours}</b><span>concours</span></div>
        </div>
        <div className="updated">{refreshing ? 'Actualisation…' : loading ? 'Chargement…' : `Dernière actualisation : ${(updatedAt || '').slice(0, 16).replace('T', ' ') || 'à l’instant'} • ${filtered.length} affichées`}</div>
      </section>

      <div className="section-bar">
        <img src={section.icon} alt="" className="section-logo" />
        <span className="section-emoji"><Icon n={section.ico} size={22} /></span>
        <b>{section.label}</b>
        {tab === 'jobs' && <span className="section-count">{filtered.length} affichées</span>}
        {tab === 'concours' && <span className="section-count">{concoursList.length} concours</span>}
      </div>

      {(tab === 'jobs' || tab === 'concours' || tab === 'marches') && (
      <div className="searchbar">
        <Icon n="search" size={18} /><input placeholder={tab === 'marches' ? 'Rechercher : référence, organisme, objet, ville…' : 'Rechercher : poste, entreprise, ville…'} value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      )}
      {(tab === 'jobs' || tab === 'concours') && (
      <div className="filters modern-filters">
        <label className="fselect"><span><Icon n="pin" size={16} /></span><select value={city} onChange={(e) => setCity(e.target.value)}>
          <option value="">Toutes villes</option>
          {cities.map(([c, n]) => <option key={c} value={c}>{c} ({n})</option>)}
        </select></label>
        <label className="fselect"><span><Icon n="plug" size={16} /></span><select value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">Toutes sources</option>
          {sources.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select></label>
        <label className="fselect"><span><Icon n="target" size={16} /></span><select value={specialty} onChange={(e) => setSpecialty(e.target.value)}>
          <option value="">Toutes spécialités</option>
          {specialties.map(([s, n]) => <option key={s} value={s}>{s.length > 28 ? s.slice(0, 28) + '…' : s} ({n})</option>)}
        </select></label>
        <button className={'fchip' + (urgentOnly ? ' active' : '')} onClick={() => setUrgentOnly(!urgentOnly)} title="Deadlines ≤ 7 jours"><Icon n="clock" size={15} /> ≤ 7j</button>
        {(query || city || source || specialty || urgentOnly || kind !== 'all') && (
          <button className="clear" onClick={() => { setQuery(''); setCity(''); setSource(''); setSpecialty(''); setUrgentOnly(false); setKind('all'); }} aria-label="Réinitialiser les filtres"><Icon n="close" size={16} /></button>
        )}
      </div>
      )}

      {tab === 'marches' && (
      <>
      <div className="filters modern-filters">
        <button className={'fchip' + (mStatus === 'open' ? ' active' : '')} onClick={() => setMStatus(mStatus === 'open' ? 'all' : 'open')}><Icon n="clock" size={15} /> Ouverts ({mStats.open})</button>
        <button className={'fchip' + (mStatus === 'closed' ? ' active' : '')} onClick={() => setMStatus(mStatus === 'closed' ? 'all' : 'closed')}>Clôturés ({mStats.closed})</button>
        <label className="fselect"><span><Icon n="briefcase" size={16} /></span><select value={mType} onChange={(e) => setMType(e.target.value)}>
          <option value="">Type d’offre</option>
          {mTypes.map(([t, n]) => <option key={t} value={t}>{t.length > 30 ? t.slice(0, 30) + '…' : t} ({n})</option>)}
        </select></label>
        <label className="fselect"><span><Icon n="pin" size={16} /></span><select value={mRegion} onChange={(e) => setMRegion(e.target.value)}>
          <option value="">Toutes régions</option>
          {mRegionList.map(([r, n]) => <option key={r} value={r}>{r.length > 26 ? r.slice(0, 26) + '…' : r} ({n})</option>)}
        </select></label>
        <label className="fselect"><span><Icon n="file" size={16} /></span><select value={mCat} onChange={(e) => setMCat(e.target.value)}>
          <option value="">Catégories</option>
          {mCats.map(([c, n]) => <option key={c} value={c}>{c} ({n})</option>)}
        </select></label>
        <label className="fselect"><span><Icon n="target" size={16} /></span><select value={mVille} onChange={(e) => setMVille(e.target.value)}>
          <option value="">Toutes villes</option>
          {mVilles.map(([c, n]) => <option key={c} value={c}>{c.length > 26 ? c.slice(0, 26) + '…' : c} ({n})</option>)}
        </select></label>
        {(query || mCat || mVille || mType || mRegion || mKw || mStatus !== 'open') && (
          <button className="clear" onClick={() => { setQuery(''); setMCat(''); setMVille(''); setMType(''); setMRegion(''); setMKw(''); setMStatus('open'); }} aria-label="Réinitialiser les filtres"><Icon n="close" size={16} /></button>
        )}
      </div>
      <div className="kw-row">
        <span className="kw-label"><Icon n="search" size={13} /> Mots-clés</span>
        {MKEYWORDS.map(([k]) => (
          <button key={k} className={'kw-chip' + (mKw === k ? ' active' : '')} onClick={() => setMKw(mKw === k ? '' : k)}>{k}</button>
        ))}
      </div>
      </>
      )}

      {tab === 'marches' && (
        <main className="feed">
          <div className="panel" style={{ marginBottom: 10 }}>
            <h3>Marchés Publics — appels d’offres ({mFiltered.length})</h3>
            <p className="muted">Source : Offer Analyzer • portail marchespublics.gov.ma {marchesUpdated ? `• maj ${(marchesUpdated || '').slice(0, 16).replace('T', ' ')}` : ''} — touchez une offre pour le dossier complet (AVIS, DCE, contacts).</p>
          </div>
          {marches.length === 0 && <div className="empty">Aucun marché public. Touchez ↻ pour actualiser.</div>}
          {mFiltered.length === 0 && marches.length > 0 && <div className="empty">Aucun marché ne correspond aux filtres.</div>}
          {mFiltered.map((m) => {
            const dl = mDeadline(m);
            return (
              <article className="card mcard" key={m.id} onClick={() => setMSel(m)}>
                <div className="card-head">
                  <div className="avatar" style={{ '--h': 162 }}><Icon n="gavel" size={20} /></div>
                  <div className="chead">
                    <h3><span className="mcard-ref">{m.ref}</span>{m.organisme ? ` — ${String(m.organisme).split(' - ')[0]}` : ''}</h3>
                    <div className="csub meta">
                      {m.ville && <span><Icon n="pin" size={14} />{m.ville.length > 42 ? m.ville.slice(0, 42) + '…' : m.ville}</span>}
                    </div>
                  </div>
                </div>
                <p className="desc m-objet">{m.objet || '—'}</p>
                <div className="chips">
                  <span className="chip ref-chip"><Icon n="scale" size={12} />{m.categorie || 'Marché'}</span>
                  {m.modePassation && <span className="chip blue">{m.modePassation}</span>}
                  {m.counts && (m.counts.cps || m.counts.rc) ? <span className="chip muted">CPS ×{m.counts.cps || 0} • RC ×{m.counts.rc || 0}</span> : null}
                  {(m.docs || []).length > 0 && <span className="chip muted"><Icon n="file" size={12} />{m.docs.length} avis PDF</span>}
                  <span className={'chip ' + dl.cls}>{dl.label}</span>
                </div>
                <div className="m-foot">
                  <span className="m-open">Voir le dossier <Icon n="arrow" size={14} /></span>
                  {m.dceUrl && <button className="ghost sm" onClick={(e) => { e.stopPropagation(); openLink(m.dceUrl); }}><Icon n="download" size={14} /> DCE</button>}
                </div>
              </article>
            );
          })}
        </main>
      )}

      {tab === 'jobs' && (
        <main className="feed">
          {kind === 'stages' && (
            <div className="panel stages-banner">
              <h3>Stages & Pré-embauche ({filtered.length})</h3>
              <p className="muted">Stages, stagiaires & PFE — séparés des emplois CDI/CDD.</p>
            </div>
          )}
          {kind === 'emploi' && (
            <div className="panel">
              <h3>Emplois CDI/CDD ({filtered.length})</h3>
              <p className="muted">Hors stages — voir l’onglet Stages.</p>
            </div>
          )}
          {loading && <div className="skeleton-wrap">{[1, 2, 3].map((i) => <div key={i} className="skeleton" />)}</div>}
          {!loading && filtered.length === 0 && <div className="empty">Aucune offre. Touchez ↻ pour actualiser.</div>}
          {filtered.slice(0, 120).map((j) => {
            const dl = deadlineInfo(j);
            const initial = (j.company || j.sourceLabel || '?').trim().charAt(0).toUpperCase();
            const isStage = isStageJob(j);
            return (
              <article className={'card' + (isStage ? ' stage-card' : '')} key={j.id}>
                <div className="card-head">
                  <div className="avatar" style={{ '--h': hueOf(initial) }}>{initial}</div>
                  <div className="chead">
                    <h3>{j.title}</h3>
                    <div className="csub meta"><span><Icon n="building" size={14} />{j.company || '—'}</span><span><Icon n="pin" size={14} />{j.city || '—'}</span>{j.contract && <span><Icon n="file" size={14} />{j.contract}</span>}</div>
                  </div>
                </div>
                <div className="chips">
                  <span className="chip">{j.sourceLabel || j.source}</span>
                  {isStage && <span className="chip b-stage"><Icon n="cap" size={12} />Stage</span>}
                  {j.postsCount > 1 && <span className="chip blue">{j.postsCount} postes</span>}
                  <span className={'chip ' + dl.cls}>{dl.label}</span>
                  {j.publishedDate && <span className="chip muted">Publié {j.publishedDate}</span>}
                  {j.concoursDate && <span className="chip b-orange"><Icon n="file" size={12} />Examen {j.concoursDate}</span>}
                </div>
                {(j.specialty || j.diploma || j.experience) && <div className="csub meta"><span><Icon n="target" size={14} />{j.specialty || '—'}</span>{j.diploma && <span><Icon n="cap" size={14} />{j.diploma}</span>}{j.experience && <span><Icon n="briefcase" size={14} />{j.experience}</span>}</div>}
                {j.description && <p className="desc">{String(j.description).slice(0, 160)}…</p>}
                {(j.requirements || []).length > 0 && (
                  <ul className="reqs">{j.requirements.slice(0, 3).map((r, i) => <li key={i}>{r}</li>)}</ul>
                )}
                <div className="actions">
                  <button className="apply" onClick={() => openLink(j.url)}><Icon n="arrow" size={16} /> Voir / Postuler</button>
                  <span className="kind">{j.kind === 'concours' ? 'Concours' : isStage ? 'Stage' : 'Emploi'}</span>
                </div>
              </article>
            );
          })}
          {filtered.length > 120 && <div className="more">+ {filtered.length - 120} autres — affinez la recherche.</div>}
        </main>
      )}

      {tab === 'concours' && (
        <main className="feed">
          {loading && <div className="skeleton-wrap">{[1, 2, 3].map((i) => <div key={i} className="skeleton" />)}</div>}
          {!loading && concoursList.length === 0 && <div className="empty">Aucun concours. Touchez ↻ pour actualiser.</div>}
          <div className="panel" style={{ marginBottom: 10 }}>
            <h3>Concours État ({concoursList.length})</h3>
            <p className="muted">Organisme, postes, ouverture, clôture, examen, conditions — comme le web.</p>
          </div>
          {concoursList.slice(0, 80).map((j) => {
            const dl = deadlineInfo(j);
            const initial = (j.company || '?').trim().charAt(0).toUpperCase();
            return (
              <article className="card" key={j.id}>
                <div className="card-head">
                  <div className="avatar" style={{ '--h': hueOf(initial) }}>{initial}</div>
                  <div className="chead">
                    <h3>{j.title}</h3>
                    <div className="csub meta"><span><Icon n="building" size={14} />{j.company || '—'}</span></div>
                    <div className="csub meta"><span><Icon n="pin" size={14} />{j.city || '—'}</span><span><Icon n="briefcase" size={14} />{j.postsCount || 1} poste(s)</span></div>
                    <div className="csub meta"><span><Icon n="calendar" size={14} />Ouvert : {j.publishedDate || '—'}</span><span><Icon n="file" size={14} />Examen : {j.concoursDate || '—'}</span></div>
                  </div>
                </div>
                <div className="chips">
                  <span className="chip">{j.sourceLabel || j.source}</span>
                  {j.specialty && <span className="chip blue"><Icon n="target" size={12} />{j.specialty}</span>}
                  <span className={'chip ' + dl.cls}>{dl.label}</span>
                </div>
                {(j.diploma || j.experience) && <div className="csub meta"><span><Icon n="cap" size={14} />{j.diploma || '—'}</span><span><Icon n="briefcase" size={14} />{j.experience || '—'}</span></div>}
                {(j.requirements || []).length > 0 && (
                  <ul className="reqs">{j.requirements.slice(0, 4).map((r, i) => <li key={i}>{r}</li>)}</ul>
                )}
                <div className="actions">
                  <button className="apply" onClick={() => openLink(j.url)}><Icon n="arrow" size={16} /> Avis officiel / dossier</button>
                  <span className="kind">Concours</span>
                </div>
              </article>
            );
          })}
        </main>
      )}

      {tab === 'exams' && (
        <main className="feed exams-page">
          <div className="panel ex-hero">
            <div className="ex-hero-top">
              <div className="ex-hero-ic"><Icon n="file" size={24} /></div>
              <div className="ex-hero-txt">
                <h3>Exams &amp; Corrigés</h3>
                <p className="muted">
                  {examIndex
                    ? `${examIndex.offers.length} concours • ${examIndex.years[examIndex.years.length - 1]}–${examIndex.years[0]} • sujet + corrigé`
                    : 'Chargement des dossiers…'}
                </p>
              </div>
            </div>
            <div className="ex-kpis">
              <div className="ex-kpi"><b>{examTotals.sujets}</b><span>sujets</span></div>
              <div className="ex-kpi green"><b>{examTotals.corriges}</b><span>corrigés</span></div>
              <div className="ex-kpi blue"><b>{examPracticed.done}<i>/{examPracticed.total}</i></b><span>pratiqués</span></div>
            </div>
            <div className="searchbar ex-search">
              <Icon n="search" size={18} />
              <input placeholder="Concours, organisme, spécialité…" value={examQ} onChange={(e) => setExamQ(e.target.value)} />
              {examQ && <button className="ex-clear" onClick={() => setExamQ('')} aria-label="Effacer"><Icon n="close" size={16} /></button>}
            </div>
          </div>

          {((examIndex && examIndex.years) || []).length > 0 && (
            <div className="filters ex-filters">
              <span className="kw-label"><Icon n="calendar" size={13} /> Année</span>
              <button className={'fchip' + (!examYearF ? ' active' : '')} onClick={() => setExamYearF('')}>Toutes</button>
              {examIndex.years.map((y) => (
                <button key={y} className={'fchip' + (String(examYearF) === String(y) ? ' active' : '')} onClick={() => setExamYearF(String(examYearF) === String(y) ? '' : String(y))}>{y}</button>
              ))}
            </div>
          )}

          {examFamilies.length > 0 && (
            <div className="kw-row ex-fam-row">
              <span className="kw-label"><Icon n="target" size={13} /> Filière</span>
              <button className={'kw-chip' + (!examFam ? ' active' : '')} onClick={() => setExamFam('')}>Toutes</button>
              {examFamilies.map(([f, n]) => (
                <button key={f} className={'kw-chip' + (examFam === f ? ' active' : '')} onClick={() => setExamFam(examFam === f ? '' : f)}>{f} ({n})</button>
              ))}
            </div>
          )}

          {!examIndex && <div className="skeleton-wrap">{[1, 2, 3].map((i) => <div className="skeleton" key={i} />)}</div>}
          {examIndex && examOffers.length === 0 && (
            <div className="empty">Aucun exam ne correspond à ces filtres. Touchez ↻ pour actualiser.</div>
          )}

          <div className="exam-grid">
            {examOffers.map((o) => {
              const ys = [...new Set(o.files.map((f) => f.year))].sort((a, b) => b - a);
              const done = ys.filter((y) => practiced[`${o.id}-${y}`]).length;
              const pct = ys.length ? Math.round((done / ys.length) * 100) : 0;
              const sujets = o.files.filter((f) => f.kind !== 'corrige').length;
              const corriges = o.files.filter((f) => f.kind === 'corrige').length;
              return (
                <article className="card exam-card" key={o.id} onClick={() => { setExamSelId(o.id); setExamOpen(true); }}>
                  <div className="ex-card-top">
                    <div className="ex-badge"><Icon n="landmark" size={20} /></div>
                    <div className="ex-card-title">
                      <h3>{o.title}</h3>
                      <p className="ex-org">{o.company}</p>
                    </div>
                    <span className={'ex-pct' + (pct === 100 ? ' full' : '')}>{pct}%</span>
                  </div>
                  <div className="chips">
                    {o.familyLabel && <span className="chip blue">{o.familyLabel}</span>}
                    <span className="chip">{ys.length} années</span>
                    <span className="chip muted">{sujets} sujets • {corriges} corrigés</span>
                  </div>
                  <div className="ex-prog">
                    <div className="bt"><div className="bf g" style={{ width: pct + '%' }} /></div>
                    <span>{done}/{ys.length}</span>
                  </div>
                  <div className="ex-open">Ouvrir les sujets <Icon n="arrow" size={14} /></div>
                </article>
              );
            })}
          </div>
          {examIndex && examOffers.length > 0 && (
            <p className="more">Touchez un concours pour voir les sujets et corrigés par année.</p>
          )}
        </main>
      )}

      {tab === 'dash' && (
        <main className="dash">
          <div className="panel dash-hero-panel">
            <div className="dash-hero-top">
              <img src="./app-icon.png" alt="" className="section-logo" />
              <div>
                <h3>ASSOULI AUTOX</h3>
                <p className="muted">{stats.total} offres • {stats.thisWeek} ≤ 7j • {stats.urgent} urgentes</p>
              </div>
            </div>
            <div className="dash-stats-modern">
              <div className="dstat primary" onClick={() => goTab('jobs', 'all')}><b>{stats.total}</b><span>Offres</span></div>
              <div className="dstat info" onClick={() => { goTab('jobs', 'all'); }}><b>{stats.thisWeek}</b><span>Publiées ≤ 7 jours</span></div>
              <div className="dstat warning" onClick={() => { goTab('jobs', 'all'); setUrgentOnly(true); }}><b>{stats.urgent}</b><span>Urgentes</span></div>
              <div className="dstat stages" onClick={() => goTab('jobs', 'stages')}><b>{stats.stages}</b><span>Stages</span></div>
              <div className="dstat violet" onClick={() => goTab('concours')}><b>{stats.concours}</b><span>Concours</span></div>
              <div className="dstat green" onClick={() => goTab('marches')}><b>{mStats.open}</b><span>Marchés ouverts</span></div>
            </div>
          </div>
          {mStats.total > 0 && (
            <div className="panel">
              <div className="section-header"><h3>Marchés Publics</h3><span className="section-count">{mStats.open} ouverts</span></div>
              <p className="muted">Appels d’offres suivis par Offer Analyzer — {mStats.total} au total, {mStats.closed} clôturés.</p>
              <div className="row" style={{ marginTop: 10 }}>
                <button className="apply" onClick={() => goTab('marches')}><Icon n="scale" size={16} /> Voir les marchés</button>
              </div>
            </div>
          )}
          <div className="panel">
            <div className="section-header"><h3>Par source</h3><span className="section-count">{sources.length} sources</span></div>
            {sources.map(([k, l]) => {
              const n = jobs.filter((j) => j.source === k).length;
              const pct = stats.total ? Math.max(4, (n / stats.total) * 100) : 0;
              return <div className="bar" key={k} onClick={() => { goTab('jobs', 'all'); setSource(k); }}><span className="bl">{l}</span><div className="bt"><div className="bf" style={{ width: pct + '%' }} /></div><b>{n}</b></div>;
            })}
          </div>
          <div className="panel">
            <div className="section-header"><h3>Top villes</h3><span className="section-count">{cities.length} villes</span></div>
            <div className="cities-grid">
              {cities.slice(0, 10).map(([c, n]) => (
                <div className="city-chip" key={c} onClick={() => { goTab('jobs', 'all'); setCity(c); }}>
                  <span className="city-name">{c}</span><span className="city-count">{n}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="panel">
            <div className="section-header"><h3>Types</h3><span className="section-count">Répartition</span></div>
            <div className="type-grid">
              <div className="type-box emploi" onClick={() => goTab('jobs', 'emploi')}><Icon n="briefcase" size={24} /><b>{kinds.emploi - stats.stages}</b><small>Emplois</small></div>
              <div className="type-box stages" onClick={() => goTab('jobs', 'stages')}><Icon n="cap" size={24} /><b>{stats.stages}</b><small>Stages</small></div>
              <div className="type-box concours" onClick={() => goTab('concours')}><Icon n="landmark" size={24} /><b>{kinds.concours}</b><small>Concours</small></div>
            </div>
            <h3 style={{ marginTop: 16 }}>Contrats</h3>
            <div className="chips">
              {contracts.map(([c, n]) => <span className="chip muted" key={c}>{c} • <b>{n}</b></span>)}
            </div>
          </div>
        </main>
      )}

      {tab === 'alerts' && (
        <main className="feed">
          <div className="panel" style={{ marginBottom: 10 }}>
            <h3>Alertes nouveautés {unread > 0 && <span className="chip b-red">{unread} non lues</span>}</h3>
            <p className="muted">Mêmes alertes que WhatsApp • {alertsUpdated ? `maj ${(alertsUpdated || '').slice(0, 16).replace('T', ' ')}` : 'touchez ↻ pour charger'} • les nouveautés arrivent à chaque actualisation.</p>
          </div>
          {alerts.length === 0 && <div className="empty">Aucune alerte pour l'instant. Touchez ↻.</div>}
          {alerts.slice(0, 30).map((a) => (
            <article className="card" key={a.id}>
              <div className="card-head">
                <div className="avatar"><Icon n="bell" size={22} /></div>
                <div className="chead">
                  <h3>{a.title}</h3>
                  <div className="csub">{(a.at || '').slice(0, 16).replace('T', ' ')}{a.counts ? ` • +${a.counts.new || 0} nouvelles • total ${a.counts.total || ''}` : ''}</div>
                </div>
              </div>
              <p className="desc" style={{ whiteSpace: 'pre-wrap' }}>{a.body}</p>
            </article>
          ))}
        </main>
      )}

      {tab === 'setup' && (
        <main className="dash">
          <div className="panel">
            <h3>Actualisation automatique</h3>
            <p className="muted">Par défaut l'app lit <code>jobs.json</code> intégré (hors-ligne). Collez ci-dessous l'URL RAW GitHub de votre <code>jobs.json</code> pour recevoir les nouveautés à chaque ↻ sans republier l'APK. Les alertes suivent automatiquement (<code>alerts.json</code> à côté).</p>
            <input className="remote" placeholder="https://raw.githubusercontent.com/.../jobs.json" value={remote} onChange={(e) => setRemote(e.target.value)} />
            <p className="muted">Exemple : <code>{DEFAULT_REMOTE}</code></p>
            <div className="row">
              <button className="apply" onClick={() => refresh(true)}><Icon n="refresh" size={16} /> Actualiser maintenant</button>
              <button className="ghost" onClick={() => { setRemote(''); showToast('URL distante effacée'); }}>Effacer</button>
            </div>
            <p className="muted">Astuce : le workflow GitHub <code>update-jobs.yml</code> met à jour ce fichier chaque jour à 06:00 Casablanca.</p>
          </div>
          <div className="panel">
            <h3>Sources suivies</h3>
            <p className="muted">ReKrute • Dreamjob • Emploi Public • ANAPEC • Stellantis • Jawb • Indeed • Glassdoor • Emploi.ma • MarocAnnonces</p>
            <p className="muted">Tirez vers le bas en haut de page ou touchez ↻ pour actualiser comme un site moderne.</p>
          </div>
        </main>
      )}

      <nav className="bottomnav" aria-label="Navigation principale">
        <button className={tab === 'jobs' ? 'active' : ''} aria-current={tab === 'jobs' ? 'page' : undefined} onClick={() => goTab('jobs')}><Icon n="briefcase" size={22} /><span>Offres</span></button>
        <button className={tab === 'marches' ? 'active' : ''} aria-current={tab === 'marches' ? 'page' : undefined} onClick={() => goTab('marches')}><Icon n="scale" size={22} /><span>Marchés</span></button>
        <button className={tab === 'concours' ? 'active' : ''} aria-current={tab === 'concours' ? 'page' : undefined} onClick={() => goTab('concours')}><Icon n="landmark" size={22} /><span>Concours</span></button>
        <button className={'fab' + (refreshing ? ' spinning' : '')} onClick={() => refresh(true)} title="Actualiser" aria-label="Actualiser"><Icon n="refresh" size={26} /></button>
        <button className={tab === 'exams' ? 'active' : ''} aria-current={tab === 'exams' ? 'page' : undefined} onClick={() => goTab('exams')}><Icon n="file" size={22} /><span>Exams</span></button>
        <button className={tab === 'alerts' ? 'active' : ''} aria-current={tab === 'alerts' ? 'page' : undefined} onClick={() => goTab('alerts')}><Icon n="bell" size={22} /><span>Alertes</span>{unread > 0 && <b className="nav-badge">{unread}</b>}</button>
      </nav>

      {mSel && (() => {
        const dl = mDeadline(mSel);
        return (
          <>
            <div className="sheet-overlay" onClick={() => setMSel(null)} aria-hidden="true" />
            <div className="sheet" role="dialog" aria-modal="true" aria-label={`Marché ${mSel.ref}`}>
              <div className="sheet-handle" />
              <div className="sheet-head">
                <div className="avatar" style={{ '--h': 162 }}><Icon n="gavel" size={20} /></div>
                <div className="chead">
                  <h3><span className="mcard-ref">{mSel.ref}</span></h3>
                  <div className="csub meta"><span><Icon n="building" size={14} />{mSel.organisme || '—'}</span></div>
                  <div className="chips">
                    <span className={'chip ' + dl.cls}>{dl.label}</span>
                    {mSel.categorie && <span className="chip ref-chip">{mSel.categorie}</span>}
                  </div>
                </div>
                <button className="sheet-close" onClick={() => setMSel(null)} aria-label="Fermer"><Icon n="close" size={18} /></button>
              </div>
              <div className="sheet-body">
                <div className="panel">
                  <h3>Objet</h3>
                  <p className="desc" style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{mSel.objet || '—'}</p>
                  <div className="chips">
                    {mSel.ville && <span className="chip blue"><Icon n="pin" size={12} />{mSel.ville}</span>}
                    {mSel.typeProcedure && <span className="chip">{mSel.typeProcedure}</span>}
                    {mSel.modePassation && <span className="chip blue">{mSel.modePassation}</span>}
                    {mSel.typeAnnonce && <span className="chip muted">{mSel.typeAnnonce}</span>}
                  </div>
                </div>

                <div className="panel">
                  <h3>Dossier de consultation</h3>
                  {(mSel.docs || []).map((d, i) => (
                    <div className="doc-row" key={d.file + i}>
                      <Icon n="file" size={20} />
                      <span className="doc-name">{d.name || 'Avis PDF'}</span>
                      <span className="doc-size">{d.size ? (d.size / 1024 / 1024).toFixed(1) + ' Mo' : ''}</span>
                      <button className="ghost sm" onClick={() => downloadFile(marcheDocUrl(d), `${mSel.ref}-${d.name || 'avis'}.pdf`.replace(/[^\wÀ-ÿ.-]+/g, '-').slice(0, 60))}><Icon n="download" size={14} /></button>
                    </div>
                  ))}
                  {!((mSel.docs || []).length) && <p className="muted">Aucun avis PDF publié pour ce marché.</p>}
                  <div className="row" style={{ marginTop: 10 }}>
                    {mSel.dceUrl && <button className="apply" onClick={() => openLink(mSel.dceUrl)}><Icon n="download" size={16} /> Télécharger le DCE</button>}
                    {mSel.portalHref && <button className="ghost" onClick={() => openLink(mSel.portalHref)}><Icon n="arrow" size={16} /> Page officielle</button>}
                  </div>
                  {mSel.dceSize && <p className="muted" style={{ marginTop: 8 }}>{mSel.dceSize} — s’ouvre sur marchespublics.gov.ma</p>}
                </div>

                <div className="panel">
                  <h3>Informations</h3>
                  {mSel.dateLimite && <div className="mrow"><span className="mlabel">Clôture</span><span className="mval">{mSel.dateLimite}</span></div>}
                  {mSel.estimation && <div className="mrow"><span className="mlabel">Estimation</span><span className="mval">{mSel.estimation}</span></div>}
                  {mSel.caution && <div className="mrow"><span className="mlabel">Caution</span><span className="mval">{mSel.caution}</span></div>}
                  {mSel.prixAcquisition && mSel.prixAcquisition !== '0,00 MAD' && <div className="mrow"><span className="mlabel">Prix DCE</span><span className="mval">{mSel.prixAcquisition}</span></div>}
                  {mSel.lieuOuverture && <div className="mrow"><span className="mlabel">Ouverture plis</span><span className="mval">{mSel.lieuOuverture}</span></div>}
                  {mSel.adresseRetrait && <div className="mrow"><span className="mlabel">Retrait</span><span className="mval">{mSel.adresseRetrait}</span></div>}
                  {mSel.adresseDepot && <div className="mrow"><span className="mlabel">Dépôt</span><span className="mval">{mSel.adresseDepot}</span></div>}
                </div>

                {(mSel.contact && (mSel.contact.nom || mSel.contact.email || mSel.contact.tel)) && (
                  <div className="panel">
                    <h3>Contact</h3>
                    {mSel.contact.nom && <div className="mrow"><span className="mlabel">Nom</span><span className="mval">{mSel.contact.nom}</span></div>}
                    {mSel.contact.email && <div className="mrow"><span className="mlabel">Email</span><span className="mval"><a href={`mailto:${mSel.contact.email}`}>{mSel.contact.email}</a></span></div>}
                    {mSel.contact.tel && <div className="mrow"><span className="mlabel">Téléphone</span><span className="mval"><a href={`tel:${mSel.contact.tel}`}>{mSel.contact.tel}</a></span></div>}
                    {mSel.contact.fax && <div className="mrow"><span className="mlabel">Fax</span><span className="mval">{mSel.contact.fax}</span></div>}
                    <div className="row" style={{ marginTop: 8 }}>
                      {mSel.contact.email && <button className="ghost" onClick={() => openLink(`mailto:${mSel.contact.email}`)}><Icon n="mail" size={16} /> Envoyer un mail</button>}
                      {mSel.contact.tel && <button className="ghost" onClick={() => openLink(`tel:${mSel.contact.tel}`)}><Icon n="phone" size={16} /> Appeler</button>}
                    </div>
                  </div>
                )}
                <p className="muted">Source : Offer Analyzer (marchespublics.gov.ma) • {mSel.seenAt ? `détecté le ${mSel.seenAt.slice(0, 10)}` : ''}</p>
              </div>
            </div>
          </>
        );
      })()}

      {examOpen && examSel && (() => {
        const ys = examYears;
        const doneCount = ys.filter((y) => practiced[`${examSel.id}-${y}`]).length;
        const pct = ys.length ? Math.round((doneCount / ys.length) * 100) : 0;
        return (
          <>
            <div className="sheet-overlay" onClick={() => setExamOpen(false)} aria-hidden="true" />
            <div className="sheet exam-sheet" role="dialog" aria-modal="true" aria-label={`Examens ${examSel.title}`}>
              <div className="sheet-handle" />
              <div className="sheet-head">
                <div className="ex-badge"><Icon n="file" size={20} /></div>
                <div className="chead">
                  <h3>{examSel.title}</h3>
                  <div className="csub meta"><span><Icon n="building" size={14} />{examSel.company}</span>{examSel.specialty && <span><Icon n="target" size={14} />{examSel.specialty}</span>}</div>
                  <div className="chips">
                    {examSel.familyLabel && <span className="chip blue">{examSel.familyLabel}</span>}
                    <span className="chip b-green">{doneCount}/{ys.length} pratiqués</span>
                  </div>
                </div>
                <button className="sheet-close" onClick={() => setExamOpen(false)} aria-label="Fermer"><Icon n="close" size={18} /></button>
              </div>
              <div className="sheet-body">
                <div className="ex-sheet-prog">
                  <div className="bt"><div className="bf g" style={{ width: pct + '%' }} /></div>
                  <b>{pct}%</b>
                </div>
                {dlMsg && <p className="chip b-orange" style={{ margin: '0 0 10px' }}>{dlMsg}</p>}
                {ys.map((y) => {
                  const sujet = examSel.files.find((f) => f.year === y && f.kind !== 'corrige');
                  const corrige = examSel.files.find((f) => f.year === y && f.kind === 'corrige');
                  const done = !!practiced[`${examSel.id}-${y}`];
                  const q = encodeURIComponent(`concours ${examSel.company} ${examSel.specialty || examSel.fonction || ''} épreuve PDF ${y} Maroc`.replace(/\s+/g, ' ').trim());
                  return (
                    <div className="panel ex-year" key={y}>
                      <div className="ex-year-head">
                        <b className="ex-year-num">{y}</b>
                        {done ? <span className="chip b-green"><Icon n="check" size={12} />Pratiqué</span> : <span className="chip muted">À faire</span>}
                        <button className="ghost sm ex-mark" onClick={() => togglePracticed(examSel.id, y)}>{done ? 'À refaire' : 'Pratiqué ✓'}</button>
                      </div>
                      {(sujet || corrige) ? (
                        <>
                          {sujet && (
                            <div className="ex-file">
                              <span className="ex-tag">Sujet</span>
                              <span className="ex-file-meta">{sujet.detail || (sujet.size ? Math.round(sujet.size / 1024) + ' Ko' : 'PDF')}</span>
                              <div className="ex-file-btns">
                                <button className="ghost sm" onClick={() => openLink(examFileUrl(sujet))}><Icon n="eye" size={15} /> Voir</button>
                                <button className="apply sm" onClick={() => downloadExamFile(sujet, `${examSel.company}-${y}-sujet`)}><Icon n="download" size={15} /> PDF</button>
                              </div>
                            </div>
                          )}
                          {corrige && (
                            <div className="ex-file corrige">
                              <span className="ex-tag blue">Corrigé</span>
                              <span className="ex-file-meta">{corrige.detail || (corrige.size ? Math.round(corrige.size / 1024) + ' Ko' : 'PDF')}</span>
                              <div className="ex-file-btns">
                                <button className="ghost sm" onClick={() => openLink(examFileUrl(corrige))}><Icon n="eye" size={15} /> Voir</button>
                                <button className="apply sm" onClick={() => downloadExamFile(corrige, `${examSel.company}-${y}-corrige`)}><Icon n="download" size={15} /> PDF</button>
                              </div>
                            </div>
                          )}
                        </>
                      ) : <p className="muted">Aucun fichier pour cette année.</p>}
                      <button className="ex-official" onClick={() => openLink(`https://www.google.com/search?q=${q}+filetype:pdf`)}><Icon n="search" size={15} /> Chercher le sujet officiel</button>
                    </div>
                  );
                })}
                <p className="muted ex-sheet-foot">Téléchargement direct • les fichiers s’ouvrent aussi dans le lecteur PDF du téléphone.</p>
              </div>
            </div>
          </>
        );
      })()}

      {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(() => readSession());
  if (!session) return <AuthScreen onAuthed={setSession} />;
  return <MainApp session={session} onLogout={() => { clearSession(); setSession(null); }} />;
}
