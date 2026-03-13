/* ═══════════════════════════════════════
   CRICKET SPEED GUN — video.js
   Camera recording, file upload,
   frame extraction from video
═══════════════════════════════════════ */

let _cameraStream   = null;
let _mediaRecorder  = null;
let _recordedChunks = [];
let _recTimerInterval = null;
let _recSeconds     = 0;
let _videoBlob      = null;   // final video blob (recorded or uploaded)
let _videoFrames    = [];     // Array<ImageData> — extracted frames
let _videoFps       = 60;     // actual/declared fps

/* ─────────────────────────────────────
   TAB SWITCHING
───────────────────────────────────── */
function switchVideoTab(tab) {
  document.getElementById('tabRecord').classList.toggle('active', tab === 'record');
  document.getElementById('tabUpload').classList.toggle('active', tab === 'upload');
  document.getElementById('paneRecord').classList.toggle('hidden', tab !== 'record');
  document.getElementById('paneUpload').classList.toggle('hidden', tab !== 'upload');
  if (tab !== 'record') stopCamera();
}

/* ─────────────────────────────────────
   CAMERA
───────────────────────────────────── */
async function openCamera() {
  try {
    const fps = window._sessionFps || 60;
    _cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width:     { ideal: 1920 },
        height:    { ideal: 1080 },
        frameRate: { ideal: fps, min: 30 }
      },
      audio: false
    });
    const preview = document.getElementById('recPreview');
    preview.srcObject = _cameraStream;
    document.getElementById('btnCamOpen').classList.add('hidden');
    document.getElementById('btnRecStart').classList.remove('hidden');
    document.getElementById('recHint').textContent = 'Camera ready — side-on, both sets of stumps visible';
  } catch (e) {
    toast('Camera access denied', true);
  }
}

function stopCamera() {
  if (_cameraStream) {
    _cameraStream.getTracks().forEach(t => t.stop());
    _cameraStream = null;
  }
  document.getElementById('recPreview').srcObject = null;
  document.getElementById('btnCamOpen').classList.remove('hidden');
  document.getElementById('btnRecStart').classList.add('hidden');
  document.getElementById('btnRecStop').classList.add('hidden');
  document.getElementById('recOverlay').classList.add('hidden');
  stopRecTimer();
}

/* ─────────────────────────────────────
   RECORDING
───────────────────────────────────── */
function startRecording() {
  if (!_cameraStream) return;
  _recordedChunks = [];

  // Prefer MP4/H264 for widest device compatibility
  const mimeType = ['video/mp4;codecs=h264', 'video/webm;codecs=vp9', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t)) || '';

  _mediaRecorder = new MediaRecorder(_cameraStream, mimeType ? { mimeType } : {});
  _mediaRecorder.ondataavailable = e => { if (e.data.size > 0) _recordedChunks.push(e.data); };
  _mediaRecorder.onstop = onRecordingComplete;
  _mediaRecorder.start(100); // collect data every 100ms

  document.getElementById('btnRecStart').classList.add('hidden');
  document.getElementById('btnRecStop').classList.remove('hidden');
  document.getElementById('recOverlay').classList.remove('hidden');
  document.getElementById('recHint').textContent = 'Recording — capture the full delivery';
  startRecTimer();
}

function stopRecording() {
  if (_mediaRecorder && _mediaRecorder.state !== 'inactive') {
    _mediaRecorder.stop();
  }
  document.getElementById('btnRecStop').classList.add('hidden');
  document.getElementById('recOverlay').classList.add('hidden');
  stopRecTimer();
}

function onRecordingComplete() {
  const mime = _mediaRecorder.mimeType || 'video/webm';
  _videoBlob = new Blob(_recordedChunks, { type: mime });
  _videoFps  = window._sessionFps || 60;
  stopCamera();
  proceedToCalib();
}

/* ─────────────────────────────────────
   TIMER
───────────────────────────────────── */
function startRecTimer() {
  _recSeconds = 0;
  updateRecTimer();
  _recTimerInterval = setInterval(() => { _recSeconds++; updateRecTimer(); }, 1000);
}
function stopRecTimer() {
  clearInterval(_recTimerInterval);
  _recTimerInterval = null;
}
function updateRecTimer() {
  const m = Math.floor(_recSeconds / 60);
  const s = String(_recSeconds % 60).padStart(2, '0');
  document.getElementById('recTimer').textContent = `${m}:${s}`;
}

