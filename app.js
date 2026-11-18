// shortcut: all data lives in this browser's localStorage, move to a backend with logins when other people must see or edit projects
const KEY = 'whysquare-plots-v1';
// Google Maps JavaScript API key. Restrict it to this site's web address in Google Cloud. Empty = development mode (watermarked map).
const GMAPS_KEY = '';
// Map ID of a vector map style (needed for 3D tilt and rotation). DEMO_MAP_ID is Google's test ID; make your own in Google Cloud > Map Management.
const GMAPS_MAP_ID = 'DEMO_MAP_ID';
const STATUS = { available: ['Available', '#7bd66b'], reserved: ['Reserved', '#f2b33d'], sold: ['Sold', '#e5604d'] };
const KINDS = { plot: ['Plot'], road: ['Road', '#3a3e3c'], green: ['Green area', '#4a6630'], amenity: ['Amenity', '#6b7f9c'] };
// unit: [area label, sq m to unit, length label, m to unit]
const UNITS = { sqft: ['sq ft', 10.7639, 'ft', 3.28084], sqyd: ['sq yd', 1.19599, 'ft', 3.28084], sqm: ['sq m', 1, 'm', 1] };
const app = document.getElementById('app');
const $ = s => app.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 8);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const st = pl => STATUS[pl.status] || STATUS.available;
const isPlot = s => !KINDS[s.kind] || s.kind === 'plot';
const ICON = {
  ruler: '<path d="M3 17 17 3l4 4L7 21z"/><path d="m7 13 2 2m1-5 2 2m1-5 2 2"/>',
  home: '<path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z"/>',
  filters: '<path d="M4 7h10m4 0h2M4 17h2m4 0h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  share: '<path d="M14 5l6 6-6 6v-4c-5 0-8 1.500-10 5 0-7 4-11 10-11z"/>',
  gps: '<circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>',
  gallery: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.500"/><path d="m4 17 5-4 4 3 3-2 4 3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-9.500v.5"/>',
  locate: '<path d="M20 4 4 11l7 2 2 7z"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/>',
  back: '<path d="M11 5l-7 7 7 7M4 12h16"/>',
  edit: '<path d="M4 20l1-4L16 5l3 3L8 19z"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  zin: '<path d="M12 5v14M5 12h14"/>',
  zout: '<path d="M5 12h14"/>',
};
const ico = n => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;

// Polygon area in sq m: flatten lat/lng to metres, then shoelace. Good enough at plot scale.
function area(pts) {
  const k = Math.cos(pts[0][0] * Math.PI / 180) * 111320;
  let s = 0;
  pts.forEach(([la, ln], i) => { const [lb, lm] = pts[(i + 1) % pts.length]; s += ln * k * lb * 110540 - lm * k * la * 110540; });
  return Math.abs(s / 2);
}
console.assert(Math.abs(area([[0, 0], [0, .001], [.001, .001], [.001, 0]]) - 111.32 * 110.54) < 1, 'area() self-check failed');

