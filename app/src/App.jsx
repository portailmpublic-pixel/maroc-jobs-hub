import React, { useEffect, useMemo, useRef, useState } from 'react';
import { enrichJobs } from './jobEnrichment.js';

const DEFAULT_REMOTE = 'https://raw.githubusercontent.com/portailmpublic-pixel/maroc-jobs-hub/master/app/public/jobs.json';
const LS_REMOTE = 'mjh_remote_url';
const LS_SEEN = 'mjh_alerts_seen';
const LS_CACHE = 'mjh_cache_';
const LS_ACCESS = 'mjh_access_v1';
const LS_ACCESS_AT = 'mjh_access_checked_v1';
const LS_MARCHES_SESSION = 'mjh_marches_session_v1';
const LS_THEME = 'mjh_theme_v1';
const ACCESS_URL = 'https://raw.githubusercontent.com/portailmpublic-pixel/maroc-jobs-hub/master/app/public/access.json';
const UPDATE_URL = 'https://raw.githubusercontent.com/portailmpublic-pixel/maroc-jobs-hub/master/app/public/app-version.json';

function readAccess() {
  try { return JSON.parse(localStorage.getItem(LS_ACCESS) || '{}'); } catch { return {}; }
}

// ---- Apparence : clair / sombre / auto ----
function readThemePref() {
  try {
    const v = localStorage.getItem(LS_THEME);
    return v === 'dark' || v === 'light' ? v : 'auto';
  } catch { return 'auto'; }
}

function systemTheme() {
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }
  catch { return 'light'; }
}

function resolveTheme(pref) {
  return pref === 'dark' || pref === 'light' ? pref : systemTheme();
}

