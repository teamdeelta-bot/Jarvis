/* JENNY Brain — turns user input into replies + actionable mission plans.
   Two modes:
   - "local": offline heuristic brain (no internet, works instantly)
   - "claude": real reasoning via the Anthropic API (needs an API key)
*/
window.JennyBrain = (function () {
  const SYSTEM_PROMPT =
`Du bist Jenny, eine futuristische, selbstbewusste KI-Assistentin im Stil von Jarvis aus Iron Man.
Du sprichst Deutsch, bist präzise, ruhig und loyal und nennst den Nutzer "Sir" oder "Boss" nur wenn es passt.
Wenn der Nutzer ein Ziel nennt (z.B. Geld verdienen, ein Projekt umsetzen), zerlege es in konkrete, realistische Schritte.
Sei ehrlich über das, was du tatsächlich autonom tun kannst und was menschliche Freigabe/Accounts/Bezahlung braucht.
Antworte kurz und gesprochen (1-4 Sätze), als würdest du laut mit dem Nutzer reden.

Gib IMMER gültiges JSON zurück, GENAU in diesem Format, ohne Markdown:
{"reply":"<kurze gesprochene Antwort>","mission":null}
ODER wenn der Nutzer ein Ziel/eine Aufgabe nennt:
{"reply":"<kurze gesprochene Antwort>","mission":{"title":"<kurzer Titel>","goal":"<das Ziel>","steps":["Schritt 1","Schritt 2","..."]}}`;

  // ---------- LOCAL fallback brain ----------
  function localBrain(text) {
    const t = text.toLowerCase();

    // Greetings / status
    if (/\b(hallo|hi|hey|guten (tag|morgen|abend)|jenny\??)\b/.test(t) && t.length < 30) {
      return { reply: pick([
        "Ich bin online und einsatzbereit. Was ist unser Ziel?",
        "Systeme laufen. Sag mir, woran wir arbeiten.",
        "Hier bin ich. Womit kann ich dich unterstützen?",
      ]) };
    }
    if (/wie geht|alles (gut|klar)|status/.test(t)) {
      return { reply: "Alle Systeme nominal. Energie bei 100 Prozent. Bereit für deinen Auftrag." };
    }
    if (/(wer|was) bist du|dein name/.test(t)) {
      return { reply: "Ich bin Jenny — deine persönliche KI. Denk an Jarvis, nur mit besserem Geschmack." };
    }
    if (/(danke|super|perfekt|cool)/.test(t)) {
      return { reply: pick(["Immer gern.", "Selbstverständlich.", "Dafür bin ich da."]) };
    }
    if (/(uhrzeit|wie spät|datum|welcher tag)/.test(t)) {
      const now = new Date();
      return { reply: `Es ist ${now.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})} am ${now.toLocaleDateString('de-DE')}.` };
    }

    // Goal detection -> build a mission
    if (isGoal(t)) {
      return buildMissionLocally(text, t);
    }

    return { reply: pick([
      "Verstanden. Formuliere es als Ziel, dann baue ich dir einen Plan.",
      "Interessant. Sag mir, was das Endergebnis sein soll, dann lege ich los.",
      "Ich höre. Was genau soll ich für dich erreichen?",
    ]) };
  }

  function isGoal(t) {
    return /(verdien|verkauf|mach .* (euro|€)|erstell|bau|plan|projekt|website|webseite|webseiten|kunden|geld|umsatz|ziel|automatisier|launch|starte|gründ)/.test(t);
  }

  function buildMissionLocally(original, t) {
    // Money via website sales -> a concrete realistic playbook
    const moneyMatch = original.match(/(\d{2,6})\s*(€|euro|eur)/i);
    const amount = moneyMatch ? moneyMatch[1] + "€" : null;

    if (/(website|webseite|webseiten|web ?design|landing ?page)/.test(t) && /(verkauf|verdien|geld|euro|€|umsatz|kunden)/.test(t)) {
      return {
        reply: `Klares Ziel${amount ? " — " + amount + " durch Webseiten-Verkauf" : ""}. Ich habe einen Plan in vier Phasen erstellt. Ehrlich gesagt: Verträge abschließen und Geld empfangen musst du am Ende selbst freigeben — den Rest bereite ich vor.`,
        mission: {
          title: amount ? `${amount} mit Webseiten` : "Webseiten verkaufen",
          goal: original,
          steps: [
            "Angebot definieren: Zielgruppe (z.B. lokale Handwerker, Restaurants) + Festpreis-Paket festlegen",
            "Portfolio bauen: 2–3 Demo-Webseiten als Vorzeigeobjekte erstellen",
            "Akquise-Liste: 30 potenzielle Kunden mit fehlender/schlechter Website finden",
            "Outreach-Vorlage: persönliche E-Mail/DM mit konkretem Mehrwert schreiben",
            "Erstgespräch & Angebot: Bedarf klären, Preis nennen, Angebot senden",
            "Umsetzung: Website erstellen, Feedback einarbeiten, live schalten",
            "Bezahlung & Rechnung: Zahlungslink/Rechnung erstellen (deine Freigabe nötig)",
            "Wiederholen, bis das Umsatzziel erreicht ist",
          ],
        },
      };
    }

    // Generic money goal
    if (/(geld|verdien|umsatz|euro|€)/.test(t)) {
      return {
        reply: `Ziel erfasst. Ich habe einen Schritt-für-Schritt-Plan angelegt. Sobald echte Accounts und Bezahlung angebunden sind, kann ich Teile davon automatisch ausführen.`,
        mission: {
          title: amount ? `${amount} verdienen` : "Einnahmen erzielen",
          goal: original,
          steps: [
            "Geschäftsmodell wählen (Dienstleistung, Produkt, digital)",
            "Konkretes Angebot + Preis definieren",
            "Erste 20 potenzielle Kunden identifizieren",
            "Kontaktaufnahme starten",
            "Verkaufen, liefern, Bezahlung einrichten (deine Freigabe)",
            "Optimieren und skalieren",
          ],
        },
      };
    }

    // Generic build/project goal
    return {
      reply: "Ziel verstanden. Ich habe es in umsetzbare Schritte zerlegt — siehe Missionen-Panel.",
      mission: {
        title: shorten(original, 32),
        goal: original,
        steps: [
          "Ziel und Erfolgskriterium klar definieren",
          "Nötige Ressourcen und Tools auflisten",
          "In Teilaufgaben zerlegen",
          "Ersten Schritt umsetzen",
          "Fortschritt prüfen und anpassen",
        ],
      },
    };
  }

  // ---------- CLAUDE brain ----------
  async function claudeBrain(text, history, settings) {
    const messages = history.concat([{ role: 'user', content: text }]);
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': settings.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: settings.modelId || 'claude-opus-4-8',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error('API ' + res.status + ': ' + err.slice(0, 160));
    }
    const data = await res.json();
    const raw = (data.content && data.content[0] && data.content[0].text) || '';
    return parseJSON(raw);
  }

  function parseJSON(raw) {
    try {
      const m = raw.match(/\{[\s\S]*\}/);
      const obj = JSON.parse(m ? m[0] : raw);
      return { reply: obj.reply || raw, mission: obj.mission || null };
    } catch (e) {
      return { reply: raw || "Ich habe die Antwort nicht verarbeiten können.", mission: null };
    }
  }

  // ---------- helpers ----------
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function shorten(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  // ---------- public ----------
  async function respond(text, { history = [], settings = {} } = {}) {
    if (settings.brainMode === 'claude' && settings.apiKey) {
      try { return await claudeBrain(text, history, settings); }
      catch (e) { return { reply: "Verbindung zum Hauptgehirn fehlgeschlagen, ich nutze den lokalen Modus. (" + e.message + ")", mission: localBrain(text).mission || null }; }
    }
    return localBrain(text);
  }

  return { respond };
})();
