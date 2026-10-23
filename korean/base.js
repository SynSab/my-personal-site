/*
   Base mode: plain flashcards.

   The deck arrives shuffled. Tap the card to flip it; swipe, or use the
   arrow keys, to move. The toggle above picks which side shows first.
   With Read aloud on, the Korean is said whenever its side is showing.

   Needs app.js loaded first (window.Korean).
*/

(function () {
    const K = window.Korean;

    const card  = document.querySelector('.card');
    const inner = document.querySelector('.card-inner');
    const front = document.querySelector('.face-front');
    const back  = document.querySelector('.face-back');
    const count = document.querySelector('.count');

    let cards = [];
    let index = 0;
    let active = false;


    // ─── Drawing a card ──────────────────────────────────

    function fillFace(face, lang, c) {
        face.innerHTML = '';
        const word = document.createElement('div');
        word.className = 'word' + (lang === 'korean' ? ' ko' : '');
        word.lang = lang === 'korean' ? 'ko' : 'en';
        word.textContent = c[lang];
        face.appendChild(word);
        const btn = lang === 'korean' && K.speakButton(c.korean);
        if (btn) face.appendChild(btn);
    }

    function render() {
        const c = cards[index];
        const frontLang = K.front();
        fillFace(front, frontLang, c);
        fillFace(back, frontLang === 'korean' ? 'english' : 'korean', c);
        count.textContent = (index + 1) + ' / ' + cards.length;
    }

    // A new card always arrives front side up. The un-flip happens with
    // the transition off, so the next card's answer never flashes past.
    function show(i) {
        if (!cards.length) return;
        index = (i + cards.length) % cards.length;
        inner.style.transition = 'none';
        card.classList.remove('flipped');
        inner.offsetHeight;   // apply the un-flip before turning transitions back on
        inner.style.transition = '';
        if (K.canSpeak) speechSynthesis.cancel();
        render();
        readVisible();
    }

    function flip() {
        card.classList.toggle('flipped');
        readVisible();
    }

    // Reads the side facing up, if it's the Korean one.
    function readVisible() {
        const btn = (card.classList.contains('flipped') ? back : front).querySelector('.speak');
        if (btn) K.sayIfOn(cards[index].korean, btn);
    }


    // ─── Input ───────────────────────────────────────────

    card.addEventListener('click', flip);
    document.querySelector('.prev').addEventListener('click', () => show(index - 1));
    document.querySelector('.next').addEventListener('click', () => show(index + 1));

    // Swipe left / right on a phone to move between cards.
    let touchX = null;
    card.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
    card.addEventListener('touchend', e => {
        if (touchX === null) return;
        const dx = e.changedTouches[0].clientX - touchX;
        touchX = null;
        if (Math.abs(dx) > 50) {
            e.preventDefault();   // a swipe is not a tap: don't flip
            show(index + (dx < 0 ? 1 : -1));
        }
    });

    function key(e) {
        const onControl = e.target.closest && e.target.closest('button, a');
        if (onControl && (e.key === ' ' || e.key === 'Enter')) return;
        if (e.key === 'ArrowRight') show(index + 1);
        else if (e.key === 'ArrowLeft') show(index - 1);
        else if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            flip();
        }
    }


    // ─── The mode ────────────────────────────────────────

    K.modes.base = {
        frontLabel: 'Show first',
        start(deck) {
            active = true;
            cards = K.shuffled(K.withExtras(deck.name));
            show(0);
        },
        stop() { active = false; },
        refront() { if (active) show(index); },
        key,
    };
})();
