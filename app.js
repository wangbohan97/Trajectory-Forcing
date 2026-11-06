'use strict';

const scenes = {
  pigeon: "This close-up shot of a Victoria crowned pigeon showcases its striking blue plumage and red chest. Its crest is made of delicate, lacy feathers, while its eye is a striking red color. The bird's head is tilted slightly to the side, giving the impression of it looking regal and majestic. The background is blurred, drawing attention to the bird's striking appearance.",
  portrait: 'A close up portrait of a woman lit by the side, the camera pulls back.',
  japanese_anime: 'A Japanese animated film of a young woman standing on a ship and looking back at camera.'
};
const methods = [['SF','Self Forcing'],['CF','Causal Forcing'],['TraF','TraF']];
const grid = document.querySelector('#comparison-grid');
const toggle = document.querySelector('#play-toggle');
const seek = document.querySelector('#seek');
const status = document.querySelector('#playback-status');
const tabs = [...document.querySelectorAll('.scene-tabs [data-scene]')];
let videos = [];
let playing = false;
let frame = 0;
let generation = 0;
let operation = 0;
let loadingController = null;
const length = 30;

function updateTime(time) {
  const t = Math.max(0, Math.min(length, time));
  seek.value = t;
  seek.setAttribute('aria-valuetext', `${t.toFixed(1)} seconds`);
  seek.style.setProperty('--p', `${(t / length) * 100}%`);
  document.querySelector('#time').textContent = `0:${Math.floor(t).toString().padStart(2,'0')} / 0:30`;
}
function setToggle(state) {
  toggle.dataset.state = state;
  toggle.querySelector('.play-label').textContent = state === 'playing' ? 'Pause comparison' : 'Play comparison';
}
function pause() {
  playing = false;
  operation++;
  loadingController?.abort();
  loadingController = null;
  cancelAnimationFrame(frame);
  videos.forEach(video => video.pause());
  toggle.disabled = false;
  setToggle('paused');
}
function synchronize() {
  if (!playing) return;
  const time = videos[0].currentTime;
  if (time >= length - 0.04) {
    pause();
    videos.forEach(video => { video.currentTime = Math.min(length, video.duration || length); });
    updateTime(length);
    return;
  }
  for (const video of videos.slice(1)) {
    if (!video.seeking && Math.abs(video.currentTime - time) > 0.12) video.currentTime = time;
  }
  updateTime(time);
  frame = requestAnimationFrame(synchronize);
}
function ready(video, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Cancelled','AbortError')); return; }
    if (video.readyState >= 3) { resolve(); return; }
    const timer = setTimeout(() => finish(new Error('Video loading timed out')), 20000);
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener('canplay', onReady);
      video.removeEventListener('error', onError);
      signal.removeEventListener('abort', onAbort);
    };
    const finish = error => { cleanup(); error ? reject(error) : resolve(); };
    const onReady = () => finish();
    const onError = () => finish(new Error('Could not load video'));
    const onAbort = () => finish(new DOMException('Cancelled','AbortError'));
    video.addEventListener('canplay', onReady, {once:true});
    video.addEventListener('error', onError, {once:true});
    signal.addEventListener('abort', onAbort, {once:true});
    if (video.networkState === 0 || video.readyState === 0) video.load();
  });
}
async function play() {
  if (playing) { pause(); status.textContent = ''; return; }
  const currentGeneration = generation;
  const currentOperation = ++operation;
  loadingController?.abort();
  const controller = new AbortController();
  loadingController = controller;
  const currentVideos = [...videos];
  toggle.disabled = true;
  status.textContent = 'Loading the three videos…';
  try {
    await Promise.all(currentVideos.map(video => ready(video, controller.signal)));
    if (currentGeneration !== generation || currentOperation !== operation) return;
    const start = Number(seek.value) >= length - .05 ? 0 : Number(seek.value);
    currentVideos.forEach(video => { video.currentTime = start; });
    await Promise.all(currentVideos.map(video => video.play()));
    if (currentGeneration !== generation || currentOperation !== operation) {
      currentVideos.forEach(video => video.pause());
      return;
    }
    loadingController = null;
    playing = true;
    setToggle('playing');
    status.textContent = '';
    frame = requestAnimationFrame(synchronize);
  } catch (error) {
    currentVideos.forEach(video => video.pause());
    if (currentGeneration === generation && currentOperation === operation && error.name !== 'AbortError') {
      controller.abort();
      status.textContent = 'Playback could not start. Try again, or use the full-video links.';
    }
  } finally {
    if (currentGeneration === generation && currentOperation === operation) toggle.disabled = false;
  }
}
function selectScene(scene) {
  pause();
  generation++;
  videos.forEach(video => { video.removeAttribute('src'); video.load(); });
  grid.replaceChildren();
  videos = methods.map(([file, name]) => {
    const card = document.createElement('figure');
    card.className = `comparison-card${file === 'TraF' ? ' ours' : ''}`;
    const caption = document.createElement('figcaption');
    caption.className = 'card-caption';
    const label = document.createElement('span');
    label.className = 'method-name';
    label.textContent = name;
    if (file === 'TraF') {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = 'Ours';
      label.append(tag);
    }
    const video = document.createElement('video');
    video.src = `assets/videos/${file}_${scene}.mp4`;
    video.poster = `assets/posters/${file}_${scene}.webp`;
    video.preload = 'none';
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('aria-label', `${name}: ${scene.replaceAll('_',' ')}`);
    video.addEventListener('waiting', () => {
      if (!playing) return;
      pause();
      status.textContent = 'Playback paused while a video buffers. Press Play comparison to continue together.';
    });
    video.addEventListener('ended', () => { if (playing) { pause(); updateTime(length); } });
    const link = document.createElement('a');
    link.href = video.getAttribute('src');
    link.textContent = 'Full video';
    link.className = 'full-video';
    link.target = '_blank';
    link.rel = 'noopener';
    link.setAttribute('aria-label', `Open full ${name} ${scene.replaceAll('_',' ')} video`);
    caption.append(label, link);
    card.append(video, caption);
    grid.append(card);
    return video;
  });
  tabs.forEach(tab => {
    const active = tab.dataset.scene === scene;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  document.querySelector('#comparison').setAttribute('aria-labelledby', `tab-${scene}`);
  document.querySelector('#prompt-text').textContent = scenes[scene];
  status.textContent = '';
  updateTime(0);
}
tabs.forEach((tab,index) => {
  tab.addEventListener('click', () => selectScene(tab.dataset.scene));
  tab.addEventListener('keydown', event => {
    let target;
    if (event.key === 'ArrowRight') target = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') target = (index + tabs.length - 1) % tabs.length;
    if (event.key === 'Home') target = 0;
    if (event.key === 'End') target = tabs.length - 1;
    if (target === undefined) return;
    event.preventDefault();
    tabs[target].focus();
    selectScene(tabs[target].dataset.scene);
  });
});
toggle.addEventListener('click', play);
document.querySelector('#restart').addEventListener('click', () => {
  pause();
  videos.forEach(video => { if (video.readyState >= 1) video.currentTime = 0; });
  updateTime(0);
  status.textContent = '';
});
seek.addEventListener('input', () => {
  const time = Number(seek.value);
  pause();
  videos.forEach(video => { if (video.readyState >= 1) video.currentTime = time; });
  updateTime(time);
  status.textContent = '';
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});
document.querySelector('#copy-citation').addEventListener('click', async () => {
  const button = document.querySelector('#copy-citation');
  const text = document.querySelector('#bibtex').textContent;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'Copied';
    document.querySelector('#citation-status').textContent = 'Citation copied to clipboard.';
    setTimeout(() => { button.textContent = 'Copy'; }, 2000);
  } catch {
    const range = document.createRange();
    range.selectNodeContents(document.querySelector('#bibtex'));
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    button.textContent = 'Text selected';
    document.querySelector('#citation-status').textContent = 'Citation selected. Press Control C or Command C to copy.';
  }
});
selectScene('pigeon');

// Figure lightbox. Links keep pointing at the image file, so they still work without JavaScript.
const lightbox = document.querySelector('#lightbox');
if (lightbox && typeof lightbox.showModal === 'function') {
  const image = document.querySelector('#lightbox-img');
  const size = document.querySelector('#lightbox-size');
  const open = document.querySelector('#lightbox-open');
  let opener = null;
  const setActual = actual => {
    lightbox.classList.toggle('actual', actual);
    size.setAttribute('aria-pressed', String(actual));
    size.textContent = actual ? 'Fit to screen' : 'Actual size';
  };
  document.querySelectorAll('a[data-zoom]').forEach(link => {
    link.addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
      event.preventDefault();
      opener = link;
      const source = link.querySelector('img');
      image.src = link.getAttribute('href');
      image.alt = source ? source.alt : '';
      open.href = link.getAttribute('href');
      setActual(false);
      lightbox.showModal();
      document.querySelector('#lightbox-close').focus();
    });
  });
  size.addEventListener('click', () => setActual(!lightbox.classList.contains('actual')));
  image.addEventListener('click', () => setActual(!lightbox.classList.contains('actual')));
  document.querySelector('#lightbox-close').addEventListener('click', () => lightbox.close());
  lightbox.addEventListener('click', event => {
    if (event.target === lightbox || event.target.classList.contains('lightbox-stage')) lightbox.close();
  });
  lightbox.addEventListener('close', () => {
    setActual(false);
    opener?.focus();
  });
}

