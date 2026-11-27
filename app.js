const scenes = {
  kitchen: {
    model: 'LTX-2.5',
    title: 'The red kettle returns.',
    description: 'Follow the camera through the kitchen and look for the kettle as the view changes.',
  },
  campus: {
    model: 'MiniMax-H3',
    title: 'Following a person across campus.',
    description: 'Compare how the camera tracks the walker while the setting carries over between segments.',
  },
  beach: {
    model: 'LTX-2.5',
    title: 'Returning to the yellow surfboard.',
    description: 'The surfboard gives the rollout a recognizable landmark as the camera moves along the coast.',
  },
  garage: {
    model: 'MiniMax-H3',
    title: 'Revisiting a parking garage.',
    description: 'Use the columns and the red car to track viewpoint and scene identity across the rollout.',
  },
};

const timingExamples = {
  canyon: 'Canyon example: early guidance turns the view toward the river, while late guidance retains more of the opening composition.',
  cathedral: 'Cathedral example: early guidance pans toward the side windows, while late guidance retains more of the forward-facing nave.',
};

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const mediaUrl = (kind, scene, variant) =>
  kind === 'videos' ? `assets/videos/${scene}-${variant}.mp4?v=2` : `assets/images/${scene}-${variant}.webp?v=2`;

const comparisonModes = {
  reference: { variants: ['reference', 'harness'], labels: ['Reference', 'Generation'] },
  baseline: { variants: ['baseline', 'harness'], labels: ['Baseline', 'WorldRehearsal'] },
  timing: { variants: ['early', 'late'], labels: ['Early [1,6]', 'Late [6,11]'] },
  template: { variants: ['none', 'gray'], labels: ['No reference', 'Gray + structure'] },
  construction: { variants: ['vggt', 'gsv'], labels: ['VGGT', 'GSV (Ours)'] },
};

