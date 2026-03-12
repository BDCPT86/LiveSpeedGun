/* ═══════════════════════════════════════
   CRICKET SPEED GUN — bowlers.js
   Bowler profile management, persistence,
   stats calculation and photo capture
═══════════════════════════════════════ */

const STORAGE_KEY = 'speedgun-bowlers';

/* ─────────────────────────────────────
   PERSISTENCE
───────────────────────────────────── */
function bowlersLoad() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function bowlersSave(bowlers) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bowlers));
  } catch (e) {
    // localStorage full (likely due to base64 photos) — save without photos
    const slim = bowlers.map(b => ({ ...b, photo: null }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
    toast('Storage full — photos not saved', true);
  }
}

/* ─────────────────────────────────────
   CRUD
───────────────────────────────────── */
function bowlerCreate(name, type, photo = null) {
  const bowlers = bowlersLoad();
  const bowler  = {
    id:          crypto.randomUUID(),
    name:        name.trim(),
    type:        type,           // 'fast' | 'medium' | 'spin'
    photo:       photo,          // base64 data URL or null
    deliveries:  [],
    createdAt:   Date.now()
  };
  bowlers.push(bowler);
  bowlersSave(bowlers);
  return bowler;
}

function bowlerGetAll() {
  return bowlersLoad();
}

function bowlerGetById(id) {
  return bowlersLoad().find(b => b.id === id) || null;
}

function bowlerAddDelivery(id, deliveryData) {
  const bowlers = bowlersLoad();
  const idx     = bowlers.findIndex(b => b.id === id);
  if (idx === -1) return;
  bowlers[idx].deliveries.push({
    kph:       deliveryData.kph,
    mph:       deliveryData.mph,
    timeSec:   deliveryData.timeSec,
    dist:      deliveryData.dist,
    timestamp: Date.now()
  });
  bowlersSave(bowlers);
}

function bowlerDelete(id) {
  const bowlers = bowlersLoad().filter(b => b.id !== id);
  bowlersSave(bowlers);
}

function bowlerUpdatePhoto(id, photoDataUrl) {
  const bowlers = bowlersLoad();
  const idx     = bowlers.findIndex(b => b.id === id);
  if (idx === -1) return;
  bowlers[idx].photo = photoDataUrl;
  bowlersSave(bowlers);
}

/* ─────────────────────────────────────
   STATS
───────────────────────────────────── */
function bowlerStats(bowler) {
  const d = bowler.deliveries;
  if (!d.length) return { avg: null, max: null, min: null, count: 0 };
  const speeds = d.map(x => x.kph);
  return {
    count: d.length,
    avg:   speeds.reduce((a, b) => a + b, 0) / speeds.length,
    max:   Math.max(...speeds),
    min:   Math.min(...speeds)
  };
}

function bowlerInitials(name) {
  return name.trim().split(/\s+/)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');
}

/* ─────────────────────────────────────
   PHOTO CAPTURE
───────────────────────────────────── */
let photoCaptureStream   = null;
let photoCaptureCallback = null;
let photoCaptureTarget   = null; // bowler id to update, or null for new bowler

async function openPhotoCapture(bowlerId = null, onCapture = null) {
  photoCaptureTarget   = bowlerId;
  photoCaptureCallback = onCapture;

  try {
    photoCaptureStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 400 }, height: { ideal: 400 } },
      audio: false
    });
    document.getElementById('photoVideo').srcObject = photoCaptureStream;
    document.getElementById('photoModal').classList.remove('hidden');
  } catch (e) {
    toast('Camera access denied', true);
  }
}

function capturePhoto() {
  const video  = document.getElementById('photoVideo');
  const canvas = document.createElement('canvas');
  const size   = Math.min(video.videoWidth, video.videoHeight);
  canvas.width  = 200;
  canvas.height = 200;
  const ctx = canvas.getContext('2d');

  // Centre-crop to square
  const sx = (video.videoWidth  - size) / 2;
  const sy = (video.videoHeight - size) / 2;
  ctx.drawImage(video, sx, sy, size, size, 0, 0, 200, 200);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.7);

  closePhotoCapture();

  if (photoCaptureTarget) {
    bowlerUpdatePhoto(photoCaptureTarget, dataUrl);
  }
  if (photoCaptureCallback) {
    photoCaptureCallback(dataUrl);
  }
}