// Mark the section at the reading position beneath the fixed header. Recompute from
// all section positions so observer callback order cannot leave a stale active item.
const navLinks = [...document.querySelectorAll('.topnav a')];
if (navLinks.length) {
  const sections = navLinks.map(link => ({link, section: document.getElementById(link.getAttribute('href').slice(1))})).filter(item => item.section);
  const header = document.querySelector('.topbar');
  let navFrame = 0;
  const updateNavigation = () => {
    navFrame = 0;
    const readingLine = (header?.getBoundingClientRect().bottom || 0) + 24;
    let active = null;
    sections.forEach(item => { if (item.section.getBoundingClientRect().top <= readingLine) active = item.link; });
    if (Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight - 2) {
      const last = sections.at(-1);
      if (last && last.section.getBoundingClientRect().top < window.innerHeight) active = last.link;
    }
    navLinks.forEach(link => {
      link.classList.toggle('is-active', link === active);
      if (link === active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  };
  const queueNavigation = () => { if (!navFrame) navFrame = requestAnimationFrame(updateNavigation); };
  window.addEventListener('scroll', queueNavigation, {passive: true});
  window.addEventListener('resize', queueNavigation);
  window.addEventListener('load', queueNavigation);
  document.addEventListener('toggle', queueNavigation, true);
  updateNavigation();
}

// Idea figure (01 · Idea): denoising trajectories as context.
// Geometry and timeline of the 01 · Idea figure. frame(time) is pure: it maps one clock value to
// every animated attribute, so pausing the clock freezes the picture, and the static (no-JS) markup
// is generated from frame(END). Columns are chunks x1-x3; each runs from Gaussian noise (top) to its
// final output (bottom). Play: the shaded context first covers only the endpoints of x1 and x2, then
// their full trajectories; x3 starts from noise (no conditioning). Its context and arrow are complete
// before its first update is ringed, and stay attached to every update after that.
const TRAJ = (() => {
  const COLS = [132, 256, 396];
  const ROWS = [80, 130, 180, 230, 280];
  const DX = [-3, 3, 5, 2, -3];          // a gentle curve so each column reads as a path
  const STEP = 50;
  const LEFT = 98, RIGHT = 300, OWN_RIGHT = 438;   // shaded context: x1-x2 block, x3's own part
  const TOP = 58, BOTTOM = 330, STRIP = 258;
  const LABEL_Y = 315;
  const NOISE = 2400;                    // x3's Gaussian noise appears, sampled without conditioning
  const GROW = 1300;                     // endpoints only -> full trajectories
  const CONTEXT = 2700;                  // x3's noise joins the context and the arrow appears (done by 2950)
  // x3's denoising updates (schematic order, not a timestep schedule): from `t` the step is ringed,
  // with its context and arrow already complete; its new state appears at `made`.
  const CURSOR = [{t: 3000, r: 1, made: 3600}, {t: 4300, r: 2, made: 4800}];
  const END = 5300;
  const MOVE = 250;
  const POP = 260;
  const clamp = x => Math.min(1, Math.max(0, x));
  const ease = x => { x = clamp(x); return x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; };
  const fade = (t, start, duration) => ease((t - start) / duration);
  const lerp = (a, b, p) => a + (b - a) * p;
  const r1 = v => Math.round(v * 10) / 10;
  const r3 = v => Math.round(v * 1000) / 1000;
  const point = (c, r) => [COLS[c] + DX[r], ROWS[r]];

  function columnPath(c) {
    const p = ROWS.map((_, r) => point(c, r));
    let d = `M${p[0][0]} ${p[0][1]}`;
    for (let i = 0; i < p.length - 1; i++) {
      const p0 = p[Math.max(0, i - 1)], p1 = p[i], p2 = p[i + 1], p3 = p[Math.min(p.length - 1, i + 2)];
      d += `C${r1(p1[0] + (p2[0] - p0[0]) / 6)} ${r1(p1[1] + (p2[1] - p0[1]) / 6)} ` +
           `${r1(p2[0] - (p3[0] - p1[0]) / 6)} ${r1(p2[1] - (p3[1] - p1[1]) / 6)} ${p2[0]} ${p2[1]}`;
    }
    return d;
  }
  // Closed outline through axis-aligned corners, each corner rounded (convex or concave).
  function rounded(points, radius = 10) {
    let d = '';
    points.forEach((p, i) => {
      const prev = points[(i + points.length - 1) % points.length], next = points[(i + 1) % points.length];
      const towards = q => {
        const dist = Math.hypot(q[0] - p[0], q[1] - p[1]);
        const k = Math.min(radius, dist / 2) / dist;
        return `${r1(p[0] + (q[0] - p[0]) * k)} ${r1(p[1] + (q[1] - p[1]) * k)}`;
      };
      d += `${i ? 'L' : 'M'}${towards(prev)}Q${p[0]} ${p[1]} ${towards(next)}`;
    });
    return d + 'Z';
  }
  function cursorAt(t) {
    let index = -1;
    for (let i = 0; i < CURSOR.length; i++) if (CURSOR[i].t <= t) index = i;
    if (index < 0) return null;
    const key = CURSOR[index], prev = CURSOR[index - 1];
    let row = key.r;
    if (prev && t < key.t + MOVE) row = lerp(prev.r, key.r, ease((t - key.t) / MOVE));
    const lo = Math.floor(row), hi = Math.ceil(row);
    return {r: key.r, row, x: COLS[2] + lerp(DX[lo], DX[hi], row - lo), y: ROWS[0] + row * STEP};
  }
  const pop = p => ({opacity: r3(.35 + .65 * ease(p)), transform: `scale(${r3(.6 + .4 * ease(p))})`});
  const still = {opacity: 1, transform: 'scale(1)'};

  function frame(t) {
    const f = {};
    const cur = cursorAt(t);

    // Shaded context: the endpoints of x1-x2, then their full trajectories; before x3's first update
    // it also takes in x3's own earlier states (conceptual history). The ringed step stays outside.
    const top = r1(lerp(STRIP, TOP, ease((t - GROW) / 700)));
    let region;
    if (t >= CONTEXT) {
      const target = ROWS[0] + ((cur ? cur.row : 1) - .5) * STEP;
      const own = r1(lerp(TOP + 24, target, ease((t - CONTEXT) / MOVE)));
      region = rounded([[LEFT, top], [OWN_RIGHT, top], [OWN_RIGHT, own], [RIGHT, own], [RIGHT, BOTTOM], [LEFT, BOTTOM]]);
    } else region = rounded([[LEFT, top], [RIGHT, top], [RIGHT, BOTTOM], [LEFT, BOTTOM]]);
    f['tg-region'] = {a: {d: region}, s: {opacity: r3(fade(t, 200, 400))}};
    f['tg-lab-end'] = {s: {opacity: r3(fade(t, 300, 300) * (1 - fade(t, GROW, 200)))}};
    f['tg-lab-full'] = {s: {opacity: r3(fade(t, GROW + 200, 300) * (1 - fade(t, CONTEXT, 200)))}};
    f['tg-lab-ctx'] = {s: {opacity: r3(fade(t, CONTEXT + 50, 200))}};

    // One arrow from the context to the step being computed. It fades in whole (never half drawn)
    // and is fully visible before the first update is ringed; then it follows the ring.
    const tx = r1(cur ? cur.x - 10 : COLS[2] + DX[1] - 10), ty = r1(cur ? cur.y + 8 : ROWS[1] + 8);
    f['tg-arrow'] = {
      a: {d: `M${RIGHT + 2} ${LABEL_Y - 5}C${RIGHT + 40} ${LABEL_Y - 5} ${RIGHT + 68} ${r1(ty + 62)} ${tx} ${ty}`},
      s: {opacity: r3(fade(t, CONTEXT, MOVE))}
    };
    const ring = cur ? r3(fade(t, CURSOR[0].t, 200)) : 0;
    f['tg-ring'] = {a: {cx: r1(cur ? cur.x : COLS[2] + DX[1]), cy: r1(cur ? cur.y : ROWS[1])}, s: {opacity: ring}};
    f['tg-cur'] = {a: {x: r1((cur ? cur.x : COLS[2] + DX[1]) + 17), y: r1((cur ? cur.y : ROWS[1]) + 5)}, s: {opacity: ring}};

    // x3: Gaussian noise, its updated states, and the steps not yet taken.
    const drawn = ease((t - (CURSOR[0].made - 200)) / 200) + ease((t - (CURSOR[1].made - 200)) / 200);
    f['tg-path-3'] = {s: {strokeDashoffset: r3(1 - drawn / 4), opacity: drawn > 0 ? 1 : 0}};
    f['tg-node-3-0'] = t >= NOISE ? {c: 'tg-node is-noise', s: pop((t - NOISE) / POP)} : {c: 'tg-node is-slot', s: still};
    for (let r = 1; r < 5; r++) {
      const key = CURSOR.find(k => k.r === r);
      if (key && t >= key.made) f[`tg-node-3-${r}`] = {c: `tg-node ${cur.r === r ? 'is-current' : 'is-own'}`, s: pop((t - key.made) / POP)};
      else f[`tg-node-3-${r}`] = {c: 'tg-node is-slot', s: still};
    }
    return f;
  }
  return {frame, columnPath, point, COLS, ROWS, END, DEFAULT: END, LEFT, RIGHT, OWN_RIGHT, TOP, BOTTOM, LABEL_Y};
})();

// Player for the figure above: one requestAnimationFrame clock drives frame(time). Playback is
// finite and user-started; the static default (also without JS) is the final frame.
const trajectoryFigure = document.getElementById('trajectory');
if (trajectoryFigure && trajectoryFigure.classList.contains('trajv')) {
  const playButton = trajectoryFigure.querySelector('[data-trajectory-play]');
  const playLabel = playButton.querySelector('.trajv-play-label');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const elements = new Map();
  const byId = id => {
    if (!elements.has(id)) elements.set(id, document.getElementById(id));
    return elements.get(id);
  };
  let time = TRAJ.DEFAULT, playing = false, played = false, frameId = 0, last = 0;

  const render = () => {
    const values = TRAJ.frame(time);
    for (const id in values) {
      const node = byId(id);
      if (!node) continue;
      const {a, s, c} = values[id];
      if (a) for (const name in a) node.setAttribute(name, a[name]);
      if (s) for (const name in s) node.style[name] = String(s[name]);
      if (c) node.setAttribute('class', c);
    }
  };
  const setControls = () => {
    playButton.dataset.state = playing ? 'playing' : 'paused';
    playLabel.textContent = playing ? 'Pause' : !played ? 'Play' : time >= TRAJ.END ? 'Replay' : 'Resume';
  };
  const pause = () => {
    playing = false;
    cancelAnimationFrame(frameId);
    setControls();
  };
  const step = now => {
    time = Math.min(TRAJ.END, time + Math.min(now - last, 100));
    last = now;
    render();
    if (time >= TRAJ.END) { pause(); return; }
    frameId = requestAnimationFrame(step);
  };
  const play = () => {
    cancelAnimationFrame(frameId); // only one animation request at a time
    if (!played || time >= TRAJ.END) time = 0;
    played = true;
    playing = true;
    last = performance.now();
    render();
    setControls();
    frameId = requestAnimationFrame(step);
  };
  playButton.addEventListener('click', () => (playing ? pause() : play()));
  const applyMotionPreference = () => {
    playButton.hidden = reduceMotion.matches;
    if (reduceMotion.matches) {
      pause();
      time = TRAJ.DEFAULT;
      played = false;
      render();
      setControls();
    }
  };
  reduceMotion.addEventListener?.('change', applyMotionPreference);
  document.addEventListener('visibilitychange', () => { if (document.hidden && playing) pause(); });

  trajectoryFigure.classList.add('is-ready');
  render();
  setControls();
  applyMotionPreference();
}

// A single, user-started showcase reuses the qualitative clips.
(() => {
  const film = document.getElementById('hero-video');
  const control = document.getElementById('hero-play');
  if (!film || !control) return;
  const label = control.querySelector('.hero-play-label');
  const message = document.getElementById('hero-video-status');
  const sceneName = document.getElementById('hero-scene-name');
  const filmTime = document.getElementById('hero-time');
  const filmProgress = document.getElementById('hero-progress');
  const compareLink = document.getElementById('hero-compare');
  const choices = [...document.querySelectorAll('[data-hero-scene]')];
  const names = {pigeon: 'Victoria crowned pigeon', portrait: 'Portrait', japanese_anime: 'Animated film'};
  let selected = 'pigeon';
  let request = 0;
  const update = () => {
    const seconds = Math.min(30, film.currentTime || 0);
    if (filmTime) filmTime.textContent = `0:${Math.floor(seconds).toString().padStart(2, '0')} / 0:30`;
    if (filmProgress) filmProgress.style.width = `${seconds / 30 * 100}%`;
    const active = !film.paused && !film.ended;
    const replay = film.ended || film.currentTime >= 29.96;
    control.dataset.state = active ? 'playing' : 'paused';
    if (label) label.textContent = active ? 'Pause film' : replay ? 'Replay film' : 'Play film';
    control.setAttribute('aria-label', `${active ? 'Pause' : replay ? 'Replay' : 'Play'} ${names[selected]} generation`);
  };
  const stop = () => {
    request++;
    film.pause();
    control.disabled = false;
    update();
  };
  film.muted = true;
  film.playbackRate = 1;
  film.addEventListener('play', () => {
    pause();
    status.textContent = '';
    update();
  });
  film.addEventListener('pause', update);
  film.addEventListener('ended', update);
  film.addEventListener('timeupdate', () => {
    update();
    if (film.currentTime >= 30) {
      film.pause();
      if (film.currentTime > 30.1) film.currentTime = 30;
      update();
    }
  });
  control.addEventListener('click', async () => {
    if (!film.paused) { stop(); return; }
    const current = ++request;
    control.disabled = true;
    if (message) message.textContent = '';
    if (!film.getAttribute('src')) film.src = `assets/videos/TraF_${selected}.mp4`;
    if (film.ended || film.currentTime >= 29.96) film.currentTime = 0;
    let loadingTimer;
    try {
      await Promise.race([
        film.play(),
        new Promise((_, reject) => {
          loadingTimer = setTimeout(() => reject(new Error('Film loading timed out')), 20000);
        })
      ]);
      if (current !== request) return;
      update();
    } catch (error) {
      if (current === request) {
        film.pause();
        update();
        if (error.name !== 'AbortError' && message) message.textContent = 'The film could not start. Try Play again or explore the comparisons below.';
      }
    } finally {
      clearTimeout(loadingTimer);
      if (current === request) control.disabled = false;
    }
  });
  choices.forEach(button => button.addEventListener('click', () => {
    const next = button.dataset.heroScene;
    if (!names[next] || next === selected) return;
    stop();
    selected = next;
    film.poster = `assets/posters/TraF_${selected}.webp`;
    film.src = `assets/videos/TraF_${selected}.mp4`;
    film.setAttribute('aria-label', `${names[selected]}: a Trajectory Forcing video generation`);
    film.load();
    choices.forEach(choice => choice.setAttribute('aria-pressed', String(choice === button)));
    if (sceneName) sceneName.textContent = names[selected];
    if (message) message.textContent = '';
    update();
  }));
  if (compareLink) compareLink.addEventListener('click', () => {
    stop();
    selectScene(selected);
  });
  document.addEventListener('play', event => {
    if (event.target instanceof HTMLVideoElement && event.target.closest('#comparison-grid')) stop();
  }, true);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting) stop();
    }, {threshold: 0}).observe(film);
  }
  update();
})();
