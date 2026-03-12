/* ═══════════════════════════════════════
   CRICKET SPEED GUN — app.js
═══════════════════════════════════════ */

/* ─────────────────────────────────────
   STATE
───────────────────────────────────── */
let unit         = 'kph';
let pitchDist    = 20.12;
let motionThresh = 35;
let stream       = null;
let tfModel      = null;
let deliveries   = [];

// Calibration
let calibPts  = [null, null];
let calibPhase = 0;   // 0 = near stump, 1 = far stump, 2 = done
let pxPerMetre = 0;

// Ball colour tracking
let ballHSV  = { hue: 0, range: 30, satMin: 100 };  // red default
let ballMode = 'red';   // 'red' | 'white' | 'custom'

// Timing & detection
let tapPhase  = 0;      // 0 = idle, 1 = ball released, 2 = complete
let t1 = 0, t2 = 0;
let detMethod = 'none'; // 'tf' | 'blob' | 'motion' | 'manual'

// Animation frame handles
let rafDetect = null;

// Off-screen canvas for CV processing
let offCanvas = null;
let offCtx    = null;

// Frame diff
let prevFrameData = null;

// Debounce timestamps
let releaseDebounce = 0;
let impactDebounce  = 0;
let motionCooldown  = 0;

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
let toastTimer = null;
function toast(msg, isErr = false, dur = 2200) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show' + (isErr ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), dur);
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
   SETUP SCREEN — controls
───────────────────────────────────── */
function pickUnit(el) {
  unit = el.dataset.unit;
  el.closest('.tog-row').querySelectorAll('.tog').forEach(t => t.classList.remove('on'));
  el.classList.add('on');
}

function toggleUnit() {
  unit = unit === 'kph' ? 'mph' : 'kph';
  toast(unit.toUpperCase());
}

function pickSens(el) {
  motionThresh = parseInt(el.dataset.sens);
  el.closest('.tog-row').querySelectorAll('.tog').forEach(t => t.classList.remove('on'));
  el.classList.add('on');
}

/* ─────────────────────────────────────
   SESSION INIT — load TF + open camera
───────────────────────────────────── */
async function initSession() {
  pitchDist = parseFloat(document.getElementById('cfgDist').value) || 20.12;

  const btn    = document.getElementById('btnStart');
  const loader = document.getElementById('tfLoader');
  const bar    = document.getElementById('tfBar');
  const lbl    = document.getElementById('tfLbl');

  btn.disabled    = true;
  btn.textContent = 'Loading…';
  loader.style.display = 'block';

  // Animate progress bar while TF loads
  let pct = 0;
  const pulse = setInterval(() => {
    pct = Math.min(pct + 2, 88);
    bar.style.width = pct + '%';
  }, 80);

  try {
    lbl.textContent = 'Loading TensorFlow…';
    await tf.ready();
    lbl.textContent = 'Loading COCO-SSD model…';
    tfModel = await cocoSsd.load({ base: 'mobilenet_v2' });
    clearInterval(pulse);
    bar.style.width = '100%';
    lbl.textContent = '✓ Model ready';
  } catch (e) {
    clearInterval(pulse);
    lbl.textContent = '⚠ Model failed — using motion detection only';
    tfModel = null;
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width:     { ideal: 1280 },
        height:    { ideal: 720  },
        frameRate: { ideal: 60   }
      },
      audio: false
    });

    document.getElementById('calibVideo').srcObject = stream;
    document.getElementById('recVideo').srcObject   = stream;

    setupCalibCanvas();

    setTimeout(() => {
      loader.style.display = 'none';
      btn.disabled    = false;
      btn.textContent = 'Load & Open Camera';
    }, 800);

    goTo('sCalib');
  } catch (e) {
    toast('Camera access denied', true);
    btn.disabled    = false;
    btn.textContent = 'Load & Open Camera';
    loader.style.display = 'none';
  }
}

/* ─────────────────────────────────────
   CALIBRATION
───────────────────────────────────── */
function setupCalibCanvas() {
  const cv = document.getElementById('calibCanvas');
  cv.width  = window.innerWidth;
  cv.height = window.innerHeight;
  cv.addEventListener('pointerdown', onCalibTap);
}

