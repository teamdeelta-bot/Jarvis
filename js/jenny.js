/* JENNY — main controller: wires orb + voice + brain + UI together */
(function () {
  const $ = (id) => document.getElementById(id);

  const el = {
    statusDot: $('statusDot'), statusText: $('statusText'), clock: $('clock'), dateNow: $('dateNow'),
    modeChip: $('modeChip'),
    telStatus: $('telStatus'), telMode: $('telMode'), telNet: $('telNet'), telBat: $('telBat'), telCores: $('telCores'),
    orbCaption: $('orbCaption'), subtitle: $('subtitle'), log: $('log'), tiles: $('tiles'), tilesToggle: $('tilesToggle'), clearChat: $('clearChat'),
    micBtn: $('micBtn'), textInput: $('textInput'), sendBtn: $('sendBtn'),
    goalsList: $('goalsList'), missionCount: $('missionCount'),
    settingsBtn: $('settingsBtn'), settingsPanel: $('settingsPanel'), closeSettings: $('closeSettings'),
    brainMode: $('brainMode'), claudeSettings: $('claudeSettings'), apiKey: $('apiKey'), modelId: $('modelId'),
    testClaude: $('testClaude'), claudeResult: $('claudeResult'),
    voiceSelect: $('voiceSelect'), voiceHint: $('voiceHint'), ttsToggle: $('ttsToggle'),
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
    modelId: store.get('modelId', 'claude-sonnet-4-5'),
    voiceURI: store.get('voiceURI', null),
    tts: store.get('tts', true),
    pitch: store.get('pitch', 1.1),
    rate: store.get('rate', 1.05),
  };
  let history = [];           // chat history for the AI
  let missions = store.get('missions', []);
  let logEmpty = true;

  function setState(s, caption) {
    el.statusDot.className = 'dot ' + (s === 'idle' ? 'online' : s);
    el.statusText.textContent = { idle: 'Bereit', listening: 'Hört zu', thinking: 'Denkt', speaking: 'Spricht' }[s] || 'Online';
    el.orbCaption.textContent = caption || el.statusText.textContent;
    window.JennyOrb.setState(s);
  }

  // ---------- Live clock + telemetry ----------
  function tickClock() {
    const d = new Date();
    if (el.clock) el.clock.textContent = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    if (el.dateNow) el.dateNow.textContent = d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase();
  }
  async function updateTelemetry() {
    const online = navigator.onLine;
    if (el.telStatus) el.telStatus.textContent = online ? 'Online' : 'Offline';
    if (el.telNet) el.telNet.textContent = online ? 'Stabil' : 'Getrennt';
    if (el.telCores) el.telCores.textContent = navigator.hardwareConcurrency ? navigator.hardwareConcurrency + ' Kerne' : '—';
    if (el.telBat) {
      if (navigator.getBattery) { try { const b = await navigator.getBattery(); el.telBat.textContent = Math.round(b.level * 100) + '%' + (b.charging ? ' ⚡' : ''); } catch (e) { el.telBat.textContent = 'n/a'; } }
      else el.telBat.textContent = 'n/a';
    }
    const modeTxt = settings.brainMode === 'claude' ? 'Claude API' : 'Jenny KI';
    if (el.telMode) el.telMode.textContent = modeTxt;
    if (el.modeChip) el.modeChip.textContent = modeTxt;
  }
  tickClock(); setInterval(tickClock, 15000);
  setInterval(updateTelemetry, 30000);

  // ---------- Voice config sync ----------
  function applyVoiceConfig() {
    JennyVoice.setSpeechConfig({ voiceURI: settings.voiceURI, pitch: settings.pitch, rate: settings.rate, enabled: settings.tts });
  }

  const FEMALE = /(female|frau|woman|girl|katja|vicki|hedda|marlene|petra|helena|ingrid|sara|lena|emma|mia|klara|hannah|amelie|paulina|anna|sandy|google deutsch|aria|jenny|sonia|seraphina)/i;
  const MALE = /(male|mann|stefan|conrad|klaus|hans|daniel|markus|google deutsch male)/i;
  const QUALITY = /(natural|neural|online|premium|enhanced|google|wavenet)/i;
  function scoreVoice(v) {
    let s = 0;
    if (/^de[-_]?DE/i.test(v.lang)) s += 40; else if (/^de/i.test(v.lang)) s += 25;
    const n = v.name || '';
    if (FEMALE.test(n)) s += 30;
    if (MALE.test(n) && !FEMALE.test(n)) s -= 30;
    if (QUALITY.test(n)) s += 15;
    if (/desktop/i.test(n)) s -= 8;
    if (v.localService === false) s += 5;
    return s;
  }
  function bestVoiceURI() {
    const voices = JennyVoice.getVoices();
    const de = voices.filter(v => /^de/i.test(v.lang));
    const pool = de.length ? de : voices;
    if (!pool.length) return null;
    return pool.slice().sort((a, b) => scoreVoice(b) - scoreVoice(a))[0].voiceURI;
  }
  function populateVoices() {
    const voices = JennyVoice.getVoices();
    el.voiceSelect.innerHTML = '';
    const de = voices.filter(v => v.lang.startsWith('de')).sort((a,b)=>scoreVoice(b)-scoreVoice(a));
    const rest = voices.filter(v => !v.lang.startsWith('de'));
    if (!settings.voiceURI) {
      const best = bestVoiceURI();
      if (best) { settings.voiceURI = best; store.set('voiceURI', best); applyVoiceConfig(); }
    }
    [...de, ...rest].forEach(v => {
      const o = document.createElement('option');
      const fem = FEMALE.test(v.name||'') ? ' ♀' : '';
      o.value = v.voiceURI; o.textContent = `${v.name} (${v.lang})${fem}`;
      if (v.voiceURI === settings.voiceURI) o.selected = true;
      el.voiceSelect.appendChild(o);
    });
    if (el.voiceHint) {
      const cur = voices.find(v => v.voiceURI === settings.voiceURI);
      el.voiceHint.textContent = cur
        ? `Aktiv: ${cur.name}. Tipp: „Google Deutsch“ oder „Microsoft Katja“ klingen am natürlichsten.`
        : `Tipp: Auf dem Handy (Chrome/Android) klingen die Google-Stimmen am natürlichsten.`;
    }
  }
  if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = populateVoices;

  // ---------- Transcript ----------
  function addBubble(role, text) {
    if (!text) return;
    if (logEmpty) { el.log.innerHTML = ''; logEmpty = false; }
    const b = document.createElement('div');
    b.className = 'bubble ' + (role === 'me' ? 'me' : 'jenny');
    b.textContent = text;
    el.log.appendChild(b);
    while (el.log.children.length > 40) el.log.removeChild(el.log.firstChild);
    el.log.scrollTop = el.log.scrollHeight;
  }

  // ---------- Agent: mission awareness ----------
  function activeMission() { return missions.find(m => m.steps.some(s => !s.done)) || null; }
  function nextStep(m) { const s = m && m.steps.find(x => !x.done); return s ? s.text : null; }

  // ---------- Core interaction ----------
  let busy = false;
  async function handleInput(text) {
    if (!text || busy) return;
    busy = true;
    addBubble('me', text);
    el.subtitle.textContent = '';

    // Agent follow-up: questions about the plan/progress answered from missions.
    if (/(mission|missionen|fortschritt|wie weit|nächste[rsn]? schritt|was steht an|als nächstes|to-?do|aufgaben|wo stehen wir|wie ist der plan|unser plan)/i.test(text)) {
      const m = activeMission();
      if (m) {
        const step = nextStep(m);
        const done = m.steps.filter(s => s.done).length;
        const reply = step
          ? `Unsere Mission „${m.title}“ läuft — ${done} von ${m.steps.length} erledigt. Nächster Schritt: ${step}. Sollen wir den angehen?`
          : `Unsere Mission „${m.title}“ ist komplett durch. Sauber. Worauf gehen wir als Nächstes?`;
        history.push({ role: 'user', content: text });
        history.push({ role: 'assistant', content: reply });
        speak(reply);
        busy = false;
        return;
      }
    }

    setState('thinking', 'Verarbeite…');

    const result = await JennyBrain.respond(text, { history, settings });

    history.push({ role: 'user', content: text });
    history.push({ role: 'assistant', content: result.reply || '' });
    if (history.length > 16) history = history.slice(-16);

    if (result.mission) addMission(result.mission);

    let reply = result.reply;
    if (result.action) reply = executeAction(result.action, reply);

    speak(reply);
    busy = false;
  }

  // ---------- Action engine ----------
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
        if (!window.JennyOrb.setColor(a.color)) return `Die Farbe ${a.color} kenn ich nicht. Probier mal rot, blau, grün, lila, gold oder cyan.`;
        return reply;
      case 'orbColorReset':
        window.JennyOrb.resetColor(); return reply;
      case 'timer': {
        const ms = a.ms, label = a.label;
        setTimeout(() => {
          beep(3);
          const msg = `Hey, dein Timer über ${label} ist um.`;
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
        if (!notes.length) return "Du hast noch keine Notizen bei mir.";
        return "Das hast du dir gemerkt: " + notes.slice(0, 5).map((n, i) => `${i + 1}. ${n.text}`).join('. ');
      }
      case 'copy': {
        try { if (navigator.clipboard) navigator.clipboard.writeText(a.text); } catch (e) {}
        return reply;
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
    parts.push(navigator.onLine ? "Netz steht" : "kein Netz gerade");
    if (navigator.getBattery) {
      try { const b = await navigator.getBattery(); parts.push(`Akku bei ${Math.round(b.level * 100)} Prozent${b.charging ? ' und am Laden' : ''}`); } catch (e) {}
    }
    if (navigator.hardwareConcurrency) parts.push(`${navigator.hardwareConcurrency} Kerne am Start`);
    parts.push("Sprachsystem läuft");
    const msg = "So, einmal alles durchgecheckt. " + parts.join('. ') + ". Läuft alles rund.";
    speak(msg);
  }

  function speak(reply) {
    if (!reply) { setState('idle'); return; }
    el.subtitle.textContent = reply;
    addBubble('jenny', reply);
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
  }

  function renderMissions() {
    if (el.missionCount) el.missionCount.textContent = missions.length;
    if (!missions.length) {
      el.goalsList.innerHTML = '<p class="empty-hint">Noch keine Missionen. Sag mir dein Ziel, ich bau den Plan.</p>';
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

  // ---------- Settings panel (slide-in) ----------
  function openSettings() { el.settingsPanel.classList.add('open'); }
  function closeSettings() { el.settingsPanel.classList.remove('open'); }

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
        'mic-denied': "Ich brauch kurz Zugriff aufs Mikro. Erlaub's im Browser (Schloss-Symbol neben der Adresse) und tipp wieder aufs Mikro.",
        'unsupported': "Spracherkennung läuft nur in Google Chrome (Desktop oder Android). Auf iPhone und Safari nimm einfach das Textfeld — ich antworte trotzdem mit Stimme.",
        'network': "Für die Spracherkennung brauch ich Internet. Schau mal kurz nach deinem Netz.",
      }[code] || "Mit der Spracherkennung hat was nicht geklappt. Versuch's nochmal oder nimm das Textfeld.";
      speak(msg);
    },
  });

  function toggleMic() {
    if (JennyVoice.isListening()) { JennyVoice.stopConversation(); el.micBtn.classList.remove('active'); setState('idle'); return; }
    if (!JennyVoice.supported) {
      speak("Spracherkennung läuft nur in Google Chrome. Auf iPhone und Safari nimm bitte das Textfeld — ich antworte trotzdem mit Stimme.");
      return;
    }
    setState('listening', 'Sprich…');
    JennyVoice.startConversation();
  }

  // ---------- UI bindings ----------
  el.micBtn.onclick = toggleMic;
  el.sendBtn.onclick = () => { const v = el.textInput.value.trim(); el.textInput.value = ''; handleInput(v); };
  el.textInput.addEventListener('keydown', e => { if (e.key === 'Enter') el.sendBtn.click(); });

  el.clearChat.onclick = () => { history = []; logEmpty = true; el.log.innerHTML = '<p class="empty-hint">Verlauf gelöscht. Frag mich was Neues.</p>'; };
  el.settingsBtn.onclick = openSettings;
  el.closeSettings.onclick = closeSettings;

  // settings
  el.brainMode.value = settings.brainMode;
  el.claudeSettings.classList.toggle('hidden', settings.brainMode !== 'claude');
  el.apiKey.value = settings.apiKey;
  el.modelId.value = settings.modelId;
  el.ttsToggle.checked = settings.tts;
  el.pitch.value = settings.pitch; el.pitchVal.textContent = settings.pitch;
  el.rate.value = settings.rate; el.rateVal.textContent = settings.rate;

  el.brainMode.onchange = () => { settings.brainMode = el.brainMode.value; store.set('brainMode', settings.brainMode); el.claudeSettings.classList.toggle('hidden', settings.brainMode !== 'claude'); updateTelemetry(); };
  el.apiKey.onchange = () => { settings.apiKey = el.apiKey.value.trim(); store.set('apiKey', settings.apiKey); };
  el.modelId.onchange = () => { settings.modelId = el.modelId.value.trim(); store.set('modelId', settings.modelId); };
  el.voiceSelect.onchange = () => { settings.voiceURI = el.voiceSelect.value; store.set('voiceURI', settings.voiceURI); applyVoiceConfig(); };
  el.ttsToggle.onchange = () => { settings.tts = el.ttsToggle.checked; store.set('tts', settings.tts); applyVoiceConfig(); };
  el.pitch.oninput = () => { settings.pitch = +el.pitch.value; el.pitchVal.textContent = settings.pitch; store.set('pitch', settings.pitch); applyVoiceConfig(); };
  el.rate.oninput = () => { settings.rate = +el.rate.value; el.rateVal.textContent = settings.rate; store.set('rate', settings.rate); applyVoiceConfig(); };
  el.testVoice.onclick = () => { applyVoiceConfig(); JennyVoice.speak("Hi ich bin Jenny. Schön dass du da bist — sag mir einfach was du brauchst."); };

  // feature tiles
  if (el.tiles) el.tiles.querySelectorAll('.tile').forEach(c => c.onclick = () => {
    if (c.dataset.fill != null) { el.textInput.value = c.dataset.fill; el.textInput.focus(); }
    else if (c.dataset.q) handleInput(c.dataset.q);
  });

  // collapsible tiles — default collapsed, remember last state
  function applyTilesState(open) {
    el.tiles.classList.toggle('collapsed', !open);
    el.tilesToggle.classList.toggle('open', open);
  }
  let tilesOpen = store.get('tilesOpen', false);
  applyTilesState(tilesOpen);
  el.tilesToggle.onclick = () => { tilesOpen = !tilesOpen; store.set('tilesOpen', tilesOpen); applyTilesState(tilesOpen); };

  // Claude connection test
  el.testClaude.onclick = async () => {
    const key = el.apiKey.value.trim(), model = el.modelId.value.trim() || 'claude-sonnet-4-5';
    settings.apiKey = key; settings.modelId = model; store.set('apiKey', key); store.set('modelId', model);
    if (!key) { el.claudeResult.className = 'test-result err'; el.claudeResult.textContent = '✕ Bitte zuerst einen API-Key eintragen.'; return; }
    el.claudeResult.className = 'test-result'; el.claudeResult.textContent = '… teste Verbindung …';
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model, max_tokens: 16, messages: [{ role: 'user', content: 'Sag nur: OK' }] }),
      });
      if (res.ok) { el.claudeResult.className = 'test-result ok'; el.claudeResult.textContent = '✓ Verbindung erfolgreich! Claude-Modus ist aktiv.'; }
      else {
        const txt = await res.text();
        let hint = '';
        if (res.status === 401) hint = ' → API-Key ungültig.';
        else if (res.status === 404 || /model/i.test(txt)) hint = ' → Modellname stimmt nicht. Probiere claude-sonnet-4-5.';
        else if (res.status === 400) hint = ' → Anfrage abgelehnt (oft Modellname).';
        else if (res.status === 429) hint = ' → Zu viele Anfragen / kein Guthaben.';
        el.claudeResult.className = 'test-result err';
        el.claudeResult.textContent = `✕ Fehler ${res.status}${hint}`;
      }
    } catch (e) {
      el.claudeResult.className = 'test-result err';
      el.claudeResult.textContent = '✕ Netzwerk/CORS-Fehler: ' + e.message;
    }
  };

  // ---------- Boot ----------
  el.bootBtn.onclick = () => {
    el.bootOverlay.classList.add('gone');
    window.JennyOrb.boot();
    populateVoices();
    applyVoiceConfig();
    renderMissions();
    updateTelemetry();
    setState('idle');
    setTimeout(() => {
      const m = activeMission();
      if (m) {
        const step = nextStep(m);
        speak(`Willkommen zurück. Unsere Mission „${m.title}“ läuft noch — nächster Schritt: ${step}. Sollen wir den anpacken oder hast du was anderes?`);
      } else {
        speak("Hey, ich bin Jenny — dein Agent hier bei Singularity Corporations. Sag mir dein Ziel, dann mach ich den Plan und treibe ihn voran. Womit legen wir los?");
      }
    }, 400);
    try { if (window.Notification && Notification.permission === 'default') Notification.requestPermission(); } catch (e) {}
  };

  // start orb early (under overlay) so it's warm
  window.JennyOrb.boot();
})();
