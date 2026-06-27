/* JENNY Coach — Logik für die Trainings-Modi Sales & Languages.
   Hält den Produktideen-Pool, parst Bewertungen (SCORE: x/100) aus Jennys
   Antworten und speichert den Fortschritt. Die eigentlichen Gespräche laufen
   über JennyBrain (KI) mit modusspezifischen System-Prompts. */
window.JennyCoach = (function () {
  // ---------- Sales: spontane Produktideen zum Pitchen ----------
  var PRODUCTS = [
    'eine smarte Trinkflasche, die ans Trinken erinnert',
    'ein Online-Kurs, der Anfängern das Investieren beibringt',
    'ein nachhaltiger Rucksack aus recyceltem Ozeanplastik',
    'eine App, die Essensreste in Rezepte verwandelt',
    'noise-cancelling Kopfhörer für besseren Schlaf',
    'ein Abo für frisch geröstete Spezialitätenkaffees',
    'ein KI-Tool, das Bewerbungen in Minuten schreibt',
    'höhenverstellbarer Schreibtisch fürs Homeoffice',
    'eine Smartwatch für Senioren mit Notruf-Funktion',
    'ein Sprachlern-Abo mit echten Muttersprachlern',
    'ein Meal-Prep-Service für Sportler',
    'eine Solar-Powerbank fürs Camping',
    'ein Premium-Hundefutter im Abo',
    'ein Online-Marktplatz für handgemachte Möbel',
    'eine Buchhaltungs-Software für Freelancer',
  ];
  function randomProduct() { return PRODUCTS[Math.floor(Math.random() * PRODUCTS.length)]; }

  // ---------- Lernsprachen ----------
  var LEARN_LANGS = [
    { code: 'es', name: 'Spanisch', tts: 'es-ES' },
    { code: 'en', name: 'Englisch', tts: 'en-US' },
    { code: 'fr', name: 'Französisch', tts: 'fr-FR' },
    { code: 'it', name: 'Italienisch', tts: 'it-IT' },
    { code: 'fa', name: 'Persisch', tts: 'fa-IR' },
    { code: 'ru', name: 'Russisch', tts: 'ru-RU' },
    { code: 'pt', name: 'Portugiesisch', tts: 'pt-PT' },
    { code: 'tr', name: 'Türkisch', tts: 'tr-TR' },
    { code: 'ja', name: 'Japanisch', tts: 'ja-JP' },
    { code: 'ar', name: 'Arabisch', tts: 'ar-SA' },
  ];
  var LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];

  // ---------- Score parsing ----------
  function parseScore(text) {
    if (!text) return null;
    var m = String(text).match(/score\s*[:=]?\s*(\d{1,3})\s*\/\s*100/i) || String(text).match(/(\d{1,3})\s*\/\s*100/);
    if (!m) return null;
    var n = parseInt(m[1], 10);
    if (isNaN(n)) return null;
    return Math.max(0, Math.min(100, n));
  }

  // ---------- Progress storage ----------
  function key(kind) { return 'jenny.score.' + kind; }
  function scores(kind) { try { return JSON.parse(localStorage.getItem(key(kind))) || []; } catch (e) { return []; } }
  function addScore(kind, n) {
    var a = scores(kind); a.push({ n: n, ts: Date.now() }); if (a.length > 50) a = a.slice(-50);
    try { localStorage.setItem(key(kind), JSON.stringify(a)); } catch (e) {}
    return a;
  }
  function last(kind) { var a = scores(kind); return a.length ? a[a.length - 1].n : null; }
  function average(kind) { var a = scores(kind); if (!a.length) return null; return Math.round(a.reduce(function (s, x) { return s + x.n; }, 0) / a.length); }
  function count(kind) { return scores(kind).length; }

  return { randomProduct, PRODUCTS, LEARN_LANGS, LEVELS, parseScore, scores, addScore, last, average, count };
})();
