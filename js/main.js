// Scroll reveals
const revealItems = document.querySelectorAll('[data-reveal]');

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.15, rootMargin: '0px 0px -8% 0px' }
  );
  revealItems.forEach((el) => observer.observe(el));
} else {
  revealItems.forEach((el) => el.classList.add('is-visible'));
}

// Marquees (skills line and project strips). Two identical groups loop seamlessly.
// data-speed is px per second on a 1920px-wide screen and scales with the layout.
// Project strips can also be moved by hand: drag, swipe, or scroll sideways on a trackpad.
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const RESUME_DELAY = 2500; // ms of stillness after a manual move before auto-scroll comes back

const marquees = [...document.querySelectorAll('.marquee')].map((el) => {
  const track = el.querySelector('.marquee__track');
  return {
    el,
    track,
    group: track.querySelector('.marquee__group'),
    speed: Number(el.dataset.speed) || 90,
    manual: el.classList.contains('marquee--strip'),
    x: 0,
    width: 0,
    velocity: 0,
    autoFactor: 1,
    holdUntil: 0,
    dragging: false,
    visible: true,
  };
});

function measure() {
  const scale = Math.min(window.innerWidth, 1920) / 1920;
  marquees.forEach((m) => {
    m.width = m.group.offsetWidth;
    m.pxPerSecond = m.speed * scale;
  });
}

measure();
document.fonts?.ready.then(measure);
window.addEventListener('resize', measure);
window.addEventListener('load', measure);

if ('IntersectionObserver' in window) {
  const visibility = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const m = marquees.find((item) => item.el === entry.target);
      if (m) m.visible = entry.isIntersecting;
    });
  });
  marquees.forEach((m) => visibility.observe(m.el));
}

let lastFrame = performance.now();

function tick(now) {
  const dt = Math.min((now - lastFrame) / 1000, 0.1);
  lastFrame = now;

  marquees.forEach((m) => {
    if (!m.visible || !m.width) return;
    const wantsAuto = !reduceMotion.matches && !m.dragging && now >= m.holdUntil;
    // ease auto-scroll in and out instead of jumping
    m.autoFactor += ((wantsAuto ? 1 : 0) - m.autoFactor) * (1 - Math.pow(0.05, dt));
    m.x += (m.pxPerSecond * m.autoFactor + m.velocity) * dt;
    // momentum after a fling fades out in about a second
    m.velocity *= Math.pow(0.04, dt);
    if (Math.abs(m.velocity) < 2) m.velocity = 0;
    m.x = ((m.x % m.width) + m.width) % m.width;
    m.track.style.transform = `translate3d(${-m.x}px, 0, 0)`;
  });

  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);

marquees.filter((m) => m.manual).forEach((m) => {
  const hold = () => {
    m.holdUntil = performance.now() + RESUME_DELAY;
  };

  // Trackpad sideways swipe or Shift + mouse wheel; plain vertical scrolling still scrolls the page
  m.el.addEventListener(
    'wheel',
    (e) => {
      const sideways = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      const dx = sideways ? e.deltaX : e.shiftKey ? e.deltaY : 0;
      if (!dx) return;
      e.preventDefault();
      m.x += dx;
      m.velocity = 0;
      hold();
    },
    { passive: false }
  );

  // Mouse drag and touch swipe. On touch, a mostly vertical gesture is left to the page scroll.
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastT = 0;
  let axis = null;

  const startDrag = () => {
    m.dragging = true;
    m.velocity = 0;
    m.el.setPointerCapture(pointerId);
    m.el.classList.add('is-dragging');
  };

  m.el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    pointerId = e.pointerId;
    startX = lastX = e.clientX;
    startY = e.clientY;
    lastT = e.timeStamp;
    axis = e.pointerType === 'mouse' ? 'x' : null;
    if (axis === 'x') startDrag();
  });

  m.el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pointerId) return;
    if (!axis) {
      const dx = Math.abs(e.clientX - startX);
      const dy = Math.abs(e.clientY - startY);
      if (dx < 6 && dy < 6) return;
      axis = dx > dy ? 'x' : 'y';
      if (axis === 'x') startDrag();
    }
    if (axis !== 'x') return;
    const step = e.clientX - lastX;
    const elapsed = e.timeStamp - lastT;
    m.x -= step;
    if (elapsed > 0) m.velocity = (-step / elapsed) * 1000;
    lastX = e.clientX;
    lastT = e.timeStamp;
  });

  const endDrag = (e) => {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    if (!m.dragging) return;
    m.dragging = false;
    m.el.classList.remove('is-dragging');
    // no fling if the pointer stopped before release
    if (e.timeStamp - lastT > 80) m.velocity = 0;
    hold();
  };

  m.el.addEventListener('pointerup', endDrag);
  m.el.addEventListener('pointercancel', endDrag);
  m.el.addEventListener('dragstart', (e) => e.preventDefault());
});