// CAD export: DXF R12 (opens in AutoCAD, LibreCAD, QGIS, BricsCAD). Units are metres east and north of the project's home point.
// One layer per shape type, plot numbers as centred text on LABELS.
function toDXF(p) {
  const kx = Math.cos(p.center[0] * Math.PI / 180) * 111320, ky = 110540;
  const xy = ([la, ln]) => [(ln - p.center[1]) * kx, (la - p.center[0]) * ky];
  const layer = s => (KINDS[s.kind] && s.kind !== 'plot' ? s.kind : 'plot').toUpperCase();
  const out = [], put = (...v) => out.push(...v.map(String));
  const text = (x, y, h, s) => put(0, 'TEXT', 8, 'LABELS', 10, x.toFixed(3), 20, y.toFixed(3), 40, h.toFixed(2), 1, s, 72, 1, 11, x.toFixed(3), 21, y.toFixed(3), 73, 2);
  put(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 0, 'ENDSEC');
  put(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LAYER', 70, 5);
  for (const [name, colour] of [['PLOT', 7], ['ROAD', 8], ['GREEN', 3], ['AMENITY', 5], ['LABELS', 2]]) put(0, 'LAYER', 2, name, 70, 0, 62, colour, 6, 'CONTINUOUS');
  put(0, 'ENDTAB', 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES');
  let minX = Infinity, minY = Infinity;
  for (const s of p.plots) {
    const P = s.pts.map(xy), ly = layer(s);
    put(0, 'POLYLINE', 8, ly, 66, 1, 70, 1); // closed polyline
    for (const [x, y] of P) { put(0, 'VERTEX', 8, ly, 10, x.toFixed(3), 20, y.toFixed(3)); minX = Math.min(minX, x); minY = Math.min(minY, y); }
    put(0, 'SEQEND', 8, ly);
    if (s.no) text(P.reduce((t, q) => t + q[0], 0) / P.length, P.reduce((t, q) => t + q[1], 0) / P.length, Math.min(8, Math.max(1, Math.sqrt(area(s.pts)) / 6)), s.no);
  }
  if (p.plots.length) text(minX, minY - 12, 4, `${p.name} - traced from satellite imagery, not a survey drawing`);
  put(0, 'ENDSEC', 0, 'EOF');
  return out.join('\r\n') + '\r\n';
}
{ // self-check: one square plot gives one closed polyline with 4 vertices and a label
  const d = toDXF({ name: 't', center: [0, 0], plots: [{ kind: 'plot', no: '1', pts: [[0, 0], [0, .001], [.001, .001], [.001, 0]] }] });
  console.assert(d.split('\r\nVERTEX\r\n').length === 5 && d.includes('\r\nTEXT\r\n') && d.endsWith('EOF\r\n'), 'toDXF() self-check failed');
}

function seed() {
  const c = [18.6105, 73.912], rot = .35, dx = .00042, dy = .0003, plots = [];
  const rect = (x0, y0, w, h) => [[0, 0], [w, 0], [w, h], [0, h]].map(([x, y]) => {
    x += x0; y += y0;
    return [c[0] + x * Math.sin(rot) + y * Math.cos(rot), c[1] + x * Math.cos(rot) - y * Math.sin(rot)];
  });
  const shape = (kind, no, pts, status = 'available') => plots.push({ id: uid(), kind, no, status, area: Math.round(area(pts)), price: '', note: '', pts });
  for (let r = 0; r < 4; r++) for (let k = 0; k < 8; k++)
    shape('plot', String(plots.length + 1), rect((k - 4) * dx, (r - 2) * dy + (r > 1 ? .00012 : 0), dx * .92, dy * .92), ['available', 'available', 'reserved', 'sold'][(r * 3 + k) % 4]);
  shape('road', '9 m road', rect(-4 * dx, -.00002, 8 * dx, .000135));
  shape('green', 'Garden', rect(4 * dx + .00003, -2 * dy, dx, 4 * dy + .00012));
  return { workspaces: [{ id: uid(), name: 'My workspace', projects: [{ id: 'demo', name: 'Demo Estate', tagline: 'Sample plotted layout', info: 'This is sample data. Press Edit to draw your own plots.', phone: '', gallery: [], center: c, zoom: 17, plots }] }] };
}

let db;
try { db = JSON.parse(localStorage.getItem(KEY)); } catch {}
// Shared projects live in data/projects.json. A browser takes them when it has nothing saved, or when the
// file's "version" is newer than the one it last took. Bump "version" in the file to publish new data to everyone.
const hasData = d => Array.isArray(d?.workspaces);
const save = () => {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch { alert('Could not save: this browser\'s storage is full. Export a backup, then remove a logo or some plots.'); }
};
const nav = h => { if (location.hash === h) route(); else location.hash = h; };

let map = null, onEsc = null;
document.addEventListener('keydown', e => { if (e.key === 'Escape' && onEsc) onEsc(); });

function route() {
  map = null; // the Google map goes away with its #map element
  onEsc = null;
  app.oninput = app.onsubmit = app.onchange = null;
  const [path, qs] = location.hash.slice(1).split('?');
  // opening the site with no address after it shows the default project; '#/' (the back arrow) still reaches the dashboard
  if (!path && db.defaultProject && db.workspaces.some(w => w.projects.some(x => x.id === db.defaultProject))) return location.replace(`#/p/${db.defaultProject}`);
  const m = path.match(/^\/p\/(\w+)(\/edit)?$/);
  let p;
  if (m) for (const w of db.workspaces) p = p || w.projects.find(x => x.id === m[1]);
  if (p) renderMap(p, !!m[2], new URLSearchParams(qs));
  else renderDash((path.match(/^\/w\/(\w+)$/) || [])[1]);
}
window.addEventListener('hashchange', () => db && route());

function renderDash(wid) {
  const w = db.workspaces.find(x => x.id === wid) || db.workspaces[0];
  app.className = 'dash';
  app.dataset.mode = '';
  const count = (p, k) => p.plots.filter(x => isPlot(x) && x.status === k).length;
  app.innerHTML = `<aside>
    <div class="brand"><img src="whysquare_logo.png" alt=""><div><h1>Whysquare</h1><small>Automate. Innovate. Elevate</small></div></div>
    <h2>Workspaces</h2>
    <nav>${db.workspaces.map(x => `<a href="#/w/${x.id}" class="${x === w ? 'on' : ''}">${esc(x.name)}<small>${x.projects.length}</small></a>`).join('')}</nav>
    <button data-a="new-ws">+ New workspace</button>
    <div class="io"><button data-a="export">Export backup</button><button data-a="import">Import backup</button></div>
  </aside>
  <main>${w ? `<header><h2>${esc(w.name)}</h2><div>
      <button data-a="rename-ws">Rename</button><button class="danger" data-a="del-ws">Delete</button>
      <button class="primary" data-a="new-p">+ New project</button></div></header>
    <div class="rows">${w.projects.map(p => `<article class="row">
      <div><h3>${esc(p.name)}</h3><p>${esc(p.tagline) || 'No tagline yet'}</p></div>
      <div><div class="bar">${Object.entries(STATUS).map(([k, [, c]]) => `<span style="flex:${count(p, k)};background:${c}"></span>`).join('')}</div>
      <ul>${Object.entries(STATUS).map(([k, [n, c]]) => `<li><i style="background:${c}"></i>${count(p, k)} ${n}</li>`).join('')}</ul></div>
      <div class="acts"><a class="primary" href="#/p/${p.id}">Open</a><a class="pill" href="#/p/${p.id}/edit">Edit</a>
      ${db.defaultProject === p.id ? '<small class="def">Opens first</small>' : `<button data-a="def-p" data-id="${p.id}">Open first</button>`}
      <button class="danger" data-a="del-p" data-id="${p.id}">Delete</button></div></article>`).join('') || '<p class="empty">No projects yet. Create one to start drawing plots.</p>'}</div>`
    : '<p class="empty">Create a workspace to begin.</p>'}</main>`;

  const act = {
    'new-ws'() { const n = prompt('Workspace name')?.trim(); if (n) { const x = { id: uid(), name: n, projects: [] }; db.workspaces.push(x); save(); nav('#/w/' + x.id); } },
    'rename-ws'() { const n = prompt('Workspace name', w.name)?.trim(); if (n) { w.name = n; save(); route(); } },
    'del-ws'() { if (confirm(`Delete workspace "${w.name}" and its ${w.projects.length} project(s)? This cannot be undone.`)) { db.workspaces = db.workspaces.filter(x => x !== w); save(); nav('#/'); } },
    'new-p'() {
      const n = prompt('Project name')?.trim();
      if (n) { const x = { id: uid(), name: n, tagline: '', info: '', phone: '', gallery: [], center: [20.5937, 78.9629], zoom: 5, plots: [] }; w.projects.push(x); save(); nav(`#/p/${x.id}/edit`); }
    },
    'def-p'(el) { db.defaultProject = el.dataset.id; save(); route(); },
    'del-p'(el) { const x = w.projects.find(q => q.id === el.dataset.id); if (x && confirm(`Delete project "${x.name}" and its ${x.plots.length} shape(s)? This cannot be undone.`)) { w.projects = w.projects.filter(q => q !== x); save(); route(); } },
    export() { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(db, null, 1)], { type: 'application/json' })); a.download = 'whysquare-plots-backup.json'; a.click(); },
    import() {
      const i = document.createElement('input'); i.type = 'file'; i.accept = '.json';
      i.onchange = async () => {
        try {
          const d = JSON.parse(await i.files[0].text());
          if (!Array.isArray(d.workspaces)) throw 0;
          if (confirm('Replace everything in this browser with the backup?')) { db = d; save(); nav('#/'); }
        } catch { alert('That file is not a valid backup.'); }
      };
      i.click();
    },
  };
  app.onclick = e => { const a = e.target.closest('[data-a]'); if (a && act[a.dataset.a]) act[a.dataset.a](a); };
}

