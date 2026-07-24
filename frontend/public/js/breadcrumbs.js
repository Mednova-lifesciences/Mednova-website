(function () {
  const normalizePath = (value) => {
    if (!value) return '/';
    const path = String(value).replace(/\\/g, '/');
    return path === '/' ? '/' : path.replace(/\/+$/, '');
  };

  const currentPath = normalizePath(window.location.pathname);
  const siteBaseUrl = 'https://mednovalife.com';
  const pages = [
    { path: '/', label: 'Home', parent: null },
    { path: '/services', label: 'Services', parent: '/' },
    { path: '/pv.html', label: 'Pharmacovigilance', parent: '/services' },
    { path: '/qppv-nigeria.html', label: 'QPPV', parent: '/services' },
    { path: '/cro.html', label: 'Clinical Development', parent: '/services' },
    { path: '/regulatory.html', label: 'Regulatory Affairs', parent: '/services' },
    { path: '/medical-writing.html', label: 'Medical Writing', parent: '/services' },
    { path: '/medical-information.html', label: 'Medical Information', parent: '/services' },
    { path: '/nafdac-registration.html', label: 'NAFDAC Product Registration', parent: '/services' },
    { path: '/services/clinical-development.html', label: 'Clinical Development', parent: '/services' },
    { path: '/services/pharmacovigilance.html', label: 'Pharmacovigilance', parent: '/services' },
    { path: '/services/regulatory-affairs.html', label: 'Regulatory Affairs', parent: '/services' },
    { path: '/services/regulatory-intelligence.html', label: 'Regulatory Intelligence', parent: '/services' },
    { path: '/services/nafdac-product-registration.html', label: 'NAFDAC Product Registration', parent: '/services' },
    { path: '/post-marketing-surveillance.html', label: 'Post-Marketing Surveillance', parent: '/services' },
    { path: '/regulatory-intelligence.html', label: 'Regulatory Intelligence', parent: '/services' },
    { path: '/training-consulting.html', label: 'Training & Consulting', parent: '/services' },
    { path: '/resources', label: 'Resources', parent: '/' },
    { path: '/resources/glossary', label: 'Glossary', parent: '/resources' },
    { path: '/resources/clinical-development-readiness.html', label: 'Clinical Development Readiness', parent: '/resources' },
    { path: '/about', label: 'About', parent: '/' },
    { path: '/contact', label: 'Contact', parent: '/' },
    { path: '/compliance-checklist.html', label: 'Compliance Checklist', parent: '/' },
    { path: '/capability-statement.html', label: 'Capability Statement', parent: '/' }
  ];

  const getPageByPath = (path) => {
    const exactMatch = pages.find((entry) => path === entry.path);
    if (exactMatch) return exactMatch;

    const candidates = pages
      .filter((entry) => entry.path !== '/' && path.startsWith(entry.path))
      .sort((a, b) => b.path.length - a.path.length);

    if (candidates.length) return candidates[0];

    if (path.startsWith('/resources/glossary/')) {
      const slug = path.split('/').pop().replace(/\.html$/, '').replace(/-/g, ' ');
      const label = slug
        .split(' ')
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      return { path, label, parent: '/resources/glossary' };
    }

    return pages[0];
  };

  const page = getPageByPath(currentPath);
  if (!page) return;

  const buildItems = () => {
    if (page.path === '/') {
      return [{ label: 'Home', href: null, current: true }];
    }

    const chain = [];
    let current = page;
    const seen = new Set();
    while (current && !seen.has(current.path)) {
      seen.add(current.path);
      chain.unshift(current);
      current = current.parent ? pages.find((entry) => entry.path === current.parent) || null : null;
    }

    if (chain[0] && chain[0].path !== '/') {
      chain.unshift(pages[0]);
    }

    return chain.map((entry, index) => ({
      label: entry.label,
      href: index < chain.length - 1 ? entry.path : null,
      current: index === chain.length - 1
    }));
  };

  const buildSchema = (items) => ({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.label,
      item: item.current ? `${siteBaseUrl}${currentPath}` : `${siteBaseUrl}${item.href}`
    }))
  });

  const addSchema = (items) => {
    const existingScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    const hasBreadcrumbList = existingScripts.some((script) => {
      try {
        const parsed = JSON.parse(script.textContent || '{}');
        return parsed && parsed['@type'] === 'BreadcrumbList';
      } catch (error) {
        return false;
      }
    });

    if (hasBreadcrumbList) return;

    const schema = document.createElement('script');
    schema.type = 'application/ld+json';
    schema.textContent = JSON.stringify(buildSchema(items));
    document.head.appendChild(schema);
  };

  const breadcrumbContainer = document.querySelector('[data-breadcrumbs]');
  if (!breadcrumbContainer) {
    const main = document.querySelector('main') || document.body;
    const hero = main.querySelector ? main.querySelector('section.hero') || main.querySelector('section[aria-labelledby]') || main.querySelector('section') : null;
    const container = document.createElement('div');
    container.setAttribute('data-breadcrumbs', '');
    if (main === document.body) {
      document.body.insertBefore(container, document.body.firstChild);
    } else if (hero && hero.parentNode === main) {
      hero.insertAdjacentElement('afterend', container);
    } else {
      main.insertBefore(container, main.firstChild);
    }
  }

  const container = document.querySelector('[data-breadcrumbs]');
  if (!container || container.querySelector('.meddnova-breadcrumbs')) return;

  const items = buildItems();
  addSchema(items);

  const nav = document.createElement('nav');
  nav.className = 'meddnova-breadcrumbs';
  nav.setAttribute('aria-label', 'Breadcrumb');
  const ol = document.createElement('ol');
  ol.className = 'meddnova-breadcrumbs__list';

  items.forEach((item) => {
    const li = document.createElement('li');
    if (item.href && !item.current) {
      const link = document.createElement('a');
      link.href = item.href;
      link.textContent = item.label;
      li.appendChild(link);
    } else {
      const span = document.createElement('span');
      span.setAttribute('aria-current', item.current ? 'page' : 'false');
      span.textContent = item.label;
      li.appendChild(span);
    }
    ol.appendChild(li);
  });

  nav.appendChild(ol);
  container.appendChild(nav);
})();
