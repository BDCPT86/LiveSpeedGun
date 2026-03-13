/* ═══════════════════════════════════════
   CRICKET SPEED GUN — app.js
   Navigation, session state, calibration,
   result screen, bowler assignment
═══════════════════════════════════════ */

/* ─────────────────────────────────────
   SESSION STATE
───────────────────────────────────── */
let _unit        = 'kph';
let _deliveries  = [];
window._sessionPitchDist = 20.12;
window._sessionFps       = 60;

/* ─────────────────────────────────────
   NAVIGATION
───────────────────────────────────── */
function goTo(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

/* ─────────────────────────────────────
   TOAST
───────────────────────────────────── */
let _toastTimer = null;
function toast(msg, isErr = false, dur = 2200) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = 'toast show' + (isErr ? ' err' : '');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), dur);
}

/* ─────────────────────────────────────
   SPEED CATEGORY
───────────────────────────────────── */
function cat(kph) {
  if (kph < 100) return { label: 'Slow',         cls: 'slow'    };
  if (kph < 120) return { label: 'Medium',        cls: 'medium'  };
  if (kph < 135) return { label: 'Fast Medium',   cls: 'fast'    };
  if (kph < 145) return { label: 'Fast',          cls: 'fast'    };
  return               { label: 'Express ⚡',     cls: 'extreme' };
}

/* ─────────────────────────────────────
   SETUP CONTROLS
───────────────────────────────────── */
function pickUnit(el) {
  _unit = el.dataset.unit;
  el.closest('.tog-row').querySelectorAll('.tog').forEach(t => t.classList.remove('on'));
  el.classList.add('on');
}

function pickFps(el) {
  window._sessionFps = parseInt(el.dataset.fps);
  el.closest('.tog-row').querySelectorAll('.tog').forEach(t => t.classList.remove('on'));
  el.classList.add('on');
}

function startSetup() {
  window._sessionPitchDist = parseFloat(document.getElementById('cfgDist').value) || 20.12;
  renderBowlersScreen();
  goTo('sBowlers');
}

/* ─────────────────────────────────────
   CALIBRATION
───────────────────────────────────── */
window._calibPts   = [null, null];
window._calibPhase = 0;
window._pxPerMetre = 0;

function resetCalibUI() {
  window._calibPts   = [null, null];
  window._calibPhase = 0;
  window._pxPerMetre = 0;

  document.getElementById('calibStepLbl').textContent  = 'Step 1 of 2';
  document.getElementById('calibInstr').innerHTML       = 'Tap the <strong>near stumps</strong> (bowling end)';
  document.getElementById('cpt1').classList.remove('set');
  document.getElementById('cpt2').classList.remove('set');
  document.getElementById('cptv1').textContent = '—';
  document.getElementById('cptv2').textContent = '—';

  const btn = document.getElementById('btnCalibDone');
  btn.style.opacity = '.35';
  btn.style.pointerEvents = 'none';
}

function resetCalib() {
  resetCalibUI();
  // Redraw just the base frame
  if (window._calibVideoEl) {
    const canvas = document.getElementById('calibCanvas');
    const ctx    = canvas.getContext('2d');
    const cp     = window._calibDrawParams;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(window._calibVideoEl, cp.dx, cp.dy, cp.dw, cp.dh);
  }
}

function onCalibTap(e) {
  if (window._calibPhase > 1) return;

  const canvas = document.getElementById('calibCanvas');
  const rect   = canvas.getBoundingClientRect();
  const x      = (e.clientX - rect.left) * (canvas.width  / rect.width);
  const y      = (e.clientY - rect.top)  * (canvas.height / rect.height);

  window._calibPts[window._calibPhase] = { x, y };
  drawCalibOverlay();

  if (window._calibPhase === 0) {
    document.getElementById('cpt1').classList.add('set');
    document.getElementById('cptv1').textContent = `${Math.round(x)}, ${Math.round(y)}`;
    document.getElementById('calibStepLbl').textContent = 'Step 2 of 2';
    document.getElementById('calibInstr').innerHTML = 'Now tap the <strong>far stumps</strong> (batting end)';
    window._calibPhase = 1;
  } else {
    document.getElementById('cpt2').classList.add('set');
    document.getElementById('cptv2').textContent = `${Math.round(x)}, ${Math.round(y)}`;
    document.getElementById('calibStepLbl').textContent = 'Done ✓';
    document.getElementById('calibInstr').textContent   = 'Tap "Done" to begin AI analysis';
    window._calibPhase = 2;
    const btn = document.getElementById('btnCalibDone');
    btn.style.opacity = '1';
    btn.style.pointerEvents = 'auto';
  }
}