function onCalibTap(e) {
  if (calibPhase > 1) return;

  const cv   = document.getElementById('calibCanvas');
  const rect = cv.getBoundingClientRect();
  const x    = e.clientX - rect.left;
  const y    = e.clientY - rect.top;

  calibPts[calibPhase] = { x, y };
  drawCalibOverlay();

  if (calibPhase === 0) {
    document.getElementById('cpt1').classList.add('set');
    document.getElementById('cptv1').textContent = `${Math.round(x)}, ${Math.round(y)}`;
    document.getElementById('calibStepLbl').textContent = 'Step 2 of 3';
    document.getElementById('calibInstr').innerHTML = 'Now tap the <strong>far stumps</strong>';
    calibPhase = 1;
  } else {
    document.getElementById('cpt2').classList.add('set');
    document.getElementById('cptv2').textContent = `${Math.round(x)}, ${Math.round(y)}`;
    document.getElementById('calibStepLbl').textContent = 'Step 3 of 3';
    document.getElementById('calibInstr').textContent   = 'Confirm ball colour below, then start';
    calibPhase = 2;
    document.getElementById('calibGoBtn').classList.add('ready');
  }
}

function drawCalibOverlay() {
  const cv  = document.getElementById('calibCanvas');
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);

  const p0 = calibPts[0];
  const p1 = calibPts[1];

  // Dashed line between the two points
  if (p0 && p1) {
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.strokeStyle = 'rgba(240,165,0,.45)';
    ctx.lineWidth   = 2;
    ctx.setLineDash([7, 5]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Midpoint label
    const mx = (p0.x + p1.x) / 2;
    const my = (p0.y + p1.y) / 2;
    ctx.fillStyle = 'rgba(0,0,0,.65)';
    ctx.fillRect(mx - 42, my - 15, 84, 24);
    ctx.fillStyle    = '#f0a500';
    ctx.font         = 'bold 13px Rajdhani';
    ctx.textAlign    = 'center';
    ctx.fillText(pitchDist + 'm', mx, my + 2);
  }

  // Crosshairs for each calibration point
  [p0, p1].forEach((pt, i) => {
    if (!pt) return;
    const col = i === 0 ? '#2dc653' : '#4cc9f0';
    const lbl = i === 0 ? 'NEAR'    : 'FAR';

    ctx.strokeStyle = col;
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(pt.x - 16, pt.y); ctx.lineTo(pt.x + 16, pt.y);
    ctx.moveTo(pt.x, pt.y - 16); ctx.lineTo(pt.x, pt.y + 16);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 20, 0, Math.PI * 2);
    ctx.strokeStyle = col; ctx.stroke();
    ctx.fillStyle   = col + '22'; ctx.fill();

    ctx.fillStyle  = col;
    ctx.font       = 'bold 11px Rajdhani';
    ctx.textAlign  = 'center';
    ctx.fillText(lbl, pt.x, pt.y - 28);
  });
}

/* ─────────────────────────────────────
   BALL COLOUR SELECTION
───────────────────────────────────── */
function selectBallColour(mode, el) {
  ballMode = mode;
  document.querySelectorAll('.ball-swatch').forEach(s => s.classList.remove('selected'));
  el.classList.add('selected');

  if (mode === 'red') {
    ballHSV = { hue: 0, range: 25, satMin: 120 };
    document.getElementById('ballColourHint').textContent = 'Red ball selected';
  } else {
    ballHSV = { hue: 0, range: 180, satMin: 0, lightnessMin: 200 };
    document.getElementById('ballColourHint').textContent = 'White ball selected (high brightness)';
  }
}

