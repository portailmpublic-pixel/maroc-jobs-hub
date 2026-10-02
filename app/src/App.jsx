import React, { useEffect, useMemo, useRef, useState } from 'react';

const DEFAULT_REMOTE = 'https://raw.githubusercontent.com/USER/maroc-jobs-hub/main/jobs.json';
const LS_REMOTE = 'mjh_remote_url';
const LS_SEEN = 'mjh_alerts_seen';

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

export default function App() {
  const [jobs, setJobs] = useState([]);
  const [updatedAt, setUpdatedAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('jobs');
  const [kind, setKind] = useState('all');
  const [query, setQuery] = useState('');
  const [city, setCity] = useState('');
  const [source, setSource] = useState('');
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [toast, setToast] = useState('');
  const [remote, setRemote] = useState(() => { try { return localStorage.getItem(LS_REMOTE) || ''; } catch { return ''; } });
  const [alerts, setAlerts] = useState([]);
  const [alertsUpdated, setAlertsUpdated] = useState('');
  const [seen, setSeen] = useState(() => { try { return localStorage.getItem(LS_SEEN) || ''; } catch { return ''; } });
  const [spin, setSpin] = useState(0);
  const startY = useRef(0);

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
          return;
        }
      } catch {}
    }
  }

  async function refresh(manual = true) {
    if (manual) { setRefreshing(true); setSpin((s) => s + 1); }
    else setLoading(true);
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
            if (list.length) { setJobs(list); setUpdatedAt(upd); showToast(`Actualisé (distant) • ${list.length} offres`); loadAlerts(remoteUrl); return; }
          }
        } catch (e) { /* fallback local */ }
      }
      const b = await loadBundled();
      setJobs(b.list); setUpdatedAt(b.updatedAt);
      showToast(`Actualisé • ${b.list.length} offres`);
      loadAlerts(remoteUrl);
    } catch (e) {
      showToast('Erreur actualisation: ' + e.message);
    } finally {
      setRefreshing(false); setLoading(false);
    }
  }

  useEffect(() => { refresh(false); }, []);
  useEffect(() => { try { localStorage.setItem(LS_REMOTE, remote); } catch {} }, [remote]);
  useEffect(() => {
    if (tab === 'alerts') {
      const now = new Date().toISOString();
      setSeen(now);
      try { localStorage.setItem(LS_SEEN, now); } catch {}
    }
  }, [tab]);

  const unread = alerts.filter((a) => !seen || (a.at || '') > seen).length;

  const sources = useMemo(() => {
    const m = {};
    jobs.forEach((j) => { m[j.source] = j.sourceLabel || j.source; });
    return Object.entries(m).sort((a, b) => a[1].localeCompare(b[1]));
  }, [jobs]);

  const cities = useMemo(() => {
    const m = {};
    jobs.forEach((j) => { if (j.city) m[j.city] = (m[j.city] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 40);
  }, [jobs]);

  const stats = useMemo(() => {
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    let thisWeek = 0, urgent = 0, concours = 0;
    jobs.forEach((j) => {
      if (j.publishedDate && new Date(j.publishedDate) >= weekAgo) thisWeek++;
      const d = daysUntil(j.deadline);
      if (d !== null && d >= 0 && d <= 7) urgent++;
      if (j.kind === 'concours') concours++;
    });
    return { total: jobs.length, thisWeek, urgent, concours };
  }, [jobs]);

  const filtered = useMemo(() => {
    let l = [...jobs];
    if (kind !== 'all') l = l.filter((j) => (j.kind || 'emploi') === kind);
    if (urgentOnly) l = l.filter((j) => { const d = daysUntil(j.deadline); return d !== null && d >= 0 && d <= 7; });
    if (city) l = l.filter((j) => (j.city || '').toLowerCase().includes(city.toLowerCase()));
    if (source) l = l.filter((j) => j.source === source);
    if (query.trim()) {
      const s = query.trim().toLowerCase();
      l = l.filter((j) => [j.title, j.company, j.city, j.description, (j.requirements || []).join(' ')].join(' ').toLowerCase().includes(s));
    }
    l.sort((a, b) => (b.publishedDate || '').localeCompare(a.publishedDate || ''));
    return l;
  }, [jobs, kind, query, city, source, urgentOnly]);

  function onTouchStart(e) { startY.current = e.touches[0].clientY; }
  function onTouchEnd(e) {
    const dy = e.changedTouches[0].clientY - startY.current;
    if (dy > 110 && window.scrollY <= 5 && !refreshing) refresh(true);
  }

  return (
    <div className="phone" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <header className="hero">
        <div className="hero-top">
          <div className="brand">🇲🇦 <b>Maroc Jobs</b> <span>Hub</span></div>
          <button className={'refresh' + (refreshing ? ' spinning' : '')} onClick={() => refresh(true)} title="Actualiser" style={{ transform: `rotate(${spin * 360}deg)` }}>↻</button>
        </div>
        <p className="hero-sub">Offres du Maroc • style moderne • actualisez à chaque ouverture</p>
        <div className="hero-stats">
          <div className="hstat"><b>{stats.total}</b><span>offres</span></div>
          <div className="hstat green"><b>{stats.thisWeek}</b><span>≤ 7 jours</span></div>
          <div className="hstat orange"><b>{stats.urgent}</b><span>urgentes</span></div>
          <div className="hstat violet"><b>{stats.concours}</b><span>concours</span></div>
        </div>
        <div className="updated">{refreshing ? 'Actualisation…' : loading ? 'Chargement…' : `Dernière actualisation : ${(updatedAt || '').slice(0, 16).replace('T', ' ') || 'à l’instant'} • ${filtered.length} affichées`}</div>
      </header>

      <div className="tabs">
        <button className={kind === 'all' ? 'active' : ''} onClick={() => setKind('all')}>🔎 Toutes</button>
        <button className={kind === 'emploi' ? 'active' : ''} onClick={() => setKind('emploi')}>💼 Emplois</button>
        <button className={kind === 'concours' ? 'active' : ''} onClick={() => setKind('concours')}>🏛️ Concours</button>
        <button className={urgentOnly ? 'active warn' : ''} onClick={() => setUrgentOnly(!urgentOnly)}>⏰ ≤7j</button>
      </div>

      <div className="searchbar">
        <input placeholder="🔍 Rechercher : poste, entreprise, ville…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="filters">
        <select value={city} onChange={(e) => setCity(e.target.value)}>
          <option value="">📍 Toutes villes</option>
          {cities.map(([c, n]) => <option key={c} value={c}>{c} ({n})</option>)}
        </select>
        <select value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">🔌 Toutes sources</option>
          {sources.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        {(query || city || source || urgentOnly || kind !== 'all') && (
          <button className="clear" onClick={() => { setQuery(''); setCity(''); setSource(''); setUrgentOnly(false); setKind('all'); }}>✕</button>
        )}
      </div>

      {tab === 'jobs' && (
        <main className="feed">
          {loading && <div className="skeleton-wrap">{[1, 2, 3].map((i) => <div key={i} className="skeleton" />)}</div>}
          {!loading && filtered.length === 0 && <div className="empty">Aucune offre. Touchez ↻ pour actualiser.</div>}
          {filtered.slice(0, 120).map((j) => {
            const dl = deadlineInfo(j);
            const initial = (j.company || j.sourceLabel || '?').trim().charAt(0).toUpperCase();
            return (
              <article className="card" key={j.id}>
                <div className="card-head">
                  <div className="avatar">{initial}</div>
                  <div className="chead">
                    <h3>{j.title}</h3>
                    <div className="csub">🏢 {j.company || '—'} • 📍 {j.city || '—'}{j.contract ? ` • ${j.contract}` : ''}</div>
                  </div>
                </div>
                <div className="chips">
                  <span className="chip">{j.sourceLabel || j.source}</span>
                  {j.postsCount > 1 && <span className="chip blue">{j.postsCount} postes</span>}
                  <span className={'chip ' + dl.cls}>{dl.label}</span>
                  {j.publishedDate && <span className="chip muted">Publié {j.publishedDate}</span>}
                </div>
                {j.description && <p className="desc">{String(j.description).slice(0, 160)}…</p>}
                {(j.requirements || []).length > 0 && (
                  <ul className="reqs">{j.requirements.slice(0, 3).map((r, i) => <li key={i}>✅ {r}</li>)}</ul>
                )}
                <div className="actions">
                  <button className="apply" onClick={() => openLink(j.url)}>↗ Voir / Postuler</button>
                  <span className="kind">{j.kind === 'concours' ? '🏛️ Concours' : '💼 Emploi'}</span>
                </div>
              </article>
            );
          })}
          {filtered.length > 120 && <div className="more">+ {filtered.length - 120} autres — affinez la recherche.</div>}
        </main>
      )}

      {tab === 'dash' && (
        <main className="dash">
          <div className="panel">
            <h3>📊 Par source</h3>
            {sources.map(([k, l]) => {
              const n = jobs.filter((j) => j.source === k).length;
              const pct = stats.total ? Math.max(4, (n / stats.total) * 100) : 0;
              return <div className="bar" key={k} onClick={() => { setSource(k); setTab('jobs'); }}><span className="bl">{l}</span><div className="bt"><div className="bf" style={{ width: pct + '%' }} /></div><b>{n}</b></div>;
            })}
          </div>
          <div className="panel">
            <h3>📍 Top villes</h3>
            {cities.slice(0, 8).map(([c, n]) => {
              const pct = stats.total ? Math.max(4, (n / stats.total) * 100) : 0;
              return <div className="bar" key={c} onClick={() => { setCity(c); setTab('jobs'); }}><span className="bl">{c}</span><div className="bt"><div className="bf g" style={{ width: pct + '%' }} /></div><b>{n}</b></div>;
            })}
          </div>
        </main>
      )}

      {tab === 'alerts' && (
        <main className="feed">
          <div className="panel" style={{ marginBottom: 10 }}>
            <h3>🔔 Alertes nouveautés {unread > 0 && <span className="chip b-red">{unread} non lues</span>}</h3>
            <p className="muted">Mêmes alertes que WhatsApp • {alertsUpdated ? `maj ${(alertsUpdated || '').slice(0, 16).replace('T', ' ')}` : 'touchez ↻ pour charger'} • les nouveautés arrivent à chaque actualisation.</p>
          </div>
          {alerts.length === 0 && <div className="empty">Aucune alerte pour l'instant. Touchez ↻.</div>}
          {alerts.slice(0, 30).map((a) => (
            <article className="card" key={a.id}>
              <div className="card-head">
                <div className="avatar">🔔</div>
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
            <h3>🔄 Actualisation auto (moderne)</h3>
            <p className="muted">Par défaut l'app lit <code>jobs.json</code> intégré (hors-ligne). Collez ci-dessous l'URL RAW GitHub de votre <code>jobs.json</code> pour recevoir les nouveautés à chaque ↻ sans republier l'APK. Les alertes suivent automatiquement (<code>alerts.json</code> à côté).</p>
            <input className="remote" placeholder="https://raw.githubusercontent.com/.../jobs.json" value={remote} onChange={(e) => setRemote(e.target.value)} />
            <p className="muted">Exemple : <code>{DEFAULT_REMOTE}</code></p>
            <div className="row">
              <button className="apply" onClick={() => refresh(true)}>↻ Actualiser maintenant</button>
              <button className="ghost" onClick={() => { setRemote(''); showToast('URL distante effacée'); }}>Effacer</button>
            </div>
            <p className="muted">Astuce : le workflow GitHub <code>update-jobs.yml</code> met à jour ce fichier chaque jour à 06:00 Casablanca.</p>
          </div>
          <div className="panel">
            <h3>ℹ️ Sources suivies</h3>
            <p className="muted">ReKrute • Dreamjob • Emploi Public • ANAPEC • Stellantis • Jawb • Indeed • Glassdoor • Emploi.ma • MarocAnnonces</p>
            <p className="muted">Tirez vers le bas en haut de page ou touchez ↻ pour actualiser comme un site moderne.</p>
          </div>
        </main>
      )}

      <nav className="bottomnav">
        <button className={tab === 'jobs' ? 'active' : ''} onClick={() => setTab('jobs')}>💼<span>Offres</span></button>
        <button className={tab === 'alerts' ? 'active' : ''} onClick={() => setTab('alerts')} style={{ position: 'relative' }}>🔔<span>Alertes</span>{unread > 0 && <b style={{ position: 'absolute', top: 2, right: 8, background: '#ef4444', color: '#fff', fontSize: 10, borderRadius: 999, padding: '1px 6px' }}>{unread}</b>}</button>
        <button className="fab" onClick={() => refresh(true)} title="Actualiser">↻</button>
        <button className={tab === 'dash' ? 'active' : ''} onClick={() => setTab('dash')}>📊<span>Stats</span></button>
        <button className={tab === 'setup' ? 'active' : ''} onClick={() => setTab('setup')}>⚙️<span>Refresh</span></button>
      </nav>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
