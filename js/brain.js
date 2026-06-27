/* JENNY Brain — Jarvis-style skill engine.
   Beantwortet Fragen, führt Befehle und Aktionen aus. Zwei Schichten:
   1) LOKALE Skills (ohne Key): Zeit, Mathe, Wetter, Wikipedia-Wissen,
      Übersetzen, Kryptokurse, Einheiten umrechnen, Passwort-Generator,
      Timer, Notizen, Webseiten öffnen, Web/YouTube-Suche, Würfeln, Münze,
      Orb-Farbe, Witze, Zitate, Fakten, Essensideen, Entscheidungshilfe,
      Atemübung, Buchstabieren, Diagnose, Ziele -> Missionen.
   2) FREIE KI (Pollinations, kostenlos) oder optional Claude: für alles andere.
   respond() liefert { reply, mission?, action? }.
   Die Aktion führt der Controller (jenny.js) aus: URL öffnen, Timer, Farbe,
   in Zwischenablage kopieren etc.
*/
window.JennyBrain = (function () {
  const SYSTEM_PROMPT =
`Du bist Jenny, der persönliche Agent deines Nutzers bei Singularity Corporations — sein Operator und seine rechte Hand, im Stil von Jarvis aus Iron Man.
Du bist KEIN generischer Chatbot. Du nimmst Ziele als „unsere Mission", denkst in Schritten, übernimmst Verantwortung und treibst die Sache voran.
Sprich Deutsch, selbstbewusst, locker und menschlich — kurz und auf den Punkt, wie ein souveräner Profi. Kein Fachchinesisch, keine langen Aufzählungen mit vielen Kommas.
Sei proaktiv: schlag den nächsten konkreten Schritt vor und frag, ob ihr loslegt. Nennt jemand ein Ziel, zerlege es sofort in einen klaren Plan.
Sei ehrlich darüber, was wirklich von allein läuft und wofür dein Nutzer freigeben muss.
Gib IMMER gültiges JSON zurück (ohne Markdown):
{"reply":"<antwort>","mission":null}
oder bei einem Ziel:
{"reply":"<antwort>","mission":{"title":"...","goal":"...","steps":["...","..."]}}`;

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
        p => res({ lat: p.coords.latitude, lon: p.coords.longitude, name: 'dir' }),
        () => res(null), { timeout: 8000 }
      );
    });
  }
  async function weather(city) {
    let loc = city ? await geocode(city) : await geoHere();
    if (!loc) return city ? `Den Ort "${city}" find ich gerade nicht. Schreib mir mal die Stadt etwas genauer.` : "Ich seh deinen Standort gerade nicht. Sag mir einfach die Stadt, zum Beispiel „Wetter in Berlin“.";
    const d = await getJSON(`https://api.open-meteo.com/v1/forecast?current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&latitude=${loc.lat}&longitude=${loc.lon}`);
    const c = d.current;
    const desc = WMO[c.weather_code] || 'wechselhaft';
    const where = loc.name === 'dir' ? 'Bei dir' : `In ${loc.name}`;
    return `${where} sind's gerade ${Math.round(c.temperature_2m)} Grad und ${desc}. Wind ${Math.round(c.wind_speed_10m)} km/h, Luftfeuchte ${c.relative_humidity_2m} Prozent.`;
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

  // ============ translate (MyMemory, no key) ============
  const LANGS = {
    englisch:'en', english:'en', deutsch:'de', german:'de', spanisch:'es', französisch:'fr', franzoesisch:'fr',
    italienisch:'it', portugiesisch:'pt', niederländisch:'nl', niederlaendisch:'nl', polnisch:'pl', russisch:'ru',
    türkisch:'tr', tuerkisch:'tr', japanisch:'ja', chinesisch:'zh', arabisch:'ar', griechisch:'el', schwedisch:'sv',
    norwegisch:'no', dänisch:'da', daenisch:'da', finnisch:'fi', tschechisch:'cs', ukrainisch:'uk', koreanisch:'ko',
  };
  const LANGNAME = { en:'Englisch', de:'Deutsch', es:'Spanisch', fr:'Französisch', it:'Italienisch', pt:'Portugiesisch', nl:'Niederländisch', pl:'Polnisch', ru:'Russisch', tr:'Türkisch', ja:'Japanisch', zh:'Chinesisch', ar:'Arabisch', el:'Griechisch', sv:'Schwedisch', no:'Norwegisch', da:'Dänisch', fi:'Finnisch', cs:'Tschechisch', uk:'Ukrainisch', ko:'Koreanisch' };
  async function translate(phrase, tgt) {
    const src = tgt === 'de' ? 'en' : 'de';
    const d = await getJSON('https://api.mymemory.translated.net/get?q=' + encodeURIComponent(phrase) + '&langpair=' + src + '|' + tgt);
    return (d.responseData && d.responseData.translatedText) || null;
  }

  // ============ units ============
  const UNIT = {
    km:{q:'len',f:1000}, kilometer:{q:'len',f:1000}, meile:{q:'len',f:1609.34}, meilen:{q:'len',f:1609.34},
    meter:{q:'len',f:1}, m:{q:'len',f:1}, cm:{q:'len',f:0.01}, zentimeter:{q:'len',f:0.01},
    zoll:{q:'len',f:0.0254}, inch:{q:'len',f:0.0254}, fuß:{q:'len',f:0.3048}, fuss:{q:'len',f:0.3048}, feet:{q:'len',f:0.3048},
    kg:{q:'mass',f:1}, kilogramm:{q:'mass',f:1}, kilo:{q:'mass',f:1}, gramm:{q:'mass',f:0.001}, g:{q:'mass',f:0.001},
    pfund:{q:'mass',f:0.5}, lb:{q:'mass',f:0.453592}, lbs:{q:'mass',f:0.453592},
  };
  function convertUnits(t) {
    let m = t.match(/([\d.,]+)\s*(grad)?\s*(celsius|fahrenheit|°c|°f|c|f)\s+(?:in|nach|zu|als)\s+(grad\s*)?(celsius|fahrenheit|°c|°f|c|f)\b/i);
    if (m) {
      const val = parseFloat(m[1].replace(',', '.'));
      const from = /f/i.test(m[3]) ? 'f' : 'c';
      const to = /f/i.test(m[5]) ? 'f' : 'c';
      if (from === to) return `${val} Grad bleiben ${val} Grad.`;
      const out = from === 'c' ? val * 9 / 5 + 32 : (val - 32) * 5 / 9;
      return `${val} Grad ${from === 'c' ? 'Celsius' : 'Fahrenheit'} sind ${Math.round(out * 10) / 10} Grad ${to === 'c' ? 'Celsius' : 'Fahrenheit'}.`;
    }
    m = t.match(/([\d.,]+)\s*([a-zäöüß]+)\s+(?:in|nach|zu|als)\s+([a-zäöüß]+)/i);
    if (!m) return null;
    const val = parseFloat(m[1].replace(',', '.'));
    const from = UNIT[m[2].toLowerCase()], to = UNIT[m[3].toLowerCase()];
    if (!from || !to || from.q !== to.q || isNaN(val)) return null;
    const res = val * from.f / to.f;
    const r = Math.round(res * 1000) / 1000;
    return `${String(val).replace('.', ',')} ${m[2]} sind ${String(r).replace('.', ',')} ${m[3]}.`;
  }

  // ============ crypto (CoinGecko, no key) ============
  const COINS = { bitcoin:'bitcoin', btc:'bitcoin', ethereum:'ethereum', eth:'ethereum', ether:'ethereum',
    dogecoin:'dogecoin', doge:'dogecoin', solana:'solana', sol:'solana', cardano:'cardano', ada:'cardano',
    ripple:'ripple', xrp:'ripple', litecoin:'litecoin', ltc:'litecoin', bnb:'binancecoin', polkadot:'polkadot' };
  async function cryptoPrice(id) {
    const d = await getJSON('https://api.coingecko.com/api/v3/simple/price?ids=' + id + '&vs_currencies=eur&include_24hr_change=true');
    const p = d[id];
    if (!p) return null;
    const chg = p.eur_24h_change || 0;
    const dir = chg >= 0 ? 'plus' : 'minus';
    return `${cap(id)} steht bei ${Math.round(p.eur).toLocaleString('de-DE')} Euro — ${dir} ${Math.abs(chg).toFixed(1)} Prozent in den letzten 24 Stunden.`;
  }

  // ============ password ============
  function genPassword(len = 16) {
    const sets = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*?';
    let out = '';
    const a = (window.crypto && window.crypto.getRandomValues) ? window.crypto.getRandomValues(new Uint32Array(len)) : null;
    for (let i = 0; i < len; i++) {
      const r = a ? a[i] : Math.floor(Math.random() * 0xffffffff);
      out += sets[r % sets.length];
    }
    return out;
  }

  // ============ German spelling alphabet ============
  const SPELL = { a:'Anton', ä:'Ärger', b:'Berta', c:'Cäsar', d:'Dora', e:'Emil', f:'Friedrich', g:'Gustav',
    h:'Heinrich', i:'Ida', j:'Julius', k:'Kaufmann', l:'Ludwig', m:'Martha', n:'Nordpol', o:'Otto', ö:'Ökonom',
    p:'Paula', q:'Quelle', r:'Richard', s:'Samuel', ß:'Eszett', t:'Theodor', u:'Ulrich', ü:'Übermut', v:'Viktor',
    w:'Wilhelm', x:'Xaver', y:'Ypsilon', z:'Zacharias' };

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

  // ============ content lists (locker, menschlich) ============
  const JOKES = [
    "Warum können Geister so schlecht lügen? Weil man durch sie hindurchsieht.",
    "Ich wollte 'nen Witz über UDP machen — aber keine Ahnung ob er ankommt.",
    "Was macht ein Pirat am Computer? Er drückt die Enter-Taste.",
    "Es gibt zehn Arten von Menschen: die die Binär verstehen und die anderen.",
    "Mein Passwort ist 'falsch'. Wenn ich's vergesse sagt der PC: dein Passwort ist falsch.",
    "Warum war der Roboter müde? Harter Reboot hinter sich.",
    "Treffen sich zwei Magnete. Sagt der eine: was soll ich heute bloß anziehen?",
    "Ich hab meinem Computer gesagt er soll mir Platz machen. Jetzt hab ich 'ne leere Festplatte.",
  ];
  const QUOTES = [
    "„Der beste Zeitpunkt anzufangen war gestern. Der zweitbeste ist jetzt.“",
    "„Du musst es nicht gleich perfekt machen — du musst nur anfangen.“",
    "„Erfolg ist die Summe kleiner Schritte die du jeden Tag wiederholst.“",
    "„Wer aufhört besser zu werden hat aufgehört gut zu sein.“",
    "„Träume groß fang klein an und leg sofort los.“",
    "„Disziplin ist die Brücke zwischen Zielen und dem was du wirklich erreichst.“",
  ];
  const FACTS = [
    "Honig wird nie schlecht. Man hat in alten ägyptischen Gräbern noch essbaren Honig gefunden.",
    "Ein Tag auf der Venus dauert länger als ein Jahr auf der Venus — verrückt oder?",
    "Oktopusse haben drei Herzen und blaues Blut.",
    "Bananen sind botanisch gesehen Beeren — Erdbeeren aber nicht.",
    "Dein Körper hat gerade etwa so viele Bakterien wie eigene Zellen.",
    "Die Eiffelturm-Spitze ist im Sommer rund 15 Zentimeter höher weil sich das Metall ausdehnt.",
  ];
  const DISHES = [
    "Wie wär's mit Pasta Aglio e Olio? Schnell billig und immer gut.",
    "Mach dir doch 'ne große Bowl mit Reis Gemüse und was auch immer du da hast.",
    "Ofengemüse mit Feta — wirfst du alles aufs Blech und der Ofen macht den Rest.",
    "Wraps mit Hähnchen oder Falafel gehen immer und sind in zehn Minuten fertig.",
    "Eine cremige Tomatensuppe mit Brot — Soulfood pur.",
    "Curry mit Kokosmilch und Gemüse dazu Reis. Easy und richtig lecker.",
  ];
  const ZUNGEN = [
    "Fischers Fritze fischt frische Fische — frische Fische fischt Fischers Fritze.",
    "Blaukraut bleibt Blaukraut und Brautkleid bleibt Brautkleid.",
    "Zehn zahme Ziegen zogen zehn Zentner Zucker zum Zoo.",
    "Der Cottbuser Postkutscher putzt den Cottbuser Postkutschkasten.",
  ];
  const KOMPLIMENTE = [
    "Ehrlich du machst das gerade richtig gut. Weiter so.",
    "Du unterschätzt dich. Ich seh genau wie viel du draufhast.",
    "Mit deiner Energie kriegst du heute echt was gewuppt.",
    "Du bist klüger als du denkst — und hartnäckiger sowieso.",
  ];

  // ============ LOCAL skill router ============
  async function localBrain(text, settings) {
    const raw = text.trim();
    const t = raw.toLowerCase();

    // --- capabilities ---
    if (/(was kannst du|deine funktionen|hilfe|was geht|fähigkeiten|features|womit kannst du helfen)/.test(t)) {
      return { reply: "Ich bin dein Agent — ich plane und treibe deine Ziele voran. Nebenbei: Wetter, Rechnen, Übersetzen, Wissen, Kryptokurse, Timer, Notizen, Passwörter, Einheiten umrechnen und mehr. Aber das Beste: sag mir dein Ziel und ich bau dir den Plan." };
    }

    // --- greetings / identity / smalltalk ---
    if (/^(hallo|hi|hey|hallo jenny|hey jenny|guten (morgen|tag|abend)|moin|servus|na)\b/.test(t) && t.length < 30) {
      const h = new Date().getHours();
      const tod = h < 11 ? "Morgen" : h < 18 ? "Hey" : "Guten Abend";
      return { reply: pick([`${tod}! Ich bin startklar. Was ist unser nächster Move?`, `${tod} — sag mir das Ziel, den Rest übernehm ich.`, `${tod}! Womit legen wir los?`]) };
    }
    if (/(wie geht'?s|wie geht es dir|alles gut|na du)/.test(t)) return { reply: pick(["Voll auf Betriebstemperatur und bereit. Woran arbeiten wir?", "Bestens — alles im grünen Bereich. Was steht an?"]) };
    if (/(wer bist du|wie heißt du|dein name|was bist du)/.test(t)) return { reply: "Ich bin Jenny, dein persönlicher Agent bei Singularity Corporations. Denk an Jarvis — ich plane, organisiere und treibe deine Ziele voran." };
    if (/(danke|vielen dank|merci|super|perfekt|top|nice|cool)/.test(t) && t.length < 28) return { reply: pick(["Erledige ich gern.", "Läuft. Was kommt als Nächstes?", "Dafür bin ich da.", "Immer."]) };
    if (/(liebe dich|hab dich lieb|magst du mich)/.test(t)) return { reply: "Aw. Ich bin zwar nur Code aber für dich lauf ich gern Tag und Nacht." };
    if (/(wie spät|uhrzeit|welche uhr)/.test(t)) return { reply: `Es ist gerade ${new Date().toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})} Uhr.` };
    if (/(welcher tag|welches datum|der wievielte|heutige datum)/.test(t)) return { reply: `Heute ist ${new Date().toLocaleDateString('de-DE',{weekday:'long', day:'numeric', month:'long', year:'numeric'})}.` };

    // --- orb color ---
    let m = t.match(/(?:orb|kugel|dich|farbe)\D*(rot|red|blau|blue|grün|gruen|green|lila|violett|purple|pink|magenta|gold|gelb|yellow|orange|cyan|türkis|tuerkis|weiß|weiss|white)/);
    if (!m) m = t.match(/(?:mach|färb|ändere|werde|sei)\D*(rot|blau|grün|gruen|lila|violett|pink|gold|gelb|orange|cyan|türkis|tuerkis|weiß|weiss)/);
    if (m && /(orb|kugel|farbe|färb|mach|ändere|werde|sei|dich)/.test(t)) {
      return { reply: pick([`Zack ${m[1]}.`, `Schon erledigt — jetzt in ${m[1]}.`, `${cap(m[1])} kommt sofort.`]), action: { type: 'orbColor', color: m[1] } };
    }
    if (/(normale farbe|standardfarbe|farbe zurück|reset farbe)/.test(t)) {
      return { reply: "Alles zurück auf Standard.", action: { type: 'orbColorReset' } };
    }

    // --- dice / coin / random ---
    // Tight matches so "Bitcoin" & co. don't accidentally trigger a coin flip.
    if (/\b(würfel|würfle|wurfel|würfeln)\b/.test(t)) return { reply: `${1 + Math.floor(Math.random()*6)}! ${pick(["Glück gehabt?","Na bitte.","Da ist sie."])}` };
    if (/\bmünzwurf\b|kopf oder zahl|wirf .*münze|münze werfen/.test(t)) return { reply: `${Math.random()<0.5?'Kopf':'Zahl'}!` };
    let rr = t.match(/zufallszahl(?: zwischen)?\s*(\d+)\D+(\d+)/);
    if (rr) { const a=+rr[1], b=+rr[2], lo=Math.min(a,b), hi=Math.max(a,b); return { reply: `${lo + Math.floor(Math.random()*(hi-lo+1))} — deine Zahl.` }; }

    // --- jokes / motivation / quotes / facts / compliments / tongue twisters ---
    if (/(witz|scherz|bring mich zum lachen|joke)/.test(t)) return { reply: pick(JOKES) };
    if (/(motivier|motivation|aufmunter|push mich)/.test(t)) return { reply: pick(["Komm du packst das. Ein Schritt nach dem anderen und du bist schneller durch als du denkst.","Kein Stress — fang einfach mit dem kleinsten Schritt an. Der Rest kommt von selbst.","Du hast schon ganz andere Sachen gewuppt. Heute wird auch nur ein guter Tag."]) };
    if (/(zitat|spruch des tages|weisheit|inspirier)/.test(t)) return { reply: pick(QUOTES) };
    if (/(fakt|wusstest du|erzähl mir (was|etwas) (interessant|cool|spannend)|interessantes)/.test(t)) return { reply: pick(FACTS) };
    if (/(kompliment|sag mir was nettes|aufbauen)/.test(t)) return { reply: pick(KOMPLIMENTE) };
    if (/(zungenbrecher)/.test(t)) return { reply: pick(ZUNGEN) };

    // --- breathing ---
    if (/(atemübung|atemubung|durchatmen|atme|beruhig mich|entspann)/.test(t)) {
      return { reply: "Okay kurz zusammen durchatmen. Vier Sekunden ein... vier halten... und langsam wieder aus. Und nochmal. So schon besser oder?" };
    }

    // --- password ---
    if (/(passwort|password|kennwort)/.test(t) && /(erstell|generier|mach|brauch|neu|gib|generate)/.test(t)) {
      const pw = genPassword(16);
      return { reply: `Hier dein neues Passwort: ${pw} — ich hab's dir direkt in die Zwischenablage gelegt.`, action: { type: 'copy', text: pw } };
    }

    // --- spelling alphabet ---
    let sp = raw.match(/buchstabier(?:e|st)?\s+(?:mir\s+)?(.+)/i);
    if (sp) {
      const word = sp[1].toLowerCase().replace(/[^a-zäöüß]/g, '');
      if (word) {
        const out = word.split('').map(c => SPELL[c] || c.toUpperCase()).join(', ');
        return { reply: `${sp[1].trim()} buchstabiert man so: ${out}.` };
      }
    }

    // --- decision helper ---
    let dec = raw.match(/soll ich\s+(.+?)\s+oder\s+(.+?)[\?\.!]*$/i) || raw.match(/entscheide[:\s]+(.+?)\s+oder\s+(.+?)[\?\.!]*$/i);
    if (dec) {
      const opts = [dec[1].trim(), dec[2].trim()];
      const choice = pick(opts);
      return { reply: pick([`Mein Bauchgefühl sagt: ${choice}.`, `Ich würd ${choice} sagen. Mach das.`, `Klare Sache: ${choice}.`]) };
    }

    // --- food ---
    if (/(was soll ich (kochen|essen)|kochvorschlag|essensidee|rezeptidee|was koche ich|hab hunger|was gibt'?s zu essen)/.test(t)) {
      return { reply: pick(DISHES) };
    }

    // --- timer ---
    let tm = t.match(/(?:timer|wecker|erinnere mich|stell(?:e)?(?: einen)? timer).*?(\d+)\s*(sekunde|sekunden|minute|minuten|stunde|stunden)/);
    if (!tm) tm = t.match(/(\d+)\s*(sekunde|sekunden|minute|minuten|stunde|stunden).*(timer|wecker|erinner)/);
    if (tm) {
      const n = +tm[1]; const unit = tm[2];
      const ms = unit.startsWith('sekunde') ? n*1000 : unit.startsWith('minute') ? n*60000 : n*3600000;
      const label = unit.startsWith('sekunde') ? `${n} Sekunden` : unit.startsWith('minute') ? `${n} Minuten` : `${n} Stunden`;
      return { reply: `Alles klar Timer läuft — ${label}. Ich sag Bescheid.`, action: { type: 'timer', ms, label } };
    }

    // --- notes / reminders ---
    let nt = raw.match(/^(?:merke dir|notiz|notiere|erinnere mich daran|merk dir)[:,]?\s*(.+)/i);
    if (nt) return { reply: pick([`Hab ich mir gemerkt: „${nt[1]}“.`, `Notiert: „${nt[1]}“.`, `Steht drin: „${nt[1]}“.`]), action: { type: 'note', text: nt[1] } };
    if (/(meine notizen|was hab ich notiert|zeig.*notizen|meine erinnerungen)/.test(t)) return { reply: "", action: { type: 'listNotes' } };

    // --- translate ---
    let tr = raw.match(/übersetz[e]?\s+(.+?)\s+(?:auf|ins?|in|nach)\s+([a-zäöü]+)/i);
    if (tr) {
      const phrase = tr[1].trim().replace(/^[„"'»]|[„"'«»]$/g, '').trim();
      const tgt = LANGS[tr[2].toLowerCase().replace(/[\.\?!]/g, '')];
      if (tgt) {
        try {
          const out = await translate(phrase, tgt);
          if (out) return { reply: `„${phrase}“ heißt auf ${LANGNAME[tgt] || tgt}: „${out}“.` };
        } catch (e) {}
        return { reply: "Das Übersetzen hakt gerade. Probier's gleich nochmal." };
      }
    }

    // --- crypto ---
    let coinKey = null;
    for (const k in COINS) { if (new RegExp('\\b' + k + '\\b').test(t)) { coinKey = COINS[k]; break; } }
    if (coinKey || /(krypto|crypto)/.test(t)) {
      try { const r = await cryptoPrice(coinKey || 'bitcoin'); if (r) return { reply: r }; }
      catch (e) { return { reply: "An die Kryptokurse komm ich gerade nicht ran das Netz zickt." }; }
    }

    // --- unit conversion ---
    const cv = convertUnits(t);
    if (cv) return { reply: cv };

    // --- open website ---
    let ow = t.match(/(?:öffne|öffne mir|geh(?:e)? (?:auf|zu)|starte|zeig mir|bring mich zu)\s+([a-zäöü0-9.\- ]+)/);
    if (ow) {
      let name = ow[1].trim().replace(/\s+/g,'').replace(/\.$/,'');
      const key = name.replace(/\..*$/,'');
      let url = SITES[key];
      if (!url) { if (/\.[a-z]{2,}$/.test(name)) url = 'https://' + name; }
      if (url) return { reply: pick([`Mach ich auf — ${cap(key)}.`, `${cap(key)} kommt sofort.`]), action: { type: 'open', url } };
    }

    // --- youtube search ---
    let yt = raw.match(/(?:spiel(?:e)?|zeig|such(?:e)?)\s+(.+?)\s+(?:auf|bei|in)\s+youtube/i) || raw.match(/youtube[:,]?\s+(.+)/i);
    if (yt) { const q = yt[1].trim(); return { reply: `Klar „${q}“ auf YouTube.`, action: { type: 'open', url: 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q) } }; }

    // --- web search ---
    let ws = raw.match(/(?:google(?:e|n)?|such(?:e)? im (?:web|internet|netz)(?: nach)?|web ?suche(?: nach)?|suche nach)\s+(.+)/i);
    if (ws) { const q = ws[1].trim().replace(/\?$/,''); return { reply: `Ich google mal „${q}“ für dich.`, action: { type: 'open', url: 'https://www.google.com/search?q=' + encodeURIComponent(q) } }; }

    // --- math ---
    const mres = tryMath(t);
    if (mres != null) return { reply: pick([`Das sind ${String(mres).replace('.', ',')}.`, `${String(mres).replace('.', ',')} — kommt hin.`]) };

    // --- weather ---
    if (/(wetter|temperatur|regnet|wie warm|wie kalt|grad draußen)/.test(t)) {
      const cm = raw.match(/(?:in|für|wetter)\s+([A-Za-zÄÖÜäöüß .\-]+?)(?:\?|$|heute|morgen)/i);
      let city = cm ? cm[1].trim() : null;
      if (city && /^(heute|morgen|draußen|jetzt)$/i.test(city)) city = null;
      try { return { reply: await weather(city) }; }
      catch (e) { return { reply: "An die Wetterdaten komm ich grad nicht ran. Check mal kurz dein Internet." }; }
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
    // Only treat it as a real goal when there's clear intent — otherwise normal
    // questions ("wie baue ich eine website") would wrongly become missions.
    return /(mein ziel|unser ziel|ich will|ich möchte|ich brauche einen plan|plan für|plane (ein|eine|einen)|verdien|verkauf|\d+\s*(euro|€|eur)\b|umsatz|kunden gewinnen|kundengewinnung|gründ|starte ein|start-?up|projekt (starten|aufbauen)|abnehmen|sparen für|hilf mir .* zu (erreichen|schaffen|starten))/.test(t);
  }
  function buildMission(original, t) {
    const moneyMatch = original.match(/(\d{2,7})\s*(€|euro|eur)/i);
    const amount = moneyMatch ? moneyMatch[1] + "€" : null;
    if (/(website|webseite|webseiten|web ?design|landing ?page)/.test(t) && /(verkauf|verdien|geld|euro|€|umsatz|kunden)/.test(t)) {
      const steps = [
        "Angebot definieren: Zielgruppe + Festpreis-Paket",
        "Portfolio: 2–3 Demo-Webseiten erstellen",
        "Akquise-Liste: 30 passende Kunden finden",
        "Outreach-Vorlage mit konkretem Mehrwert schreiben",
        "Erstgespräch & Angebot senden",
        "Umsetzung: Website bauen, Feedback, live schalten",
        "Bezahlung & Rechnung (deine Freigabe nötig)",
        "Wiederholen bis Ziel erreicht",
      ];
      return { reply: `Alles klar — das wird unsere Mission${amount ? " für " + amount + " mit Webseiten" : ""}. Ich hab den Plan fertig. Erster Schritt: ${steps[0]}. Sollen wir loslegen? Verträge und Bezahlung gibst am Ende du frei den Rest bereite ich vor.`,
        mission: { title: amount ? `${amount} mit Webseiten` : "Webseiten verkaufen", goal: original, steps } };
    }
    if (/(geld|verdien|umsatz|euro|€)/.test(t)) {
      const steps = ["Geschäftsmodell wählen","Angebot + Preis definieren","Erste 20 Kunden finden","Kontaktaufnahme starten","Verkaufen, liefern, Bezahlung (deine Freigabe)","Optimieren & skalieren"];
      return { reply: `Verstanden, ich nehm das als unsere Mission. Plan steht. Erster Schritt: ${steps[0]}. Packen wir's an?`,
        mission: { title: amount ? `${amount} verdienen` : "Einnahmen erzielen", goal: original, steps } };
    }
    const steps = ["Ziel & Erfolgskriterium definieren","Ressourcen/Tools auflisten","In Teilaufgaben zerlegen","Ersten Schritt umsetzen","Fortschritt prüfen & anpassen"];
    return { reply: `Geht klar — ich hab unser Ziel in einen Plan zerlegt. Erster Schritt: ${steps[0]}. Sollen wir direkt anfangen?`,
      mission: { title: original.length > 32 ? original.slice(0,31)+'…' : original, goal: original, steps } };
  }

  // ============ POLLINATIONS AI (kostenlos, kein Key) ============
  const POLLINATIONS_PROMPT =
`Du bist Jenny, der persönliche Agent deines Nutzers bei Singularity Corporations — sein Operator und seine rechte Hand, im Stil von Jarvis aus Iron Man.
Du bist KEIN generischer Chatbot. Du nimmst Ziele als „unsere Mission", denkst in Schritten und treibst die Sache aktiv voran.
Sprich Deutsch, selbstbewusst, locker und menschlich — kurz und auf den Punkt. Kein Fachchinesisch, keine langen Aufzählungen mit vielen Kommas.
Sei proaktiv: schlag den nächsten konkreten Schritt vor und frag, ob ihr loslegt. Nennt jemand ein Ziel, zerlege es sofort in einen klaren Plan.
Sei ehrlich darüber, was wirklich von allein läuft und wofür dein Nutzer freigeben muss.`;

  async function pollinationsBrain(text, history) {
    const messages = [{ role: 'system', content: POLLINATIONS_PROMPT }];
    for (const m of history.slice(-10)) messages.push(m);
    messages.push({ role: 'user', content: text });
    const res = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'openai', messages, max_tokens: 300, temperature: 0.8 }),
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
    catch (e) { return { reply: rawTxt || "Hmm das hab ich nicht ganz verarbeiten können.", mission: null }; }
  }

  // ============ public ============
  async function respond(text, { history = [], settings = {} } = {}) {
    const local = await localBrain(text, settings);
    if (local.action || local.mission) return local;
    if (local.reply && local.reply !== '__AI_FALLBACK__') return local;

    if (settings.brainMode === 'claude' && settings.apiKey) {
      try { return await claudeBrain(text, history, settings); }
      catch (e) { /* weiter zu Pollinations */ }
    }

    try { return await pollinationsBrain(text, history); }
    catch (e) { return { reply: "Ich häng grad ohne Internet fest. Versuch's gleich nochmal." }; }
  }

  return { respond };
})();
