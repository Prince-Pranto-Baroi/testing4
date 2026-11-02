/* AquaLuxe – rising bubble animation.
   Change BUBBLE_GAP_MS to set the time gap between bubbles (milliseconds). */
(function () {
  var BUBBLE_GAP_MS = 1500;      // one new bubble every 1.5 seconds
  var MIN_SIZE = 8, MAX_SIZE = 34;        // bubble size in px
  var MIN_RISE = 7000, MAX_RISE = 12000;  // how long a bubble takes to rise (ms)

  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var css = document.createElement('style');
  css.textContent =
    '#bubbles{position:fixed;inset:0;overflow:hidden;pointer-events:none;z-index:5}' +
    '.bubble{position:absolute;bottom:-60px;border-radius:50%;opacity:0;will-change:transform,opacity;' +
    'background:radial-gradient(circle at 30% 28%,rgba(255,255,255,.55),rgba(120,220,200,.14) 45%,rgba(120,220,200,.05) 70%);' +
    'border:1px solid rgba(160,240,225,.35);box-shadow:inset 0 0 6px rgba(255,255,255,.18),0 0 8px rgba(100,220,200,.12);' +
    'animation:bubble-rise var(--t) linear forwards}' +
    '@keyframes bubble-rise{0%{transform:translate(0,0) scale(.6);opacity:0}10%{opacity:.9}' +
    '35%{transform:translate(var(--dx),-35vh) scale(.9)}65%{transform:translate(calc(var(--dx)*-.7),-70vh) scale(1)}' +
    '90%{opacity:.7}100%{transform:translate(calc(var(--dx)*.4),-115vh) scale(1.05);opacity:0}}';
  document.head.appendChild(css);

  var layer = document.createElement('div');
  layer.id = 'bubbles';
  layer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(layer);

  var rnd = function (a, b) { return a + Math.random() * (b - a); };

  function spawn() {
    var b = document.createElement('span'), s = rnd(MIN_SIZE, MAX_SIZE), t = rnd(MIN_RISE, MAX_RISE);
    b.className = 'bubble';
    b.style.width = b.style.height = s + 'px';
    b.style.left = rnd(2, 96) + '%';
    b.style.setProperty('--t', t + 'ms');
    b.style.setProperty('--dx', rnd(-40, 40) + 'px');
    b.addEventListener('animationend', function () { b.remove(); });
    layer.appendChild(b);
  }

  var timer = null;
  function start() { if (!timer) { spawn(); timer = setInterval(spawn, BUBBLE_GAP_MS); } }
  function stop() { clearInterval(timer); timer = null; }
  document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });
  start();
})();
