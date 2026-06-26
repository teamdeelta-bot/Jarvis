/* JENNY — main controller: wires orb + voice + brain + UI together */
(function () {
  const $ = (id) => document.getElementById(id);

  const el = {
    statusDot: $('statusDot'), statusText: $('statusText'),
    orbCaption: $('orbCaption'), subtitle: $('subtitle'),
    micBtn: $('micBtn'), textInput: $('textInput'), sendBtn: $('sendBtn'),
    goalsBtn: $('goalsBtn'), goalsPanel: $('goalsPanel'), closeGoals: $('closeGoals'), goalsList: $('goalsList'),
    settingsBtn: $('settingsBtn'), settingsPanel: $('settingsPanel'), closeSettings: $('closeSettings'),
    brainMode: $('brainMode'), claudeSettings: $('claudeSettings'), apiKey: $('apiKey'), modelId: $('modelId'),
    voiceSelect: $('voiceSelect'), ttsToggle: $('ttsToggle'),
    pitch: $('pitch'), rate: $('rate'), pitchVal: $('pitchVal'), rateVal: $('rateVal'), testVoice: $('testVoice'),
    bootOverlay: $('bootOverlay'), bootBtn: $('bootBtn'),
  };

  // ---------- State ----------
  const store = {
    get: (k, d) => { try { return JSON.parse(localStorage.getItem('jenny.' + k)) ?? d; } catch { return d; } },
    set: (k, v) => localStorage.setItem('jenny.' + k, JSON.stringify(v)),
  };
  let settings = {
    brainMode: store.get('brainMode', 'local'),
    apiKey: store.get('apiKey', ''),
    modelId: store.get('modelId', 'claude-opus-4-8'),
    voiceURI: store.get('voiceURI', null),
    tts: store.get('tts', true),
    pitch: store.get('pitch', 1),
    rate: store.get('rate', 1),
  };
  let history = [];           // chat history for Claude
  let missions = store.get('missions', []);

  function setState(s, caption) {
    el.statusDot.className = 'dot ' + (s === 'idle' ? 'online' : s);
    el.statusText.textContent = { idle: 'Bereit', listening: 'Hört zu', thinking: 'Denkt', speaking: 'Spricht' }[s] || 'Online';
    el.orbCaption.textContent = caption || el.statusText.textContent;
    window.JennyOrb.setState(s);
  }

  // ---------- Voice config sync ----------
  function applyVoiceConfig() {
    JennyVoice.setSpeechConfig({ voiceURI: settings.voiceURI, pitch: settings.pitch, rate: settings.rate, enabled: settings.tts });
  }

  function populateVoices() {
    const voices = JennyVoice.getVoices();
    el.voiceSelect.innerHTML = '';
    const de = voices.filter(v => v.lang.startsWith('de'));
    const rest = voices.filter(v => !v.lang.startsWith('de'));
    [...de, ...rest].forEach(v => {
      const o = document.createElement('option');
      o.value = v.voiceURI; o.textContent = `${v.name} (${v.lang})`;
      if (v.voiceURI === settings.voiceURI) o.selected = true;
      el.voiceSelect.appendChild(o);
    });
    if (!settings.voiceURI && de[0]) { settings.voiceURI = de[0].voiceURI; }
  }
  if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = populateVoices;

  // ---------- Core interaction ----------
  let busy = false;
  async function handleInput(text) {
    if (!text || busy) return;
    busy = true;
    el.subtitle.textContent = '“' + text + '”';
    setState('thinking', 'Verarbeite…');

    const result = await JennyBrain.respond(text, { history, settings });

    history.push({ role: 'user', content: text });
    history.push({ role: 'assistant', content: JSON.stringify(result) });
    if (history.length > 16) history = history.slice(-16);

    if (result.mission) addMission(result.mission);

    let reply = result.reply;
    if (result.action) reply = executeAction(result.action, reply);

    speak(reply);
    busy = false;
  }

  // ---------- Action engine (Jarvis-style abilities) ----------
  function beep(times = 2) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      let t = ctx.currentTime;
      for (let i = 0; i < times; i++) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = 880;
        o.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
        o.start(t); o.stop(t + 0.26); t += 0.35;
      }
    } catch (e) {}
  }

  function executeAction(a, reply) {
    switch (a.type) {
      case 'open':
        setTimeout(() => window.open(a.url, '_blank', 'noopener'), 400);
        return reply;
      case 'orbColor':
        if (!window.JennyOrb.setColor(a.color)) return `Die Farbe ${a.color} kenne ich nicht. Ich kann z.B. rot, blau, grün, lila, gold oder cyan.`;
        return reply;
      case 'orbColorReset':
        window.JennyOrb.resetColor(); return reply;
      case 'timer': {
        const ms = a.ms, label = a.label;
        setTimeout(() => {
          beep(3);
          const msg = `Dein Timer über ${label} ist abgelaufen, Boss.`;
          notify('Timer abgelaufen', msg);
          speak(msg);
        }, ms);
        return reply;
      }
      case 'note': {
        const notes = store.get('notes', []);
        notes.unshift({ text: a.text, ts: Date.now() });
        store.set('notes', notes);
        return reply;
      }
      case 'listNotes': {
        const notes = store.get('notes', []);
        if (!notes.length) return "Du hast noch keine Notizen.";
        return "Deine Notizen: " + notes.slice(0, 5).map((n, i) => `${i + 1}. ${n.text}`).join('. ');
      }
      case 'diagnostics':
        setState('thinking', 'Diagnose…'); runDiagnostics(); return "";
    }
    return reply;
  }

  function notify(title, body) {
    try {
      if (window.Notification && Notification.permission === 'granted') new Notification(title, { body });
      else if (window.Notification && Notification.permission !== 'denied') Notification.requestPermission();
    } catch (e) {}
  }

  async function runDiagnostics() {
    const parts = [];
    parts.push(`Uhrzeit ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`);
    parts.push(navigator.onLine ? "Netzwerkverbindung stabil" : "keine Netzwerkverbindung");
    if (navigator.getBattery) {
      try { const b = await navigator.getBattery(); parts.push(`Energie bei ${Math.round(b.level * 100)} Prozent${b.charging ? ', wird geladen' : ''}`); } catch (e) {}
    }
    if (navigator.deviceMemory) parts.push(`${navigator.deviceMemory} Gigabyte Arbeitsspeicher`);
    if (navigator.hardwareConcurrency) parts.push(`${navigator.hardwareConcurrency} Prozessorkerne`);
    parts.push("Sprachsystem online");
    const msg = "Systemdiagnose abgeschlossen. " + parts.join(', ') + ". Alle Kernsysteme nominal.";
    speak(msg);
  }

  function speak(reply) {
    el.subtitle.textContent = reply;
    setState('speaking');
    JennyVoice.speak(reply, {
      onStart: () => setState('speaking'),
      onDone: () => setState('idle'),
    });
    if (!settings.tts) setState('idle');
  }

  // ---------- Missions ----------
  function addMission(m) {
    m.id = Date.now();
    m.steps = (m.steps || []).map(s => ({ text: typeof s === 'string' ? s : s.text, done: false }));
    missions.unshift(m);
    store.set('missions', missions);
    renderMissions();
    openPanel(el.goalsPanel);
  }

  function renderMissions() {
    if (!missions.length) {
      el.goalsList.innerHTML = '<p class="empty-hint">Noch keine Missionen. Gib Jenny ein Ziel und sie erstellt einen Plan.</p>';
      return;
    }
    el.goalsList.innerHTML = '';
    missions.forEach(m => {
      const done = m.steps.filter(s => s.done).length;
      const card = document.createElement('div');
      card.className = 'mission';
      card.innerHTML = `
        <h3>${escapeHtml(m.title)}</h3>
        <div class="goal-meta">${done}/${m.steps.length} Schritte • <button class="link-del" data-del="${m.id}" style="background:none;border:none;color:#ff5b6e;cursor:pointer;font-size:12px;">löschen</button></div>
        <ul>${m.steps.map((s, i) => `
          <li class="${s.done ? 'done' : ''}">
            <div class="step-box ${s.done ? 'done' : ''}" data-m="${m.id}" data-s="${i}">${s.done ? '✓' : ''}</div>
            <span>${escapeHtml(s.text)}</span>
          </li>`).join('')}</ul>`;
      el.goalsList.appendChild(card);
    });
    el.goalsList.querySelectorAll('.step-box').forEach(b => b.onclick = () => {
      const m = missions.find(x => x.id == b.dataset.m);
      if (m) { m.steps[b.dataset.s].done = !m.steps[b.dataset.s].done; store.set('missions', missions); renderMissions(); }
    });
    el.goalsList.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      missions = missions.filter(x => x.id != b.dataset.del); store.set('missions', missions); renderMissions();
    });
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // ---------- Panels ----------
  function openPanel(p) { document.querySelectorAll('.panel').forEach(x => { if (x !== p) x.classList.remove('open'); }); p.classList.add('open'); }
  function closePanel(p) { p.classList.remove('open'); }

  // ---------- Wire voice events ----------
  JennyVoice.on({
    listenStart: () => { el.micBtn.classList.add('active'); if (!busy) setState('listening', 'Sprich…'); },
    partial: (t) => { el.subtitle.textContent = t; },
    result: (t) => { handleInput(t); },
    end: () => { el.micBtn.classList.remove('active'); if (!busy) setState('idle'); },
    level: (v) => { window.JennyOrb.setLevel(v); },
    error: (code) => {
      el.micBtn.classList.remove('active');
      const msg = {
        'mic-denied': "Ich brauche Zugriff auf dein Mikrofon. Erlaube es in den Browser-Einstellungen (Schloss-Symbol neben der Adresse) und tippe wieder auf das Mikro.",
        'unsupported': "Spracherkennung läuft nur in Google Chrome (Desktop oder Android). Auf iPhone/Safari bitte das Textfeld nutzen — ich antworte trotzdem mit Stimme.",
        'network': "Die Spracherkennung braucht eine Internetverbindung. Bitte prüfe dein Netz.",
      }[code] || "Mit der Spracherkennung gab es ein Problem. Versuch es nochmal oder nutze das Textfeld.";
      speak(msg);
    },
  });

  function toggleMic() {
    if (JennyVoice.isListening()) { JennyVoice.stopConversation(); el.micBtn.classList.remove('active'); setState('idle'); return; }
    if (!JennyVoice.supported) {
      speak("Spracherkennung läuft nur in Google Chrome. Auf iPhone/Safari nutze bitte das Textfeld — ich antworte trotzdem mit Stimme.");
      return;
    }
    setState('listening', 'Sprich…');
    JennyVoice.startConversation();
  }

  // ---------- UI bindings ----------
  el.micBtn.onclick = toggleMic;
  el.sendBtn.onclick = () => { const v = el.textInput.value.trim(); el.textInput.value = ''; handleInput(v); };
  el.textInput.addEventListener('keydown', e => { if (e.key === 'Enter') el.sendBtn.click(); });

  el.goalsBtn.onclick = () => openPanel(el.goalsPanel);
  el.closeGoals.onclick = () => closePanel(el.goalsPanel);
  el.settingsBtn.onclick = () => openPanel(el.settingsPanel);
  el.closeSettings.onclick = () => closePanel(el.settingsPanel);

  // settings
  el.brainMode.value = settings.brainMode;
  el.claudeSettings.classList.toggle('hidden', settings.brainMode !== 'claude');
  el.apiKey.value = settings.apiKey;
  el.modelId.value = settings.modelId;
  el.ttsToggle.checked = settings.tts;
  el.pitch.value = settings.pitch; el.pitchVal.textContent = settings.pitch;
  el.rate.value = settings.rate; el.rateVal.textContent = settings.rate;

  el.brainMode.onchange = () => { settings.brainMode = el.brainMode.value; store.set('brainMode', settings.brainMode); el.claudeSettings.classList.toggle('hidden', settings.brainMode !== 'claude'); };
  el.apiKey.onchange = () => { settings.apiKey = el.apiKey.value.trim(); store.set('apiKey', settings.apiKey); };
  el.modelId.onchange = () => { settings.modelId = el.modelId.value.trim(); store.set('modelId', settings.modelId); };
  el.voiceSelect.onchange = () => { settings.voiceURI = el.voiceSelect.value; store.set('voiceURI', settings.voiceURI); applyVoiceConfig(); };
  el.ttsToggle.onchange = () => { settings.tts = el.ttsToggle.checked; store.set('tts', settings.tts); applyVoiceConfig(); };
  el.pitch.oninput = () => { settings.pitch = +el.pitch.value; el.pitchVal.textContent = settings.pitch; store.set('pitch', settings.pitch); applyVoiceConfig(); };
  el.rate.oninput = () => { settings.rate = +el.rate.value; el.rateVal.textContent = settings.rate; store.set('rate', settings.rate); applyVoiceConfig(); };
  el.testVoice.onclick = () => { applyVoiceConfig(); JennyVoice.speak("Hallo, ich bin Jenny. Systeme sind online und bereit für deinen Auftrag."); };

  // ---------- Boot ----------
  el.bootBtn.onclick = () => {
    el.bootOverlay.classList.add('gone');
    window.JennyOrb.boot();
    populateVoices();
    applyVoiceConfig();
    renderMissions();
    setState('idle');
    setTimeout(() => speak("Jenny ist online. Willkommen bei Singularity Corporations. Du kannst mich alles fragen — Wissen, Wetter, Rechnen, Timer, Webseiten öffnen oder ein Ziel nennen. Womit fangen wir an?"), 400);
    try { if (window.Notification && Notification.permission === 'default') Notification.requestPermission(); } catch (e) {}
  };

  // start orb early (under overlay) so it's warm
  window.JennyOrb.boot();
})();
