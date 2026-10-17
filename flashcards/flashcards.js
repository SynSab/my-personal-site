/*
   Korean flashcards.

   The words live in vocab.csv next to this file: one card per row,
   a "korean" column, an "english" column and a "deck" column (the
   deck's name, e.g. Counting; leave it out and every card is one deck).
   Decks appear in the picker in the order they first appear in the file. Edit it in any spreadsheet
   app or text editor; the page reads it fresh on every load.

   Read-aloud uses the browser's own Korean voice (Web Speech API), so
   there is nothing to pay for and no key to keep. Quality depends on the
   device: Apple's "Yuna" (Mac, iPhone) and Google's Korean voice in
   Chrome both sound natural. With no Korean voice, the button hides.
*/

(function () {
    const VOCAB_URL = '/flashcards/vocab.csv';
    const FRONT_KEY = 'flashcards.front';   // remembered "show first" choice
    const DECK_KEY  = 'flashcards.deck';    // remembered deck, or 'all'

    const card    = document.querySelector('.card');
    const inner   = document.querySelector('.card-inner');
    const front   = document.querySelector('.face-front');
    const back    = document.querySelector('.face-back');
    const count   = document.querySelector('.count');
    const toggles = document.querySelectorAll('.toggle button');
    const decksEl = document.querySelector('.decks');

    let allCards = [];   // every row of vocab.csv
    let cards = [];      // the chosen deck, in study order
    let currentDeck = 'all';
    let index = 0;
    let frontLang = readFront();


    // ─── Data ────────────────────────────────────────────

    // A small CSV reader: handles quoted fields, so a meaning can hold a
    // comma ("to eat, to have") as long as the spreadsheet quotes it.
    function parseCSV(text) {
        const rows = [];
        let row = [], field = '', quoted = false;
        text = text.replace(/^﻿/, '');   // Excel's byte-order mark
        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            if (quoted) {
                if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
                else if (c === '"') quoted = false;
                else field += c;
            } else if (c === '"') quoted = true;
            else if (c === ',') { row.push(field); field = ''; }
            else if (c === '\n' || c === '\r') {
                if (c === '\r' && text[i + 1] === '\n') i++;
                row.push(field); rows.push(row); row = []; field = '';
            } else field += c;
        }
        if (field || row.length) { row.push(field); rows.push(row); }
        return rows;
    }

    function toCards(rows) {
        const header = rows.shift().map(h => h.trim().toLowerCase());
        const ko = header.indexOf('korean');
        const en = header.indexOf('english');
        const dk = header.indexOf('deck');
        return rows
            .map(r => ({
                korean:  (r[ko] || '').trim(),
                english: (r[en] || '').trim(),
                deck:    dk < 0 ? '' : (r[dk] || '').trim(),
            }))
            .filter(c => c.korean && c.english);
    }


    // ─── Speech ──────────────────────────────────────────

    let koreanVoice = null;
    const canSpeak = 'speechSynthesis' in window;

    function pickVoice() {
        const voices = speechSynthesis.getVoices().filter(v => /^ko/i.test(v.lang));
        // Prefer the voices known to sound natural; otherwise any Korean one.
        const preferred = ['Yuna', 'Google 한국의', 'Microsoft SunHi', 'Microsoft Heami'];
        koreanVoice = preferred
            .map(name => voices.find(v => v.name.startsWith(name)))
            .find(Boolean) || voices[0] || null;
        render();
    }

    if (canSpeak) {
        pickVoice();
        speechSynthesis.addEventListener('voiceschanged', pickVoice);
    }

    function speak(text, button) {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.voice = koreanVoice;
        u.lang = 'ko-KR';
        u.rate = 0.85;   // a touch slower than conversation, for listening
        u.onend = u.onerror = () => button.classList.remove('playing');
        button.classList.add('playing');
        speechSynthesis.speak(u);
    }

    const SPEAKER_ICON =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/>' +
        '<path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>';


    // ─── Drawing a card ──────────────────────────────────

    function fillFace(face, lang, c) {
        face.innerHTML = '';
        const word = document.createElement('div');
        word.className = 'word' + (lang === 'korean' ? ' ko' : '');
        word.lang = lang === 'korean' ? 'ko' : 'en';
        word.textContent = c[lang];
        face.appendChild(word);

        if (lang === 'korean' && koreanVoice) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'speak';
            btn.setAttribute('aria-label', 'Read aloud');
            btn.innerHTML = SPEAKER_ICON;
            btn.addEventListener('click', e => {
                e.stopPropagation();   // speaking shouldn't flip the card
                speak(c.korean, btn);
            });
            face.appendChild(btn);
        }
    }

    function render() {
        if (!cards.length) return;
        const c = cards[index];
        const backLang = frontLang === 'korean' ? 'english' : 'korean';
        fillFace(front, frontLang, c);
        fillFace(back, backLang, c);
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
        if (canSpeak) speechSynthesis.cancel();
        render();
    }

    function flip() {
        card.classList.toggle('flipped');
    }

    // Shuffle draws the deck again, so the numbers deck gets new numbers.
    function shuffle() {
        cards = shuffled(cardsFor(currentDeck));
        show(0);
    }

    function shuffled(list) {
        for (let i = list.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [list[i], list[j]] = [list[j], list[i]];
        }
        return list;
    }


    // ─── Extra random numbers ────────────────────────────
    /*
       The numbers deck holds the numbers from vocab.csv plus a fresh batch
       of random ones, made each time the deck is picked or shuffled. They
       are read the Sino-Korean way (일, 이, 삼…), built only from words in
       that deck: 347 is 삼 백 사 십 칠, and a 1 before 백 or 십 is dropped
       (110 = 백십). Below 1000 nothing more is needed; 1000 would be 천.
    */

    const NUMBERS_DECK = 'Counting';   // the deck that gets the extras
    const EXTRA_COUNT = 20;     // random numbers added per round
    const EXTRA_MAX = 999;

    const DIGITS = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];

    function sinoKorean(n) {
        if (n === 0) return '영';
        let out = '';
        [[100, '백'], [10, '십']].forEach(([place, word]) => {
            const d = Math.floor(n / place) % 10;
            if (d) out += (d === 1 ? '' : DIGITS[d]) + word;
        });
        return out + DIGITS[n % 10];
    }

    // As many one-, two- and three-digit numbers as each other, rather than
    // uniform over 0–999, which would be nine-tenths three-digit.
    function randomNumber() {
        const digits = 1 + Math.floor(Math.random() * String(EXTRA_MAX).length);
        const lo = digits === 1 ? 0 : 10 ** (digits - 1);
        const hi = Math.min(10 ** digits - 1, EXTRA_MAX);
        return lo + Math.floor(Math.random() * (hi - lo + 1));
    }

    // Skips any number the CSV already has, so no card appears twice.
    function extraNumbers(listed) {
        const taken = new Set(listed.map(c => c.english));
        const extras = new Set();
        while (extras.size < EXTRA_COUNT) {
            const n = randomNumber();
            if (!taken.has(String(n))) extras.add(n);
        }
        return [...extras].map(n => ({ korean: sinoKorean(n), english: String(n), deck: NUMBERS_DECK }));
    }


    // ─── Deck picker ─────────────────────────────────────

    // In the order each deck first appears in vocab.csv.
    function deckNames() {
        return [...new Set(allCards.map(c => c.deck).filter(Boolean))];
    }

    function cardsFor(name) {
        const listed = name === 'all' ? allCards.slice() : allCards.filter(c => c.deck === name);
        if (name !== 'all' && name !== NUMBERS_DECK) return listed;
        return listed.concat(extraNumbers(listed.filter(c => c.deck === NUMBERS_DECK)));
    }

    function buildDecks() {
        const names = deckNames();
        if (!names.length) return;   // no deck column: nothing to choose
        ['all', ...names].forEach(name => {
            const b = document.createElement('button');
            b.type = 'button';
            b.dataset.deck = name;
            b.textContent = name === 'all' ? 'All' : name;
            b.addEventListener('click', () => setDeck(name));
            decksEl.appendChild(b);
        });
        decksEl.hidden = false;
    }

    // Other decks come in vocab.csv order; the numbers deck arrives
    // shuffled, so the random extras are mixed in rather than trailing.
    function setDeck(name) {
        if (name !== 'all' && !deckNames().includes(name)) name = 'all';
        currentDeck = name;
        try { localStorage.setItem(DECK_KEY, name); } catch (e) {}
        decksEl.querySelectorAll('button').forEach(b =>
            b.setAttribute('aria-pressed', String(b.dataset.deck === name)));
        cards = cardsFor(name);
        if (name === NUMBERS_DECK) shuffled(cards);
        show(0);
    }

    function readDeck() {
        try { return localStorage.getItem(DECK_KEY) || 'all'; }
        catch (e) { return 'all'; }
    }


    // ─── "Show first" toggle ─────────────────────────────

    function readFront() {
        try { return localStorage.getItem(FRONT_KEY) === 'english' ? 'english' : 'korean'; }
        catch (e) { return 'korean'; }
    }

    function setFront(lang) {
        frontLang = lang;
        try { localStorage.setItem(FRONT_KEY, lang); } catch (e) {}
        toggles.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.front === lang)));
        show(index);
    }

    toggles.forEach(b => b.addEventListener('click', () => setFront(b.dataset.front)));


    // ─── Input ───────────────────────────────────────────

    card.addEventListener('click', flip);
    document.querySelector('.prev').addEventListener('click', () => show(index - 1));
    document.querySelector('.next').addEventListener('click', () => show(index + 1));
    document.querySelector('.shuffle').addEventListener('click', shuffle);

    document.addEventListener('keydown', e => {
        if (e.target.closest('button') && (e.key === ' ' || e.key === 'Enter')) return;
        if (e.key === 'ArrowRight') show(index + 1);
        else if (e.key === 'ArrowLeft') show(index - 1);
        else if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            flip();
        }
    });

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


    // ─── Start ───────────────────────────────────────────

    setFront(frontLang);

    fetch(VOCAB_URL, { cache: 'no-cache' })
        .then(r => { if (!r.ok) throw new Error(r.status); return r.text(); })
        .then(text => {
            allCards = toCards(parseCSV(text));
            if (!allCards.length) throw new Error('no cards');
            buildDecks();
            setDeck(readDeck());
        })
        .catch(() => {
            front.innerHTML = '<p class="empty">Couldn’t load the word list.</p>';
            count.textContent = '';
        });
})();