function renderMap(p, edit, params) {
  const viewOnly = params.has('view') && !edit;          // shared link: no way back to the dashboard or editor
  const showStatus = edit || params.get('status') !== '0'; // shared link can hide availability
  let unit = UNITS[p.unit] ? p.unit : 'sqft';
  const fmtArea = (m2, u = unit) => `${(m2 * UNITS[u][1]).toLocaleString('en-IN', { maximumFractionDigits: u === 'sqm' ? 2 : 0 })} ${UNITS[u][0]}`;
  const fmtLen = m => `${(m * UNITS[unit][3]).toFixed(1)} ${UNITS[unit][2]}`;
  const plots = () => p.plots.filter(isPlot);

  app.className = 'viewer';
  const b = (a, label) => `<button data-a="${a}">${label}</button>`;
  const rb = (a, label) => `<button class="round" data-a="${a}" aria-label="${label}" title="${label}">${ico(a)}</button>`;
  const pb = (a, label) => `<button class="pill" data-a="${a}">${ico(a)}${label}</button>`;
  app.innerHTML = `<div id="map"></div>
  <header class="top">${viewOnly ? '' : `<a class="round" href="#/" aria-label="All projects" title="All projects">${ico('back')}</a>`}
    ${p.logo ? `<img src="${esc(p.logo)}" alt="${esc(p.name)}">` : `<div><b>${esc(p.name)}</b><small>${esc(p.tagline)}</small></div>`}
    ${viewOnly ? '' : `<a class="pill ${edit ? 'primary' : ''}" href="#/p/${p.id}${edit ? '' : '/edit'}">${edit ? 'Done' : ico('edit') + 'Edit'}</a>`}</header>
  ${edit ? `<div class="editbar">${b('draw', '+ Draw shape')}<button class="primary" data-a="finish">Finish shape</button>${b('cancel', 'Cancel')}
    ${b('overlay', 'Tracing overlay')}${b('settings', 'Project settings')}${b('align', 'Align layout')}${b('sethome', 'Set home view')}${b('cad', 'Export CAD')}
    <form id="goto"><input name="ll" placeholder="lat, lng" aria-label="Go to latitude, longitude"><button>Go</button></form></div>` : ''}
  <div class="tools"><button class="round compass" data-a="north" aria-label="Face north" title="Face north"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 3 15 12H9z" fill="#e5604d"/><path d="M12 21 9 12h6z" fill="currentColor"/></svg></button>
    <button class="round" data-a="tilt" aria-label="3D view" title="3D view"><b>3D</b></button>${rb('zin', 'Zoom in')}${rb('zout', 'Zoom out')}${rb('ruler', 'Ruler')}${rb('home', 'Home view')}${rb('filters', 'Filters')}${rb('share', 'Share')}</div>
  <div class="dock"><form id="search">${ico('search')}<input name="q" type="search" list="nos" placeholder="Search plot no." aria-label="Search plot number">
      <datalist id="nos">${plots().map(x => `<option value="${esc(x.no)}">`).join('')}</datalist></form>
    ${pb('gps', 'GPS')}${pb('gallery', 'Gallery')}${pb('info', 'Info')}
    <a class="pill" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${p.center[0]},${p.center[1]}">${ico('locate')}Locate</a></div>
  <dialog id="panel" aria-labelledby="panel-title"></dialog><div id="tip" hidden></div><div id="snap" hidden></div>
  ${edit ? '' : `<div class="splash">${p.logo ? `<img class="mine" src="${esc(p.logo)}" alt="">` : `<h2>${esc(p.name)}</h2>`}
    <div><img src="whysquare_logo.png" alt=""><b>Whysquare</b><small>Automate. Innovate. Elevate</small></div><p>Tip: tap a plot to see its size and sides.</p></div>`}
  <div class="badge"><img src="whysquare_logo.png" alt="Whysquare"><small>Automate. Innovate. Elevate</small></div>`;

  if (!window.google?.maps) { $('#map').innerHTML = '<p class="nomap">The map could not load. Check your connection and reload the page.</p>'; return; }
  const G = google.maps, LL = a => ({ lat: a[0], lng: a[1] }), ll2 = l => [l.lat(), l.lng()];
  map = new G.Map($('#map'), { center: LL(p.center), zoom: p.zoom, mapTypeId: 'hybrid', tilt: 0, heading: 0, mapId: GMAPS_MAP_ID, renderingType: G.RenderingType.VECTOR, tiltInteractionEnabled: true, headingInteractionEnabled: true, maxZoom: 21, disableDefaultUI: true, disableDoubleClickZoom: true, clickableIcons: false, gestureHandling: 'greedy', backgroundColor: '#0b1016' });
  const splash = $('.splash'); // loading screen: goes once the imagery is in, or after 3s on a slow connection
  if (splash) { const done = () => { splash.classList.add('gone'); setTimeout(() => splash.remove(), 400); }; G.event.addListenerOnce(map, 'tilesloaded', done); setTimeout(done, 3000); }

  // One OverlayView does the screen <-> lat/lng maths and holds the HTML on the map: plot numbers, side lengths, ruler
  // dots, the imagery dimmer and the tracing drawing. Shapes and lines are native Google polygons and polylines.
  class View extends G.OverlayView {
    items = []; box = Object.assign(document.createElement('div'), { className: 'gl' }); svg = null;
    onAdd() { const pn = this.getPanes(); pn.floatPane.append(this.box); if (this.svg) pn.overlayMouseTarget.append(this.svg); draw(); }
    place(el, ll) { const q = this.getProjection()?.fromLatLngToDivPixel(LL(ll)); if (q) el.style.transform = `translate(${q.x}px, ${q.y}px)`; }
    draw() {
      const pr = this.getProjection(), m = $('#map'); if (!pr || !m) return;
      this.items.forEach(it => this.place(it.el, it.ll));
      if (this.svg) {
        const [[s, w], [n, e]] = ovBounds(p.overlay), a = pr.fromLatLngToDivPixel(LL([n, w])), c = pr.fromLatLngToDivPixel(LL([s, e]));
        Object.assign(this.svg.style, { left: a.x + 'px', top: a.y + 'px', width: c.x - a.x + 'px', height: c.y - a.y + 'px' });
      }
    }
  }
  const view = new View(); view.setMap(map);
  const px = ll => view.getProjection().fromLatLngToContainerPixel(LL(ll)); // lat/lng -> pixel in the map box
  const toLL = q => ll2(view.getProjection().fromContainerPixelToLatLng(new G.Point(q.x, q.y)));
  const pd = (a, c) => Math.hypot(a.x - c.x, a.y - c.y);
  const dist = (a, c) => { const r = Math.PI / 180, h = Math.sin((c[0] - a[0]) * r / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(c[0] * r) * Math.sin((c[1] - a[1]) * r / 2) ** 2; return 12742000 * Math.asin(Math.sqrt(h)); };
  const closest = (c, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.y - a.y) * dy) / l2)) : 0; return { x: a.x + t * dx, y: a.y + t * dy }; };
  // area-weighted centre; measured from the first corner, because raw lat/lng products cancel and lose the precision
  const centroid = v => { const o = v[0], w = v.map(a => [a[0] - o[0], a[1] - o[1]]); let A = 0, x = 0, y = 0; w.forEach((a, i) => { const c = w[(i + 1) % w.length], k = a[0] * c[1] - c[0] * a[1]; A += k; x += (a[0] + c[0]) * k; y += (a[1] + c[1]) * k; }); return A ? [o[0] + x / 3 / A, o[1] + y / 3 / A] : o; };
  const inPoly = (q, v) => { let c = false; for (let i = 0, j = v.length - 1; i < v.length; j = i++) { const a = v[i], b = v[j]; if ((a[0] > q[0]) !== (b[0] > q[0]) && q[1] < (b[1] - a[1]) * (q[0] - a[0]) / (b[0] - a[0]) + a[1]) c = !c; } return c; };
  // for an L-shaped road the centre falls outside: use a point 3 m inside the middle of its longest side instead
  const inward = (a, c, v) => { const kx = 111320 * Math.cos(a[0] * Math.PI / 180), m = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2], ex = (c[1] - a[1]) * kx, ey = (c[0] - a[0]) * 110540, l = Math.hypot(ex, ey);
    for (const sgn of [1, -1]) { const q = [m[0] + sgn * ex / l * 3 / 110540, m[1] - sgn * ey / l * 3 / kx]; if (inPoly(q, v)) return q; } return null; };
  { const t = centroid([[20.4, 72.8], [20.4, 72.8001], [20.4001, 72.8001], [20.4001, 72.8]]); console.assert(Math.abs(t[0] - 20.40005) < 1e-9 && Math.abs(t[1] - 72.80005) < 1e-9, 'centroid() self-check failed'); }
  const fit = v => { const bb = new G.LatLngBounds(); v.forEach(q => bb.extend(LL(q))); map.fitBounds(bb, 140); G.event.addListenerOnce(map, 'idle', () => map.getZoom() > 19 && map.setZoom(19)); };
  const dash = (color, gap) => ({ strokeOpacity: 0, icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, strokeColor: color, strokeWeight: 1.5, scale: 2 }, offset: '0', repeat: gap }] });
  const line = (v, o) => new G.Polyline({ path: v.map(LL), clickable: false, ...o });
  const group = () => { // shapes and labels that are cleared together
    const objs = [], els = new Set();
    return {
      add(o) { o.setMap(map); objs.push(o); return o; },
      label(ll, html, cls = '') { const el = Object.assign(document.createElement('div'), { className: cls, innerHTML: html }); view.items.push({ ll, el }); els.add(el); view.box.append(el); view.place(el, ll); },
      clear() { objs.splice(0).forEach(o => o.setMap(null)); els.forEach(el => el.remove()); view.items = view.items.filter(it => !els.has(it.el)); els.clear(); },
    };
  };
  const dot = (ll, fill) => marks.label(ll, `<i class="dot" style="background:${fill}"></i>`);
  const layer = group(), here = group();
  // Veil is ±0.05° (~11 km): Google's 3D renderer drops much larger shapes at close zoom.
  // Like Spacer: far out, full-colour imagery with Google's names; zooming in, a dark veil under the plots fades the
  // imagery down, and from zoom 18 Google's names go so only the layout's own labels show.
  // ±0.05° (~11 km): Google's 3D renderer drops much larger shapes at close zoom
  const veil = new G.Polygon({ map, paths: [[-1, -1], [-1, 1], [1, 1], [1, -1]].map(([a, b]) => LL([p.center[0] + a * .05, p.center[1] + b * .05])), fillColor: '#000', strokeOpacity: 0, clickable: false, zIndex: 0 });
  const look = () => { const z = map.getZoom(); veil.setOptions({ fillOpacity: .66 * Math.max(0, Math.min(1, (z - 15) / 3)) }); const t = z >= 18 ? 'satellite' : 'hybrid'; if (map.getMapTypeId() !== t) map.setMapTypeId(t); };
  look(); map.addListener('zoom_changed', look); map.addListener('idle', look); // again once settled: changes made mid-zoom can be dropped
  // 3D: tilt and turn smoothly. The compass needle follows the heading; clicking it faces north.
  const ease = (key, to) => {
    const from = key === 'tilt' ? map.getTilt() : map.getHeading(), t0 = performance.now();
    if (key === 'heading') to = from + ((to - from + 540) % 360 - 180); // the short way round
    const step = now => { const k = Math.min(1, (now - t0) / 600); map.moveCamera({ [key]: from + (to - from) * (1 - (1 - k) ** 3) }); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  };
  map.addListener('heading_changed', () => { $('.compass svg').style.transform = `rotate(${-map.getHeading()}deg)`; });
  map.addListener('tilt_changed', () => { const on = map.getTilt() > 0; $('[data-a=tilt] b').textContent = on ? '2D' : '3D'; $('[data-a=tilt]').classList.toggle('on', on); });
  const temp = line([], dash('#fff', '12px')); temp.setMap(map);
  const panel = $('#panel');
  const shown = new Set(Object.keys(STATUS));
  const range = { min: 0, max: Infinity };
  let sel = null, mode = null, pts = [];
  const match = pl => (!showStatus || shown.has(pl.status)) && (+pl.area || 0) >= range.min && (+pl.area || 0) <= range.max;

  // kind: '' side card, 'slip' plot card, 'tl' top-left card, 'modal' centred over a dimmed map
  // Native <dialog>: Share, Info and Gallery open modal (page inert, Esc and click-outside close, focus returns);
  // every other panel opens non-modal, because the ruler, matching and drawing need map clicks while it is open.
  const show = (html, kind = '') => {
    const modal = /\bmodal\b/.test(kind);
    if (panel.open && panel.matches(':modal') !== modal) panel.close(); // a dialog can't switch between modal and non-modal while open
    panel.className = kind;
    panel.innerHTML = `<button class="x" data-a="close" aria-label="Close">${ico('close')}</button>${html}`;
    panel.querySelector('h3')?.setAttribute('id', 'panel-title');
    modal ? panel.setAttribute('closedby', 'any') : panel.removeAttribute('closedby'); // closedby also applies to show(), so only while modal
    if (!panel.open) modal ? panel.showModal() : panel.show();
  };
  const hide = () => { if (panel.open) panel.close(); };
  const marks = group(); // ruler dots, segments and their lengths
  const band = line([], dash('#fff', '12px')); band.setMap(map); // follows the cursor
  const tip = $('#tip'), mark = $('#snap');
  let run = 0, closed = false; // closed: the ruler loop was finished, so the next click starts a new measurement
  const setMode = m => { mode = m; pts = []; run = 0; closed = false; temp.setPath([]); band.setPath([]); marks.clear(); tip.hidden = mark.hidden = true; app.dataset.mode = m || ''; };
  // Ruler and drawing snap to the nearest shape corner within 12px, else the nearest edge within 8px. c: cursor pixel.
  function snap(ll, c) {
    if (pts.length > 2 && !closed && pd(px(pts[0]), c) < 12) return { ll: pts[0], kind: 'corner', close: true }; // back at the start: close the loop
    let best = null, bd = 12;
    for (const s of p.plots) for (const v of s.pts) { const d = pd(px(v), c); if (d < bd) { bd = d; best = v; } }
    if (best) return { ll: best, kind: 'corner' };
    bd = 8;
    for (const s of p.plots) s.pts.forEach((a, i) => {
      const q = closest(c, px(a), px(s.pts[(i + 1) % s.pts.length])), d = pd(q, c);
      if (d < bd) { bd = d; best = q; }
    });
    return best ? { ll: toLL(best), kind: 'edge' } : { ll };
  }
  // Screen angle of a side, kept upright so text along it never reads upside down
  const angle = (a, c) => {
    if (!view.getProjection()) return 0;
    const pa = px(a), pc = px(c);
    const d = Math.atan2(pc.y - pa.y, pc.x - pa.x) * 180 / Math.PI;
    return d > 90 ? d - 180 : d < -90 ? d + 180 : d;
  };
  setMode(null);
  onEsc = () => { setMode(null); hide(); };

  // Tracing overlay: a layout drawing laid on the map, editor only
  const ovBounds = o => {
    const half = o.width * Math.hypot(o.w, o.h) / o.w / 2; // half side, in metres, of the square that holds the drawing at any rotation
    const dLat = half / 110540, dLng = half / (111320 * Math.cos(o.center[0] * Math.PI / 180));
    return [[o.center[0] - dLat, o.center[1] - dLng], [o.center[0] + dLat, o.center[1] + dLng]];
  };
  function drawOverlay() {
    view.svg?.remove(); view.svg = null;
    const o = p.overlay;
    if (!edit || !o || o.hidden) return;
    const NS = 'http://www.w3.org/2000/svg', D = Math.hypot(o.w, o.h);
    const svg = document.createElementNS(NS, 'svg'), img = document.createElementNS(NS, 'image');
    svg.setAttribute('viewBox', `0 0 ${D} ${D}`); svg.setAttribute('class', 'ov'); svg.style.opacity = o.opacity;
    Object.entries({ href: o.src, x: (D - o.w) / 2, y: (D - o.h) / 2, width: o.w, height: o.h, transform: `rotate(${+o.rot || 0} ${D / 2} ${D / 2})` }).forEach(([k, v]) => img.setAttribute(k, v));
    svg.append(img);
    if (map.getTilt() || map.getHeading()) map.moveCamera({ tilt: 0, heading: 0 }); // the drawing is laid flat, north up
    view.svg = svg; view.getPanes()?.overlayMouseTarget.append(svg); view.draw();
    G.OverlayView.preventMapHitsAndGesturesFrom(svg); // drags on the drawing move it, not the map
    const evLL = e => { const r = $('#map').getBoundingClientRect(); return toLL({ x: e.clientX - r.left, y: e.clientY - r.top }); };
    let last = null; // drag the drawing to move it, only while the overlay panel is open
    img.onpointerdown = e => { if (mode !== 'overlay') return; e.stopPropagation(); img.setPointerCapture(e.pointerId); last = evLL(e); map.setOptions({ gestureHandling: 'none' }); };
    img.onpointermove = e => {
      if (!last) return;
      const ll = evLL(e);
      o.center = [o.center[0] + ll[0] - last[0], o.center[1] + ll[1] - last[1]]; last = ll; view.draw();
    };
    img.onpointerup = img.onpointercancel = () => { if (last) { last = null; map.setOptions({ gestureHandling: 'greedy' }); save(); } };
  }
  function overlayPanel() {
    const o = p.overlay;
    setMode(o && !o.hidden ? 'overlay' : null);
    show(`<h3>Tracing overlay</h3>
      <label>Layout drawing (image or PDF)<input type="file" accept="image/*,application/pdf" data-ovfile></label>
      ${pdf && pdf.pages > 1 ? `<label>PDF page (1 to ${pdf.pages})<input type="number" min="1" max="${pdf.pages}" data-ovpage value="${pdf.page}"></label>` : ''}
      ${o ? `<p>Drag the drawing on the map to move it. Close this panel, then trace with "+ Draw shape".</p>
      <label>Opacity<input type="range" min="0.1" max="1" step="0.05" data-ov="opacity" value="${+o.opacity}"></label>
      <label>Rotation (degrees)<input type="range" min="-180" max="180" step="0.5" data-ov="rot" value="${+o.rot}"><input type="number" step="0.1" data-ov="rot" value="${+o.rot}"></label>
      <label>Width on the ground (m)<input type="number" min="1" step="1" data-ov="width" value="${+o.width}"></label>
      <button class="primary" data-a="ovmatch">Match two points</button>
      <div class="cta">${b('ovhere', 'Bring to centre')}${b('ovhide', o.hidden ? 'Show' : 'Hide')}<button class="danger" data-a="ovdel">Remove</button></div>` : '<p>Upload the layout plan or a government survey map, line it up with the satellite view, then trace plots over it.</p>'}`);
  }
  // Match two points: a corner on the drawing, then its true spot on the map, twice. The drawing is then moved, turned and scaled to fit.
  const STEPS = ['Click a clear corner on the drawing.', 'Now click where that corner really is on the satellite map.', 'Click a second corner on the drawing, far from the first.', 'Click where that second corner really is.'];
  // Align layout: same two-point match, but it moves and turns the project's own shapes (no scaling: the plan is in metres)
  const ALIGN = ['Click a corner of the layout. It snaps to plot corners.', 'Now click where that corner really is on the satellite map.', 'Click a second layout corner, far from the first.', 'Click where that second corner really is.'];
  const matchStep = () => show(`<h3>${mode === 'align2' ? 'Align layout' : 'Match two points'}</h3><p>Step ${pts.length + 1} of 4</p><p>${(mode === 'align2' ? ALIGN : STEPS)[pts.length]}</p><p><small>You can zoom and pan between clicks. Press Escape to cancel.</small></p>`);
  function matchClick(ll) {
    pts.push(ll);
    dot(ll, pts.length % 2 ? '#f2b33d' : '#7bd66b');
    if (pts.length < 4) return matchStep();
    if (mode === 'align2') return alignLayout();
    const o = p.overlay, kx = 111320 * Math.cos(o.center[0] * Math.PI / 180), xy = v => [(v[1] - o.center[1]) * kx, (v[0] - o.center[0]) * 110540]; // metres east and north of the drawing's centre
    const [a1, b1, a2, b2] = pts.map(xy), da = [a2[0] - a1[0], a2[1] - a1[1]], db = [b2[0] - b1[0], b2[1] - b1[1]];
    const s = Math.hypot(...db) / Math.hypot(...da), th = Math.atan2(db[1], db[0]) - Math.atan2(da[1], da[0]);
    if (!isFinite(s) || !s) { setMode(null); return show('<h3>Could not match</h3><p>Pick two corners that are far apart, then try again.</p>'); }
    // carry the drawing's centre through the same move, turn and scale that takes a1 to b1 and a2 to b2
    const nx = b1[0] + s * (-a1[0] * Math.cos(th) + a1[1] * Math.sin(th)), ny = b1[1] + s * (-a1[0] * Math.sin(th) - a1[1] * Math.cos(th));
    o.center = [o.center[0] + ny / 110540, o.center[1] + nx / kx];
    o.width = Math.round(o.width * s);
    o.rot = +(((+o.rot - th * 180 / Math.PI + 540) % 360) - 180).toFixed(2); // the screen turns clockwise, the ground angle counts anticlockwise
    save(); drawOverlay(); overlayPanel();
  }
  // Align layout by hand: drag any shape to move the whole layout, turn it with the slider. Reset goes back to how it
  // was when the panel opened. Changes are saved as they happen.
  let alignFrom = null, alignRot = 0;
  const shiftLayout = d => { p.plots.forEach(s => { s.pts = s.pts.map(v => [v[0] + d[0], v[1] + d[1]]); }); p.center = [p.center[0] + d[0], p.center[1] + d[1]]; };
  const turnLayout = deg => { // about the layout's middle, in metres
    const c0 = p.center, kx = 111320 * Math.cos(c0[0] * Math.PI / 180), r = deg * Math.PI / 180, c = Math.cos(r), sn = Math.sin(r);
    const t = v => { const x = (v[1] - c0[1]) * kx, y = (v[0] - c0[0]) * 110540; return [c0[0] + (sn * x + c * y) / 110540, c0[1] + (c * x - sn * y) / kx]; };
    p.plots.forEach(s => { s.pts = s.pts.map(t); });
  };
  const alignPanel = () => show(`<h3>Align layout</h3><p>Drag the layout on the map to move it. Turn it with the slider.</p>
    <label>Turn (degrees)<input type="range" min="-20" max="20" step="0.1" data-al="rot" value="${alignRot}"><input type="number" step="0.1" data-al="rot" value="${alignRot}"></label>
    <div class="cta">${b('align2', 'Match two points')}${b('alreset', 'Reset')}<button class="primary" data-a="close">Done</button></div>`);
  function alignLayout() { // turn about the first layout point, then move it onto its true spot
    const kx = 111320 * Math.cos(p.center[0] * Math.PI / 180), xy = v => [(v[1] - p.center[1]) * kx, (v[0] - p.center[0]) * 110540];
    const [a1, b1, a2, b2] = pts.map(xy), da = [a2[0] - a1[0], a2[1] - a1[1]], db = [b2[0] - b1[0], b2[1] - b1[1]];
    setMode(null);
    if (Math.hypot(...da) < 5) return show('<h3>Could not align</h3><p>Pick two layout corners that are far apart, then try again.</p>');
    const th = Math.atan2(db[1], db[0]) - Math.atan2(da[1], da[0]), c = Math.cos(th), sn = Math.sin(th), c0 = p.center;
    const move = v => { const [x, y] = xy(v), dx = x - a1[0], dy = y - a1[1]; return [c0[0] + (b1[1] + sn * dx + c * dy) / 110540, c0[1] + (b1[0] + c * dx - sn * dy) / kx]; };
    p.plots.forEach(s => { s.pts = s.pts.map(move); });
    p.center = move(p.center);
    save(); draw();
    show(`<h3>Layout aligned</h3><p>Moved ${Math.hypot(b1[0] - a1[0], b1[1] - a1[1]).toFixed(1)} m and turned ${(th * 180 / Math.PI).toFixed(2)}°.</p><p><small>The two lengths differed by ${Math.abs(Math.hypot(...db) - Math.hypot(...da)).toFixed(1)} m; the plan keeps its true size.</small></p>`);
  }
  let pdf = null; // the PDF picked in this visit: { file, pages, page }, so another page can be chosen without re-uploading
  async function loadOverlay(file, pageNo) {
    const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/', MAX = 2400;
    const old = pageNo && p.overlay; // switching page keeps where the drawing was placed
    try {
      let src;
      if (file.type === 'application/pdf') {
        // pinned files with cdnjs's published hashes, so a tampered copy is refused
        if (!window.pdfjsLib) await new Promise((ok, no) => {
          const s = Object.assign(document.createElement('script'), { src: PDFJS + 'pdf.min.js', crossOrigin: 'anonymous', referrerPolicy: 'no-referrer', integrity: 'sha512-q+4liFwdPC/bNdhUpZx6aXDx/h77yEQtn4I1slHydcbZK34nLaR3cAeYSJshoxIOq3mjEf7xJE8YWIUHMn+oCQ==', onload: ok, onerror: no });
          document.head.append(s);
        });
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc.startsWith('blob:')) { // the worker is loaded by URL inside pdf.js, so fetch it checked and hand over a local copy
          const r = await fetch(PDFJS + 'pdf.worker.min.js', { integrity: 'sha512-BbrZ76UNZq5BhH7LL7pn9A4TKQpQeNCHOo65/akfelcIBbcVvYWOFQKPXIrykE3qZxYjmDX573oa4Ywsc7rpTw==', mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
          pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(await r.blob());
        }
        const doc = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
        pdf = { file, pages: doc.numPages, page: Math.min(Math.max(1, Math.round(pageNo) || 1), doc.numPages) };
        const page = await doc.getPage(pdf.page);
        const v1 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: MAX / Math.max(v1.width, v1.height) });
        src = document.createElement('canvas'); src.width = vp.width; src.height = vp.height;
        await page.render({ canvasContext: src.getContext('2d'), viewport: vp }).promise;
      } else { pdf = null; src = new Image(); src.src = URL.createObjectURL(file); await src.decode(); }
      // shortcut: the drawing is shrunk to 2400px and kept in localStorage, move to file storage when a backend exists
      const k = Math.min(1, MAX / Math.max(src.width, src.height)), c = document.createElement('canvas');
      c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(src, 0, 0, c.width, c.height);
      const sw = ll2(map.getBounds().getSouthWest()), ne = ll2(map.getBounds().getNorthEast());
      p.overlay = { src: c.toDataURL('image/jpeg', .75), w: c.width, h: c.height, center: ll2(map.getCenter()), width: Math.round(dist(sw, [sw[0], ne[1]]) / 2), rot: 0, opacity: .6 };
      if (old) Object.assign(p.overlay, { center: old.center, width: old.width, rot: old.rot, opacity: old.opacity });
      save(); drawOverlay(); overlayPanel();
    } catch { show('<h3>Could not open that file</h3><p>Use a PNG, JPG or PDF. For CAD drawings, export a PDF first.</p>'); }
  }

  const polys = new Map(); // shape -> its Google polygon, for moving them all while one is dragged
  function draw() {
    layer.clear(); polys.clear();
    const mpp = 156543.03392 * Math.cos(p.center[0] * Math.PI / 180) / 2 ** map.getZoom(); // metres per screen pixel
    for (const pl of [...p.plots].sort((a, c) => isPlot(a) - isPlot(c))) { // roads and green areas go under plots
      const plot = isPlot(pl), on = !plot || match(pl);
      const fill = pl === sel ? '#2f86e0' : !plot ? KINDS[pl.kind][1] : edit ? st(pl)[1] : '#d9cfb8'; // viewer: plain beige plots (Spacer look), status on the card and in Filters
      const poly = layer.add(new G.Polygon({ paths: pl.pts.map(LL), strokeColor: plot ? '#f4efe4' : '#1b1d1c', strokeOpacity: plot ? .85 : 1, strokeWeight: 1, fillColor: fill, fillOpacity: on ? .9 : .2, clickable: plot || edit, zIndex: plot ? 2 : 1 }));
      // labels are sized from the shape, so they grow and shrink with the map and vanish when too small to read
      const side = Math.sqrt(area(pl.pts)) / mpp, f = plot ? Math.min(side * .3, 28) : Math.min(side * .13, 14);
      if (pl.no && f >= 6.500) {
        let rot = 0, longest = 0, at = centroid(pl.pts); // road and garden names run along the shape's longest side
        if (!plot) pl.pts.forEach((a, i) => { const c = pl.pts[(i + 1) % pl.pts.length], d = dist(a, c); if (d > longest) { longest = d; rot = angle(a, c); if (!inPoly(centroid(pl.pts), pl.pts)) at = inward(a, c, pl.pts) || at; } });
        layer.label(at, `<div class="c"><span style="font-size:${f.toFixed(1)}px;transform:rotate(${rot.toFixed(1)}deg)">${esc(pl.no)}${pl === sel && plot && !edit ? `<small>${fmtArea(+pl.area || 0)}</small>` : ''}</span></div>`,
          `no${plot ? '' : ' faint'}${pl === sel ? ' on' : ''}`);
      }
      poly.addListener('click', e => mode ? onClick(e) : select(pl)); // while drawing or measuring, the click goes on to the map
      polys.set(pl, poly);
      if (mode === 'align') { // drag one shape: the rest follow live, labels hide until it is dropped
        poly.setOptions({ draggable: true, clickable: true });
        const d = () => { const q = poly.getPath().getAt(0); return [q.lat() - pl.pts[0][0], q.lng() - pl.pts[0][1]]; };
        poly.addListener('drag', () => { const dd = d(); app.classList.add('dragging'); for (const [o, g] of polys) if (o !== pl) g.setPaths(o.pts.map(v => LL([v[0] + dd[0], v[1] + dd[1]]))); });
        poly.addListener('dragend', () => { shiftLayout(d()); app.classList.remove('dragging'); save(); draw(); });
      }
      poly.addListener('mousemove', onMove);
    }
    if (!sel || !view.getProjection()) return;
    // side lengths of the selected shape: a dashed line just outside each side, with the length beyond it
    const P = sel.pts.map(px), mid0 = { x: P.reduce((s, q) => s + q.x, 0) / P.length, y: P.reduce((s, q) => s + q.y, 0) / P.length };
    P.forEach((a, i) => {
      const j = (i + 1) % P.length, c = P[j], len = pd(a, c);
      if (len < 34) return; // too short on screen to label
      const mid = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 };
      let n = { x: (a.y - c.y) / len, y: (c.x - a.x) / len };
      if ((mid.x - mid0.x) * n.x + (mid.y - mid0.y) * n.y < 0) n = { x: -n.x, y: -n.y }; // point away from the middle of the shape
      const out = (q, k) => toLL({ x: q.x + n.x * k, y: q.y + n.y * k });
      layer.add(line([out(a, 6), out(c, 6)], dash('#fff', '7px')));
      layer.label(out(mid, 16), `<span style="transform:translate(-50%,-50%) rotate(${angle(sel.pts[i], sel.pts[j]).toFixed(1)}deg)">${fmtLen(dist(sel.pts[i], sel.pts[j]))}</span>`, 'dim');
    });
  }

  const contact = text => {
    const ph = String(p.phone).replace(/\D/g, '');
    return ph ? `<div class="cta"><a class="primary" target="_blank" rel="noopener" href="https://wa.me/${ph}?text=${encodeURIComponent(text)}">WhatsApp</a><a class="pill" href="tel:+${ph}">Call</a></div>` : '';
  };
  const field = (label, key, v, tag = 'input') => `<label>${label}${tag === 'input' ? `<input data-${key} value="${esc(v)}">` : `<textarea data-${key} rows="3">${esc(v)}</textarea>`}</label>`;
  const pick = (label, key, opts, cur) => `<label>${label}<select data-${key}>${opts.map(([k, n]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`;
  const unitSeg = () => `<div class="seg">${Object.entries(UNITS).map(([k, [n]]) => `<button data-a="unit" data-u="${k}" class="${k === unit ? 'on' : ''}">${n}</button>`).join('')}</div>`;

  function select(pl) {
    sel = pl; draw();
    if (edit) return show(`<h3>Edit shape</h3>
      ${pick('Type', 'pf="kind"', Object.entries(KINDS).map(([k, [n]]) => [k, n]), pl.kind || 'plot')}
      ${field('Number or label', 'pf="no"', pl.no)}
      ${pick('Status', 'pf="status"', Object.entries(STATUS).map(([k, [n]]) => [k, n]), pl.status)}
      ${field('Area (sq m)', 'pf="area"', pl.area)}${field('Price', 'pf="price"', pl.price)}${field('Note', 'pf="note"', pl.note, 'textarea')}
      <button class="danger" data-a="delplot">Delete shape</button>`);
    fit(pl.pts);
    show(`<h3>Plot <strong>${esc(pl.no)}</strong>${showStatus ? `<span class="chip" style="background:${st(pl)[1]}">${st(pl)[0]}</span>` : ''}</h3>
      <div><p class="big">${fmtArea(+pl.area || 0)}</p>${unit === 'sqm' ? '' : `<small>${fmtArea(+pl.area || 0, 'sqm')}</small>`}</div>${unitSeg()}
      <dl>${[['Price', pl.price], ['Note', pl.note]].filter(r => r[1]).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      ${contact(`I am interested in plot ${pl.no} at ${p.name}`)}`, 'slip');
  }

  const matchText = () => `Match: ${plots().filter(match).length} / ${plots().length}`;
  function filters() {
    const val = v => Number.isFinite(v) && v > 0 ? Math.round(v * UNITS[unit][1]) : '';
    show(`<h3>Filters</h3>${unitSeg()}
      <div class="pair"><label>Min area<input type="number" min="0" data-fa="min" value="${val(range.min)}"></label>
      <label>Max area<input type="number" min="0" data-fa="max" value="${val(range.max)}"></label></div>
      ${showStatus ? Object.entries(STATUS).map(([k, [n, c]]) => `<label class="row"><input type="checkbox" data-f="${k}" ${shown.has(k) ? 'checked' : ''}><i style="background:${c}"></i>${n}<small>${plots().filter(x => x.status === k).length}</small></label>`).join('') : ''}
      <p id="match">${matchText()}</p><button data-a="resetf">Reset</button>`, 'tl');
  }
  function share() {
    const incl = $('#incl')?.checked ?? true;
    const url = `${location.origin}${location.pathname}#/p/${p.id}?view=1${incl ? '' : '&status=0'}`;
    show(`<h3>Share</h3><div id="qr"></div>
      <label class="row"><input type="checkbox" id="incl" ${incl ? 'checked' : ''}>Include statuses</label>
      <p class="mono" id="link">${esc(url)}</p><button class="primary" data-a="copy">Copy link</button>
      <p><small>Projects are stored in this browser for now, so the link opens only here.</small></p>`, 'modal');
    if (window.QRCode) new QRCode($('#qr'), { text: url, width: 150, height: 150 });
  }

  // cursor pixel inside the map box, from the mouse event when there is one
  const evPx = e => { const d = e.domEvent; if (d && 'clientX' in d) { const r = $('#map').getBoundingClientRect(); return { x: d.clientX - r.left, y: d.clientY - r.top }; } return px(ll2(e.latLng)); };
  const seg = (a, c, d) => { // a measured side: solid line with its length
    marks.add(line([a, c], { strokeColor: '#fff', strokeWeight: 2.5 }));
    marks.label([(a[0] + c[0]) / 2, (a[1] + c[1]) / 2], `<span style="transform:translate(-50%,-50%) rotate(${angle(a, c).toFixed(1)}deg)">${fmtLen(d)}</span>`, 'dim');
  };
  function onClick(e) {
    if (mode === 'overlay' || !view.getProjection()) return;
    if (mode === 'match') return matchClick(ll2(e.latLng));
    if (mode === 'align') return; // dragging moves the layout; a plain click does nothing
    if (mode === 'align2') return matchClick(pts.length % 2 ? ll2(e.latLng) : snap(ll2(e.latLng), evPx(e)).ll); // layout points snap to corners
    if (!mode) { sel = null; draw(); hide(); return; }
    if (closed) { marks.clear(); pts = []; run = 0; closed = false; hide(); } // a finished loop: this click starts a new measurement
    const s = snap(ll2(e.latLng), evPx(e)), a = pts.at(-1), c = s.ll;
    band.setPath([]);
    if (s.close && mode === 'draw') return act.finish(); // clicking the first corner again finishes the shape
    if (s.close) { // ruler loop closed: add the last side, then stop and show perimeter and area
      const d = dist(a, c); run += d; closed = true; tip.hidden = mark.hidden = true;
      seg(a, c, d);
      return show(`<h3>Measurement</h3><div><p class="big">${fmtLen(run)}</p><small>around the loop</small></div><div><p class="big">${fmtArea(area(pts))}</p><small>inside the loop</small></div><p><small>Click the map to start a new measurement.</small></p>`);
    }
    pts.push(c);
    if (mode !== 'ruler') return temp.setPath(pts.map(LL));
    dot(c, '#fff');
    if (!a) return;
    const d = dist(a, c); run += d;
    seg(a, c, d);
  }
  function onMove(e) { // snap marker, dashed line from the last point, and the running total beside the cursor
    if ((mode !== 'ruler' && mode !== 'draw') || closed || !view.getProjection()) return;
    const c = evPx(e), s = snap(ll2(e.latLng), c), at = px(s.ll);
    mark.hidden = !s.kind; mark.className = s.kind || ''; mark.style.transform = `translate(${at.x}px, ${at.y}px)`;
    if (!pts.length) return;
    band.setPath([pts.at(-1), s.ll].map(LL));
    if (mode !== 'ruler') return;
    tip.hidden = false; tip.textContent = fmtLen(run + dist(pts.at(-1), s.ll));
    tip.style.transform = `translate(${c.x + 14}px, ${c.y - 30}px)`;
  }
  map.addListener('click', onClick);
  map.addListener('mousemove', onMove);
  let camNow = ''; // label sizes, angles and side marks depend on zoom, tilt and heading: redraw once the camera settles
  map.addListener('idle', () => { const c = [map.getZoom(), map.getTilt(), map.getHeading()].join(); if (c !== camNow) { camNow = c; draw(); } });
  const noLocation = () => show('<h3>Location unavailable</h3><p>Allow location access in your browser and try again.</p>');

  const act = {
    close() { hide(); const was = mode; if (['ruler', 'overlay', 'match', 'align', 'align2'].includes(mode)) setMode(null); if (was === 'align') draw(); },
    ovmatch() { setMode('match'); matchStep(); },
    align() { sel = null; alignFrom = JSON.stringify({ c: p.center, s: p.plots.map(x => x.pts) }); alignRot = 0; setMode('align'); draw(); alignPanel(); },
    align2() { setMode('align2'); draw(); matchStep(); },
    alreset() { const o = JSON.parse(alignFrom); p.center = o.c; p.plots.forEach((x, i) => { x.pts = o.s[i]; }); alignRot = 0; save(); draw(); alignPanel(); },
    overlay: overlayPanel,
    ovhere() { p.overlay.center = ll2(map.getCenter()); save(); drawOverlay(); },
    ovhide() { p.overlay.hidden = !p.overlay.hidden; save(); drawOverlay(); overlayPanel(); },
    ovdel() { if (confirm('Remove the tracing overlay? Shapes you have drawn stay.')) { delete p.overlay; save(); drawOverlay(); overlayPanel(); } },
    home() { map.setCenter(LL(p.center)); map.setZoom(p.zoom); },
    zin() { map.setZoom(map.getZoom() + 1); },
    zout() { map.setZoom(map.getZoom() - 1); },
    ruler() { hide(); setMode(mode === 'ruler' ? null : 'ruler'); },
    tilt() { ease('tilt', map.getTilt() > 0 ? 0 : 60); },
    north() { ease('heading', 0); },
    filters, share,
    resetf() { range.min = 0; range.max = Infinity; Object.keys(STATUS).forEach(k => shown.add(k)); draw(); filters(); },
    unit(el) { unit = el.dataset.u; if ($('#match')) { draw(); filters(); } else if (sel) select(sel); },
    async copy() { try { await navigator.clipboard.writeText($('#link').textContent); $('[data-a=copy]').textContent = 'Copied'; } catch { $('[data-a=copy]').textContent = 'Select the link above and copy it'; } },
    gps() {
      if (!navigator.geolocation) return noLocation();
      navigator.geolocation.getCurrentPosition(pos => {
        const c = [pos.coords.latitude, pos.coords.longitude];
        map.setCenter(LL(c)); map.setZoom(18); here.clear(); here.label(c, '<i class="dot me"></i>');
      }, noLocation);
    },
    info() { show(`${p.logo ? `<img src="${esc(p.logo)}" alt="">` : ''}<h3>${esc(p.name)}</h3><p>${esc(p.info) || 'No description yet.'}</p><p>${plots().length} plots</p>${contact(`I am interested in ${p.name}`)}<small>Powered by Whysquare</small>`, 'modal'); },
    gallery() { show('<h3>Gallery</h3>' + (p.gallery.length ? `<div class="shots">${p.gallery.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="" loading="lazy"></a>`).join('')}</div>` : '<p>No photos yet.</p>'), 'modal wide'); },
    draw() { sel = null; draw(); hide(); setMode('draw'); },
    cancel() { setMode(null); },
    finish() {
      if (pts.length < 3) return show('<h3>Not enough points</h3><p>Click at least three corners on the map, then press Finish shape.</p>');
      const pl = { id: uid(), kind: 'plot', no: String(plots().length + 1), status: 'available', area: Math.round(area(pts)), price: '', note: '', pts };
      p.plots.push(pl); save(); setMode(null); select(pl);
    },
    delplot() { if (sel && confirm(`Delete ${sel.no || 'this shape'}?`)) { p.plots = p.plots.filter(x => x !== sel); sel = null; save(); draw(); hide(); } },
    sethome() { p.center = ll2(map.getCenter()); p.zoom = map.getZoom(); save(); show('<h3>Home view saved</h3><p>The project now opens at this position and zoom.</p>'); },
    settings() {
      show(`<h3>Project settings</h3>${field('Name', 'sf="name"', p.name)}${field('Tagline', 'sf="tagline"', p.tagline)}
        <label>Logo (replaces the name on the map)<input type="file" accept="image/*" data-logo></label>${p.logo ? b('rmlogo', 'Remove logo') : ''}
        ${pick('Default unit', 'sf="unit"', Object.entries(UNITS).map(([k, [n]]) => [k, n]), unit)}
        ${field('Description', 'sf="info"', p.info, 'textarea')}${field('Phone with country code', 'sf="phone"', p.phone)}
        ${field('Photo links, one per line', 'sf="gallery"', p.gallery.join('\n'), 'textarea')}`);
    },
    rmlogo() { delete p.logo; save(); route(); },
    cad() {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([toDXF(p)], { type: 'application/dxf' }));
      a.download = `${p.name.replace(/[^\w]+/g, '-').toLowerCase()}-layout-metres.dxf`;
      a.click();
    },
  };
  app.onclick = e => { const a = e.target.closest('[data-a]'); if (a && act[a.dataset.a]) act[a.dataset.a](a); };
  app.oninput = e => {
    const t = e.target.dataset, v = e.target.value;
    if (e.target.id === 'incl') share();
    else if (t.al) { // turn by the change since the last value; saved on release, in onchange
      const v = Math.max(-20, Math.min(20, +e.target.value || 0)); turnLayout(v - alignRot); alignRot = v;
      app.querySelectorAll('[data-al]').forEach(i => { if (i !== e.target) i.value = v; });
      draw();
    }
    else if (t.ov && p.overlay) { // saved on release, in onchange, so dragging a slider stays smooth
      if (t.ov !== 'width' || +v > 0) p.overlay[t.ov] = +v;
      app.querySelectorAll(`[data-ov="${t.ov}"]`).forEach(i => { if (i !== e.target) i.value = v; });
      drawOverlay();
    }
    else if (t.f || t.fa) {
      if (t.f) e.target.checked ? shown.add(t.f) : shown.delete(t.f);
      else range[t.fa] = v === '' ? (t.fa === 'min' ? 0 : Infinity) : v / UNITS[unit][1];
      draw(); $('#match').textContent = matchText();
    } else if (t.pf && sel) { sel[t.pf] = v; save(); draw(); }
    else if (t.sf) {
      p[t.sf] = t.sf === 'gallery' ? v.split('\n').map(s => s.trim()).filter(s => /^https?:\/\//.test(s)) : v; save();
      if (t.sf === 'unit') unit = v;
      if ($('.top b')) { $('.top b').textContent = p.name; $('.top small').textContent = p.tagline; }
    }
  };
  app.onchange = e => { // logo: shrink to 360px wide so it fits in browser storage
    if (e.target.dataset.ov || e.target.dataset.al) return save();
    if (e.target.dataset.ovpage !== undefined) return pdf && loadOverlay(pdf.file, +e.target.value);
    if (e.target.dataset.ovfile !== undefined) return e.target.files[0] && loadOverlay(e.target.files[0]);
    const file = e.target.dataset.logo !== undefined && e.target.files[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'), k = Math.min(1, 360 / img.width);
      c.width = img.width * k; c.height = img.height * k;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      p.logo = c.toDataURL('image/png'); save(); route();
    };
    img.onerror = () => show('<h3>Could not read that image</h3><p>Try a PNG or JPG file.</p>');
    img.src = URL.createObjectURL(file);
  };
  app.onsubmit = e => {
    e.preventDefault();
    const f = new FormData(e.target);
    if (e.target.id === 'search') {
      const q = f.get('q').trim().toLowerCase(), pl = plots().find(x => String(x.no).toLowerCase() === q);
      if (!pl) return show(`<h3>No plot "${esc(q)}"</h3><p>Check the number and try again.</p>`);
      fit(pl.pts); select(pl);
    } else {
      const [la, ln] = f.get('ll').split(',').map(Number);
      if (Math.abs(la) <= 90 && Math.abs(ln) <= 180) { map.setCenter(LL([la, ln])); map.setZoom(17); }
      else show('<h3>Could not read that</h3><p>Type latitude and longitude like 18.6105, 73.9120</p>');
    }
  };
  draw();
  drawOverlay();
}

(async () => {
  let shared = null;
  try { const r = await fetch('data/projects.json', { cache: 'no-store' }); if (r.ok) shared = await r.json(); } catch {}
  if (hasData(shared) && (!hasData(db) || (shared.version || 0) > (db.version || 0))) {
    if (hasData(db)) try { localStorage.setItem(KEY + '-previous', JSON.stringify(db)); } catch {} // keep this browser's old copy, never silently lose edits
    db = shared;
  } else if (!hasData(db)) db = seed(); // no file and nothing saved: the built-in demo
  save();
  await new Promise(ok => { // Google Maps script; the dashboard still works if it fails to load
    if (window.google?.maps) return ok();
    window.gmapsReady = ok;
    document.head.append(Object.assign(document.createElement('script'), { src: `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GMAPS_KEY)}&v=weekly&loading=async&callback=gmapsReady`, async: true, onerror: ok }));
  });
  route();
})();
