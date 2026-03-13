/* ═══════════════════════════════════════
   CRICKET SPEED GUN — review.js
   Thumbnail strip UI, frame selection,
   speed calculation from confirmed frames
═══════════════════════════════════════ */

let _frames         = [];   // Array<{canvas, frameIndex, timeMs}>
let _aiResult       = null; // raw result from analyser.js or null
let _releaseIdx     = null; // index into _frames array (not frameIndex!)
let _impactIdx      = null;
let _selectedIdx    = 0;    // currently previewed frame
let _assignMode     = null; // 'release' | 'impact' | null

/* ─────────────────────────────────────
   INIT — called from analyser.js
───────────────────────────────────── */
function initReviewScreen(frames, aiResult) {
  _frames      = frames;
  _aiResult    = aiResult;
  _assignMode  = null;

  // Map AI frame indices to our frames array indices
  if (aiResult) {
    _releaseIdx = closestFrameArrayIdx(aiResult.releaseFrame);
    _impactIdx  = closestFrameArrayIdx(aiResult.impactFrame);
  } else {
    // No AI — default to first quarter / third quarter as placeholders
    _releaseIdx = Math.floor(frames.length * 0.25);
    _impactIdx  = Math.floor(frames.length * 0.65);
  }

  _selectedIdx = _releaseIdx;

  buildThumbStrip();
  renderPreview(_selectedIdx);
  renderAiSummary();
}

/* ─────────────────────────────────────
   THUMBNAIL STRIP
───────────────────────────────────── */
function buildThumbStrip() {
  const strip = document.getElementById('thumbStrip');
  strip.innerHTML = '';

  // Every 5th frame as thumbnails (or every frame if small set)
  const step = _frames.length > 20 ? 5 : 1;

  _frames.forEach((f, i) => {
    if (i % step !== 0 && i !== _frames.length - 1) return;

    const item   = document.createElement('div');
    item.className = 'thumb-item';
    item.dataset.idx = i;

    const img    = document.createElement('canvas');
    img.className = 'thumb-img';
    img.width    = 56;
    img.height   = 42;
    img.getContext('2d').drawImage(f.canvas, 0, 0, 56, 42);

    const lbl    = document.createElement('div');
    lbl.className = 'thumb-num';
    lbl.textContent = f.frameIndex;

    item.appendChild(img);
    item.appendChild(lbl);
    item.onclick = () => selectThumb(i);
    strip.appendChild(item);
  });

  refreshThumbHighlights();

  // Scroll to release frame
  scrollThumbToIdx(_releaseIdx);
}

function selectThumb(arrayIdx) {
  _selectedIdx = arrayIdx;
  renderPreview(arrayIdx);
  refreshThumbHighlights();
}

function refreshThumbHighlights() {
  document.querySelectorAll('.thumb-item').forEach(el => {
    const i = parseInt(el.dataset.idx);
    el.classList.toggle('selected',    i === _selectedIdx);
    el.classList.toggle('is-release',  i === _releaseIdx);
    el.classList.toggle('is-impact',   i === _impactIdx);
  });
}

function scrollThumbToIdx(arrayIdx) {
  const strip = document.getElementById('thumbStrip');
  const item  = strip.querySelector(`[data-idx="${arrayIdx}"]`);
  if (item) item.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
}

/* ─────────────────────────────────────
   MAIN PREVIEW CANVAS
───────────────────────────────────── */
function renderPreview(arrayIdx) {
  const frame  = _frames[arrayIdx];
  if (!frame) return;

  const canvas = document.getElementById('reviewCanvas');
  const wrap   = canvas.parentElement;
  canvas.width  = wrap.offsetWidth  || 360;
  canvas.height = wrap.offsetHeight || 220;

  const ctx  = canvas.getContext('2d');
  const W    = canvas.width, H = canvas.height;

  // Letterbox
  const fw   = frame.canvas.width;
  const fh   = frame.canvas.height;
  const scale = Math.min(W / fw, H / fh);
  const dw = fw * scale, dh = fh * scale;
  const dx = (W - dw) / 2,  dy = (H - dh) / 2;

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(frame.canvas, dx, dy, dw, dh);

  // Tint overlay for release/impact
  if (arrayIdx === _releaseIdx) {
    ctx.fillStyle = 'rgba(45,198,83,0.12)';
    ctx.fillRect(0, 0, W, H);
    drawFrameLabel(ctx, W, H, 'RELEASE', '#2dc653');
  } else if (arrayIdx === _impactIdx) {
    ctx.fillStyle = 'rgba(230,57,70,0.12)';
    ctx.fillRect(0, 0, W, H);
    drawFrameLabel(ctx, W, H, 'IMPACT', '#e63946');
  }

  // Draw calibration line if available
  drawCalibLine(ctx, dx, dy, dw, dh, fw, fh);

  // Frame badge
  document.getElementById('reviewFrameBadge').textContent = `Frame ${frame.frameIndex}`;
}

