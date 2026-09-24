const crypto = require('crypto');

// Exact GA script from index.html (lines 7-36, with leading spaces)
const ga_script = `  window.dataLayer = window.dataLayer || [];
  function gtag(){window.dataLayer.push(arguments);}
  function loadAnalytics() {
    if (window.__mednovaAnalyticsLoaded) return;
    window.__mednovaAnalyticsLoaded = true;
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=G-70L73W3SD6';
    script.setAttribute('data-analytics', 'true');
    document.head.appendChild(script);
    gtag('js', new Date());
    gtag('config', 'G-70L73W3SD6');
  }
  function scheduleAnalytics() {
    if (window.__mednovaAnalyticsScheduled) return;
    window.__mednovaAnalyticsScheduled = true;
    const loadLater = () => {
      if (document.hidden) return;
      window.setTimeout(loadAnalytics, 10000);
    };
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(loadLater, { timeout: 12000 });
    } else {
      window.setTimeout(loadLater, 3000);
    }
  }
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleAnalytics();
  }, { once: true });
  window.addEventListener('pointerdown', scheduleAnalytics, { once: true, passive: true });
  window.addEventListener('keydown', scheduleAnalytics, { once: true });
  window.addEventListener('scroll', scheduleAnalytics, { once: true, passive: true });`;

// Exact lazy-loading script from index.html
const lazy_script = `  (function () {
    function loadLazyAssets() {
      if (!document.head) return;

      if (!document.getElementById('mednova-demo-css')) {
        const demoCss = document.createElement('link');
        demoCss.id = 'mednova-demo-css';
        demoCss.rel = 'stylesheet';
        demoCss.href = '/public/css/demo-widget.css';
        document.head.appendChild(demoCss);
      }

      if (!document.getElementById('mednova-booking-css')) {
        const bookingCss = document.createElement('link');
        bookingCss.id = 'mednova-booking-css';
        bookingCss.rel = 'stylesheet';
        bookingCss.href = '/public/css/consultation-booking.css';
        document.head.appendChild(bookingCss);
      }

      if (!document.getElementById('mednova-demo-js')) {
        const demoJs = document.createElement('script');
        demoJs.id = 'mednova-demo-js';
        demoJs.src = '/public/js/demo-widget.js';
        demoJs.defer = true;
        document.body.appendChild(demoJs);
      }

      if (!document.getElementById('mednova-booking-js')) {
        const bookingJs = document.createElement('script');
        bookingJs.id = 'mednova-booking-js';
        bookingJs.src = '/public/js/consultation-booking.js';
        bookingJs.defer = true;
        document.body.appendChild(bookingJs);
      }

      if (!document.getElementById('mednova-nav-js')) {
        const navJs = document.createElement('script');
        navJs.id = 'mednova-nav-js';
        navJs.src = '/public/js/site-nav.js';
        navJs.defer = true;
        document.body.appendChild(navJs);
      }
    }

    function scheduleAssets() {
      if (window.__mednovaAssetsScheduled) return;
      window.__mednovaAssetsScheduled = true;
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(loadLazyAssets, { timeout: 3000 });
      } else {
        window.setTimeout(loadLazyAssets, 1800);
      }
    }

    function initialize() {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', scheduleAssets, { once: true });
        return;
      }
      scheduleAssets();
    }

    window.addEventListener('scroll', scheduleAssets, { once: true, passive: true });
    window.addEventListener('pointerdown', scheduleAssets, { once: true, passive: true });
    window.addEventListener('keydown', scheduleAssets, { once: true });
    initialize();
  })();`;

function hashContent(content) {
  const digest = crypto.createHash('sha256').update(content).digest('base64');
  return `'sha256-${digest}'`;
}

console.log('GA Deferral Script Hash:');
console.log(hashContent(ga_script));
console.log('\nAsset Lazy-Loading Script Hash:');
console.log(hashContent(lazy_script));
