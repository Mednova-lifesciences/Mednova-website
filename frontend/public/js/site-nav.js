(function () {
  const toggleButtons = Array.from(document.querySelectorAll('.site-nav__toggle'));
  if (!toggleButtons.length) return;

  let activeToggle = null;
  let lastFocusedElement = null;

  function getSourceLinks() {
    const siteNav = document.querySelector('.site-nav');
    if (siteNav) {
      return Array.from(siteNav.querySelectorAll('a')).filter((link) => !link.closest('.brand'));
    }

    const toplineNav = document.querySelector('.topline-nav');
    if (toplineNav) {
      return Array.from(toplineNav.querySelectorAll('a'));
    }

    return [];
  }

  function ensureDrawer() {
    let overlay = document.querySelector('.site-nav__overlay');
    let drawer = document.querySelector('.site-nav__drawer');

    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'site-nav__overlay';
      overlay.setAttribute('aria-hidden', 'true');
      document.body.appendChild(overlay);
    }

    if (!drawer) {
      drawer = document.createElement('aside');
      drawer.className = 'site-nav__drawer';
      drawer.id = 'site-nav-drawer';
      drawer.setAttribute('aria-label', 'Site navigation');
      drawer.setAttribute('aria-hidden', 'true');
      drawer.tabIndex = -1;
      document.body.appendChild(drawer);
    }

    if (!drawer.querySelector('.site-nav__drawer-links')) {
      const header = document.createElement('div');
      header.className = 'site-nav__drawer-header';
      header.innerHTML = '<span class="site-nav__drawer-title">Navigate</span><button class="site-nav__drawer-close" type="button" aria-label="Close navigation">×</button>';
      drawer.appendChild(header);

      const linksWrapper = document.createElement('div');
      linksWrapper.className = 'site-nav__drawer-links';
      drawer.appendChild(linksWrapper);
    }

    return { overlay, drawer };
  }

  function populateDrawer(drawer) {
    const links = getSourceLinks();
    const linksWrapper = drawer.querySelector('.site-nav__drawer-links');
    if (!linksWrapper) return;

    linksWrapper.innerHTML = '';

    links.forEach((link) => {
      const item = document.createElement('a');
      item.href = link.href;
      item.textContent = link.textContent.trim();
      item.setAttribute('data-nav-link', 'true');
      if (link.getAttribute('aria-current') === 'page') {
        item.setAttribute('aria-current', 'page');
      }
      linksWrapper.appendChild(item);
    });
  }

  function getFocusableElements(drawer) {
    return Array.from(drawer.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter((element) => {
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
  }

  function setOpen(isOpen, toggle) {
    const { overlay, drawer } = ensureDrawer();
    const isDesktop = window.matchMedia('(min-width: 1024px)').matches;

    if (isDesktop) {
      isOpen = false;
    }

    document.body.classList.toggle('nav-open', isOpen);
    overlay.classList.toggle('is-visible', isOpen);
    drawer.classList.toggle('is-open', isOpen);
    overlay.setAttribute('aria-hidden', String(!isOpen));
    drawer.setAttribute('aria-hidden', String(!isOpen));

    toggleButtons.forEach((button) => {
      button.classList.toggle('is-open', isOpen);
      button.setAttribute('aria-expanded', String(isOpen));
    });

    if (isOpen) {
      lastFocusedElement = document.activeElement;
      activeToggle = toggle || toggleButtons[0];
      populateDrawer(drawer);
      const focusable = getFocusableElements(drawer);
      if (focusable.length) {
        focusable[0].focus();
      }
      document.addEventListener('keydown', handleKeydown);
    } else {
      document.removeEventListener('keydown', handleKeydown);
      if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
        lastFocusedElement.focus();
      }
      activeToggle = null;
    }
  }

  function closeDrawer() {
    setOpen(false);
  }

  function handleKeydown(event) {
    const { drawer } = ensureDrawer();
    if (!drawer.classList.contains('is-open')) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      closeDrawer();
      return;
    }

    if (event.key === 'Tab') {
      const focusable = getFocusableElements(drawer);
      if (!focusable.length) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  toggleButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const shouldOpen = !button.classList.contains('is-open');
      setOpen(shouldOpen, button);
    });
  });

  document.addEventListener('click', (event) => {
    const { overlay, drawer } = ensureDrawer();
    if (!drawer.classList.contains('is-open')) return;
    const clickedInsideDrawer = drawer.contains(event.target);
    const clickedToggle = toggleButtons.some((button) => button.contains(event.target));
    if (!clickedInsideDrawer && !clickedToggle) {
      closeDrawer();
    }
  });

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (target instanceof Element && target.matches('.site-nav__drawer-links a')) {
      closeDrawer();
    }
  });

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (target instanceof Element && target.matches('.site-nav__drawer-close')) {
      closeDrawer();
    }
  });

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (target instanceof Element && target.matches('.site-nav__overlay')) {
      closeDrawer();
    }
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth >= 1024) {
      closeDrawer();
    }
  });
})();