function drawFrameLabel(ctx, W, H, text, colour) {
  ctx.font      = 'bold 14px Rajdhani, sans-serif';
  ctx.fillStyle = colour;
  ctx.textAlign = 'left';
  ctx.fillText(text, 10, 22);
}

function drawCalibLine(ctx, dx, dy, dw, dh, fw, fh) {
  const pts = window._calibPts;
  if (!pts || !pts[0] || !pts[1]) return;

  // calibPts are in canvas-coordinate space of the calibration screen
  // We need to convert back through the calibration draw params
  const cp = window._calibDrawParams;
  if (!cp) return;

  const toFrameX = x => (x - cp.dx) / cp.dw * cp.vw;
  const toFrameY = y => (y - cp.dy) / cp.dh * cp.vh;

  const x0 = dx + (toFrameX(pts[0].x) / fw) * dw;
  const y0 = dy + (toFrameY(pts[0].y) / fh) * dh;
  const x1 = dx + (toFrameX(pts[1].x) / fw) * dw;
  const y1 = dy + (toFrameY(pts[1].y) / fh) * dh;

  ctx.beginPath();
  ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
  ctx.strokeStyle = 'rgba(240,165,0,.5)';
  ctx.lineWidth   = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
}

/* ─────────────────────────────────────
   AI SUMMARY BAR
───────────────────────────────────── */
function renderAiSummary() {
  const el = document.getElementById('reviewAiSummary');
  if (!_aiResult) {
    el.innerHTML = '<span style="color:var(--dim)">No AI result — select release and impact frames manually</span>';
    return;
  }
  const conf = Math.round((_aiResult.confidence || 0) * 100);
  const confColour = conf >= 70 ? 'var(--green)' : conf >= 40 ? 'var(--amber)' : 'var(--red)';
  el.innerHTML = `<strong style="color:${confColour}">${conf}% confidence</strong> &mdash; ${_aiResult.notes || 'AI analysis complete'}`;
}

/* ─────────────────────────────────────
   FRAME ASSIGNMENT
───────────────────────────────────── */
function assignFrame(type) {
  if (type === 'release') {
    _releaseIdx = _selectedIdx;
    // If release is now after impact, push impact forward
    if (_impactIdx !== null && _releaseIdx >= _impactIdx) {
      _impactIdx = Math.min(_releaseIdx + 1, _frames.length - 1);
    }
  } else {
    _impactIdx = _selectedIdx;
    // If impact is now before release, push release back
    if (_releaseIdx !== null && _impactIdx <= _releaseIdx) {
      _releaseIdx = Math.max(_impactIdx - 1, 0);
    }
  }
  renderPreview(_selectedIdx);
  refreshThumbHighlights();
  toast(type === 'release' ? '🟢 Release frame set' : '🔴 Impact frame set');
}

/* ─────────────────────────────────────
   CONFIRM — calculate speed
───────────────────────────────────── */
function confirmFrames() {
  if (_releaseIdx === null || _impactIdx === null) {
    toast('Set both release and impact frames first', true);
    return;
  }

  const releaseFrame = _frames[_releaseIdx];
  const impactFrame  = _frames[_impactIdx];

  if (releaseFrame.frameIndex >= impactFrame.frameIndex) {
    toast('Release must come before impact', true);
    return;
  }

  const fps        = getVideoFps();
  const frameDiff  = impactFrame.frameIndex - releaseFrame.frameIndex;
  const timeSec    = frameDiff / fps;
  const pitchDist  = window._sessionPitchDist || 20.12;
  const mps        = pitchDist / timeSec;
  const kph        = mps * 3.6;
  const mph        = kph * 0.621371;

  showResult({ kph, mph, timeSec, dist: pitchDist, frameDiff, fps,
               releaseFrameIdx: releaseFrame.frameIndex,
               impactFrameIdx:  impactFrame.frameIndex });
}

/* ─────────────────────────────────────
   HELPER
───────────────────────────────────── */
function closestFrameArrayIdx(targetFrameIndex) {
  let best = 0, bestDist = Infinity;
  _frames.forEach((f, i) => {
    const d = Math.abs(f.frameIndex - targetFrameIndex);
    if (d < bestDist) { bestDist = d; best = i; }
  });
  return best;
}
