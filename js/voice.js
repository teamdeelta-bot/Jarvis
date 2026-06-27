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
    recognition.lang = 'de-DE';
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
  let cfg = { voiceURI: null, pitch: 1, rate: 1, enabled: true };
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

  function pickVoice() {
    if (cfg.voiceURI) { const v = voices.find(v => v.voiceURI === cfg.voiceURI); if (v) return v; }
    return voices.find(v => /de[-_]/i.test(v.lang)) || voices.find(v => v.default) || voices[0] || null;
  }

  function doSpeak(text, opts) {
    const ss = window.speechSynthesis;
    ss.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) u.voice = v;
    u.lang = (v && v.lang) || 'de-DE';
    u.pitch = cfg.pitch; u.rate = cfg.rate; u.volume = 1;
    u.onstart = () => {
      speaking = true;
      // Chrome bug: synthesis pauses on long text -> keep it alive
      keepAlive = setInterval(() => { try { ss.pause(); ss.resume(); } catch (e) {} }, 9000);
      opts.onStart && opts.onStart();
    };
    const finish = () => {
      speaking = false;
      if (keepAlive) { clearInterval(keepAlive); keepAlive = null; }
      opts.onDone && opts.onDone();
      // resume listening after speaking, if in conversation mode
      if (wantListen) setTimeout(() => { if (wantListen && !listening) startRecognition(); }, 300);
    };
    u.onend = finish;
    u.onerror = finish;
    try { ss.resume(); } catch (e) {}
    ss.speak(u);
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
    if (!voices.length) {
      loadVoices();
      if (!voices.length) { // wait once for voices
        const once = () => { window.speechSynthesis.removeEventListener('voiceschanged', once); loadVoices(); doSpeak(text, opts); };
        window.speechSynthesis.addEventListener('voiceschanged', once);
        setTimeout(() => { if (!voices.length) doSpeak(text, opts); }, 600);
        return;
      }
    }
    doSpeak(text, opts);
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
    on(h) { handlers = h; },
    isListening: () => wantListen,
  };
})();
