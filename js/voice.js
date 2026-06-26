/* JENNY Voice — speech recognition (input) + speech synthesis (output) + mic level */
window.JennyVoice = (function () {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let listening = false;
  let onResult = null, onPartial = null, onEnd = null, onLevel = null;

  // ---- Mic level meter (Web Audio) ----
  let audioCtx, analyser, micStream, levelRAF;
  async function startLevelMeter() {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const src = audioCtx.createMediaStreamSource(micStream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        let sum = 0; for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / data.length / 255;
        if (onLevel) onLevel(Math.min(1, avg * 2.2));
        levelRAF = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) { /* mic denied — orb still works */ }
  }
  function stopLevelMeter() {
    if (levelRAF) cancelAnimationFrame(levelRAF);
    if (micStream) micStream.getTracks().forEach(t => t.stop());
    micStream = null;
    if (onLevel) onLevel(0);
  }

  // ---- Recognition ----
  function init() {
    if (!SR) return false;
    recognition = new SR();
    recognition.lang = 'de-DE';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (e) => {
      let finalText = '', interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t; else interim += t;
      }
      if (interim && onPartial) onPartial(interim);
      if (finalText && onResult) onResult(finalText.trim());
    };
    recognition.onend = () => { listening = false; stopLevelMeter(); if (onEnd) onEnd(); };
    recognition.onerror = () => { listening = false; stopLevelMeter(); if (onEnd) onEnd(); };
    return true;
  }

  function listen() {
    if (!recognition && !init()) return false;
    if (listening) return true;
    listening = true;
    startLevelMeter();
    try { recognition.start(); } catch (e) {}
    return true;
  }
  function stop() {
    if (recognition && listening) { try { recognition.stop(); } catch (e) {} }
    stopLevelMeter();
  }

  // ---- Synthesis ----
  let voices = [];
  let cfg = { voiceURI: null, pitch: 1, rate: 1, enabled: true };
  function loadVoices() {
    voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
    return voices;
  }
  if (window.speechSynthesis) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }
  function speak(text, { onStart, onDone } = {}) {
    if (!window.speechSynthesis || !cfg.enabled || !text) { onDone && onDone(); return; }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = voices.find(v => v.voiceURI === cfg.voiceURI);
    if (v) u.voice = v; else { const de = voices.find(v => v.lang.startsWith('de')); if (de) u.voice = de; }
    u.lang = (u.voice && u.voice.lang) || 'de-DE';
    u.pitch = cfg.pitch; u.rate = cfg.rate;
    u.onstart = () => onStart && onStart();
    u.onend = () => onDone && onDone();
    window.speechSynthesis.speak(u);
  }
  function cancelSpeak() { if (window.speechSynthesis) window.speechSynthesis.cancel(); }

  return {
    supported: !!SR,
    listen, stop,
    speak, cancelSpeak,
    getVoices: loadVoices,
    setSpeechConfig(c) { Object.assign(cfg, c); },
    on(handlers) { onResult = handlers.result; onPartial = handlers.partial; onEnd = handlers.end; onLevel = handlers.level; },
    isListening: () => listening,
  };
})();