function closePhotoCapture() {
  if (photoCaptureStream) {
    photoCaptureStream.getTracks().forEach(t => t.stop());
    photoCaptureStream = null;
  }
  document.getElementById('photoModal').classList.add('hidden');
}

/* ─────────────────────────────────────
   BOWLERS SCREEN — render
───────────────────────────────────── */
let activeBowlerId = null; // currently selected bowler for this session

function setActiveBowler(id) {
  activeBowlerId = id;
}

function getActiveBowler() {
  return activeBowlerId ? bowlerGetById(activeBowlerId) : null;
}

function renderBowlersScreen() {
  const bowlers  = bowlerGetAll();
  const grid     = document.getElementById('bowlerGrid');
  const empty    = document.getElementById('bowlerEmpty');

  if (!bowlers.length) {
    grid.innerHTML  = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  grid.innerHTML = bowlers.map(b => {
    const s      = bowlerStats(b);
    const avgKph = s.avg ? Math.round(s.avg) : '—';
    const isActive = b.id === activeBowlerId;
    return `
      <div class="bowler-card ${isActive ? 'active' : ''}" onclick="openBowlerProfile('${b.id}')">
        <div class="bowler-avatar" style="${b.photo ? `background-image:url(${b.photo});background-size:cover` : ''}">
          ${!b.photo ? `<span>${bowlerInitials(b.name)}</span>` : ''}
        </div>
        <div class="bowler-card-info">
          <div class="bowler-card-name">${b.name}</div>
          <div class="bowler-card-type type-${b.type}">${b.type}</div>
        </div>
        <div class="bowler-card-avg">
          <div class="bowler-card-avg-val">${avgKph}</div>
          <div class="bowler-card-avg-lbl">Avg KPH</div>
        </div>
      </div>`;
  }).join('');
}

/* ─────────────────────────────────────
   BOWLER PROFILE SCREEN — render
───────────────────────────────────── */
function openBowlerProfile(id) {
  const b = bowlerGetById(id);
  if (!b) return;

  const s = bowlerStats(b);

  // Header
  const avatar = document.getElementById('profileAvatar');
  if (b.photo) {
    avatar.style.backgroundImage = `url(${b.photo})`;
    avatar.style.backgroundSize  = 'cover';
    avatar.innerHTML = '';
  } else {
    avatar.style.backgroundImage = '';
    avatar.innerHTML = `<span>${bowlerInitials(b.name)}</span>`;
  }

  document.getElementById('profileName').textContent = b.name;
  document.getElementById('profileType').textContent = b.type;
  document.getElementById('profileType').className   = `profile-type type-${b.type}`;

  // Stats
  document.getElementById('profileAvg').textContent   = s.avg   ? Math.round(s.avg)   : '—';
  document.getElementById('profileMax').textContent   = s.max   ? Math.round(s.max)   : '—';
  document.getElementById('profileMin').textContent   = s.min   ? Math.round(s.min)   : '—';
  document.getElementById('profileCount').textContent = s.count || '—';

  // Bar chart — last 10 deliveries
  renderDeliveryChart(b);

  // Recent deliveries list
  renderDeliveryList(b);

  // Store id on screen for action buttons
  document.getElementById('sProfile').dataset.bowlerId = id;

  goTo('sProfile');
}

function renderDeliveryChart(bowler) {
  const canvas = document.getElementById('deliveryChart');
  const ctx    = canvas.getContext('2d');
  const W      = canvas.width  = canvas.offsetWidth  || 300;
  const H      = canvas.height = canvas.offsetHeight || 100;
  ctx.clearRect(0, 0, W, H);

  const last10 = bowler.deliveries.slice(-10);
  if (!last10.length) {
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.font      = '11px Rajdhani';
    ctx.textAlign = 'center';
    ctx.fillText('No deliveries yet', W / 2, H / 2);
    return;
  }

  const maxKph = Math.max(...last10.map(d => d.kph));
  const minKph = Math.min(...last10.map(d => d.kph));
  const range  = maxKph - minKph || 1;
  const barW   = (W - 20) / last10.length;
  const padB   = 20;

  last10.forEach((d, i) => {
    const barH   = ((d.kph - minKph) / range) * (H - padB - 10) + 10;
    const x      = 10 + i * barW;
    const y      = H - padB - barH;
    const c      = cat(d.kph);
    const colors = { slow: '#2dc653', medium: '#f0a500', fast: '#e63946', extreme: '#ff1744' };

    // Bar
    ctx.fillStyle = colors[c.cls] + 'cc';
    ctx.beginPath();
    ctx.roundRect(x + 2, y, barW - 6, barH, 3);
    ctx.fill();

    // Value label
    ctx.fillStyle = colors[c.cls];
    ctx.font      = 'bold 10px Rajdhani';
    ctx.textAlign = 'center';
    ctx.fillText(Math.round(d.kph), x + barW / 2, y - 3);
  });

  // Axis label
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.font      = '9px Rajdhani';
  ctx.textAlign = 'left';
  ctx.fillText('Last 10 deliveries (KPH)', 10, H - 4);
}

function renderDeliveryList(bowler) {
  const list = document.getElementById('profileDeliveryList');
  if (!bowler.deliveries.length) {
    list.innerHTML = '<div class="profile-empty-list">No deliveries recorded</div>';
    return;
  }
  list.innerHTML = [...bowler.deliveries].reverse().slice(0, 20).map((d, i) => {
    const n   = bowler.deliveries.length - i;
    const c   = cat(d.kph);
    const dt  = new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `<div class="profile-delivery-row">
      <div class="h-n">#${n}</div>
      <div class="h-c c-${c.cls}">${c.label}</div>
      <div class="h-s c-${c.cls}">${Math.round(d.kph)} <span class="h-u">kph</span></div>
      <div class="profile-delivery-time">${dt}</div>
    </div>`;
  }).join('');
}

/* ─────────────────────────────────────
   ADD BOWLER MODAL
───────────────────────────────────── */
let newBowlerPhoto = null;

function openAddBowler() {
  newBowlerPhoto = null;
  document.getElementById('addBowlerName').value = '';
  // Reset type toggle to Fast
  document.querySelectorAll('.bowler-type-tog').forEach(t => t.classList.remove('on'));
  const fastTog = document.querySelector('.bowler-type-tog[data-type="fast"]');
  if (fastTog) fastTog.classList.add('on');
  document.getElementById('addBowlerModal').classList.remove('hidden');
  // Focus name input after a tick so keyboard appears
  setTimeout(() => document.getElementById('addBowlerName').focus(), 100);
}

function closeAddBowler() {
  document.getElementById('addBowlerModal').classList.add('hidden');
}

function addBowlerTakePhoto() {
  openPhotoCapture(null, (dataUrl) => {
    newBowlerPhoto = dataUrl;
    const preview  = document.getElementById('addBowlerPreview');
    preview.style.backgroundImage = `url(${dataUrl})`;
    preview.style.backgroundSize  = 'cover';
    preview.innerHTML = '';
  });
}

function submitAddBowler() {
  const name = document.getElementById('addBowlerName').value.trim();
  const type = document.querySelector('.bowler-type-tog.on')?.dataset.type || 'fast';
  if (!name) { toast('Enter a name', true); return; }
  const bowler = bowlerCreate(name, type, newBowlerPhoto);
  newBowlerPhoto = null;
  closeAddBowler();
  renderBowlersScreen();
  toast(`${bowler.name} added ✓`);
}

function pickBowlerType(el) {
  document.querySelectorAll('.bowler-type-tog').forEach(t => t.classList.remove('on'));
  el.classList.add('on');
}

/* ─────────────────────────────────────
   RESULT SCREEN — bowler assignment
───────────────────────────────────── */
function renderResultBowlerPicker(lastDelivery) {
  const bowlers  = bowlerGetAll();
  const picker   = document.getElementById('bowlerPicker');
  const noBowler = document.getElementById('noBowlerHint');

  if (!bowlers.length) {
    picker.innerHTML    = '';
    noBowler.style.display = 'block';
    return;
  }
  noBowler.style.display = 'none';

  picker.innerHTML = bowlers.map(b => {
    const isSelected = b.id === activeBowlerId;
    return `<div class="result-bowler-chip ${isSelected ? 'selected' : ''}"
      onclick="assignDeliveryToBowler('${b.id}', this)">
      <div class="chip-avatar" style="${b.photo ? `background-image:url(${b.photo});background-size:cover` : ''}">
        ${!b.photo ? bowlerInitials(b.name) : ''}
      </div>
      <span>${b.name}</span>
    </div>`;
  }).join('');
}

function assignDeliveryToBowler(id, el) {
  // Toggle selection
  const wasSelected = el.classList.contains('selected');
  document.querySelectorAll('.result-bowler-chip').forEach(c => c.classList.remove('selected'));

  if (!wasSelected) {
    el.classList.add('selected');
    activeBowlerId = id;

    // Add the last delivery to this bowler
    const last = deliveries[deliveries.length - 1];
    if (last) bowlerAddDelivery(id, last);
    toast('Delivery assigned ✓');
  } else {
    activeBowlerId = null;
  }
}

/* ═══════════════════════════════════════
   IMPORT / EXPORT
═══════════════════════════════════════ */

/* ─────────────────────────────────────
   EXPORT — download all bowlers as JSON
───────────────────────────────────── */
function exportBowlers() {
  const bowlers = bowlerGetAll();
  if (!bowlers.length) { toast('No bowlers to export', true); return; }

  const json = JSON.stringify(bowlers, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `speedgun-bowlers-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast(`Exported ${bowlers.length} bowler${bowlers.length > 1 ? 's' : ''} ✓`);
}

/* ─────────────────────────────────────
   CLEAR ALL
───────────────────────────────────── */
function confirmClearAllBowlers() {
  const bowlers = bowlerGetAll();
  if (!bowlers.length) { toast('No bowlers to clear', true); return; }
  if (!confirm(`Delete all ${bowlers.length} bowler${bowlers.length > 1 ? 's' : ''} and their data? This cannot be undone.`)) return;
  localStorage.removeItem(STORAGE_KEY);
  renderBowlersScreen();
  toast('All bowler data cleared');
}

/* ─────────────────────────────────────
   IMPORT — file parsing
───────────────────────────────────── */

// Valid bowling types — anything not in this list defaults to 'fast'
const VALID_TYPES = new Set(['fast', 'medium', 'spin']);

function normaliseType(raw) {
  if (!raw) return 'fast';
  const t = String(raw).trim().toLowerCase();
  // Accept common aliases
  if (t === 'pace' || t === 'express') return 'fast';
  if (t === 'med' || t === 'med-fast' || t === 'medium-fast') return 'medium';
  if (t === 'offbreak' || t === 'legbreak' || t === 'left-arm spin') return 'spin';
  return VALID_TYPES.has(t) ? t : 'fast';
}

function parseCsv(text) {
  const lines   = text.trim().split(/\r?\n/).filter(l => l.trim());
  const header  = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/['"]/g, ''));
  const nameIdx = header.indexOf('name');
  const typeIdx = header.indexOf('type');

  if (nameIdx === -1) throw new Error('CSV must have a "name" column');

  return lines.slice(1).map(line => {
    // Handle quoted values
    const cols = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g) || [];
    const clean = cols.map(c => c.trim().replace(/^"|"$/g, ''));
    const name  = clean[nameIdx]?.trim();
    const type  = normaliseType(clean[typeIdx]);
    return name ? { name, type } : null;
  }).filter(Boolean);
}

function parseJson(text) {
  const data = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error('JSON must be an array of bowler objects');
  return data.map(item => {
    const name = String(item.name || '').trim();
    const type = normaliseType(item.type);
    return name ? { name, type, deliveries: Array.isArray(item.deliveries) ? item.deliveries : [] } : null;
  }).filter(Boolean);
}

/* ─────────────────────────────────────
   IMPORT — state & flow
───────────────────────────────────── */

// Holds parsed data during the conflict resolution phase
let _importPending = {
  clean:     [],   // bowlers with no conflict — add immediately
  conflicts: []    // { incoming, existing } pairs needing resolution
};

// Per-conflict resolution choices: { [name]: 'skip' | 'overwrite' }
let _conflictChoices = {};

function handleImportFile(input) {
  const file = input.files[0];
  if (!file) return;
  // Reset input so re-selecting the same file fires the event again
  input.value = '';

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const text    = e.target.result;
      const isJson  = file.name.toLowerCase().endsWith('.json');
      const parsed  = isJson ? parseJson(text) : parseCsv(text);

      if (!parsed.length) { toast('No valid bowlers found in file', true); return; }

      // Split into clean vs conflicts
      const existing = bowlerGetAll();
      const existingNames = new Map(existing.map(b => [b.name.toLowerCase(), b]));

      _importPending.clean     = [];
      _importPending.conflicts = [];
      _conflictChoices         = {};

      parsed.forEach(incoming => {
        const match = existingNames.get(incoming.name.toLowerCase());
        if (match) {
          _importPending.conflicts.push({ incoming, existing: match });
          _conflictChoices[incoming.name] = 'skip'; // default
        } else {
          _importPending.clean.push(incoming);
        }
      });

      if (_importPending.conflicts.length > 0) {
        showConflictModal(parsed.length);
      } else {
        // No conflicts — import directly
        applyImport();
      }
    } catch (err) {
      toast('File error: ' + err.message, true, 4000);
    }
  };
  reader.readAsText(file);
}

function showConflictModal(total) {
  const conflicts = _importPending.conflicts;
  document.getElementById('importConflictDesc').textContent =
    `${total} bowler${total > 1 ? 's' : ''} found — ${conflicts.length} name conflict${conflicts.length > 1 ? 's' : ''}. Choose what to do:`;

  document.getElementById('conflictList').innerHTML = conflicts.map(({ incoming, existing }) => {
    const s = bowlerStats(existing);
    return `<div class="conflict-row" id="conflict-row-${CSS.escape(incoming.name)}">
      <div class="conflict-info">
        <div class="conflict-name">${incoming.name}</div>
        <div class="conflict-detail">
          Existing: <span class="type-${existing.type}">${existing.type}</span>
          ${s.count ? ` · ${s.count} deliveries · avg ${Math.round(s.avg)} kph` : ' · no deliveries'}
        </div>
        <div class="conflict-detail">
          Incoming: <span class="type-${incoming.type}">${incoming.type}</span>
        </div>
      </div>
      <div class="conflict-togs">
        <div class="tog conflict-tog on" data-name="${incoming.name}" data-action="skip"
          onclick="setConflictChoice('${incoming.name}','skip',this)">Skip</div>
        <div class="tog conflict-tog" data-name="${incoming.name}" data-action="overwrite"
          onclick="setConflictChoice('${incoming.name}','overwrite',this)">Overwrite</div>
      </div>
    </div>`;
  }).join('');

  document.getElementById('importConflictModal').classList.remove('hidden');
}

function setConflictChoice(name, action, el) {
  _conflictChoices[name] = action;
  const row = document.getElementById('conflict-row-' + CSS.escape(name));
  row.querySelectorAll('.conflict-tog').forEach(t => t.classList.remove('on'));
  el.classList.add('on');
}

function resolveAllConflicts(action) {
  _importPending.conflicts.forEach(({ incoming }) => {
    _conflictChoices[incoming.name] = action;
    const row = document.getElementById('conflict-row-' + CSS.escape(incoming.name));
    if (row) {
      row.querySelectorAll('.conflict-tog').forEach(t => t.classList.remove('on'));
      const target = row.querySelector(`[data-action="${action}"]`);
      if (target) target.classList.add('on');
    }
  });
}

function cancelImport() {
  _importPending = { clean: [], conflicts: [] };
  _conflictChoices = {};
  document.getElementById('importConflictModal').classList.add('hidden');
}

function confirmImport() {
  document.getElementById('importConflictModal').classList.add('hidden');
  applyImport();
}

function applyImport() {
  const bowlers     = bowlerGetAll();
  const nameMap     = new Map(bowlers.map(b => [b.name.toLowerCase(), b]));
  let added = 0, overwritten = 0, skipped = 0;

  // Add clean (no conflict) bowlers
  _importPending.clean.forEach(b => {
    bowlerCreate(b.name, b.type);
    added++;
  });

  // Apply conflict choices
  _importPending.conflicts.forEach(({ incoming }) => {
    const choice = _conflictChoices[incoming.name] || 'skip';
    if (choice === 'skip') {
      skipped++;
    } else {
      // Overwrite — update type, preserve existing delivery history
      const all = bowlerGetAll();
      const idx = all.findIndex(b => b.name.toLowerCase() === incoming.name.toLowerCase());
      if (idx !== -1) {
        all[idx].type = incoming.type;
        // If incoming has deliveries (from a JSON export roundtrip), merge them
        if (incoming.deliveries?.length) {
          all[idx].deliveries = incoming.deliveries;
        }
        bowlersSave(all);
      }
      overwritten++;
    }
  });

  // Summary toast
  const parts = [];
  if (added)       parts.push(`${added} added`);
  if (overwritten) parts.push(`${overwritten} overwritten`);
  if (skipped)     parts.push(`${skipped} skipped`);
  toast(parts.join(', ') + ' ✓', false, 3500);

  _importPending    = { clean: [], conflicts: [] };
  _conflictChoices  = {};

  renderBowlersScreen();
  goTo('sBowlers');
}
