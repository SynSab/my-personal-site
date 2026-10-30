/*
   Korean: flashcards and quizzes, at /korean.

   The words live in vocab.csv next to this file: one card per row,
   a "korean" column, an "english" column and a "deck" column (the
   deck's name, e.g. 2-2 Numbers; leave it out and every card is one deck).
   Decks are listed in the order they first appear in the file. Edit it
   in any spreadsheet app or text editor; the page reads it fresh on
   every load.

   The page is three screens in turn: pick a deck, pick a mode, study.
   Each has its own address after the # (#2-2-numbers, then
   #2-2-numbers/learn), so the phone's back button steps back through them.
   This file runs the screens, the words and the voice. Each mode lives
   in its own file (base.js, learn.js, terms.js) and adds itself to
   Korean.modes.

   Decks made in Terms are kept in this browser only, listed after the
   ones from vocab.csv. Each keeps its own copy of its words, so editing
   or removing a row in the file doesn't change a deck already made.

   Read-aloud uses the browser's own Korean voice (Web Speech API), so
   there is nothing to pay for and no key to keep. Quality depends on the
   device: Apple's "Yuna" (Mac, iPhone) and Google's Korean voice in
   Chrome both sound natural. An iPhone in silent mode stays silent.
*/

(function () {
    const VOCAB_URL = '/korean/vocab.csv';
    const FRONT_KEY = 'korean.front';   // language seen first: 'korean' or 'english'
    const SOUND_KEY = 'korean.sound';   // 'off' to stop reading Korean aloud by itself
    const DECKS_KEY = 'korean.decks';   // decks made in Terms: [{ name, words: [card…] }]

    const screens = {
        decks: document.querySelector('.decks-screen'),
        modes: document.querySelector('.modes-screen'),
        study: document.querySelector('.study-screen'),
    };
    const deckList   = document.querySelector('.deck-list');
    const deckTitle  = document.querySelector('.deck-title');
    const studyBack  = document.querySelector('.study-screen .back');
    const frontBtns  = document.querySelectorAll('.front button');
    const frontLabel = document.querySelector('.front .toggle-label');
    const soundBtns  = document.querySelectorAll('.sound button');
    const frontGroup = document.querySelector('.front');
    const deleteBtn  = document.querySelector('.delete-deck');

    const modes = {};      // filled in by base.js and learn.js
    let allCards = [];     // every row of vocab.csv
    let myDecks = readDecks();   // decks made in Terms
    let decks = [];        // { name, slug, label, mine }, 'all' last
    let current = null;    // the mode on the study screen, if any
    let frontLang = readSetting(FRONT_KEY) === 'english' ? 'english' : 'korean';
    let soundOn = readSetting(SOUND_KEY) !== 'off';


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

    // A deck's cards: rows from vocab.csv, or the words of a deck made in Terms.
    function listed(name) {
        if (name === 'all') return allCards.slice();
        const mine = myDecks.find(d => d.name === name);
        return mine ? mine.words.slice() : allCards.filter(c => c.deck === name);
    }

    function shuffled(list) {
        list = list.slice();
        for (let i = list.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [list[i], list[j]] = [list[j], list[i]];
        }
        return list;
    }


    // ─── Extra random numbers ────────────────────────────
    /*
       In Base mode the numbers deck holds the numbers from vocab.csv plus
       a fresh batch of random ones, made each time it's opened. They are
       read the Sino-Korean way (일, 이, 삼…), built only from words in
       that deck: 347 is 삼 백 사 십 칠, and a 1 before 백 or 십 is dropped
       (110 = 백십). Below 1000 nothing more is needed; 1000 would be 천.
       Learn leaves them out: they change every time, so there would be
       no progress to keep.
    */

    const NUMBERS_DECK = '2-2 Numbers';   // the deck that gets the extras
    const EXTRA_COUNT = 20;     // random numbers added each time
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
    function extraNumbers(listedCards) {
        const taken = new Set(listedCards.map(c => c.english));
        const extras = new Set();
        while (extras.size < EXTRA_COUNT) {
            const n = randomNumber();
            if (!taken.has(String(n))) extras.add(n);
        }
        return [...extras].map(n => ({ korean: sinoKorean(n), english: String(n), deck: NUMBERS_DECK }));
    }

    // A deck with the random numbers added, if it includes the numbers deck.
    function withExtras(name) {
        const cards = listed(name);
        if (name !== 'all' && name !== NUMBERS_DECK) return cards;
        const numbers = cards.filter(c => c.deck === NUMBERS_DECK);
        return numbers.length ? cards.concat(extraNumbers(numbers)) : cards;
    }


    // ─── Speech ──────────────────────────────────────────

    // Safari on iPhone can hand over its voice list late, or never say it
    // has, so speaking doesn't wait for a named voice: with none found, the
    // device's own Korean voice is used.
    let koreanVoice = null;
    const canSpeak = 'speechSynthesis' in window;

    function pickVoice() {
        const voices = speechSynthesis.getVoices().filter(v => /^ko/i.test(v.lang));
        // Prefer the voices known to sound natural; otherwise any Korean one.
        const preferred = ['Yuna', 'Google 한국의', 'Microsoft SunHi', 'Microsoft Heami'];
        koreanVoice = preferred
            .map(name => voices.find(v => v.name.startsWith(name)))
            .find(Boolean) || voices[0] || null;
    }

    if (canSpeak) {
        pickVoice();
        speechSynthesis.addEventListener('voiceschanged', pickVoice);
    }

    function speak(text, button) {
        if (!koreanVoice) pickVoice();
        // Some browsers drop a word spoken straight after a needless cancel.
        if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.voice = koreanVoice;
        u.lang = 'ko-KR';
        u.rate = 0.85;   // a touch slower than conversation, for listening
        if (button) {
            u.onend = u.onerror = () => button.classList.remove('playing');
            button.classList.add('playing');
        }
        speechSynthesis.speak(u);
    }

    // Says the Korean by itself when it comes into view, if Read aloud is on.
    function sayIfOn(text, button) {
        if (soundOn && canSpeak) speak(text, button);
    }

    const SPEAKER_ICON =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/>' +
        '<path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>';

    // A speaker button that reads `text`, or null where there's no speech.
    function speakButton(text) {
        if (!canSpeak) return null;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'speak';
        btn.setAttribute('aria-label', 'Read aloud');
        btn.innerHTML = SPEAKER_ICON;
        btn.addEventListener('click', e => {
            e.stopPropagation();   // speaking shouldn't flip a card
            speak(text, btn);
        });
        return btn;
    }


    // ─── Settings ────────────────────────────────────────

    function readSetting(key) {
        try { return localStorage.getItem(key); }
        catch (e) { return null; }
    }

    function saveSetting(key, value) {
        try { localStorage.setItem(key, value); } catch (e) {}
    }

    function setFront(lang) {
        frontLang = lang;
        saveSetting(FRONT_KEY, lang);
        frontBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.front === lang)));
        if (current) current.refront();
    }

    function setSound(on) {
        soundOn = on;
        saveSetting(SOUND_KEY, on ? 'on' : 'off');
        soundBtns.forEach(b => b.setAttribute('aria-pressed', String((b.dataset.sound === 'on') === on)));
        if (!on && canSpeak) speechSynthesis.cancel();
    }

    frontBtns.forEach(b => b.addEventListener('click', () => setFront(b.dataset.front)));
    soundBtns.forEach(b => b.addEventListener('click', () => setSound(b.dataset.sound === 'on')));


    // ─── Decks made in Terms ─────────────────────────────

    function readDecks() {
        try {
            const saved = JSON.parse(readSetting(DECKS_KEY));
            return Array.isArray(saved) ? saved : [];
        } catch (e) { return []; }
    }

    function saveDecks() {
        saveSetting(DECKS_KEY, JSON.stringify(myDecks));
        buildDecks();
    }

    // Why a name can't be used, or '' if it can. Each deck needs its own
    // address, so two names that read the same after the # clash.
    function nameProblem(name) {
        const slug = slugOf(name);
        if (!slug) return 'A deck name needs a letter or number in it.';
        if (decks.some(d => d.slug === slug)) return 'There’s already a deck called ' + name + '.';
        return '';
    }

    // Saves a new deck and returns its address after the #.
    function addDeck(name, words) {
        myDecks.push({
            name,
            words: words.map(c => ({ korean: c.korean, english: c.english, deck: c.deck })),
        });
        saveDecks();
        return slugOf(name);
    }

    let shownDeck = null;   // the deck on the mode screen

    // Two taps rather than confirm(), which some browsers block.
    deleteBtn.addEventListener('click', () => {
        if (!deleteBtn.dataset.armed) {
            deleteBtn.dataset.armed = 'yes';
            deleteBtn.textContent = 'Tap again to delete';
            return;
        }
        myDecks = myDecks.filter(d => d.name !== shownDeck.name);
        saveDecks();
        location.hash = '';
    });


    // ─── Screens ─────────────────────────────────────────

    // Letters in any script, so a deck can have a Korean name.
    const slugOf = name => name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');

    // The decks in vocab.csv order, then any made in Terms, then All.
    // A list with no deck column is a single deck, All.
    function buildDecks() {
        const names = [...new Set(allCards.map(c => c.deck).filter(Boolean))];
        decks = names.map(name => ({ name, slug: slugOf(name), label: name }))
            .concat(myDecks.map(d => ({ name: d.name, slug: slugOf(d.name), label: d.name, mine: true })))
            .concat({ name: 'all', slug: 'all', label: names.length ? 'All' : 'All words' });

        deckList.innerHTML = '';
        decks.forEach(d => {
            const a = document.createElement('a');
            a.className = 'deck-link' + (d.mine ? ' mine' : '');
            a.href = '#' + d.slug;
            const name = document.createElement('span');
            name.className = 'deck-name';
            name.textContent = d.label;
            const size = document.createElement('span');
            size.className = 'deck-size';
            size.textContent = listed(d.name).length + ' words';
            a.append(name, size);
            const li = document.createElement('li');
            li.appendChild(a);
            deckList.appendChild(li);
        });
    }

    function showScreen(name) {
        Object.entries(screens).forEach(([key, s]) => { s.hidden = key !== name; });
        document.body.dataset.screen = name;
        window.scrollTo(0, 0);
    }

    function showModes(deck) {
        shownDeck = deck;
        deckTitle.textContent = deck.label;
        deleteBtn.hidden = !deck.mine;
        delete deleteBtn.dataset.armed;
        deleteBtn.textContent = 'Delete this deck';
        document.querySelectorAll('.mode').forEach(a => {
            a.href = '#' + deck.slug + '/' + a.dataset.mode;
        });
        Object.values(modes).forEach(m => { if (m.describe) m.describe(deck); });
        showScreen('modes');
    }

    function startMode(deck, name) {
        current = modes[name];
        studyBack.href = '#' + deck.slug;
        studyBack.textContent = '← ' + deck.label;
        // Terms shows both languages side by side, so it has no toggle.
        frontGroup.hidden = !current.frontLabel;
        frontLabel.textContent = current.frontLabel || '';
        frontGroup.setAttribute('aria-label', current.frontLabel || '');
        document.querySelectorAll('[data-mode-panel]').forEach(p => {
            p.hidden = p.dataset.modePanel !== name;
        });
        showScreen('study');
        current.start(deck);
    }

    // Reads the address after the #: nothing, a deck, or a deck and mode.
    function route() {
        if (current) current.stop();
        current = null;
        if (canSpeak) speechSynthesis.cancel();
        const [slug, mode] = decodeURIComponent(location.hash.slice(1)).split('/');
        const deck = decks.find(d => d.slug === slug);
        if (!deck) showScreen('decks');
        else if (!modes[mode]) showModes(deck);
        else startMode(deck, mode);
    }

    document.addEventListener('keydown', e => {
        if (current && current.key) current.key(e);
    });


    // ─── Shared with the modes ───────────────────────────

    window.Korean = {
        modes,
        listed,
        withExtras,
        shuffled,
        front: () => frontLang,
        canSpeak,
        speak,
        sayIfOn,
        speakButton,
        nameProblem,
        addDeck,
    };


    // ─── Start ───────────────────────────────────────────

    setFront(frontLang);
    setSound(soundOn);

    fetch(VOCAB_URL, { cache: 'no-cache' })
        .then(r => { if (!r.ok) throw new Error(r.status); return r.text(); })
        .then(text => {
            allCards = toCards(parseCSV(text));
            if (!allCards.length) throw new Error('no cards');
            buildDecks();
            window.addEventListener('hashchange', route);
            route();
        })
        .catch(() => {
            document.querySelector('.empty').hidden = false;
        });
})();