/* ─────────────────────────────────────
   UPLOAD
───────────────────────────────────── */
function handleVideoUpload(input) {
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  _videoBlob = file;
  _videoFps  = window._sessionFps || 60;
  proceedToCalib();
}

/* ─────────────────────────────────────
   PROCEED TO CALIB — show first frame
───────────────────────────────────── */
function proceedToCalib() {
  // Reset calibration state
  window._calibPts   = [null, null];
  window._calibPhase = 0;
  window._pxPerMetre = 0;

  // Draw the first frame onto the calibration canvas
  const videoEl = document.createElement('video');
  videoEl.muted    = true;
  videoEl.playsInline = true;
  videoEl.src      = URL.createObjectURL(_videoBlob);

  videoEl.addEventListener('loadeddata', () => {
    videoEl.currentTime = 0;
  });

  videoEl.addEventListener('seeked', () => {
    const canvas = document.getElementById('calibCanvas');
    const wrap   = canvas.parentElement;
    canvas.width  = wrap.offsetWidth  || window.innerWidth;
    canvas.height = wrap.offsetHeight || Math.round(window.innerHeight * 0.5);

    const ctx = canvas.getContext('2d');
    // Letterbox-fit the frame
    const vw = videoEl.videoWidth  || 1280;
    const vh = videoEl.videoHeight || 720;
    const scale = Math.min(canvas.width / vw, canvas.height / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    const dx = (canvas.width  - dw) / 2;
    const dy = (canvas.height - dh) / 2;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(videoEl, dx, dy, dw, dh);

    // Store draw params for overlay redraws
    window._calibDrawParams = { dx, dy, dw, dh, vw, vh };
    window._calibVideoEl    = videoEl;

    // Wire up tap
    canvas.onclick = onCalibTap;

    goTo('sCalib');
    resetCalibUI();
  }, { once: true });
}

/* ─────────────────────────────────────
   FRAME EXTRACTION
───────────────────────────────────── */
/**
 * Extracts frames from _videoBlob at the given interval.
 * @param {number} everyNthFrame  — 1 = every frame, 2 = every other, etc.
 * @param {function} onProgress   — called with (current, total)
 * @returns {Promise<Array<{canvas, frameIndex, timeMs}>>}
 */
async function extractFrames(everyNthFrame = 1, onProgress = null) {
  return new Promise((resolve, reject) => {
    const videoEl  = document.createElement('video');
    videoEl.muted  = true;
    videoEl.playsInline = true;
    videoEl.preload = 'auto';
    videoEl.src    = URL.createObjectURL(_videoBlob);

    const frames   = [];
    const fps      = _videoFps;
    const interval = everyNthFrame / fps;   // seconds between extractions

    videoEl.addEventListener('loadedmetadata', async () => {
      const duration   = videoEl.duration;
      const totalFrames = Math.floor(duration * fps / everyNthFrame);
      let   t          = 0;
      let   idx        = 0;

      const W = Math.min(videoEl.videoWidth  || 640, 640);
      const H = Math.min(videoEl.videoHeight || 360, 360);
      const offCanvas = document.createElement('canvas');
      offCanvas.width  = W;
      offCanvas.height = H;
      const offCtx    = offCanvas.getContext('2d');

      const seekNext = () => {
        if (t > duration + 0.001) {
          _videoFrames = frames;
          resolve(frames);
          return;
        }
        videoEl.currentTime = Math.min(t, duration);
      };

      videoEl.addEventListener('seeked', () => {
        offCtx.drawImage(videoEl, 0, 0, W, H);
        // Clone the canvas for this frame
        const fc  = document.createElement('canvas');
        fc.width  = W; fc.height = H;
        fc.getContext('2d').drawImage(offCanvas, 0, 0);
        frames.push({ canvas: fc, frameIndex: idx, timeMs: Math.round(t * 1000) });

        if (onProgress) onProgress(idx + 1, totalFrames);
        idx++;
        t += interval;
        // Yield to the event loop to avoid blocking
        setTimeout(seekNext, 0);
      });

      seekNext();
    });

    videoEl.addEventListener('error', reject);
  });
}

/* ─────────────────────────────────────
   GETTERS used by other modules
───────────────────────────────────── */
function getVideoBlob()   { return _videoBlob; }
function getVideoFrames() { return _videoFrames; }
function getVideoFps()    { return _videoFps; }
