/* JENNY Studio — generiert & zeigt Spiele und Websites.
   Primär per KI (JennyBrain.aiGenerateApp), Fallback = eingebaute Vorlagen.
   Alles läuft in einem Sandbox-iframe (srcdoc, allow-scripts ohne same-origin),
   damit generierter Code nicht an die Hauptseite oder den Speicher kommt. */
window.JennyStudio = (function () {
  // ---------- shared neon shell for built-in games ----------
  var HEAD = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'
    + 'html,body{margin:0;height:100%;background:#0b0518;color:#eafcff;font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;overflow:hidden}'
    + 'canvas{background:#120a26;border:1px solid #a64bff;border-radius:12px;box-shadow:0 0 34px rgba(166,75,255,.5);touch-action:none;max-width:96vw}'
    + '.hud{letter-spacing:2px;color:#2bf5ff;font-weight:600}'
    + '.sub{font-size:12px;color:#9b8bd0}'
    + 'button{background:linear-gradient(135deg,#2bf5ff,#a64bff,#ff3db1);border:none;color:#190726;padding:9px 18px;border-radius:20px;font-weight:700;cursor:pointer}'
    + '</style></head><body>';
  var FOOT = '</body></html>';

  // ---------- SNAKE ----------
  var SNAKE = HEAD
  + '<div class="hud">SNAKE · <span id="s">0</span></div>'
  + '<canvas id="c" width="360" height="360"></canvas>'
  + '<button onclick="reset()">Neu starten</button><div class="sub">Pfeiltasten oder wischen</div>'
  + '<script>'
  + 'var cv=document.getElementById("c"),x=cv.getContext("2d"),G=18,N=20,snake,dir,food,score,dead,loop;'
  + 'function spawn(){return {x:Math.floor(Math.random()*N),y:Math.floor(Math.random()*N)};}'
  + 'function reset(){snake=[{x:9,y:9}];dir={x:1,y:0};food=spawn();score=0;dead=false;document.getElementById("s").textContent=0;clearInterval(loop);loop=setInterval(step,110);}'
  + 'function step(){var h={x:snake[0].x+dir.x,y:snake[0].y+dir.y};if(h.x<0||h.y<0||h.x>=N||h.y>=N||snake.some(function(s){return s.x==h.x&&s.y==h.y})){dead=true;clearInterval(loop);draw();return;}snake.unshift(h);if(h.x==food.x&&h.y==food.y){score++;document.getElementById("s").textContent=score;food=spawn();}else{snake.pop();}draw();}'
  + 'function draw(){x.fillStyle="#120a26";x.fillRect(0,0,360,360);x.fillStyle="#ff3db1";x.fillRect(food.x*G+2,food.y*G+2,G-4,G-4);snake.forEach(function(s,i){x.fillStyle=i===0?"#2bf5ff":"#a64bff";x.fillRect(s.x*G+1,s.y*G+1,G-2,G-2);});if(dead){x.fillStyle="rgba(0,0,0,.6)";x.fillRect(0,0,360,360);x.fillStyle="#fff";x.font="22px sans-serif";x.textAlign="center";x.fillText("Game Over · "+score,180,180);}}'
  + 'document.addEventListener("keydown",function(e){var k=e.key;if(k=="ArrowUp"&&dir.y==0)dir={x:0,y:-1};else if(k=="ArrowDown"&&dir.y==0)dir={x:0,y:1};else if(k=="ArrowLeft"&&dir.x==0)dir={x:-1,y:0};else if(k=="ArrowRight"&&dir.x==0)dir={x:1,y:0};if(k.indexOf("Arrow")==0)e.preventDefault();});'
  + 'var sx,sy;cv.addEventListener("touchstart",function(e){sx=e.touches[0].clientX;sy=e.touches[0].clientY;});'
  + 'cv.addEventListener("touchend",function(e){var dx=e.changedTouches[0].clientX-sx,dy=e.changedTouches[0].clientY-sy;if(Math.abs(dx)>Math.abs(dy)){if(dx>0&&dir.x==0)dir={x:1,y:0};else if(dx<0&&dir.x==0)dir={x:-1,y:0};}else{if(dy>0&&dir.y==0)dir={x:0,y:1};else if(dy<0&&dir.y==0)dir={x:0,y:-1};}});'
  + 'reset();'
  + '</script>' + FOOT;

  // ---------- PONG ----------
  var PONG = HEAD
  + '<div class="hud">PONG · DU <span id="p">0</span> : <span id="a">0</span> KI</div>'
  + '<canvas id="c" width="440" height="300"></canvas><div class="sub">Maus oder Finger bewegen</div>'
  + '<script>'
  + 'var cv=document.getElementById("c"),x=cv.getContext("2d"),W=440,H=300,PH=64,py=118,ay=118,bx=220,by=150,vx=4.5,vy=3,ps=0,as=0;'
  + 'function move(cy){var r=cv.getBoundingClientRect();py=Math.max(0,Math.min(H-PH,(cy-r.top)*(H/r.height)-PH/2));}'
  + 'cv.addEventListener("mousemove",function(e){move(e.clientY);});'
  + 'cv.addEventListener("touchmove",function(e){move(e.touches[0].clientY);e.preventDefault();});'
  + 'function loop(){bx+=vx;by+=vy;if(by<6||by>H-6)vy=-vy;ay+=(by-(ay+PH/2))*0.07;'
  + 'if(bx<18&&by>py&&by<py+PH)vx=Math.abs(vx);if(bx>W-18&&by>ay&&by<ay+PH)vx=-Math.abs(vx);'
  + 'if(bx<0){as++;document.getElementById("a").textContent=as;bx=220;by=150;vx=4.5;}if(bx>W){ps++;document.getElementById("p").textContent=ps;bx=220;by=150;vx=-4.5;}'
  + 'x.fillStyle="#120a26";x.fillRect(0,0,W,H);x.fillStyle="#2bf5ff";x.fillRect(6,py,8,PH);x.fillStyle="#ff3db1";x.fillRect(W-14,ay,8,PH);x.beginPath();x.fillStyle="#fff";x.arc(bx,by,6,0,7);x.fill();requestAnimationFrame(loop);}'
  + 'loop();'
  + '</script>' + FOOT;

  // ---------- BREAKOUT ----------
  var BREAKOUT = HEAD
  + '<div class="hud">BREAKOUT · <span id="s">0</span></div>'
  + '<canvas id="c" width="400" height="320"></canvas><button onclick="reset()">Neu starten</button><div class="sub">Maus oder Finger bewegen</div>'
  + '<script>'
  + 'var cv=document.getElementById("c"),x=cv.getContext("2d"),W=400,H=320,PW=72,px=164,bx=200,by=250,vx=3,vy=-3,score,bricks,over;'
  + 'function reset(){px=164;bx=200;by=250;vx=3;vy=-3;score=0;over=false;bricks=[];for(var r=0;r<4;r++)for(var c=0;c<7;c++)bricks.push({x:8+c*56,y:28+r*22,w:50,h:15,a:true});document.getElementById("s").textContent=0;}'
  + 'function move(cx){var r=cv.getBoundingClientRect();px=Math.max(0,Math.min(W-PW,(cx-r.left)*(W/r.width)-PW/2));}'
  + 'cv.addEventListener("mousemove",function(e){move(e.clientX);});cv.addEventListener("touchmove",function(e){move(e.touches[0].clientX);e.preventDefault();});'
  + 'function loop(){if(!over){bx+=vx;by+=vy;if(bx<6||bx>W-6)vx=-vx;if(by<6)vy=-vy;if(by>H-18&&bx>px&&bx<px+PW){vy=-Math.abs(vy);vx+=(bx-(px+PW/2))*0.03;}if(by>H){over=true;}'
  + 'bricks.forEach(function(b){if(b.a&&bx>b.x&&bx<b.x+b.w&&by>b.y&&by<b.y+b.h){b.a=false;vy=-vy;score++;document.getElementById("s").textContent=score;}});if(bricks.every(function(b){return !b.a;}))over="win";}'
  + 'x.fillStyle="#120a26";x.fillRect(0,0,W,H);bricks.forEach(function(b){if(b.a){x.fillStyle="#a64bff";x.fillRect(b.x,b.y,b.w,b.h);x.fillStyle="rgba(43,245,255,.5)";x.fillRect(b.x,b.y,b.w,3);}});x.fillStyle="#2bf5ff";x.fillRect(px,H-12,PW,8);x.beginPath();x.fillStyle="#ff3db1";x.arc(bx,by,6,0,7);x.fill();'
  + 'if(over){x.fillStyle="rgba(0,0,0,.6)";x.fillRect(0,0,W,H);x.fillStyle="#fff";x.font="22px sans-serif";x.textAlign="center";x.fillText(over=="win"?"Gewonnen!":"Game Over · "+score,W/2,H/2);}requestAnimationFrame(loop);}'
  + 'reset();loop();'
  + '</script>' + FOOT;

  // ---------- TIC-TAC-TOE ----------
  var TTT = HEAD
  + '<div class="hud">TIC-TAC-TOE · <span id="m">Du bist X</span></div>'
  + '<canvas id="c" width="300" height="300"></canvas><button onclick="reset()">Neu starten</button><div class="sub">Feld antippen</div>'
  + '<script>'
  + 'var cv=document.getElementById("c"),x=cv.getContext("2d"),b,done;'
  + 'function reset(){b=["","","","","","","","",""];done=false;document.getElementById("m").textContent="Du bist X";draw();}'
  + 'function line(p){var W=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];for(var i=0;i<8;i++){var w=W[i];if(b[w[0]]&&b[w[0]]==b[w[1]]&&b[w[1]]==b[w[2]])return b[w[0]];}return b.indexOf("")<0?"tie":null;}'
  + 'function ai(){var e=[];for(var i=0;i<9;i++)if(!b[i])e.push(i);for(var t=0;t<e.length;t++){b[e[t]]="O";if(line()=="O"){return;}b[e[t]]="";}for(var t2=0;t2<e.length;t2++){b[e[t2]]="X";if(line()=="X"){b[e[t2]]="O";return;}b[e[t2]]="";}if(!b[4]){b[4]="O";return;}b[e[Math.floor(Math.random()*e.length)]]="O";}'
  + 'cv.addEventListener("click",function(e){if(done)return;var r=cv.getBoundingClientRect();var cx=Math.floor((e.clientX-r.left)/(r.width/3)),cy=Math.floor((e.clientY-r.top)/(r.height/3)),i=cy*3+cx;if(b[i])return;b[i]="X";var w=line();if(!w){ai();w=line();}draw();if(w){done=true;document.getElementById("m").textContent=w=="tie"?"Unentschieden":(w+" gewinnt");}});'
  + 'function draw(){x.fillStyle="#120a26";x.fillRect(0,0,300,300);x.strokeStyle="#a64bff";x.lineWidth=2;for(var i=1;i<3;i++){x.beginPath();x.moveTo(i*100,0);x.lineTo(i*100,300);x.moveTo(0,i*100);x.lineTo(300,i*100);x.stroke();}x.font="56px sans-serif";x.textAlign="center";x.textBaseline="middle";for(var j=0;j<9;j++){if(b[j]){x.fillStyle=b[j]=="X"?"#2bf5ff":"#ff3db1";x.fillText(b[j],(j%3)*100+50,Math.floor(j/3)*100+52);}}}'
  + 'reset();'
  + '</script>' + FOOT;

  var GAMES = { snake: SNAKE, pong: PONG, breakout: BREAKOUT, tictactoe: TTT };
  var GAME_NAMES = { snake: 'Snake', pong: 'Pong', breakout: 'Breakout', tictactoe: 'Tic-Tac-Toe' };

  function matchGame(prompt) {
    var t = (prompt || '').toLowerCase();
    if (/snake|schlange/.test(t)) return 'snake';
    if (/pong|tischtennis|ping/.test(t)) return 'pong';
    if (/breakout|brick|steine|ball.*block/.test(t)) return 'breakout';
    if (/tic|tac|toe|drei gewinnt|kreuz/.test(t)) return 'tictactoe';
    return null;
  }

  // ---------- WEBSITE template ----------
  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  var SITE = HEAD.replace('justify-content:center;', '') // override layout for a page
    .replace('display:flex;flex-direction:column;align-items:center;gap:12px;overflow:hidden', 'overflow-x:hidden')
  + '<div style="text-align:center;padding:70px 20px 50px;background:radial-gradient(ellipse at 50% 0,rgba(166,75,255,.35),transparent 70%)">'
  + '<div style="font-size:12px;letter-spacing:5px;color:#2bf5ff;margin-bottom:14px">{{TAG}}</div>'
  + '<h1 style="font-size:46px;margin:0;background:linear-gradient(90deg,#2bf5ff,#a64bff,#ff3db1);-webkit-background-clip:text;background-clip:text;color:transparent">{{TITLE}}</h1>'
  + '<p style="max-width:540px;margin:18px auto;color:#cdbff0;font-size:18px;line-height:1.6">{{DESC}}</p>'
  + '<a href="#" style="display:inline-block;margin-top:10px;background:linear-gradient(135deg,#2bf5ff,#a64bff,#ff3db1);color:#190726;font-weight:700;padding:14px 34px;border-radius:30px;text-decoration:none">Jetzt starten</a></div>'
  + '<div style="display:flex;flex-wrap:wrap;gap:18px;justify-content:center;padding:30px 20px;max-width:980px;margin:0 auto">'
  + '<div style="flex:1;min-width:220px;background:rgba(28,16,54,.6);border:1px solid rgba(166,75,255,.35);border-radius:16px;padding:24px"><div style="font-size:30px">⚡</div><h3 style="color:#ff7be6">Schnell</h3><p style="color:#cdbff0">Sofort einsatzbereit, ohne Umwege.</p></div>'
  + '<div style="flex:1;min-width:220px;background:rgba(28,16,54,.6);border:1px solid rgba(166,75,255,.35);border-radius:16px;padding:24px"><div style="font-size:30px">✨</div><h3 style="color:#ff7be6">Modern</h3><p style="color:#cdbff0">Futuristisches Design das im Kopf bleibt.</p></div>'
  + '<div style="flex:1;min-width:220px;background:rgba(28,16,54,.6);border:1px solid rgba(166,75,255,.35);border-radius:16px;padding:24px"><div style="font-size:30px">🔒</div><h3 style="color:#ff7be6">Verlässlich</h3><p style="color:#cdbff0">Stabil, sicher und auf dich zugeschnitten.</p></div></div>'
  + '<div style="text-align:center;padding:40px 20px;color:#9b8bd0;font-size:13px;border-top:1px solid rgba(166,75,255,.2)">© {{TITLE}} · gebaut von Jenny · Singularity Corporations</div>'
  + FOOT;

  function websiteHTML(prompt) {
    var p = (prompt || '').trim();
    var m = p.match(/(?:für|fuer|namens|über|ueber|zu)\s+(?:eine?n?\s+)?(.+)/i);
    var name = (m ? m[1] : p).replace(/[.?!]+$/, '').trim() || 'Mein Projekt';
    var title = name.charAt(0).toUpperCase() + name.slice(1);
    var desc = p ? ('Willkommen — ' + p.replace(/[.?!]+$/, '') + '. Schön, dass du da bist.') : 'Willkommen auf deiner neuen Seite.';
    return SITE.replace(/{{TITLE}}/g, esc(title)).replace(/{{TAG}}/g, 'SINGULARITY CORPORATIONS').replace(/{{DESC}}/g, esc(desc));
  }

  // ---------- clean AI output ----------
  function clean(html) {
    if (!html) return null;
    var s = String(html).trim();
    s = s.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/i, '').trim();
    var low = s.toLowerCase();
    if (low.indexOf('<!doctype') >= 0 || low.indexOf('<html') >= 0 || (low.indexOf('<canvas') >= 0 && low.indexOf('<script') >= 0) || (low.indexOf('<body') >= 0)) {
      return s;
    }
    return null;
  }

  // ---------- overlay rendering ----------
  var ov, frame, titleEl, statusEl, dlBtn, last = { html: '', name: 'jenny.html', kind: 'game', prompt: '' };
  function els() {
    ov = document.getElementById('studioOverlay');
    frame = document.getElementById('studioFrame');
    titleEl = document.getElementById('studioTitle');
    statusEl = document.getElementById('studioStatus');
    dlBtn = document.getElementById('studioDownload');
  }

  function render(html, opts) {
    if (!ov) els();
    opts = opts || {};
    last.html = html; last.name = opts.name || 'jenny.html'; last.kind = opts.kind || 'game';
    if (titleEl) titleEl.textContent = opts.title || 'Studio';
    if (statusEl) statusEl.style.display = 'none';
    if (frame) { frame.style.display = 'block'; frame.srcdoc = html; }
    if (dlBtn) dlBtn.style.display = (opts.kind === 'website') ? 'inline-block' : 'none';
  }

  function show() { if (!ov) els(); if (ov) ov.classList.add('open'); }
  function hide() { if (!ov) els(); if (ov) ov.classList.remove('open'); if (frame) frame.srcdoc = 'about:blank'; }

  async function generate(kind, prompt) {
    // Try AI first (free, no key); fall back to built-in templates.
    try {
      if (window.JennyBrain && JennyBrain.aiGenerateApp) {
        var ai = await JennyBrain.aiGenerateApp(kind, prompt);
        var c = clean(ai);
        if (c) return c;
      }
    } catch (e) {}
    if (kind === 'website') return websiteHTML(prompt);
    return GAMES[matchGame(prompt) || 'snake'];
  }

  async function open(kind, prompt) {
    if (!ov) els();
    show();
    if (titleEl) titleEl.textContent = (kind === 'website' ? 'Website' : 'Spiel') + ' wird gebaut…';
    if (frame) { frame.style.display = 'none'; frame.srcdoc = 'about:blank'; }
    if (statusEl) { statusEl.style.display = 'flex'; statusEl.textContent = 'Jenny baut gerade ' + (kind === 'website' ? 'deine Website' : 'dein Spiel') + '…'; }
    last.kind = kind; last.prompt = prompt;
    var html = await generate(kind, prompt);
    var title = kind === 'website' ? 'Website-Vorschau' : (GAME_NAMES[matchGame(prompt)] || 'Spiel');
    render(html, { title: title, kind: kind, name: (kind === 'website' ? 'website.html' : 'spiel.html') });
  }

  // built-in quick launch (no AI) — used by Studio shortcut tiles
  function launchTemplate(key) {
    if (!ov) els(); show();
    if (key === 'website') { render(websiteHTML(''), { title: 'Website-Vorschau', kind: 'website', name: 'website.html' }); }
    else { render(GAMES[key] || SNAKE, { title: GAME_NAMES[key] || 'Spiel', kind: 'game' }); }
  }

  function download() {
    try {
      var blob = new Blob([last.html], { type: 'text/html' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = last.name || 'jenny.html';
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) {}
  }

  return { open, show, hide, render, download, launchTemplate, matchGame, websiteHTML, gameHTML: function (k) { return GAMES[k] || SNAKE; }, regen: function () { return open(last.kind, last.prompt); } };
})();
