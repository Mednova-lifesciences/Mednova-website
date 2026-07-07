(function () {
  const apiBaseUrl = '';
  const frontendUrl = '';

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
