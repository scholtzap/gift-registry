for (const form of document.querySelectorAll('form[data-card-entry]')) {
  const name = form.elements.namedItem('displayNameShown');
  const message = form.elements.namedItem('message');
  const anonymous = form.elements.namedItem('anonymous');
  const previewName = form.querySelector('[data-card-name]');
  const previewMessage = form.querySelector('[data-card-message]');
  const update = () => {
    previewName.textContent = anonymous.checked ? 'Anonymous' : name.value;
    previewMessage.textContent = message.value || 'Write your message above to preview it before saving.';
    previewMessage.className = message.value ? 'pn-note' : 'pn-empty';
  };
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  update();
}
