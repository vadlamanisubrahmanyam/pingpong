import React, { useState, useEffect, useRef } from 'react';
import { View, StatusBar, BackHandler } from 'react-native';
import { WebView } from 'react-native-webview';
import { activateKeepAwakeAsync } from 'expo-keep-awake';

// NOTE: HTML is embedded as a string (no file:// loading) and given a secure
// https://localhost origin. Do not use backticks, dollar-brace or backslashes inside.
const HTML_STRING = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>
  html, body { margin:0; padding:0; width:100%; height:100%; background:#000; overflow:hidden;
    touch-action:none; -webkit-user-select:none; user-select:none; -webkit-tap-highlight-color:transparent; }
  canvas { display:block; position:absolute; left:0; top:0; background:#000; }
</style>
</head>
<body>
<canvas id="c"></canvas>
<script>
(function () {
  var W = 360, H = 640, PH = 10, R = 7, AW = 72;
  var PY = H - 56, AY = 56;
  var NAMES = ['EASY', 'NORMAL', 'HARD'];
  var AI = [ { spd: 170, err: 55 }, { spd: 250, err: 28 }, { spd: 340, err: 8 } ];
  var DEF = { win: 7, spd: [240, 300, 380], size: [96, 72, 56] };
  var LIM = { win: [3, 21], spd: [150, 500], size: [40, 140] };
  var STEP = { spd: 10, size: 2 };
  var TX0 = 80, TX1 = 250;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function loadCfg() {
    var c = clone(DEF);
    try {
      var j = JSON.parse(localStorage.getItem('pp_cfg') || 'null');
      if (j) {
        if (typeof j.win === 'number') c.win = clamp(Math.round(j.win), LIM.win[0], LIM.win[1]);
        for (var i = 0; i < 3; i++) {
          if (j.spd && typeof j.spd[i] === 'number') c.spd[i] = clamp(Math.round(j.spd[i]), LIM.spd[0], LIM.spd[1]);
          if (j.size && typeof j.size[i] === 'number') c.size[i] = clamp(Math.round(j.size[i]), LIM.size[0], LIM.size[1]);
        }
      }
    } catch (e) {}
    return c;
  }
  var cfg = loadCfg();
  function saveCfg() { try { localStorage.setItem('pp_cfg', JSON.stringify(cfg)); } catch (e) {} }

  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');
  var scale = 1, ox = 0, oy = 0;

  var state = 'menu';            // menu | levels | setup | serve | play | over
  var diff = 1, pw = 72;
  var px = W / 2, ax = W / 2, aiOff = 0;
  var ball = { x: W / 2, y: H / 2, vx: 0, vy: 0 };
  var speed = 300, maxSpeed = 600, serveTimer = 0, serveDir = 1;
  var pScore = 0, aScore = 0, msg = '';
  var audio = null, drag = null;
  var ctrl = 0, rev = 1;          // ctrl: 0 touch, 1 tilt; rev: 1 normal, -1 reversed
  var tilt = 0, motionSeen = false, tiltWatch = 1.5, notice = '', noticeT = 0;
  try {
    ctrl = parseInt(localStorage.getItem('pp_ctrl') || '0', 10) || 0;
    rev = localStorage.getItem('pp_rev') === '-1' ? -1 : 1;
  } catch (e) {}
  function saveCtrl() {
    try { localStorage.setItem('pp_ctrl', String(ctrl)); localStorage.setItem('pp_rev', String(rev)); } catch (e) {}
  }
  function post(m) { try { if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(m); } catch (e) {} }

  window.addEventListener('devicemotion', function (e) {
    var g = e.accelerationIncludingGravity;
    if (!g || g.x == null || g.y == null) return;
    motionSeen = true;
    var o = window.orientation;
    if (typeof o !== 'number') { o = (screen.orientation && screen.orientation.angle) || 0; if (o > 180) o -= 360; }
    var t;
    if (o === 90) t = -g.y; else if (o === -90) t = g.y; else if (o === 180) t = g.x; else t = -g.x;
    tilt = tilt * 0.8 + t * 0.2;
  });

  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    scale = Math.min(w / W, h / H);
    ox = (w - W * scale) / 2;
    oy = (h - H * scale) / 2;
  }
  window.addEventListener('resize', resize);
  resize();

  function beep(f, d) {
    try {
      if (!audio) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) audio = new AC(); }
      if (!audio) return;
      if (audio.state === 'suspended') audio.resume();
      var o = audio.createOscillator(), g = audio.createGain();
      o.type = 'square'; o.frequency.value = f; g.gain.value = 0.05;
      o.connect(g); g.connect(audio.destination);
      o.start(); o.stop(audio.currentTime + d);
    } catch (e) {}
  }

  // ---------- game flow ----------
  function startMatch(d) {
    diff = d; pw = cfg.size[d]; pScore = 0; aScore = 0; px = W / 2; ax = W / 2;
    maxSpeed = Math.min(cfg.spd[d] * 2, 900);
    serveDir = Math.random() < 0.5 ? 1 : -1;
    beginServe();
  }
  function beginServe() {
    state = 'serve'; serveTimer = 1.0;
    ball.x = W / 2; ball.y = H / 2; ball.vx = 0; ball.vy = 0;
    speed = cfg.spd[diff]; aiOff = (Math.random() * 2 - 1) * AI[diff].err;
  }
  function launch() {
    var a = (Math.random() * 2 - 1) * 0.5;
    ball.vx = speed * Math.sin(a);
    ball.vy = serveDir * speed * Math.cos(a);
    state = 'play';
  }
  function point(playerWon) {
    if (playerWon) { pScore++; serveDir = -1; } else { aScore++; serveDir = 1; }
    beep(playerWon ? 880 : 180, 0.25);
    if (pScore >= cfg.win || aScore >= cfg.win) {
      state = 'over'; msg = playerWon ? 'YOU WIN' : 'YOU LOSE';
    } else { beginServe(); }
  }
  window.__back = function () {
    if (state === 'menu') post('exit');
    else if (state === 'setup') { saveCfg(); state = 'menu'; }
    else if (state === 'levels') state = 'menu';
    else state = 'menu';
  };

  // ---------- input ----------
  function inBtn(x, y, bx, by, bw, bh) { return x >= bx && x <= bx + bw && y >= by && y <= by + bh; }
  function setPx(clientX) {
    var x = (clientX - ox) / scale;
    px = clamp(x, pw / 2, W - pw / 2);
  }
  var SL = [];
  (function () {
    for (var i = 0; i < 3; i++) SL.push({ key: 'spd', i: i, y: 215 + i * 40 });
    for (var k = 0; k < 3; k++) SL.push({ key: 'size', i: k, y: 385 + k * 40 });
  })();
  function setSlider(s, clientX) {
    var x = (clientX - ox) / scale;
    var t = clamp((x - TX0) / (TX1 - TX0), 0, 1);
    var lim = LIM[s.key], st = STEP[s.key];
    var v = lim[0] + t * (lim[1] - lim[0]);
    cfg[s.key][s.i] = clamp(Math.round(v / st) * st, lim[0], lim[1]);
  }

  function onDown(e) {
    if (e.preventDefault) e.preventDefault();
    beep(0, 0.001);
    var x = (e.clientX - ox) / scale, y = (e.clientY - oy) / scale;
    if (state === 'menu') {
      if (inBtn(x, y, 80, 250, 200, 44)) state = 'levels';
      else if (inBtn(x, y, 80, 315, 200, 44)) state = 'setup';
      else if (inBtn(x, y, 80, 380, 200, 44)) post('exit');
    } else if (state === 'levels') {
      for (var i = 0; i < 3; i++) { if (inBtn(x, y, 80, 150 + i * 60, 200, 40)) { startMatch(i); return; } }
      if (inBtn(x, y, 60, 360, 240, 40)) {
        ctrl = ctrl ? 0 : 1;
        if (ctrl) { motionSeen = false; tiltWatch = 1.5; }
        saveCtrl();
      } else if (ctrl === 1 && inBtn(x, y, 80, 410, 200, 30)) { rev = -rev; saveCtrl(); }
      else if (inBtn(x, y, 80, 540, 200, 40)) state = 'menu';
    } else if (state === 'setup') {
      if (inBtn(x, y, 90, 112, 40, 40)) { cfg.win = clamp(cfg.win - 1, LIM.win[0], LIM.win[1]); saveCfg(); }
      else if (inBtn(x, y, 230, 112, 40, 40)) { cfg.win = clamp(cfg.win + 1, LIM.win[0], LIM.win[1]); saveCfg(); }
      else if (inBtn(x, y, 60, 500, 240, 36)) { cfg = clone(DEF); saveCfg(); }
      else if (inBtn(x, y, 80, 550, 200, 40)) { saveCfg(); state = 'menu'; }
      else {
        for (var s = 0; s < SL.length; s++) {
          if (Math.abs(y - SL[s].y) <= 18 && x >= 60 && x <= 262) {
            drag = SL[s]; setSlider(drag, e.clientX);
            try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
            break;
          }
        }
      }
    } else if (state === 'over') {
      state = 'menu';
    } else if (ctrl === 0) { setPx(e.clientX); }
  }
  function onMove(e) {
    if (e.preventDefault) e.preventDefault();
    if (state === 'setup') { if (drag) setSlider(drag, e.clientX); }
    else if (ctrl === 0 && (state === 'play' || state === 'serve')) setPx(e.clientX);
  }
  function onUp() { if (drag) { drag = null; saveCfg(); } }
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  // ---------- simulation ----------
  function update(dt) {
    if (ctrl === 1) {
      if (!motionSeen) {
        tiltWatch -= dt;
        if (tiltWatch <= 0) { ctrl = 0; notice = 'Tilt sensor not available - using touch'; noticeT = 4; saveCtrl(); }
      } else if (state === 'play' || state === 'serve') {
        var n = tilt * rev / 9.81;
        if (Math.abs(n) < 0.04) n = 0; else n = n > 0 ? n - 0.04 : n + 0.04;
        var v = clamp(n / 0.4, -1, 1);
        px = clamp(px + v * 560 * dt, pw / 2, W - pw / 2);
      }
    }
    if (state !== 'play' && state !== 'serve') return;

    var tx = (state === 'play' && ball.vy < 0) ? ball.x + aiOff : W / 2;
    var step = AI[diff].spd * dt;
    ax = clamp(ax + clamp(tx - ax, -step, step), AW / 2, W - AW / 2);

    if (state === 'serve') {
      serveTimer -= dt;
      if (serveTimer <= 0) launch();
      return;
    }

    var py0 = ball.y;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    if (ball.x < R) { ball.x = R; ball.vx = Math.abs(ball.vx); beep(300, 0.04); }
    if (ball.x > W - R) { ball.x = W - R; ball.vx = -Math.abs(ball.vx); beep(300, 0.04); }

    var pTop = PY - PH / 2, aBot = AY + PH / 2;
    if (ball.vy > 0 && py0 + R <= pTop && ball.y + R >= pTop && Math.abs(ball.x - px) <= pw / 2 + R) {
      hit(px, pw / 2, -1, pTop - R);
      aiOff = (Math.random() * 2 - 1) * AI[diff].err;
    } else if (ball.vy < 0 && py0 - R >= aBot && ball.y - R <= aBot && Math.abs(ball.x - ax) <= AW / 2 + R) {
      hit(ax, AW / 2, 1, aBot + R);
    }

    if (ball.y < -R * 2) point(true);
    else if (ball.y > H + R * 2) point(false);
  }
  function hit(cx, half, dirY, newY) {
    var off = clamp((ball.x - cx) / half, -1, 1);
    speed = Math.min(speed * 1.05, maxSpeed);
    ball.vx = speed * Math.sin(off);
    ball.vy = dirY * speed * Math.cos(off);
    ball.y = newY;
    beep(520, 0.05);
  }

  // ---------- drawing ----------
  function text(s, x, y, size, align) {
    ctx.font = 'bold ' + size + 'px monospace';
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s, x, y);
  }
  function btn(label, bx, by, bw, bh, size) {
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, bh);
    text(label, bx + bw / 2, by + bh / 2 + 1, size);
  }
  function drawSetup() {
    text('SETUP', W / 2, 45, 28);
    text('1. SCORE TO WIN', 20, 92, 15, 'left');
    btn('-', 90, 112, 40, 40, 24);
    text(String(cfg.win), W / 2, 133, 28);
    btn('+', 230, 112, 40, 40, 24);
    text('2. BALL SPEED', 20, 180, 15, 'left');
    text('3. PADDLE SIZE (YOURS)', 20, 350, 15, 'left');
    for (var s = 0; s < SL.length; s++) {
      var sl = SL[s], lim = LIM[sl.key], v = cfg[sl.key][sl.i];
      var tx = TX0 + (v - lim[0]) / (lim[1] - lim[0]) * (TX1 - TX0);
      text(NAMES[sl.i], 20, sl.y, 13, 'left');
      ctx.fillRect(TX0, sl.y - 1, TX1 - TX0, 2);
      ctx.beginPath(); ctx.arc(tx, sl.y, 9, 0, Math.PI * 2); ctx.fill();
      text(String(v), 264, sl.y, 14, 'left');
    }
    btn('RESET DEFAULTS', 60, 500, 240, 36, 15);
    btn('BACK', 80, 550, 200, 40, 18);
  }
  function draw() {
    var w = window.innerWidth, h = window.innerHeight;
    var dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#fff';

    if (state === 'menu') {
      text('PING PONG', W / 2, 110, 44);
      ctx.beginPath(); ctx.arc(W / 2, 165, R, 0, Math.PI * 2); ctx.fill();
      btn('START GAME', 80, 250, 200, 44, 20);
      btn('SETUP', 80, 315, 200, 44, 20);
      btn('EXIT', 80, 380, 200, 44, 20);
      if (noticeT > 0) text(notice, W / 2, 600, 12);
      text('Developed by Subrahmanyam', W / 2, 622, 13);
    } else if (state === 'levels') {
      text('SELECT LEVEL', W / 2, 90, 28);
      for (var i = 0; i < 3; i++) btn(NAMES[i], 80, 150 + i * 60, 200, 40, 20);
      text('First to ' + cfg.win + ' wins', W / 2, 338, 13);
      btn('CONTROL: ' + (ctrl ? 'TILT' : 'TOUCH'), 60, 360, 240, 40, 17);
      if (ctrl === 1) btn('TILT DIR: ' + (rev === 1 ? 'NORMAL' : 'REVERSED'), 80, 410, 200, 30, 13);
      text(ctrl ? 'Tilt left / right to move' : 'Drag to move your paddle', W / 2, 470, 14);
      btn('BACK', 80, 540, 200, 40, 18);
      if (noticeT > 0) text(notice, W / 2, 600, 12);
    } else if (state === 'setup') {
      drawSetup();
    } else {
      for (var x = 8; x < W; x += 28) ctx.fillRect(x, H / 2 - 1, 14, 2);
      text(String(aScore), W - 30, H / 2 - 40, 40);
      text(String(pScore), W - 30, H / 2 + 40, 40);
      ctx.fillRect(ax - AW / 2, AY - PH / 2, AW, PH);
      ctx.fillRect(px - pw / 2, PY - PH / 2, pw, PH);
      ctx.beginPath(); ctx.arc(ball.x, ball.y, R, 0, Math.PI * 2); ctx.fill();
      if (state === 'over') {
        text(msg, W / 2, H / 2 - 60, 40);
        text('Tap to continue', W / 2, H / 2 + 100, 16);
      }
      if (noticeT > 0) text(notice, W / 2, H - 14, 12);
    }
    ctx.restore();
  }

  var last = 0;
  function frame(t) {
    var dt = last ? (t - last) / 1000 : 0.016;
    last = t;
    if (dt > 0.033) dt = 0.033;
    if (noticeT > 0) noticeT -= dt;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', function () { last = 0; });
  requestAnimationFrame(frame);
})();
</script>
</body>
</html>`;

export default function App() {
  const [key, setKey] = useState(0);
  const webRef = useRef(null);

  useEffect(() => {
    try { activateKeepAwakeAsync('game').catch(() => {}); } catch (e) {}
  }, []);

  // Hardware/gesture back: let the game decide (menu -> exit, other screens -> menu)
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (webRef.current) webRef.current.injectJavaScript('window.__back && window.__back(); true;');
      return true;
    });
    return () => sub.remove();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar hidden translucent backgroundColor="#000000" />
      <WebView
        key={key}
        ref={webRef}
        onRenderProcessGone={() => setKey((k) => k + 1)}
        onMessage={(e) => { if (e.nativeEvent.data === 'exit') BackHandler.exitApp(); }}
        style={{ flex: 1, backgroundColor: '#000' }}
        containerStyle={{ backgroundColor: '#000' }}
        originWhitelist={['*']}
        source={{ html: HTML_STRING, baseUrl: 'https://localhost' }}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        setSupportMultipleWindows={false}
        mediaPlaybackRequiresUserAction={false}
      />
    </View>
  );
}
