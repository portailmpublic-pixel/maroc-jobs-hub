import React, { useEffect, useMemo, useRef, useState } from 'react';

const DEFAULT_REMOTE = 'https://raw.githubusercontent.com/portailmpublic-pixel/maroc-jobs-hub/master/app/public/jobs.json';
const LS_REMOTE = 'mjh_remote_url';
const LS_SEEN = 'mjh_alerts_seen';
const LS_CACHE = 'mjh_cache_';
const LS_ACCESS = 'mjh_access_v1';
const LS_MARCHES_SESSION = 'mjh_marches_session_v1';
const ACCESS_URL = 'https://raw.githubusercontent.com/portailmpublic-pixel/maroc-jobs-hub/master/app/public/access.json';
const UPDATE_URL = 'https://raw.githubusercontent.com/portailmpublic-pixel/maroc-jobs-hub/master/app/public/app-version.json';

function readAccess() {
  try { return JSON.parse(localStorage.getItem(LS_ACCESS) || '{}'); } catch { return {}; }
}

function accessDisabledList(access) {
  return ((access && access.disabled) || []).map((x) => String(x || '').trim().toLowerCase());
}

// Accès « Marchés publics » : liste d'e-mails autorisés, publiée depuis l'APK
// admin. Tant que l'e-mail n'y figure pas, l'onglet reste verrouillé.
function accessMarchesList(access) {
  return ((access && access.marches) || []).map((x) => String(x || '').trim().toLowerCase());
}

function isMarchesAllowed(email, access) {
  const target = String(email || '').trim().toLowerCase();
  return !!target && accessMarchesList(access).includes(target);
}

function isEmailDisabled(email) {
  return accessDisabledList(readAccess()).includes(String(email || '').trim().toLowerCase());
}

function blockedMessage() {
  const a = readAccess();
  return a.message || 'Ce compte a été désactivé par l’administrateur.';
}

async function refreshAccessList() {
  try {
    const data = await fetchJSON(ACCESS_URL + '?t=' + Math.floor(Date.now() / 15000), 6000);
    if (data && Array.isArray(data.disabled)) {
      localStorage.setItem(LS_ACCESS, JSON.stringify(data));
      return data;
    }
  } catch {}
  return readAccess();
}

async function ensureEmailAllowed(email) {
  const target = String(email || '').trim().toLowerCase();
  if (!target) return true;
  if (isEmailDisabled(target)) return false;
  if (navigator.onLine === false) return true;
  const fresh = await refreshAccessList();
  return !accessDisabledList(fresh).includes(target);
}

// Ferme réellement l'application Android (pas seulement la session)
async function closeAppNow() {
  try {
    const cap = await import('@capacitor/core');
    if (!cap.Capacitor.isNativePlatform()) return false;
    const P = cap.registerPlugin('AppControl');
    await P.close();
    return true;
  } catch { return false; }
}

function readCached(key, fallback) {
  try {
    const v = localStorage.getItem(LS_CACHE + key);
    return v ? JSON.parse(v) : fallback;
  } catch { return fallback; }
}

function writeCached(key, val) {
  try {
    localStorage.setItem(LS_CACHE + key, JSON.stringify(val));
  } catch {
    // Quota dépassé : on libère les grosses données et on garde l'essentiel
    try { localStorage.removeItem(LS_CACHE + 'jobs'); } catch {}
  }
}

// Gros volumes (marchés publics) : un échec de quota ne doit jamais
// effacer le cache des offres d'emploi.
function writeCachedSafe(key, val) {
  try { localStorage.setItem(LS_CACHE + key, JSON.stringify(val)); return true; }
  catch { return false; }
}

let BOOT = null;
function bootCache() {
  if (!BOOT) {
    BOOT = {
      jobs: readCached('jobs', []),
      jobsUpdated: readCached('jobsUpdated', ''),
      alerts: readCached('alerts', []),
      alertsUpdated: readCached('alertsUpdated', ''),
      exams: readCached('exams', null),
      marches: readCached('marches', []),
      marchesUpdated: readCached('marchesUpdated', ''),
    };
  }
  return BOOT;
}

