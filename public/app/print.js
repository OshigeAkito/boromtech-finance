(function () {
  var button = document.getElementById('print-form');
  if (!button) return;
  button.addEventListener('click', function () {
    window.print();
  });
}());
