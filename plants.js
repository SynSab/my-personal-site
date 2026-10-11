// ── The plants ────────────────────────────────────────────────────────
//
// The beds in front of the house are drawn by tools/linework.py and styled
// in styles.css. This file does two small things:
//
//   1. copies the dials in config.js (`plants`) onto the bed, where the
//      stylesheet reads them as data-colour, data-line and data-hint;
//   2. makes a click on any plant play the login reveal (login.js). A
//      second click puts the name back.

(function () {
    'use strict';

    const bed = document.querySelector('.plants-bed');
    if (!bed) return;

    const C = (typeof CONFIG !== 'undefined' && CONFIG.plants) || {};
    bed.dataset.colour = C.colour || 'house';
    bed.dataset.line   = C.line   || 'thin';
    bed.dataset.hint   = C.hint   || 'ink';

    bed.addEventListener('click', function (e) {
        const plant = e.target.closest('.plant');
        if (!plant || !window.LoginReveal) return;
        // .tapped stands in for hover on a phone
        plant.classList.add('tapped');
        setTimeout(function () { plant.classList.remove('tapped'); }, 700);
        if (LoginReveal.isOpen()) LoginReveal.reset();
        else LoginReveal.play();
    });
})();