function sampleCustomColour(el) {
  const video = document.getElementById('calibVideo');
  const tmp   = document.createElement('canvas');
  tmp.width   = video.videoWidth;
  tmp.height  = video.videoHeight;
  tmp.getContext('2d').drawImage(video, 0, 0);

  const cx = Math.floor(tmp.width  / 2);
  const cy = Math.floor(tmp.height / 2);
  const px = tmp.getContext('2d').getImageData(cx - 10, cy - 10, 20, 20).data;

  let r = 0, g = 0, b = 0;
  const n = px.length / 4;
  for (let i = 0; i < px.length; i += 4) { r += px[i]; g += px[i+1]; b += px[i+2]; }
  r /= n; g /= n; b /= n;

  const hsv = rgbToHsv(r, g, b);
  ballHSV   = { hue: Math.round(hsv.h * 360), range: 30, satMin: 80 };
  ballMode  = 'custom';

  el.style.background = `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
  el.classList.add('selected');
  document.querySelectorAll('.ball-swatch').forEach(s => { if (s !== el) s.classList.remove('selected'); });
  document.getElementById('ballColourHint').textContent = 'Custom colour sampled from centre';
  toast('Ball colour sampled ✓');
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min  = Math.min(r, g, b);
  const d    = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;

  if (d !== 0) {
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6;               break;
      case b: h = ((r - g) / d + 4) / 6;               break;
    }
  }
  return { h, s, v };
}

/* ─────────────────────────────────────
   FINISH CALIBRATION
───────────────────────────────────── */
function finishCalib() {
  if (calibPhase < 2) return;

  const dx = calibPts[1].x - calibPts[0].x;
  const dy = calibPts[1].y - calibPts[0].y;
  pxPerMetre = Math.sqrt(dx * dx + dy * dy) / pitchDist;

  // Build off-screen processing canvas
  const video   = document.getElementById('recVideo');
  offCanvas     = document.createElement('canvas');
  offCanvas.width  = Math.min(video.videoWidth  || 640, 640);
  offCanvas.height = Math.min(video.videoHeight || 360, 360);
  offCtx = offCanvas.getContext('2d', { willReadFrequently: true });

  resetDelivery();
  goTo('sRecord');
  requestAnimationFrame(detectionLoop);
}

/* ─────────────────────────────────────
   DETECTION LOOP
───────────────────────────────────── */
async function detectionLoop() {
  const video = document.getElementById('recVideo');
  if (!video.readyState || video.readyState < 2) {
    rafDetect = requestAnimationFrame(detectionLoop);
    return;
  }

  const W = offCanvas.width;
  const H = offCanvas.height;
  offCtx.drawImage(video, 0, 0, W, H);
  const frame = offCtx.getImageData(0, 0, W, H);

  // ── Layer 1: TensorFlow COCO-SSD ──
  let tfFound = false;
  if (tfModel) {
    try {
      const preds = await tfModel.detect(offCanvas);
      const ball  = preds.find(p => p.class === 'sports ball' && p.score > 0.45);
      if (ball) {
        tfFound = true;
        const scaleX = window.innerWidth  / W;
        const scaleY = window.innerHeight / H;
        const cx = (ball.bbox[0] + ball.bbox[2] / 2) * scaleX;
        const cy = (ball.bbox[1] + ball.bbox[3] / 2) * scaleY;
        updateTrackRing(cx, cy, ball.bbox[2] * scaleX, ball.bbox[3] * scaleY, 'tf-ring');
        setDetBadge('tf', 'TF · Sports Ball');
        if (tapPhase === 0) autoTriggerRelease('tf');
        else if (tapPhase === 1) checkImpact(cx, cy);
      }
    } catch (e) { /* TF errors mid-loop — ignore */ }
  }

  // ── Layer 2: Colour blob ──
  if (!tfFound) {
    const blob = findColourBlob(frame, W, H);
    if (blob) {
      const scaleX = window.innerWidth  / W;
      const scaleY = window.innerHeight / H;
      updateTrackRing(blob.cx * scaleX, blob.cy * scaleY, blob.r * 2 * scaleX, blob.r * 2 * scaleY, 'blob-ring');
      setDetBadge('blob', 'Colour Track');
      if (tapPhase === 0) autoTriggerRelease('blob');
      else if (tapPhase === 1) checkImpact(blob.cx * scaleX, blob.cy * scaleY);
    } else if (prevFrameData) {
      // ── Layer 3: Motion spike ──
      const motionVal = calcMotion(frame, prevFrameData, W, H);
      if (motionVal > motionThresh * 3 && Date.now() > motionCooldown) {
        setDetBadge('motion', 'Motion Spike');
        const centroid = motionCentroid(frame, prevFrameData, W, H, motionThresh);
        if (centroid) {
          updateTrackRing(
            centroid.x * (window.innerWidth  / W),
            centroid.y * (window.innerHeight / H),
            30, 30, 'motion-ring'
          );
        }
        if (tapPhase === 0) autoTriggerRelease('motion');
      } else if (motionVal < motionThresh && tapPhase === 0) {
        hideTrackRing();
        setDetBadge('none', 'Watching…');
      }
    }
  }

  prevFrameData = frame;
  drawRecOverlay();
  rafDetect = requestAnimationFrame(detectionLoop);
}

/* ─────────────────────────────────────
   COLOUR BLOB DETECTION
───────────────────────────────────── */
function findColourBlob(frame, W, H) {
  const data = frame.data;
  let sumX = 0, sumY = 0, count = 0;
  const step = 3;

  for (let y = 0; y < H; y += step) {
    for (let x = 0; x < W; x += step) {
      const i = (y * W + x) * 4;
      if (matchesBallColour(data[i], data[i+1], data[i+2])) {
        sumX += x; sumY += y; count++;
      }
    }
  }

  if (count < 8) return null;
  return { cx: sumX / count, cy: sumY / count, r: Math.sqrt(count) * step * 0.5 };
}

function matchesBallColour(r, g, b) {
  if (ballMode === 'white') {
    return r > 200 && g > 200 && b > 200 && Math.max(r, g, b) - Math.min(r, g, b) < 40;
  }
  const hsv  = rgbToHsv(r, g, b);
  const hDeg = hsv.h * 360;
  const sat  = hsv.s * 255;
  if (sat < ballHSV.satMin) return false;
  let diff = Math.abs(hDeg - ballHSV.hue);
  if (diff > 180) diff = 360 - diff;
  return diff < ballHSV.range;
}

/* ─────────────────────────────────────
   MOTION DETECTION
───────────────────────────────────── */
function calcMotion(curr, prev, W, H) {
  const a = curr.data, b = prev.data;
  let total = 0, n = 0;
  for (let i = 0; i < a.length; i += 16) {
    total += Math.abs(a[i] - b[i]) + Math.abs(a[i+1] - b[i+1]) + Math.abs(a[i+2] - b[i+2]);
    n++;
  }
  return total / n;
}

function motionCentroid(curr, prev, W, H, thresh) {
  const a = curr.data, b = prev.data;
  let sx = 0, sy = 0, cnt = 0;
  for (let y = 0; y < H; y += 4) {
    for (let x = 0; x < W; x += 4) {
      const i = (y * W + x) * 4;
      const d = Math.abs(a[i]-b[i]) + Math.abs(a[i+1]-b[i+1]) + Math.abs(a[i+2]-b[i+2]);
      if (d > thresh * 2) { sx += x; sy += y; cnt++; }
    }
  }
  return cnt > 4 ? { x: sx / cnt, y: sy / cnt } : null;
}

/* ─────────────────────────────────────
   TRACKING RING UI
───────────────────────────────────── */
function updateTrackRing(x, y, w, h, ringClass) {
  const ring = document.getElementById('trackRing');
  ring.style.display = 'block';
  ring.style.left    = x + 'px';
  ring.style.top     = y + 'px';
  ring.style.width   = Math.max(w, 28) + 'px';
  ring.style.height  = Math.max(h, 28) + 'px';
  ring.className     = 'track-ring ' + ringClass;
}

function hideTrackRing() {
  document.getElementById('trackRing').style.display = 'none';
}

/* ─────────────────────────────────────
   DETECTION BADGE
───────────────────────────────────── */
function setDetBadge(type, label) {
  const el = document.getElementById('detBadge');
  el.textContent = label;
  el.className   = 'det-badge ' + type;
}

/* ─────────────────────────────────────
   RECORD SCREEN OVERLAY
───────────────────────────────────── */
function drawRecOverlay() {
  const cv = document.getElementById('recCanvas');
  if (cv.width !== window.innerWidth) {
    cv.width  = window.innerWidth;
    cv.height = window.innerHeight;
  }
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);

  if (calibPts[0] && calibPts[1]) {
    ctx.beginPath();
    ctx.moveTo(calibPts[0].x, calibPts[0].y);
    ctx.lineTo(calibPts[1].x, calibPts[1].y);
    ctx.strokeStyle = 'rgba(240,165,0,.2)';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/* ─────────────────────────────────────
   AUTO TIMING
───────────────────────────────────── */
function autoTriggerRelease(method) {
  if (tapPhase !== 0) return;
  if (Date.now() < releaseDebounce) return;
  releaseDebounce = Date.now() + 800;

  t1        = performance.now();
  tapPhase  = 1;
  detMethod = method;
  motionCooldown = Date.now() + 500;

  document.getElementById('stateLbl').textContent  = 'Timing…';
  document.getElementById('stateHint').textContent = 'Auto-detected release — tap impact if needed';
  document.getElementById('tapBtnLbl').textContent = 'HIT!';
  document.getElementById('tapBtn').classList.add('phase1');
  document.getElementById('autoInd').classList.add('show');
  setTimeout(() => document.getElementById('autoInd').classList.remove('show'), 1500);

  // Safety reset — if no impact within 2.5s, start over
  setTimeout(() => { if (tapPhase === 1) resetDelivery(); }, 2500);
}

function checkImpact(x, y) {
  if (!calibPts[1] || tapPhase !== 1) return;
  if (Date.now() < impactDebounce) return;

  const farX = calibPts[1].x;
  const farY = calibPts[1].y;
  const dist = Math.sqrt((x - farX) ** 2 + (y - farY) ** 2);

  if (dist < pxPerMetre * 3) {
    impactDebounce = Date.now() + 1000;
    autoTriggerImpact();
  }
}

function autoTriggerImpact() {
  if (tapPhase !== 1) return;
  t2       = performance.now();
  tapPhase = 2;
  const elapsed = (t2 - t1) / 1000;
  if (elapsed < 0.1 || elapsed > 3) { resetDelivery(); return; }
  finishDelivery(elapsed);
}

/* ─────────────────────────────────────
   MANUAL TAP
───────────────────────────────────── */
function manualTap() {
  if (tapPhase === 0) {
    t1              = performance.now();
    tapPhase        = 1;
    detMethod       = 'manual';
    releaseDebounce = Date.now() + 500;

    document.getElementById('stateLbl').textContent  = 'Timing…';
    document.getElementById('stateHint').textContent = 'Tap again on impact';
    document.getElementById('tapBtnLbl').textContent = 'HIT!';
    document.getElementById('tapBtn').classList.add('phase1');
    toast('⏱ Timer started');

  } else if (tapPhase === 1) {
    t2       = performance.now();
    tapPhase = 2;
    const elapsed = (t2 - t1) / 1000;
    if (elapsed < 0.05) { toast('Too fast — try again', true); resetDelivery(); return; }
    finishDelivery(elapsed);
  }
}

/* ─────────────────────────────────────
   FINISH DELIVERY & SHOW RESULT
───────────────────────────────────── */
function finishDelivery(timeSec) {
  cancelAnimationFrame(rafDetect);
  rafDetect = null;

  const mps = pitchDist / timeSec;
  const kph = mps * 3.6;
  const mph = kph * 0.621371;
  const c   = cat(kph);

  deliveries.push({ kph, mph, timeSec, dist: pitchDist });

  // Populate result screen
  const disp = unit === 'kph' ? kph : mph;
  document.getElementById('stampNum').textContent  = Math.round(disp);
  document.getElementById('stampNum').className    = 'stamp-num c-' + c.cls;
  document.getElementById('stampUnit').textContent = unit.toUpperCase();
  document.getElementById('stampCat').textContent  = c.label;
  document.getElementById('stampCat').className    = 'stamp-cat c-' + c.cls;

  document.getElementById('rKph').textContent  = Math.round(kph);
  document.getElementById('rMph').textContent  = Math.round(mph);
  document.getElementById('rMs').textContent   = Math.round(timeSec * 1000);
  document.getElementById('rDist').textContent = pitchDist.toFixed(2);

  drawResultHero(c);
  renderHistory();
  goTo('sResult');
}

function drawResultHero(c) {
  const cv   = document.getElementById('resultCanvas');
  const wrap = cv.parentElement;
  cv.width   = wrap.offsetWidth;
  cv.height  = wrap.offsetHeight;
  const ctx  = cv.getContext('2d');

  const cols = { slow: '#2dc653', medium: '#f0a500', fast: '#e63946', extreme: '#ff1744' };
  const col  = cols[c.cls];

  const g = ctx.createRadialGradient(cv.width/2, cv.height/2, 0, cv.width/2, cv.height/2, cv.width * .7);
  g.addColorStop(0, col + '22');
  g.addColorStop(1, 'transparent');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cv.width, cv.height);

  // Draw calibration reference line
  if (calibPts[0] && calibPts[1]) {
    const sx = cv.width  / window.innerWidth;
    const sy = cv.height / window.innerHeight;
    ctx.beginPath();
    ctx.moveTo(calibPts[0].x * sx, calibPts[0].y * sy);
    ctx.lineTo(calibPts[1].x * sx, calibPts[1].y * sy);
    ctx.strokeStyle = col + '66';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/* ─────────────────────────────────────
   RESET DELIVERY STATE
───────────────────────────────────── */
function resetDelivery() {
  tapPhase      = 0;
  t1 = t2       = 0;
  detMethod     = 'none';
  prevFrameData = null;

  hideTrackRing();
  document.getElementById('stateLbl').textContent  = 'Ready';
  document.getElementById('stateHint').textContent = 'Auto-detection watching for delivery…';
  document.getElementById('tapBtnLbl').textContent = 'TAP';
  document.getElementById('tapBtn').classList.remove('phase1');
  document.getElementById('autoInd').classList.remove('show');
  setDetBadge('none', 'Watching…');
}

function nextDelivery() {
  resetDelivery();
  goTo('sRecord');
  rafDetect = requestAnimationFrame(detectionLoop);
}

/* ─────────────────────────────────────
   DELIVERY HISTORY
───────────────────────────────────── */
function renderHistory() {
  const list = document.getElementById('histList');
  if (!deliveries.length) {
    list.innerHTML = '<div style="padding:22px;text-align:center;font-size:11px;letter-spacing:3px;color:var(--dim);text-transform:uppercase">No deliveries yet</div>';
    return;
  }
  list.innerHTML = [...deliveries].reverse().map((d, i) => {
    const n   = deliveries.length - i;
    const c   = cat(d.kph);
    const spd = unit === 'kph' ? d.kph : d.mph;
    return `<div class="hist-row">
      <div class="h-n">#${n}</div>
      <div class="h-c c-${c.cls}">${c.label}</div>
      <div class="h-s c-${c.cls}">${Math.round(spd)}</div>
      <div class="h-u">${unit}</div>
    </div>`;
  }).join('');
}

function clearHistory() {
  deliveries = [];
  renderHistory();
}

/* ─────────────────────────────────────
   MANUAL ENTRY MODAL
───────────────────────────────────── */
function openManual()  { document.getElementById('manModal').classList.remove('hidden'); }
function closeManual() { document.getElementById('manModal').classList.add('hidden'); }

function submitManual() {
  const m = parseFloat(document.getElementById('manMin').value) || 0;
  const s = parseFloat(document.getElementById('manSec').value) || 0;
  const t = m * 60 + s;
  if (t <= 0) { toast('Enter a valid time', true); return; }
  closeManual();
  tapPhase  = 2;
  detMethod = 'manual';
  finishDelivery(t);
}

/* ─────────────────────────────────────
   KEYBOARD SHORTCUT (desktop testing)
───────────────────────────────────── */
document.addEventListener('keydown', e => {
  if (e.code === 'Space' && !document.getElementById('sRecord').classList.contains('hidden')) {
    e.preventDefault();
    manualTap();
  }
});

/* ─────────────────────────────────────
   INIT
───────────────────────────────────── */
goTo('sSetup');