async function fetchJSON(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => { try { ctrl.abort(); } catch {} }, timeoutMs);
  try {
    const r = await fetch(url, { cache: 'default', signal: ctrl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

// Premier serveur qui répond gagne : indispensable en connexion faible
// (le distant peut traîner, la copie embarquée répond tout de suite).
function fetchFirst(urls, timeoutMs = 9000) {
  return new Promise((resolve, reject) => {
    const list = (urls || []).filter(Boolean);
    if (!list.length) { reject(new Error('offline')); return; }
    let pending = list.length;
    let settled = false;
    list.forEach(async (u) => {
      try {
        const data = await fetchJSON(u, timeoutMs);
        if (!settled) { settled = true; resolve(data); }
      } catch {
        pending -= 1;
        if (pending === 0 && !settled) { settled = true; reject(new Error('offline')); }
      }
    });
  });
}

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
  wifi: <><path d="M4 9.5a12 12 0 0 1 16 0M7 13a7.5 7.5 0 0 1 10 0M10.5 16.4a3 3 0 0 1 3 0M12 20h.01" /></>,
  lock: <><rect x="4.5" y="10" width="15" height="10.5" rx="2.5" /><path d="M8 10V7.5a4 4 0 0 1 8 0V10M12 14.5v2" /></>,
  shield: <><path d="M12 3 5 6v5.5c0 4.5 3 7.6 7 9.5 4-1.9 7-5 7-9.5V6z" /><path d="m9 12 2 2 4-4" /></>,
  phone: <path d="M5 4h4l1.8 4.2-2.2 1.4a11.5 11.5 0 0 0 4.8 4.8l1.4-2.2L19 14v4a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z" />,
  gavel: <><path d="m5 9 4 4M9.5 4.5 14 9M12.5 7.5l4.5 4.5M4 20h9M15 14l5-5M18.5 17.5 21 15" /></>,
};

function Icon({ n, size = 20 }) {
  return (
    <svg className="ic" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[n]}</svg>
  );
}

function SplashIntro() {
  return (
    <div className="splash-intro" aria-hidden="true">
      <div className="splash-glow" />
      <div className="splash-rings">
        <span className="splash-ring r1" />
        <span className="splash-ring r2" />
      </div>
      <div className="splash-badge-wrap">
        <img src="./app-icon.png" alt="" className="splash-badge" />
        <span className="splash-shine" />
      </div>
      <div className="splash-word">
        <span className="splash-name">ASSOULI <b>AUTOX</b></span>
        <span className="splash-tag">Offres • Marchés • Concours • Exams</span>
      </div>
      <div className="splash-bar"><span /></div>
    </div>
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
        name: 'Nouveautés ASSOULI AUTOX',
        description: 'Nouvelles offres, marchés publics, concours et examens',
        importance: 5,
        visibility: 1,
        vibration: true,
        lights: true,
        lightColor: '#14E0B4',
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
        smallIcon: 'ic_stat_autox',
        largeIcon: 'ic_notif_large',
        iconColor: '#14E0B4',
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
async function syncNativeAccounts(list) {
  try {
    const cap = await import('@capacitor/core');
    if (!cap.Capacitor.isNativePlatform()) return;
    const P = cap.registerPlugin('LocalAccounts');
    await P.save({ accounts: JSON.stringify(Array.isArray(list) ? list : []) });
  } catch {}
}
function saveAccounts(list) {
  try { localStorage.setItem(LS_ACCOUNTS, JSON.stringify(list)); } catch {}
  syncNativeAccounts(list);
}
function readSession() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_SESSION) || 'null');
    if (!s || !s.email) return null;
    return loadAccounts().some((a) => a.email === s.email && a.verified) ? s : null;
  } catch { return null; }
}
function writeSession(s) { try { localStorage.setItem(LS_SESSION, JSON.stringify(s)); } catch {} }
function clearSession() { try { localStorage.removeItem(LS_SESSION); } catch {} }
// L'accès Marchés est lié à la personne connectée sur cet appareil : on
// l'oublie à la déconnexion pour qu'un autre compte ne récupère pas l'accès.
function clearMarchesSession() { try { localStorage.removeItem(LS_MARCHES_SESSION); } catch {} }

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
  const [mode, setMode] = useState('login'); // login | signup | verify
  const [intent, setIntent] = useState('login'); // login | signup
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(() => { try { return localStorage.getItem('mjh_blocked_msg') || ''; } catch { return ''; } });
  const [info, setInfo] = useState('');
  const [codeInfo, setCodeInfo] = useState(null);
  useEffect(() => { refreshAccessList(); syncNativeAccounts(loadAccounts()); }, []);

  function resetMsgs() { setErr(''); setInfo(''); }

  async function sendCode(kind) {
    resetMsgs();
    const target = email.trim().toLowerCase();
    if (kind === 'signup' && name.trim().length < 2) return setErr('Entrez votre nom complet.');
    if (!validEmail(target)) return setErr('Adresse e-mail invalide.');
    setBusy(true);
    const allowed = await ensureEmailAllowed(target);
    if (!allowed) { setBusy(false); return setErr(blockedMessage()); }
    const code = makeCode();
    setCodeInfo({ code, exp: Date.now() + 10 * 60 * 1000, email: target });
    const r = await sendVerificationEmail({ to: target, code, name: kind === 'signup' ? name.trim() : '' });
    setBusy(false);
    if (!r.ok) {
      setCodeInfo(null);
      return setErr(`Impossible d'envoyer l'e-mail : ${r.error === 'web' ? 'envoi disponible dans l’application Android' : r.error}`);
    }
    setIntent(kind);
    setCodeInput('');
    setMode('verify');
  }

  async function completeVerify() {
    resetMsgs();
    if (!codeInfo) return setErr('Code expiré — renvoyez un code.');
    if (Date.now() > codeInfo.exp) return setErr('Code expiré. Renvoyez un nouveau code.');
    if (codeInput.trim() !== codeInfo.code) return setErr('Code incorrect. Vérifiez votre e-mail.');
    const target = codeInfo.email;
    const accounts = loadAccounts();
    const existing = accounts.find((a) => a.email === target);
    const displayName = (existing && existing.name) || (intent === 'signup' ? name.trim() : target.split('@')[0]);
    const acc = {
      ...(existing || {}),
      name: displayName,
      email: target,
      verified: true,
      createdAt: (existing && existing.createdAt) || new Date().toISOString(),
      lastLogin: new Date().toISOString(),
    };
    saveAccounts([...accounts.filter((a) => a.email !== target), acc]);
    try { localStorage.removeItem('mjh_blocked_msg'); } catch {}
    const sess = { email: target, name: acc.name, since: new Date().toISOString() };
    writeSession(sess);
    onAuthed(sess);
  }

  async function resend() {
    resetMsgs();
    if (!codeInfo) return setMode(intent);
    setBusy(true);
    const code = makeCode();
    setCodeInfo({ code, exp: Date.now() + 10 * 60 * 1000, email: codeInfo.email });
    const r = await sendVerificationEmail({ to: codeInfo.email, code, name: intent === 'signup' ? name.trim() : '' });
    setBusy(false);
    if (r.ok) setInfo('Nouveau code envoyé.');
    else setErr(`Renvoi impossible${r.error === 'web' ? ' (application Android uniquement)' : ' : ' + r.error}`);
  }

  const isVerify = mode === 'verify';

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <img src="./app-icon.png" alt="ASSOULI AUTOX" className="auth-logo" />
        <h1 className="auth-title">ASSOULI <b>AUTOX</b></h1>
        <p className="auth-sub">Plateforme sécurisée — offres d'emploi, marchés publics, concours & exams</p>

        <div className="auth-tabs">
          <button className={'auth-tab' + (mode === 'login' ? ' active' : '')} onClick={() => { setMode('login'); resetMsgs(); }}>Connexion</button>
          <button className={'auth-tab' + (mode === 'signup' ? ' active' : '')} onClick={() => { setMode('signup'); resetMsgs(); }}>Créer un compte</button>
        </div>

        {mode === 'signup' && (
          <label className="auth-field"><span>Nom complet</span>
            <input className="auth-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex : Soulaymane ASSOULI" autoComplete="name" />
          </label>
        )}

        {!isVerify && (
          <label className="auth-field"><span>Adresse e-mail</span>
            <input className="auth-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@exemple.com" autoComplete="email" inputMode="email" />
          </label>
        )}

        {isVerify && (
          <>
            <div className="auth-sent">
              <span className="auth-sent-ic"><Icon n="mail" size={18} /></span>
              <div className="auth-sent-body">
                <b>Code envoyé</b>
                <span className="auth-sent-mail">{codeInfo ? codeInfo.email : email}</span>
                <span className="auth-sent-from">depuis portailm.public@gmail.com · vérifiez aussi les spams</span>
              </div>
              <span className="auth-sent-ok"><Icon n="check" size={13} /></span>
            </div>
            <label className="auth-field auth-code-field"><span>Code de vérification</span>
              <div className="auth-otp">
                <div className="auth-otp-boxes" aria-hidden="true">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <span key={i} className={'auth-otp-box' + (codeInput[i] ? ' filled' : '') + (i === codeInput.length ? ' cur' : '')}>{codeInput[i] || ''}</span>
                  ))}
                </div>
                <input
                  className="auth-otp-input"
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  aria-label="Code de vérification à 6 chiffres"
                />
              </div>
            </label>
          </>
        )}

        {err && <div className="auth-error">{err}</div>}
        {info && <div className="auth-ok">{info}</div>}

        {mode === 'login' && (
          <>
            <button className="auth-btn" disabled={busy} onClick={() => sendCode('login')}>{busy ? 'Envoi du code…' : 'Recevoir le code'}</button>
            <p className="auth-legal">Connexion sans mot de passe : un code à 6 chiffres arrive par e-mail.</p>
          </>
        )}
        {mode === 'signup' && (
          <>
            <button className="auth-btn" disabled={busy} onClick={() => sendCode('signup')}>{busy ? 'Envoi du code…' : 'Créer mon compte'}</button>
            <p className="auth-legal">Un code de vérification à 6 chiffres sera envoyé depuis portailm.public@gmail.com.</p>
          </>
        )}
        {mode === 'verify' && (
          <>
            <button className="auth-btn" disabled={busy} onClick={completeVerify}>{busy ? 'Vérification…' : 'Vérifier et entrer'}</button>
            <button className="auth-link" disabled={busy} onClick={resend}>Renvoyer le code</button>
            <button className="auth-link" disabled={busy} onClick={() => { setMode(intent); setCodeInput(''); setCodeInfo(null); resetMsgs(); }}>Changer d’e-mail</button>
          </>
        )}

        <p className="auth-foot">Connexion sans mot de passe • code à 6 chiffres par e-mail • compte mémorisé sur l’appareil</p>
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
// Taxonomie identique à scraper/src/marches-live.js — chaque mot-clé doit
// ramener de nouvelles consultations. L'ordre sert à l'affichage des puces.
const MKEYWORDS = [
  { id: 'topographie', label: 'Topographie', terms: ['topograph', 'geometre', 'cadastre', 'leve'] },
  { id: 'etudes', label: 'Études', terms: ['etude', 'ingenierie', 'conception', 'diagnostic', 'schema directeur'] },
  { id: 'travaux', label: 'Travaux', terms: ['travaux', 'travail', 'chantier', 'realisation', 'amenagement'] },
  { id: 'fournitures', label: 'Fournitures', terms: ['fourniture', 'achat', 'acquisition', 'livraison', 'materiel', 'equipement'] },
  { id: 'services', label: 'Services', terms: ['service', 'prestation', 'location', 'organisation'] },
  { id: 'batiment', label: 'Bâtiment', terms: ['batiment', 'construction', 'genie civil', 'btp', 'amenagement', 'agencement'] },
  { id: 'routes', label: 'Routes', terms: ['route', 'voirie', 'piste', 'autoroute', 'chaussee', 'ouvrage d art', 'signalisation'] },
  { id: 'eau', label: 'Eau', terms: ['eau', 'assainissement', 'hydraulique', 'forage', 'adduction', 'irrigation', 'onee', 'abhm', 'abhs', 'abhb', 'abhd', 'epuration'] },
  { id: 'informatique', label: 'Informatique', terms: ['informatique', 'logiciel', 'systeme', 'digital', 'numerique', 'reseau', 'serveur', 'ordinateur', 'licence', 'cyber', 'messagerie', 'workspace'] },
  { id: 'formation', label: 'Formation', terms: ['formation', 'seminaire', 'atelier', 'coaching'] },
  { id: 'maintenance', label: 'Maintenance', terms: ['maintenance', 'entretien', 'reparation', 'depannage'] },
  { id: 'audit', label: 'Audit', terms: ['audit', 'expertise', 'controle', 'verification', 'certification'] },
  { id: 'assistance', label: 'Assistance', terms: ['assistance', 'maitrise', 'conseil', 'accompagnement', 'appui'] },
  { id: 'construction', label: 'Construction', terms: ['construction', 'batiment', 'genie civil', 'travaux'] },
  { id: 'electricite', label: 'Électricité', terms: ['electricite', 'electrique', 'eclairage', 'solaire', 'photovoltaique', 'poteaux', 'cablage'] },
  { id: 'plomberie', label: 'Plomberie', terms: ['plomberie', 'fluides', 'sanitaire', 'canalisation', 'pompe', 'motopompe'] },
  { id: 'sante', label: 'Santé', terms: ['sante', 'medical', 'medicament', 'hopital', 'pharmaceutique', 'irm', 'scanner', 'ambulance'] },
  { id: 'transport', label: 'Transport', terms: ['transport', 'logistique', 'vehicule', 'engins', 'carburant', 'fourgon', 'camion'] },
  { id: 'securite', label: 'Sécurité', terms: ['securite', 'gardiennage', 'surveillance', 'alarme', 'incendie'] },
  { id: 'nettoyage', label: 'Nettoyage', terms: ['nettoyage', 'proprete', 'dechets', 'espaces verts', 'jardinage'] },
  { id: 'mobilier', label: 'Mobilier', terms: ['mobilier', 'ameublement', 'meuble'] },
  { id: 'communication', label: 'Communication', terms: ['impression', 'communication', 'publicite', 'evenementiel', 'reception', 'signaletique'] },
  { id: 'hotellerie', label: 'Hôtellerie', terms: ['hotel', 'restauration', 'traiteur', 'hebergement'] },
];

