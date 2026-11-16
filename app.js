// shortcut: all data lives in this browser's localStorage, move to a backend with logins when other people must see or edit projects
const KEY = 'whysquare-plots-v1';
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
// a browser with no saved projects starts from data/projects.json (the shared projects), else the built-in demo
const firstLoad = !Array.isArray(db?.workspaces);
const save = () => {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch { alert('Could not save: this browser\'s storage is full. Export a backup, then remove a logo or some plots.'); }
};
const nav = h => { if (location.hash === h) route(); else location.hash = h; };

let map = null, onEsc = null;
document.addEventListener('keydown', e => { if (e.key === 'Escape' && onEsc) onEsc(); });

function route() {
  if (map) { map.stop(); map.remove(); map = null; } // stop() first: removing mid-zoom throws inside Leaflet
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
    ${b('overlay', 'Tracing overlay')}${b('settings', 'Project settings')}${b('sethome', 'Set home view')}${b('cad', 'Export CAD')}
    <form id="goto"><input name="ll" placeholder="lat, lng" aria-label="Go to latitude, longitude"><button>Go</button></form></div>` : ''}
  <div class="tools">${rb('zin', 'Zoom in')}${rb('zout', 'Zoom out')}${rb('ruler', 'Ruler')}${rb('home', 'Home view')}${rb('filters', 'Filters')}${rb('share', 'Share')}</div>
  <div class="dock"><form id="search">${ico('search')}<input name="q" type="search" list="nos" placeholder="Search plot no." aria-label="Search plot number">
      <datalist id="nos">${plots().map(x => `<option value="${esc(x.no)}">`).join('')}</datalist></form>
    ${pb('gps', 'GPS')}${pb('gallery', 'Gallery')}${pb('info', 'Info')}
    <a class="pill" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${p.center[0]},${p.center[1]}">${ico('locate')}Locate</a></div>
  <dialog id="panel" aria-labelledby="panel-title"></dialog><div id="tip" hidden></div><div id="snap" hidden></div>
  ${edit ? '' : `<div class="splash">${p.logo ? `<img class="mine" src="${esc(p.logo)}" alt="">` : `<h2>${esc(p.name)}</h2>`}
    <div><img src="whysquare_logo.png" alt=""><b>Whysquare</b><small>Automate. Innovate. Elevate</small></div><p>Tip: tap a plot to see its size and sides.</p></div>`}
  <div class="badge"><img src="whysquare_logo.png" alt="Whysquare"><small>Automate. Innovate. Elevate</small></div>`;

  map = L.map('map', { zoomControl: false, doubleClickZoom: false }).setView(p.center, p.zoom);
  const tiles = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 18, maxZoom: 21, attribution: 'Imagery &copy;2026 Esri, Maxar, Earthstar Geographics, GIS User Community | <a href="https://www.esri.com/en-us/legal/terms/full-master-agreement" target="_blank" rel="noopener">Terms</a>' }).addTo(map);
  map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>'); // drop the default flag icon
  const splash = $('.splash'); // loading screen: goes once the imagery is in, or after 3s on a slow connection
  if (splash) { const done = () => { splash.classList.add('gone'); setTimeout(() => splash.remove(), 400); }; tiles.once('load', done); setTimeout(done, 3000); }
  const layer = L.layerGroup().addTo(map);
  const temp = L.polyline([], { color: '#fff', dashArray: '6 6' }).addTo(map);
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
  const marks = L.layerGroup().addTo(map); // ruler dots, segments and their lengths
  const band = L.polyline([], { color: '#fff', weight: 1.5, dashArray: '6 6', interactive: false }).addTo(map); // follows the cursor
  const tip = $('#tip'), mark = $('#snap');
  let run = 0, closed = false; // closed: the ruler loop was finished, so the next click starts a new measurement
  const setMode = m => { mode = m; pts = []; run = 0; closed = false; temp.setLatLngs([]); band.setLatLngs([]); marks.clearLayers(); tip.hidden = mark.hidden = true; app.dataset.mode = m || ''; };
  // Ruler and drawing snap to the nearest shape corner within 12px, else the nearest edge within 8px
  function snap(e) {
    const c = e.containerPoint || map.latLngToContainerPoint(e.latlng);
    if (pts.length > 2 && !closed && map.latLngToContainerPoint(pts[0]).distanceTo(c) < 12) return { ll: pts[0], kind: 'corner', close: true }; // back at the start: close the loop
    let best = null, bd = 12;
    for (const s of p.plots) for (const v of s.pts) { const d = map.latLngToContainerPoint(v).distanceTo(c); if (d < bd) { bd = d; best = v; } }
    if (best) return { ll: best, kind: 'corner' };
    bd = 8;
    for (const s of p.plots) s.pts.forEach((a, i) => {
      const q = L.LineUtil.closestPointOnSegment(c, map.latLngToContainerPoint(a), map.latLngToContainerPoint(s.pts[(i + 1) % s.pts.length])), d = q.distanceTo(c);
      if (d < bd) { bd = d; best = q; }
    });
    if (!best) return { ll: [e.latlng.lat, e.latlng.lng] };
    const ll = map.containerPointToLatLng(best);
    return { ll: [ll.lat, ll.lng], kind: 'edge' };
  }
  // Screen angle of a side, kept upright so text along it never reads upside down
  const angle = (a, c) => {
    const pa = map.latLngToContainerPoint(a), pc = map.latLngToContainerPoint(c);
    const d = Math.atan2(pc.y - pa.y, pc.x - pa.x) * 180 / Math.PI;
    return d > 90 ? d - 180 : d < -90 ? d + 180 : d;
  };
  setMode(null);
  onEsc = () => { setMode(null); hide(); };

  // Tracing overlay: a layout drawing laid on the map, editor only. Sits under the plots.
  map.createPane('trace').style.zIndex = 350;
  let ov = null;
  const ovBounds = o => {
    const half = o.width * Math.hypot(o.w, o.h) / o.w / 2; // half side, in metres, of the square that holds the drawing at any rotation
    const dLat = half / 110540, dLng = half / (111320 * Math.cos(o.center[0] * Math.PI / 180));
    return [[o.center[0] - dLat, o.center[1] - dLng], [o.center[0] + dLat, o.center[1] + dLng]];
  };
  function drawOverlay() {
    if (ov) { ov.remove(); ov = null; }
    const o = p.overlay;
    if (!edit || !o || o.hidden) return;
    const NS = 'http://www.w3.org/2000/svg', D = Math.hypot(o.w, o.h);
    const svg = document.createElementNS(NS, 'svg'), img = document.createElementNS(NS, 'image');
    svg.setAttribute('viewBox', `0 0 ${D} ${D}`);
    Object.entries({ href: o.src, x: (D - o.w) / 2, y: (D - o.h) / 2, width: o.w, height: o.h, transform: `rotate(${+o.rot || 0} ${D / 2} ${D / 2})` }).forEach(([k, v]) => img.setAttribute(k, v));
    svg.append(img);
    ov = L.svgOverlay(svg, ovBounds(o), { pane: 'trace', opacity: o.opacity, className: 'ov' }).addTo(map);
    let last = null; // drag the drawing to move it, only while the overlay panel is open
    img.onmousedown = e => { if (mode === 'overlay') e.stopPropagation(); };
    img.onpointerdown = e => { if (mode !== 'overlay') return; img.setPointerCapture(e.pointerId); last = map.mouseEventToLatLng(e); map.dragging.disable(); };
    img.onpointermove = e => {
      if (!last) return;
      const ll = map.mouseEventToLatLng(e);
      o.center = [o.center[0] + ll.lat - last.lat, o.center[1] + ll.lng - last.lng]; last = ll; ov.setBounds(ovBounds(o));
    };
    img.onpointerup = img.onpointercancel = () => { if (last) { last = null; map.dragging.enable(); save(); } };
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
  const matchStep = () => show(`<h3>Match two points</h3><p>Step ${pts.length + 1} of 4</p><p>${STEPS[pts.length]}</p><p><small>You can zoom and pan between clicks. Press Escape to cancel.</small></p>`);
  function matchClick(ll) {
    pts.push(ll);
    L.circleMarker(ll, { radius: 5, color: '#fff', fillColor: pts.length % 2 ? '#f2b33d' : '#7bd66b', fillOpacity: 1, interactive: false }).addTo(marks);
    if (pts.length < 4) return matchStep();
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
      const bb = map.getBounds(), ctr = map.getCenter();
      p.overlay = { src: c.toDataURL('image/jpeg', .75), w: c.width, h: c.height, center: [ctr.lat, ctr.lng], width: Math.round(map.distance(bb.getSouthWest(), bb.getSouthEast()) / 2), rot: 0, opacity: .6 };
      if (old) Object.assign(p.overlay, { center: old.center, width: old.width, rot: old.rot, opacity: old.opacity });
      save(); drawOverlay(); overlayPanel();
    } catch { show('<h3>Could not open that file</h3><p>Use a PNG, JPG or PDF. For CAD drawings, export a PDF first.</p>'); }
  }

  function draw() {
    layer.clearLayers();
    const mpp = 156543.03392 * Math.cos(p.center[0] * Math.PI / 180) / 2 ** map.getZoom(); // metres per screen pixel
    for (const pl of [...p.plots].sort((a, c) => isPlot(a) - isPlot(c))) { // roads and green areas go under plots
      const plot = isPlot(pl), on = !plot || match(pl);
      const fill = pl === sel ? '#2f86e0' : !plot ? KINDS[pl.kind][1] : showStatus ? st(pl)[1] : '#d9cfb8';
      const poly = L.polygon(pl.pts, { color: '#1b1d1c', weight: 1, fillColor: fill, fillOpacity: on ? .9 : .2, interactive: plot || edit }).addTo(layer);
      // labels are sized from the shape, so they grow and shrink with the map and vanish when too small to read
      const side = Math.sqrt(area(pl.pts)) / mpp, f = plot ? Math.min(side * .3, 34) : Math.min(side * .13, 14);
      if (pl.no && f >= 6.500) {
        let rot = 0, longest = 0; // road and garden names run along the shape's longest side
        if (!plot) pl.pts.forEach((a, i) => { const c = pl.pts[(i + 1) % pl.pts.length], d = map.distance(a, c); if (d > longest) { longest = d; rot = angle(a, c); } });
        poly.bindTooltip(`<span style="font-size:${f.toFixed(1)}px;transform:rotate(${rot.toFixed(1)}deg)">${esc(pl.no)}${pl === sel && plot && !edit ? `<small>${fmtArea(+pl.area || 0)}</small>` : ''}</span>`,
          { permanent: true, direction: 'center', className: `no${plot ? '' : ' faint'}${pl === sel ? ' on' : ''}` });
      }
      poly.on('click', e => { if (!mode) { L.DomEvent.stop(e); select(pl); } }); // while drawing, the click falls through to the map
    }
    if (!sel) return;
    // side lengths of the selected shape: a dashed line just outside each side, with the length beyond it
    const P = sel.pts.map(v => map.latLngToContainerPoint(v)), mid0 = P.reduce((s, q) => s.add(q), L.point(0, 0)).divideBy(P.length);
    P.forEach((a, i) => {
      const j = (i + 1) % P.length, c = P[j], len = a.distanceTo(c);
      if (len < 34) return; // too short on screen to label
      const mid = a.add(c).divideBy(2);
      let n = L.point(a.y - c.y, c.x - a.x).divideBy(len);
      if ((mid.x - mid0.x) * n.x + (mid.y - mid0.y) * n.y < 0) n = n.multiplyBy(-1); // point away from the middle of the shape
      const out = (q, k) => map.containerPointToLatLng(q.add(n.multiplyBy(k)));
      L.polyline([out(a, 6), out(c, 6)], { color: '#fff', weight: 1, dashArray: '3 4', interactive: false }).addTo(layer);
      L.marker(out(mid, 16), { interactive: false, icon: L.divIcon({ className: 'dim', html: `<span style="transform:translate(-50%,-50%) rotate(${angle(sel.pts[i], sel.pts[j]).toFixed(1)}deg)">${fmtLen(map.distance(sel.pts[i], sel.pts[j]))}</span>`, iconSize: [0, 0] }) }).addTo(layer);
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
    map.fitBounds(L.latLngBounds(pl.pts), { maxZoom: 19, padding: [140, 140] });
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

  map.on('click', e => {
    if (mode === 'overlay') return;
    if (mode === 'match') return matchClick([e.latlng.lat, e.latlng.lng]);
    if (!mode) { sel = null; draw(); hide(); return; }
    if (closed) { marks.clearLayers(); pts = []; run = 0; closed = false; hide(); } // a finished loop: this click starts a new measurement
    const s = snap(e), a = pts.at(-1), c = s.ll;
    band.setLatLngs([]);
    if (s.close && mode === 'draw') return act.finish(); // clicking the first corner again finishes the shape
    if (s.close) { // ruler loop closed: add the last side, then stop and show perimeter and area
      const d = map.distance(a, c); run += d; closed = true; tip.hidden = mark.hidden = true;
      L.polyline([a, c], { color: '#fff', weight: 2.5, interactive: false }).addTo(marks);
      L.marker([(a[0] + c[0]) / 2, (a[1] + c[1]) / 2], { interactive: false, icon: L.divIcon({ className: 'dim', html: `<span style="transform:translate(-50%,-50%) rotate(${angle(a, c).toFixed(1)}deg)">${fmtLen(d)}</span>`, iconSize: [0, 0] }) }).addTo(marks);
      return show(`<h3>Measurement</h3><div><p class="big">${fmtLen(run)}</p><small>around the loop</small></div><div><p class="big">${fmtArea(area(pts))}</p><small>inside the loop</small></div><p><small>Click the map to start a new measurement.</small></p>`);
    }
    pts.push(c);
    if (mode !== 'ruler') return temp.setLatLngs(pts);
    L.circleMarker(c, { radius: 5, color: '#fff', fillColor: '#fff', fillOpacity: 1, interactive: false }).addTo(marks);
    if (!a) return;
    const d = map.distance(a, c); run += d;
    L.polyline([a, c], { color: '#fff', weight: 2.5, interactive: false }).addTo(marks);
    L.marker([(a[0] + c[0]) / 2, (a[1] + c[1]) / 2], { interactive: false, icon: L.divIcon({ className: 'dim', html: `<span style="transform:translate(-50%,-50%) rotate(${angle(a, c).toFixed(1)}deg)">${fmtLen(d)}</span>`, iconSize: [0, 0] }) }).addTo(marks);
  });
  map.on('mousemove', e => { // snap marker, dashed line from the last point, and the running total beside the cursor
    if ((mode !== 'ruler' && mode !== 'draw') || closed) return;
    const s = snap(e), at = map.latLngToContainerPoint(s.ll);
    mark.hidden = !s.kind; mark.className = s.kind || ''; mark.style.transform = `translate(${at.x}px, ${at.y}px)`;
    if (!pts.length) return;
    band.setLatLngs([pts.at(-1), s.ll]);
    if (mode !== 'ruler') return;
    tip.hidden = false; tip.textContent = fmtLen(run + map.distance(pts.at(-1), s.ll));
    tip.style.transform = `translate(${e.containerPoint.x + 14}px, ${e.containerPoint.y - 30}px)`;
  });
  map.on('zoomend', draw); // label sizes and angles depend on zoom
  map.on('locationfound', e => L.circleMarker(e.latlng, { radius: 7, color: '#fff', fillColor: '#3b82f6', fillOpacity: 1 }).addTo(map));
  map.on('locationerror', () => show('<h3>Location unavailable</h3><p>Allow location access in your browser and try again.</p>'));

  const act = {
    close() { hide(); if (mode === 'ruler' || mode === 'overlay' || mode === 'match') setMode(null); },
    ovmatch() { setMode('match'); matchStep(); },
    overlay: overlayPanel,
    ovhere() { const c = map.getCenter(); p.overlay.center = [c.lat, c.lng]; save(); drawOverlay(); },
    ovhide() { p.overlay.hidden = !p.overlay.hidden; save(); drawOverlay(); overlayPanel(); },
    ovdel() { if (confirm('Remove the tracing overlay? Shapes you have drawn stay.')) { delete p.overlay; save(); drawOverlay(); overlayPanel(); } },
    home() { map.setView(p.center, p.zoom); },
    zin() { map.zoomIn(); },
    zout() { map.zoomOut(); },
    ruler() { hide(); setMode(mode === 'ruler' ? null : 'ruler'); },
    filters, share,
    resetf() { range.min = 0; range.max = Infinity; Object.keys(STATUS).forEach(k => shown.add(k)); draw(); filters(); },
    unit(el) { unit = el.dataset.u; if ($('#match')) { draw(); filters(); } else if (sel) select(sel); },
    async copy() { try { await navigator.clipboard.writeText($('#link').textContent); $('[data-a=copy]').textContent = 'Copied'; } catch { $('[data-a=copy]').textContent = 'Select the link above and copy it'; } },
    gps() { map.locate({ setView: true, maxZoom: 18 }); },
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
    sethome() { const c = map.getCenter(); p.center = [c.lat, c.lng]; p.zoom = map.getZoom(); save(); show('<h3>Home view saved</h3><p>The project now opens at this position and zoom.</p>'); },
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
    if (e.target.dataset.ov) return save();
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
      map.fitBounds(L.latLngBounds(pl.pts), { maxZoom: 19, padding: [140, 140] }); select(pl);
    } else {
      const [la, ln] = f.get('ll').split(',').map(Number);
      if (Math.abs(la) <= 90 && Math.abs(ln) <= 180) map.setView([la, ln], 17);
      else show('<h3>Could not read that</h3><p>Type latitude and longitude like 18.6105, 73.9120</p>');
    }
  };
  draw();
  drawOverlay();
}

(async () => {
  if (firstLoad) {
    db = null;
    try { const r = await fetch('data/projects.json', { cache: 'no-store' }); if (r.ok) db = await r.json(); } catch {}
    if (!Array.isArray(db?.workspaces)) db = seed(); // file missing or unreadable: fall back to the demo
    save();
  }
  route();
})();