function drawCalibOverlay() {
  const canvas = document.getElementById('calibCanvas');
  const ctx    = canvas.getContext('2d');
  const cp     = window._calibDrawParams;

  // Redraw base frame
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (window._calibVideoEl) ctx.drawImage(window._calibVideoEl, cp.dx, cp.dy, cp.dw, cp.dh);

  const p0 = window._calibPts[0];
  const p1 = window._calibPts[1];

  if (p0 && p1) {
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y);
    ctx.strokeStyle = 'rgba(240,165,0,.55)'; ctx.lineWidth = 2;
    ctx.setLineDash([7, 5]); ctx.stroke(); ctx.setLineDash([]);
    const mx = (p0.x + p1.x) / 2, my = (p0.y + p1.y) / 2;
    ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(mx - 44, my - 15, 88, 24);
    ctx.fillStyle = '#f0a500'; ctx.font = 'bold 13px Rajdhani,sans-serif';
    ctx.textAlign = 'center'; ctx.fillText(window._sessionPitchDist + 'm', mx, my + 2);
  }

  [p0, p1].forEach((pt, i) => {
    if (!pt) return;
    const col = i === 0 ? '#2dc653' : '#4cc9f0';
    const lbl = i === 0 ? 'NEAR' : 'FAR';
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pt.x - 16, pt.y); ctx.lineTo(pt.x + 16, pt.y);
    ctx.moveTo(pt.x, pt.y - 16); ctx.lineTo(pt.x, pt.y + 16);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(pt.x, pt.y, 20, 0, Math.PI * 2);
    ctx.strokeStyle = col; ctx.stroke();
    ctx.fillStyle = col + '22'; ctx.fill();
    ctx.fillStyle = col; ctx.font = 'bold 11px Rajdhani,sans-serif';
    ctx.textAlign = 'center'; ctx.fillText(lbl, pt.x, pt.y - 28);
  });
}

function finishCalib() {
  if (window._calibPhase < 2) return;
  const p0 = window._calibPts[0], p1 = window._calibPts[1];
  const dx = p1.x - p0.x, dy = p1.y - p0.y;
  window._pxPerMetre = Math.sqrt(dx * dx + dy * dy) / window._sessionPitchDist;
  // Start AI analysis
  runAnalysis();
}

/* ─────────────────────────────────────
   RESULT SCREEN
───────────────────────────────────── */
function showResult(data) {
  const { kph, mph, timeSec, dist, frameDiff, fps } = data;
  _deliveries.push({ kph, mph, timeSec, dist, timestamp: Date.now() });

  const c    = cat(kph);
  const disp = _unit === 'kph' ? kph : mph;

  document.getElementById('stampNum').textContent  = Math.round(disp);
  document.getElementById('stampNum').className    = 'stamp-num c-' + c.cls;
  document.getElementById('stampUnit').textContent = _unit.toUpperCase();
  document.getElementById('stampCat').textContent  = c.label;
  document.getElementById('stampCat').className    = 'stamp-cat c-' + c.cls;

  document.getElementById('rKph').textContent    = Math.round(kph);
  document.getElementById('rMph').textContent    = Math.round(mph);
  document.getElementById('rFrames').textContent = frameDiff;
  document.getElementById('rFps').textContent    = fps;

  drawResultHero(c);
  renderHistory();
  renderResultBowlerPicker();
  goTo('sResult');
}

