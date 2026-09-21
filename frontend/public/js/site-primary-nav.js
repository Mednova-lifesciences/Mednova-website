/* MedNova primary navigation — Services + Technology disclosure menus.
   Deliverable 1, MedNova Verify integration brief (§13.1).

   The markup ships in the HTML (so the links are crawlable and work without
   JS); this file adds the open/close behaviour, keyboard support, and marks
   the entry for the current page. */
(function () {
  'use strict';

  var groups = Array.prototype.slice.call(
    document.querySelectorAll('.mn-navgroup')
  );
  if (!groups.length) return;

  var desktop = window.matchMedia('(min-width: 1024px)');

  function menuOf(group) {
    return group.querySelector('.mn-navgroup__menu');
  }

  function btnOf(group) {
    return group.querySelector('.mn-navgroup__btn');
  }

  function setOpen(group, open) {
    var btn = btnOf(group);
    var menu = menuOf(group);
    if (!btn || !menu) return;
    btn.setAttribute('aria-expanded', String(open));
    menu.hidden = !open;
  }

  function closeAll(except) {
    groups.forEach(function (group) {
      if (group !== except) setOpen(group, false);
    });
  }

  function itemsOf(group) {
    var menu = menuOf(group);
    return menu ? Array.prototype.slice.call(menu.querySelectorAll('a')) : [];
  }

  /* --- current page ------------------------------------------------------ */

  function normalise(path) {
    try {
      // /services/ and /services/index.html are the same page.
      var p = new URL(path, window.location.origin).pathname;
      return p.replace(/index\.html$/, '').replace(/\/$/, '') || '/';
    } catch (err) {
      return path;
    }
  }

  var here = normalise(window.location.pathname);

  groups.forEach(function (group) {
    itemsOf(group).forEach(function (link) {
      if (normalise(link.getAttribute('href')) === here) {
        link.setAttribute('aria-current', 'page');
        var btn = btnOf(group);
        if (btn) btn.classList.add('is-current');
      }
    });
  });

  /* --- interaction ------------------------------------------------------- */

  groups.forEach(function (group) {
    var btn = btnOf(group);
    var menu = menuOf(group);
    if (!btn || !menu) return;

    // Start closed. Markup ships without [hidden] so the links are visible
    // if this script never runs.
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');

    btn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      var willOpen = btn.getAttribute('aria-expanded') !== 'true';
      closeAll(group);
      setOpen(group, willOpen);
    });

    btn.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowDown' || event.key === 'Down') {
        event.preventDefault();
        closeAll(group);
        setOpen(group, true);
        var items = itemsOf(group);
        if (items.length) items[0].focus();
      }
    });

    // Pointer users get hover on desktop; touch is handled by the click
    // listener above, and matchMedia keeps this off narrow viewports.
    group.addEventListener('mouseenter', function () {
      if (!desktop.matches) return;
      closeAll(group);
      setOpen(group, true);
    });

    group.addEventListener('mouseleave', function () {
      if (!desktop.matches) return;
      setOpen(group, false);
    });

    menu.addEventListener('keydown', function (event) {
      var items = itemsOf(group);
      var index = items.indexOf(document.activeElement);

      if (event.key === 'ArrowDown' || event.key === 'Down') {
        event.preventDefault();
        if (items.length) items[(index + 1) % items.length].focus();
      } else if (event.key === 'ArrowUp' || event.key === 'Up') {
        event.preventDefault();
        if (items.length) {
          items[(index - 1 + items.length) % items.length].focus();
        }
      } else if (event.key === 'Home') {
        event.preventDefault();
        if (items.length) items[0].focus();
      } else if (event.key === 'End') {
        event.preventDefault();
        if (items.length) items[items.length - 1].focus();
      }
    });
  });

  // Tabbing out of a group closes it, so a keyboard user never drags an open
  // panel along behind them.
  document.addEventListener('focusin', function (event) {
    groups.forEach(function (group) {
      if (!group.contains(event.target)) setOpen(group, false);
    });
  });

  document.addEventListener('click', function (event) {
    groups.forEach(function (group) {
      if (!group.contains(event.target)) setOpen(group, false);
    });
  });

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape' && event.key !== 'Esc') return;
    groups.forEach(function (group) {
      var btn = btnOf(group);
      if (btn && btn.getAttribute('aria-expanded') === 'true') {
        setOpen(group, false);
        btn.focus();
      }
    });
  });

  window.addEventListener('resize', function () {
    closeAll(null);
  });
})();