function applyTheme(pref) {
  const theme = resolveTheme(pref);
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.themePref = pref;
  root.style.colorScheme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#070C16' : '#0B2B4B');
  try { localStorage.setItem(LS_THEME, pref); } catch {}
  return theme;
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

async function refreshAccessList(opts = {}) {
  try {
    const data = await fetchJSON(ACCESS_URL + '?v=' + Date.now(), 8000, { cache: 'no-store' });
    if (data && (Array.isArray(data.disabled) || Array.isArray(data.marches))) {
      localStorage.setItem(LS_ACCESS, JSON.stringify(data));
      return data;
    }
  } catch (e) {
    if (opts.throwOnError) throw e;
  }
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

async function fetchJSON(url, timeoutMs = 12000, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => { try { ctrl.abort(); } catch {} }, timeoutMs);
  try {
    const r = await fetch(url, { cache: 'default', ...opts, signal: ctrl.signal });
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
  back: <path d="M15 19l-7-7 7-7" />,
  share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 10.6l6.8-4.2M8.6 13.4l6.8 4.2" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5h.01" /></>,
  spark: <><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M19 16l.9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9z" /></>,
  building2: <><path d="M4 21V7l8-4 8 4v14M9 21v-4h6v4M8 9h.01M12 9h.01M16 9h.01M8 13h.01M12 13h.01M16 13h.01" /></>,
  bookmark: <path d="M6 4h12v17l-6-4-6 4z" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a6.8 6.8 0 0 0 10.7 10.7z" />,
  auto: <><circle cx="12" cy="12" r="9" /><path d="M12 3v18" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" /></>,
};

function Icon({ n, size = 20 }) {
  return (
    <svg className="ic" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[n]}</svg>
  );
}

function Wordmark({ tag: Tag = 'span', className = '', onDark = false }) {
  return (
    <Tag className={'wordmark' + (onDark ? ' on-dark' : '') + (className ? ' ' + className : '')}>
      <span className="wm-a">ASSOULI</span>
      <span className="wm-x">AUTOX</span>
    </Tag>
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
        <Wordmark className="splash-name" onDark />
        <span className="splash-tag">Offres • Marchés • Concours • Exams</span>
      </div>
      <div className="splash-bar"><span /></div>
    </div>
  );
}

function hueOf(s) { return ((String(s || '?').charCodeAt(0) || 63) * 47) % 360; }

function daysUntil(deadline) {
  if (!deadline) return null;
  // Les dates du flux sont des jours civils : le jour de clôture = 0
  // (dernier jour), le lendemain = 1, la veille = -1.
  const day = String(deadline).slice(0, 10);
  const d = new Date(day + 'T00:00:00');
  if (isNaN(d)) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((d - today) / 86400000);
}

function deadlineInfo(j) {
  const d = daysUntil(j.deadline);
  if (!j.deadline) return { label: 'Date non communiquée', cls: 'b-muted' };
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

// Partage natif (Android) avec repli sur le presse-papiers.
async function shareItem({ title, text, url }) {
  try {
    const { Share } = await import('@capacitor/share');
    await Share.share({ title, text, url, dialogTitle: 'Partager avec' });
    return true;
  } catch {}
  try {
    if (navigator.share) { await navigator.share({ title, text, url }); return true; }
  } catch {}
  try {
    await navigator.clipboard.writeText([text, url].filter(Boolean).join('\n'));
    return 'copied';
  } catch { return false; }
}

function shortText(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

function daysBetween(a, b) {
  if (!a || !b) return null;
  const t1 = Date.parse(String(a).length <= 10 ? a + 'T00:00:00' : a);
  const t2 = Date.parse(String(b).length <= 10 ? b + 'T23:59:59' : b);
  if (isNaN(t1) || isNaN(t2)) return null;
  return Math.max(1, Math.round((t2 - t1) / 86400000));
}

function timelinePct(published, deadline) {
  const total = daysBetween(published, deadline);
  if (!total) return 0;
  const left = daysUntil(String(deadline || '').slice(0, 10));
  if (left === null) return 0;
  return Math.max(4, Math.min(100, Math.round(((total - Math.max(0, left)) / total) * 100)));
}

// ============================================================
//  CARTES & FICHES LOCALES — mêmes données, lecture plus claire
// ============================================================
const TYPE_LABEL = {
  job: 'Offre d’emploi',
  stage: 'Stage & pré-embauche',
  concours: 'Concours État',
  marche: 'Marché public',
  exam: 'Examen',
  alert: 'Alerte',
};

function OfferCard({ job, type = 'job', onOpen }) {
  if (!job) return null;
  const dl = deadlineInfo(job);
  const initial = (job.company || job.sourceLabel || '?').trim().charAt(0).toUpperCase();
  const isStage = type === 'stage';
  const isConcours = type === 'concours';
  const tone = isStage ? 'stage' : isConcours ? 'concours' : 'emploi';
  const badge = isStage ? 'Stage' : isConcours ? 'Concours' : 'Emploi';
  const posts = Math.max(1, Number(job.postsCount) || 1);
  const fresh = job.publishedDate && (Date.now() - Date.parse(job.publishedDate)) < 7 * 86400000;
  const open = () => onOpen(type, job.id);

  return (
    <article
      className={`offer-card tone-${tone}`}
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}
      aria-label={`${badge} : ${job.title}`}
    >
      <div className="offer-top">
        <div className="offer-avatar" style={{ '--h': hueOf(initial) }}>{initial}</div>
        <div className="offer-head">
          <div className="offer-kicker">
            <span className={`offer-badge ${tone}`}>{isStage && <Icon n="cap" size={11} />}{isConcours && <Icon n="landmark" size={11} />}{badge}</span>
            <span className="offer-source">{job.sourceLabel || job.source}</span>
            {fresh && <span className="offer-fresh">Nouveau</span>}
          </div>
          <h3>{job.title || 'Sans intitulé'}</h3>
          <p className="offer-company"><Icon n="building" size={13} />{job.company || 'Organisme non précisé'}</p>
        </div>
        <span className="offer-arrow" aria-hidden="true"><Icon n="arrow" size={15} /></span>
      </div>

      <div className="offer-meta">
        <span className="offer-meta-item"><Icon n="pin" size={13} />{job.city || 'Maroc'}</span>
        {job.contract && <span className="offer-meta-item"><Icon n="file" size={13} />{job.contract}</span>}
        <span className="offer-meta-item"><Icon n="briefcase" size={13} />{posts} poste{posts > 1 ? 's' : ''}</span>
      </div>

      {(job.specialty || job.diploma || job.experience) && (
        <div className="offer-tags">
          {job.specialty && <span className="chip blue"><Icon n="target" size={11} />{shortText(job.specialty, 32)}</span>}
          {job.diploma && <span className="chip muted"><Icon n="cap" size={11} />{shortText(job.diploma, 28)}</span>}
          {!job.specialty && job.experience && <span className="chip muted"><Icon n="briefcase" size={11} />{shortText(job.experience, 28)}</span>}
        </div>
      )}

      <div className="offer-foot">
        <span className={'chip ' + dl.cls}>{dl.label}</span>
        <span className="offer-open">Voir la fiche <Icon n="arrow" size={13} /></span>
      </div>
    </article>
  );
}

function DSection({ icon, title, hint, children, className = '' }) {
  return (
    <section className={'d-section ' + className}>
      <div className="d-section-head">
        <span className="d-section-icon"><Icon n={icon} size={16} /></span>
        <h2>{title}</h2>
        {hint && <span className="d-section-hint">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function DTimeline({ from, to, labelFrom = 'Publication', labelTo = 'Clôture' }) {
  const left = to ? daysUntil(String(to).slice(0, 10)) : null;
  const pct = timelinePct(from, to);
  const late = left !== null && left < 0;
  const note = left === null
    ? 'Date limite non communiquée par la source : vérifiez l’avis officiel.'
    : left < 0
      ? `Date limite dépassée depuis ${Math.abs(left)} jour${Math.abs(left) > 1 ? 's' : ''}.`
      : left === 0
        ? 'Dernier jour pour candidater : vérifiez l’heure limite officielle.'
        : `Il reste ${left} jour${left > 1 ? 's' : ''} avant la clôture.`;
  return (
    <div className={'d-timeline' + (late ? ' late' : '')}>
      <div className="d-timeline-track"><i style={{ width: (late ? 100 : pct) + '%' }} /></div>
      <div className="d-timeline-ends">
        <span><b>{from ? fmtDay(from) : '—'}</b><small>{labelFrom}</small></span>
        <span className="right"><b>{to ? fmtDay(to) : 'Non communiquée'}</b><small>{labelTo}</small></span>
      </div>
      <p className="d-timeline-note"><Icon n={late ? 'info' : 'clock'} size={14} />{note}</p>
    </div>
  );
}

function DRelated({ items, type, onOpen }) {
  if (!items || !items.length) return null;
  return (
    <div className="d-related">
      {items.map((j) => {
        const dl = deadlineInfo(j);
        return (
          <button type="button" className="d-related-item" key={j.id} onClick={() => onOpen(type, j.id)}>
            <span className="d-related-title">{j.title}</span>
            <span className="d-related-sub">{j.company || j.sourceLabel} · {j.city || 'Maroc'}</span>
            <span className={'d-related-dl ' + dl.cls}>{dl.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function DetailPage({
  type,
  job,
  marche,
  exam,
  alert,
  marcheDeadline,
  isNew,
  related,
  practiced,
  dlMsg,
  onClose,
  onShare,
  onOpenDetail,
  onGoTab,
  onTogglePracticed,
  examUrl,
  onDownloadExam,
  onDownloadFile,
}) {
  const scrollRef = useRef(null);
  const itemId = (job && job.id) || (marche && marche.id) || (exam && exam.id) || (alert && alert.id) || '';
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [type, itemId]);

  const tone = type === 'job' ? 'emploi' : type;
  const label = TYPE_LABEL[type] || 'Détail';

  // ---- Données de partage, adaptées au type de fiche ----
  function share() {
    if (type === 'marche' && marche) {
      return onShare({
        title: `${marche.ref ? 'Marché ' + marche.ref + ' — ' : ''}${marche.organisme || 'Marché public'}`,
        text: shortText(marche.objet, 180),
        url: marche.portalHref || marche.dceUrl || marche.detailUrl || '',
      });
    }
    if (type === 'exam' && exam) {
      return onShare({ title: exam.title, text: `${exam.company || ''} · ${exam.files.length} fichiers sujet / corrigé`, url: exam.url || '' });
    }
    if (type === 'alert' && alert) {
      return onShare({ title: alert.title, text: shortText(alert.body, 220), url: '' });
    }
    if (job) {
      return onShare({ title: job.title, text: `${job.company || ''}${job.city ? ' · ' + job.city : ''}${job.deadline ? ' · avant le ' + job.deadline : ''}`, url: job.url || '' });
    }
    return null;
  }

  let body = null;
  let actions = null;
  let hero = null;

  // ================= EMPLOI / STAGE / CONCOURS =================
  if (job && (type === 'job' || type === 'stage' || type === 'concours')) {
    const dl = deadlineInfo(job);
    const initial = (job.company || '?').trim().charAt(0).toUpperCase();
    const posts = Math.max(1, Number(job.postsCount) || 1);
    const isStage = type === 'stage';
    const isConcours = type === 'concours';
    const inferred = job._inferred || {};
    const inferredTag = (key) => (inferred[key] ? <em className="d-fact-tag">déduit</em> : null);
    const tips = isConcours
      ? [
        'Téléchargez l’avis officiel et vérifiez les pièces demandées.',
        'Préparez diplômes, CIN et attestations avant l’ouverture du dépôt.',
        'Entraînez-vous avec les sujets et corrigés dans l’onglet Exams.',
      ]
      : isStage
        ? [
          'Mettez en avant vos projets, stages et compétences pratiques.',
          'Précisez la durée et la période souhaitées dans votre message.',
          'Adaptez votre CV aux mots-clés de l’offre avant d’envoyer.',
        ]
        : [
          'Relisez l’offre et repérez les compétences indispensables.',
          'Adaptez votre CV et votre lettre à l’intitulé exact du poste.',
          'Candidatez avant la date limite : le site officiel fait foi.',
        ];

    hero = (
      <div className={`d-hero tone-${isStage ? 'stage' : isConcours ? 'concours' : 'emploi'}`}>
        <div className="d-hero-top">
          <div className="d-hero-avatar" style={{ '--h': hueOf(initial) }}>{initial}</div>
          <div className="d-hero-copy">
            <span className="d-eyebrow">{isStage ? 'Stage & pré-embauche' : isConcours ? 'Concours État' : 'Offre d’emploi'}</span>
            <h1>{job.title}</h1>
            <p className="d-sub"><Icon n="building" size={14} />{job.company || 'Organisme non précisé'}{job.city ? ` · ${job.city}` : ''}</p>
          </div>
        </div>
        <div className="d-chips">
          <span className={'chip ' + dl.cls}>{dl.label}</span>
          {job.contract && <span className="chip">{job.contract}</span>}
          <span className="chip blue">{job.sourceLabel || job.source}</span>
          {job.category === 'stages' && <span className="chip b-stage"><Icon n="cap" size={11} />Stage</span>}
        </div>
        <div className="d-kpis">
          <div><b>{job.publishedDate ? fmtDay(job.publishedDate) : '—'}</b><span>Publié</span></div>
          <div><b className={job.deadline ? undefined : 'd-kpi-soft'}>{job.deadline ? fmtDay(job.deadline) : 'Non publiée'}</b><span>Date limite</span></div>
          <div><b>{posts}</b><span>Poste{posts > 1 ? 's' : ''}</span></div>
        </div>
      </div>
    );

    actions = (
      <div className="d-actions-inner">
        {job.url && <button className="d-btn-primary" onClick={() => openLink(job.url)}><Icon n="arrow" size={17} />{isConcours ? 'Avis officiel / dossier' : 'Postuler sur le site'}</button>}
        <button className="d-btn-ghost" onClick={share} aria-label="Partager"><Icon n="share" size={17} /></button>
      </div>
    );

    body = (
      <div className="d-body">
        {job.description && (
          <DSection icon="file" title={isConcours ? 'Avis & mission' : 'Le poste en bref'}>
            <p className="d-prose">{job.description}</p>
          </DSection>
        )}

        {(job.requirements || []).length > 0 && (
          <DSection
            icon="check"
            title={isConcours ? 'Conditions d’accès' : 'Profil recherché'}
            hint={job._reqGenerated ? 'déduit de l’offre' : `${job.requirements.length} points`}
          >
            <ul className="d-bullets">
              {job.requirements.map((r, i) => <li key={i}><span className="d-bullet-check"><Icon n="check" size={12} /></span>{r}</li>)}
            </ul>
          </DSection>
        )}

        <DSection icon="chart" title="Informations clés">
          <div className="d-facts">
            <div className="d-fact"><span>Contrat</span><b>{job.contract || 'Non communiqué'}{inferredTag('contract')}</b></div>
            <div className="d-fact"><span>Diplôme</span><b>{job.diploma || 'Non communiqué'}{inferredTag('diploma')}</b></div>
            <div className="d-fact"><span>Expérience</span><b>{job.experience || 'Non communiquée'}{inferredTag('experience')}</b></div>
            <div className="d-fact"><span>Spécialité</span><b>{job.specialty || 'Non communiquée'}{inferredTag('specialty')}</b></div>
            <div className="d-fact"><span>Fonction</span><b>{job.fonction || 'Non communiquée'}{inferredTag('fonction')}</b></div>
            <div className="d-fact"><span>Secteur</span><b>{job.sector || 'Non communiqué'}{inferredTag('sector')}</b></div>
            <div className="d-fact"><span>Ville</span><b>{job.city || 'Maroc'}</b></div>
            <div className="d-fact"><span>Source</span><b>{job.sourceLabel || job.source || '—'}</b></div>
            <div className="d-fact"><span>Publié le</span><b>{job.publishedDate ? fmtDay(job.publishedDate) : 'Non communiqué'}</b></div>
            <div className="d-fact"><span>Date limite</span><b>{job.deadline ? fmtDay(job.deadline) : 'Non communiquée'}</b></div>
            <div className="d-fact"><span>Poste{posts > 1 ? 's' : ''}</span><b>{posts}</b></div>
            {isConcours && job.concoursDate && <div className="d-fact"><span>Épreuve</span><b>{fmtDay(job.concoursDate)}</b></div>}
          </div>
          {job._inferredCount > 0 && (
            <p className="d-facts-note">
              <Icon n="info" size={13} />
              Les mentions « déduit » signalent une information complétée à partir de l’intitulé, de la description ou des exigences de l’offre, absente des données publiées par la source.
            </p>
          )}
        </DSection>

        <DSection icon="clock" title="Calendrier" hint={isConcours ? 'Ouverture → clôture' : 'Publication → clôture'}>
          <DTimeline from={job.publishedDate} to={job.deadline} labelFrom={isConcours ? 'Ouverture' : 'Publication'} />
        </DSection>

        <DSection icon="spark" title="Conseils ASSOULI">
          <ul className="d-tips">
            {tips.map((t, i) => <li key={i}><span>{i + 1}</span>{t}</li>)}
          </ul>
          {isConcours && (
            <button className="d-inline-link" onClick={() => onGoTab('exams')}><Icon n="file" size={15} />Voir les sujets & corrigés<Icon n="arrow" size={14} /></button>
          )}
        </DSection>

        <DSection icon={isStage ? 'cap' : isConcours ? 'landmark' : 'briefcase'} title="Offres similaires" hint={related && related.length ? `${related.length} suggestion${related.length > 1 ? 's' : ''}` : ''}>
          {related && related.length
            ? <DRelated items={related} type={type} onOpen={onOpenDetail} />
            : <p className="d-muted">Aucune autre offre comparable pour le moment.</p>}
        </DSection>

        <p className="d-source">Référence : <b>{job.id}</b> · données publiques de {job.sourceLabel || job.source}. Vérifiez toujours l’offre sur le site officiel avant d’envoyer votre candidature.</p>
      </div>
    );
  }

  // ================= MARCHÉ PUBLIC =================
  if (type === 'marche' && marche) {
    const dl = marcheDeadline || { label: 'Sans date', cls: 'b-muted' };
    const cat = catSlug(marche.categorie);
    const hue = MCAT_HUE[cat] ?? 200;
    const official = marche.portalHref || marche.dceUrl || '';
    const kws = (Array.isArray(marche.keywords) ? marche.keywords : []).map(kwLabel).filter(Boolean).slice(0, 10);
    const contact = marche.contact || {};

    hero = (
      <div className="d-hero tone-marche">
        <div className="d-hero-top">
          <div className="d-hero-avatar" style={{ '--h': hue }}><Icon n="gavel" size={22} /></div>
          <div className="d-hero-copy">
            <span className="d-eyebrow">{marche.ref ? `Réf. ${marche.ref}` : 'Consultation publique'}{isNew ? ' · Nouveau' : ''}</span>
            <h1>{marche.organisme || 'Organisme public'}</h1>
            <p className="d-sub">{shortText(marche.objet, 170)}</p>
          </div>
        </div>
        <div className="d-chips">
          <span className={'chip ' + dl.cls}>{dl.label}</span>
          {marche.categorie && <span className="chip ref-chip">{marche.categorie}</span>}
          {marche.ville && <span className="chip blue"><Icon n="pin" size={11} />{marche.ville}</span>}
        </div>
        <div className="d-kpis">
          <div><b>{marche.dateLimite || '—'}</b><span>Clôture</span></div>
          <div><b>{marche.modePassation || marche.categorie || '—'}</b><span>Mode</span></div>
          <div><b>{marche.estimation || marche.caution || '—'}</b><span>{marche.estimation ? 'Estimation' : marche.caution ? 'Caution' : 'Montant'}</span></div>
        </div>
      </div>
    );

    actions = (
      <div className="d-actions-inner">
        {official && <button className="d-btn-primary" onClick={() => openLink(official)}><Icon n="arrow" size={17} />Portail officiel</button>}
        <button className="d-btn-ghost" onClick={share} aria-label="Partager"><Icon n="share" size={17} /></button>
      </div>
    );

    body = (
      <div className="d-body">
        <DSection icon="file" title="Objet de la consultation">
          <p className="d-prose">{marche.objet || '—'}</p>
          {kws.length > 0 && <div className="chips" style={{ marginTop: 10 }}>{kws.map((k) => <span className="chip m-kw" key={k}>{k}</span>)}</div>}
        </DSection>

        <DSection icon="chart" title="Chiffres clés">
          <div className="d-facts">
            <div className="d-fact"><span>Estimation</span><b>{marche.estimation || 'Non communiquée'}</b></div>
            <div className="d-fact"><span>Caution provisoire</span><b>{marche.caution || 'Non communiquée'}</b></div>
            <div className="d-fact"><span>Qualification & capacité</span><b>{marche.qc || 'Non précisée'}</b></div>
            <div className="d-fact"><span>Prix du DCE</span><b>{marche.prixAcquisition && marche.prixAcquisition !== '0,00 MAD' ? marche.prixAcquisition : 'Gratuit / non précisé'}</b></div>
          </div>
        </DSection>

        <DSection icon="clock" title="Calendrier">
          <DTimeline
            from={(marche.firstSeenAt || '').slice(0, 10)}
            to={(marche.dateLimiteIso || '').slice(0, 10)}
            labelFrom="Repéré le"
            labelTo="Clôture"
          />
        </DSection>

        <DSection icon="download" title="Dossier officiel" hint={marche.dceSize || ''}>
          <p className="d-prose d-prose-sm">Le règlement de consultation, le CPS et le dépôt électronique sont disponibles sur le portail officiel des marchés publics.</p>
          {(marche.docs || []).length > 0 && (
            <div className="d-docs">
              {(marche.docs || []).map((d, i) => (
                <div className="d-doc" key={(d.file || 'doc') + i}>
                  <span className="d-doc-ic"><Icon n="file" size={16} /></span>
                  <span className="d-doc-name">{d.name || 'Avis PDF'}</span>
                  {d.size ? <span className="d-doc-size">{(d.size / 1024 / 1024).toFixed(1)} Mo</span> : null}
                  <button className="d-btn-mini" onClick={() => onDownloadFile(marcheDocUrl(d), `${marche.ref || 'marche'}-${d.name || 'avis'}.pdf`.replace(/[^\wÀ-ÿ.-]+/g, '-').slice(0, 60))} aria-label="Télécharger"><Icon n="download" size={14} /></button>
                </div>
              ))}
            </div>
          )}
          <div className="d-inline-actions">
            {official && <button className="d-inline-link" onClick={() => openLink(official)}><Icon n="arrow" size={15} />Ouvrir le portail officiel</button>}
            {marche.detailUrl && marche.detailUrl !== official && <button className="d-inline-link" onClick={() => openLink(marche.detailUrl)}><Icon n="eye" size={15} />Fiche détaillée</button>}
          </div>
        </DSection>

        <DSection icon="info" title="Informations clés">
          <div className="d-rows">
            {marche.dateLimite && <div className="d-row"><span>Clôture</span><b>{marche.dateLimite}</b></div>}
            {marche.modePassation && <div className="d-row"><span>Mode de passation</span><b>{marche.modePassation}</b></div>}
            {marche.typeProcedure && <div className="d-row"><span>Type d’offre</span><b>{marche.typeProcedure}</b></div>}
            {marche.lieuOuverture && <div className="d-row"><span>Ouverture des plis</span><b>{marche.lieuOuverture}</b></div>}
            {marche.adresseRetrait && <div className="d-row"><span>Retrait du dossier</span><b>{marche.adresseRetrait}</b></div>}
            {marche.adresseDepot && <div className="d-row"><span>Dépôt des plis</span><b>{marche.adresseDepot}</b></div>}
            {marche.ref && <div className="d-row"><span>Référence</span><b>{marche.ref}</b></div>}
          </div>
        </DSection>

        {(contact.nom || contact.email || contact.tel || contact.fax) && (
          <DSection icon="mail" title="Contact">
            <div className="d-rows">
              {contact.nom && <div className="d-row"><span>Nom</span><b>{contact.nom}</b></div>}
              {contact.email && <div className="d-row"><span>E-mail</span><b><a href={`mailto:${contact.email}`}>{contact.email}</a></b></div>}
              {contact.tel && <div className="d-row"><span>Téléphone</span><b><a href={`tel:${contact.tel}`}>{contact.tel}</a></b></div>}
              {contact.fax && <div className="d-row"><span>Fax</span><b>{contact.fax}</b></div>}
            </div>
            <div className="d-inline-actions">
              {contact.email && <button className="d-inline-link" onClick={() => openLink(`mailto:${contact.email}`)}><Icon n="mail" size={15} />Envoyer un e-mail</button>}
              {contact.tel && <button className="d-inline-link" onClick={() => openLink(`tel:${contact.tel}`)}><Icon n="phone" size={15} />Appeler</button>}
            </div>
          </DSection>
        )}

        <p className="d-source">Source : <b>Portail marocain des marchés publics (PMMP)</b> — consultation relayée par {marche.source || 'appeldoffres.ma'}.{marche.firstSeenAt ? ` Repérée le ${fmtDay(marche.firstSeenAt)}.` : ''} Données publiques : vérifiez toujours le dossier officiel avant de soumissionner.</p>
      </div>
    );
  }

  // ================= EXAMENS =================
  if (type === 'exam' && exam) {
    const years = [...new Set(exam.files.map((f) => f.year))].sort((a, b) => b - a);
    const doneCount = years.filter((y) => practiced[`${exam.id}-${y}`]).length;
    const pct = years.length ? Math.round((doneCount / years.length) * 100) : 0;
    const sujets = exam.files.filter((f) => f.kind !== 'corrige').length;
    const corriges = exam.files.filter((f) => f.kind === 'corrige').length;

    hero = (
      <div className="d-hero tone-exam">
        <div className="d-hero-top">
          <div className="d-hero-avatar"><Icon n="file" size={22} /></div>
          <div className="d-hero-copy">
            <span className="d-eyebrow">Sujets & corrigés</span>
            <h1>{exam.title}</h1>
            <p className="d-sub"><Icon n="building" size={14} />{exam.company}{exam.specialty ? ` · ${exam.specialty}` : ''}</p>
          </div>
        </div>
        <div className="d-chips">
          {exam.familyLabel && <span className="chip blue">{exam.familyLabel}</span>}
          <span className="chip">{years.length} années</span>
          <span className="chip b-green">{doneCount}/{years.length} pratiqués</span>
        </div>
        <div className="d-kpis">
          <div><b>{sujets}</b><span>Sujets</span></div>
          <div><b>{corriges}</b><span>Corrigés</span></div>
          <div><b>{pct}%</b><span>Progression</span></div>
        </div>
      </div>
    );

    body = (
      <div className="d-body">
        <DSection icon="chart" title="Ma progression" hint={`${doneCount} / ${years.length} années`}>
          <div className="d-progress"><div className="d-progress-track"><i style={{ width: pct + '%' }} /></div><b>{pct}%</b></div>
          <p className="d-muted">Marquez une année comme pratiquée après avoir travaillé le sujet et corrigé vos réponses.</p>
        </DSection>

        {dlMsg && <p className="d-alert-line"><Icon n="download" size={14} />{dlMsg}</p>}

        <DSection icon="calendar" title="Sujets par année" hint="Sujet + corrigé">
          {years.map((y) => {
            const sujet = exam.files.find((f) => f.year === y && f.kind !== 'corrige');
            const corrige = exam.files.find((f) => f.year === y && f.kind === 'corrige');
            const done = !!practiced[`${exam.id}-${y}`];
            const q = encodeURIComponent(`concours ${exam.company} ${exam.specialty || exam.fonction || ''} épreuve PDF ${y} Maroc`.replace(/\s+/g, ' ').trim());
            return (
              <div className={'d-year' + (done ? ' done' : '')} key={y}>
                <div className="d-year-head">
                  <b className="d-year-num">{y}</b>
                  {done ? <span className="chip b-green"><Icon n="check" size={11} />Pratiqué</span> : <span className="chip muted">À faire</span>}
                  <button className="d-mark" onClick={() => onTogglePracticed(exam.id, y)}>{done ? 'À refaire' : 'Marquer pratiqué'}</button>
                </div>
                {(sujet || corrige) ? (
                  <>
                    {sujet && (
                      <div className="d-file">
                        <span className="ex-tag">Sujet</span>
                        <span className="d-file-meta">{sujet.detail || (sujet.size ? Math.round(sujet.size / 1024) + ' Ko' : 'PDF')}</span>
                        <div className="d-file-btns">
                          <button className="d-btn-mini" onClick={() => openLink(examUrl(sujet))} aria-label="Voir le sujet"><Icon n="eye" size={14} /></button>
                          <button className="d-btn-mini primary" onClick={() => onDownloadExam(sujet, `${exam.company}-${y}-sujet`)} aria-label="Télécharger le sujet"><Icon n="download" size={14} /></button>
                        </div>
                      </div>
                    )}
                    {corrige && (
                      <div className="d-file corrige">
                        <span className="ex-tag blue">Corrigé</span>
                        <span className="d-file-meta">{corrige.detail || (corrige.size ? Math.round(corrige.size / 1024) + ' Ko' : 'PDF')}</span>
                        <div className="d-file-btns">
                          <button className="d-btn-mini" onClick={() => openLink(examUrl(corrige))} aria-label="Voir le corrigé"><Icon n="eye" size={14} /></button>
                          <button className="d-btn-mini primary" onClick={() => onDownloadExam(corrige, `${exam.company}-${y}-corrige`)} aria-label="Télécharger le corrigé"><Icon n="download" size={14} /></button>
                        </div>
                      </div>
                    )}
                  </>
                ) : <p className="d-muted">Aucun fichier pour cette année.</p>}
                <button className="d-inline-link" onClick={() => openLink(`https://www.google.com/search?q=${q}+filetype:pdf`)}><Icon n="search" size={14} />Chercher le sujet officiel</button>
              </div>
            );
          })}
        </DSection>

        <p className="d-source">Téléchargement direct · les PDF s’ouvrent aussi dans le lecteur du téléphone. Ces sujets sont des supports d’entraînement : vérifiez les épreuves officielles auprès de l’organisme.</p>
      </div>
    );
  }

  // ================= ALERTE =================
  if (type === 'alert' && alert) {
    const counts = alert.counts || {};
    hero = (
      <div className="d-hero tone-alert">
        <div className="d-hero-top">
          <div className="d-hero-avatar"><Icon n="bell" size={22} /></div>
          <div className="d-hero-copy">
            <span className="d-eyebrow">Alerte nouveautés</span>
            <h1>{alert.title}</h1>
            <p className="d-sub"><Icon n="clock" size={14} />{fmtWhen(alert.at)}</p>
          </div>
        </div>
        <div className="d-kpis">
          <div><b>{counts.new || 0}</b><span>Nouvelles</span></div>
          <div><b>{counts.total || '—'}</b><span>Total suivi</span></div>
          <div><b>{fmtDay(alert.at)}</b><span>Date</span></div>
        </div>
      </div>
    );

    actions = (
      <div className="d-actions-inner">
        <button className="d-btn-primary" onClick={() => onGoTab('jobs')}><Icon n="briefcase" size={17} />Voir les offres</button>
        <button className="d-btn-ghost" onClick={share} aria-label="Partager"><Icon n="share" size={17} /></button>
      </div>
    );

    body = (
      <div className="d-body">
        <DSection icon="bell" title="Détail de l’alerte">
          <p className="d-alert-body">{alert.body}</p>
        </DSection>
        <DSection icon="spark" title="Que faire maintenant ?">
          <ul className="d-tips">
            <li><span>1</span>Ouvrez l’onglet Offres pour voir les nouvelles publications.</li>
            <li><span>2</span>Filtrez par ville ou spécialité pour gagner du temps.</li>
            <li><span>3</span>Activez les alertes en arrière-plan dans Configuration.</li>
          </ul>
        </DSection>
        <p className="d-source">Alerte générée automatiquement à partir des données publiques. Les nouveautés sont comparées à l’actualisation précédente.</p>
      </div>
    );
  }

  if (!hero) {
    return (
      <div className="detail" role="dialog" aria-modal="true" aria-label="Fiche indisponible">
        <header className="detail-bar">
          <button className="detail-back" onClick={onClose} aria-label="Retour"><Icon n="back" size={20} /></button>
          <span className="detail-bar-title">Fiche indisponible</span>
          <span style={{ width: 38, flex: 'none' }} />
        </header>
        <div className="detail-scroll">
          <div className="d-body">
            <DSection icon="info" title="Cette fiche n’est plus disponible">
              <p className="d-prose">Les données ont été actualisées et cette fiche n’en fait plus partie. Revenez à la liste pour consulter les offres à jour.</p>
              <button className="d-inline-link" onClick={onClose}><Icon n="back" size={15} />Revenir à la liste</button>
            </DSection>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`detail tone-${tone}`} role="dialog" aria-modal="true" aria-label={label}>
      <header className="detail-bar">
        <button className="detail-back" onClick={onClose} aria-label="Retour"><Icon n="back" size={20} /></button>
        <span className="detail-bar-title">{label}</span>
        <button className="detail-share" onClick={share} aria-label="Partager"><Icon n="share" size={18} /></button>
      </header>
      <div className="detail-scroll" ref={scrollRef}>
        {hero}
        {body}
        {actions && <div className="d-actions">{actions}</div>}
      </div>
    </div>
  );
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

function AuthScreen({ onAuthed, themePref, onThemeChange }) {
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
        <Wordmark tag="h1" className="auth-title" />
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
        <div className="auth-theme" aria-label="Thème de l’application">
          <span>Thème</span>
          <div className="theme-seg compact">
            <button className={themePref === 'light' ? 'active' : ''} onClick={() => onThemeChange('light')}><Icon n="sun" size={13} /> Clair</button>
            <button className={themePref === 'dark' ? 'active' : ''} onClick={() => onThemeChange('dark')}><Icon n="moon" size={13} /> Sombre</button>
            <button className={themePref === 'auto' ? 'active' : ''} onClick={() => onThemeChange('auto')}><Icon n="auto" size={13} /> Auto</button>
          </div>
        </div>
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

function MainApp({ session, onLogout, themePref, onThemeChange }) {
  const boot = bootCache();
  const [rawJobs, setRawJobs] = useState(boot.jobs || []);
  // Complète les champs « Informations clés » absents des flux sources.
  const jobs = useMemo(() => enrichJobs(rawJobs), [rawJobs]);
  const [updatedAt, setUpdatedAt] = useState(boot.jobsUpdated || '');
  const [loading, setLoading] = useState(!(boot.jobs || []).length);
  const [offline, setOffline] = useState(() => { try { return !navigator.onLine; } catch { return false; } });
  const [updateInfo, setUpdateInfo] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [updatePct, setUpdatePct] = useState(0);
  const [appVer, setAppVer] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('dash');
  // Fiche locale ouverte (emploi, stage, concours, marché, exam, alerte).
  const [detail, setDetail] = useState(null);
  const [query, setQuery] = useState('');
  const [city, setCity] = useState('');
  const [source, setSource] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [urgentOnly, setUrgentOnly] = useState(false);
  // Rendu progressif : on n'ajoute pas 1 900 cartes au DOM d'un coup.
  const [jLimit, setJLimit] = useState(120);
  const [toast, setToast] = useState('');
  const [remote, setRemote] = useState(() => { try { return localStorage.getItem(LS_REMOTE) || DEFAULT_REMOTE; } catch { return DEFAULT_REMOTE; } });
  const [alerts, setAlerts] = useState(boot.alerts || []);
  const [alertsUpdated, setAlertsUpdated] = useState(boot.alertsUpdated || '');
  const [seen, setSeen] = useState(() => { try { return localStorage.getItem(LS_SEEN) || ''; } catch { return ''; } });
  const [menuOpen, setMenuOpen] = useState(false);
  const [dlMsg, setDlMsg] = useState('');
  // ---- Exams (same Sujet + Corrige data as the web app) ----
  const [examIndex, setExamIndex] = useState(boot.exams || null);
  const [examQ, setExamQ] = useState('');
  const [examFam, setExamFam] = useState('');
  const [examYearF, setExamYearF] = useState('');
  const [practiced, setPracticed] = useState(() => { try { return JSON.parse(localStorage.getItem('mjh_apk_practiced') || '{}'); } catch { return {}; } });
  // ---- Marchés Publics (flux direct PMMP + BDC) ----
  const [marches, setMarches] = useState(boot.marches || []);
  const [marchesUpdated, setMarchesUpdated] = useState(boot.marchesUpdated || '');
  const [mStatus, setMStatus] = useState('open');
  const [mCat, setMCat] = useState('');
  const [mVille, setMVille] = useState('');
  const [mType, setMType] = useState('');
  const [mRegion, setMRegion] = useState('');
  const [mKw, setMKw] = useState('');
  const [mQuick, setMQuick] = useState('');
  const [mLimit, setMLimit] = useState(120);
  // ---- Accès spécial Marchés publics (autorisation publiée par l'APK admin) ----
  const [access, setAccess] = useState(() => readAccess());
  const [accessBusy, setAccessBusy] = useState(false);
  const [accessAt, setAccessAt] = useState(() => {
    try {
      const n = Number(localStorage.getItem(LS_ACCESS_AT) || 0);
      return Number.isFinite(n) ? n : 0;
    } catch { return 0; }
  });
  const [accessErr, setAccessErr] = useState('');
  const accessBusyRef = useRef(false);
  const [mArchEmail, setMArchEmail] = useState(() => { try { return localStorage.getItem(LS_MARCHES_SESSION) || ''; } catch { return ''; } });
  const [mGateStep, setMGateStep] = useState('email'); // email | code
  const [mGateEmail, setMGateEmail] = useState(session.email || '');
  const [mGateCode, setMGateCode] = useState('');
  const [mGateInfo, setMGateInfo] = useState(null);
  const [mGateBusy, setMGateBusy] = useState(false);
  const [mGateErr, setMGateErr] = useState('');
  const [mGateMsg, setMGateMsg] = useState('');
  const closingRef = useRef(false);

  // ---- Fiches locales (pas de sortie vers le navigateur) ----
  function openDetail(type, id) {
    if (!id) return;
    setDetail({ type, id });
  }
  function closeDetail() { setDetail(null); }

  async function handleShare(payload) {
    const r = await shareItem(payload);
    if (r === 'copied') showToast('Lien copié dans le presse-papiers');
    else if (r) showToast('Partagé ✓');
    else showToast('Partage indisponible sur cet appareil');
  }

  const detailJob = detail && (detail.type === 'job' || detail.type === 'stage' || detail.type === 'concours')
    ? jobs.find((j) => j.id === detail.id)
    : null;
  const detailMarche = detail && detail.type === 'marche'
    ? marches.find((m) => m.id === detail.id)
    : null;
  const detailExam = detail && detail.type === 'exam'
    ? (((examIndex && examIndex.AUTOX) || []).find((o) => o.id === detail.id) || null)
    : null;
  const detailAlert = detail && detail.type === 'alert'
    ? alerts.find((a) => a.id === detail.id)
    : null;

  // Fiches liées : même ville ou même spécialité, dans la même famille.
  const detailRelated = useMemo(() => {
    if (!detailJob) return [];
    const sameFamily = (j) => {
      if (detail.type === 'concours') return j.kind === 'concours';
      if (detail.type === 'stage') return isStageJob(j);
      return j.kind !== 'concours' && !isStageJob(j);
    };
    return jobs
      .filter((j) => j.id !== detailJob.id && sameFamily(j)
        && ((detailJob.city && j.city === detailJob.city) || (detailJob.specialty && j.specialty === detailJob.specialty)))
      .slice(0, 4);
  }, [jobs, detailJob, detail]);

  // Empêche le contenu derrière la fiche de défiler.
  useEffect(() => {
    if (!detail) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [detail]);

  // Bouton Retour Android : ferme la fiche, sinon revient aux offres.
  const navRef = useRef({ detail: null, tab: 'jobs', menuOpen: false });
  navRef.current = { detail, tab, menuOpen };
  useEffect(() => {
    let handle = null;
    import('@capacitor/app').then(({ App }) => {
      App.addListener('backButton', () => {
        const s = navRef.current;
        if (s.menuOpen) { setMenuOpen(false); return; }
        if (s.detail) { setDetail(null); return; }
        if (s.tab !== 'jobs') { goTab('jobs'); return; }
        App.exitApp();
      }).then((h) => { handle = h; });
    }).catch(() => {});
    return () => { try { handle && handle.remove(); } catch {} };
  }, []);

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
      }
    } catch {}
  }
  const [spin, setSpin] = useState(0);
  const startY = useRef(0);

  // Current section visual: icon + label follow the page the user chose
  const section = tab === 'jobs' ? { icon: './app-icon.png', ico: 'briefcase', label: 'Emplois CDI · CDD' }
    : tab === 'stages' ? { icon: './app-icon.png', ico: 'cap', label: 'Stages & Pré-embauche' }
    : tab === 'concours' ? { icon: './app-icon.png', ico: 'landmark', label: 'Concours État' }
    : tab === 'marches' ? { icon: './app-icon.png', ico: 'scale', label: 'Marchés Publics' }
    : tab === 'exams' ? { icon: './app-icon.png', ico: 'file', label: 'Exams & Corrigés' }
    : tab === 'dash' ? { icon: './app-icon.png', ico: 'chart', label: 'Dashboard' }
    : tab === 'alerts' ? { icon: './app-icon.png', ico: 'bell', label: 'Alertes nouveautés' }
    : { icon: './app-icon.png', ico: 'sliders', label: 'Configuration' };

  function showToast(t) { setToast(t); setTimeout(() => setToast(''), 2600); }

  // Vérification immédiate de la liste publiée par l'admin. Utilisée à
  // l'ouverture de l'onglet Marchés, au retour dans l'app et par le bouton
  // « Vérifier maintenant ». Le cache HTTP est contourné (no-store + horodatage).
  async function checkAccessNow(opts = {}) {
    if (accessBusyRef.current) return access;
    accessBusyRef.current = true;
    setAccessBusy(true);
    setAccessErr('');
    try {
      const fresh = await refreshAccessList({ throwOnError: true });
      const wasAllowed = isMarchesAllowed(mArchEmail, access) || isMarchesAllowed(session.email, access);
      const nowAllowed = isMarchesAllowed(mArchEmail, fresh) || isMarchesAllowed(session.email, fresh);
      setAccess(fresh || {});
      const stamp = Date.now();
      setAccessAt(stamp);
      try { localStorage.setItem(LS_ACCESS_AT, String(stamp)); } catch {}
      if (nowAllowed && !wasAllowed) showToast('Accès Marchés publics débloqué');
      if (!nowAllowed && wasAllowed) showToast('Accès Marchés publics révoqué');
      if (accessDisabledList(fresh).includes(String(session.email || '').toLowerCase())) enforceAccess(fresh);
      return fresh;
    } catch {
      setAccessErr('Vérification impossible — vérifiez votre connexion.');
      if (opts.interactive) showToast('Vérification impossible (réseau)');
      return access;
    } finally {
      accessBusyRef.current = false;
      setAccessBusy(false);
    }
  }

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
            setRawJobs(list); setUpdatedAt(upd); setOffline(false);
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
        setRawJobs(cached); setUpdatedAt(cachedUpd); setOffline(fallbackOffline);
        if (!silent) showToast(fallbackOffline ? `Hors ligne • ${cached.length} offres enregistrées` : `Données locales • ${cached.length} offres`);
      } else {
        const b = await loadBundled();
        setRawJobs(b.list); setUpdatedAt(b.updatedAt); setOffline(fallbackOffline);
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

  useEffect(() => { setupNotifications(); refresh(false); checkUpdate(); checkAccessNow(); }, []);
  useEffect(() => {
    const goOnline = () => { setOffline(false); refresh(false, true); checkAccessNow(); };
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
    const tick = () => { refresh(false, true); checkUpdate(); checkAccessNow(); };
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
  // Retour au premier plan via le plugin natif Capacitor : l'autorisation
  // et une éventuelle révocation s'appliquent dès la réouverture de l'app.
  useEffect(() => {
    let remove = null;
    let cancelled = false;
    (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (!Capacitor.isNativePlatform()) return;
        const { App } = await import('@capacitor/app');
        const handle = await App.addListener('appStateChange', (state) => {
          if (state && state.isActive) {
            checkAccessNow();
            refresh(false, true);
          }
        });
        if (cancelled) handle.remove();
        else remove = () => handle.remove();
      } catch {}
    })();
    return () => { cancelled = true; if (remove) remove(); };
  }, []);
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
    if (tab === 'stages') return jobs.filter(isStageJob);
    if (tab === 'jobs') return jobs.filter((j) => j.kind !== 'concours' && !isStageJob(j));
    return jobs;
  }, [jobs, tab]);

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
    let l = [...baseJobs];
    if (urgentOnly) l = l.filter((j) => { const d = daysUntil(j.deadline); return d !== null && d >= 0 && d <= 7; });
    if (city) l = l.filter((j) => (j.city || '').toLowerCase().includes(city.toLowerCase()));
    if (source) l = l.filter((j) => j.source === source);
    if (specialty) l = l.filter((j) => (j.specialty || '') === specialty);
    if (query.trim()) {
      const s = query.trim().toLowerCase();
      l = l.filter((j) => [j.title, j.company, j.city, j.description, (j.requirements || []).join(' ')].join(' ').toLowerCase().includes(s));
    }
    if (tab === 'concours') l.sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999'));
    else l.sort((a, b) => (b.publishedDate || '').localeCompare(a.publishedDate || ''));
    return l;
  }, [baseJobs, tab, query, city, source, specialty, urgentOnly]);

  // Un nouveau filtre repart du premier lot.
  useEffect(() => { setJLimit(120); }, [tab, query, city, source, specialty, urgentOnly]);
  useEffect(() => { setMLimit(120); }, [tab, query, mStatus, mCat, mVille, mType, mRegion, mKw, mQuick]);

  // Indicateurs de la page courante (emplois / stages / concours).
  const pageStats = useMemo(() => {
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    let urgent = 0, posts = 0, fresh = 0;
    const companies = new Set();
    baseJobs.forEach((j) => {
      const d = daysUntil(j.deadline);
      if (d !== null && d >= 0 && d <= 7) urgent++;
      posts += Math.max(1, Number(j.postsCount) || 1);
      if (j.company) companies.add(j.company);
      if (j.publishedDate) {
        const pd = new Date(j.publishedDate);
        if (!isNaN(pd) && pd >= weekAgo) fresh++;
      }
    });
    return { total: baseJobs.length, urgent, posts, companies: companies.size, fresh };
  }, [baseJobs]);

  const contracts = useMemo(() => {
    const m = {};
    jobs.forEach((j) => { if (j.contract && j.contract !== '—') m[j.contract] = (m[j.contract] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [jobs]);

  const kinds = useMemo(() => {
    let emploi = 0, concours = 0, stages = 0;
    jobs.forEach((j) => {
      if (j.kind === 'concours') concours++;
      else if (isStageJob(j)) stages++;
      else emploi++;
    });
    return { emploi, concours, stages };
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
  const accessCheckedLabel = accessAt
    ? new Date(accessAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : '';

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
      const d = mDeadline(m).d;
      return d !== null && d >= 0 && d <= 7;
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
    const d = m.dateOnly
      ? daysUntil(String(m.dateLimiteIso).slice(0, 10))
      : Math.ceil((Date.parse(m.dateLimiteIso) - Date.now()) / 86400000);
    const raw = m.dateLimite || m.dateLimiteIso.slice(0, 16).replace('T', ' ');
    if (d === null) return { label: `Sans date`, cls: 'b-muted', d: null };
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

  function goTab(t) {
    setTab(t);
    setDetail(null);
    setMenuOpen(false);
    setJLimit(120);
    setMLimit(120);
    setQuery(''); setCity(''); setSource(''); setSpecialty(''); setUrgentOnly(false);
    setMCat(''); setMVille(''); setMStatus('open'); setMType(''); setMRegion(''); setMKw(''); setMQuick('');
    try { window.scrollTo({ top: 0 }); } catch {}
    // L'autorisation Marchés doit être relue tout de suite, sans attendre
    // le prochain cycle de vérification (20 s).
    if (t === 'marches') {
      setMGateErr(''); setMGateMsg('');
      checkAccessNow();
    }
  }

  return (
    <div className="phone" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {menuOpen && <div className="drawer-overlay" onClick={() => setMenuOpen(false)} />}
      <aside className={'drawer' + (menuOpen ? ' open' : '')}>
        <div className="drawer-brand"><img src="./app-icon.png" alt="ASSOULI AUTOX" className="drawer-logo" /><Wordmark className="drawer-wordmark" /></div>
        <div className="drawer-account"><Icon n="check" size={14} /><span>{session.email}</span></div>
        <div className="drawer-theme">
          <span>Thème</span>
          <div className="theme-seg compact">
            <button className={themePref === 'light' ? 'active' : ''} onClick={() => onThemeChange('light')} aria-label="Thème clair"><Icon n="sun" size={13} /> Clair</button>
            <button className={themePref === 'dark' ? 'active' : ''} onClick={() => onThemeChange('dark')} aria-label="Thème sombre"><Icon n="moon" size={13} /> Sombre</button>
            <button className={themePref === 'auto' ? 'active' : ''} onClick={() => onThemeChange('auto')} aria-label="Thème automatique"><Icon n="auto" size={13} /> Auto</button>
          </div>
        </div>
        <p className="muted">ASSOULI AUTOX • {stats.total} offres • {mArchAllowed ? `${mStats.total} marchés publics` : 'Marchés sur autorisation'} • {(updatedAt || '').slice(0, 10) || 'hors-ligne'}</p>
        <nav className="drawer-nav">
          <button className={tab === 'jobs' ? 'active' : ''} aria-current={tab === 'jobs' ? 'page' : undefined} onClick={() => goTab('jobs')}><span className="dn-l"><Icon n="briefcase" size={19} />Offres d’emploi</span>{kinds.emploi > 0 && <b className="count">{kinds.emploi}</b>}</button>
          <button className={tab === 'stages' ? 'active' : ''} aria-current={tab === 'stages' ? 'page' : undefined} onClick={() => goTab('stages')}><span className="dn-l"><Icon n="cap" size={19} />Stages & pré-embauche</span>{kinds.stages > 0 && <b className="count">{kinds.stages}</b>}</button>
          <button className={tab === 'concours' ? 'active' : ''} aria-current={tab === 'concours' ? 'page' : undefined} onClick={() => goTab('concours')}><span className="dn-l"><Icon n="landmark" size={19} />Concours État</span>{kinds.concours > 0 && <b className="count">{kinds.concours}</b>}</button>
          <button className={tab === 'marches' ? 'active' : ''} aria-current={tab === 'marches' ? 'page' : undefined} onClick={() => goTab('marches')}><span className="dn-l"><Icon n="scale" size={19} />Marchés Publics</span>{mArchAllowed && mStats.open > 0 && <b className="count">{compactNum(mStats.open)}</b>}{!mArchAllowed && <b className="count"><Icon n="lock" size={11} /></b>}</button>
          <button className={tab === 'exams' ? 'active' : ''} aria-current={tab === 'exams' ? 'page' : undefined} onClick={() => goTab('exams')}><span className="dn-l"><Icon n="file" size={19} />Exams & Corrigés</span></button>
          <button className={tab === 'alerts' ? 'active' : ''} aria-current={tab === 'alerts' ? 'page' : undefined} onClick={() => goTab('alerts')}><span className="dn-l"><Icon n="bell" size={19} />Alertes</span>{unread > 0 && <b className="count red">{unread}</b>}</button>
          <button className={tab === 'dash' ? 'active' : ''} onClick={() => goTab('dash')}><span className="dn-l"><Icon n="chart" size={19} />Dashboard</span></button>
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
            <Wordmark className="brand" onDark />
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
      {(tab === 'jobs' || tab === 'stages' || tab === 'concours') && (
      <section className="hero">
        <div className="hero-stats">
          <div className="hstat"><b>{pageStats.total}</b><span>{tab === 'stages' ? 'stages' : tab === 'concours' ? 'concours' : 'offres'}</span></div>
          <div className="hstat green"><b>{pageStats.fresh}</b><span>≤ 7 jours</span></div>
          <div className="hstat orange"><b>{pageStats.urgent}</b><span>urgentes</span></div>
          <div className="hstat stages"><b>{pageStats.posts}</b><span>postes</span></div>
          <div className="hstat violet"><b>{pageStats.companies}</b><span>entreprises</span></div>
        </div>
        <div className="updated">{refreshing ? 'Actualisation…' : loading ? 'Chargement…' : `Dernière actualisation : ${(updatedAt || '').slice(0, 16).replace('T', ' ') || 'à l’instant'} • ${filtered.length} affichées`}</div>
      </section>
      )}

      <div className="section-bar">
        <img src={section.icon} alt="" className="section-logo" />
        <span className="section-emoji"><Icon n={section.ico} size={22} /></span>
        <b>{section.label}</b>
        {(tab === 'jobs' || tab === 'stages' || tab === 'concours') && <span className="section-count">{filtered.length} affichée{filtered.length > 1 ? 's' : ''}</span>}
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
            {accessErr && <div className="auth-error">{accessErr}</div>}

            <div className="m-gate-check">
              <button className="ghost m-gate-check-btn" disabled={accessBusy} onClick={() => checkAccessNow({ interactive: true })}>
                <Icon n={accessBusy ? 'refresh' : 'shield'} size={15} />
                {accessBusy ? 'Vérification…' : 'Vérifier maintenant'}
              </button>
              <span>{accessAt ? `Dernière vérification à ${accessCheckedLabel}` : 'Liste d’accès pas encore vérifiée'}</span>
            </div>

            <button className="ghost m-gate-request" onClick={requestMarchesAccess}><Icon n="shield" size={16} /> Demander l’autorisation</button>
            <p className="m-gate-note">L’administration active ou retire l’accès à distance. L’accès est revérifié à l’ouverture de cet onglet et à chaque retour dans l’application.</p>
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

      {(tab === 'jobs' || tab === 'stages' || tab === 'concours' || (tab === 'marches' && mArchAllowed)) && (
      <div className="searchbar">
        <Icon n="search" size={18} /><input placeholder={tab === 'marches' ? 'Rechercher : référence, organisme, objet, ville…' : 'Rechercher : poste, entreprise, ville…'} value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      )}
      {(tab === 'jobs' || tab === 'stages' || tab === 'concours') && (
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
        {(query || city || source || specialty || urgentOnly) && (
          <button className="clear" onClick={() => { setQuery(''); setCity(''); setSource(''); setSpecialty(''); setUrgentOnly(false); }} aria-label="Réinitialiser les filtres"><Icon n="close" size={16} /></button>
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
          {mFiltered.slice(0, mLimit).map((m) => {
            const dl = mDeadline(m);
            const cat = catSlug(m.categorie);
            const isNew = mShowNewBadges && mNewIds.has(m.id);
            const hue = MCAT_HUE[cat] ?? 200;
            return (
              <article className={'card mcard cat-' + (cat || 'autre')} key={m.id} role="button" tabIndex={0} onClick={() => openDetail('marche', m.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail('marche', m.id); } }}>
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
                  <span className="mcard-arrow" aria-hidden="true"><Icon n="arrow" size={14} /></span>
                </div>
                <p className="desc m-objet">{m.objet || '—'}</p>
                <div className="chips">
                  <span className={'chip ' + dl.cls}>{dl.label}</span>
                  {m.modePassation && <span className="chip blue">{m.modePassation}</span>}
                  {m.qc && <span className="chip m-qc"><Icon n="check" size={12} />Q&C · {m.qc}</span>}
                  {m.estimation && <span className="chip muted m-money">{m.estimation}</span>}
                </div>
                <div className="m-foot">
                  <span className="m-open">Voir la fiche complète <Icon n="arrow" size={14} /></span>
                  <span className="m-src">{mSourceTag(m)}</span>
                </div>
              </article>
            );
          })}
          {mFiltered.length > mLimit && (
            <button className="more more-btn" onClick={() => setMLimit((n) => n + 120)}>
              Afficher plus de marchés <span>· {mFiltered.length - mLimit} restants</span>
            </button>
          )}
        </main>
      )}

      {(tab === 'jobs' || tab === 'stages') && (
        <main className="feed">
          {tab === 'stages' && (
            <div className="stage-lead">
              <span className="stage-lead-ic"><Icon n="cap" size={20} /></span>
              <div>
                <b>Stages, PFE & pré-embauche</b>
                <p>Une page dédiée aux stages, stagiaires et premiers emplois — séparée des offres CDI/CDD.</p>
              </div>
            </div>
          )}
          <div className="list-head">
            <div><b>{filtered.length}</b><span>{tab === 'stages' ? 'stage' : 'offre'}{filtered.length > 1 ? 's' : ''} {query || city || source || specialty || urgentOnly ? 'filtrée' + (filtered.length > 1 ? 's' : '') : 'disponible' + (filtered.length > 1 ? 's' : '')}</span></div>
            <span className="list-sort"><Icon n="clock" size={13} />Plus récentes</span>
          </div>
          {loading && <div className="skeleton-wrap">{[1, 2, 3].map((i) => <div key={i} className="skeleton" />)}</div>}
          {!loading && filtered.length === 0 && <div className="empty">Aucune offre. Touchez ↻ pour actualiser.</div>}
          {filtered.slice(0, jLimit).map((j) => (
            <OfferCard key={j.id} job={j} type={tab === 'stages' ? 'stage' : 'job'} onOpen={openDetail} />
          ))}
          {filtered.length > jLimit && (
            <button className="more more-btn" onClick={() => setJLimit((n) => n + 120)}>
              Afficher plus d’offres <span>· {filtered.length - jLimit} restantes</span>
            </button>
          )}
        </main>
      )}

      {tab === 'concours' && (
        <main className="feed">
          <div className="list-head">
            <div><b>{filtered.length}</b><span>concours {query || city || source || specialty || urgentOnly ? 'filtré' + (filtered.length > 1 ? 's' : '') : 'disponible' + (filtered.length > 1 ? 's' : '')}</span></div>
            <span className="list-sort"><Icon n="calendar" size={13} />Par date limite</span>
          </div>
          {loading && <div className="skeleton-wrap">{[1, 2, 3].map((i) => <div key={i} className="skeleton" />)}</div>}
          {!loading && filtered.length === 0 && <div className="empty">Aucun concours. Touchez ↻ pour actualiser.</div>}
          {filtered.slice(0, 80).map((j) => (
            <OfferCard key={j.id} job={j} type="concours" onOpen={openDetail} />
          ))}
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
                <article className="card exam-card" key={o.id} role="button" tabIndex={0} onClick={() => openDetail('exam', o.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail('exam', o.id); } }}>
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
                <Wordmark tag="h3" className="dash-wordmark" onDark />
                <p className="muted">{stats.total} offres • {stats.thisWeek} ≤ 7j • {stats.urgent} urgentes</p>
              </div>
            </div>
            <div className="dash-stats-modern">
              <div className="dstat primary" onClick={() => goTab('jobs')}><b>{kinds.emploi}</b><span>Offres d’emploi</span></div>
              <div className="dstat info" onClick={() => goTab('jobs')}><b>{stats.thisWeek}</b><span>Publiées ≤ 7 jours</span></div>
              <div className="dstat warning" onClick={() => { goTab('jobs'); setUrgentOnly(true); }}><b>{stats.urgent}</b><span>Urgentes</span></div>
              <div className="dstat stages" onClick={() => goTab('stages')}><b>{kinds.stages}</b><span>Stages</span></div>
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
              return <div className="bar" key={k} onClick={() => { goTab('jobs'); setSource(k); }}><span className="bl">{l}</span><div className="bt"><div className="bf" style={{ width: pct + '%' }} /></div><b>{n}</b></div>;
            })}
          </div>
          <div className="panel">
            <div className="section-header"><h3>Top villes</h3><span className="section-count">{cities.length} villes</span></div>
            <div className="cities-grid">
              {cities.slice(0, 10).map(([c, n]) => (
                <div className="city-chip" key={c} onClick={() => { goTab('jobs'); setCity(c); }}>
                  <span className="city-name">{c}</span><span className="city-count">{n}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="panel">
            <div className="section-header"><h3>Types</h3><span className="section-count">Répartition</span></div>
            <div className="type-grid">
              <div className="type-box emploi" onClick={() => goTab('jobs')}><Icon n="briefcase" size={24} /><b>{kinds.emploi}</b><small>Emplois</small></div>
              <div className="type-box stages" onClick={() => goTab('stages')}><Icon n="cap" size={24} /><b>{kinds.stages}</b><small>Stages</small></div>
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
          {alerts.slice(0, 30).map((a) => {
            const isUnread = !seen || (a.at || '') > seen;
            return (
              <article className="card alert-card" key={a.id} role="button" tabIndex={0} onClick={() => openDetail('alert', a.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail('alert', a.id); } }}>
                <div className="card-head">
                  <div className={'alert-avatar' + (isUnread ? ' unread' : '')}><Icon n="bell" size={20} /></div>
                  <div className="chead">
                    <div className="alert-topline">
                      <span className="alert-date"><Icon n="clock" size={12} />{fmtWhen(a.at)}</span>
                      {isUnread && <span className="alert-dot">Non lue</span>}
                    </div>
                    <h3>{a.title}</h3>
                    {a.counts && <div className="csub"><span className="chip b-green">+{a.counts.new || 0} nouvelles</span>{a.counts.total ? <span className="chip muted">total {a.counts.total}</span> : null}</div>}
                  </div>
                </div>
                <p className="desc alert-excerpt">{shortText(a.body, 190)}</p>
                <div className="alert-foot"><span>Lire l’alerte complète <Icon n="arrow" size={13} /></span><span className="m-src">ASSOULI</span></div>
              </article>
            );
          })}
        </main>
      )}

      {tab === 'setup' && (
        <main className="dash setup-tools">
          <div className="panel theme-panel">
            <div className="section-header"><h3>Apparence</h3><span className="theme-current">{themePref === 'auto' ? 'Suit le téléphone' : themePref === 'dark' ? 'Sombre' : 'Clair'}</span></div>
            <div className="theme-seg">
              <button className={themePref === 'light' ? 'active' : ''} onClick={() => onThemeChange('light')}>
                <Icon n="sun" size={19} /><b>Clair</b><small>Lisible en plein jour</small>
              </button>
              <button className={themePref === 'dark' ? 'active' : ''} onClick={() => onThemeChange('dark')}>
                <Icon n="moon" size={19} /><b>Sombre</b><small>Reposant le soir</small>
              </button>
              <button className={themePref === 'auto' ? 'active' : ''} onClick={() => onThemeChange('auto')}>
                <Icon n="auto" size={19} /><b>Auto</b><small>Réglage Android</small>
              </button>
            </div>
          </div>
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
        <button className={tab === 'jobs' ? 'active' : ''} aria-current={tab === 'jobs' ? 'page' : undefined} onClick={() => goTab('jobs')}><Icon n="briefcase" size={21} /><span>Offres</span></button>
        <button className={tab === 'stages' ? 'active' : ''} aria-current={tab === 'stages' ? 'page' : undefined} onClick={() => goTab('stages')}><Icon n="cap" size={21} /><span>Stages</span></button>
        <button className={tab === 'concours' ? 'active' : ''} aria-current={tab === 'concours' ? 'page' : undefined} onClick={() => goTab('concours')}><Icon n="landmark" size={21} /><span>Concours</span></button>
        <button className={tab === 'marches' ? 'active' : ''} aria-current={tab === 'marches' ? 'page' : undefined} onClick={() => goTab('marches')}><Icon n="scale" size={21} /><span>Marchés</span></button>
        <button className={tab === 'exams' ? 'active' : ''} aria-current={tab === 'exams' ? 'page' : undefined} onClick={() => goTab('exams')}><Icon n="file" size={21} /><span>Exams</span></button>
        <button className={tab === 'alerts' ? 'active' : ''} aria-current={tab === 'alerts' ? 'page' : undefined} onClick={() => goTab('alerts')}><Icon n="bell" size={21} /><span>Alertes</span>{unread > 0 && <b className="nav-badge">{unread}</b>}</button>
      </nav>

      {detail && (
        <DetailPage
          type={detail.type}
          job={detailJob}
          marche={detailMarche}
          exam={detailExam}
          alert={detailAlert}
          marcheDeadline={detailMarche ? mDeadline(detailMarche) : null}
          isNew={!!(detailMarche && mShowNewBadges && mNewIds.has(detailMarche.id))}
          related={detailRelated}
          practiced={practiced}
          dlMsg={dlMsg}
          onClose={closeDetail}
          onShare={handleShare}
          onOpenDetail={openDetail}
          onGoTab={goTab}
          onTogglePracticed={togglePracticed}
          examUrl={examFileUrl}
          onDownloadExam={downloadExamFile}
          onDownloadFile={downloadFile}
        />
      )}

      {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(() => readSession());
  const [intro, setIntro] = useState(true);
  const [themePref, setThemePref] = useState(() => readThemePref());
  useEffect(() => {
    const t = setTimeout(() => setIntro(false), 1700);
    syncNativeAccounts(loadAccounts());
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    applyTheme(themePref);
    let mq = null;
    const onSystemTheme = () => { if (themePref === 'auto') applyTheme('auto'); };
    try {
      mq = window.matchMedia('(prefers-color-scheme: dark)');
      if (mq.addEventListener) mq.addEventListener('change', onSystemTheme);
      else if (mq.addListener) mq.addListener(onSystemTheme);
    } catch {}
    return () => {
      try {
        if (!mq) return;
        if (mq.removeEventListener) mq.removeEventListener('change', onSystemTheme);
        else if (mq.removeListener) mq.removeListener(onSystemTheme);
      } catch {}
    };
  }, [themePref]);
  return (
    <>
      {intro && <SplashIntro />}
      {!session
        ? <AuthScreen onAuthed={setSession} themePref={themePref} onThemeChange={setThemePref} />
        : <MainApp session={session} themePref={themePref} onThemeChange={setThemePref} onLogout={() => { clearSession(); clearMarchesSession(); setSession(null); }} />}
    </>
  );
}
