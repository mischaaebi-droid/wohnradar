/* Footer-Inhalt ausschliesslich aus der zentralen footer.html laden. */
(() => {
  'use strict';
  const script = document.currentScript;
  const mount = document.getElementById('wohnradar-footer');
  if (!script || !mount) return;
  const templateURL = new URL('footer.html', script.src);
  const decorate = () => {
    mount.querySelectorAll('[data-wr-year]').forEach(el => { el.textContent = String(new Date().getFullYear()); });
    const current = new URL(location.href);
    if (current.pathname.endsWith('/')) current.pathname += 'index.html';
    mount.querySelectorAll('a[href]').forEach(link => {
      const target = new URL(link.getAttribute('href'), templateURL);
      if (!target.hash && target.origin === current.origin && target.pathname === current.pathname) {
        link.setAttribute('aria-current', 'page');
      }
    });
  };
  // fetch benötigt HTTP(S); zur lokalen Vorschau einen Webserver verwenden.
  if (location.protocol === 'file:') return;
  fetch(templateURL)
    .then(response => {
      if (!response.ok) throw new Error('Footer konnte nicht geladen werden.');
      return response.text();
    })
    .then(html => {
      const template = document.createElement('template');
      template.innerHTML = html;
      if (!template.content.querySelector('footer.wr-footer')) throw new Error('Footer-Vorlage fehlt.');
      mount.replaceChildren(template.content.cloneNode(true));
      decorate();
    })
    .catch(() => { /* Bei Ladefehlern bleibt der Einfügebereich leer. */ });
})();
