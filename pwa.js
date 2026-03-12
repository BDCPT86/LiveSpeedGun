/* ═══════════════════════════════════════
   CRICKET SPEED GUN — pwa.js
   PWA install prompts for Android, Huawei,
   Samsung Internet and iOS Safari
═══════════════════════════════════════ */

(function () {

  /* ── Already installed? Don't show again ── */
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
  if (isStandalone) return;

  /* ── Dismissed recently? Wait 7 days ── */
  const dismissed = localStorage.getItem('pwa-dismissed');
  if (dismissed && Date.now() - parseInt(dismissed) < 7 * 24 * 60 * 60 * 1000) return;

  let deferredPrompt = null;

  /* ── Android Chrome + Samsung Internet ── */
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    showBanner();
  });

  /* ── Huawei Browser (EMUI 10/11/12) ── */
  window.addEventListener('appinstall', e => {
    e.preventDefault();
    deferredPrompt = e;
    showBanner();
  });

  /* ── Install button tap ── */
  document.getElementById('btnInstall').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    hideBanner();
    if (outcome === 'accepted') {
      setTimeout(() => {
        const t = document.getElementById('toast');
        t.textContent = '✓ Installed!';
        t.className   = 'toast show';
        setTimeout(() => t.classList.remove('show'), 2500);
      }, 800);
    }
  });

  /* ── iOS Safari — show nudge after 3s ── */
  const isIOS    = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isSafari = /safari/i.test(navigator.userAgent) &&
                   !/chrome|crios|fxios/i.test(navigator.userAgent);
  if (isIOS && isSafari) {
    setTimeout(() => {
      document.getElementById('iosNudge').classList.add('show');
    }, 3000);
  }

  /* ── Helpers ── */
  function showBanner() {
    // Slight delay so banner doesn't fire instantly on page load
    setTimeout(() => {
      document.getElementById('installBanner').classList.add('show');
    }, 2000);
  }

  function hideBanner() {
    document.getElementById('installBanner').classList.remove('show');
    document.getElementById('iosNudge').classList.remove('show');
  }

  /* ── Dismiss — exposed globally for onclick handlers ── */
  window.dismissInstall = function () {
    hideBanner();
    localStorage.setItem('pwa-dismissed', Date.now().toString());
  };

})();

/* ── Service Worker registration ── */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Registration failed silently — app still works without SW
    });
  });
}
