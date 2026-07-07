window.APP_CONFIG = {
  API_BASE_URL: "https://mednova-website.onrender.com"
};

window.getApiUrl = function(path = "") {
  const normalizedPath = String(path || "");
  const cleanedBase = window.APP_CONFIG.API_BASE_URL.replace(/\/$/, '');
  if (normalizedPath.startsWith('/')) {
    return cleanedBase + normalizedPath;
  }
  return cleanedBase + '/' + normalizedPath;
};

window.getAPIUrl = window.getApiUrl;
