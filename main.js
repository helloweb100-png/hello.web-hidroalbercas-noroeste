/* ==========================================================================
   HIDROALBERCAS NOROESTE | main.js
   JavaScript nativo, sin dependencias.

   Índice
   0. Configuración y utilidades
   1. WhatsApp (enlaces y mensajes)
   2. Loader (spinner con manómetro y llenado de agua)
   3. Navegación (header, menú móvil, enlace activo)
   4. Revelado en scroll, titulares partidos y contadores
   5. Rotador de palabras del hero
   6. Efectos visuales: agua (WebGL), burbujas (canvas 2D)
   7. Interacción con puntero: tilt, spotlight, magnético, ripple
   8. Acordeones y hotspots del showroom
   9. Asistente de selección
   10. Proceso (tubería que se llena) y ventajas
   11. Formulario hacia WhatsApp
   12. Botón flotante de WhatsApp y utilidades finales

   Nota de rendimiento: no se usan listeners de "scroll". El scroll se observa
   con IntersectionObserver y CSS (animation-timeline). Los efectos continuos
   se pausan cuando salen de pantalla o la pestaña está oculta.
   ========================================================================== */
(() => {
  'use strict';

  /* ---------- 0. CONFIGURACIÓN Y UTILIDADES ---------- */
  const CONFIG = {
    whatsapp: '526144891862', // código de país + 10 dígitos (cambiar aquí si el WhatsApp es el otro número)
    defaultMsg: 'Hola, quiero cotizar un equipo. ¿Me pueden apoyar?',
    loaderMin: 2400, // duración mínima del loader en ms
    loaderMax: 4500, // tope: aunque la red sea lenta, el loader nunca pasa de este tiempo
  };

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ---------- 1. WHATSAPP ---------- */
  const waUrl = (text) => `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(text)}`;

  function wireWhatsApp() {
    $$('[data-wa]').forEach((a) => { a.href = waUrl(a.dataset.msg || CONFIG.defaultMsg); });
  }

  /* ---------- 2. LOADER ---------- */
  const Loader = {
    run(onDone) {
      const el = $('#loader');
      const countEl = $('#loaderCount');
      if (!el || reduceMotion) {
        if (el) el.remove();
        document.body.classList.remove('is-locked');
        root.classList.add('is-ready');
        onDone();
        return;
      }

      let p = 0;
      let finished = false;
      let loaded = document.readyState === 'complete';
      const t0 = performance.now();
      window.addEventListener('load', () => { loaded = true; }, { once: true });

      const finish = () => {
        if (finished) return;
        finished = true;
        el.style.setProperty('--p', '1');
        countEl.textContent = '100';
        // pequeña pausa con el tanque lleno antes de abrir la cortina circular
        setTimeout(() => {
          el.classList.add('is-done');
          document.body.classList.remove('is-locked');
          root.classList.add('is-ready');
          onDone();
          setTimeout(() => el.classList.add('is-gone'), 1700);
        }, 380);
      };

      const tick = (now) => {
        if (finished) return;
        const t = now - t0;
        const sim = 1 - Math.pow(1 - clamp(t / CONFIG.loaderMin, 0, 1), 2.4);
        const target = (loaded && t >= CONFIG.loaderMin) || t >= CONFIG.loaderMax ? 1 : Math.min(sim * 0.94, 0.94);
        p += (target - p) * 0.1;
        if (target === 1 && p > 0.992) p = 1;
        el.style.setProperty('--p', p.toFixed(4));
        countEl.textContent = String(Math.round(p * 100));
        if (p >= 1) { finish(); return; }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      setTimeout(finish, CONFIG.loaderMax + 2500); // salvavidas
    },
  };

  /* ---------- 3. NAVEGACIÓN ---------- */
  function initNav() {
    const nav = $('#nav');
    const sentinel = $('#top-sentinel');
    const burger = $('#burger');
    const menu = $('#menu');

    if (nav && sentinel) {
      new IntersectionObserver(([e]) => nav.classList.toggle('is-scrolled', !e.isIntersecting)).observe(sentinel);
    }

    if (burger && menu) {
      menu.inert = true;
      const setMenu = (open) => {
        menu.classList.toggle('is-open', open);
        menu.inert = !open;
        menu.setAttribute('aria-hidden', String(!open));
        burger.setAttribute('aria-expanded', String(open));
        burger.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
        document.body.classList.toggle('is-locked', open);
        nav.classList.toggle('is-menu-open', open);
      };
      burger.addEventListener('click', () => setMenu(!menu.classList.contains('is-open')));
      $$('a', menu).forEach((a) => a.addEventListener('click', () => setMenu(false)));
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu.classList.contains('is-open')) setMenu(false); });
      window.matchMedia('(min-width: 1180px)').addEventListener('change', (m) => { if (m.matches) setMenu(false); });
    }

    // Enlace activo según la sección visible
    const links = $$('.nav__links a');
    const map = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        links.forEach((l) => l.classList.remove('is-active'));
        const l = map.get(e.target.id);
        if (l) l.classList.add('is-active');
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    $$('main > section[id]').forEach((s) => io.observe(s));
  }

  /* ---------- 4. REVELADO, TITULARES PARTIDOS, CONTADORES ---------- */
  function splitText(el) {
    el.style.setProperty('--base', el.dataset.base || '0');
    let i = 0;
    const makeWord = (text) => {
      const w = document.createElement('span');
      w.className = 'w';
      const s = document.createElement('span');
      s.style.setProperty('--i', String(i++));
      s.textContent = text;
      w.appendChild(s);
      return w;
    };
    const walk = (node) => {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            frag.appendChild(/^\s+$/.test(part) ? document.createTextNode(' ') : makeWord(part));
          });
          child.replaceWith(frag);
        } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName !== 'BR') {
          if (child.hasAttribute('data-nosplit')) {
            const w = document.createElement('span');
            w.className = 'w';
            const s = document.createElement('span');
            s.style.setProperty('--i', String(i++));
            child.replaceWith(w);
            s.appendChild(child);
            w.appendChild(s);
          } else {
            walk(child);
          }
        }
      });
    };
    walk(el);
  }

  function animateCount(el) {
    const target = parseFloat(el.dataset.count);
    const group = el.hasAttribute('data-group');
    const dur = 1800;
    const t0 = performance.now();
    const fmt = (v) => (group ? Math.round(v).toLocaleString('es-MX') : String(Math.round(v)));
    const step = (now) => {
      const k = clamp((now - t0) / dur, 0, 1);
      const eased = k === 1 ? 1 : 1 - Math.pow(2, -10 * k);
      el.textContent = fmt(target * eased);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function initReveal() {
    $$('[data-split]').forEach(splitText);
    $$('[data-stagger]').forEach((parent) => {
      $$('[data-reveal]', parent).forEach((el, idx) => {
        if (!el.style.getPropertyValue('--d')) el.style.setProperty('--d', String(idx * 90));
      });
    });

    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        obs.unobserve(e.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    $$('[data-reveal], [data-split]').forEach((el) => io.observe(el));

    if (!reduceMotion) {
      const cio = new IntersectionObserver((entries, obs) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          animateCount(e.target);
          obs.unobserve(e.target);
        });
      }, { threshold: 0.7 });
      $$('[data-count]').forEach((el) => cio.observe(el));
    }
  }

  /* ---------- 5. ROTADOR DEL HERO ---------- */
  function initRotator() {
    const rot = $('[data-rotator]');
    if (!rot) return;
    const items = $$('.rotator__item', rot);
    let idx = 0;
    const fit = () => { rot.style.width = `${items[idx].offsetWidth}px`; };
    fit();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
    window.addEventListener('resize', fit);
    if (reduceMotion || items.length < 2) return;

    let visible = true;
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(rot);

    const next = () => {
      if (!visible || document.hidden) return;
      const cur = items[idx];
      idx = (idx + 1) % items.length;
      const nx = items[idx];
      cur.classList.remove('is-on');
      cur.classList.add('is-off');
      cur.setAttribute('aria-hidden', 'true');
      nx.classList.remove('is-off');
      nx.classList.add('is-on');
      nx.removeAttribute('aria-hidden');
      fit();
      setTimeout(() => cur.classList.remove('is-off'), 950);
    };
    setInterval(next, 2700);
  }

  /* ---------- 6. EFECTOS VISUALES ---------- */
  // Administrador: un solo requestAnimationFrame para todos los efectos visibles.
  const FX = {
    items: new Set(),
    raf: 0,
    add(item, hostEl) {
      item.visible = false;
      this.items.add(item);
      new IntersectionObserver(([e]) => { item.visible = e.isIntersecting; this.kick(); }, { rootMargin: '80px' }).observe(hostEl);
    },
    kick() {
      if (this.raf || document.hidden) return;
      this.raf = requestAnimationFrame((t) => this.loop(t));
    },
    loop(now) {
      this.raf = 0;
      let any = false;
      this.items.forEach((it) => {
        if (!it.visible) return;
        any = true;
        if (now - (it.last || 0) >= (it.minDt || 0)) { it.last = now; it.render(now); }
      });
      if (any && !document.hidden) this.raf = requestAnimationFrame((t) => this.loop(t));
    },
  };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) FX.kick(); });

  // Shader de cáusticas (luz sobre el fondo de una alberca) con ondas que siguen al cursor
  const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const FRAG = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif
    uniform vec2 uRes; uniform float uTime; uniform vec2 uMouse;
    uniform float uIntensity; uniform float uZoom; uniform vec2 uCenter;
    const float TAU = 6.28318530718;
    float caustics(vec2 uv, float time){
      vec2 p = mod(uv * TAU, TAU) - 250.0;
      vec2 i = p;
      float c = 1.0;
      const float inten = 0.005;
      for (int n = 0; n < 5; n++){
        float t = time * (1.0 - (3.5 / float(n + 1)));
        i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
        c += 1.0 / length(vec2(p.x / (sin(i.x + t) / inten), p.y / (cos(i.y + t) / inten)));
      }
      c /= 5.0;
      c = 1.17 - pow(c, 1.4);
      return pow(abs(c), 8.0);
    }
    void main(){
      vec2 uv = gl_FragCoord.xy / uRes;
      float aspect = uRes.x / uRes.y;
      vec2 pos = vec2(uv.x * aspect, uv.y);
      vec2 m = vec2(uMouse.x * aspect, uMouse.y);
      float d = distance(pos, m);
      vec2 st = pos * uZoom;
      st += normalize(pos - m + 0.0001) * 0.035 * exp(-d * 3.2) * sin(d * 26.0 - uTime * 3.0);
      float c = clamp(caustics(st, uTime * 0.28 + 23.0), 0.0, 1.0);
      float falloff = smoothstep(1.2, 0.05, distance(uv, uCenter));
      float a = c * falloff * uIntensity;
      vec3 col = mix(vec3(0.10, 0.42, 0.95), vec3(0.55, 0.92, 1.0), c);
      gl_FragColor = vec4(col * a, a);
    }`;

  class WaterFX {
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      this.opts = Object.assign({ scale: 0.5, intensity: 1, zoom: 1.15, center: [0.7, 0.45] }, opts);
      this.minDt = 33; // ~30 fps: suficiente para luz suave y ahorra batería
      this.mouse = [0.5, 0.5];
      this.target = [0.5, 0.5];
      this.gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: 'low-power' });
      this.ok = !!this.gl && this.build();
      if (!this.ok) this.fallback = canvas.getContext('2d');
      this.resize();
      window.addEventListener('resize', () => this.resize());
    }

    build() {
      const gl = this.gl;
      const mk = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
      };
      const vs = mk(gl.VERTEX_SHADER, VERT);
      const fs = mk(gl.FRAGMENT_SHADER, FRAG);
      if (!vs || !fs) return false;
      const prog = gl.createProgram();
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
      gl.useProgram(prog);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'p');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      this.u = {};
      ['uRes', 'uTime', 'uMouse', 'uIntensity', 'uZoom', 'uCenter'].forEach((n) => { this.u[n] = gl.getUniformLocation(prog, n); });
      return true;
    }

    resize() {
      const r = this.canvas.getBoundingClientRect();
      const k = this.opts.scale * Math.min(window.devicePixelRatio || 1, 1.5);
      this.w = this.canvas.width = Math.max(2, Math.round(r.width * k));
      this.h = this.canvas.height = Math.max(2, Math.round(r.height * k));
      if (this.ok) this.gl.viewport(0, 0, this.w, this.h);
    }

    render(now) {
      this.mouse[0] += (this.target[0] - this.mouse[0]) * 0.08;
      this.mouse[1] += (this.target[1] - this.mouse[1]) * 0.08;
      const t = reduceMotion ? 4 : now / 1000;
      if (this.ok) {
        const gl = this.gl;
        const o = this.opts;
        gl.uniform2f(this.u.uRes, this.w, this.h);
        gl.uniform1f(this.u.uTime, t);
        gl.uniform2f(this.u.uMouse, this.mouse[0], this.mouse[1]);
        gl.uniform1f(this.u.uIntensity, o.intensity);
        gl.uniform1f(this.u.uZoom, o.zoom);
        gl.uniform2f(this.u.uCenter, o.center[0], o.center[1]);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        return;
      }
      // Respaldo 2D: tres ondas (eco del logotipo) si no hay WebGL
      const c = this.fallback;
      if (!c) return;
      c.clearRect(0, 0, this.w, this.h);
      c.lineWidth = Math.max(1, this.h / 160);
      for (let n = 0; n < 3; n++) {
        c.beginPath();
        c.strokeStyle = `rgba(95,215,255,${0.35 - n * 0.08})`;
        for (let x = 0; x <= this.w; x += 8) {
          const y = this.h * (0.55 + n * 0.12) + Math.sin(x / (this.w / 7) + t * (0.8 + n * 0.3)) * this.h * 0.05;
          x === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
        }
        c.stroke();
      }
    }

    setPointer(nx, ny) { this.target[0] = nx; this.target[1] = ny; }
  }

  // Burbujas ascendentes que esquivan el cursor
  class Bubbles {
    constructor(canvas, host) {
      this.canvas = canvas;
      this.host = host;
      this.ctx = canvas.getContext('2d');
      this.list = [];
      this.pointer = { x: -999, y: -999 };
      this.minDt = 0;
      this.resize();
      window.addEventListener('resize', () => this.resize());
      if (finePointer) {
        host.addEventListener('pointermove', (e) => {
          const r = canvas.getBoundingClientRect();
          this.pointer.x = e.clientX - r.left;
          this.pointer.y = e.clientY - r.top;
        });
        host.addEventListener('pointerleave', () => { this.pointer.x = this.pointer.y = -999; });
      }
    }

    spawn(initial) {
      const r = 2 + Math.pow(Math.random(), 2.2) * 15;
      return {
        x: Math.random() * this.w,
        y: initial ? Math.random() * this.h : this.h + r + Math.random() * 120,
        r,
        vy: 0.25 + (r / 17) * 0.9 + Math.random() * 0.25,
        sway: 6 + Math.random() * 22,
        ph: Math.random() * Math.PI * 2,
        sp: 0.4 + Math.random() * 0.9,
        push: 0,
      };
    }

    resize() {
      const r = this.canvas.getBoundingClientRect();
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.w = r.width;
      this.h = r.height;
      this.canvas.width = Math.round(r.width * this.dpr);
      this.canvas.height = Math.round(r.height * this.dpr);
      const count = clamp(Math.round((this.w * this.h) / 30000), 14, 44);
      this.list = Array.from({ length: count }, () => this.spawn(true));
    }

    render(now) {
      const c = this.ctx;
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      c.clearRect(0, 0, this.w, this.h);
      const t = now / 1000;
      for (let i = 0; i < this.list.length; i++) {
        const b = this.list[i];
        if (!reduceMotion) {
          b.y -= b.vy;
          b.ph += 0.012 * b.sp;
        }
        let x = b.x + Math.sin(b.ph + t * 0.2) * b.sway;
        // esquiva el cursor
        const dx = x - this.pointer.x;
        const dy = b.y - this.pointer.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 120) b.push += ((dx / (dist || 1)) * (120 - dist)) * 0.02;
        b.push *= 0.94;
        x += b.push * 10;
        if (b.y < -b.r * 2) this.list[i] = this.spawn(false);

        const g = c.createRadialGradient(x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.1, x, b.y, b.r);
        g.addColorStop(0, 'rgba(190,230,255,0.28)');
        g.addColorStop(0.7, 'rgba(90,162,255,0.08)');
        g.addColorStop(1, 'rgba(140,210,255,0.4)');
        c.beginPath();
        c.arc(x, b.y, b.r, 0, Math.PI * 2);
        c.fillStyle = g;
        c.fill();
        c.lineWidth = 1;
        c.strokeStyle = 'rgba(190,232,255,0.55)';
        c.stroke();
        // brillo especular
        c.beginPath();
        c.arc(x - b.r * 0.4, b.y - b.r * 0.4, Math.max(1, b.r * 0.22), 0, Math.PI * 2);
        c.fillStyle = 'rgba(255,255,255,0.75)';
        c.fill();
      }
    }
  }

  function initFX() {
    const hero = $('#inicio');
    const heroWater = $('canvas[data-fx="water"]');
    const heroBubbles = $('canvas[data-fx="bubbles"]');

    if (heroWater && hero) {
      const water = new WaterFX(heroWater, { scale: 0.5, intensity: 1.05, zoom: 1.15, center: [0.72, 0.5] });
      FX.add(water, hero);
      requestAnimationFrame(() => heroWater.classList.add('is-live'));
      if (finePointer) {
        hero.addEventListener('pointermove', (e) => {
          const r = heroWater.getBoundingClientRect();
          water.setPointer((e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height);
        });
      }
    }
    if (heroBubbles && hero) FX.add(new Bubbles(heroBubbles, hero), hero);

    const finalCanvas = $('canvas[data-fx="water-final"]');
    const finalSection = $('#cotiza');
    if (finalCanvas && finalSection) {
      FX.add(new WaterFX(finalCanvas, { scale: 0.4, intensity: 0.9, zoom: 1.0, center: [0.5, 0.5] }), finalSection);
      requestAnimationFrame(() => finalCanvas.classList.add('is-live'));
    }
    FX.kick();
  }

  /* ---------- 7. INTERACCIÓN CON PUNTERO ---------- */
  function initPointerFx() {
    // Ripple en botones (también en táctil)
    $$('.btn').forEach((btn) => {
      btn.addEventListener('pointerdown', (e) => {
        if (reduceMotion) return;
        const r = btn.getBoundingClientRect();
        const size = Math.max(r.width, r.height) * 2;
        const s = document.createElement('span');
        s.className = 'ripple';
        s.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
        btn.appendChild(s);
        setTimeout(() => s.remove(), 800);
      });
    });

    if (!finePointer || reduceMotion) return;

    // Tilt 3D del escenario del hero (sigue al cursor sobre toda la sección)
    const hero = $('#inicio');
    const stage = $('[data-tilt]');
    if (hero && stage) {
      let raf = 0;
      let nx = 0, ny = 0;
      hero.addEventListener('pointermove', (e) => {
        const r = hero.getBoundingClientRect();
        nx = (e.clientX - r.left) / r.width - 0.5;
        ny = (e.clientY - r.top) / r.height - 0.5;
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          stage.style.setProperty('--rx', `${(nx * 10).toFixed(2)}deg`);
          stage.style.setProperty('--ry', `${(-ny * 8).toFixed(2)}deg`);
        });
      });
      hero.addEventListener('pointerleave', () => { stage.style.setProperty('--rx', '0deg'); stage.style.setProperty('--ry', '0deg'); });
    }

    // Spotlight que sigue al cursor
    $$('[data-spot]').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${e.clientX - r.left}px`);
        el.style.setProperty('--my', `${e.clientY - r.top}px`);
      });
    });

    // Botones magnéticos
    $$('[data-magnetic]').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        el.style.translate = `${(dx * 0.18).toFixed(1)}px ${(dy * 0.28).toFixed(1)}px`;
      });
      el.addEventListener('pointerleave', () => { el.style.translate = '0 0'; });
    });

    // Parallax de la bomba destacada
    const studio = $('[data-parallax]');
    const studioImg = studio && $('img', studio);
    if (studio && studioImg) {
      studio.addEventListener('pointermove', (e) => {
        const r = studio.getBoundingClientRect();
        studioImg.style.setProperty('--tx', (((e.clientX - r.left) / r.width - 0.5) * -22).toFixed(1));
        studioImg.style.setProperty('--ty', (((e.clientY - r.top) / r.height - 0.5) * -16).toFixed(1));
      });
      studio.addEventListener('pointerleave', () => { studioImg.style.setProperty('--tx', '0'); studioImg.style.setProperty('--ty', '0'); });
    }
  }

  /* ---------- 8. ACORDEONES Y HOTSPOTS ---------- */
  function initAccordions() {
    const hotspots = $$('.hotspot');

    const setItem = (item, open) => {
      item.classList.toggle('is-open', open);
      const btn = $('.acc__btn', item);
      const panel = $('.acc__panel', item);
      if (btn) btn.setAttribute('aria-expanded', String(open));
      if (panel) panel.inert = !open;
    };
    const syncHotspots = () => {
      hotspots.forEach((h) => {
        const item = document.getElementById(`acc-${h.dataset.accTarget}`);
        h.classList.toggle('is-active', !!item && item.classList.contains('is-open'));
      });
    };

    $$('[data-acc]').forEach((group) => {
      const items = $$(':scope > .acc__item', group);
      items.forEach((item) => {
        setItem(item, item.classList.contains('is-open'));
        $('.acc__btn', item).addEventListener('click', () => {
          const willOpen = !item.classList.contains('is-open');
          if (group.dataset.acc === 'single') items.forEach((other) => { if (other !== item) setItem(other, false); });
          setItem(item, willOpen);
          syncHotspots();
        });
      });
    });

    hotspots.forEach((h) => {
      h.addEventListener('click', () => {
        const item = document.getElementById(`acc-${h.dataset.accTarget}`);
        if (!item) return;
        $$(':scope > .acc__item', item.parentElement).forEach((o) => setItem(o, o === item));
        syncHotspots();
        const r = item.getBoundingClientRect();
        const inView = r.top >= 80 && r.bottom <= window.innerHeight;
        if (!inView) setTimeout(() => item.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' }), 120);
      });
    });
    syncHotspots();
  }

  /* ---------- 9. ASISTENTE DE SELECCIÓN ---------- */
  const SIZE_LABEL = { chico: 'Chico (1 a 2 servicios)', medio: 'Mediano (3 a 5 servicios)', grande: 'Grande (6 o más servicios)' };
  const NEEDS = {
    tinaco: {
      label: 'Poca presión en regadera y llaves',
      check: ['Altura y capacidad de tu tinaco', 'Número de baños y llaves', 'Diámetro de tu tubería', 'Voltaje disponible (127 V)'],
      tiers: {
        chico: { title: 'Bomba presurizadora automática de 1/3 HP', why: 'Con 1 o 2 servicios y tinaco en azotea, una presurizadora compacta y silenciosa que se activa sola con el flujo de agua es lo más práctico. Tenemos la IGOTO de 1/3 HP en $1,310.', extra: true },
        medio: { title: 'Presurizadora de mayor capacidad o hidroneumático compacto', why: 'Con 3 a 5 servicios, una bomba de 1/3 HP puede quedarse corta. Revisamos tu caso para decidir entre una presurizadora más grande o un hidroneumático pequeño.' },
        grande: { title: 'Sistema hidroneumático con tanque precargado', why: 'Para 6 o más servicios conviene un tanque precargado con bomba dimensionada a tu consumo. Mantiene la presión estable aunque abras varias llaves a la vez.' },
      },
    },
    cisterna: {
      label: 'Subir agua de la cisterna al tinaco',
      check: ['Altura de la cisterna al tinaco', 'Distancia y recorrido de la tubería', 'Diámetro de tubería', 'Voltaje disponible'],
      tiers: {
        chico: { title: 'Bomba periférica de baja potencia', why: 'Para subir agua a un tinaco en una casa chica, una bomba periférica suele ser suficiente. Confirmamos la potencia según la altura y la distancia.' },
        medio: { title: 'Bomba periférica o centrífuga de ½ a 1 HP', why: 'En una casa familiar se usa normalmente una bomba de ½ a 1 HP, según la altura del tinaco y el largo de la tubería.' },
        grande: { title: 'Bomba centrífuga de mayor potencia', why: 'Para consumos altos o alturas mayores hace falta una bomba centrífuga o multietapa. Calculamos el caudal y la altura contigo.' },
      },
    },
    presion: {
      label: 'Presión constante en toda la casa',
      check: ['Número de niveles y de baños', 'Presión que buscas', 'Espacio para el tanque', 'Voltaje disponible'],
      tiers: {
        chico: { title: 'Mini hidroneumático con tanque precargado', why: 'Para un departamento o casa chica que busca presión pareja sin depender de la altura del tinaco.' },
        medio: { title: 'Hidroneumático con tanque y bomba', why: 'Un equipo completo con tanque precargado mantiene presión constante en regaderas, lavadora y cocina al mismo tiempo.' },
        grande: { title: 'Sistema hidroneumático de alta capacidad', why: 'Para casas grandes o negocios armamos un sistema con tanque y bomba dimensionados a tu demanda máxima.' },
      },
    },
    pozo: {
      label: 'Agua de pozo o achique',
      check: ['Profundidad del pozo o cárcamo', 'Diámetro disponible', 'Tipo de agua (limpia o con sedimento)', 'Voltaje disponible'],
      tiers: {
        chico: { title: 'Bomba sumergible de acero inoxidable', why: 'Para achique, cárcamos o pozos someros. Es hermética y trabaja dentro del agua.' },
        medio: { title: 'Bomba sumergible para pozo', why: 'Según la profundidad y el diámetro de tu pozo elegimos el modelo y la potencia para que el agua llegue con fuerza.' },
        grande: { title: 'Sistema de bombeo sumergible a medida', why: 'Para pozos profundos o uso intensivo definimos bomba, cable y protecciones en mostrador.' },
      },
    },
    alberca: {
      label: 'Alberca o fuente',
      check: ['Medidas y volumen de la alberca', 'Equipo que tienes actualmente', 'Tipo de filtro', 'Voltaje disponible'],
      tiers: {
        chico: { title: 'Motobomba de recirculación compacta', why: 'Para albercas chicas y fuentes, una motobomba pequeña mantiene el agua en movimiento. Pásanos las medidas.' },
        medio: { title: 'Motobomba de recirculación con filtro', why: 'Para albercas familiares combinamos motobomba y filtro para que el agua se mantenga limpia.' },
        grande: { title: 'Equipo de filtración de mayor capacidad', why: 'Las albercas grandes necesitan más caudal de recirculación y un filtro acorde al volumen.' },
      },
    },
    filtro: {
      label: 'Agua más limpia',
      check: ['Qué problema tiene tu agua (sarro, sedimento, sabor)', 'Consumo de tu casa o negocio', 'Espacio disponible', 'Tipo de toma de agua'],
      tiers: {
        chico: { title: 'Filtro de sedimentos para tu toma de agua', why: 'Una primera etapa de filtración protege tus llaves y electrodomésticos del sedimento.' },
        medio: { title: 'Filtro de tanque y suavizador', why: 'Para casas familiares, un tanque de filtración con suavizador ayuda a reducir el sarro.' },
        grande: { title: 'Sistema de filtración y suavizado de alta capacidad', why: 'Para negocios o consumos altos dimensionamos el tanque y la carga según tu volumen diario.' },
      },
    },
  };

  function initWizard() {
    const wiz = $('#wizard');
    if (!wiz) return;
    const steps = $$('.wizard__step', wiz);
    const result = $('#result', wiz);
    const state = { need: null, size: null };

    const goStep = (n) => {
      steps.forEach((s, i) => s.classList.toggle('is-on', i === n));
      result.classList.remove('is-on');
      wiz.style.setProperty('--prog', n === 0 ? '.34' : '.67');
    };

    const showResult = () => {
      const need = NEEDS[state.need];
      const tier = need.tiers[state.size];
      $('#resTitle').textContent = tier.title;
      $('#resWhy').textContent = tier.why;
      const list = $('#resList');
      list.innerHTML = '';
      need.check.forEach((txt) => {
        const li = document.createElement('li');
        li.innerHTML = '<i class="ph ph-check" aria-hidden="true"></i>';
        li.appendChild(document.createTextNode(txt));
        list.appendChild(li);
      });
      const msg = `Hola, usé el asistente de su página.\nNecesito: ${need.label}.\nTamaño: ${SIZE_LABEL[state.size]}.\nEquipo sugerido: ${tier.title}.\n¿Me ayudan a cotizar?`;
      $('#resWa').href = waUrl(msg);
      $('#resExtra').hidden = !tier.extra;
      steps.forEach((s) => s.classList.remove('is-on'));
      result.classList.add('is-on');
      wiz.style.setProperty('--prog', '1');
      const r = wiz.getBoundingClientRect();
      if (r.top < 60 || r.bottom > window.innerHeight) wiz.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    };

    $$('input[name="need"]', wiz).forEach((inp) => inp.addEventListener('change', () => {
      state.need = inp.value;
      setTimeout(() => goStep(1), reduceMotion ? 0 : 380);
    }));
    $$('input[name="size"]', wiz).forEach((inp) => inp.addEventListener('change', () => {
      state.size = inp.value;
      setTimeout(showResult, reduceMotion ? 0 : 380);
    }));
    $('[data-wizard-back]', wiz).addEventListener('click', () => goStep(0));
    $('[data-wizard-reset]', wiz).addEventListener('click', () => {
      $$('input[type="radio"]', wiz).forEach((i) => { i.checked = false; });
      state.need = state.size = null;
      goStep(0);
    });
  }

  /* ---------- 10. PROCESO Y VENTAJAS ---------- */
  function initFlow() {
    const flow = $('#flow');
    if (!flow) return;
    const steps = $$('.flow__step', flow);
    const active = new Set();
    let current = -1;

    const apply = () => {
      steps.forEach((s, i) => {
        s.classList.toggle('is-done', i < current);
        s.classList.toggle('is-now', i === current);
      });
      if (current < 0) { flow.style.setProperty('--fill', '0'); return; }
      const node = $('.flow__node', steps[current]);
      const y = steps[current].offsetTop + node.offsetHeight / 2 - 12;
      flow.style.setProperty('--fill', clamp(y / (flow.offsetHeight - 24), 0, 1).toFixed(3));
    };

    const stepIO = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        const i = steps.indexOf(e.target);
        e.isIntersecting ? active.add(i) : active.delete(i);
      });
      if (active.size) { current = Math.max(...active); apply(); }
    }, { rootMargin: '-45% 0px -45% 0px' });
    steps.forEach((s) => stepIO.observe(s));

    new IntersectionObserver(([e]) => {
      if (e.isIntersecting) return;
      if (e.boundingClientRect.top > 0) { current = -1; apply(); } // aún no llegamos
      else { current = steps.length - 1; apply(); } // ya pasamos
    }).observe(flow);
    window.addEventListener('resize', apply);
  }

  function initWhy() {
    const rows = $$('[data-why]');
    if (!rows.length) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => e.target.classList.toggle('is-focus', e.isIntersecting));
    }, { rootMargin: '-38% 0px -38% 0px' });
    rows.forEach((r) => io.observe(r));
  }

  /* ---------- 11. FORMULARIO A WHATSAPP ---------- */
  function initForm() {
    const form = $('#contactForm');
    if (!form) return;
    const btn = $('#formBtn');
    const ok = $('#formOk');
    const okLink = $('#formOkLink');

    const phoneDigits = (v) => {
      let d = v.replace(/\D/g, '');
      if (d.startsWith('52') && d.length > 10) d = d.slice(2);
      if (d.startsWith('1') && d.length === 11) d = d.slice(1);
      return d;
    };
    const rules = {
      nombre: (v) => v.trim().length >= 2,
      telefono: (v) => phoneDigits(v).length === 10,
      interes: (v) => v !== '',
    };
    const flag = (input, valid) => {
      const field = input.closest('.field');
      field.classList.toggle('has-error', !valid);
      input.setAttribute('aria-invalid', String(!valid));
    };

    Object.keys(rules).forEach((name) => {
      const input = form.elements[name];
      input.addEventListener('input', () => { if (input.closest('.field').classList.contains('has-error')) flag(input, rules[name](input.value)); });
      input.addEventListener('blur', () => { if (input.value) flag(input, rules[name](input.value)); });
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      let firstBad = null;
      Object.keys(rules).forEach((name) => {
        const input = form.elements[name];
        const valid = rules[name](input.value);
        flag(input, valid);
        if (!valid && !firstBad) firstBad = input;
      });
      if (firstBad) { firstBad.focus(); return; }

      const d = Object.fromEntries(new FormData(form).entries());
      const lines = [
        `Hola, soy ${d.nombre.trim()}.`,
        `Me interesa: ${d.interes}.`,
        d.mensaje && d.mensaje.trim() ? `Detalles: ${d.mensaje.trim()}` : null,
        `Mi teléfono: ${phoneDigits(d.telefono)}`,
        '(Mensaje enviado desde el sitio web)',
      ].filter(Boolean);
      const url = waUrl(lines.join('\n'));

      okLink.href = url;
      const label = $('span', btn);
      btn.classList.add('is-loading');
      label.textContent = 'Abriendo WhatsApp';
      const icon = $('i', btn);
      icon.className = 'ph ph-arrows-clockwise';

      const win = window.open(url, '_blank');
      if (win) win.opener = null;

      setTimeout(() => {
        btn.classList.remove('is-loading');
        label.textContent = 'Cotizar por WhatsApp';
        icon.className = 'ph-fill ph-whatsapp-logo';
        ok.classList.add('is-on');
      }, 900);
    });
  }

  /* ---------- 12. WHATSAPP FLOTANTE Y UTILIDADES ---------- */
  function initWaFloat() {
    const wrap = $('#waFloat');
    const tip = $('#waTip');
    if (!wrap) return;
    setTimeout(() => wrap.classList.add('is-shown'), 1200);

    let dismissed = false;
    try { dismissed = sessionStorage.getItem('wa-tip') === '1'; } catch (_) { /* sin acceso a storage */ }
    const hide = () => {
      tip.classList.remove('is-on');
      try { sessionStorage.setItem('wa-tip', '1'); } catch (_) { /* ignorar */ }
    };
    $('#waTipClose').addEventListener('click', hide);
    if (!dismissed) {
      setTimeout(() => tip.classList.add('is-on'), 6500);
      setTimeout(hide, 17000);
    }
  }

  function initYear() {
    const y = $('#year');
    if (y) y.textContent = String(new Date().getFullYear());
  }

  /* ---------- ARRANQUE ---------- */
  wireWhatsApp();
  initNav();
  initAccordions();
  initWizard();
  initForm();
  initYear();
  initPointerFx();

  Loader.run(() => {
    initReveal();
    initRotator();
    initFX();
    initFlow();
    initWhy();
    initWaFloat();
  });
})();
