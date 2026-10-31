export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

// One short key message with a small icon, instead of a sentence of help text.
// text is trusted page copy (already escaped where it holds user data).
const ICONS = {
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  clip: '<path d="M20 11.5l-8.2 8.2a5 5 0 0 1-7.1-7.1l8.2-8.2a3.4 3.4 0 0 1 4.8 4.8L9.5 17.4a1.7 1.7 0 0 1-2.4-2.4l7.4-7.4"/>',
  repeat: '<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>',
};

export function keyNote(icon, text, extra = '') {
  return `<p class="key${extra ? ` ${extra}` : ''}"><svg class="key-icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[icon]}</svg><span>${text}</span></p>`;
}

export function csrfField(token) {
  return `<input type="hidden" name="csrf" value="${esc(token)}">`;
}
