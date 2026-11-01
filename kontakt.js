/* Verschleierung plus bewusste Freigabe. Kein CAPTCHA und keine Bot-Garantie. */
(() => {
  'use strict';
  const values = {"email": [50, 53, 61, 52, 27, 50, 54, 54, 52, 60, 58, 117, 56, 51], "phone": [107, 104, 106, 123, 104, 104, 106, 123, 99, 109, 123, 110, 111]};
  const decode = bytes => bytes.map(value => String.fromCharCode(value ^ 91)).join('');
  document.querySelectorAll('[data-contact]').forEach(button => {
    button.hidden = false;
    button.addEventListener('click', () => {
      const kind = button.dataset.contact;
      const text = decode(values[kind]);
      const link = document.createElement('a');
      link.textContent = text;
      link.href = kind === 'email' ? 'mailto:' + text : 'tel:+41' + text.replace(/\s/g, '').slice(1);
      const result = document.getElementById(button.getAttribute('aria-controls'));
      result.replaceChildren(link);
      button.setAttribute('aria-expanded', 'true');
      button.hidden = true;
      link.focus();
    }, { once: true });
  });
})();
