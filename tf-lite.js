/* ═══════════════════════════════════════
   CRICKET SPEED GUN — tf-lite.js
   Unified detection API that uses:
   - TensorFlow Lite via Capacitor plugin (native APK)
   - TF.js COCO-SSD (PWA / browser fallback)
   Both expose the same detectBall(canvas) interface
   so app.js doesn't need to care which is running.
═══════════════════════════════════════ */

/* ─────────────────────────────────────
   ENVIRONMENT DETECTION
───────────────────────────────────── */

/**
 * Returns true when running inside a Capacitor native shell.
 * window.Capacitor is injected by the Capacitor bridge.
 */
function isNative() {
  return !!(window.Capacitor && window.Capacitor.isNative);
}

/**
 * Returns true when the TF Lite Capacitor plugin is available.
 * Plugin: @tensorflow/tfjs-tflite via capacitor-plugin-tensorflow-lite
 * or a custom bridge — both expose window.TFLite.
 */
function hasTFLitePlugin() {
  return isNative() && !!(window.TFLite || window.Capacitor?.Plugins?.TFLite);
}

/* ─────────────────────────────────────
   UNIFIED DETECTOR CLASS
───────────────────────────────────── */
class BallDetector {
  constructor() {
    this.ready    = false;
    this.mode     = 'none';   // 'tflite' | 'tfjs' | 'none'
    this._model   = null;
  }

  /**
   * Load whichever model is appropriate for the environment.
   * Call once during session init.
   */
  async load(onProgress) {
    if (hasTFLitePlugin()) {
      return this._loadTFLite(onProgress);
    } else {
      return this._loadTFJS(onProgress);
    }
  }

  /* ── TF Lite (Capacitor native) ── */
  async _loadTFLite(onProgress) {
    try {
      onProgress('Loading TF Lite model…', 10);
      const plugin = window.TFLite || window.Capacitor.Plugins.TFLite;

      // Load EfficientDet-Lite0 — small, fast, good for mobile
      // Model file bundled in the APK at android/app/src/main/assets/
      await plugin.loadModel({
        model: 'efficientdet_lite0.tflite',
        numThreads: 4,       // use all cores on Pura 80
        useNNAPI: true,      // Huawei NPU acceleration
        useGPU: true
      });

      onProgress('TF Lite ready ✓', 100);
      this._model = plugin;
      this.mode   = 'tflite';
      this.ready  = true;
    } catch (e) {
      console.warn('TF Lite load failed, falling back to TF.js', e);
      return this._loadTFJS(onProgress);
    }
  }

  /* ── TF.js COCO-SSD (browser / PWA) ── */
  async _loadTFJS(onProgress) {
    try {
      onProgress('Loading TensorFlow…', 20);
      await tf.ready();
      onProgress('Loading COCO-SSD model…', 50);

      // mobilenet_v2 is the best balance of speed/accuracy for mobile
      this._model = await cocoSsd.load({ base: 'mobilenet_v2' });

      onProgress('Model ready ✓', 100);
      this.mode  = 'tfjs';
      this.ready = true;
    } catch (e) {
      onProgress('⚠ Model failed — using motion detection only', 100);
      this._model = null;
      this.mode   = 'none';
      this.ready  = false;
    }
  }

  /**
   * Run detection on a canvas element.
   * Returns { found: bool, x, y, w, h, confidence } in canvas pixel coords,
   * or null if no ball found.
   */
  async detectBall(canvas) {
    if (!this.ready || !this._model) return null;

    try {
      if (this.mode === 'tflite') {
        return this._detectTFLite(canvas);
      } else {
        return this._detectTFJS(canvas);
      }
    } catch (e) {
      return null;
    }
  }

  /* ── TF Lite detection ── */
  async _detectTFLite(canvas) {
    // Convert canvas to base64 for the Capacitor bridge
    const imageData = canvas.toDataURL('image/jpeg', 0.8);
    const result    = await this._model.detect({ image: imageData });

    // EfficientDet returns: { detections: [{ label, score, boundingBox: {left,top,width,height} }] }
    if (!result?.detections?.length) return null;

    const ball = result.detections.find(d =>
      (d.label === 'sports ball' || d.label === 'ball') && d.score > 0.4
    );
    if (!ball) return null;

    const W = canvas.width, H = canvas.height;
    return {
      found:      true,
      x:          ball.boundingBox.left  * W,
      y:          ball.boundingBox.top   * H,
      w:          ball.boundingBox.width * W,
      h:          ball.boundingBox.height* H,
      confidence: ball.score
    };
  }

  /* ── TF.js COCO-SSD detection ── */
  async _detectTFJS(canvas) {
    const preds = await this._model.detect(canvas);
    const ball  = preds.find(p => p.class === 'sports ball' && p.score > 0.45);
    if (!ball) return null;
    return {
      found:      true,
      x:          ball.bbox[0],
      y:          ball.bbox[1],
      w:          ball.bbox[2],
      h:          ball.bbox[3],
      confidence: ball.score
    };
  }

  /** Human-readable label for the UI badge */
  get label() {
    switch (this.mode) {
      case 'tflite': return 'TF Lite · Native';
      case 'tfjs':   return 'TF.js · COCO-SSD';
      default:       return 'No Model';
    }
  }
}

/* ─────────────────────────────────────
   SINGLETON EXPORT
───────────────────────────────────── */
// app.js references window.ballDetector
window.ballDetector = new BallDetector();

/* ─────────────────────────────────────
   CAPACITOR SETUP NOTES
   ─────────────────────────────────────
   To enable TF Lite in the APK build:

   1. Install the plugin:
      npm install capacitor-plugin-tensorflow-lite

   2. Add to android/app/build.gradle dependencies:
      implementation 'org.tensorflow:tensorflow-lite:2.14.0'
      implementation 'org.tensorflow:tensorflow-lite-gpu:2.14.0'
      implementation 'org.tensorflow:tensorflow-lite-support:0.4.4'

   3. Download the model and place at:
      android/app/src/main/assets/efficientdet_lite0.tflite
      Download: https://tfhub.dev/tensorflow/lite-model/efficientdet/lite0/detection/metadata/1

   4. Sync:
      npx cap sync android

   On the Pura 80 / Kirin 9010, NNAPI will automatically
   route inference to the NPU for ~3-5x faster detection
   vs TF.js in a WebView.
───────────────────────────────────── */
