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
  document.getElementById('addBowlerName').value      = '';
  document.getElementById('addBowlerPreview').style.backgroundImage = '';
  document.getElementById('addBowlerPreview').innerHTML = '<span>+</span>';
  document.getElementById('addBowlerModal').classList.remove('hidden');
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
