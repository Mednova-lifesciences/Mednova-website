(function () {
  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = gtag;

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

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleAnalytics();
  }, { once: true });

  window.addEventListener('pointerdown', scheduleAnalytics, { once: true, passive: true });
  window.addEventListener('keydown', scheduleAnalytics, { once: true });
  window.addEventListener('scroll', scheduleAnalytics, { once: true, passive: true });

  if (document.readyState === 'loading') {
    window.addEventListener('load', scheduleAnalytics, { once: true });
  } else {
    scheduleAnalytics();
  }
})();
