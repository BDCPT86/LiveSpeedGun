/* ═══════════════════════════════════════
   CRICKET SPEED GUN — analyser.js
   Claude vision API integration
   Sends sample frames, gets release +
   impact frame numbers back as JSON
═══════════════════════════════════════ */

const ANTHROPIC_API_KEY = 'YOUR_API_KEY_HERE'; // replace with your key
const ANTHROPIC_MODEL   = 'claude-opus-4-5';

/* ─────────────────────────────────────
   MAIN ENTRY POINT
   Called after calibration is done.
   Extracts frames, sends to Claude,
   then navigates to the review screen.
───────────────────────────────────── */
async function runAnalysis() {
  goTo('sAnalyse');
  setAnalyseProgress('Extracting frames…', 'Reading video', 5);

  try {
    // Extract every 2nd frame (good balance of coverage vs speed)
    const frames = await extractFrames(2, (cur, total) => {
      const pct = Math.round((cur / total) * 40);
      setAnalyseProgress('Extracting frames…', `Frame ${cur} of ${total}`, 5 + pct);
    });

    if (frames.length < 4) throw new Error('Video too short — need at least 4 frames');

    setAnalyseProgress('Sending to AI…', `${frames.length} frames extracted`, 45);

    const result = await askClaudeForFrames(frames);

    setAnalyseProgress('Processing result…', 'AI analysis complete', 90);

    // Small pause so the 90% bar is visible
    await new Promise(r => setTimeout(r, 400));

    setAnalyseProgress('Done', '', 100);
    await new Promise(r => setTimeout(r, 300));

    // Hand off to review.js
    initReviewScreen(frames, result);
    goTo('sReview');

  } catch (err) {
    console.error('Analysis error:', err);
    // Fall back to manual review with no AI suggestion
    const frames = getVideoFrames();
    if (frames.length) {
      toast('AI unavailable — select frames manually', true, 3500);
      initReviewScreen(frames, null);
      goTo('sReview');
    } else {
      toast('Analysis failed: ' + err.message, true, 4000);
      goTo('sCalib');
    }
  }
}

/* ─────────────────────────────────────
   CLAUDE API CALL
───────────────────────────────────── */
async function askClaudeForFrames(frames) {
  // Build a representative sample:
  // First, last, and evenly spaced frames in between — max 12 images
  const sample = pickSampleFrames(frames, 12);

  const imageContent = sample.map(({ canvas, frameIndex }) => ({
    type: 'image',
    source: {
      type:       'base64',
      media_type: 'image/jpeg',
      data:       canvasToBase64(canvas, 0.75)
    },
    // Label each image so Claude can reference it by number
    // We include frame index as the preceding text block
  }));

  // Interleave text labels with images so Claude knows each frame number
  const content = [];
  sample.forEach(({ canvas, frameIndex }, i) => {
    content.push({ type: 'text', text: `[Frame ${frameIndex}]` });
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: canvasToBase64(canvas, 0.75) }
    });
  });

  content.push({
    type: 'text',
    text: `These are frames from a cricket bowling video shot side-on.
The camera is stationary. Both sets of stumps are visible.
Pitch distance: ${window._sessionPitchDist || 20.12}m.

Your task:
1. Find the frame where the ball LEAVES the bowler's hand (release point).
2. Find the frame where the ball REACHES the batting end — either hitting the bat, hitting the stumps, or passing the batsman (impact point).

Respond with ONLY a JSON object, no explanation, no markdown:
{
  "releaseFrame": <frame index number>,
  "impactFrame": <frame index number>,
  "confidence": <0.0 to 1.0>,
  "notes": "<one sentence describing what you saw>"
}`
  });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model:      ANTHROPIC_MODEL,
      max_tokens: 256,
      messages:   [{ role: 'user', content }]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`API error ${response.status}: ${err?.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const raw  = data.content?.find(b => b.type === 'text')?.text || '';

  // Strip any accidental markdown fences
  const clean = raw.replace(/```json|```/gi, '').trim();
  const parsed = JSON.parse(clean);

  // Validate the returned frame indices exist in our frame array
  const maxIdx = frames[frames.length - 1].frameIndex;
  if (typeof parsed.releaseFrame !== 'number' || typeof parsed.impactFrame !== 'number') {
    throw new Error('Invalid AI response structure');
  }
  parsed.releaseFrame = Math.max(0, Math.min(parsed.releaseFrame, maxIdx));
  parsed.impactFrame  = Math.max(0, Math.min(parsed.impactFrame,  maxIdx));

  // Ensure release comes before impact
  if (parsed.releaseFrame >= parsed.impactFrame) {
    // Swap if backwards
    [parsed.releaseFrame, parsed.impactFrame] = [parsed.impactFrame, parsed.releaseFrame];
  }

  return parsed;
}

/* ─────────────────────────────────────
   HELPERS
───────────────────────────────────── */
function pickSampleFrames(frames, maxCount) {
  if (frames.length <= maxCount) return frames;
  const step   = (frames.length - 1) / (maxCount - 1);
  const result = [];
  for (let i = 0; i < maxCount; i++) {
    result.push(frames[Math.round(i * step)]);
  }
  return result;
}

function canvasToBase64(canvas, quality = 0.8) {
  return canvas.toDataURL('image/jpeg', quality).split(',')[1];
}

function setAnalyseProgress(stage, detail, pct) {
  document.getElementById('analyseStage').textContent  = stage;
  document.getElementById('analyseDetail').textContent = detail;
  document.getElementById('analyseBar').style.width    = pct + '%';
}
