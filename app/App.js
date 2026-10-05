import React from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';

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
  var W = 360, H = 640;
  var PW = 72, PH = 10, R = 7;
  var PY = H - 56, AY = 56;
  var WIN = 7;
  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');
  var scale = 1, ox = 0, oy = 0;

  var state = 'menu';            // menu | serve | play | over
  var diff = 1;                  // 0 easy, 1 normal, 2 hard
  var AI = [ { spd: 170, err: 55 }, { spd: 250, err: 28 }, { spd: 340, err: 8 } ];
  var NAMES = ['EASY', 'NORMAL', 'HARD'];
  var px = W / 2, ax = W / 2, aiOff = 0;
  var ball = { x: W / 2, y: H / 2, vx: 0, vy: 0 };
  var speed = 300, serveTimer = 0, serveDir = 1;
  var pScore = 0, aScore = 0, msg = '';
  var audio = null;

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
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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

  function startMatch(d) {
    diff = d; pScore = 0; aScore = 0; px = W / 2; ax = W / 2;
    serveDir = Math.random() < 0.5 ? 1 : -1;
    beginServe();
  }
  function beginServe() {
    state = 'serve'; serveTimer = 1.0;
    ball.x = W / 2; ball.y = H / 2; ball.vx = 0; ball.vy = 0;
    speed = 300; aiOff = (Math.random() * 2 - 1) * AI[diff].err;
  }
  function launch() {
    var a = (Math.random() * 2 - 1) * 0.5;
    ball.vx = speed * Math.sin(a);
    ball.vy = serveDir * speed * Math.cos(a);
    state = 'play';
  }

  function setPx(clientX) {
    var x = (clientX - ox) / scale;
    px = Math.max(PW / 2, Math.min(W - PW / 2, x));
  }
  function onDown(e) {
    if (e.preventDefault) e.preventDefault();
    beep(0, 0.001);
    if (state === 'menu') {
      var y = (e.clientY - oy) / scale;
      for (var i = 0; i < 3; i++) {
        var by = 300 + i * 70;
        if (y >= by - 10 && y <= by + 50) { startMatch(i); return; }
      }
    } else if (state === 'over') {
      state = 'menu';
    }
    setPx(e.clientX);
  }
  function onMove(e) { if (e.preventDefault) e.preventDefault(); setPx(e.clientX); }
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  function point(playerWon) {
    if (playerWon) { pScore++; serveDir = -1; } else { aScore++; serveDir = 1; }
    beep(playerWon ? 880 : 180, 0.25);
    if (pScore >= WIN || aScore >= WIN) {
      state = 'over'; msg = playerWon ? 'YOU WIN' : 'YOU LOSE';
    } else { beginServe(); }
  }

  function update(dt) {
    // AI paddle
    var tx = (state === 'play' && ball.vy < 0) ? ball.x + aiOff : W / 2;
    var step = AI[diff].spd * dt;
    var dx = tx - ax;
    ax += Math.max(-step, Math.min(step, dx));
    ax = Math.max(PW / 2, Math.min(W - PW / 2, ax));

    if (state === 'serve') {
      serveTimer -= dt;
      if (serveTimer <= 0) launch();
      return;
    }
    if (state !== 'play') return;

    var py0 = ball.y;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    if (ball.x < R) { ball.x = R; ball.vx = Math.abs(ball.vx); beep(300, 0.04); }
    if (ball.x > W - R) { ball.x = W - R; ball.vx = -Math.abs(ball.vx); beep(300, 0.04); }

    var pTop = PY - PH / 2, aBot = AY + PH / 2;
    if (ball.vy > 0 && py0 + R <= pTop && ball.y + R >= pTop && Math.abs(ball.x - px) <= PW / 2 + R) {
      hit(px, -1, pTop - R);
      aiOff = (Math.random() * 2 - 1) * AI[diff].err;
    } else if (ball.vy < 0 && py0 - R >= aBot && ball.y - R <= aBot && Math.abs(ball.x - ax) <= PW / 2 + R) {
      hit(ax, 1, aBot + R);
    }

    if (ball.y < -R * 2) point(true);
    else if (ball.y > H + R * 2) point(false);
  }
  function hit(cx, dirY, newY) {
    var off = Math.max(-1, Math.min(1, (ball.x - cx) / (PW / 2)));
    var a = off * 1.0;
    speed = Math.min(speed * 1.05, 620);
    ball.vx = speed * Math.sin(a);
    ball.vy = dirY * speed * Math.cos(a);
    ball.y = newY;
    beep(520, 0.05);
  }

  function text(s, x, y, size, align) {
    ctx.font = 'bold ' + size + 'px monospace';
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s, x, y);
  }

  function draw() {
    var w = window.innerWidth, h = window.innerHeight;
    ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#fff';

    if (state === 'menu') {
      text('PING PONG', W / 2, 150, 44);
      ctx.beginPath(); ctx.arc(W / 2, 215, R, 0, Math.PI * 2); ctx.fill();
      text('Choose difficulty', W / 2, 270, 16);
      for (var i = 0; i < 3; i++) {
        var by = 300 + i * 70;
        ctx.lineWidth = 2;
        ctx.strokeRect(80, by, 200, 40);
        text(NAMES[i], W / 2, by + 21, 20);
      }
      text('First to ' + WIN + ' wins', W / 2, 560, 14);
      text('Drag to move your paddle', W / 2, 584, 14);
      ctx.restore();
      return;
    }

    // centre dashed line
    for (var x = 8; x < W; x += 28) ctx.fillRect(x, H / 2 - 1, 14, 2);
    // scores
    text(String(aScore), W - 30, H / 2 - 40, 40);
    text(String(pScore), W - 30, H / 2 + 40, 40);
    // paddles
    ctx.fillRect(ax - PW / 2, AY - PH / 2, PW, PH);
    ctx.fillRect(px - PW / 2, PY - PH / 2, PW, PH);
    // ball
    ctx.beginPath(); ctx.arc(ball.x, ball.y, R, 0, Math.PI * 2); ctx.fill();

    if (state === 'over') {
      text(msg, W / 2, H / 2 - 60, 40);
      text('Tap to continue', W / 2, H / 2 + 100, 16);
    }
    ctx.restore();
  }

  var last = 0;
  function frame(t) {
    var dt = last ? (t - last) / 1000 : 0.016;
    last = t;
    if (dt > 0.033) dt = 0.033;
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
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar hidden />
      <WebView
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