// Email links: also copy the address and say so, since some viewers block mailto: links
const toast = document.createElement('div');
toast.className = 'toast';
toast.setAttribute('role', 'status');
document.body.append(toast);
let toastTimer;

function showToast(text) {
  toast.textContent = text;
  toast.classList.add('is-shown');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-shown'), 2600);
}

document.querySelectorAll('a[href^="mailto:"]').forEach((link) => {
  link.addEventListener('click', () => {
    const email = link.getAttribute('href').slice('mailto:'.length);
    const copied = navigator.clipboard?.writeText(email);
    if (!copied) {
      showToast(email);
      return;
    }
    copied.then(() => showToast(`Email copied: ${email}`), () => showToast(email));
  });
});

// Motion sliders: switch slides with the side arrows, keyboard arrows or a swipe; wraps around at the ends.
// Only the current slide's video plays, and only while the slider is on screen. A tap pauses or resumes it.
document.querySelectorAll('[data-slider]').forEach((slider) => {
  const track = slider.querySelector('.slider__track');
  const slides = [...track.children];
  const videos = slides.map((slide) => slide.querySelector('video'));
  let index = 0;
  let onScreen = false;
  let nearScreen = false;
  let pausedByUser = false;
  let playedByUser = false; // with reduced motion, videos start only on a tap

  // Start downloading a video in full ahead of time
  function warm(video) {
    if (!video || video.dataset.warm) return;
    video.dataset.warm = 'true';
    video.preload = 'auto';
    if (video.readyState < 2) video.load();
  }

  function sync() {
    // the current slide loads before the slider scrolls into view, the next one while the current plays
    if (nearScreen || onScreen) {
      warm(videos[index]);
      warm(videos[(index + 1) % videos.length]);
    }
    videos.forEach((video, i) => {
      if (!video) return;
      const shouldPlay = i === index && onScreen && !pausedByUser && (!reduceMotion.matches || playedByUser);
      if (shouldPlay) video.play().catch(() => {});
      else video.pause();
    });
  }

  function go(to) {
    index = (to + slides.length) % slides.length;
    track.style.transform = `translateX(${-index * 100}%)`;
    slides.forEach((slide, i) => slide.setAttribute('aria-hidden', String(i !== index)));
    pausedByUser = false;
    const video = videos[index];
    if (video && video.readyState > 0) video.currentTime = 0;
    sync();
  }

  slider.querySelector('.slider__arrow--prev').addEventListener('click', () => go(index - 1));
  slider.querySelector('.slider__arrow--next').addEventListener('click', () => go(index + 1));

  slider.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') go(index - 1);
    if (e.key === 'ArrowRight') go(index + 1);
  });

  let startX = null;
  let swiped = false;
  track.addEventListener('pointerdown', (e) => {
    startX = e.clientX;
    swiped = false;
  });
  track.addEventListener('pointerup', (e) => {
    if (startX === null) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 40) {
      swiped = true;
      go(index + (dx < 0 ? 1 : -1));
    }
    startX = null;
  });
  track.addEventListener('click', () => {
    if (swiped || !videos[index]) return;
    if (videos[index].paused) {
      pausedByUser = false;
      playedByUser = true;
    } else {
      pausedByUser = true;
    }
    sync();
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      onScreen = entries[0].isIntersecting;
      sync();
    }, { threshold: 0.25 }).observe(slider);
    // about one screen of scrolling before the slider appears
    new IntersectionObserver((entries) => {
      nearScreen = entries[0].isIntersecting;
      sync();
    }, { rootMargin: '100% 0px' }).observe(slider);
  } else {
    onScreen = true;
  }

  go(0);
});
