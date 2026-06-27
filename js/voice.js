/* JENNY Voice — speech recognition (input) + speech synthesis (output) + mic level
   Robust: hands-free conversation mode, auto-restart, clear error reporting,
   Chrome TTS keep-alive, voice-load retry. */
window.JennyVoice = (function () {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let listening = false;          // recognition currently running
  let wantListen = false;         // conversation mode: should we keep listening
  let speaking = false;
  let handlers = {};
  // Wait for a real pause before sending, so a whole sentence is captured.
  let finalBuf = '';              // accumulated final text of the current sentence
  let silenceTimer = null;        // fires once the user stops talking
  const SILENCE_MS = 1600;        // pause length that counts as "sentence finished"
  function clearSilence() { if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; } }

  // ---- Languages ----
  const LANGMAP = { de:'de-DE', en:'en-US', es:'es-ES', it:'it-IT', fa:'fa-IR', ru:'ru-RU', fr:'fr-FR', pt:'pt-PT', tr:'tr-TR', ja:'ja-JP', ar:'ar-SA' };
  let recogLangPending = null;

  // ---- Mic level meter (Web Audio) ----
  let audioCtx, analyser, micStream, levelRAF;
  async function startLevelMeter() {
    if (micStream) return;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') { try { await audioCtx.resume(); } catch (e) {} }
      const src = audioCtx.createMediaStreamSource(micStream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!analyser) return;
        analyser.getByteFrequencyData(data);
        let sum = 0; for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / data.length / 255;
        handlers.level && handlers.level(Math.min(1, avg * 2.4));
        levelRAF = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) { /* level meter optional */ }
  }
  function stopLevelMeter() {
    if (levelRAF) cancelAnimationFrame(levelRAF);
    levelRAF = null;
    if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
    analyser = null;
    handlers.level && handlers.level(0);
  }

  // ---- Recognition ----
  function init() {
    if (!SR) return false;
    recognition = new SR();
    recognition.lang = recogLangPending || cfg.lang || 'de-DE';
    recognition.continuous = true;      // keep listening through pauses within a sentence
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalBuf += t + ' '; else interim += t;
      }
      // Show the whole sentence so far (final + what's still being said).
      const live = (finalBuf + interim).trim();
      if (live) handlers.partial && handlers.partial(live);

      // Any speech activity resets the countdown — only send after a real pause,
      // so Jenny waits until the sentence is actually finished.
      clearSilence();
      silenceTimer = setTimeout(() => {
        const text = finalBuf.trim();
        finalBuf = '';
        if (text) {
          try { recognition.stop(); } catch (e) {}
          handlers.result && handlers.result(text);
        }
      }, SILENCE_MS);
    };

    recognition.onerror = (ev) => {
      const err = ev.error || 'unknown';
      if (err === 'no-speech' || err === 'aborted') {
        // benign — will re-arm via onend if still in conversation mode
        return;
      }
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        wantListen = false;
        handlers.error && handlers.error('mic-denied');
      } else if (err === 'network') {
        handlers.error && handlers.error('network');
      } else {
        handlers.error && handlers.error(err);
      }
    };

    recognition.onend = () => {
      listening = false;
      clearSilence();
      stopLevelMeter();
      // Re-arm if we're in conversation mode and not currently speaking
      if (wantListen && !speaking) {
        setTimeout(() => { if (wantListen && !speaking) startRecognition(); }, 250);
      } else {
        handlers.end && handlers.end();
      }
    };
    return true;
  }

  function startRecognition() {
    if (!recognition && !init()) { handlers.error && handlers.error('unsupported'); return false; }
    if (listening) return true;
    listening = true;
    startLevelMeter();
    try { recognition.start(); }
    catch (e) { /* InvalidStateError if already starting */ listening = false; }
    handlers.listenStart && handlers.listenStart();
    return true;
  }

  // Public: toggle hands-free conversation
  function startConversation() {
    if (!SR) { handlers.error && handlers.error('unsupported'); return false; }
    cancelSpeak();
    wantListen = true;
    return startRecognition();
  }
  function stopConversation() {
    wantListen = false;
    clearSilence();
    finalBuf = '';
    if (recognition && listening) { try { recognition.stop(); } catch (e) {} }
    stopLevelMeter();
    handlers.end && handlers.end();
  }

  // ---- Synthesis ----
  let voices = [];
  let cfg = { voiceURI: null, pitch: 1, rate: 1, enabled: true, lang: 'de-DE' };
  let keepAlive = null;

  function loadVoices() {
    voices = (window.speechSynthesis && window.speechSynthesis.getVoices()) || [];
    return voices;
  }
  if (window.speechSynthesis) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    // some browsers populate late
    let tries = 0;
    const iv = setInterval(() => { loadVoices(); if (voices.length || ++tries > 20) clearInterval(iv); }, 250);
  }

  function voiceForLang(code2) {
    const list = voices.filter(v => v.lang && v.lang.toLowerCase().indexOf(code2.toLowerCase()) === 0);
    if (!list.length) return null;
    const score = v => { let s = 0; if (/female|frau|woman|google|natural|neural|wavenet/i.test(v.name || '')) s += 5; if (v.localService === false) s += 2; return s; };
    return list.slice().sort((a, b) => score(b) - score(a))[0];
  }
  function pickVoice(langFull) {
    const code2 = (langFull || cfg.lang || 'de').slice(0, 2).toLowerCase();
    if (code2 === 'de' && cfg.voiceURI) { const v = voices.find(v => v.voiceURI === cfg.voiceURI); if (v) return v; }
    return voiceForLang(code2) || voices.find(v => /de[-_]/i.test(v.lang)) || voices.find(v => v.default) || voices[0] || null;
  }

  // Split text into language segments so known English brand names are spoken
  // with an English voice, the rest in the active language.
  function segmentize(text, baseLang) {
    const re = /(singularity corporations|singularity corp\.?)/ig;
    const parts = []; let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) parts.push({ text: text.slice(last, m.index), lang: baseLang });
      parts.push({ text: m[0], lang: 'en-US' });
      last = m.index + m[0].length;
    }
    if (last < text.length) parts.push({ text: text.slice(last), lang: baseLang });
    const out = parts.filter(p => p.text.trim());
    return out.length ? out : [{ text: text, lang: baseLang }];
  }

  function makeUtter(seg) {
    const u = new SpeechSynthesisUtterance(seg.text);
    const v = pickVoice(seg.lang);
    if (v) u.voice = v;
    u.lang = (v && v.lang) || seg.lang;
    u.pitch = cfg.pitch; u.rate = cfg.rate; u.volume = 1;
    return u;
  }

  // Speak an array of {text, lang} segments back-to-back as one utterance chain.
  function speakSegments(segs, opts) {
    const ss = window.speechSynthesis;
    ss.cancel();
    let i = 0, started = false;
    function next() {
      if (i >= segs.length) {
        speaking = false;
        if (keepAlive) { clearInterval(keepAlive); keepAlive = null; }
        opts.onDone && opts.onDone();
        if (wantListen) setTimeout(() => { if (wantListen && !listening) startRecognition(); }, 300);
        return;
      }
      const u = makeUtter(segs[i++]);
      u.onstart = () => {
        if (!started) { started = true; speaking = true; keepAlive = setInterval(() => { try { ss.pause(); ss.resume(); } catch (e) {} }, 9000); opts.onStart && opts.onStart(); }
      };
      u.onend = next; u.onerror = next;
      try { ss.resume(); } catch (e) {}
      ss.speak(u);
    }
    next();
  }

  // Make text sound human: drop commas/symbols/emoji, expand abbreviations,
  // so the voice flows instead of reading every comma and symbol aloud.
  function forSpeech(text) {
    let s = String(text);
    // remove emoji & decorative symbols
    s = s.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}◆◎●▸►→·•★☆«»„“”]/gu, ' ');
    // markdown noise
    s = s.replace(/[*_`#>|]/g, ' ');
    // common abbreviations -> full words (TTS mangles these)
    const ab = { 'z\\.\\s?b\\.': 'zum Beispiel', 'u\\.\\s?a\\.': 'unter anderem', 'd\\.\\s?h\\.': 'das heißt',
      'bzw\\.': 'beziehungsweise', 'usw\\.': 'und so weiter', 'etc\\.': 'und so weiter', 'ca\\.': 'circa',
      'inkl\\.': 'inklusive', 'evtl\\.': 'eventuell', 'min\\.': 'Minuten', 'std\\.': 'Stunden' };
    for (const k in ab) s = s.replace(new RegExp(k, 'gi'), ab[k]);
    // symbols -> words
    s = s.replace(/%/g, ' Prozent').replace(/&/g, ' und ').replace(/°\s?c/gi, ' Grad').replace(/€/g, ' Euro').replace(/\$/g, ' Dollar');
    // the key wish: don't read commas/semicolons aloud
    s = s.replace(/[,;]/g, ' ');
    // tidy dashes used as pauses
    s = s.replace(/\s[–—-]\s/g, ' ');
    // collapse whitespace
    s = s.replace(/\s{2,}/g, ' ').trim();
    return s;
  }

  function speak(text, opts = {}) {
    if (!window.speechSynthesis || !cfg.enabled || !text) { opts.onDone && opts.onDone(); return; }
    text = forSpeech(text);
    if (!text) { opts.onDone && opts.onDone(); return; }
    // Pause recognition while speaking so Jenny doesn't hear herself
    if (listening) { try { recognition.stop(); } catch (e) {} }
    const run = () => speakSegments(segmentize(text, cfg.lang || 'de-DE'), opts);
    if (!voices.length) {
      loadVoices();
      if (!voices.length) { // wait once for voices
        const once = () => { window.speechSynthesis.removeEventListener('voiceschanged', once); loadVoices(); run(); };
        window.speechSynthesis.addEventListener('voiceschanged', once);
        setTimeout(() => { if (!voices.length) run(); }, 600);
        return;
      }
    }
    run();
  }
  function cancelSpeak() {
    speaking = false;
    if (keepAlive) { clearInterval(keepAlive); keepAlive = null; }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }

  return {
    supported: !!SR,
    ttsSupported: !!window.speechSynthesis,
    startConversation, stopConversation,
    speak, cancelSpeak,
    getVoices: loadVoices,
    setSpeechConfig(c) { Object.assign(cfg, c); },
    setLang(code) {
      const full = (code && code.indexOf('-') > 0) ? code : (LANGMAP[code] || 'de-DE');
      cfg.lang = full;
      if (recognition) { try { recognition.lang = full; } catch (e) {} } else { recogLangPending = full; }
    },
    getLang: () => cfg.lang,
    hasVoiceFor(code) { const full = LANGMAP[code] || code || 'de'; return !!voiceForLang(full.slice(0, 2)); },
    on(h) { handlers = h; },
    isListening: () => wantListen,
  };
})();
