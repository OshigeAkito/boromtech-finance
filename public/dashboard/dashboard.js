// Expands monthly detail rows and shows chart tooltips. This file holds no forecast figures.
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

  // Chart tooltips: one floating box, text from the hovered mark's data-tip.
  const tip = document.getElementById('chart-tip');
  if (!tip) return;
  const GAP = 14;

  function place(x, y) {
    const box = tip.getBoundingClientRect();
    let left = x + GAP;
    let top = y + GAP;
    if (left + box.width > window.innerWidth - 8) left = x - box.width - GAP;
    if (top + box.height > window.innerHeight - 8) top = y - box.height - GAP;
    tip.style.left = Math.max(8, left) + 'px';
    tip.style.top = Math.max(8, top) + 'px';
  }

  function show(mark, x, y) {
    tip.textContent = mark.getAttribute('data-tip') || '';
    tip.hidden = false;
    place(x, y);
  }

  function hide() {
    tip.hidden = true;
  }

  function markFrom(target) {
    if (!target || typeof target.closest !== 'function') return null;
    return target.closest('[data-tip]');
  }

  document.addEventListener('pointermove', (event) => {
    const mark = markFrom(event.target);
    if (mark) show(mark, event.clientX, event.clientY);
    else if (!tip.hidden) hide();
  });

  document.addEventListener('focusin', (event) => {
    const mark = markFrom(event.target);
    if (!mark) return;
    const box = mark.getBoundingClientRect();
    show(mark, box.left + box.width / 2, box.top + box.height / 2);
  });

  document.addEventListener('focusout', hide);
  window.addEventListener('scroll', hide, { passive: true });
}());
