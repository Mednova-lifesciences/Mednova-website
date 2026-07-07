(function () {
  const apiBaseUrl = "https://mednova-website.onrender.com";
  const frontendUrl = "https://mednova-website-backend-e14x-peji3cgxi-mednova.vercel.app";

  window.MEDNOVA_CONFIG = {
    apiBaseUrl,
    frontendUrl,
    getApiUrl(path) {
      const normalizedPath = String(path || '').replace(/^\/+/, '');
      if (!apiBaseUrl) {
        return `/${normalizedPath}`;
      }
      return `${apiBaseUrl.replace(/\/$/, '')}/${normalizedPath}`;
    }
  };

  window.getApiUrl = function getApiUrl(path) {
    return window.MEDNOVA_CONFIG.getApiUrl(path);
  };
})();