function drawResultHero(c) {
  const cv   = document.getElementById('resultCanvas');
  const wrap = cv.parentElement;
  cv.width   = wrap.offsetWidth;
  cv.height  = wrap.offsetHeight;
  const ctx  = cv.getContext('2d');

  const cols = { slow:'#2dc653', medium:'#f0a500', fast:'#e63946', extreme:'#ff1744' };
  const col  = cols[c.cls];
  const g    = ctx.createRadialGradient(cv.width/2, cv.height/2, 0, cv.width/2, cv.height/2, cv.width * .7);
  g.addColorStop(0, col + '33'); g.addColorStop(1, 'transparent');
  ctx.fillStyle = g; ctx.fillRect(0, 0, cv.width, cv.height);
}

/* ─────────────────────────────────────
   SESSION HISTORY
───────────────────────────────────── */
function renderHistory() {
  const list = document.getElementById('histList');
  if (!_deliveries.length) {
    list.innerHTML = '<div style="padding:22px;text-align:center;font-size:11px;letter-spacing:3px;color:var(--dim);text-transform:uppercase">No deliveries yet</div>';
    return;
  }
  list.innerHTML = [..._deliveries].reverse().map((d, i) => {
    const n   = _deliveries.length - i;
    const c   = cat(d.kph);
    const spd = _unit === 'kph' ? d.kph : d.mph;
    return `<div class="hist-row">
      <div class="h-n">#${n}</div>
      <div class="h-c c-${c.cls}">${c.label}</div>
      <div class="h-s c-${c.cls}">${Math.round(spd)}</div>
      <div class="h-u">${_unit}</div>
    </div>`;
  }).join('');
}

function clearHistory() { _deliveries = []; renderHistory(); }

/* ─────────────────────────────────────
   BOWLER ASSIGNMENT ON RESULT SCREEN
───────────────────────────────────── */
function renderResultBowlerPicker() {
  const bowlers = bowlerGetAll();
  const picker  = document.getElementById('bowlerPicker');
  const hint    = document.getElementById('noBowlerHint');
  if (!bowlers.length) {
    picker.innerHTML = '';
    hint.style.display = 'flex';
    return;
  }
  hint.style.display = 'none';
  picker.innerHTML   = bowlers.map(b => `
    <div class="result-bowler-chip" onclick="assignDeliveryToBowler('${b.id}',this)">
      <div class="chip-avatar" style="${b.photo ? `background-image:url(${b.photo});background-size:cover` : ''}">
        ${!b.photo ? bowlerInitials(b.name) : ''}
      </div>
      <span>${b.name}</span>
    </div>`).join('');
}

function assignDeliveryToBowler(id, el) {
  const wasSelected = el.classList.contains('selected');
  document.querySelectorAll('.result-bowler-chip').forEach(c => c.classList.remove('selected'));
  if (!wasSelected) {
    el.classList.add('selected');
    const last = _deliveries[_deliveries.length - 1];
    if (last) { bowlerAddDelivery(id, last); toast('Delivery assigned ✓'); }
  }
}

function openAddBowlerFromResult() {
  const orig = window.submitAddBowler;
  window.submitAddBowler = function () {
    orig();
    window.submitAddBowler = orig;
    renderResultBowlerPicker();
  };
  openAddBowler();
}

/* ─────────────────────────────────────
   BOWLER PROFILE HELPERS (from HTML)
───────────────────────────────────── */
function confirmDeleteBowler() {
  const id = document.getElementById('sProfile').dataset.bowlerId;
  const b  = bowlerGetById(id);
  if (!b) return;
  if (!confirm(`Delete ${b.name}? All their delivery data will be lost.`)) return;
  bowlerDelete(id);
  renderBowlersScreen();
  goTo('sBowlers');
  toast(`${b.name} deleted`);
}

/* ─────────────────────────────────────
   INIT
───────────────────────────────────── */
goTo('sSetup');
