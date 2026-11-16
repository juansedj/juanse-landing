(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wideHero = matchMedia('(min-width: 860px) and (min-aspect-ratio: 1/1)');
  document.documentElement.classList.add('js');

  /* ───────── Beat: melodic techno sintetizado en el navegador ───────── */
  const BPM = 122, STEP = 60 / BPM / 4;
  const audio = { ctx: null, on: false, analyser: null, data: null, kicks: [] };
  const CHORDS = [
    { root: 33, tones: [57, 60, 64] },   // La menor
    { root: 29, tones: [53, 57, 60] },   // Fa
    { root: 36, tones: [55, 60, 64] },   // Do
    { root: 31, tones: [55, 59, 62] },   // Sol
  ];
  const ARP = [0, 1, 2, 1, 3, 2, 1, 2, 0, 2, 3, 2, 1, 3, 2, 1];
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);

  function buildAudio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const master = ctx.createGain(); master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    const an = ctx.createAnalyser(); an.fftSize = 256; an.smoothingTimeConstant = 0.72;
    master.connect(comp); comp.connect(an); an.connect(ctx.destination);
    const duck = ctx.createGain(); duck.connect(master);
    const delay = ctx.createDelay(1); delay.delayTime.value = STEP * 3;
    const fb = ctx.createGain(); fb.gain.value = 0.42;
    const wet = ctx.createGain(); wet.gain.value = 0.5;
    delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(duck);
    const nb = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
    const ch = nb.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    Object.assign(audio, { ctx, master, duck, delay, noise: nb, analyser: an, data: new Uint8Array(an.frequencyBinCount), step: 0, next: 0 });
  }

  function tone(type, f, t, dur, peak, dest, cutoff) {
    const { ctx } = audio;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (cutoff) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff; o.connect(lp); node = lp; }
    node.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.02);
    return o;
  }
  function noise(t, dur, peak, type, freq) {
    const { ctx } = audio;
    const s = ctx.createBufferSource(); s.buffer = audio.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(audio.master);
    s.start(t); s.stop(t + dur + 0.02);
  }
  function schedule(n, t) {
    const { ctx, master, duck, delay } = audio;
    const bar = Math.floor(n / 16), s = n % 16;
    const chord = CHORDS[bar % 4];
    if (s % 4 === 0) {
      const k = tone('sine', 150, t, 0.34, 0.95, master);
      k.frequency.exponentialRampToValueAtTime(44, t + 0.11);
      duck.gain.cancelScheduledValues(t);
      duck.gain.setValueAtTime(0.3, t); duck.gain.linearRampToValueAtTime(1, t + 0.24);
      audio.kicks.push(t);
    } else {
      tone('sawtooth', hz(chord.root), t, 0.13, 0.3, duck, 260);
    }
    if (s % 4 === 2) noise(t, 0.05, 0.16, 'highpass', 7500);
    if (s % 8 === 4 && bar % 8 > 1) noise(t, 0.14, 0.2, 'bandpass', 1700);
    if (bar % 8 > 0) {
      const i = ARP[s], m = i === 3 ? chord.tones[0] + 12 : chord.tones[i];
      const a = tone('triangle', hz(m + 12), t, 0.2, 0.085, duck, 2600 + 1400 * Math.sin(n / 21));
      a.connect(delay);
    }
    if (s === 0) {
      const len = STEP * 16;
      chord.tones.forEach((m, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
        o.type = 'sawtooth'; o.frequency.value = hz(m); o.detune.value = (i - 1) * 9;
        lp.type = 'lowpass'; lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(1500, t + len);
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.045, t + 0.5);
        g.gain.setValueAtTime(0.045, t + len - 0.3); g.gain.linearRampToValueAtTime(0.0001, t + len + 0.2);
        o.connect(lp); lp.connect(g); g.connect(duck);
        o.start(t); o.stop(t + len + 0.25);
      });
    }
  }
  function pump() {
    if (!audio.on) return;
    while (audio.next < audio.ctx.currentTime + 0.14) { schedule(audio.step++, audio.next); audio.next += STEP; }
  }

  const playBtn = $('#play'), hint = $('#playHint');
  async function setPlaying(on) {
    if (on) {
      try {
        if (!audio.ctx) buildAudio();
        await audio.ctx.resume();
      } catch (e) { hint.textContent = 'Tu navegador no pudo reproducir el audio'; return; }
      const t = audio.ctx.currentTime;
      audio.step = 0; audio.next = t + 0.06; audio.kicks.length = 0;
      audio.master.gain.cancelScheduledValues(t);
      audio.master.gain.setValueAtTime(audio.master.gain.value, t);
      audio.master.gain.linearRampToValueAtTime(0.75, t + 0.4);
      audio.on = true;
      audio.timer = setInterval(pump, 25); pump();
    } else if (audio.ctx) {
      audio.on = false; clearInterval(audio.timer);
      const t = audio.ctx.currentTime;
      audio.master.gain.cancelScheduledValues(t);
      audio.master.gain.setValueAtTime(audio.master.gain.value, t);
      audio.master.gain.linearRampToValueAtTime(0, t + 0.25);
      setTimeout(() => { if (!audio.on) audio.ctx.suspend(); }, 700);
    }
    playBtn.setAttribute('aria-pressed', String(audio.on));
    playBtn.setAttribute('aria-label', audio.on ? 'Pausar el beat' : 'Reproducir el beat');
    hint.textContent = audio.on ? 'Sonando · 122 BPM' : 'Dale play';
    if (audio.on) startLoop();
  }
  playBtn.addEventListener('click', () => setPlaying(!audio.on));
  document.addEventListener('visibilitychange', () => { if (document.hidden && audio.on) setPlaying(false); });

  /* ───────── Escena 3D: el aro de la marca convertido en ecualizador ───────── */
  const canvas = $('#stage'), hero = $('#inicio');
  let frame = () => {}, running = false, heroVisible = true, raf = 0;
  function startLoop() { if (!running && heroVisible) { running = true; raf = requestAnimationFrame(tick); } }
  function tick(ms) { if (!running) return; frame(ms / 1000); raf = requestAnimationFrame(tick); }

  function initScene() {
    const T = window.THREE;
    if (!T) return;
    let renderer;
    try { renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' }); }
    catch (e) { return; }
    renderer.setClearColor(0x000000, 0);
    const scene = new T.Scene();
    const cam = new T.PerspectiveCamera(45, 1, 0.1, 100); cam.position.z = 10;
    const HALF = Math.tan(T.MathUtils.degToRad(22.5)) * 10;

    const N = 132, R = 2, REACH = 3.35;
    const rig = new T.Group(), ring = new T.Group();
    rig.add(ring); scene.add(rig);

    const geo = new T.BoxGeometry(0.052, 1, 0.052); geo.translate(0, 0.5, 0);
    const mat = new T.MeshBasicMaterial({ transparent: true, opacity: 0.95, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false });
    const bars = new T.InstancedMesh(geo, mat, N * 2);
    const blue = new T.Color('#667CE9'), violet = new T.Color('#8a52c9'), c = new T.Color();
    const ang = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      ang[i] = Math.PI / 2 - (i / N) * Math.PI * 2;
      c.copy(blue).lerp(violet, (1 - Math.sin(ang[i])) / 2);
      bars.setColorAt(i, c);
      bars.setColorAt(i + N, c.clone().multiplyScalar(0.55));
    }
    bars.instanceColor.needsUpdate = true;
    ring.add(bars);

    // Aro sólido, con el degradado vertical del logo
    const tg = new T.TorusGeometry(R - 0.09, 0.028, 10, 160);
    const tc = new Float32Array(tg.attributes.position.count * 3);
    for (let i = 0; i < tg.attributes.position.count; i++) {
      c.copy(blue).lerp(violet, (1 - tg.attributes.position.getY(i) / R) / 2);
      tc[i * 3] = c.r; tc[i * 3 + 1] = c.g; tc[i * 3 + 2] = c.b;
    }
    tg.setAttribute('color', new T.BufferAttribute(tc, 3));
    ring.add(new T.Mesh(tg, new T.MeshBasicMaterial({ vertexColors: true, toneMapped: false })));

    // Ondas que salen con cada golpe
    const cpts = [];
    for (let i = 0; i < 128; i++) { const a = (i / 128) * Math.PI * 2; cpts.push(new T.Vector3(Math.cos(a) * R, Math.sin(a) * R, 0)); }
    const cgeo = new T.BufferGeometry().setFromPoints(cpts);
    const waves = [];
    for (let i = 0; i < 5; i++) {
      const w = new T.LineLoop(cgeo, new T.LineBasicMaterial({ color: 0xa99cf5, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false }));
      w.userData.life = 1; ring.add(w); waves.push(w);
    }
    let wi = 0;
    const kick = () => { const w = waves[wi++ % waves.length]; w.userData.life = 0; };

    // Polvo de luz
    const P = 520, pp = new Float32Array(P * 3);
    for (let i = 0; i < P; i++) { pp[i * 3] = (Math.random() - 0.5) * 22; pp[i * 3 + 1] = (Math.random() - 0.5) * 14; pp[i * 3 + 2] = -7 + Math.random() * 10; }
    const pg = new T.BufferGeometry(); pg.setAttribute('position', new T.BufferAttribute(pp, 3));
    const dust = new T.Points(pg, new T.PointsMaterial({ color: 0xa99cf5, size: 0.045, transparent: true, opacity: 0.75, blending: T.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
    scene.add(dust);

    function layout() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);
      cam.aspect = w / h; cam.updateProjectionMatrix();
      const W = HALF * cam.aspect;
      if (wideHero.matches) {
        rig.position.set(W * 0.44, 0, 0);
        rig.scale.setScalar(Math.min(HALF * 0.9, W * 0.6) / REACH);
      } else {
        rig.position.set(0, HALF * 0.44, 0);
        rig.scale.setScalar(Math.min(W * 1.22, HALF * 0.66) / REACH);
      }
    }
    layout();
    addEventListener('resize', layout);

    const lv = new Float32Array(N).fill(0.15);
    const d = new T.Object3D();
    const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
    addEventListener('pointermove', e => { ptr.tx = e.clientX / innerWidth * 2 - 1; ptr.ty = e.clientY / innerHeight * 2 - 1; }, { passive: true });
    let last = 0, lastBeat = -1;

    frame = t => {
      const dt = Math.min(0.05, t - last || 0.016); last = t;
      const live = audio.on && audio.analyser;
      let energy;
      if (live) {
        audio.analyser.getByteFrequencyData(audio.data);
        const now = audio.ctx.currentTime;
        while (audio.kicks.length && audio.kicks[0] <= now) { audio.kicks.shift(); kick(); }
        energy = (audio.data[1] + audio.data[2] + audio.data[3]) / 765;
      } else {
        const b = t * BPM / 60, ph = b % 1;
        if (Math.floor(b) !== lastBeat) { lastBeat = Math.floor(b); if (!reduced) kick(); }
        energy = Math.exp(-ph * 4.5);
      }
      for (let i = 0; i < N; i++) {
        const m = (i < N / 2 ? i : N - i) / (N / 2);
        let v;
        if (live) { const x = audio.data[1 + Math.floor(m * 58)] / 255; v = 0.1 + x * x * 1.35; }
        else v = 0.14 + 0.3 * (0.5 + 0.5 * Math.sin(i * 0.33 + t * 1.7)) * (0.5 + 0.5 * Math.sin(i * 0.12 - t * 0.9)) + energy * 0.6 * (0.5 + 0.5 * Math.cos(m * Math.PI * 4));
        lv[i] += (v - lv[i]) * Math.min(1, dt * (v > lv[i] ? 26 : 9));
        const a = ang[i], cx = Math.cos(a), sy = Math.sin(a);
        d.position.set(cx * R, sy * R, 0); d.rotation.z = a - Math.PI / 2; d.scale.set(1, lv[i], 1); d.updateMatrix();
        bars.setMatrixAt(i, d.matrix);
        d.position.set(cx * (R - 0.18), sy * (R - 0.18), 0); d.rotation.z = a + Math.PI / 2; d.scale.set(1, lv[i] * 0.42, 1); d.updateMatrix();
        bars.setMatrixAt(i + N, d.matrix);
      }
      bars.instanceMatrix.needsUpdate = true;
      for (const w of waves) {
        const u = w.userData; u.life = Math.min(1, u.life + dt * 0.85);
        w.scale.setScalar(1 + u.life * 1.5); w.material.opacity = (1 - u.life) * 0.5;
      }
      ptr.x += (ptr.tx - ptr.x) * 0.06; ptr.y += (ptr.ty - ptr.y) * 0.06;
      const sc = Math.min(1, scrollY / (hero.offsetHeight || 1));
      ring.rotation.x = -0.42 + Math.sin(t * 0.35) * 0.1 + ptr.y * 0.3 - sc * 0.9;
      ring.rotation.y = Math.sin(t * 0.27) * 0.28 + ptr.x * 0.45;
      ring.rotation.z = t * 0.05;
      ring.scale.setScalar(1 + energy * 0.035);
      dust.rotation.y = t * 0.02 + ptr.x * 0.1; dust.rotation.x = ptr.y * 0.06;
      dust.material.opacity = 0.5 + energy * 0.35;
      renderer.render(scene, cam);
    };

    new IntersectionObserver(([e]) => {
      heroVisible = e.isIntersecting;
      if (!heroVisible) { running = false; cancelAnimationFrame(raf); }
      else if (!reduced || audio.on) startLoop();
      else frame(1.2);
    }, { threshold: 0 }).observe(hero);
    if (reduced) frame(1.2); else startLoop();
  }
  if (window.THREE) initScene(); else addEventListener('load', initScene);

  /* ───────── Navegación y CTA flotante ───────── */
  const nav = $('#nav'), dock = $('#dock');
  let finalSeen = false;
  const onScroll = () => {
    nav.classList.toggle('solid', scrollY > 24);
    dock.classList.toggle('show', scrollY > innerHeight * 0.7 && !finalSeen);
  };
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => { finalSeen = e.isIntersecting; onScroll(); }, { threshold: 0.35 }).observe($('.final'));
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.add('in'); io.unobserve(e.target);
    }), { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    $$('.reveal').forEach(el => {
      const sibs = [...el.parentElement.children].filter(x => x.classList.contains('reveal'));
      el.style.setProperty('--d', Math.min(sibs.indexOf(el), 5) * 0.08 + 's');
      io.observe(el);
    });
  } else $$('.reveal').forEach(el => el.classList.add('in'));

  /* ───────── Tarjetas con inclinación 3D ───────── */
  if (matchMedia('(hover: hover) and (pointer: fine)').matches && !reduced) {
    $$('.tilt').forEach(card => {
      card.addEventListener('pointermove', e => {
        const r = card.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        card.style.setProperty('--ry', (x - 0.5) * 9 + 'deg');
        card.style.setProperty('--rx', (0.5 - y) * 9 + 'deg');
        card.style.setProperty('--mx', x * 100 + '%'); card.style.setProperty('--my', y * 100 + '%');
      });
      card.addEventListener('pointerleave', () => { card.style.setProperty('--rx', '0deg'); card.style.setProperty('--ry', '0deg'); });
    });
  }

  /* ───────── Comparador ───────── */
  const cmp = $('#compare'), range = $('#compareRange');
  range.addEventListener('input', () => cmp.style.setProperty('--p', range.value + '%'));
  if (!reduced && 'IntersectionObserver' in window) {
    // Un vaivén al entrar, para mostrar que se puede deslizar
    const once = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return; once.disconnect();
      const t0 = performance.now();
      const step = now => {
        const k = (now - t0) / 1500;
        if (k >= 1 || cmp.dataset.touched) return;
        const v = 50 + Math.sin(k * Math.PI * 2) * 26;
        range.value = v; cmp.style.setProperty('--p', v + '%'); requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, { threshold: 0.6 });
    once.observe(cmp);
    range.addEventListener('pointerdown', () => { cmp.dataset.touched = '1'; });
  }

  /* ───────── Arma tu mezcla ───────── */
  const pads = $$('.pad'), biz = $('#biz'), msgText = $('#msgText'), meter = $$('#meter i'), copyBtn = $('#copy');
  const list = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' y ' + a[a.length - 1];
  function compose() {
    const sel = pads.filter(p => p.getAttribute('aria-pressed') === 'true').map(p => p.dataset.v);
    const guide = sel.includes('?'), wants = sel.filter(v => v !== '?');
    const b = biz.value.trim().replace(/\s+/g, ' ');
    let m = 'MARCA';
    if (sel.length || b) {
      m += ' 🎧 Hola Juanse';
      if (b) m += ', tengo ' + b;
      if (wants.length) m += (b ? ' y' : ',') + ' me interesa: ' + list(wants) + '.';
      else m += '.';
      if (guide) m += wants.length ? ' También quiero que me orientes.' : ' Quiero que me orientes sobre qué necesita mi marca.';
    }
    msgText.textContent = m;
    meter.forEach((el, i) => { const on = i < sel.length; el.classList.toggle('on', on); el.style.height = on ? 35 + ((i * 37) % 60) + '%' : '20%'; });
  }
  pads.forEach(p => p.addEventListener('click', () => {
    p.setAttribute('aria-pressed', String(p.getAttribute('aria-pressed') !== 'true')); compose();
  }));
  biz.addEventListener('input', compose);
  copyBtn.addEventListener('click', async () => {
    const text = msgText.textContent;
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; }
    catch (e) {
      const sel = getSelection(), r = document.createRange();
      r.selectNodeContents(msgText); sel.removeAllRanges(); sel.addRange(r);
      try { ok = document.execCommand('copy'); } catch (_) {}
    }
    copyBtn.textContent = ok ? 'Copiado ✓' : 'Mantén presionado el texto para copiarlo';
    setTimeout(() => { copyBtn.textContent = 'Copiar mensaje'; }, 2200);
  });
  compose();
})();
