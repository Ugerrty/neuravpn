/* NEURAVPN · UI: preloader, smooth scroll, scroll reveals, micro-interactions */
(function () {
  'use strict';

  var reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasGsap = typeof gsap !== 'undefined';
  if (hasGsap) gsap.registerPlugin(ScrollTrigger);

  /* ── preloader: fake-fill to 90%, snap to 100% on window load ── */
  var bar = document.getElementById('preloaderBar');
  var loaded = false;
  var progress = 0;

  function tickBar() {
    if (loaded) return;
    progress = Math.min(90, progress + Math.random() * 14);
    if (bar) bar.style.width = progress + '%';
    setTimeout(tickBar, 160);
  }
  tickBar();

  function finishLoad() {
    if (loaded) return;
    loaded = true;
    if (bar) bar.style.width = '100%';
    setTimeout(function () {
      document.body.classList.remove('is-loading');
      heroIntro();
      dispatchEvent(new CustomEvent('nv:intro'));   /* старт сминания картона */
    }, 350);
  }
  addEventListener('load', finishLoad);
  setTimeout(finishLoad, 6000); // never trap the user behind a stuck CDN

  /* ── smooth scroll (Lenis) ── */
  var lenis = null;
  if (typeof Lenis !== 'undefined' && !reduceMotion) {
    lenis = new Lenis({ duration: 1.15, smoothWheel: true });
    if (hasGsap) {
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
      gsap.ticker.lagSmoothing(0);
    } else {
      (function raf(time) { lenis.raf(time); requestAnimationFrame(raf); })(0);
    }
  }

  /* anchor links scroll through lenis */
  document.querySelectorAll('a[data-lenis]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var href = a.getAttribute('href');
      if (!href || href.charAt(0) !== '#') return;
      var target = href === '#top' ? document.body : document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      closeMenu();
      if (lenis) lenis.scrollTo(target === document.body ? 0 : target, { offset: -70 });
      else target.scrollIntoView({ behavior: 'smooth' });
    });
  });

  /* ── header state ── */
  var header = document.getElementById('header');
  function onScroll() {
    if (header) header.classList.toggle('is-solid', scrollY > 30);
  }
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ── mobile menu ── */
  var burger = document.getElementById('burger');
  var menu = document.getElementById('menu');
  function closeMenu() {
    if (!menu || !burger) return;
    menu.classList.remove('is-open');
    burger.classList.remove('is-open');
    burger.setAttribute('aria-expanded', 'false');
    menu.setAttribute('aria-hidden', 'true');
    if (lenis) lenis.start();
  }
  if (burger && menu) {
    burger.addEventListener('click', function () {
      var open = !menu.classList.contains('is-open');
      menu.classList.toggle('is-open', open);
      burger.classList.toggle('is-open', open);
      burger.setAttribute('aria-expanded', String(open));
      menu.setAttribute('aria-hidden', String(!open));
      if (lenis) open ? lenis.stop() : lenis.start();
    });
    menu.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', closeMenu);
    });
  }

  /* ── hero intro timeline ── */
  function heroIntro() {
    if (!hasGsap || reduceMotion) return;
    var tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    tl.from('[data-hero-line]', { yPercent: 110, duration: 1.05, stagger: .12 }, .1)
      .from('[data-hero]', { y: 30, autoAlpha: 0, duration: .9, stagger: .1 }, .35)
      .from('.hero__scroll', { autoAlpha: 0, y: 14, duration: .8 }, '-=.4');

    /* красный обвод «через Telegram» рисуется от руки после появления строк */
    var scribble = document.getElementById('scribblePath');
    if (scribble && scribble.getTotalLength) {
      var len = scribble.getTotalLength();
      gsap.set(scribble, { strokeDasharray: len, strokeDashoffset: len });
      tl.set('.hero__title .line', { overflow: 'visible' }, 1.05)
        .to(scribble, { strokeDashoffset: 0, duration: 1.1, ease: 'power2.inOut' }, 1.15);
    }
  }

  if (!hasGsap || reduceMotion) {
    /* graceful fallback: show everything, skip animations */
    document.body.classList.add('reveal-fallback');
    return;
  }

  /* ── scroll reveals ── */
  gsap.utils.toArray('[data-reveal]').forEach(function (el) {
    gsap.fromTo(el,
      { y: 44, autoAlpha: 0 },
      {
        y: 0, autoAlpha: 1, duration: 1, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 86%', once: true },
      });
  });

  /* ── counter (+15 дней) ── */
  document.querySelectorAll('[data-counter]').forEach(function (el) {
    var end = parseInt(el.getAttribute('data-counter'), 10) || 0;
    var obj = { v: 0 };
    gsap.to(obj, {
      v: end, duration: 1.6, ease: 'power2.out',
      scrollTrigger: { trigger: el, start: 'top 85%', once: true },
      onUpdate: function () { el.textContent = '+' + Math.round(obj.v); },
    });
  });

  /* ── steps progress rail: fills as you scroll the list ── */
  var rail = document.getElementById('stepsProgress');
  if (rail) {
    gsap.fromTo(rail, { scaleY: 0 }, {
      scaleY: 1, ease: 'none',
      scrollTrigger: {
        trigger: '.steps__list',
        start: 'top 70%',
        end: 'bottom 55%',
        scrub: .6,
      },
    });
  }

  /* ── scroll progress: красный маркер заполняется по мере чтения ── */
  var prog = document.getElementById('scrollProgress');
  if (prog) {
    gsap.to(prog, { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: .3 } });
  }

  /* ── бумажный самолётик летит по пунктиру, пока листаешь hero ── */
  if (typeof MotionPathPlugin !== 'undefined' && document.getElementById('paperPlane')) {
    gsap.registerPlugin(MotionPathPlugin);
    gsap.set('#paperPlane', { transformOrigin: '50% 50%' });
    gsap.to('#paperPlane', {
      motionPath: { path: '#flightPath', align: '#flightPath', alignOrigin: [.5, .5], autoRotate: true },
      ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom 25%', scrub: .6 },
    });
  }

  /* ── marquee: seamless loop (group duplicated in JS), пауза под курсором ── */
  var track = document.getElementById('marqueeTrack');
  if (track) {
    var group = track.querySelector('.marquee__group');
    for (var i = 0; i < 3; i++) track.appendChild(group.cloneNode(true));
    var marqueeTween = gsap.to(track, { xPercent: -25, duration: 22, ease: 'none', repeat: -1 });
    var marquee = track.parentElement;
    marquee.addEventListener('mouseenter', function () { gsap.to(marqueeTween, { timeScale: .12, duration: .5 }); });
    marquee.addEventListener('mouseleave', function () { gsap.to(marqueeTween, { timeScale: 1, duration: .5 }); });
  }

  /* ── app mockups: gentle float + scroll parallax ── */
  gsap.utils.toArray('[data-float]').forEach(function (el, i) {
    gsap.to(el, {
      y: i % 2 ? -14 : 14, duration: 2.6 + i * .5,
      ease: 'sine.inOut', yoyo: true, repeat: -1, delay: i * .4,
    });
    gsap.fromTo(el, { yPercent: i % 2 ? 6 : 10 }, {
      yPercent: i % 2 ? -6 : -10, ease: 'none',
      scrollTrigger: { trigger: '.app__stage', start: 'top bottom', end: 'bottom top', scrub: .8 },
    });
  });

  /* ── typing key in the phone mockup ── */
  var keyEl = document.getElementById('mockKey');
  if (keyEl) {
    var full = 'vless://8f3a…c1@•••:443';
    ScrollTrigger.create({
      trigger: keyEl, start: 'top 85%', once: true,
      onEnter: function () {
        var i = 0;
        keyEl.textContent = '';
        var iv = setInterval(function () {
          keyEl.textContent = full.slice(0, ++i);
          if (i >= full.length) clearInterval(iv);
        }, 45);
      },
    });
  }

  /* ── card tilt + cursor-tracking glow ── */
  var fine = matchMedia('(pointer: fine)').matches;
  if (fine) {
    document.querySelectorAll('[data-tilt]').forEach(function (card) {
      var qx = gsap.quickTo(card, 'rotationY', { duration: .5, ease: 'power2.out' });
      var qy = gsap.quickTo(card, 'rotationX', { duration: .5, ease: 'power2.out' });
      gsap.set(card, { transformPerspective: 900 });
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width;
        var py = (e.clientY - r.top) / r.height;
        qx((px - .5) * 8);
        qy((.5 - py) * 8);
        card.style.setProperty('--mx', (px * 100) + '%');
        card.style.setProperty('--my', (py * 100) + '%');
      });
      card.addEventListener('pointerleave', function () { qx(0); qy(0); });
    });

    /* magnetic buttons */
    document.querySelectorAll('[data-magnetic]').forEach(function (btn) {
      var qx = gsap.quickTo(btn, 'x', { duration: .4, ease: 'power3.out' });
      var qy = gsap.quickTo(btn, 'y', { duration: .4, ease: 'power3.out' });
      btn.addEventListener('pointermove', function (e) {
        var r = btn.getBoundingClientRect();
        qx((e.clientX - r.left - r.width / 2) * .25);
        qy((e.clientY - r.top - r.height / 2) * .35);
      });
      btn.addEventListener('pointerleave', function () { qx(0); qy(0); });
    });

    /* ── чернильный след за курсором: тонкая линия, тающая за полсекунды ── */
    var ink = document.createElement('canvas');
    ink.className = 'ink-canvas';
    document.body.appendChild(ink);
    var ictx = ink.getContext('2d');
    var trail = [];
    var LIFE = 550;
    function sizeInk() { ink.width = innerWidth; ink.height = innerHeight; }
    sizeInk();
    addEventListener('resize', sizeInk);
    addEventListener('pointermove', function (e) {
      trail.push({ x: e.clientX, y: e.clientY, t: performance.now() });
      if (trail.length > 40) trail.shift();
    }, { passive: true });
    (function drawInk() {
      requestAnimationFrame(drawInk);
      var now = performance.now();
      while (trail.length && now - trail[0].t > LIFE) trail.shift();
      ictx.clearRect(0, 0, ink.width, ink.height);
      ictx.lineCap = 'round';
      for (var i = 1; i < trail.length; i++) {
        var a = trail[i - 1], b = trail[i];
        var fade = 1 - (now - b.t) / LIFE;
        ictx.strokeStyle = 'rgba(75,47,29,' + (.3 * fade).toFixed(3) + ')';
        ictx.lineWidth = 2.4 * fade + .4;
        ictx.beginPath();
        ictx.moveTo(a.x, a.y);
        ictx.lineTo(b.x, b.y);
        ictx.stroke();
      }
    })();

    /* ── клякса по клику ── */
    document.addEventListener('pointerdown', function (e) {
      if (e.button > 0) return;
      for (var i = 0; i < 3; i++) {
        var s = document.createElement('i');
        s.className = i ? 'splat splat--drop' : 'splat';
        document.body.appendChild(s);
        var dx = i ? (Math.random() - .5) * 52 : 0;
        var dy = i ? (Math.random() - .5) * 52 : 0;
        gsap.fromTo(s,
          { x: e.clientX - 7, y: e.clientY - 7, scale: .4, opacity: .8 },
          {
            x: e.clientX - 7 + dx, y: e.clientY - 7 + dy,
            scale: i ? .9 : 1.7, opacity: 0,
            duration: .55, ease: 'power2.out',
            onComplete: (function (el) { return function () { el.remove(); }; })(s),
          });
      }
    });
  }

  /* ── footer year ── */
  var y = document.getElementById('year');
  if (y) y.textContent = String(new Date().getFullYear());
})();
