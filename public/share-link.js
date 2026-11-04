/* One share control. The page stays usable when the sheet is missing:
   the circle URL is still printed beside the button. */
(function () {
  document.addEventListener('click', function (event) {
    var target = event.target;
    if (!target || !target.closest) return;
    var button = target.closest('[data-share-url]');
    if (!button) return;
    var url = button.getAttribute('data-share-url') || '';
    var text = button.getAttribute('data-share-text') || url;
    if (typeof navigator.share === 'function') {
      navigator.share({ title: 'Gift circle', text: text, url: url }).catch(function () {});
      return;
    }
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(url).then(function () {
        button.textContent = 'Link copied';
      }).catch(function () {});
    }
  });
})();