function formatTime(seconds) {
  const whole = Math.floor(seconds || 0);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

class VideoComparison {
  constructor(element) {
    this.element = element;
    this.isHero = element.dataset.player === 'hero';
    element.replaceChildren(document.querySelector('#compare-template').content.cloneNode(true));
    this.stage = element.querySelector('.compare-stage');
    this.left = element.querySelector('.video-left');
    this.right = element.querySelector('.video-right');
    this.wipe = element.querySelector('.wipe-range');
    this.seek = element.querySelector('.seek-range');
    this.time = element.querySelector('.time-display');
    this.playButton = element.querySelector('.play-toggle');
    this.playText = element.querySelector('.play-text');
    this.error = element.querySelector('.video-error');
    this.playing = false;
    this.revision = 0;
    this.frame = null;
    this.loaded = false;
    this.onPlayback = () => {};

    this.wipe.addEventListener('input', () => this.updateDivider());
    let pointer = null;
    let originX = 0;
    let originY = 0;
    let horizontalDrag = false;
    this.wipe.addEventListener('pointerdown', (event) => {
      if (!event.isPrimary || event.button !== 0) return;
      event.preventDefault();
      pointer = event.pointerId;
      originX = event.clientX;
      originY = event.clientY;
      horizontalDrag = event.pointerType !== 'touch';
      this.wipe.setPointerCapture(pointer);
      this.wipe.focus({ preventScroll: true });
      if (horizontalDrag) this.moveDivider(event.clientX);
    });
    this.wipe.addEventListener('pointermove', (event) => {
      if (event.pointerId !== pointer) return;
      const dx = Math.abs(event.clientX - originX);
      const dy = Math.abs(event.clientY - originY);
      if (!horizontalDrag && dx > 6 && dx > dy) horizontalDrag = true;
      if (horizontalDrag) this.moveDivider(event.clientX);
    });
    this.wipe.addEventListener('pointerup', (event) => {
      if (event.pointerId !== pointer) return;
      if (horizontalDrag || Math.abs(event.clientY - originY) < 6) this.moveDivider(event.clientX);
      pointer = null;
    });
    this.wipe.addEventListener('lostpointercapture', () => { pointer = null; });

    this.playButton.addEventListener('click', () => this.playing ? this.pause() : this.play());
    element.querySelector('.replay').addEventListener('click', () => {
      this.jumpTo(0);
      this.play();
    });
    const fullscreen = element.querySelector('.fullscreen');
    if (element.requestFullscreen && document.fullscreenEnabled) {
      fullscreen.addEventListener('click', async () => {
        try {
          if (document.fullscreenElement === element) await document.exitFullscreen();
          else await element.requestFullscreen();
        } catch {
          fullscreen.focus();
        }
      });
    } else {
      fullscreen.hidden = true;
    }
    this.seek.addEventListener('input', () => this.jumpTo(Number(this.seek.value)));
    for (const video of [this.left, this.right]) {
      video.addEventListener('loadedmetadata', () => this.updateTime());
      video.addEventListener('error', () => {
        if (!this.loaded) return;
        this.pause();
        this.error.hidden = false;
      });
    }
    this.updateDivider();
    this.setSource(element.dataset.scene, element.dataset.mode);
  }

  moveDivider(clientX) {
    const bounds = this.stage.getBoundingClientRect();
    this.wipe.value = Math.max(0, Math.min(100, 100 * (clientX - bounds.left) / bounds.width));
    this.updateDivider();
  }

  updateDivider() {
    const value = Number(this.wipe.value);
    this.stage.style.setProperty('--split', `${value}%`);
    this.wipe.setAttribute('aria-valuetext', `${value}% ${this.leftLabel || 'Reference'} shown`);
  }

  setSource(scene, mode) {
    this.revision++;
    this.pause();
    this.loaded = false;
    this.error.hidden = true;
    const { variants, labels } = comparisonModes[mode];
    this.source = [scene, ...variants];
    const [, left, right] = this.source;
    this.setLabels(...labels);
    for (const [video, variant] of [[this.left, left], [this.right, right]]) {
      video.removeAttribute('src');
      video.preload = 'none';
      video.poster = mediaUrl('images', scene, variant);
      video.load();
    }
    this.seek.value = '0';
    this.seek.style.setProperty('--played', '0%');
    this.seek.disabled = true;
    this.time.textContent = '0:00 / –';
  }

  setLabels(leftLabel, rightLabel) {
    this.leftLabel = leftLabel;
    this.rightLabel = rightLabel;
    this.element.querySelector('.label-left').textContent = leftLabel;
    this.element.querySelector('.label-right').textContent = rightLabel;
    this.wipe.setAttribute('aria-label', `Reveal ${leftLabel} versus ${rightLabel}`);
    this.updateDivider();
  }

  switchLeft(variant, label) {
    const [scene, previous] = this.source;
    if (previous === variant) return;
    const resume = this.playing;
    const time = this.right.currentTime;
    this.pause();
    this.source[1] = variant;
    this.error.hidden = true;
    this.setLabels(label, this.rightLabel);
    this.left.poster = mediaUrl('images', scene, variant);
    if (this.loaded) {
      this.left.preload = 'auto';
      this.left.src = mediaUrl('videos', scene, variant);
      this.left.currentTime = time;
    } else {
      this.left.load();
    }
    if (resume) this.play();
  }

  load() {
    if (this.loaded && !this.left.error && !this.right.error) return;
    this.loaded = true;
    this.error.hidden = true;
    const [scene, left, right] = this.source;
    this.left.src = mediaUrl('videos', scene, left);
    this.right.src = mediaUrl('videos', scene, right);
  }

  get duration() {
    const durations = [this.left.duration, this.right.duration].filter(Number.isFinite);
    return durations.length === 2 ? Math.min(...durations) : 0;
  }

  updateTime() {
    const duration = this.duration;
    this.seek.disabled = duration <= 0;
    this.seek.max = duration || 100;
    const elapsed = Math.min(this.right.currentTime, duration);
    this.seek.value = elapsed;
    this.seek.style.setProperty('--played', duration ? `${100 * elapsed / duration}%` : '0%');
    this.time.textContent = `${formatTime(this.right.currentTime)} / ${duration ? formatTime(duration) : "–"}`;
  }

  jumpTo(seconds) {
    if (!this.duration) return;
    const time = Math.min(Math.max(0, seconds), Math.max(0, this.duration - 0.015));
    this.left.currentTime = time;
    this.right.currentTime = time;
    this.updateTime();
  }

  updatePlayButton() {
    this.element.classList.toggle('playing', this.playing);
    this.playText.textContent = this.playing ? 'Pause' : 'Play';
    this.playButton.setAttribute('aria-label', this.playing ? 'Pause synchronized videos' : 'Play synchronized videos');
  }

  async play() {
    this.load();
    const revision = ++this.revision;
    this.onPlayback();
    if (this.duration && this.right.currentTime >= this.duration - 0.08) this.jumpTo(0);
    this.playing = true;
    this.updatePlayButton();
    try {
      await Promise.all([this.right.play(), this.left.play()]);
      if (revision !== this.revision) return;
      this.updateTime();
      this.tick();
    } catch (error) {
      if (revision !== this.revision) return;
      this.pause();
      if (this.left.error || this.right.error) this.error.hidden = false;
    }
  }

  pause() {
    this.revision++;
    this.playing = false;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.left.pause();
    this.right.pause();
    this.left.playbackRate = 1;
    this.updatePlayButton();
    if (this.duration) this.updateTime();
  }

  tick() {
    if (!this.playing) return;
    this.updateTime();
    if (this.right.ended || this.right.currentTime >= this.duration - 0.025) {
      this.pause();
      if (this.isHero) {
        this.jumpTo(0);
        this.play();
      }
      return;
    }
    if (!this.left.seeking && !this.right.seeking && this.left.readyState >= 2) {
      const drift = this.right.currentTime - this.left.currentTime;
      if (Math.abs(drift) > 0.11) {
        this.left.currentTime = this.right.currentTime;
        this.left.playbackRate = 1;
      } else {
        this.left.playbackRate = Math.abs(drift) < 0.025 ? 1 : 1 + drift * 0.6;
      }
    }
    this.frame = requestAnimationFrame(() => this.tick());
  }
}

const players = Object.fromEntries([...document.querySelectorAll('.compare[data-player]')].map((element) => [element.dataset.player, new VideoComparison(element)]));
for (const active of Object.values(players)) {
  active.onPlayback = () => {
    for (const other of Object.values(players)) {
      if (other !== active && other.playing) other.pause();
    }
  };
}
if (!reducedMotion.matches) players.hero.play();
const heroObserver = new IntersectionObserver(([entry]) => {
  if (!entry.isIntersecting && players.hero.playing) players.hero.pause();
}, { threshold: 0.05 });
heroObserver.observe(players.hero.element);
reducedMotion.addEventListener('change', (event) => { if (event.matches) players.hero.pause(); });

function choose(buttons, selected) {
  for (const button of buttons) {
    const active = button === selected;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
}

for (const control of document.querySelectorAll('[data-target-player]')) {
  const player = players[control.dataset.targetPlayer];
  const [, original] = player.source;
  const originalLabel = player.leftLabel;
  const buttons = [...control.querySelectorAll('button')];
  for (const button of buttons) {
    button.addEventListener('click', () => {
      choose(buttons, button);
      if (button.dataset.view === 'target') player.switchLeft('reference', 'Target reference');
      else player.switchLeft(original, originalLabel);
    });
  }
}

const heroButtons = [...document.querySelectorAll('[data-hero-scene]')];
for (const button of heroButtons) {
  button.addEventListener('click', () => {
    choose(heroButtons, button);
    const scene = button.dataset.heroScene;
    document.querySelector('.hero-caption-top span:last-child').textContent = `WorldRehearsal / ${scenes[scene].model}`;
    players.hero.setSource(scene, 'reference');
    if (!reducedMotion.matches) players.hero.play();
  });
}

let currentScene = 'kitchen';
let currentMode = 'reference';
const sceneButtons = [...document.querySelectorAll('.scene-tab')];
for (const button of sceneButtons) {
  button.addEventListener('click', () => {
    if (currentScene === button.dataset.scene) return;
    currentScene = button.dataset.scene;
    choose(sceneButtons, button);
    document.querySelector('#scene-title').textContent = scenes[currentScene].title;
    document.querySelector('#scene-description').textContent = scenes[currentScene].description;
    const resume = players.explorer.playing;
    players.explorer.setSource(currentScene, currentMode);
    if (resume) players.explorer.play();
  });
}
for (const radio of document.querySelectorAll('input[name="comparison-mode"]')) {
  radio.addEventListener('change', () => {
    currentMode = radio.value;
    const resume = players.explorer.playing;
    players.explorer.setSource(currentScene, currentMode);
    document.querySelector('#demo-type').textContent = currentMode === 'reference'
      ? 'The reference shows the rendered spatial plan.'
      : 'Baseline and WorldRehearsal each continue from their own generated history.';
    if (resume) players.explorer.play();
  });
}

const timingButtons = [...document.querySelectorAll('[data-timing]')];
for (const button of timingButtons) {
  button.addEventListener('click', () => {
    choose(timingButtons, button);
    const scene = button.dataset.timing;
    const resume = players.timing.playing;
    players.timing.setSource(scene, 'timing');
    document.querySelector('#timing-caption').textContent = timingExamples[scene];
    if (resume) players.timing.play();
  });
}

const methodStages = {
  ground: ['Geometry gives the plan a place to happen.', 'VGGT supplies depth and camera geometry. VLM-guided SAM3 regions attach semantic identities to visible surfaces. The resulting world is a partial, renderable representation grounded in observations.', 'Static scenery, camera-carried foreground, and controlled actors need different motion representations.'],
  rehearse: ['A rendered reference gives the task a trajectory.', 'The agent translates a command into planned camera poses and, where supported, actor motion. It renders a sequence of gray surfaces and structural lines, and pairs it with the opening image and prompt.', 'The reference communicates direction, progression, and the intended ending view.'],
  remember: ['Recall the history relevant to this view.', 'The agent checks the current image, original identity photograph, historical records, and an eligible view near the planned endpoint. It uses them to write appearance details into the prompt.', 'The generator receives the current image, reference video, and resulting prompt.'],
  observe: ['Use the actual output to move forward.', 'The generated last frame becomes the next opening view. Review informs retrieval eligibility, while aligned geometry adds supported surfaces to the persistent world.', 'The system can continue the rollout even when a geometry update lacks sufficient support.'],
};

const methodTabs = [...document.querySelectorAll('.method-tabs [role="tab"]')];
const methodPanel = document.querySelector('#stage-panel');
function activateStage(tab, focus = false) {
  for (const item of methodTabs) {
    item.setAttribute('aria-selected', String(item === tab));
    item.tabIndex = item === tab ? 0 : -1;
  }
  methodPanel.setAttribute('aria-labelledby', tab.id);
  const [title, description, principle] = methodStages[tab.dataset.stage];
  methodPanel.querySelector('h3').textContent = title;
  methodPanel.querySelector('p').textContent = description;
  methodPanel.querySelector('.stage-principle').textContent = principle;
  if (focus) tab.focus();
}
for (const [index, tab] of methodTabs.entries()) {
  tab.addEventListener('click', () => activateStage(tab));
  tab.addEventListener('keydown', (event) => {
    const offsets = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    let target = index + (offsets[event.key] || 0);
    if (event.key === 'Home') target = 0;
    else if (event.key === 'End') target = methodTabs.length - 1;
    else if (!(event.key in offsets)) return;
    event.preventDefault();
    activateStage(methodTabs[(target + methodTabs.length) % methodTabs.length], true);
  });
}

const architectureDialog = document.querySelector('#method-dialog');
for (const opener of document.querySelectorAll('[data-open-method]')) {
  opener.addEventListener('click', () => architectureDialog.showModal());
}
architectureDialog.querySelector('button').addEventListener('click', () => architectureDialog.close());
architectureDialog.addEventListener('click', (event) => {
  if (event.target === architectureDialog) architectureDialog.close();
});

const header = document.querySelector('.site-header');
const menuButton = document.querySelector('.menu-button');
const mobileMenu = document.querySelector('#mobile-menu');
function closeMenu() {
  mobileMenu.hidden = true;
  menuButton.setAttribute('aria-expanded', 'false');
}
menuButton.addEventListener('click', () => {
  mobileMenu.hidden = !mobileMenu.hidden;
  menuButton.setAttribute('aria-expanded', String(!mobileMenu.hidden));
});
mobileMenu.addEventListener('click', (event) => { if (event.target.closest('a')) closeMenu(); });
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !mobileMenu.hidden) {
    closeMenu();
    menuButton.focus();
  }
});
matchMedia('(max-width: 800px)').addEventListener('change', closeMenu);
const navLinks = [...header.querySelectorAll('nav a')];
function updateNavigation() {
  header.classList.toggle('scrolled', window.scrollY > 24);
  const current = [...navLinks].reverse().find((link) => document.querySelector(link.hash).getBoundingClientRect().top < 165);
  for (const link of navLinks) {
    link.classList.toggle('active', link === current);
    if (link === current) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
}
window.addEventListener('scroll', updateNavigation, { passive: true });
updateNavigation();

const copyButton = document.querySelector('#copy-citation');
copyButton.addEventListener('click', async () => {
  const citation = document.querySelector('#bibtex');
  const status = document.querySelector('#copy-status');
  try {
    await navigator.clipboard.writeText(citation.textContent);
    status.textContent = 'BibTeX copied.';
  } catch {
    const range = document.createRange();
    range.selectNodeContents(citation);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    status.textContent = 'BibTeX selected. Use your copy shortcut.';
  }
});

const benchmarkRows = [
  ['MiniMax-H3', 'H3', [29.42, 47.28, 27.53, 46.06, 67.18, 20.59, 70.75, 91.40, 69.17], [62.67, 64.61, 54.69, 78.07, 81.45, 61.32, 74.76, 94.36, 67.81]],
  ['LTX-2.5-22B', 'LTX', [0, 38.95, 13.81, 21.25, 64.34, 0, 74.31, 87.77, 63.30], [72.17, 69.82, 61.25, 93.46, 84.48, 70.83, 74.77, 93.84, 66.16]],
  ['Wan2.2-Fun-5B', 'Wan2.2', [0, 33.81, 14.81, 21.56, 66.92, 0, 55.25, 91.34, 62.90], [69.66, 60.21, 45.58, 71.38, 80.77, 72.21, 74.50, 92.06, 64.72]],
  ['Wan2.1-Fun-1.3B', 'Wan1.3B', [0, 34.59, 9.03, 33.11, 72.12, 0, 55.29, 91.49, 64.53], [73.45, 69.40, 52.23, 83.53, 82.66, 71.10, 71.67, 92.13, 57.90]],
  ['Cosmos3-Nano', 'Nano', [3.95, 38.86, 10.42, 17.11, 65.86, 0, 69.25, 91.48, 65.34], [77.83, 73.65, 71.45, 92.09, 86.52, 72.71, 70.82, 91.49, 64.58]],
];
const metrics = {
  navi: {
    label: 'WBench Navi Overall', score: (row) => row[4], headline: '+15.89',
    unit: 'points on average', title: 'Every backbone improves.',
    description: 'Navigation gains range from 10.54 to 20.66 points across the five tested generators.',
  },
  worldmark: {
    label: 'WorldMark navigation mean',
    score: (row) => (row[0] + row[1] + row[2] + row[3]) / 4,
    headline: '+47.78', unit: 'points on average', title: 'Four motion families improve.',
    description: 'The mean rises from 22.08 to 69.86 across models and families. Each family gives equal weight to translation and rotation.',
  },
  revisit: {
    label: 'WorldMark Revisit-Z', score: (row) => row[5], headline: '+65.51',
    unit: 'points on average', title: 'More successful scene returns.',
    description: 'Revisit-Z includes return execution and content retention. WBench Gated Spatial also improves by 8.33 points on average.',
  },
  image: {
    label: 'Image quality (MUSIQ)', score: (row) => row[8], headline: '−0.81',
    unit: 'points on average', title: 'Quality varies by backbone.',
    description: 'LTX-2.5 and Wan2.2 improve. Wan1.3B shows the largest decrease, at 6.63 points. Scores average the two benchmarks.',
  },
};

const chart = document.querySelector('#result-chart');
const metricButtons = [...document.querySelectorAll('[data-metric]')];
function renderMetric(key) {
  const metric = metrics[key];
  const groups = benchmarkRows.map(([name, shortName, baseline, ours]) => {
    const values = [metric.score(baseline), metric.score(ours)];
    const bars = values.map((value, index) => {
      const method = index === 0 ? 'Baseline' : 'WorldRehearsal';
      return `<div class="chart-bar ${index === 0 ? 'baseline' : 'ours'}" style="--score:${value}%" title="${name}, ${method}: ${value.toFixed(2)}"><span>${value.toFixed(1)}</span></div>`;
    }).join('');
    return `<div class="chart-group" role="img" aria-label="${name}: Baseline ${values[0].toFixed(2)}, WorldRehearsal ${values[1].toFixed(2)}"><div class="chart-bars" aria-hidden="true">${bars}</div><span class="chart-name" aria-hidden="true">${shortName}</span></div>`;
  }).join('');
  chart.setAttribute('aria-label', metric.label);
  chart.innerHTML = `<div class="chart-ticks" aria-hidden="true">${[100, 75, 50, 25, 0].map((tick) => `<span style="--tick:${tick}%" data-tick="${tick}"></span>`).join('')}</div><div class="chart-groups">${groups}</div>`;
  for (const [id, value] of Object.entries({
    'metric-kicker': metric.label,
    'metric-number': metric.headline,
    'metric-unit': metric.unit,
    'metric-title': metric.title,
    'metric-description': metric.description,
  })) document.getElementById(id).textContent = value;
}
for (const button of metricButtons) {
  button.addEventListener('click', () => {
    choose(metricButtons, button);
    renderMetric(button.dataset.metric);
  });
}
renderMetric('navi');

document.querySelector('#full-results').innerHTML = `<thead><tr>
  ${['Backbone', 'System', 'DA', 'MP', 'MS', 'RL', 'Navi', 'Revisit-Z', 'Gated Spatial', 'Subject', 'Image'].map((label) => `<th scope="col">${label}</th>`).join('')}
  </tr></thead><tbody>${benchmarkRows.map(([name, , baseline, ours]) => [baseline, ours].map((row, i) =>
  `<tr><th scope="row">${name}</th><td>${i ? 'WorldRehearsal' : 'Baseline'}</td>${row.map((score, j) => {
    const best = score === Math.max(baseline[j], ours[j]);
    return `<td>${best ? '<b>' : ''}${score.toFixed(2)}${best ? '</b>' : ''}</td>`;
  }).join('')}</tr>`).join('')).join('')}</tbody>`;
