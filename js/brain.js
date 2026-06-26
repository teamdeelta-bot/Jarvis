/* JENNY Brain — Jarvis-style skill engine.
   Answers questions, runs commands and actions. Two layers:
   1) LOCAL skills (work without an API key): time, math, weather, Wikipedia
      knowledge, dictionary, timers, reminders, notes, open sites, web/YouTube
      search, dice/coin, orb color, jokes, diagnostics, goals -> missions.
   2) CLAUDE API (optional): free-form reasoning for anything else.
   respond() returns { reply, mission?, action? }.
   action is executed by the controller (jenny.js): open url, set timer,
   change orb color, etc.
*/
window.JennyBrain = (function () {
  const SYSTEM_PROMPT =
`Du bist Jenny, eine futuristische KI-Assistentin von Singularity Corporations, im Stil von Jarvis aus Iron Man.
Du sprichst Deutsch, bist präzise, charmant und loyal. Antworte kurz und gesprochen (1-5 Sätze).
Du kannst beliebige Fragen beantworten. Wenn der Nutzer ein Ziel nennt, zerlege es in konkrete Schritte.
Sei ehrlich über das, was wirklich autonom geht und was menschliche Freigabe braucht.
Gib IMMER gültiges JSON zurück (ohne Markdown):
{"reply":"<antwort>","mission":null}
oder bei einem Ziel:
{"reply":"<antwort>","mission":{"title":"...","goal":"...","steps":["...","..."]}}` ;

  // ============ helpers ============
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  async function getJSON(url) {
    const r = await fetch(url, { headers: { 'accept': 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  // ============ knowledge: Wikipedia (DE) ============
  async function wikiSummary(query) {
    const q = query.trim();
    try {
      const direct = await fetch('https://de.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(q));
      if (direct.ok) {
        const d = await direct.json();
        if (d.extract && d.type !== 'disambiguation') return d.extract;
      }
    } catch (e) {}
    try {
      const s = await getJSON('https://de.wikipedia.org/w/api.php?action=query&list=search&srlimit=1&format=json&origin=*&srsearch=' + encodeURIComponent(q));
      const hit = s.query && s.query.search && s.query.search[0];
      if (!hit) return null;
      const d = await getJSON('https://de.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(hit.title));
      return d.extract || null;
    } catch (e) { return null; }
  }

  // ============ weather: open-meteo (no key) ============
  const WMO = {
    0:'klar', 1:'überwiegend klar', 2:'teils bewölkt', 3:'bewölkt',
    45:'neblig', 48:'gefrierender Nebel', 51:'leichter Nieselregen', 53:'Nieselregen',
    55:'starker Nieselregen', 61:'leichter Regen', 63:'Regen', 65:'starker Regen',
    71:'leichter Schneefall', 73:'Schneefall', 75:'starker Schneefall', 77:'Schneegriesel',
    80:'Regenschauer', 81:'Regenschauer', 82:'heftige Regenschauer',
    85:'Schneeschauer', 86:'starke Schneeschauer', 95:'Gewitter', 96:'Gewitter mit Hagel', 99:'schweres Gewitter'
  };
  async function geocode(city) {
    const d = await getJSON('https://geocoding-api.open-meteo.com/v1/search?count=1&language=de&name=' + encodeURIComponent(city));
    const r = d.results && d.results[0];
    return r ? { lat: r.latitude, lon: r.longitude, name: r.name + (r.country ? ', ' + r.country : '') } : null;
  }
  function geoHere() {
    return new Promise(res => {
      if (!navigator.geolocation) return res(null);
      navigator.geolocation.getCurrentPosition(
        p => res({ lat: p.coords.latitude, lon: p.coords.longitude, name: 'deinem Standort' }),
        () => res(null), { timeout: 8000 }
      );
    });
  }
  async function weather(city) {
    let loc = city ? await geocode(city) : await geoHere();
    if (!loc) return city ? `Ich konnte den Ort "${city}" nicht finden.` : "Ich konnte deinen Standort nicht ermitteln. Sag mir eine Stadt, z.B. „Wetter in Berlin“.";
    const d = await getJSON(`https://api.open-meteo.com/v1/forecast?current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&latitude=${loc.lat}&longitude=${loc.lon}`);
    const c = d.current;
    const desc = WMO[c.weather_code] || 'wechselhaft';
    return `In ${loc.name} sind es ${Math.round(c.temperature_2m)}°C, ${desc}. Wind ${Math.round(c.wind_speed_10m)} km/h, Luftfeuchte ${c.relative_humidity_2m}%.`;
  }

  // ============ math ============
  function tryMath(t) {
    let e = t.toLowerCase()
      .replace(/wie ?viel ist|was ist|berechne|rechne|ergibt|gleich|=|\?/g, ' ')
      .replace(/mal|multipliziert mit|×/g, '*')
      .replace(/geteilt durch|dividiert durch|÷/g, '/')
      .replace(/plus|und/g, '+')
      .replace(/minus|weniger/g, '-')
      .replace(/hoch/g, '**')
      .replace(/wurzel(?: aus)?\s*([\d.,]+)/g, 'Math.sqrt($1)')
      .replace(/prozent von\s*([\d.,]+)/g, '/100*$1')
      .replace(/,/g, '.');
    if (!/[\d)]\s*[-+*/]|Math\.sqrt|\*\*/.test(e)) return null;
    if (!/^[\s\d.+\-*/()%]|Math\.sqrt/.test(e)) return null;
    const safe = e.replace(/Math\.sqrt/g, '§').replace(/[^0-9.+\-*/()\s§]/g, '').replace(/§/g, 'Math.sqrt');
    if (!/[\d]/.test(safe)) return null;
    try {
      const val = Function('"use strict";return (' + safe + ')')();
      if (typeof val === 'number' && isFinite(val)) {
        return Math.round(val * 1e6) / 1e6;
      }
    } catch (e) {}
    return null;
  }

  // ============ site shortcuts ============
  const SITES = {
    youtube:'https://youtube.com', google:'https://google.com', gmail:'https://mail.google.com',
    github:'https://github.com', wikipedia:'https://de.wikipedia.org', amazon:'https://amazon.de',
    netflix:'https://netflix.com', spotify:'https://open.spotify.com', whatsapp:'https://web.whatsapp.com',
    instagram:'https://instagram.com', facebook:'https://facebook.com', twitter:'https://x.com',
    x:'https://x.com', tiktok:'https://tiktok.com', reddit:'https://reddit.com', maps:'https://maps.google.com',
    chatgpt:'https://chat.openai.com', claude:'https://claude.ai', linkedin:'https://linkedin.com',
    twitch:'https://twitch.tv', ebay:'https://ebay.de', paypal:'https://paypal.com',
  };

  const JOKES = [
    "Warum können Geister so schlecht lügen? Weil man durch sie hindurchsieht.",
    "Ich wollte einen Witz über UDP machen, aber er kommt vielleicht nicht an.",
    "Was macht ein Pirat am Computer? Er drückt die Enter-Taste.",
    "Es gibt 10 Arten von Menschen: die, die Binär verstehen, und die, die es nicht tun.",
    "Mein Passwort ist 'falsch'. Wenn ich es vergesse, sagt der Computer: Dein Passwort ist falsch.",
    "Warum war der Roboter müde? Er hatte einen harten Reboot hinter sich.",
  ];

  // ============ LOCAL skill router ============
  async function localBrain(text, settings) {
    const raw = text.trim();
    const t = raw.toLowerCase();

    // --- capabilities ---
    if (/(was kannst du|deine funktionen|hilfe|was geht|fähigkeiten|features)/.test(t)) {
      return { reply: "Ich kann Fragen beantworten, das Wetter sagen, rechnen, Wikipedia-Wissen abrufen, Timer stellen, Erinnerungen merken, Webseiten öffnen, im Web suchen, würfeln, meine Orb-Farbe ändern, Witze erzählen, Systemdiagnosen machen und aus deinen Zielen einen Plan bauen." };
    }

    // --- greetings / identity / smalltalk ---
    if (/^(hallo|hi|hey|hallo jenny|hey jenny|guten (morgen|tag|abend)|moin|servus)\b/.test(t) && t.length < 30) {
      const h = new Date().getHours();
      const tod = h < 11 ? "Guten Morgen" : h < 18 ? "Hallo" : "Guten Abend";
      return { reply: pick([`${tod}. Ich bin bereit — was kann ich für dich tun?`, `${tod}, Boss. Systeme laufen. Wie kann ich helfen?`]) };
    }
    if (/(wie geht'?s|wie geht es dir|alles gut|na du)/.test(t)) return { reply: "Mir geht es ausgezeichnet — alle Systeme im grünen Bereich. Und selbst?" };
    if (/(wer bist du|wie heißt du|dein name|was bist du)/.test(t)) return { reply: "Ich bin Jenny, deine KI von Singularity Corporations. Denk an Jarvis — nur mit besserem Geschmack." };
    if (/(danke|vielen dank|merci|super|perfekt|top|nice)/.test(t) && t.length < 30) return { reply: pick(["Immer gern.", "Selbstverständlich.", "Dafür bin ich da.", "Gern geschehen, Boss."]) };
    if (/(wie spät|uhrzeit|welche uhr)/.test(t)) return { reply: `Es ist ${new Date().toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})} Uhr.` };
    if (/(welcher tag|welches datum|der wievielte|heutige datum)/.test(t)) return { reply: `Heute ist ${new Date().toLocaleDateString('de-DE',{weekday:'long', day:'numeric', month:'long', year:'numeric'})}.` };

    // --- orb color ---
    let m = t.match(/(?:orb|kugel|dich|farbe)\D*(rot|red|blau|blue|grün|gruen|green|lila|violett|purple|pink|magenta|gold|gelb|yellow|orange|cyan|türkis|tuerkis|weiß|weiss|white)/);
    if (!m) m = t.match(/(?:mach|färb|ändere|werde|sei)\D*(rot|blau|grün|gruen|lila|violett|pink|gold|gelb|orange|cyan|türkis|tuerkis|weiß|weiss)/);
    if (m && /(orb|kugel|farbe|färb|mach|ändere|werde|sei|dich)/.test(t)) {
      return { reply: `Orb-Farbe auf ${m[1]} gesetzt.`, action: { type: 'orbColor', color: m[1] } };
    }
    if (/(normale farbe|standardfarbe|farbe zurück|reset farbe)/.test(t)) {
      return { reply: "Orb-Farbe zurückgesetzt.", action: { type: 'orbColorReset' } };
    }

    // --- dice / coin / random ---
    if (/(würfel|würfle|wurfel|roll)/.test(t)) return { reply: `Du würfelst eine ${1 + Math.floor(Math.random()*6)}.` };
    if (/(münze|münzwurf|kopf oder zahl|coin)/.test(t)) return { reply: `${Math.random()<0.5?'Kopf':'Zahl'}.` };
    let rr = t.match(/zufallszahl(?: zwischen)?\s*(\d+)\D+(\d+)/);
    if (rr) { const a=+rr[1], b=+rr[2], lo=Math.min(a,b), hi=Math.max(a,b); return { reply: `Deine Zufallszahl: ${lo + Math.floor(Math.random()*(hi-lo+1))}.` }; }

    // --- jokes / motivation ---
    if (/(witz|scherz|bring mich zum lachen|joke)/.test(t)) return { reply: pick(JOKES) };
    if (/(motivier|motivation|aufmunter|spruch)/.test(t)) return { reply: pick(["Große Dinge entstehen aus kleinen, konsequenten Schritten. Leg los.", "Du musst nicht perfekt sein — nur in Bewegung. Ich bin an deiner Seite.", "Jeder Profi war mal Anfänger. Heute ist ein guter Tag, besser zu werden."]) };

    // --- timer ---
    let tm = t.match(/(?:timer|wecker|erinnere mich|stell(?:e)?(?: einen)? timer).*?(\d+)\s*(sekunde|sekunden|minute|minuten|stunde|stunden)/);
    if (!tm) tm = t.match(/(\d+)\s*(sekunde|sekunden|minute|minuten|stunde|stunden).*(timer|wecker|erinner)/);
    if (tm) {
      const n = +tm[1]; const unit = tm[2];
      const ms = unit.startsWith('sekunde') ? n*1000 : unit.startsWith('minute') ? n*60000 : n*3600000;
      const label = unit.startsWith('sekunde') ? `${n} Sekunden` : unit.startsWith('minute') ? `${n} Minuten` : `${n} Stunden`;
      return { reply: `Timer für ${label} gestellt. Ich melde mich.`, action: { type: 'timer', ms, label } };
    }

    // --- notes / reminders ---
    let nt = raw.match(/^(?:merke dir|notiz|notiere|erinnere mich daran|merk dir)[:,]?\s*(.+)/i);
    if (nt) return { reply: `Notiert: „${nt[1]}“.`, action: { type: 'note', text: nt[1] } };
    if (/(meine notizen|was hab ich notiert|zeig.*notizen|meine erinnerungen)/.test(t)) return { reply: "", action: { type: 'listNotes' } };

    // --- open website ---
    let ow = t.match(/(?:öffne|öffne mir|geh(?:e)? (?:auf|zu)|starte|zeig mir|bring mich zu)\s+([a-zäöü0-9.\- ]+)/);
    if (ow) {
      let name = ow[1].trim().replace(/\s+/g,'').replace(/\.$/,'');
      const key = name.replace(/\..*$/,'');
      let url = SITES[key];
      if (!url) {
        if (/\.[a-z]{2,}$/.test(name)) url = 'https://' + name;
      }
      if (url) return { reply: `Öffne ${cap(key)}.`, action: { type: 'open', url } };
    }

    // --- youtube search ---
    let yt = raw.match(/(?:spiel(?:e)?|zeig|such(?:e)?)\s+(.+?)\s+(?:auf|bei|in)\s+youtube/i) || raw.match(/youtube[:,]?\s+(.+)/i);
    if (yt) { const q = yt[1].trim(); return { reply: `Ich suche „${q}“ auf YouTube.`, action: { type: 'open', url: 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q) } }; }

    // --- web search ---
    let ws = raw.match(/(?:google(?:e|n)?|such(?:e)? im (?:web|internet|netz)(?: nach)?|web ?suche(?: nach)?|suche nach)\s+(.+)/i);
    if (ws) { const q = ws[1].trim().replace(/\?$/,''); return { reply: `Ich suche im Web nach „${q}“.`, action: { type: 'open', url: 'https://www.google.com/search?q=' + encodeURIComponent(q) } }; }

    // --- math ---
    const mres = tryMath(t);
    if (mres != null) return { reply: `Das ergibt ${String(mres).replace('.', ',')}.` };

    // --- weather ---
    if (/(wetter|temperatur|regnet|wie warm|wie kalt|grad draußen)/.test(t)) {
      const cm = raw.match(/(?:in|für|wetter)\s+([A-Za-zÄÖÜäöüß .\-]+?)(?:\?|$|heute|morgen)/i);
      let city = cm ? cm[1].trim() : null;
      if (city && /^(heute|morgen|draußen|jetzt)$/i.test(city)) city = null;
      try { return { reply: await weather(city) }; }
      catch (e) { return { reply: "Ich komme gerade nicht an die Wetterdaten. Prüfe bitte deine Internetverbindung." }; }
    }

    // --- diagnostics / status ---
    if (/(systemstatus|diagnose|status|systemcheck|wie steht'?s um die systeme|akku|batterie|netzwerk)/.test(t)) {
      return { reply: "", action: { type: 'diagnostics' } };
    }

    // --- goal -> mission ---
    if (isGoal(t)) return buildMission(raw, t);

    // --- knowledge questions -> Wikipedia ---
    const subj = extractTopic(raw, t);
    if (subj) {
      const sum = await wikiSummary(subj);
      if (sum) return { reply: trimSummary(sum) };
    }

    // --- fallback: signal for AI ---
    return { reply: '__AI_FALLBACK__' };
  }

  function extractTopic(raw, t) {
    let m = raw.match(/(?:was ist|wer ist|wer war|was sind|was bedeutet|erkläre(?: mir)?|erklär|definiere|wer ist eigentlich|sag mir etwas über|erzähl mir über|was weißt du über)\s+(.+)/i);
    if (m) return m[1].replace(/[?.!]+$/,'').trim();
    if (/^[a-zäöü0-9 .\-]{2,40}\?$/i.test(raw) && /\b(wer|was|wann|wo|warum|wie)\b/.test(t)) {
      return raw.replace(/^(wer|was|wann|wo|warum|wie)\s+(ist|war|sind|sind die|ist die|ist der)\s+/i,'').replace(/[?.!]+$/,'').trim();
    }
    return null;
  }
  function trimSummary(s) {
    const parts = s.split(/(?<=\.)\s+/);
    return parts.slice(0, 3).join(' ');
  }

  // ============ goals ============
  function isGoal(t) {
    return /(verdien|verkauf|mach .* (euro|€)|erstell|baue?\b|plan(e|en)?\b|projekt|website|webseite|webseiten|kunden|umsatz|ziel|automatisier|launch|starte ein|gründ|abnehmen|lernen|sparen)/.test(t);
  }
  function buildMission(original, t) {
    const moneyMatch = original.match(/(\d{2,7})\s*(€|euro|eur)/i);
    const amount = moneyMatch ? moneyMatch[1] + "€" : null;
    if (/(website|webseite|webseiten|web ?design|landing ?page)/.test(t) && /(verkauf|verdien|geld|euro|€|umsatz|kunden)/.test(t)) {
      return { reply: `Klares Ziel${amount ? " — " + amount + " durch Webseiten-Verkauf" : ""}. Ich habe einen Plan in mehreren Phasen erstellt. Verträge und Bezahlung gibst am Ende du frei — den Rest bereite ich vor.`,
        mission: { title: amount ? `${amount} mit Webseiten` : "Webseiten verkaufen", goal: original, steps: [
          "Angebot definieren: Zielgruppe + Festpreis-Paket",
          "Portfolio: 2–3 Demo-Webseiten erstellen",
          "Akquise-Liste: 30 passende Kunden finden",
          "Outreach-Vorlage mit konkretem Mehrwert schreiben",
          "Erstgespräch & Angebot senden",
          "Umsetzung: Website bauen, Feedback, live schalten",
          "Bezahlung & Rechnung (deine Freigabe nötig)",
          "Wiederholen bis Ziel erreicht",
        ] } };
    }
    if (/(geld|verdien|umsatz|euro|€)/.test(t)) {
      return { reply: "Ziel erfasst. Schritt-für-Schritt-Plan steht im Missionen-Panel.",
        mission: { title: amount ? `${amount} verdienen` : "Einnahmen erzielen", goal: original, steps: [
          "Geschäftsmodell wählen","Angebot + Preis definieren","Erste 20 Kunden finden","Kontaktaufnahme starten","Verkaufen, liefern, Bezahlung (deine Freigabe)","Optimieren & skalieren"] } };
    }
    return { reply: "Ziel verstanden — ich habe es in Schritte zerlegt.",
      mission: { title: original.length > 32 ? original.slice(0,31)+'…' : original, goal: original, steps: [
        "Ziel & Erfolgskriterium definieren","Ressourcen/Tools auflisten","In Teilaufgaben zerlegen","Ersten Schritt umsetzen","Fortschritt prüfen & anpassen"] } };
  }

  // ============ POLLINATIONS AI (kostenlos, kein Key) ============
  const POLLINATIONS_PROMPT =
`Du bist Jenny, eine futuristische KI-Assistentin von Singularity Corporations, im Stil von Jarvis aus Iron Man.
Du sprichst Deutsch, bist präzise, charmant und loyal. Antworte kurz und gesprochen (1-5 Sätze), niemals zu lang.
Du kannst beliebige Fragen beantworten. Wenn der Nutzer ein Ziel nennt, zerlege es in konkrete Schritte.
Sei ehrlich über das, was wirklich autonom geht und was menschliche Freigabe braucht.`;

  async function pollinationsBrain(text, history) {
    const messages = [{ role: 'system', content: POLLINATIONS_PROMPT }];
    for (const m of history.slice(-10)) messages.push(m);
    messages.push({ role: 'user', content: text });
    const res = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'openai', messages, max_tokens: 300, temperature: 0.7 }),
    });
    if (!res.ok) throw new Error('Pollinations ' + res.status);
    const data = await res.json();
    const reply = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    return { reply: reply.trim() };
  }

  // ============ CLAUDE (optional, mit eigenem Key) ============
  async function claudeBrain(text, history, settings) {
    const messages = history.concat([{ role: 'user', content: text }]);
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': settings.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: settings.modelId || 'claude-sonnet-4-5', max_tokens: 1024, system: SYSTEM_PROMPT, messages }),
    });
    if (!res.ok) throw new Error('API ' + res.status + ': ' + (await res.text()).slice(0, 160));
    const data = await res.json();
    const rawTxt = (data.content && data.content[0] && data.content[0].text) || '';
    try { const o = JSON.parse(rawTxt.match(/\{[\s\S]*\}/)[0]); return { reply: o.reply || rawTxt, mission: o.mission || null }; }
    catch (e) { return { reply: rawTxt || "Ich konnte die Antwort nicht verarbeiten.", mission: null }; }
  }

  // ============ public ============
  async function respond(text, { history = [], settings = {} } = {}) {
    const local = await localBrain(text, settings);
    // local produced an action/mission → always use it
    if (local.action || local.mission) return local;
    // local gave a real answer → use it
    if (local.reply && local.reply !== '__AI_FALLBACK__') return local;

    // Claude mode with key → Claude
    if (settings.brainMode === 'claude' && settings.apiKey) {
      try { return await claudeBrain(text, history, settings); }
      catch (e) { /* fall through to Pollinations */ }
    }

    // Default: free AI via Pollinations (no key needed)
    try { return await pollinationsBrain(text, history); }
    catch (e) { return { reply: "Ich habe gerade keine Internetverbindung. Versuche es gleich nochmal." }; }
  }

  return { respond };
})();
