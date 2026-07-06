/* NEURAVPN · hero scene: лист крафт-картона влетает в кадр и сминается
   в комок — морф вершин plane→«мятая сфера» с волной сминания и
   вспучиванием в середине анимации. После сминания геометрия замирает:
   в кадре остаются только transform-анимации (вращение, параллакс) —
   ноль вершинной работы, чтобы не лагало на Intel HD 4000.
   Материал — MeshMatcapMaterial (карта картона × мягкий matcap):
   без света и PMREM (PBR-шейдеры компилируются 30+ секунд на старых
   встроенных GPU), flat shading считает нормали в фрагментном шейдере,
   так что computeVertexNormals не нужен вовсе. */
import * as THREE from 'three';

const canvas = document.getElementById('scene');
if (canvas) init(canvas);

function init(canvas) {
  const DPR = Math.min(window.devicePixelRatio || 1, 1.25);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({
    canvas, alpha: true, antialias: true, powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(DPR);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, .1, 60);
  camera.position.set(0, 0, 9);

  /* ── текстура картона: крафт-база, волокна, заломы, пятна ── */
  function makeCardboard() {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d');

    const base = g.createLinearGradient(0, 0, 512, 512);
    base.addColorStop(0, '#c9a273');
    base.addColorStop(.5, '#bd9563');
    base.addColorStop(1, '#b18a58');
    g.fillStyle = base;
    g.fillRect(0, 0, 512, 512);

    /* машинное направление бумаги: едва заметные горизонтальные полосы */
    for (let y = 0; y < 512; y += 3) {
      g.fillStyle = `rgba(${Math.random() > .5 ? '255,240,210' : '90,60,30'},${Math.random() * .045})`;
      g.fillRect(0, y, 512, 1.5);
    }

    /* волокна */
    for (let i = 0; i < 1400; i++) {
      const x = Math.random() * 512, y = Math.random() * 512;
      const len = 4 + Math.random() * 12;
      const ang = (Math.random() - .5) * .7;
      g.strokeStyle = Math.random() > .5
        ? `rgba(226,199,155,${.04 + Math.random() * .09})`
        : `rgba(122,88,52,${.04 + Math.random() * .08})`;
      g.lineWidth = .8 + Math.random();
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      g.stroke();
    }

    /* крапинки переработанной массы */
    for (let i = 0; i < 420; i++) {
      g.fillStyle = `rgba(70,45,22,${.08 + Math.random() * .14})`;
      g.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }

    /* разводы */
    for (let i = 0; i < 5; i++) {
      const x = Math.random() * 512, y = Math.random() * 512, r = 60 + Math.random() * 120;
      const st = g.createRadialGradient(x, y, r * .2, x, y, r);
      st.addColorStop(0, 'rgba(140,100,55,.07)');
      st.addColorStop(1, 'rgba(140,100,55,0)');
      g.fillStyle = st;
      g.fillRect(0, 0, 512, 512);
    }

    /* заломы: тёмная линия сгиба + светлый блик рядом */
    for (let i = 0; i < 15; i++) {
      let x = Math.random() * 512, y = Math.random() * 512;
      let ang = Math.random() * Math.PI * 2;
      g.beginPath();
      g.moveTo(x, y);
      const pts = [[x, y]];
      for (let s = 0; s < 3 + Math.random() * 3; s++) {
        ang += (Math.random() - .5) * 1.1;
        x += Math.cos(ang) * (40 + Math.random() * 70);
        y += Math.sin(ang) * (40 + Math.random() * 70);
        g.lineTo(x, y);
        pts.push([x, y]);
      }
      g.strokeStyle = `rgba(88,58,28,${.22 + Math.random() * .18})`;
      g.lineWidth = 1.6 + Math.random();
      g.stroke();
      g.beginPath();
      g.moveTo(pts[0][0] + 2, pts[0][1] + 2);
      for (let p = 1; p < pts.length; p++) g.lineTo(pts[p][0] + 2, pts[p][1] + 2);
      g.strokeStyle = `rgba(235,210,165,${.18 + Math.random() * .14})`;
      g.lineWidth = 1.2;
      g.stroke();
    }

    /* лёгкая виньетка */
    const vg = g.createRadialGradient(256, 256, 190, 256, 256, 380);
    vg.addColorStop(0, 'rgba(60,38,18,0)');
    vg.addColorStop(1, 'rgba(60,38,18,.16)');
    g.fillStyle = vg;
    g.fillRect(0, 0, 512, 512);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /* ── мягкий нейтральный matcap: свет сверху-слева, тень и тёмный край ── */
  function makeSoftMatcap() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(40, 0, 220, 256);
    grad.addColorStop(0, '#fffdf6');
    grad.addColorStop(.55, '#cfc2ac');
    grad.addColorStop(1, '#5f4c36');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    const hl = g.createRadialGradient(86, 70, 6, 86, 70, 120);
    hl.addColorStop(0, 'rgba(255,253,244,.85)');
    hl.addColorStop(1, 'rgba(255,253,244,0)');
    g.fillStyle = hl;
    g.fillRect(0, 0, 256, 256);
    const rim = g.createRadialGradient(128, 128, 86, 128, 128, 128);
    rim.addColorStop(0, 'rgba(58,36,19,0)');
    rim.addColorStop(1, 'rgba(58,36,19,.55)');
    g.fillStyle = rim;
    g.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /* ── crayon dot sprite для узлов сети ── */
  function makeDot(color) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = color;
    g.beginPath();
    for (let a = 0; a <= Math.PI * 2 + .01; a += Math.PI / 14) {
      const r = 22 + Math.sin(a * 5.3) * 3 + Math.cos(a * 3.1) * 2.5;
      const x = 32 + Math.cos(a) * r, y = 32 + Math.sin(a) * r;
      a === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.closePath();
    g.fill();
    return new THREE.CanvasTexture(c);
  }

  const softCap = makeSoftMatcap();

  const world = new THREE.Group();
  scene.add(world);
  const core = new THREE.Group();
  world.add(core);

  /* ── лист картона → мятый шар ── */
  const SHEET_W = 5.4, SHEET_H = 3.8, R = 1.5;
  const sheetGeo = new THREE.PlaneGeometry(SHEET_W, SHEET_H, 26, 18);
  const posAttr = sheetGeo.getAttribute('position');
  const count = posAttr.count;
  const flat = posAttr.array.slice();

  /* складки: детерминированный псевдошум из синусов */
  function crumpleNoise(x, y, z) {
    return Math.sin(x * 3.1 + 1.7) * Math.sin(y * 3.7 + 4.2) * .55
         + Math.sin(y * 5.3 + 2.1) * Math.sin(z * 4.6 + .8) * .3
         + Math.sin(z * 9.2 + 5.5) * Math.sin(x * 8.4 + 3.3) * .15;
  }
  function hash(i) { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

  /* целевые позиции: лист «обёрнут» вокруг сферы с шумом складок */
  const target = new Float32Array(flat.length);
  const dirs = new Float32Array(flat.length);
  const delay = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const u = flat[i3] / SHEET_W + .5;
    const v = flat[i3 + 1] / SHEET_H + .5;
    const th = u * Math.PI * 2;
    const ph = v * Math.PI;
    const dx = Math.sin(ph) * Math.cos(th);
    const dy = Math.cos(ph);
    const dz = Math.sin(ph) * Math.sin(th);
    const r = R * (1 + .17 * crumpleNoise(dx * 2, dy * 2, dz * 2)) + (hash(i) - .5) * .06;
    dirs[i3] = dx; dirs[i3 + 1] = dy; dirs[i3 + 2] = dz;
    target[i3] = dx * r; target[i3 + 1] = dy * r; target[i3 + 2] = dz * r;
    /* волна сминания идёт от дальнего угла листа + случайный джиттер */
    delay[i] = (u * .55 + v * .45) * .38 + hash(i + 999) * .1;
  }

  const sheet = new THREE.Mesh(sheetGeo, new THREE.MeshMatcapMaterial({
    matcap: softCap, map: makeCardboard(), flatShading: true, side: THREE.DoubleSide,
  }));
  core.add(sheet);

  /* ── орбитальное кольцо и картонные спутники (появляются после сминания) ── */
  const ringMat = new THREE.MeshMatcapMaterial({ matcap: softCap, color: 0x8a6a4f, transparent: true, opacity: 0 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.45, .018, 8, 96), ringMat);
  ring.rotation.x = Math.PI / 2.25;
  ring.rotation.y = .35;
  core.add(ring);

  const satMat = new THREE.MeshMatcapMaterial({ matcap: softCap, color: 0xa33222, flatShading: true, transparent: true, opacity: 0 });
  const sats = [];
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(new THREE.TetrahedronGeometry(.13, 0), satMat);
    s.userData.phase = (i / 3) * Math.PI * 2;
    core.add(s);
    sats.push(s);
  }

  /* ── сеть-набросок вокруг (статичная геометрия) ── */
  const shell = new THREE.Group();
  world.add(shell);

  const N = 110, SR = 3.1;
  const pts = new Float32Array(N * 3);
  const vecs = [];
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const rr = Math.sqrt(1 - y * y);
    const th = i * 2.39996;
    const v = new THREE.Vector3(Math.cos(th) * rr, y, Math.sin(th) * rr)
      .multiplyScalar(SR * (0.92 + hash(i * 7) * 0.18));
    vecs.push(v);
    pts.set([v.x, v.y, v.z], i * 3);
  }
  const ptsGeo = new THREE.BufferGeometry();
  ptsGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  const pointsMat = new THREE.PointsMaterial({
    size: .13, map: makeDot('rgba(75,47,29,1)'), color: 0xffffff,
    transparent: true, opacity: 0, depthWrite: false, alphaTest: .1, sizeAttenuation: true,
  });
  shell.add(new THREE.Points(ptsGeo, pointsMat));

  const linePos = [];
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      if (vecs[i].distanceTo(vecs[j]) < 1.15) {
        linePos.push(vecs[i].x, vecs[i].y, vecs[i].z, vecs[j].x, vecs[j].y, vecs[j].z);
      }
    }
  }
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
  const linesMat = new THREE.LineBasicMaterial({ color: 0x6b4a30, transparent: true, opacity: 0, depthWrite: false });
  shell.add(new THREE.LineSegments(lineGeo, linesMat));

  const accGeo = new THREE.BufferGeometry();
  const accPos = new Float32Array(8 * 3);
  for (let i = 0; i < 8; i++) {
    const v = vecs[Math.floor((i + .5) * N / 8)];
    accPos.set([v.x, v.y, v.z], i * 3);
  }
  accGeo.setAttribute('position', new THREE.BufferAttribute(accPos, 3));
  const accMat = new THREE.PointsMaterial({
    size: .3, map: makeDot('rgba(163,35,24,1)'), color: 0xffffff,
    transparent: true, opacity: 0, depthWrite: false, alphaTest: .1, sizeAttenuation: true,
  });
  shell.add(new THREE.Points(accGeo, accMat));

  /* ── layout ── */
  function layout() {
    const w = canvas.clientWidth || innerWidth;
    const h = canvas.clientHeight || innerHeight;
    if (w < 2 || h < 2) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (w > 1020) {
      world.position.set(2.6, 0, 0);
      world.scale.setScalar(1);
    } else {
      world.position.set(0, 1.15, 0);
      world.scale.setScalar(.62);
    }
  }
  layout();
  addEventListener('resize', layout);

  /* ── взаимодействие ── */
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  addEventListener('pointermove', (e) => {
    mouse.tx = (e.clientX / innerWidth) * 2 - 1;
    mouse.ty = (e.clientY / innerHeight) * 2 - 1;
  }, { passive: true });

  let scrollT = 0;
  addEventListener('scroll', () => {
    const h = canvas.parentElement.offsetHeight || innerHeight;
    scrollT = Math.min(1, Math.max(0, scrollY / h));
  }, { passive: true });

  let inView = true;
  new IntersectionObserver(([e]) => { inView = e.isIntersecting; }, { threshold: 0 })
    .observe(canvas);

  /* ── таймлайн сминания ──
     фазы: 0 — лист ждёт за прелоадером; 1 — падение + сминание + отскок;
     2 — готово, вершины заморожены. */
  const DROP = .7, CRUMPLE_AT = .55, CRUMPLE = 1.9, BOUNCE_AT = 2.5, DONE = 3.3;
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const outCubic = (x) => 1 - Math.pow(1 - x, 3);
  const smooth = (x) => x * x * (3 - 2 * x);

  let phase = 0;
  let started = false;
  let animK = 0;      /* время анимации копится только в отрисованных кадрах:
                         скрытая вкладка не «проматывает» сминание */
  let prevT = 0;
  const clock = new THREE.Clock();

  function applyCrumple(c, time) {
    const a = posAttr.array;
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const e = smooth(clamp01((c * 1.48 - delay[i]) / 1));
      /* вспучивание в середине сминания */
      const buckle = Math.sin(e * Math.PI) * .32 *
        crumpleNoise(dirs[i3] * 1.7 + time, dirs[i3 + 1] * 1.9, dirs[i3 + 2] * 1.6);
      a[i3]     = flat[i3]     + (target[i3]     - flat[i3])     * e + dirs[i3]     * buckle;
      a[i3 + 1] = flat[i3 + 1] + (target[i3 + 1] - flat[i3 + 1]) * e + dirs[i3 + 1] * buckle;
      a[i3 + 2] = flat[i3 + 2] + (target[i3 + 2] - flat[i3 + 2]) * e + dirs[i3 + 2] * buckle;
    }
    posAttr.needsUpdate = true;
  }

  function finishInstantly() {
    applyCrumple(1, 0);
    ringMat.opacity = 1;
    satMat.opacity = 1;
    pointsMat.opacity = .55;
    linesMat.opacity = .3;
    accMat.opacity = .9;
    core.position.y = 0;
    core.rotation.x = 0;
    core.rotation.z = 0;
    phase = 2;
  }

  function startIntro() {
    if (started) return;
    started = true;
    if (reduceMotion) { finishInstantly(); return; }
    phase = 1;
  }
  addEventListener('nv:intro', startIntro);
  setTimeout(startIntro, 8000);            /* страховка, если событие не пришло */

  /* стартовая поза листа */
  core.position.y = 3.4;
  core.rotation.x = -1.05;
  core.rotation.z = .35;

  let spinBoost = 0;

  renderer.setAnimationLoop(() => {
    if (!inView || document.hidden) return;
    const t = clock.getElapsedTime();
    const dt = Math.min(t - prevT, .066);   /* пауза не проматывает время */
    prevT = t;

    mouse.x += (mouse.tx - mouse.x) * .045;
    mouse.y += (mouse.ty - mouse.y) * .045;

    if (phase === 1) {
      animK += dt;
      const k = animK;

      /* падение листа */
      const drop = outCubic(clamp01(k / DROP));
      core.position.y = (1 - drop) * 3.4;
      core.rotation.x = -1.05 * (1 - drop) + mouse.y * .22 * drop;
      core.rotation.z = .35 * (1 - drop);

      /* сминание */
      const c = clamp01((k - CRUMPLE_AT) / CRUMPLE);
      applyCrumple(c, t);
      spinBoost = outCubic(c) * 2.4;

      /* сеть и орбита проявляются к концу */
      const o = clamp01((k - 2.15) / .8);
      ringMat.opacity = o;
      satMat.opacity = o;
      pointsMat.opacity = .55 * o;
      linesMat.opacity = .3 * o;
      accMat.opacity = .9 * o;

      /* упругий отскок комка */
      if (k > BOUNCE_AT) {
        const b = k - BOUNCE_AT;
        const s = 1 + .06 * Math.exp(-b * 3.2) * Math.sin(b * 13);
        core.scale.setScalar(s);
      }

      if (k >= DONE) {
        applyCrumple(1, 0);               /* финальная запись без вспучивания */
        core.scale.setScalar(1);
        phase = 2;                        /* дальше вершины не трогаем */
      }
    }

    core.rotation.y = t * .18 + mouse.x * .35 + scrollT * 1.6 + spinBoost;
    if (phase === 2) {
      core.rotation.x = Math.sin(t * .12) * .1 + mouse.y * .22;
    }

    for (const s of sats) {
      const a = t * .45 + s.userData.phase;
      s.position.set(Math.cos(a) * 2.45, Math.sin(a) * 2.45 * Math.sin(.45), Math.sin(a) * 2.45 * Math.cos(.45));
      s.position.applyEuler(ring.rotation);
      s.rotation.y = t;
    }

    shell.rotation.y = -t * .05 + mouse.x * .12;
    shell.rotation.x = mouse.y * .08;

    world.rotation.z = scrollT * -.18;
    camera.position.z = 9 + scrollT * 1.4;

    /* self-heal после вырожденного ресайза панели */
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (cw > 1 && ch > 1 &&
        (canvas.width !== Math.round(cw * DPR) || canvas.height !== Math.round(ch * DPR))) {
      layout();
    }

    renderer.render(scene, camera);
  });
}