function normText(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function matchesKeyword(terms, text) {
  const hay = normText(text);
  const tokens = hay.split(' ').filter(Boolean);
  return terms.some((raw) => {
    const t = normText(raw);
    if (!t) return false;
    if (t.includes(' ')) return hay.includes(t);
    if (t.length <= 3) return tokens.includes(t);
    return tokens.some((tok) => tok.startsWith(t));
  });
}

function catSlug(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const MCAT_HUE = { travaux: 26, services: 172, fournitures: 262, informatique: 210, sante: 340 };

function kwLabel(id) {
  const k = MKEYWORDS.find((x) => x.id === id);
  return k ? k.label : String(id || '');
}

function mSourceTag(m) {
  const s = String((m && (m.typeAnnonce || m.source)) || '').toLowerCase();
  if (s.includes('bon') || s.includes('bdc')) return 'BDC';
  if (s.includes('masen')) return 'MASEN';
  return 'PMPP';
}

function fmtNum(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('fr-FR');
}

function compactNum(n) {
  const v = Number(n) || 0;
  return v >= 1000 ? (Math.round(v / 100) / 10).toLocaleString('fr-FR') + 'k' : String(v);
}

function fmtWhen(iso) {
  if (!iso) return 'hors-ligne';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) + ' · ' +
    d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function fmtDay(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function MainApp({ session, onLogout }) {
  const boot = bootCache();
  const [jobs, setJobs] = useState(boot.jobs || []);
  const [updatedAt, setUpdatedAt] = useState(boot.jobsUpdated || '');
  const [loading, setLoading] = useState(!(boot.jobs || []).length);
  const [offline, setOffline] = useState(() => { try { return !navigator.onLine; } catch { return false; } });
  const [updateInfo, setUpdateInfo] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [updatePct, setUpdatePct] = useState(0);
  const [appVer, setAppVer] = useState('');
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
  const [alerts, setAlerts] = useState(boot.alerts || []);
  const [alertsUpdated, setAlertsUpdated] = useState(boot.alertsUpdated || '');
  const [seen, setSeen] = useState(() => { try { return localStorage.getItem(LS_SEEN) || ''; } catch { return ''; } });
  const [menuOpen, setMenuOpen] = useState(false);
  const [dlMsg, setDlMsg] = useState('');
  // ---- Exams (same Sujet + Corrige data as the web app) ----
  const [examIndex, setExamIndex] = useState(boot.exams || null);
  const [examSelId, setExamSelId] = useState('');
  const [examQ, setExamQ] = useState('');
  const [examFam, setExamFam] = useState('');
  const [examYearF, setExamYearF] = useState('');
  const [examOpen, setExamOpen] = useState(false);
  const [practiced, setPracticed] = useState(() => { try { return JSON.parse(localStorage.getItem('mjh_apk_practiced') || '{}'); } catch { return {}; } });
  // ---- Marchés Publics (flux direct PMMP + BDC) ----
  const [marches, setMarches] = useState(boot.marches || []);
  const [marchesUpdated, setMarchesUpdated] = useState(boot.marchesUpdated || '');
  const [mStatus, setMStatus] = useState('open');
  const [mCat, setMCat] = useState('');
  const [mVille, setMVille] = useState('');
  const [mSel, setMSel] = useState(null);
  const [mType, setMType] = useState('');
  const [mRegion, setMRegion] = useState('');
  const [mKw, setMKw] = useState('');
  const [mQuick, setMQuick] = useState('');
  // ---- Accès spécial Marchés publics (autorisation publiée par l'APK admin) ----
  const [access, setAccess] = useState(() => readAccess());
  const [mArchEmail, setMArchEmail] = useState(() => { try { return localStorage.getItem(LS_MARCHES_SESSION) || ''; } catch { return ''; } });
  const [mGateStep, setMGateStep] = useState('email'); // email | code
  const [mGateEmail, setMGateEmail] = useState(session.email || '');
  const [mGateCode, setMGateCode] = useState('');
  const [mGateInfo, setMGateInfo] = useState(null);
  const [mGateBusy, setMGateBusy] = useState(false);
  const [mGateErr, setMGateErr] = useState('');
  const [mGateMsg, setMGateMsg] = useState('');
  const closingRef = useRef(false);

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

  // Applique un fichier marchés seulement s'il est au moins aussi récent que
  // celui déjà enregistré : un cache local ne doit jamais être écrasé par une
  // copie distante en retard (ancien import de 25 offres, par exemple).
  function applyMarches(data) {
    const list = data && (data.AUTOX || data.offers || (Array.isArray(data) ? data : []));
    if (!list || !list.length) return;
    const next = (data && data.updatedAt) || '';
    const prev = readCached('marchesUpdated', '') || '';
    if (prev && next && String(next) < String(prev)) return;
    setMarches(list);
    setMarchesUpdated(next);
    writeCachedSafe('marches', list);
    writeCachedSafe('marchesUpdated', next);
  }

  async function loadMarches(remoteUrl) {
    const base = remoteBase(remoteUrl);
    // 1) Copie embarquée : instantanée, même sans réseau.
    try { applyMarches(await fetchJSON('./marches.json', 8000)); } catch {}
    // 2) Copie distante : au maximum toutes les 6 h (~2 Mo), sans bloquer
    //    l'affichage. Le garde-fou updatedAt empêche tout retour en arrière.
    let lastRemote = 0;
    try { lastRemote = Number(localStorage.getItem('mjh_marches_remote_at') || 0); } catch {}
    if (!base || Date.now() - lastRemote < 6 * 3600 * 1000) return;
    try {
      applyMarches(await fetchJSON(base + '/marches.json', 12000));
      try { localStorage.setItem('mjh_marches_remote_at', String(Date.now())); } catch {}
    } catch { /* réseau faible : on garde la copie embarquée / le cache */ }
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
    try {
      const data = await fetchFirst(urls, 9000);
      const offers = data.AUTOX || data.offers || (Array.isArray(data) ? data : []);
      if (offers.length) {
        const idx = data.AUTOX ? data : { ...data, AUTOX: offers };
        setExamIndex(idx);
        writeCached('exams', idx);
        if (!examSelId && offers.length) setExamSelId(offers[0].id);
      }
    } catch {}
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

  // ---- Connexion dédiée « Marchés publics » ----
  async function sendMarchesCode() {
    setMGateErr(''); setMGateMsg('');
    const target = mGateEmail.trim().toLowerCase();
    if (!validEmail(target)) { setMGateErr('Adresse e-mail invalide.'); return; }
    setMGateBusy(true);
    const fresh = await refreshAccessList();
    setAccess(fresh);
    if (accessDisabledList(fresh).includes(target)) {
      setMGateBusy(false);
      setMGateErr(blockedMessage());
      return;
    }
    if (!isMarchesAllowed(target, fresh)) {
      setMGateBusy(false);
      setMGateErr('Cette adresse n’est pas autorisée pour les Marchés publics. Demandez l’autorisation à l’administrateur.');
      return;
    }
    const code = makeCode();
    setMGateInfo({ code, exp: Date.now() + 10 * 60 * 1000, email: target });
    const r = await sendVerificationEmail({ to: target, code, name: session.name || '' });
    setMGateBusy(false);
    if (!r.ok) {
      setMGateInfo(null);
      setMGateErr(`Impossible d'envoyer l'e-mail : ${r.error === 'web' ? 'envoi disponible dans l’application Android' : r.error}`);
      return;
    }
    setMGateStep('code');
    setMGateCode('');
    setMGateMsg(`Code envoyé à ${target}`);
  }

  async function verifyMarchesCode() {
    setMGateErr(''); setMGateMsg('');
    if (!mGateInfo) { setMGateErr('Code expiré — demandez un nouveau code.'); return; }
    if (Date.now() > mGateInfo.exp) { setMGateErr('Code expiré. Demandez un nouveau code.'); return; }
    if (mGateCode.trim() !== mGateInfo.code) { setMGateErr('Code incorrect. Vérifiez votre e-mail.'); return; }
    setMGateBusy(true);
    const fresh = await refreshAccessList();
    setAccess(fresh);
    if (!isMarchesAllowed(mGateInfo.email, fresh)) {
      setMGateBusy(false);
      setMGateErr('Accès Marchés retiré ou non autorisé. Contactez l’administrateur.');
      return;
    }
    try { localStorage.setItem(LS_MARCHES_SESSION, mGateInfo.email); } catch {}
    setMArchEmail(mGateInfo.email);
    setMGateBusy(false);
    setMGateStep('email');
    setMGateInfo(null);
    setMGateCode('');
    showToast('Accès Marchés publics débloqué');
  }

  function requestMarchesAccess() {
    const text = `Bonjour, je demande l’accès à l’espace Marchés publics d’ASSOULI AUTOX pour : ${session.email} (${session.name || 'compte'}). Merci.`;
    openLink('https://wa.me/212663369080?text=' + encodeURIComponent(text));
  }

  // ---- Outils de configuration (aucune donnée personnelle affichée) ----
  async function enableNotifications() {
    await setupNotifications();
    const ok = await notifyPhone('Notifications activées', 'Vous recevrez les nouveautés même lorsque l’application est fermée.');
    showToast(ok ? 'Notifications activées' : 'Autorisez les notifications dans Android');
  }

  async function testNotification() {
    await setupNotifications();
    const ok = await notifyPhone('ASSOULI AUTOX', 'Notification de test — les alertes fonctionnent.');
    showToast(ok ? 'Notification de test envoyée' : 'Autorisez les notifications dans Android');
  }

  async function openNotificationSettings() {
    try {
      const { Capacitor, registerPlugin } = await import('@capacitor/core');
      if (!Capacitor.isNativePlatform()) { showToast('Réglages disponibles sur Android'); return; }
      const P = registerPlugin('AppControl');
      await P.notificationSettings();
    } catch { showToast('Ouvrez les réglages de notifications Android'); }
  }

  async function allowBackground() {
    try {
      const { Capacitor, registerPlugin } = await import('@capacitor/core');
      if (!Capacitor.isNativePlatform()) { showToast('Disponible sur Android'); return; }
      const P = registerPlugin('AppControl');
      await P.background();
    } catch { showToast('Ouvrez les réglages Android > Batterie'); }
  }

  function clearCache() {
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith(LS_CACHE))
        .forEach((k) => localStorage.removeItem(k));
    } catch {}
    showToast('Cache vidé — actualisation…');
    refresh(true);
  }

  async function getNativeVersion() {
    try {
      const { Capacitor, registerPlugin } = await import('@capacitor/core');
      if (!Capacitor.isNativePlatform()) return null;
      const P = registerPlugin('ApkUpdater');
      return await P.getVersion();
    } catch { return null; }
  }

  async function checkUpdate(notify = false) {
    try {
      const info = await fetchJSON(UPDATE_URL + '?t=' + Date.now(), 8000);
      const v = await getNativeVersion();
      if (v) setAppVer(`${v.versionName} (${v.versionCode})`);
      if (!v || !info) return;
      if (Number(info.versionCode) > Number(v.versionCode)) {
        setUpdateInfo(info);
        if (notify) showToast(`Mise à jour ${info.versionName} disponible`);
      } else if (notify) {
        showToast('Application à jour');
      }
    } catch {
      if (notify) showToast('Vérification impossible (réseau)');
    }
  }

  async function startUpdate() {
    if (!updateInfo || updating) return;
    setUpdating(true); setUpdatePct(0);
    try {
      const { registerPlugin } = await import('@capacitor/core');
      const P = registerPlugin('ApkUpdater');
      await P.addListener('progress', (e) => setUpdatePct(Math.max(0, Math.min(100, Number(e.percent) || 0))));
      await P.downloadAndInstall({ url: updateInfo.url, fileName: 'ASSOULI-AUTOX-' + updateInfo.versionName + '.apk' });
      showToast('Téléchargé — confirmez l’installation');
    } catch (e) {
      showToast('Mise à jour : ' + (e.message || 'réseau faible'));
    } finally {
      setUpdating(false);
    }
  }

  async function enforceAccess(prefetched) {
    if (closingRef.current) return;
    const acc = prefetched || await refreshAccessList();
    setAccess(acc || {});
    if (accessDisabledList(acc).includes(String(session.email || '').toLowerCase())) {
      closingRef.current = true;
      try { localStorage.setItem('mjh_blocked_msg', acc.message || 'Ce compte a été désactivé par l’administrateur.'); } catch {}
      onLogout();
      // Laisse le temps d'écrire le message, puis ferme vraiment l'APK.
      setTimeout(() => { closeAppNow(); }, 260);
    }
  }

  async function loadBundled() {
    const data = await fetchJSON('./jobs.json', 8000);
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
    try {
      const data = await fetchFirst(urls, 9000);
      const list = Array.isArray(data) ? data : data.alerts || [];
      if (list.length || data.alerts) {
        setAlerts(list);
        setAlertsUpdated(data.updatedAt || '');
        writeCached('alerts', list);
        writeCached('alertsUpdated', data.updatedAt || '');
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
      }
    } catch {}
  }

  async function refresh(manual = true, silent = false) {
    if (manual) { setRefreshing(true); setSpin((s) => s + 1); }
    else if (!silent) setLoading(true);
    try {
      let list = [], upd = '';
      const remoteUrl = (remote || '').trim();
      if (remoteUrl) {
        try {
          const data = await fetchJSON(remoteUrl);
          list = Array.isArray(data) ? data : data.jobs || [];
          upd = data.updatedAt || new Date().toISOString();
          if (list.length) {
            const prevCount = Number(localStorage.getItem('mjh_last_remote_jobs') || 0);
            localStorage.setItem('mjh_last_remote_jobs', String(list.length));
            if (prevCount > 0 && list.length > prevCount) {
              notifyPhone(`Nouvelles offres • ${list.length - prevCount}`, `${list.length} offres suivies. Ouvrez ASSOULI AUTOX pour les consulter.`);
            }
            setJobs(list); setUpdatedAt(upd); setOffline(false);
            writeCached('jobs', list); writeCached('jobsUpdated', upd);
            if (!silent) showToast(`Actualisé (distant) • ${list.length} offres`);
            loadAlerts(remoteUrl); loadExams(remoteUrl); loadMarches(remoteUrl); return;
          }
        } catch (e) { /* réseau faible → cache local */ }
      }
      // Réseau faible / hors ligne : on garde la dernière synchro enregistrée
      const netDown = (() => { try { return navigator.onLine === false; } catch { return false; } })();
      // Sans URL distante (mode local), l'absence de synchro n'est pas une
      // panne réseau : on ne montre « hors ligne » que si le téléphone l'est.
      const fallbackOffline = netDown || !!remoteUrl;
      const cached = readCached('jobs', []);
      const cachedUpd = readCached('jobsUpdated', '');
      if (cached.length) {
        setJobs(cached); setUpdatedAt(cachedUpd); setOffline(fallbackOffline);
        if (!silent) showToast(fallbackOffline ? `Hors ligne • ${cached.length} offres enregistrées` : `Données locales • ${cached.length} offres`);
      } else {
        const b = await loadBundled();
        setJobs(b.list); setUpdatedAt(b.updatedAt); setOffline(fallbackOffline);
        writeCached('jobs', b.list); writeCached('jobsUpdated', b.updatedAt);
        if (!silent) showToast(fallbackOffline ? `Mode hors ligne • ${b.list.length} offres` : `Données locales • ${b.list.length} offres`);
      }
      loadAlerts(remoteUrl); loadExams(remoteUrl); loadMarches(remoteUrl);
    } catch (e) {
      if (!silent) showToast('Réseau faible — données enregistrées affichées');
    } finally {
      setRefreshing(false); setLoading(false);
    }
  }

  useEffect(() => { setupNotifications(); refresh(false); checkUpdate(); enforceAccess(); }, []);
  useEffect(() => {
    const goOnline = () => { setOffline(false); refresh(false, true); enforceAccess(); };
    const goOffline = () => setOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  }, [remote]);
  // L'APK admin publie access.json puis prévient l'app sur le même téléphone.
  useEffect(() => {
    const onAccessChanged = () => {
      let data = null;
      try {
        const raw = window.__mjhAccess;
        window.__mjhAccess = null;
        if (raw) {
          data = JSON.parse(raw);
          if (data && Array.isArray(data.disabled)) {
            localStorage.setItem(LS_ACCESS, JSON.stringify(data));
            setAccess(data);
          } else {
            data = null;
          }
        }
      } catch {}
      enforceAccess(data);
    };
    window.addEventListener('access-changed', onAccessChanged);
    return () => window.removeEventListener('access-changed', onAccessChanged);
  }, [session]);
  // Auto-refresh: every 30 min + each time the app comes back to foreground
  useEffect(() => {
    const AUTO_MS = 30 * 60 * 1000;
    const ACCESS_MS = 20 * 1000;
    const tick = () => { refresh(false, true); checkUpdate(); enforceAccess(); };
    const interval = setInterval(tick, AUTO_MS);
    const accessInterval = setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine !== false) enforceAccess();
    }, ACCESS_MS);
    const onVis = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('resume', tick); // Capacitor resume event
    return () => {
      clearInterval(interval);
      clearInterval(accessInterval);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('resume', tick);
    };
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

  const examAUTOX = useMemo(() => {
    let list = (examIndex && examIndex.AUTOX) || [];
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
    ((examIndex && examIndex.AUTOX) || []).forEach((o) => { const k = o.familyLabel || 'Autres'; m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [examIndex]);

  const examTotals = useMemo(() => {
    let sujets = 0, corriges = 0, years = 0;
    ((examIndex && examIndex.AUTOX) || []).forEach((o) => {
      const ys = new Set();
      o.files.forEach((f) => { ys.add(f.year); if (f.kind === 'corrige') corriges++; else sujets++; });
      years += ys.size;
    });
    return { sujets, corriges, years };
  }, [examIndex]);

  const examPracticed = useMemo(() => {
    let done = 0, total = 0;
    ((examIndex && examIndex.AUTOX) || []).forEach((o) => {
      const ys = [...new Set(o.files.map((f) => f.year))];
      total += ys.length;
      done += ys.filter((y) => practiced[`${o.id}-${y}`]).length;
    });
    return { done, total };
  }, [examIndex, practiced]);

  const examSel = useMemo(() => {
    const list = (examIndex && examIndex.AUTOX) || [];
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

  // Accès spécial : soit l'e-mail de session, soit l'e-mail vérifié via la
  // connexion dédiée Marchés, doit figurer dans la liste publiée par l'admin.
  const mArchVia = isMarchesAllowed(mArchEmail, access)
    ? mArchEmail
    : (isMarchesAllowed(session.email, access) ? session.email : '');
  const mArchAllowed = !!mArchVia;

  // Nouveautés détectées par le collecteur (premier passage) sur 24 h.
  const mNewIds = useMemo(() => {
    const cutoff = Date.now() - 86400000;
    const ids = new Set();
    marches.forEach((m) => {
      const t = m.firstSeenAt ? Date.parse(m.firstSeenAt) : 0;
      if (t && t >= cutoff) ids.add(m.id);
    });
    return ids;
  }, [marches]);

  // Sur le tout premier import, tout est « nouveau » : on évite alors de
  // couvrir chaque carte d'un badge pour rester lisible.
  const mShowNewBadges = mNewIds.size > 0 && mNewIds.size <= Math.max(40, marches.length * 0.25);

  const mKwCounts = useMemo(() => {
    const counts = {};
    MKEYWORDS.forEach((k) => { counts[k.id] = 0; });
    marches.forEach((m) => {
      const tags = Array.isArray(m.keywords) ? m.keywords : [];
      if (tags.length) {
        tags.forEach((t) => { if (counts[t] !== undefined) counts[t] += 1; });
        return;
      }
      const hay = [m.objet, m.categorie, m.typeProcedure, m.modePassation, m.organisme].join(' ');
      MKEYWORDS.forEach((k) => { if (matchesKeyword(k.terms, hay)) counts[k.id] += 1; });
    });
    return counts;
  }, [marches]);

  const mTopKws = useMemo(
    () => [...MKEYWORDS].sort((a, b) => (mKwCounts[b.id] || 0) - (mKwCounts[a.id] || 0)).slice(0, 6),
    [mKwCounts]
  );

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
    if (mQuick === 'soon') l = l.filter((m) => {
      const end = m.dateLimiteIso ? Date.parse(m.dateLimiteIso) + (m.dateOnly ? 86399999 : 0) : 0;
      if (!end) return false;
      const d = end - Date.now();
      return d >= 0 && d <= 7 * 86400000;
    });
    if (mQuick === 'new') l = l.filter((m) => mNewIds.has(m.id));
    if (mKw) {
      const kw = MKEYWORDS.find((k) => k.id === mKw);
      l = l.filter((m) => {
        const tags = Array.isArray(m.keywords) ? m.keywords : [];
        if (tags.length) return tags.includes(mKw);
        const hay = [m.objet, m.categorie, m.typeProcedure, m.modePassation, m.organisme].join(' ');
        return kw ? matchesKeyword(kw.terms, hay) : normText(hay).includes(normText(mKw));
      });
    }
    if (query.trim()) {
      const s = query.trim().toLowerCase();
      l = l.filter((m) => [m.ref, m.organisme, m.objet, m.ville, m.typeProcedure, m.modePassation].join(' ').toLowerCase().includes(s));
    }
    if (mQuick === 'new') {
      l.sort((a, b) => String(b.firstSeenAt || '').localeCompare(String(a.firstSeenAt || '')));
    }
    return l;
  }, [marches, mStatus, mCat, mVille, mType, mRegion, mKw, mQuick, mNewIds, query]);
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
    setMSel(null); setMCat(''); setMVille(''); setMStatus('open'); setMType(''); setMRegion(''); setMKw(''); setMQuick('');
    try { window.scrollTo({ top: 0 }); } catch {}
  }

  return (
    <div className="phone" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {menuOpen && <div className="drawer-overlay" onClick={() => setMenuOpen(false)} />}
      <aside className={'drawer' + (menuOpen ? ' open' : '')}>
        <div className="drawer-brand"><img src="./app-icon.png" alt="ASSOULI AUTOX" className="drawer-logo" /><span><b>ASSOULI</b> <em>AUTOX</em></span></div>
        <div className="drawer-account"><Icon n="check" size={14} /><span>{session.email}</span></div>
        <p className="muted">ASSOULI AUTOX • {stats.total} offres • {mArchAllowed ? `${mStats.total} marchés publics` : 'Marchés sur autorisation'} • {(updatedAt || '').slice(0, 10) || 'hors-ligne'}</p>
        <nav className="drawer-nav">
          <button className={tab === 'jobs' && kind === 'all' ? 'active' : ''} onClick={() => goTab('jobs', 'all')}><span className="dn-l"><Icon n="search" size={19} />Toutes les offres</span></button>
          <button className={tab === 'jobs' && kind === 'emploi' ? 'active' : ''} onClick={() => goTab('jobs', 'emploi')}><span className="dn-l"><Icon n="briefcase" size={19} />Emplois CDI/CDD</span></button>
          <button className={tab === 'jobs' && kind === 'stages' ? 'active' : ''} onClick={() => goTab('jobs', 'stages')}><span className="dn-l"><Icon n="cap" size={19} />Stages</span>{stats.stages > 0 && <b className="count">{stats.stages}</b>}</button>
          <button className={tab === 'concours' ? 'active' : ''} aria-current={tab === 'concours' ? 'page' : undefined} onClick={() => goTab('concours')}><span className="dn-l"><Icon n="landmark" size={19} />Concours État</span></button>
          <button className={tab === 'marches' ? 'active' : ''} aria-current={tab === 'marches' ? 'page' : undefined} onClick={() => goTab('marches')}><span className="dn-l"><Icon n="scale" size={19} />Marchés Publics</span>{mArchAllowed && mStats.open > 0 && <b className="count">{compactNum(mStats.open)}</b>}{!mArchAllowed && <b className="count"><Icon n="lock" size={11} /></b>}</button>
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
            <div className="brand"><b>ASSOULI</b> <span>AUTOX</span></div>
          </div>
          <div className="top-actions">
            <button className="refresh" onClick={() => setTab('setup')} title="Configuration" aria-label="Configuration"><Icon n="sliders" /></button>
            <button className={'refresh' + (refreshing ? ' spinning' : '')} onClick={() => refresh(true)} title="Actualiser" aria-label="Actualiser"><Icon n="refresh" /></button>
          </div>
        </div>
      </header>
      {updateInfo && (
        <div className="update-banner">
          <span className="upd-ic"><Icon n="download" size={16} /></span>
          <div className="upd-txt">
            <b>Mise à jour {updateInfo.versionName}</b>
            <span>{updateInfo.notes || 'Nouvelle version disponible'}</span>
            {updating && <div className="upd-bar"><span style={{ width: updatePct + '%' }} /></div>}
          </div>
          <button className="upd-btn" disabled={updating} onClick={startUpdate}>{updating ? updatePct + '%' : 'Installer'}</button>
          {!updating && <button className="upd-x" onClick={() => setUpdateInfo(null)} aria-label="Plus tard"><Icon n="close" size={14} /></button>}
        </div>
      )}
      {(tab === 'jobs' || tab === 'concours') && (
      <section className="hero">
        <div className="hero-stats">
          <div className="hstat"><b>{stats.total}</b><span>offres</span></div>
          <div className="hstat green"><b>{stats.thisWeek}</b><span>≤ 7 jours</span></div>
          <div className="hstat orange"><b>{stats.urgent}</b><span>urgentes</span></div>
          <div className="hstat stages"><b>{stats.stages}</b><span>stages</span></div>
          <div className="hstat violet"><b>{stats.concours}</b><span>concours</span></div>
        </div>
        <div className="updated">{refreshing ? 'Actualisation…' : loading ? 'Chargement…' : `Dernière actualisation : ${(updatedAt || '').slice(0, 16).replace('T', ' ') || 'à l’instant'} • ${filtered.length} affichées`}</div>
      </section>
      )}

      <div className="section-bar">
        <img src={section.icon} alt="" className="section-logo" />
        <span className="section-emoji"><Icon n={section.ico} size={22} /></span>
        <b>{section.label}</b>
        {tab === 'jobs' && <span className="section-count">{filtered.length} affichées</span>}
        {tab === 'concours' && <span className="section-count">{concoursList.length} concours</span>}
        {tab === 'marches' && mArchAllowed && <span className="section-count">{fmtNum(mStats.open)} ouverts</span>}
        {tab === 'marches' && !mArchAllowed && <span className="section-count m-locked-count"><Icon n="lock" size={12} /> Réservé</span>}
      </div>

      {tab === 'marches' && !mArchAllowed && (
        <main className="feed m-gate-feed">
          <section className="m-gate" aria-label="Accès Marchés publics">
            <div className="m-gate-emblem"><Icon n="lock" size={30} /></div>
            <span className="m-eyebrow">Accès réservé</span>
            <h2>Marchés publics</h2>
            <p className="m-gate-sub">Cet espace est réservé aux comptes autorisés par l’administrateur ASSOULI AUTOX.</p>

            {mGateStep === 'email' ? (
              <>
                <label className="auth-field"><span>E-mail autorisé</span>
                  <input className="auth-input" type="email" value={mGateEmail} onChange={(e) => setMGateEmail(e.target.value)} placeholder="vous@exemple.com" autoComplete="email" inputMode="email" />
                </label>
                <button className="auth-btn" disabled={mGateBusy} onClick={sendMarchesCode}>{mGateBusy ? 'Vérification…' : 'Recevoir le code'}</button>
              </>
            ) : (
              <>
                <div className="m-gate-sent"><Icon n="mail" size={16} /><span>Code envoyé à <b>{mGateInfo ? mGateInfo.email : mGateEmail}</b></span></div>
                <label className="auth-field"><span>Code à 6 chiffres</span>
                  <input className="auth-input auth-code" value={mGateCode} onChange={(e) => setMGateCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
                </label>
                <button className="auth-btn" disabled={mGateBusy} onClick={verifyMarchesCode}>{mGateBusy ? 'Vérification…' : 'Débloquer les Marchés'}</button>
                <button className="auth-link" onClick={() => { setMGateStep('email'); setMGateInfo(null); setMGateCode(''); setMGateErr(''); setMGateMsg(''); }}>Utiliser une autre adresse</button>
              </>
            )}

            {mGateErr && <div className="auth-error">{mGateErr}</div>}
            {mGateMsg && <div className="auth-ok">{mGateMsg}</div>}

            <button className="ghost m-gate-request" onClick={requestMarchesAccess}><Icon n="shield" size={16} /> Demander l’autorisation</button>
            <p className="m-gate-note">L’administration active ou retire l’accès à distance. Toute révocation reverrouille cet espace.</p>
          </section>
        </main>
      )}

      {tab === 'marches' && mArchAllowed && (
        <section className="m-band" aria-label="Marchés publics — indicateurs">
          <div className="m-band-top">
            <div className="m-band-title">
              <span className="m-live"><i /> Flux direct · PMMP + BDC</span>
              <h2>Marchés publics</h2>
              <p>{fmtNum(mStats.open)} consultations ouvertes · PMMP + BDC · données publiques · maj {fmtWhen(marchesUpdated)}</p>
            </div>
            <span className="m-band-seal" aria-hidden="true"><Icon n="scale" size={24} /></span>
          </div>
          <div className="m-kpis">
            <button type="button" aria-pressed={mStatus === 'open' && !mQuick} className={'m-kpi' + (mStatus === 'open' && !mQuick ? ' active' : '')} onClick={() => { setMStatus('open'); setMQuick(''); }}>
              <b>{fmtNum(mStats.open)}</b><span>Ouverts</span>
            </button>
            <button type="button" aria-pressed={mQuick === 'soon'} className={'m-kpi' + (mQuick === 'soon' ? ' active' : '')} onClick={() => { setMStatus('open'); setMQuick(mQuick === 'soon' ? '' : 'soon'); }}>
              <b>{fmtNum(mStats.soon)}</b><span>≤ 7 jours</span>
            </button>
            <button type="button" aria-pressed={mQuick === 'new'} className={'m-kpi' + (mQuick === 'new' ? ' active' : '')} onClick={() => { setMStatus('open'); setMQuick(mQuick === 'new' ? '' : 'new'); }}>
              <b>{fmtNum(mNewIds.size)}</b><span>Nouveaux 24 h</span>
            </button>
            <button type="button" aria-pressed={mStatus === 'all' && !mQuick} className={'m-kpi' + (mStatus === 'all' && !mQuick ? ' active' : '')} onClick={() => { setMStatus('all'); setMQuick(''); }}>
              <b>{fmtNum(mStats.total)}</b><span>Total suivi</span>
            </button>
          </div>
          <p className="m-band-hint">Touchez un indicateur pour filtrer la liste.</p>
        </section>
      )}

      {(tab === 'jobs' || tab === 'concours' || (tab === 'marches' && mArchAllowed)) && (
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

      {tab === 'marches' && mArchAllowed && (
      <>
      <div className="filters modern-filters">
        <button className={'fchip' + (mStatus === 'open' ? ' active' : '')} onClick={() => { setMStatus(mStatus === 'open' && !mQuick ? 'all' : 'open'); setMQuick(''); }}><Icon n="clock" size={15} /> Ouverts ({fmtNum(mStats.open)})</button>
        <button className={'fchip' + (mStatus === 'closed' ? ' active' : '')} onClick={() => { setMStatus(mStatus === 'closed' ? 'all' : 'closed'); setMQuick(''); }}>Clôturés ({fmtNum(mStats.closed)})</button>
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
        {(query || mCat || mVille || mType || mRegion || mKw || mQuick || mStatus !== 'open') && (
          <button className="clear" onClick={() => { setQuery(''); setMCat(''); setMVille(''); setMType(''); setMRegion(''); setMKw(''); setMQuick(''); setMStatus('open'); }} aria-label="Réinitialiser les filtres"><Icon n="close" size={16} /></button>
        )}
      </div>
      <div className="kw-row m-kw-row">
        <span className="kw-label"><Icon n="search" size={13} /> Mots-clés</span>
        <button className={'kw-chip' + (!mKw ? ' active' : '')} onClick={() => setMKw('')}>Tous</button>
        {MKEYWORDS.map((k) => {
          const n = mKwCounts[k.id] || 0;
          return (
            <button
              key={k.id}
              type="button"
              disabled={!n}
              title={`${k.label} — ${n} consultation${n > 1 ? 's' : ''}`}
              className={'kw-chip' + (mKw === k.id ? ' active' : '') + (!n ? ' is-empty' : '')}
              onClick={() => setMKw(mKw === k.id ? '' : k.id)}
            >
              {k.label}<i>{n}</i>
            </button>
          );
        })}
      </div>
      </>
      )}

      {tab === 'marches' && mArchAllowed && (
        <main className="feed">
          <div className="m-result">
            <span><b>{fmtNum(mFiltered.length)}</b> consultation{mFiltered.length > 1 ? 's' : ''}{mKw ? ` · ${kwLabel(mKw)}` : ''}</span>
            <span>{mQuick === 'new' ? 'Tri : nouveauté' : mQuick === 'soon' ? 'Tri : échéance ≤ 7 j' : 'Tri : échéance'}</span>
          </div>
          {marches.length === 0 && <div className="empty">Aucun marché public. Touchez ↻ pour actualiser.</div>}
          {mFiltered.length === 0 && marches.length > 0 && <div className="empty">Aucun marché ne correspond aux filtres.</div>}
          {mFiltered.map((m) => {
            const dl = mDeadline(m);
            const cat = catSlug(m.categorie);
            const isNew = mShowNewBadges && mNewIds.has(m.id);
            const hue = MCAT_HUE[cat] ?? 200;
            return (
              <article className={'card mcard cat-' + (cat || 'autre')} key={m.id} onClick={() => setMSel(m)}>
                <div className="card-head">
                  <div className="avatar" style={{ '--h': hue }}><Icon n="gavel" size={20} /></div>
                  <div className="chead">
                    <div className="m-topline">
                      <span className="mcard-ref">{m.ref || 'Sans référence'}</span>
                      {isNew && <span className="m-new">Nouveau</span>}
                    </div>
                    <h3 className="m-org">{m.organisme || 'Organisme public'}</h3>
                    <div className="csub meta">
                      {m.ville && <span><Icon n="pin" size={14} />{String(m.ville).length > 40 ? String(m.ville).slice(0, 40) + '…' : m.ville}</span>}
                      <span><Icon n="file" size={14} />{m.categorie || 'Marché'}</span>
                    </div>
                  </div>
                </div>
                <p className="desc m-objet">{m.objet || '—'}</p>
                <div className="chips">
                  <span className={'chip ' + dl.cls}>{dl.label}</span>
                  {m.modePassation && <span className="chip blue">{m.modePassation}</span>}
                  {m.qc && <span className="chip m-qc"><Icon n="check" size={12} />Q&C · {m.qc}</span>}
                  {m.estimation && <span className="chip muted m-money">{m.estimation}</span>}
                </div>
                <div className="m-foot">
                  <span className="m-open">Ouvrir la fiche <Icon n="arrow" size={14} /></span>
                  <span className="m-src">{mSourceTag(m)}</span>
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
                    ? `${examIndex.AUTOX.length} concours • ${examIndex.years[examIndex.years.length - 1]}–${examIndex.years[0]} • sujet + corrigé`
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
          {examIndex && examAUTOX.length === 0 && (
            <div className="empty">Aucun exam ne correspond à ces filtres. Touchez ↻ pour actualiser.</div>
          )}

          <div className="exam-grid">
            {examAUTOX.map((o) => {
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
          {examIndex && examAUTOX.length > 0 && (
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
              <div className="dstat green" onClick={() => goTab('marches')}>
                {mArchAllowed ? (<><b>{mStats.open}</b><span>Marchés ouverts</span></>) : (<><b className="dstat-lock"><Icon n="lock" size={18} /></b><span>Marchés réservés</span></>)}
              </div>
            </div>
          </div>
          {mStats.total > 0 && mArchAllowed && (
            <div className="panel m-dash-panel">
              <div className="section-header"><h3>Marchés publics</h3><span className="section-count">{fmtNum(mStats.open)} ouverts</span></div>
              <p className="muted">Flux direct PMMP + BDC — {fmtNum(mStats.total)} consultations suivies, dont {fmtNum(mStats.soon)} à moins de 7 jours.</p>
              <div className="m-mini-kpis">
                <div><b>{fmtNum(mStats.open)}</b><span>Ouverts</span></div>
                <div><b>{fmtNum(mStats.soon)}</b><span>≤ 7 jours</span></div>
                <div><b>{fmtNum(mNewIds.size)}</b><span>Nouveaux 24 h</span></div>
              </div>
              <div className="m-kw-mini">
                {mTopKws.map((k) => (
                  <button type="button" key={k.id} className="kw-chip" onClick={() => { goTab('marches'); setMKw(k.id); }}>
                    {k.label}<i>{mKwCounts[k.id] || 0}</i>
                  </button>
                ))}
              </div>
              <div className="row" style={{ marginTop: 12 }}>
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
        <main className="dash setup-tools">
          <div className="panel">
            <div className="section-header"><h3>Outils</h3></div>
            <div className="tool-grid">
              <button className="tool-btn" onClick={() => refresh(true)}><span className="tool-ic"><Icon n="refresh" size={22} /></span><span>Actualiser</span><small>Données en direct</small></button>
              <button className="tool-btn" onClick={() => checkUpdate(true)}><span className="tool-ic"><Icon n="download" size={22} /></span><span>Mises à jour</span><small>Vérifier la version</small></button>
              <button className="tool-btn" onClick={enableNotifications}><span className="tool-ic"><Icon n="bell" size={22} /></span><span>Activer les alertes</span><small>Nouveautés en fond</small></button>
              <button className="tool-btn" onClick={testNotification}><span className="tool-ic"><Icon n="check" size={22} /></span><span>Tester</span><small>Notification immédiate</small></button>
              <button className="tool-btn" onClick={openNotificationSettings}><span className="tool-ic"><Icon n="sliders" size={22} /></span><span>Réglages</span><small>Notifications Android</small></button>
              <button className="tool-btn" onClick={allowBackground}><span className="tool-ic"><Icon n="shield" size={22} /></span><span>Arrière-plan</span><small>Autoriser la batterie</small></button>
              <button className="tool-btn danger" onClick={clearCache}><span className="tool-ic"><Icon n="close" size={22} /></span><span>Vider le cache</span><small>Données téléchargées</small></button>
              <button className="tool-btn danger" onClick={onLogout}><span className="tool-ic"><Icon n="lock" size={22} /></span><span>Se déconnecter</span><small>Quitter le compte</small></button>
            </div>
          </div>
          {updateInfo && (
            <div className="panel">
              <div className="row">
                <button className="apply" onClick={startUpdate} disabled={updating}><Icon n="download" size={16} /> {updating ? `Téléchargement ${updatePct}%` : `Installer la mise à jour ${updateInfo.versionName}`}</button>
              </div>
            </div>
          )}
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
        const cat = catSlug(mSel.categorie);
        const hue = MCAT_HUE[cat] ?? 200;
        const isNew = mShowNewBadges && mNewIds.has(mSel.id);
        const official = mSel.portalHref || mSel.dceUrl || '';
        const kws = (Array.isArray(mSel.keywords) ? mSel.keywords : []).map(kwLabel).filter(Boolean).slice(0, 8);
        return (
          <>
            <div className="sheet-overlay" onClick={() => setMSel(null)} aria-hidden="true" />
            <div className="sheet m-sheet" role="dialog" aria-modal="true" aria-label={`Marché ${mSel.ref || ''}`}>
              <div className="sheet-handle" />
              <div className="sheet-head">
                <div className="avatar" style={{ '--h': hue }}><Icon n="gavel" size={20} /></div>
                <div className="chead">
                  <div className="m-topline">
                    <span className="mcard-ref">{mSel.ref || 'Sans référence'}</span>
                    {isNew && <span className="m-new">Nouveau</span>}
                  </div>
                  <h3 className="m-org">{mSel.organisme || 'Organisme public'}</h3>
                  <div className="chips">
                    <span className={'chip ' + dl.cls}>{dl.label}</span>
                    {mSel.categorie && <span className="chip ref-chip">{mSel.categorie}</span>}
                    {mSel.ville && <span className="chip blue"><Icon n="pin" size={12} />{mSel.ville}</span>}
                  </div>
                </div>
                <button className="sheet-close" onClick={() => setMSel(null)} aria-label="Fermer"><Icon n="close" size={18} /></button>
              </div>
              <div className="sheet-body">
                <div className="panel m-object-panel">
                  <span className="m-eyebrow">Objet de la consultation</span>
                  <p className="desc" style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{mSel.objet || '—'}</p>
                  {kws.length > 0 && (
                    <div className="chips">
                      {kws.map((k) => <span className="chip m-kw" key={k}>{k}</span>)}
                    </div>
                  )}
                </div>

                <div className="m-figures">
                  {mSel.estimation && <div className="m-fig"><span>Estimation</span><b>{mSel.estimation}</b></div>}
                  {mSel.caution && <div className="m-fig"><span>Caution provisoire</span><b>{mSel.caution}</b></div>}
                  {mSel.qc && <div className="m-fig"><span>Qualification & capacité</span><b>{mSel.qc}</b></div>}
                  <div className="m-fig"><span>Source</span><b>{mSourceTag(mSel)}</b></div>
                </div>

                <div className="panel">
                  <h3>Dossier officiel</h3>
                  <p className="muted">Cette consultation est publiée sur le portail marocain des marchés publics. Ouvrez la fiche officielle pour le règlement de consultation, le CPS et le dépôt électronique.</p>
                  <div className="row" style={{ marginTop: 10 }}>
                    {official && <button className="apply" onClick={() => openLink(official)}><Icon n="arrow" size={16} /> Portail officiel</button>}
                    {mSel.detailUrl && mSel.detailUrl !== official && <button className="ghost" onClick={() => openLink(mSel.detailUrl)}><Icon n="eye" size={16} /> Fiche détaillée</button>}
                  </div>
                  {(mSel.docs || []).map((d, i) => (
                    <div className="doc-row" key={d.file + i}>
                      <Icon n="file" size={20} />
                      <span className="doc-name">{d.name || 'Avis PDF'}</span>
                      <span className="doc-size">{d.size ? (d.size / 1024 / 1024).toFixed(1) + ' Mo' : ''}</span>
                      <button className="ghost sm" onClick={() => downloadFile(marcheDocUrl(d), `${mSel.ref}-${d.name || 'avis'}.pdf`.replace(/[^\wÀ-ÿ.-]+/g, '-').slice(0, 60))}><Icon n="download" size={14} /></button>
                    </div>
                  ))}
                  {mSel.dceSize && <p className="muted" style={{ marginTop: 8 }}>{mSel.dceSize}</p>}
                </div>

                <div className="panel">
                  <h3>Informations clés</h3>
                  {mSel.dateLimite && <div className="mrow"><span className="mlabel">Clôture</span><span className="mval">{mSel.dateLimite}</span></div>}
                  {mSel.modePassation && <div className="mrow"><span className="mlabel">Mode</span><span className="mval">{mSel.modePassation}</span></div>}
                  {mSel.typeProcedure && <div className="mrow"><span className="mlabel">Type d’offre</span><span className="mval">{mSel.typeProcedure}</span></div>}
                  {mSel.prixAcquisition && mSel.prixAcquisition !== '0,00 MAD' && <div className="mrow"><span className="mlabel">Prix DCE</span><span className="mval">{mSel.prixAcquisition}</span></div>}
                  {mSel.lieuOuverture && <div className="mrow"><span className="mlabel">Ouverture plis</span><span className="mval">{mSel.lieuOuverture}</span></div>}
                  {mSel.adresseRetrait && <div className="mrow"><span className="mlabel">Retrait</span><span className="mval">{mSel.adresseRetrait}</span></div>}
                  {mSel.adresseDepot && <div className="mrow"><span className="mlabel">Dépôt</span><span className="mval">{mSel.adresseDepot}</span></div>}
                  {mSel.ref && <div className="mrow"><span className="mlabel">Référence</span><span className="mval">{mSel.ref}</span></div>}
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

                <p className="m-source">
                  Source : <b>Portail marocain des marchés publics (PMMP)</b> — consultation relayée par appeldoffres.ma.
                  {mSel.firstSeenAt ? ` Repérée le ${fmtDay(mSel.firstSeenAt)}.` : ''} Données publiques : vérifiez toujours le dossier officiel avant de soumissionner.
                </p>
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
  const [intro, setIntro] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setIntro(false), 1700);
    syncNativeAccounts(loadAccounts());
    return () => clearTimeout(t);
  }, []);
  return (
    <>
      {intro && <SplashIntro />}
      {!session ? <AuthScreen onAuthed={setSession} /> : <MainApp session={session} onLogout={() => { clearSession(); clearMarchesSession(); setSession(null); }} />}
    </>
  );
}
