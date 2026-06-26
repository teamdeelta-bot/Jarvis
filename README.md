# JENNY — dein futuristisches KI-Interface

Ein Jarvis-inspiriertes Web-Interface mit einem großen, animierten Energie-Orb,
Sprachsteuerung und einem Ziel-/Missions-System. Sag Jenny dein Ziel — sie
antwortet mit Stimme und baut dir einen umsetzbaren Schritt-für-Schritt-Plan.

## Starten

Es ist eine reine Web-App (kein Build nötig).

```bash
# Im Projektordner einen kleinen Server starten:
python3 -m http.server 8080
# dann im Browser öffnen:
#   http://localhost:8080
```

> Wichtig: Über `http://localhost` (oder HTTPS) starten, **nicht** per
> Doppelklick auf die Datei. Mikrofon & Spracherkennung funktionieren nur
> in einem echten Server-Kontext. Empfohlen: **Google Chrome**.

1. Auf **„System aktivieren"** tippen (gibt dem Browser die Erlaubnis für Audio/Mikro).
2. Auf das **Mikro** tippen und sprechen — oder unten ins Textfeld tippen.
3. Beispiel: *„Verkaufe Webseiten für 500 Euro"* → Jenny legt eine Mission mit Plan an.

## Funktionen

- **Futuristischer Orb** (WebGL-Shader): pulsiert, verformt sich und reagiert in Echtzeit auf deine Stimme.
- **Sprachein- & -ausgabe** (Web Speech API): du sprichst, Jenny hört zu und antwortet laut.
- **Missionen / Ziele**: Jenny zerlegt Ziele in abhakbare Schritte (lokal gespeichert).
- **Zwei KI-Modi** (in den Einstellungen ⚙):
  - **Offline** – funktioniert sofort, ohne Internet (Demo-Gehirn).
  - **Claude API** – echtes Denken. Trage deinen Anthropic-API-Key ein (wird nur lokal im Browser gespeichert).

## Ehrliche Einordnung zum „Geld verdienen ohne mich"

Jenny ist das **Interface + Planungsgehirn**. Sie kann Ziele verstehen, einen
realistischen Plan erstellen und – sobald echte Werkzeuge angebunden sind –
Teile davon ausführen. Was sie **nicht** kann (und keine ehrliche Software heute
vollautomatisch kann): rechtsgültige Verträge abschließen, Geld empfangen oder
Konten ohne deine Freigabe betreiben. Diese Schritte sind im Plan bewusst als
„deine Freigabe nötig" markiert.

### Echte Aktionen anschließen (nächster Ausbau)

Um Jenny von „Plan" zu „Ausführung" zu bringen, kann man Tools anbinden, z.B.:
- E-Mail-Versand (Akquise) via API
- Webseiten-Generator / Deploy (z.B. statisches Hosting)
- CRM / Aufgaben-Tracker
- Zahlungs-Links (mit manueller Freigabe)

Die Architektur in `js/brain.js` ist dafür vorbereitet (Tool-Aufrufe lassen
sich an die Claude-Antwort anhängen).

## Dateien

| Datei | Zweck |
|-------|-------|
| `index.html` | Aufbau & HUD |
| `css/style.css` | futuristisches Design |
| `js/orb.js` | WebGL-Orb (Shader, audioreaktiv) |
| `js/voice.js` | Spracherkennung + Sprachausgabe + Mikro-Pegel |
| `js/brain.js` | Logik: lokales Gehirn + Claude-API |
| `js/jenny.js` | Controller, der alles verbindet |
