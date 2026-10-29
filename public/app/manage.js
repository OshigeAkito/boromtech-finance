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
