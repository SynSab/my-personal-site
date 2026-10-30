/*
   Terms: every word in the deck, in file order.

   Tap words to choose them, then "New deck" makes a deck of just those,
   kept in this browser and listed with the others. Choices start empty
   each time the list is opened.

   The name is typed into the bar, not a pop-up: some browsers (and the
   preview pane) block prompt().

   Needs app.js loaded first (window.Korean).
*/

(function () {
    const K = window.Korean;

    const list      = document.querySelector('.term-list');
    const countEl   = document.querySelector('.terms-count');
    const allBtn    = document.querySelector('.select-all');
    const makeBtn   = document.querySelector('.make-deck');
    const pickRow   = document.querySelector('.terms-pick');
    const nameForm  = document.querySelector('.name-deck');
    const nameInput = nameForm.querySelector('input');
    const problemEl = document.querySelector('.name-problem');

    let words = [];
    let chosen = new Set();   // indexes into words


    // ─── Drawing ─────────────────────────────────────────

    function render() {
        list.innerHTML = '';
        words.forEach((c, i) => {
            const label = document.createElement('label');
            label.className = 'term';
            const box = document.createElement('input');
            box.type = 'checkbox';
            box.addEventListener('change', () => {
                if (box.checked) chosen.add(i); else chosen.delete(i);
                update();
            });
            const ko = document.createElement('span');
            ko.className = 'term-ko ko';
            ko.lang = 'ko';
            ko.textContent = c.korean;
            const en = document.createElement('span');
            en.className = 'term-en';
            en.textContent = c.english;
            label.append(box, ko, en);

            const li = document.createElement('li');
            li.appendChild(label);
            const btn = K.speakButton(c.korean);
            if (btn) li.appendChild(btn);
            list.appendChild(li);
        });
        update();
    }

    function update() {
        const n = chosen.size;
        countEl.textContent = n ? n + ' chosen' : words.length + ' words';
        makeBtn.disabled = !n;
        allBtn.textContent = n === words.length ? 'Clear' : 'Select all';
        list.querySelectorAll('input').forEach((box, i) => { box.checked = chosen.has(i); });
    }


    // ─── Input ───────────────────────────────────────────

    allBtn.addEventListener('click', () => {
        chosen = chosen.size === words.length ? new Set() : new Set(words.keys());
        update();
    });

    // Swaps the bar between choosing words and naming the deck.
    function naming(on) {
        pickRow.hidden = on;
        nameForm.hidden = !on;
        problemEl.hidden = true;
        nameInput.value = '';
        if (on) nameInput.focus();
    }

    makeBtn.addEventListener('click', () => naming(true));
    nameForm.querySelector('.cancel-name').addEventListener('click', () => naming(false));
    nameInput.addEventListener('keydown', e => { if (e.key === 'Escape') naming(false); });

    // Saves under a name no other deck has, then opens the new deck.
    nameForm.addEventListener('submit', e => {
        e.preventDefault();
        const name = nameInput.value.trim();
        const problem = K.nameProblem(name);
        if (problem) {
            problemEl.textContent = problem;
            problemEl.hidden = false;
            nameInput.focus();
            return;
        }
        location.hash = K.addDeck(name, words.filter((c, i) => chosen.has(i)));
    });


    // ─── The mode ────────────────────────────────────────

    K.modes.terms = {
        frontLabel: null,
        start(deck) {
            words = K.listed(deck.name);
            chosen = new Set();
            naming(false);
            render();
        },
        stop() {},
        refront() {},
    };
})();
