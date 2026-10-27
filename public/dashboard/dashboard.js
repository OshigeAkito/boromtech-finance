// Expands monthly detail rows. This file holds no forecast figures.
(function () {
  function rowFrom(target) {
    if (!target || typeof target.closest !== 'function') return null;
    return target.closest('tr.month-row');
  }

  function setExpanded(row, expanded) {
    const id = row.getAttribute('aria-controls');
    const detail = id ? document.getElementById(id) : null;
    row.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    const marker = row.querySelector('.marker');
    if (marker) marker.textContent = expanded ? '▾' : '▸';
    if (!detail) return;
    if (expanded) detail.removeAttribute('hidden');
    else detail.setAttribute('hidden', '');
  }

  function toggle(row) {
    setExpanded(row, row.getAttribute('aria-expanded') !== 'true');
  }

  document.addEventListener('click', (event) => {
    const row = rowFrom(event.target);
    if (!row) return;
    toggle(row);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const row = rowFrom(event.target);
    if (!row) return;
    event.preventDefault();
    toggle(row);
  });

  const expandAll = document.getElementById('expand-all');
  const collapseAll = document.getElementById('collapse-all');
  if (expandAll) {
    expandAll.addEventListener('click', () => {
      document.querySelectorAll('tr.month-row').forEach((row) => setExpanded(row, true));
    });
  }
  if (collapseAll) {
    collapseAll.addEventListener('click', () => {
      document.querySelectorAll('tr.month-row').forEach((row) => setExpanded(row, false));
    });
  }
}());
