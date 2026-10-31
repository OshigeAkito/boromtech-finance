// Fields inside .reveal / .reveal-off are display:none in a real state of the
// expense form. Chrome will not submit a form when a required (or otherwise
// invalid) control in that state cannot be focused. The server still checks
// the values. With JavaScript disabled the attributes stay off, so a hidden
// field cannot block Save and a revealed field still posts for the server.
(function () {
  function shown(input) {
    var box = input.closest('.reveal, .reveal-off');
    if (!box) return true;
    var fieldset = input.closest('fieldset');
    if (box.classList.contains('reveal-off')) {
      return !(fieldset && fieldset.querySelector('.reveal-hide:checked'));
    }
    return Boolean(fieldset && fieldset.querySelector('.reveal-trigger:checked'));
  }

  function sync(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var inputs = scope.querySelectorAll('[data-reveal-required]');
    for (var i = 0; i < inputs.length; i++) {
      var open = shown(inputs[i]);
      inputs[i].required = open;
      inputs[i].disabled = !open;
    }
  }

  document.addEventListener('change', function (event) {
    var target = event.target;
    if (!target || !target.closest) return;
    var fieldset = target.closest('fieldset');
    if (!fieldset || !fieldset.querySelector('[data-reveal-required]')) return;
    sync(fieldset);
  });

  // Constraint validation runs after click listeners, as the button's default
  // action. Sync first so a hidden field is not required at submit time.
  document.addEventListener('click', function (event) {
    var target = event.target;
    if (!target || !target.closest) return;
    var button = target.closest('button, input[type="submit"]');
    if (!button || button.type !== 'submit' || !button.form) return;
    sync(button.form);
  }, true);

  function boot() {
    sync(document);
    var buttons = document.querySelectorAll('button[type="submit"], input[type="submit"]');
    for (var i = 0; i < buttons.length; i++) buttons[i].disabled = false;
  }

  // Disable after the browser has accepted the submit, so a second click
  // cannot send the same planned series twice. pageshow turns it back on.
  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!form || !form.querySelectorAll) return;
    setTimeout(function () {
      var buttons = form.querySelectorAll('button[type="submit"], input[type="submit"]');
      for (var i = 0; i < buttons.length; i++) buttons[i].disabled = true;
    }, 0);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  window.addEventListener('pageshow', boot);
}());

// Month fields become a small calendar: a year with arrows and twelve months.
// The value still posts as YYYY-MM from a hidden input with the field's name,
// which keeps data-reveal-required so the sync above still turns it off.
(function () {
  var open = null;

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function close() {
    if (!open) return;
    open.panel.hidden = true;
    open.button.setAttribute('aria-expanded', 'false');
    open = null;
  }

  function enhance(field) {
    var source = field.querySelector('input[name], select[name]');
    if (!source || field.querySelector('.month-button')) return;
    var names = field.getAttribute('data-months').split(',');
    var offset = Number(field.getAttribute('data-year-offset') || 0);
    var value = document.createElement('input');
    value.type = 'hidden';
    value.name = source.name;
    value.value = /^\d{4}-\d{2}$/.test(source.value) ? source.value : '';
    if (source.hasAttribute('data-reveal-required')) value.setAttribute('data-reveal-required', '');
    value.disabled = source.disabled;

    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'month-button';
    button.id = source.id;
    button.setAttribute('aria-haspopup', 'true');
    button.setAttribute('aria-expanded', 'false');

    var panel = document.createElement('div');
    panel.className = 'month-panel';
    panel.hidden = true;
    var head = document.createElement('div');
    head.className = 'month-head';
    var prev = document.createElement('button');
    prev.type = 'button';
    prev.textContent = '‹';
    prev.setAttribute('aria-label', field.getAttribute('data-prev'));
    var next = document.createElement('button');
    next.type = 'button';
    next.textContent = '›';
    next.setAttribute('aria-label', field.getAttribute('data-next'));
    var yearText = document.createElement('strong');
    head.appendChild(prev);
    head.appendChild(yearText);
    head.appendChild(next);
    var grid = document.createElement('div');
    grid.className = 'month-grid';
    panel.appendChild(head);
    panel.appendChild(grid);

    var shownYear;

    function label() {
      var m = /^(\d{4})-(\d{2})$/.exec(value.value);
      button.textContent = m ? names[Number(m[2]) - 1] + ' ' + (Number(m[1]) + offset) : field.getAttribute('data-empty');
      button.classList.toggle('empty', !m);
    }

    function draw() {
      yearText.textContent = String(shownYear + offset);
      grid.innerHTML = '';
      for (var i = 1; i <= 12; i++) {
        var key = shownYear + '-' + pad(i);
        var cell = document.createElement('button');
        cell.type = 'button';
        cell.textContent = names[i - 1];
        cell.setAttribute('data-key', key);
        cell.setAttribute('aria-pressed', key === value.value ? 'true' : 'false');
        grid.appendChild(cell);
      }
    }

    function set(key) {
      value.value = key;
      label();
      value.dispatchEvent(new Event('change', { bubbles: true }));
    }
    field._setMonth = set;
    field._monthValue = value;

    button.addEventListener('click', function () {
      if (open && open.panel === panel) { close(); return; }
      close();
      var m = /^(\d{4})/.exec(value.value);
      shownYear = m ? Number(m[1]) : new Date().getFullYear();
      draw();
      panel.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      open = { panel: panel, button: button };
      var picked = grid.querySelector('[aria-pressed="true"]') || grid.firstChild;
      if (picked) picked.focus();
    });
    // The panel sits inside the field's label; a click on its padding must not
    // count as a click on the label, which would press the month button again.
    panel.addEventListener('click', function (event) {
      if (!event.target.closest('button')) event.preventDefault();
    });
    prev.addEventListener('click', function () { shownYear -= 1; draw(); });
    next.addEventListener('click', function () { shownYear += 1; draw(); });
    grid.addEventListener('click', function (event) {
      var cell = event.target.closest('[data-key]');
      if (!cell) return;
      set(cell.getAttribute('data-key'));
      close();
      button.focus();
    });

    source.parentNode.replaceChild(button, source);
    button.parentNode.insertBefore(value, button.nextSibling);
    button.parentNode.insertBefore(panel, value.nextSibling);
    label();
  }

  document.addEventListener('click', function (event) {
    if (open && !event.target.closest('.month-field')) close();
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && open) {
      var button = open.button;
      close();
      button.focus();
    }
  });

  // Choosing a repeat with no end month yet starts the end at the start month.
  document.addEventListener('change', function (event) {
    var target = event.target;
    if (!target || target.name !== 'frequency' || target.value === 'once') return;
    var form = target.form;
    var start = form && form.querySelector('[data-month-picker] input[name="monthKey"]');
    var endField = form && form.querySelector('[data-month-picker] input[name="endKey"]');
    endField = endField && endField.closest('[data-month-picker]');
    if (start && endField && endField._setMonth && !endField._monthValue.value && start.value) endField._setMonth(start.value);
  });

  function boot() {
    var fields = document.querySelectorAll('[data-month-picker]');
    for (var i = 0; i < fields.length; i++) enhance(fields[i]);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}());
