(function () {
  const searchInput = document.querySelector('[data-glossary-search]');
  const resultsLabel = document.querySelector('[data-glossary-results]');
  const clearButton = document.querySelector('[data-clear-search]');
  const groups = Array.from(document.querySelectorAll('[data-glossary-group]'));
  const directory = document.querySelector('.glossary-directory');

  if (!searchInput || !groups.length) return;

  const buildAlphabetNav = () => {
    if (!directory) return;

    const existingNav = directory.previousElementSibling;
    if (existingNav && existingNav.classList.contains('glossary-alpha')) {
      existingNav.remove();
    }

    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const nav = document.createElement('nav');
    nav.className = 'glossary-alpha';
    nav.setAttribute('aria-label', 'Alphabet navigation');

    letters.forEach((letter) => {
      const match = groups.find((group) => {
        const heading = group.querySelector('h2');
        return heading && heading.textContent.trim().toUpperCase() === letter;
      });

      if (!match) {
        const pill = document.createElement('span');
        pill.className = 'glossary-alpha__pill glossary-alpha__pill--disabled';
        pill.setAttribute('aria-disabled', 'true');
        pill.textContent = letter;
        nav.appendChild(pill);
        return;
      }

      const heading = match.querySelector('h2');
      const slug = heading ? heading.textContent.trim().toLowerCase() : letter.toLowerCase();
      match.id = `glossary-${slug}`;

      const link = document.createElement('a');
      link.className = 'glossary-alpha__pill';
      link.href = `#${match.id}`;
      link.textContent = letter;
      nav.appendChild(link);
    });

    directory.insertAdjacentElement('beforebegin', nav);
  };

  const updateResults = () => {
    const query = searchInput.value.trim().toLowerCase();
    let visibleCount = 0;

    groups.forEach((group) => {
      const items = Array.from(group.querySelectorAll('[data-glossary-item]'));
      let groupVisible = 0;

      items.forEach((item) => {
        const text = (item.dataset.glossaryText || item.textContent || '').toLowerCase();
        const isVisible = !query || text.includes(query);
        item.hidden = !isVisible;
        if (isVisible) groupVisible += 1;
      });

      const hasVisibleItems = groupVisible > 0;
      group.hidden = !hasVisibleItems;
      if (hasVisibleItems) visibleCount += groupVisible;
    });

    if (resultsLabel) {
      resultsLabel.textContent = query
        ? `Showing ${visibleCount} result${visibleCount === 1 ? '' : 's'} for “${query}”.`
        : 'Showing all glossary terms.';
    }
  };

  buildAlphabetNav();
  searchInput.addEventListener('input', updateResults);
  if (clearButton) {
    clearButton.addEventListener('click', () => {
      searchInput.value = '';
      updateResults();
      searchInput.focus();
    });
  }

  updateResults();
})();
