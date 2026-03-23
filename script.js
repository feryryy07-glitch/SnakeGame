/**
 * ══════════════════════════════════════════════════════
 * SERPENT v2 — Ultimate Snake  |  script.js
 * ══════════════════════════════════════════════════════
 *
 * Architecture — IIFE modules (no globals leaking):
 *   1. Config        — constants & skin/difficulty data
 *   2. StateManager  — localStorage persistence, settings
 *   3. AudioEngine   — Web Audio API sound effects
 *   4. Renderer      — canvas drawing (grid, snake, food, particles)
 *   5. AIController  — BFS pathfinding for AI mode
 *   6. GameEngine    — game loop, collision, scoring, combo
 *   7. UIController  — screen management, HUD, skin picker
 *   8. InputHandler  — keyboard, touch swipe, D-pad
 *   9. Bootstrap     — wires all modules together on DOMContentLoaded
 *
 * ══════════════════════════════════════════════════════
 */

'use strict';


/* ══════════════════════════════════════════════════════
   1. CONFIG
   Central place for all game constants and data tables.
   ══════════════════════════════════════════════════════ */
const Config = (() => {

  /** Grid dimensions (columns × rows). */
  const GRID = { cols: 20, rows: 20 };

  /**
   * Difficulty settings.
   * baseSpeed  — starting interval in ms (lower = faster)
   * speedStep  — ms removed per level
   * pointMult  — score multiplier
   */
  const DIFFICULTY = {
    easy:   { baseSpeed: 140, speedStep: 5,  pointMult: 1   },
    medium: { baseSpeed: 105, speedStep: 8,  pointMult: 1.5 },
    hard:   { baseSpeed: 72,  speedStep: 12, pointMult: 2   },
  };

  /**
   * Snake skin definitions.
   * threshold — high-score required to unlock (0 = always available)
   * effect    — optional canvas overlay effect identifier
   * glow      — partial rgba string for shadow colour (closed externally)
   */
  const SKINS = [
    {
      id: 'default', label: 'Classic',    threshold: 0,
      head: '#39ff14', body: '#1c8c08', tail: '#0f5005',
      bg:   '#050f05', food: '#ff4060', pw: '#00d4ff',
      glow: 'rgba(57,255,20,',    foodGlow: 'rgba(255,64,96,',
      effect: null,
    },
    {
      id: 'cyber',   label: 'Cyber',      threshold: 50,
      head: '#00d4ff', body: '#007599', tail: '#003d52',
      bg:   '#00111a', food: '#ff8c00', pw: '#ff4060',
      glow: 'rgba(0,212,255,',   foodGlow: 'rgba(255,140,0,',
      effect: 'cyber',
    },
    {
      id: 'lava',    label: 'Lava',       threshold: 150,
      head: '#ff6a00', body: '#c03300', tail: '#700f00',
      bg:   '#140500', food: '#ffd700', pw: '#39ff14',
      glow: 'rgba(255,106,0,',   foodGlow: 'rgba(255,215,0,',
      effect: 'lava',
    },
    {
      id: 'ice',     label: 'Ice',        threshold: 300,
      head: '#a8ecff', body: '#4a9ec8', tail: '#1a4f70',
      bg:   '#000c1a', food: '#ff88cc', pw: '#ffd700',
      glow: 'rgba(168,236,255,', foodGlow: 'rgba(255,136,204,',
      effect: 'ice',
    },
    {
      id: 'galaxy',  label: 'Galaxy',     threshold: 600,
      head: '#d06aff', body: '#7a1acc', tail: '#3d0066',
      bg:   '#06000f', food: '#39ff14', pw: '#ffd700',
      glow: 'rgba(208,106,255,', foodGlow: 'rgba(57,255,20,',
      effect: 'galaxy',
    },
    {
      id: 'gold',    label: 'Gold Elite', threshold: 1000,
      head: '#ffd700', body: '#b58900', tail: '#6b5000',
      bg:   '#0f0d00', food: '#00d4ff', pw: '#ff4060',
      glow: 'rgba(255,215,0,',   foodGlow: 'rgba(0,212,255,',
      effect: 'gold',
    },
  ];

  /** Available power-up types. */
  const POWERUP_TYPES = ['speed', 'slow', 'double'];

  /** How long a power-up stays active (ms). */
  const POWERUP_DURATION = 6500;

  /** Window within which sequential eats chain a combo (ms). */
  const COMBO_WINDOW = 2200;

  /** Maximum combo multiplier cap. */
  const MAX_COMBO = 8;

  /** Maximum leaderboard entries kept. */
  const LEADERBOARD_MAX = 20;

  return { GRID, DIFFICULTY, SKINS, POWERUP_TYPES, POWERUP_DURATION, COMBO_WINDOW, MAX_COMBO, LEADERBOARD_MAX };
})();


/* ══════════════════════════════════════════════════════
   2. STATE MANAGER
   Handles all persistent data (settings, skins, leaderboard)
   and provides a clean get/set API backed by localStorage.
   ══════════════════════════════════════════════════════ */
const StateManager = (() => {

  const STORAGE_KEYS = {
    settings:    'sv2_settings',
    skins:       'sv2_skins',
    leaderboard: 'sv2_leaderboard',
  };

  const DEFAULTS = {
    difficulty: 'medium',
    mode:       'classic',
    soundOn:    true,
    theme:      'dark',
    skin:       'default',
    highScore:  0,
    gamesPlayed: 0,
    bestCombo:  1,
  };

  // --- Internal state ---
  let settings      = { ...DEFAULTS };
  let unlockedSkins = ['default'];
  let leaderboard   = [];

  // --- Persistence ---

  /** Load all state from localStorage. Called once on boot. */
  const load = () => {
    try {
      const savedSettings = JSON.parse(localStorage.getItem(STORAGE_KEYS.settings) || '{}');
      settings      = { ...DEFAULTS, ...savedSettings };
      unlockedSkins = JSON.parse(localStorage.getItem(STORAGE_KEYS.skins)       || '["default"]');
      leaderboard   = JSON.parse(localStorage.getItem(STORAGE_KEYS.leaderboard) || '[]');
    } catch (e) {
      // Silently fall back to defaults if storage is corrupt
    }
  };

  /** Persist all state to localStorage. */
  const save = () => {
    try {
      localStorage.setItem(STORAGE_KEYS.settings,    JSON.stringify(settings));
      localStorage.setItem(STORAGE_KEYS.skins,       JSON.stringify(unlockedSkins));
      localStorage.setItem(STORAGE_KEYS.leaderboard, JSON.stringify(leaderboard));
    } catch (e) {}
  };

  // --- Settings API ---

  const get = (key) => settings[key];

  const set = (key, value) => {
    settings[key] = value;
    save();
  };

  /** Shorthand — returns the full difficulty config for current setting. */
  const getDiff = () => Config.DIFFICULTY[settings.difficulty];

  // --- Score & Leaderboard ---

  /**
   * Record a completed game. Returns true if a new high score was set.
   * @param {number} score
   * @param {string} difficulty
   * @param {string} mode
   * @param {number} length   - snake length at game end
   * @param {number} level
   * @param {number} bestCombo
   * @param {number} foodEaten
   * @returns {boolean} isNewRecord
   */
  const addScore = (score, difficulty, mode, length, level, bestCombo, foodEaten) => {
    leaderboard.push({ score, difficulty, mode, length, level, bestCombo, foodEaten, date: Date.now() });
    leaderboard.sort((a, b) => b.score - a.score);
    leaderboard = leaderboard.slice(0, Config.LEADERBOARD_MAX);

    let isNewRecord = false;
    if (score > settings.highScore) {
      settings.highScore = score;
      isNewRecord = true;
    }
    if (bestCombo > settings.bestCombo) {
      settings.bestCombo = bestCombo;
    }
    settings.gamesPlayed++;
    save();
    return isNewRecord;
  };

  /**
   * Returns leaderboard entries, optionally filtered by difficulty.
   * @param {string} filter - 'all' | 'easy' | 'medium' | 'hard'
   */
  const getLeaderboard = (filter) => {
    return filter === 'all'
      ? leaderboard
      : leaderboard.filter(e => e.difficulty === filter);
  };

  // --- Skin Management ---

  /**
   * Unlock any skins whose threshold the current highScore has reached.
   * @param {number} currentHighScore
   * @returns {Object|null} The newly unlocked skin definition, or null.
   */
  const checkSkinUnlock = (currentHighScore) => {
    let newUnlock = null;
    Config.SKINS.forEach(skin => {
      if (!unlockedSkins.includes(skin.id) && currentHighScore >= skin.threshold) {
        unlockedSkins.push(skin.id);
        newUnlock = skin;
      }
    });
    if (newUnlock) save();
    return newUnlock;
  };

  const getSkin       = (id) => Config.SKINS.find(s => s.id === id) || Config.SKINS[0];
  const getActiveSkin = ()   => getSkin(settings.skin);
  const isUnlocked    = (id) => unlockedSkins.includes(id);

  /** Returns the next locked skin (for the unlock hint). */
  const getNextLocked = () => Config.SKINS.find(s => !unlockedSkins.includes(s.id));

  // Boot
  load();

  return {
    get, set, getDiff, addScore, getLeaderboard,
    checkSkinUnlock, getSkin, getActiveSkin, isUnlocked, getNextLocked,
    get SKINS() { return Config.SKINS; },
  };
})();


/* ══════════════════════════════════════════════════════
   3. AUDIO ENGINE
   Synthesises all sound effects using the Web Audio API.
   Call init() once after first user interaction, then play(type).
   ══════════════════════════════════════════════════════ */
const AudioEngine = (() => {

  let audioCtx = null;

  /** Create / resume the AudioContext. Must be called from a user gesture. */
  const init = () => {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    }
    if (audioCtx?.state === 'suspended') audioCtx.resume();
  };

  /**
   * Play a synthesised tone.
   * @param {number} freq    - start frequency (Hz)
   * @param {string} type    - OscillatorType ('sine' | 'square' | 'sawtooth')
   * @param {number} dur     - duration (seconds)
   * @param {number} vol     - peak gain (0–1)
   * @param {number} [freqEnd] - optional end frequency for pitch sweep
   */
  const tone = (freq, type, dur, vol, freqEnd) => {
    if (!audioCtx) return;
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const t    = audioCtx.currentTime;

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);

    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    osc.start();
    osc.stop(t + dur + 0.01);
  };

  /** Sound map — each key corresponds to a game event. */
  const SOUNDS = {
    eat:      () => tone(440, 'sine',     0.12, 0.28, 900),
    eat2:     () => tone(550, 'sine',     0.10, 0.28, 1100),
    eat3:     () => tone(660, 'sine',     0.10, 0.32, 1320),
    click:    () => tone(600, 'sine',     0.05, 0.12),
    gameover: () => {
      tone(220, 'sawtooth', 0.10, 0.35, 180);
      setTimeout(() => tone(150, 'sawtooth', 0.40, 0.35, 55), 120);
    },
    powerup:  () => {
      tone(330, 'square', 0.08, 0.18, 660);
      setTimeout(() => tone(660, 'square', 0.12, 0.18, 1320), 80);
    },
    levelup:  () => {
      [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 'sine', 0.2, 0.2), i * 100));
    },
    combo:    () => tone(880, 'sine', 0.08, 0.2, 1200),
    comboMax: () => {
      [880, 1100, 1320].forEach((f, i) => setTimeout(() => tone(f, 'sine', 0.1, 0.25), i * 60));
    },
  };

  /**
   * Play a named sound effect (only if sound is enabled).
   * @param {string} type - key from SOUNDS map
   */
  const play = (type) => {
    if (!StateManager.get('soundOn') || !audioCtx) return;
    SOUNDS[type]?.();
  };

  return { init, play };
})();


/* ══════════════════════════════════════════════════════
   4. RENDERER
   All canvas drawing lives here. Stateless draw functions
   receive data they need; mutable state (particles, texts,
   shake) is kept internally.
   ══════════════════════════════════════════════════════ */
const Renderer = (() => {

  const canvas = document.getElementById('gameCanvas');
  const ctx    = canvas.getContext('2d');

  // Grid cell size is computed from the available space
  let CELL = 24;
  const { cols: COLS, rows: ROWS } = Config.GRID;

  // Particle and floating-text pools
  const particles    = [];
  const floatingTexts = [];

  // Screen shake state
  let shakeMagnitude = 0;


  /* ─────────────────────────────────────────────
     Canvas sizing
     ───────────────────────────────────────────── */

  /** Fit the canvas to the canvas-wrap container. */
  const resize = () => {
    const wrap = document.getElementById('canvasWrap');
    const size = Math.min(wrap.clientWidth - 14, wrap.clientHeight - 14, 560);
    CELL = Math.floor(size / COLS);
    canvas.width  = COLS * CELL;
    canvas.height = ROWS * CELL;
  };


  /* ─────────────────────────────────────────────
     Geometry helpers (private)
     ───────────────────────────────────────────── */

  /**
   * Draw a rounded rectangle path (no fill/stroke — caller decides).
   */
  const roundedRect = (x, y, w, h, r) => {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };

  /**
   * Draw a 5-pointed star path (fills immediately).
   */
  const drawStar = (cx, cy, spikes, outerR, innerR) => {
    let rot  = (Math.PI / 2) * 3;
    const step = Math.PI / spikes;
    ctx.beginPath();
    ctx.moveTo(cx, cy - outerR);
    for (let i = 0; i < spikes; i++) {
      ctx.lineTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR);
      rot += step;
      ctx.lineTo(cx + Math.cos(rot) * innerR, cy + Math.sin(rot) * innerR);
      rot += step;
    }
    ctx.lineTo(cx, cy - outerR);
    ctx.closePath();
    ctx.fill();
  };

  /**
   * Linear colour interpolation between two hex colours.
   * @param {string} hexA - '#rrggbb'
   * @param {string} hexB - '#rrggbb'
   * @param {number} t    - 0..1
   * @returns {string} 'rgb(r,g,b)'
   */
  const lerpColor = (hexA, hexB, t) => {
    const ah = parseInt(hexA.slice(1), 16);
    const bh = parseInt(hexB.slice(1), 16);
    const r  = Math.round(((ah >> 16) & 0xff) + (((bh >> 16) & 0xff) - ((ah >> 16) & 0xff)) * t);
    const g  = Math.round(((ah >>  8) & 0xff) + (((bh >>  8) & 0xff) - ((ah >>  8) & 0xff)) * t);
    const b  = Math.round(( ah        & 0xff) + (( bh        & 0xff) - ( ah        & 0xff)) * t);
    return `rgb(${r},${g},${b})`;
  };


  /* ─────────────────────────────────────────────
     Background
     ───────────────────────────────────────────── */

  /**
   * Fill the canvas with the skin background colour and a subtle grid.
   * @param {Object} skin - active skin definition
   */
  const drawGrid = (skin) => {
    ctx.fillStyle = skin.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(255,255,255,0.025)';
    ctx.lineWidth   = 1;

    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(x * CELL, 0);
      ctx.lineTo(x * CELL, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(0,            y * CELL);
      ctx.lineTo(canvas.width, y * CELL);
      ctx.stroke();
    }
  };

  /**
   * Draw drifting stars for the Galaxy skin background.
   * @param {number} tick - current game tick (drives animation)
   */
  const drawGalaxyBackground = (tick) => {
    for (let i = 0; i < 20; i++) {
      const x = ((i * 137) + tick * 0.5) % (COLS * CELL);
      const y = ((i *  97) + tick * 0.3) % (ROWS * CELL);
      const brightness = 0.3 + Math.sin(tick * 0.05 + i) * 0.3;
      ctx.fillStyle = `rgba(200,150,255,${brightness})`;
      ctx.beginPath();
      ctx.arc(x, y, 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  };


  /* ─────────────────────────────────────────────
     Snake drawing
     ───────────────────────────────────────────── */

  /**
   * Draw all segments of Player 1's snake.
   * Segments are rendered back-to-front so the head is always on top.
   * @param {Array}   segments    - [{r,c}, ...]
   * @param {Object}  skin        - active skin
   * @param {number}  tick        - current tick (eye animation)
   * @param {boolean} speedActive - whether speed power-up is active (shows trail)
   */
  const drawSnake = (segments, skin, tick, speedActive) => {
    if (!segments.length) return;

    // Speed boost — draw semi-transparent trail behind head
    if (speedActive) {
      for (let i = 0; i < Math.min(4, segments.length); i++) {
        const { c, r } = segments[i];
        ctx.globalAlpha = 0.18 - i * 0.04;
        ctx.fillStyle   = skin.head;
        roundedRect(c * CELL + 3, r * CELL + 3, CELL - 6, CELL - 6, CELL * 0.25);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Body segments — rendered back to front
    for (let i = segments.length - 1; i >= 0; i--) {
      const { c, r } = segments[i];
      const isHead  = i === 0;
      const isTail  = i === segments.length - 1;
      const progress = i / segments.length;

      const x   = c * CELL;
      const y   = r * CELL;
      const pad = isHead ? 1 : isTail ? 3 : 2;
      const rad = isHead ? CELL * 0.32 : isTail ? CELL * 0.18 : CELL * 0.24;

      // Gradient: head uses skin.head→body; body fades toward skin.tail
      const gradient = ctx.createLinearGradient(x, y, x + CELL, y + CELL);
      if (isHead) {
        gradient.addColorStop(0, skin.head);
        gradient.addColorStop(1, skin.body);
      } else {
        const blend = Math.min(progress * 1.4, 1);
        gradient.addColorStop(0, lerpColor(skin.body, skin.tail, blend));
        gradient.addColorStop(1, lerpColor(skin.body, skin.tail, Math.min(blend + 0.15, 1)));
      }

      ctx.shadowBlur  = isHead ? 20 : Math.max(4, 10 - i * 0.4);
      ctx.shadowColor = skin.glow + (isHead ? '0.85)' : '0.4)');
      ctx.fillStyle   = gradient;
      ctx.globalAlpha = isHead ? 1 : Math.max(0.4, 1 - progress * 0.45);

      roundedRect(x + pad, y + pad, CELL - pad * 2, CELL - pad * 2, rad);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.shadowBlur  = 0;

      // Per-skin special body overlays
      applySkinBodyEffect(skin, x, y, pad, rad, isHead, i);

      // Head: draw eyes
      if (isHead) drawSnakeEyes(x, y, tick, skin);
    }

    ctx.shadowBlur = 0;
  };

  /**
   * Draw skin-specific body effect (lava sparks, ice frost, galaxy stars, gold shine).
   * @private
   */
  const applySkinBodyEffect = (skin, x, y, pad, rad, isHead, index) => {
    if (isHead) return;

    switch (skin.effect) {
      case 'lava':
        if (Math.random() < 0.04) {
          ctx.fillStyle = 'rgba(255,180,0,0.25)';
          const ox = -2 + Math.random() * 4;
          const oy = -2 + Math.random() * 4;
          ctx.beginPath();
          ctx.arc(x + CELL / 2 + ox, y + CELL / 2 + oy, 2, 0, Math.PI * 2);
          ctx.fill();
        }
        break;

      case 'ice':
        if (index % 3 === 0) {
          ctx.fillStyle = 'rgba(200,240,255,0.18)';
          roundedRect(x + pad + 1, y + pad + 1, CELL - pad * 2 - 2, CELL - pad * 2 - 2, rad);
          ctx.fill();
        }
        break;

      case 'galaxy':
        if (Math.random() < 0.06) {
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.beginPath();
          ctx.arc(x + CELL * Math.random(), y + CELL * Math.random(), 0.8, 0, Math.PI * 2);
          ctx.fill();
        }
        break;

      case 'gold': {
        const shine = ctx.createLinearGradient(x, y, x + CELL, y + CELL);
        shine.addColorStop(0,   'rgba(255,255,200,0.2)');
        shine.addColorStop(0.5, 'rgba(255,255,255,0)');
        shine.addColorStop(1,   'rgba(255,255,200,0.15)');
        ctx.fillStyle = shine;
        roundedRect(x + pad, y + pad, CELL - pad * 2, CELL - pad * 2, rad);
        ctx.fill();
        break;
      }
    }
  };

  /**
   * Draw the snake head's eyes (whites, pupils, gleam).
   * Also applies the Cyber scan-line overlay.
   * @private
   */
  const drawSnakeEyes = (x, y, tick, skin) => {
    ctx.shadowBlur = 0;
    const er     = Math.max(2, CELL * 0.11);
    const eyeDrift = (tick % 60) / 60; // subtle left/right drift

    // Whites
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x + CELL * 0.3,  y + CELL * 0.33, er, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + CELL * 0.7,  y + CELL * 0.33, er, 0, Math.PI * 2); ctx.fill();

    // Pupils (drift slightly)
    ctx.fillStyle = '#050508';
    ctx.beginPath(); ctx.arc(x + CELL * 0.3  + eyeDrift * 0.5, y + CELL * 0.35, er * 0.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + CELL * 0.7  + eyeDrift * 0.5, y + CELL * 0.35, er * 0.6, 0, Math.PI * 2); ctx.fill();

    // Gleam
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.arc(x + CELL * 0.28, y + CELL * 0.30, er * 0.25, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + CELL * 0.68, y + CELL * 0.30, er * 0.25, 0, Math.PI * 2); ctx.fill();

    // Cyber: animated scan line across head
    if (skin.effect === 'cyber') {
      const hl = ctx.createLinearGradient(x, y, x, y + CELL);
      hl.addColorStop(0,   'rgba(0,212,255,0)');
      hl.addColorStop(0.5, 'rgba(0,212,255,0.25)');
      hl.addColorStop(1,   'rgba(0,212,255,0)');
      ctx.fillStyle = hl;
      roundedRect(x + 1, y + 1, CELL - 2, CELL - 2, CELL * 0.32);
      ctx.fill();
    }
  };

  /**
   * Draw Player 2's snake (fixed red colour scheme).
   * @param {Array}  segments
   * @param {number} tick
   */
  const drawSnake2 = (segments, tick) => {
    segments.forEach((seg, i) => {
      const { c, r } = seg;
      const x      = c * CELL;
      const y      = r * CELL;
      const isHead = i === 0;
      const pad    = isHead ? 1 : 2;

      ctx.shadowBlur  = isHead ? 18 : 5;
      ctx.shadowColor = 'rgba(255,64,96,0.7)';
      ctx.fillStyle   = isHead ? '#ff4060' : '#aa2040';
      ctx.globalAlpha = isHead ? 1 : Math.max(0.4, 1 - i / segments.length * 0.5);

      roundedRect(x + pad, y + pad, CELL - pad * 2, CELL - pad * 2, CELL * 0.28);
      ctx.fill();
      ctx.globalAlpha = 1;

      if (isHead) drawSnakeEyes(x, y, tick, { effect: null });
    });
    ctx.shadowBlur = 0;
  };


  /* ─────────────────────────────────────────────
     Food drawing
     ───────────────────────────────────────────── */

  /**
   * Draw the current food item (regular circle or power-up star).
   * @param {Object} food - {col, row, isPowerup, type}
   * @param {number} tick - drives pulsing animation
   * @param {Object} skin - active skin
   */
  const drawFood = (food, tick, skin) => {
    const x     = food.col * CELL;
    const y     = food.row * CELL;
    const pulse = Math.sin(tick * 0.15) * 2.2;
    const color = food.isPowerup ? skin.pw   : skin.food;
    const glow  = food.isPowerup ? skin.glow : skin.foodGlow;

    ctx.shadowBlur  = 24 + pulse * 2;
    ctx.shadowColor = glow + '0.7)';
    ctx.fillStyle   = color;

    if (food.isPowerup) {
      drawPowerupFood(x, y, food.type, pulse);
    } else {
      drawRegularFood(x, y, pulse, skin);
    }

    ctx.shadowBlur = 0;
  };

  /** @private - Draw a star-shaped power-up food. */
  const drawPowerupFood = (x, y, type, pulse) => {
    drawStar(x + CELL / 2, y + CELL / 2, 5, CELL * 0.38 + pulse * 0.3, CELL * 0.19);

    // Inner shine
    ctx.fillStyle  = 'rgba(255,255,255,0.22)';
    ctx.shadowBlur = 0;
    drawStar(x + CELL / 2, y + CELL / 2, 5, CELL * 0.2, CELL * 0.1);

    // Type icon
    const icons = { speed: '⚡', slow: '❄', double: '✦' };
    ctx.fillStyle    = 'rgba(0,0,0,0.75)';
    ctx.font         = `bold ${Math.max(8, CELL * 0.38)}px Space Mono`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icons[type] || '?', x + CELL / 2, y + CELL / 2 + 1);
  };

  /** @private - Draw a pulsing circle for regular food. */
  const drawRegularFood = (x, y, pulse, skin) => {
    const radius = CELL * 0.3 + pulse * 0.2;

    // Outer glow ring
    ctx.beginPath();
    ctx.arc(x + CELL / 2, y + CELL / 2, radius + 3, 0, Math.PI * 2);
    ctx.fill();

    // Dark inner ring
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(x + CELL / 2, y + CELL / 2, radius - 1, 0, Math.PI * 2);
    ctx.fill();

    // Main food circle
    ctx.fillStyle   = skin.food;
    ctx.shadowBlur  = 16;
    ctx.shadowColor = skin.foodGlow + '0.9)';
    ctx.beginPath();
    ctx.arc(x + CELL / 2, y + CELL / 2, radius, 0, Math.PI * 2);
    ctx.fill();

    // Shine highlight
    ctx.fillStyle  = 'rgba(255,255,255,0.45)';
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(x + CELL * 0.38, y + CELL * 0.38, CELL * 0.1, 0, Math.PI * 2);
    ctx.fill();
  };


  /* ─────────────────────────────────────────────
     Obstacle drawing
     ───────────────────────────────────────────── */

  /**
   * Draw an 'X' obstacle at the given grid position.
   * @param {number} col
   * @param {number} row
   */
  const drawObstacle = (col, row) => {
    const x = col * CELL + 2;
    const y = row * CELL + 2;
    const s = CELL - 4;

    ctx.save();
    ctx.shadowBlur  = 10;
    ctx.shadowColor = 'rgba(255,64,96,0.6)';
    ctx.strokeStyle = '#ff4060';
    ctx.lineWidth   = Math.max(2, CELL * 0.14);
    ctx.lineCap     = 'round';

    ctx.beginPath(); ctx.moveTo(x,     y);     ctx.lineTo(x + s, y + s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + s, y);     ctx.lineTo(x,     y + s); ctx.stroke();

    // Faint border box
    ctx.strokeStyle = 'rgba(255,64,96,0.2)';
    ctx.lineWidth   = 1;
    roundedRect(col * CELL + 1, row * CELL + 1, CELL - 2, CELL - 2, 4);
    ctx.stroke();
    ctx.restore();
  };


  /* ─────────────────────────────────────────────
     Particle system
     ───────────────────────────────────────────── */

  /**
   * Spawn a burst of particles at a grid position.
   * @param {number} col
   * @param {number} row
   * @param {Object} skin  - provides colour palette
   * @param {number} count - number of particles
   */
  const spawnParticles = (col, row, skin, count = 16) => {
    const colors = [skin.food, skin.head, skin.body, '#fff'];
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 / count) * i + Math.random() * 0.4;
      const speed = 1.8 + Math.random() * 2.8;
      particles.push({
        x:     col * CELL + CELL / 2,
        y:     row * CELL + CELL / 2,
        vx:    Math.cos(angle) * speed,
        vy:    Math.sin(angle) * speed,
        life:  1,
        decay: 0.03 + Math.random() * 0.02,
        color: colors[Math.floor(Math.random() * colors.length)],
        r:     2 + Math.random() * 3.5,
        glow:  skin.foodGlow,
      });
    }
  };

  /**
   * Spawn golden combo particles (more intense for higher combos).
   * @param {number} col
   * @param {number} row
   * @param {number} combo - current combo count
   */
  const spawnComboParticles = (col, row, combo) => {
    const colors = ['#ffd700', '#ffec6e', '#fff'];
    for (let i = 0; i < combo * 3; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 3;
      particles.push({
        x: col * CELL + CELL / 2, y: row * CELL + CELL / 2,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 2,
        life: 1, decay: 0.025,
        color: colors[i % colors.length],
        r: 1.5 + Math.random() * 2,
        glow: 'rgba(255,215,0,',
      });
    }
  };

  /** Update and draw all active particles. Call each render frame. */
  const updateParticles = () => {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x   += p.vx;
      p.y   += p.vy;
      p.vy  += 0.1; // gravity
      p.life -= p.decay;

      if (p.life <= 0) { particles.splice(i, 1); continue; }

      ctx.globalAlpha = p.life;
      ctx.fillStyle   = p.color;
      ctx.shadowBlur  = 8;
      ctx.shadowColor = p.glow + '0.8)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur  = 0;
  };


  /* ─────────────────────────────────────────────
     Floating score text
     ───────────────────────────────────────────── */

  /**
   * Spawn a floating score label that drifts upward.
   * @param {number} col
   * @param {number} row
   * @param {string} text
   * @param {string} color - CSS colour
   */
  const spawnFloatText = (col, row, text, color = '#ffd700') => {
    floatingTexts.push({
      x: col * CELL + CELL / 2,
      y: row * CELL,
      text, color,
      life: 1,
      vy: -1.2,
    });
  };

  /** Update and draw all floating texts. Call each render frame. */
  const updateFloatTexts = () => {
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
      const f = floatingTexts[i];
      f.y    += f.vy;
      f.life -= 0.025;

      if (f.life <= 0) { floatingTexts.splice(i, 1); continue; }

      ctx.globalAlpha  = f.life;
      ctx.fillStyle    = f.color;
      ctx.shadowBlur   = 10;
      ctx.shadowColor  = f.color;
      ctx.font         = `bold ${Math.max(10, CELL * 0.45)}px Bebas Neue`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur  = 0;
  };


  /* ─────────────────────────────────────────────
     Screen shake
     ───────────────────────────────────────────── */

  /** Trigger a screen shake of the given magnitude. */
  const triggerShake = (magnitude = 10) => { shakeMagnitude = magnitude; };

  /** Apply one frame of screen shake (call in a loop after triggering). */
  const applyShake = () => {
    if (shakeMagnitude < 0.5) { canvas.style.transform = ''; shakeMagnitude = 0; return; }
    const dx = (Math.random() - 0.5) * shakeMagnitude * 2;
    const dy = (Math.random() - 0.5) * shakeMagnitude * 2;
    canvas.style.transform = `translate(${dx}px, ${dy}px)`;
    shakeMagnitude *= 0.72;
  };

  /** Reset shake immediately. */
  const resetShake = () => { canvas.style.transform = ''; shakeMagnitude = 0; };


  /* ─────────────────────────────────────────────
     Public API
     ───────────────────────────────────────────── */
  return {
    canvas,
    resize,
    drawGrid, drawGalaxyBackground,
    drawSnake, drawSnake2,
    drawFood, drawObstacle,
    updateParticles, spawnParticles, spawnComboParticles,
    spawnFloatText, updateFloatTexts,
    triggerShake, applyShake, resetShake,
    // Expose grid constants as read-only
    get CELL() { return CELL; },
    get COLS() { return COLS; },
    get ROWS() { return ROWS; },
  };
})();


/* ══════════════════════════════════════════════════════
   5. AI CONTROLLER
   BFS pathfinding for the AI Watch mode.
   ══════════════════════════════════════════════════════ */
const AIController = (() => {

  const DIRECTIONS = [
    { dr: -1, dc:  0, name: 'UP'    },
    { dr:  1, dc:  0, name: 'DOWN'  },
    { dr:  0, dc: -1, name: 'LEFT'  },
    { dr:  0, dc:  1, name: 'RIGHT' },
  ];

  const OPPOSITE = { UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' };

  /**
   * BFS from (startR, startC) to (targetR, targetC).
   * Returns array of direction names for the shortest path, or null.
   * @private
   */
  const bfs = (startR, startC, targetR, targetC, occupied, rows, cols) => {
    const key     = (r, c) => r * 1000 + c;
    const visited = new Set([key(startR, startC)]);
    const queue   = [{ r: startR, c: startC, path: [] }];

    while (queue.length) {
      const { r, c, path } = queue.shift();
      if (r === targetR && c === targetC) return path;

      for (const { dr, dc, name } of DIRECTIONS) {
        const nr = r + dr, nc = c + dc, k = key(nr, nc);
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        if (visited.has(k) || occupied.has(k)) continue;
        visited.add(k);
        queue.push({ r: nr, c: nc, path: [...path, name] });
      }
    }
    return null;
  };

  /**
   * Compute the next direction for the AI snake.
   * Falls back to any safe direction if BFS path is unavailable.
   *
   * @param {Array}  snake      - [{r,c}, ...]
   * @param {Object} food       - {row, col}
   * @param {Array}  obstacles  - [{row, col}, ...]
   * @param {number} rows
   * @param {number} cols
   * @param {string} currentDir - current direction string
   * @returns {string} Next direction ('UP' | 'DOWN' | 'LEFT' | 'RIGHT')
   */
  const getNextDirection = (snake, food, obstacles, rows, cols, currentDir) => {
    const head     = snake[0];
    const occupied = new Set(snake.slice(1).map(s => s.r * 1000 + s.c));
    obstacles.forEach(o => occupied.add(o.row * 1000 + o.col));

    // Try BFS to food first
    const path = bfs(head.r, head.c, food.row, food.col, occupied, rows, cols);
    if (path?.length && path[0] !== OPPOSITE[currentDir]) return path[0];

    // Fallback: pick any safe adjacent cell
    for (const { dr, dc, name } of DIRECTIONS) {
      if (name === OPPOSITE[currentDir]) continue;
      const nr = head.r + dr, nc = head.c + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      if (occupied.has(nr * 1000 + nc)) continue;
      return name;
    }

    return currentDir; // Last resort — keep going (will likely crash)
  };

  return { getNextDirection };
})();


/* ══════════════════════════════════════════════════════
   6. GAME ENGINE
   Core game loop: movement, collision, scoring, combo,
   power-ups, level progression.
   ══════════════════════════════════════════════════════ */
const GameEngine = (() => {

  // --- Snake state ---
  let snake1,  snake2;
  let dir1,    dir2;
  let nextDir1, nextDir2;

  // --- Game world ---
  let food, obstacles, activePowerups;

  // --- Progress ---
  let score1, score2, level, tick, foodEaten;
  let combo, bestCombo, lastEatTime;

  // --- Control flags ---
  let paused, running, gameOver;
  let currentMode, currentDifficulty;

  // --- Timing ---
  let intervalId, tickSpeed;
  let comboResetTimer;
  let shakeIntervalId;


  /* ─────────────────────────────────────────────
     Initialisation
     ───────────────────────────────────────────── */

  /**
   * Reset all game state and start a fresh game.
   * @param {Object} [opts] - optional {mode, difficulty} overrides
   */
  const init = (opts = {}) => {
    currentMode       = opts.mode       || StateManager.get('mode');
    currentDifficulty = opts.difficulty || StateManager.get('difficulty');

    const { cols, rows } = Config.GRID;
    const midRow = Math.floor(rows / 2);
    const midCol = Math.floor(cols / 2);

    // Place snakes symmetrically in the centre
    snake1   = [{ r: midRow, c: midCol + 1 }, { r: midRow, c: midCol + 2 }, { r: midRow, c: midCol + 3 }];
    snake2   = [{ r: midRow + 2, c: midCol - 1 }, { r: midRow + 2, c: midCol - 2 }, { r: midRow + 2, c: midCol - 3 }];
    dir1     = 'LEFT';  nextDir1 = 'LEFT';
    dir2     = 'RIGHT'; nextDir2 = 'RIGHT';

    score1 = 0; score2 = 0;
    level  = 1; tick   = 0; foodEaten = 0;
    combo  = 1; bestCombo = 1; lastEatTime = 0;

    paused = false; running = true; gameOver = false;

    activePowerups = { speed: null, slow: null, double: null };
    obstacles      = [];
    tickSpeed      = StateManager.getDiff().baseSpeed;

    Renderer.resetShake();
    spawnFood();
    if (currentMode === 'obstacles') spawnObstacles(3);

    refreshHUD();
  };


  /* ─────────────────────────────────────────────
     Spawn helpers
     ───────────────────────────────────────────── */

  /** Build a Set of all currently occupied cells (as 'r,c' strings). */
  const getOccupiedCells = () => {
    const cells = new Set();
    snake1.forEach(s => cells.add(`${s.r},${s.c}`));
    if (currentMode === '2player') snake2.forEach(s => cells.add(`${s.r},${s.c}`));
    obstacles.forEach(o => cells.add(`${o.row},${o.col}`));
    return cells;
  };

  /** Find a random unoccupied grid cell. */
  const randomFreeCell = () => {
    const occupied = getOccupiedCells();
    const { cols, rows } = Config.GRID;
    let attempts = 0, r, c;
    do {
      r = Math.floor(Math.random() * rows);
      c = Math.floor(Math.random() * cols);
      attempts++;
    } while (occupied.has(`${r},${c}`) && attempts < 600);
    return { row: r, col: c };
  };

  /** Spawn the food item (regular or power-up based on chance). */
  const spawnFood = () => {
    const isPowerup = tick > 0 && Math.random() < 0.22;
    const cell      = randomFreeCell();
    const type      = isPowerup
      ? Config.POWERUP_TYPES[Math.floor(Math.random() * Config.POWERUP_TYPES.length)]
      : null;
    food = { ...cell, isPowerup, type };
  };

  /**
   * Spawn n random obstacle cells.
   * @param {number} n
   */
  const spawnObstacles = (n) => {
    for (let i = 0; i < n; i++) {
      const cell = randomFreeCell();
      obstacles.push({ row: cell.row, col: cell.col });
    }
  };


  /* ─────────────────────────────────────────────
     Speed calculation
     ───────────────────────────────────────────── */

  /** Recalculate tickSpeed from difficulty, level, and active power-ups, then restart interval. */
  const recalcSpeed = () => {
    const diff = StateManager.getDiff();
    let s = diff.baseSpeed - (level - 1) * diff.speedStep;
    s = Math.max(s, 42);
    if (activePowerups.speed) s = Math.max(s * 0.58, 28);
    if (activePowerups.slow)  s = Math.min(s * 1.75, 260);
    tickSpeed = s;
    restartInterval();
  };


  /* ─────────────────────────────────────────────
     Power-ups
     ───────────────────────────────────────────── */

  /**
   * Activate a power-up, scheduling its expiry.
   * @param {string} type - 'speed' | 'slow' | 'double'
   */
  const applyPowerup = (type) => {
    AudioEngine.play('powerup');

    // Clear existing timer for this type
    if (activePowerups[type]) clearTimeout(activePowerups[type].timer);

    const timer = setTimeout(() => {
      activePowerups[type] = null;
      recalcSpeed();
      UIController.updatePowerupBar(activePowerups);
    }, Config.POWERUP_DURATION);

    activePowerups[type] = { timer, expiresAt: Date.now() + Config.POWERUP_DURATION };
    UIController.updatePowerupBar(activePowerups);
    recalcSpeed();
  };


  /* ─────────────────────────────────────────────
     Collision helpers
     ───────────────────────────────────────────── */

  /** Returns the new head position after moving in direction d. */
  const moveHead = (head, d) => ({
    r: head.r + (d === 'DOWN' ? 1 : d === 'UP' ? -1 : 0),
    c: head.c + (d === 'RIGHT' ? 1 : d === 'LEFT' ? -1 : 0),
  });

  const hitsWall     = (h) => h.r < 0 || h.r >= Renderer.ROWS || h.c < 0 || h.c >= Renderer.COLS;
  const hitsSelf     = (h, sn) => sn.some(s => s.r === h.r && s.c === h.c);
  const hitsObstacle = (h) => obstacles.some(o => o.row === h.r && o.col === h.c);


  /* ─────────────────────────────────────────────
     Combo system
     ───────────────────────────────────────────── */

  /**
   * Update the combo counter when food is eaten.
   * Resets if too much time has passed since last eat.
   * @param {number} foodCol - column where food was
   * @param {number} foodRow
   */
  const updateCombo = (foodCol, foodRow) => {
    clearTimeout(comboResetTimer);
    const now = Date.now();

    if (lastEatTime > 0 && (now - lastEatTime) < Config.COMBO_WINDOW) {
      combo = Math.min(combo + 1, Config.MAX_COMBO);
    } else {
      combo = 1;
    }

    lastEatTime = now;
    bestCombo   = Math.max(bestCombo, combo);

    // Schedule combo reset
    comboResetTimer = setTimeout(() => {
      combo = 1;
      UIController.updateComboHud(1, false);
      refreshHUD();
    }, Config.COMBO_WINDOW);

    // Show combo UI and spawn particles
    if (combo >= 2) {
      AudioEngine.play(combo >= 5 ? 'comboMax' : 'combo');
      UIController.updateComboHud(combo, true);
      Renderer.spawnComboParticles(foodCol, foodRow, combo);
    } else {
      UIController.updateComboHud(1, false);
    }
  };


  /* ─────────────────────────────────────────────
     Main game step
     ───────────────────────────────────────────── */

  /** One tick of the game loop. Called by setInterval. */
  const step = () => {
    if (paused || !running || gameOver) return;
    tick++;

    // Commit queued direction
    dir1 = nextDir1;
    if (currentMode === '2player') dir2 = nextDir2;

    // AI overrides P1 direction
    if (currentMode === 'ai') {
      dir1 = nextDir1 = AIController.getNextDirection(
        snake1.map(s => ({ r: s.r, c: s.c })),
        food, obstacles,
        Renderer.ROWS, Renderer.COLS,
        dir1
      );
    }

    const newHead1 = moveHead(snake1[0], dir1);
    const newHead2 = currentMode === '2player' ? moveHead(snake2[0], dir2) : null;

    // --- Collision detection P1 ---
    if (hitsWall(newHead1) || hitsSelf(newHead1, snake1) || hitsObstacle(newHead1)) {
      return endGame(1);
    }

    // --- Collision detection P2 (if active) ---
    if (currentMode === '2player') {
      if (hitsWall(newHead2) || hitsSelf(newHead2, snake2) || hitsObstacle(newHead2)) return endGame(2);
      if (newHead1.r === newHead2.r && newHead1.c === newHead2.c)                      return endGame(0); // simultaneous
      if (snake2.some(s => s.r === newHead1.r && s.c === newHead1.c))                 return endGame(1);
      if (snake1.some(s => s.r === newHead2.r && s.c === newHead2.c))                 return endGame(2);
    }

    // --- Move P1 ---
    snake1.unshift(newHead1);
    const p1AteFood = newHead1.r === food.row && newHead1.c === food.col;

    if (p1AteFood) {
      handleFoodEaten();
    } else {
      snake1.pop(); // No growth — remove tail
    }

    // --- Move P2 ---
    if (currentMode === '2player') {
      snake2.unshift(newHead2);
      const p2AteFood = newHead2.r === food.row && newHead2.c === food.col;
      if (p2AteFood) {
        score2 += 10 * level;
        AudioEngine.play('eat');
        spawnFood();
      } else {
        snake2.pop();
      }
    }

    refreshHUD();
    renderFrame();
  };

  /**
   * Handle all side-effects of P1 eating food.
   * @private
   */
  const handleFoodEaten = () => {
    foodEaten++;
    updateCombo(food.col, food.row);

    const multiplier = activePowerups.double ? 2 : 1;
    const skin       = StateManager.getActiveSkin();
    const points     = Math.round(10 * level * StateManager.getDiff().pointMult * multiplier * combo);
    score1 += points;

    // Escalating eat sounds by combo tier
    AudioEngine.play(combo >= 4 ? 'eat3' : combo >= 2 ? 'eat2' : 'eat');

    // Particles and floating score
    Renderer.spawnParticles(food.col, food.row, skin, combo >= 3 ? 24 : 16);
    Renderer.spawnFloatText(
      food.col, food.row,
      combo >= 2 ? `${points} ×${combo}!` : `+${points}`,
      combo >= 2 ? '#ffd700' : skin.food
    );

    // Haptic feedback on supported mobile devices
    if (navigator.vibrate) navigator.vibrate(combo >= 3 ? [30, 10, 30] : 20);

    if (food.isPowerup) applyPowerup(food.type);

    spawnFood();

    // Level up every 5 foods
    if (snake1.length % 5 === 0) levelUp();

    // Extra obstacle in obstacle mode every 3 foods
    if (currentMode === 'obstacles' && snake1.length % 3 === 0) spawnObstacles(1);
  };


  /* ─────────────────────────────────────────────
     Level progression
     ───────────────────────────────────────────── */

  const levelUp = () => {
    level++;
    AudioEngine.play('levelup');
    recalcSpeed();
    UIController.flashLevel();

    // Inject a CSS flash element over the canvas
    const flash = document.createElement('div');
    flash.className = 'levelup-flash';
    document.getElementById('canvasWrap').appendChild(flash);
    setTimeout(() => flash.remove(), 650);
  };


  /* ─────────────────────────────────────────────
     Game Over
     ───────────────────────────────────────────── */

  /**
   * End the game.
   * @param {number} loser - 0 = draw, 1 = P1 lost, 2 = P2 lost
   */
  const endGame = (loser) => {
    gameOver = true;
    running  = false;
    clearInterval(intervalId);
    clearTimeout(comboResetTimer);
    Object.values(activePowerups).forEach(p => p && clearTimeout(p.timer));

    AudioEngine.play('gameover');
    Renderer.triggerShake(12);

    // Run shake animation for ~600ms
    let shakeFrames = 0;
    shakeIntervalId = setInterval(() => {
      Renderer.applyShake();
      if (++shakeFrames > 15) {
        clearInterval(shakeIntervalId);
        Renderer.resetShake();
      }
    }, 40);

    // Record score and check for unlocks, then show game over screen
    const isNewRecord = StateManager.addScore(
      score1, currentDifficulty, currentMode,
      snake1.length, level, bestCombo, foodEaten
    );
    const unlockedSkin = StateManager.checkSkinUnlock(StateManager.get('highScore'));

    setTimeout(() => {
      UIController.showGameOver({
        score: score1, score2,
        snakeLength: snake1.length,
        level, mode: currentMode, loser,
        isNewRecord, unlockedSkin, bestCombo, foodEaten,
      });
    }, 750);
  };


  /* ─────────────────────────────────────────────
     Render
     ───────────────────────────────────────────── */

  /** Render one complete frame to the canvas. */
  const renderFrame = () => {
    const skin = StateManager.getActiveSkin();

    Renderer.drawGrid(skin);
    if (skin.effect === 'galaxy') Renderer.drawGalaxyBackground(tick);

    obstacles.forEach(o => Renderer.drawObstacle(o.col, o.row));
    Renderer.drawFood(food, tick, skin);
    Renderer.drawSnake(snake1, skin, tick, !!activePowerups.speed);
    if (currentMode === '2player') Renderer.drawSnake2(snake2, tick);

    Renderer.updateParticles();
    Renderer.updateFloatTexts();
  };


  /* ─────────────────────────────────────────────
     HUD refresh
     ───────────────────────────────────────────── */

  const refreshHUD = () => {
    document.getElementById('hudScore').textContent  = score1;
    document.getElementById('hudHigh').textContent   = StateManager.get('highScore');
    document.getElementById('hudLength').textContent = snake1.length;
    document.getElementById('hudLevel').textContent  = `LVL ${level}`;
    document.getElementById('hudMode').textContent   = currentMode.toUpperCase();

    const comboEl = document.getElementById('hudCombo');
    comboEl.textContent = combo > 1 ? `×${combo}` : '×1';
    comboEl.style.color = combo >= 4 ? '#ff4060' : combo >= 2 ? '#ffd700' : 'var(--accent)';
  };


  /* ─────────────────────────────────────────────
     Interval management
     ───────────────────────────────────────────── */

  const restartInterval = () => {
    clearInterval(intervalId);
    intervalId = setInterval(step, tickSpeed);
  };


  /* ─────────────────────────────────────────────
     Direction input
     ───────────────────────────────────────────── */

  const OPPOSITE_DIR = { UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' };

  /** Queue a direction change for P1 (ignores 180° reversals). */
  const setDirection1 = (d) => { if (d !== OPPOSITE_DIR[dir1]) nextDir1 = d; };

  /** Queue a direction change for P2. */
  const setDirection2 = (d) => { if (d !== OPPOSITE_DIR[dir2]) nextDir2 = d; };


  /* ─────────────────────────────────────────────
     Public API
     ───────────────────────────────────────────── */

  /** Full start: resize canvas, init state, begin loop, render first frame. */
  const start = () => {
    Renderer.resize();
    init();
    restartInterval();
    renderFrame();
  };

  /** Toggle pause. Returns the new paused state. */
  const pause = () => {
    paused = !paused;
    if (paused) clearInterval(intervalId);
    else        restartInterval();
    return paused;
  };

  /** Directly set paused state (used when navigating to menu mid-game). */
  const setPaused = (value) => {
    paused = value;
    if (paused) clearInterval(intervalId);
    else        restartInterval();
  };

  return {
    start, pause, setPaused,
    setDir:  setDirection1,
    setDir2: setDirection2,
    get running() { return running; },
    get score()   { return score1;  },
  };
})();


/* ══════════════════════════════════════════════════════
   7. UI CONTROLLER
   Manages screen transitions, HUD updates, skin grid,
   leaderboard rendering, and theme / sound toggles.
   ══════════════════════════════════════════════════════ */
const UIController = (() => {

  // Cache screen elements
  const SCREENS = {
    menu:        document.getElementById('screen-menu'),
    game:        document.getElementById('screen-game'),
    gameover:    document.getElementById('screen-gameover'),
    leaderboard: document.getElementById('screen-leaderboard'),
  };


  /* ─────────────────────────────────────────────
     Screen transitions
     ───────────────────────────────────────────── */

  /**
   * Show a named screen and hide all others.
   * @param {string} name - key in SCREENS
   */
  const showScreen = (name) => {
    Object.entries(SCREENS).forEach(([key, el]) => {
      el.classList.toggle('active', key === name);
    });
  };


  /* ─────────────────────────────────────────────
     Menu hydration
     ───────────────────────────────────────────── */

  /** Populate the menu with current saved state. */
  const hydrateMenu = () => {
    document.getElementById('menuHighScore').textContent   = StateManager.get('highScore');
    document.getElementById('menuGamesPlayed').textContent = StateManager.get('gamesPlayed');
    document.getElementById('menuBestCombo').textContent   = `${StateManager.get('bestCombo')}x`;

    syncButtonGroup('difficultyGroup', StateManager.get('difficulty'));
    syncButtonGroup('modeGroup',       StateManager.get('mode'));

    document.getElementById('themeCheck').checked = StateManager.get('theme') === 'light';
    document.getElementById('soundCheck').checked = StateManager.get('soundOn');

    applyTheme(StateManager.get('theme'));
    updateSoundIcon();
    buildSkinGrid();
    updateLogoColors(StateManager.getActiveSkin());
  };

  /**
   * Mark the active button in a choice button group.
   * @param {string} groupId - element ID of the container
   * @param {string} value   - data-value to mark active
   */
  const syncButtonGroup = (groupId, value) => {
    document.getElementById(groupId).querySelectorAll('.btn-choice').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === value);
    });
  };


  /* ─────────────────────────────────────────────
     Skin picker
     ───────────────────────────────────────────── */

  /** Build (or rebuild) the skin selection grid. */
  const buildSkinGrid = () => {
    const grid        = document.getElementById('skinGrid');
    const currentSkin = StateManager.get('skin');
    grid.innerHTML    = '';

    StateManager.SKINS.forEach(skin => {
      const unlocked = StateManager.isUnlocked(skin.id);
      const isActive = skin.id === currentSkin;

      const card = document.createElement('div');
      card.className    = `skin-card${isActive ? ' active' : ''}${!unlocked ? ' locked' : ''}`;
      card.dataset.skin = skin.id;
      if (!unlocked) card.title = `Score ${skin.threshold}+ to unlock`;

      // Mini canvas preview
      card.appendChild(buildSkinPreview(skin));

      // Label
      const label       = document.createElement('span');
      label.className   = 'skin-label';
      label.textContent = skin.label;
      card.appendChild(label);

      // Lock icon or effect badge
      if (!unlocked) {
        const lock       = document.createElement('span');
        lock.className   = 'skin-lock';
        lock.textContent = '🔒';
        card.appendChild(lock);
      } else if (skin.id !== 'default') {
        const badge             = document.createElement('div');
        badge.style.cssText     = `font-size:8px;color:${skin.head};font-family:monospace;opacity:.7`;
        badge.textContent       = '✦';
        card.appendChild(badge);
      }

      if (unlocked) {
        card.addEventListener('click', () => onSkinSelect(skin, card, grid));
      }

      grid.appendChild(card);
    });

    updateSkinHint();
  };

  /**
   * Draw a 32×32 mini snake-head preview canvas for a skin.
   * @param {Object} skin
   * @returns {HTMLCanvasElement}
   * @private
   */
  const buildSkinPreview = (skin) => {
    const previewCanvas        = document.createElement('canvas');
    previewCanvas.width        = 32;
    previewCanvas.height       = 32;
    previewCanvas.style.cssText = 'border-radius:50%;width:32px;height:32px;flex-shrink:0;';

    const pc = previewCanvas.getContext('2d');
    // Background
    pc.fillStyle = skin.bg; pc.fillRect(0, 0, 32, 32);
    // Head
    pc.fillStyle   = skin.head;
    pc.shadowBlur  = 8;
    pc.shadowColor = skin.glow + '0.8)';
    pc.beginPath(); pc.roundRect(3, 3, 26, 26, 8); pc.fill();
    pc.shadowBlur = 0;
    // Eyes
    pc.fillStyle = '#fff';
    pc.beginPath(); pc.arc(11, 13, 3,   0, Math.PI * 2); pc.fill();
    pc.beginPath(); pc.arc(21, 13, 3,   0, Math.PI * 2); pc.fill();
    pc.fillStyle = '#050508';
    pc.beginPath(); pc.arc(12, 14, 1.8, 0, Math.PI * 2); pc.fill();
    pc.beginPath(); pc.arc(22, 14, 1.8, 0, Math.PI * 2); pc.fill();
    // Body stripe
    pc.fillStyle = skin.body;
    pc.beginPath(); pc.roundRect(6, 19, 20, 8, 4); pc.fill();

    return previewCanvas;
  };

  /**
   * Handle skin card click.
   * @private
   */
  const onSkinSelect = (skin, card, grid) => {
    AudioEngine.init();
    AudioEngine.play('click');
    StateManager.set('skin', skin.id);

    grid.querySelectorAll('.skin-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');

    updateLogoColors(skin);
    updateSkinHint();
  };

  /** Update the skin unlock hint text. */
  const updateSkinHint = () => {
    const next = StateManager.getNextLocked();
    document.getElementById('skinUnlockHint').textContent = next
      ? `— Next: ${next.label} @ ${next.threshold} pts`
      : '— All unlocked! 🎉';
  };


  /* ─────────────────────────────────────────────
     Logo colour (reacts to selected skin)
     ───────────────────────────────────────────── */

  /**
   * Update the menu logo eye and title to match a skin's colour.
   * @param {Object} skin
   */
  const updateLogoColors = (skin) => {
    const eye   = document.querySelector('.logo-eye');
    const title = document.querySelector('.logo-title');

    eye.style.background = `radial-gradient(circle at 40% 40%, ${skin.head}, transparent 70%)`;
    eye.style.borderColor = skin.head;
    eye.style.boxShadow   = `0 0 16px ${skin.glow}0.5), 0 0 48px ${skin.glow}0.18)`;

    title.style.color      = skin.head;
    title.style.textShadow = `0 0 16px ${skin.glow}0.5), 0 0 50px ${skin.glow}0.18)`;
  };


  /* ─────────────────────────────────────────────
     Game Over screen
     ───────────────────────────────────────────── */

  /**
   * Populate and show the Game Over screen.
   * @param {Object} results
   */
  const showGameOver = ({ score, score2, snakeLength, level, mode, loser, isNewRecord, unlockedSkin, bestCombo, foodEaten }) => {
    document.getElementById('resultScore').textContent  = score;
    document.getElementById('resultHigh').textContent   = StateManager.get('highScore');
    document.getElementById('resultLength').textContent = snakeLength;
    document.getElementById('resultLevel').textContent  = level;
    document.getElementById('resultCombo').textContent  = `×${bestCombo}`;
    document.getElementById('resultFood').textContent   = foodEaten;

    const icon  = document.getElementById('gameoverIcon');
    const title = document.getElementById('gameoverTitle');

    if (mode === '2player') {
      if      (loser === 0) { icon.textContent = '🤝'; title.textContent = 'DRAW!';    title.style.color = 'var(--accent2)'; }
      else if (loser === 1) { icon.textContent = '🏆'; title.textContent = 'P2 WINS!'; title.style.color = 'var(--gold)'; }
      else                  { icon.textContent = '🏆'; title.textContent = 'P1 WINS!'; title.style.color = 'var(--accent)'; }
    } else {
      icon.textContent  = '💀';
      title.textContent = 'GAME OVER';
      title.style.color = 'var(--accent3)';
    }

    // Show/hide conditional elements using the HTML `hidden` attribute
    document.getElementById('newRecord').hidden = !isNewRecord;

    const unlockEl = document.getElementById('unlockNotif');
    if (unlockedSkin) {
      unlockEl.hidden = false;
      document.getElementById('unlockName').textContent = unlockedSkin.label;
    } else {
      unlockEl.hidden = true;
    }

    showScreen('gameover');
  };


  /* ─────────────────────────────────────────────
     In-game UI updates
     ───────────────────────────────────────────── */

  /**
   * Update the combo popup in the HUD center.
   * @param {number}  combo  - current combo count
   * @param {boolean} active - whether to show the popup
   */
  const updateComboHud = (combo, active) => {
    const el     = document.getElementById('comboHud');
    const flames = ['', '🔥', '🔥🔥', '⚡', '💥', '💥💥', '🌟', '☄️', '🌌'];
    el.textContent = `COMBO ×${combo} ${flames[Math.min(combo, 8)]}`;
    el.classList.toggle('visible', active && combo >= 2);

    if (active && combo >= 2) {
      // Retrigger bounce animation
      el.classList.remove('boom');
      void el.offsetWidth; // reflow
      el.classList.add('boom');
    }

    // Flash score display on high combos
    if (active && combo >= 3) {
      const scoreEl = document.getElementById('hudScore');
      scoreEl.style.color     = '#ffd700';
      scoreEl.style.transform = 'scale(1.2)';
      setTimeout(() => { scoreEl.style.color = ''; scoreEl.style.transform = ''; }, 300);
    }
  };

  /**
   * Re-render the power-up indicator pills.
   * @param {Object} activePowerups - {speed, slow, double} each null or {timer, expiresAt}
   */
  const updatePowerupBar = (activePowerups) => {
    const bar   = document.getElementById('powerupBar');
    const icons = { speed: '⚡ BOOST', slow: '❄ SLOW-MO', double: '✦ 2X' };
    bar.innerHTML = '';

    Object.entries(activePowerups).forEach(([type, data]) => {
      if (!data) return;
      const remaining = Math.max(0, data.expiresAt - Date.now());

      const pill          = document.createElement('div');
      pill.className      = `powerup-pill ${type}`;
      pill.innerHTML      = `
        ${icons[type]}
        <div class="timer-track">
          <div class="timer-fill" style="animation-duration:${remaining}ms"></div>
        </div>
      `;
      bar.appendChild(pill);
    });
  };

  /** Animate the level badge in the HUD. */
  const flashLevel = () => {
    const el = document.getElementById('hudLevel');
    el.style.transform  = 'scale(1.7)';
    el.style.color      = 'var(--gold)';
    el.style.textShadow = 'var(--glow-gold)';
    setTimeout(() => {
      el.style.transform  = '';
      el.style.color      = '';
      el.style.textShadow = '';
    }, 500);
  };


  /* ─────────────────────────────────────────────
     Theme & Sound
     ───────────────────────────────────────────── */

  /**
   * Apply a theme to the document root.
   * @param {string} theme - 'dark' | 'light'
   */
  const applyTheme = (theme) => {
    document.documentElement.dataset.theme = theme;
    StateManager.set('theme', theme);
  };

  /** Sync the in-game sound button icon with current sound state. */
  const updateSoundIcon = () => {
    document.getElementById('btnSoundGame').textContent =
      StateManager.get('soundOn') ? '🔊' : '🔇';
  };


  /* ─────────────────────────────────────────────
     Leaderboard
     ───────────────────────────────────────────── */

  /**
   * Render leaderboard entries for the given filter.
   * @param {string} filter - 'all' | 'easy' | 'medium' | 'hard'
   */
  const renderLeaderboard = (filter = 'all') => {
    const list    = document.getElementById('lbList');
    const entries = StateManager.getLeaderboard(filter);

    if (!entries.length) {
      list.innerHTML = '<p class="lb-empty">No records yet. Play to get on the board!</p>';
      return;
    }

    list.innerHTML = entries.map((entry, index) => `
      <div class="lb-entry">
        <span class="lb-rank">${index + 1}</span>
        <div class="lb-entry-info">
          <span class="lb-entry-score">${entry.score}</span>
          <span class="lb-entry-meta">
            LEN ${entry.length || 0} ·
            LVL ${entry.level  || 1} ·
            COMBO ×${entry.bestCombo || 1} ·
            ${new Date(entry.date).toLocaleDateString()}
          </span>
        </div>
        <span class="lb-entry-badge ${entry.difficulty}">${entry.difficulty}</span>
      </div>
    `).join('');
  };


  /* ─────────────────────────────────────────────
     Background menu snake decoration
     ───────────────────────────────────────────── */

  /** Build the decorative snake path visible behind the main menu. */
  const initMenuSnake = () => {
    const container = document.getElementById('menuSnakeAnim');
    container.innerHTML = '';

    const segSize = 28;
    const cols    = Math.floor(window.innerWidth  / segSize);
    const rows    = Math.floor(window.innerHeight / segSize);
    const skin    = StateManager.getActiveSkin();

    // Build a simple snake path that zigzags across the screen
    let row = Math.floor(rows * 0.1), col = 0;
    const path = [];
    while (col < cols - 1) path.push({ row, col: col++ });
    row += 3;
    while (col > 1)         path.push({ row, col: col-- });
    row += 3;
    while (col < cols - 1)  path.push({ row, col: col++ });

    path.forEach((p, i) => {
      const dot = document.createElement('div');
      dot.style.cssText = [
        'position:absolute',
        `width:${segSize - 5}px`,
        `height:${segSize - 5}px`,
        `left:${p.col * segSize + 2}px`,
        `top:${p.row * segSize + 2}px`,
        `background:${i === 0 ? skin.head : skin.body}`,
        `border-radius:${i === 0 ? '50%' : '5px'}`,
        `border:1px solid ${i === 0 ? skin.head : skin.body}`,
        `opacity:${i === 0 ? 0.5 : 0.08}`,
        'transition:opacity .3s',
      ].join(';');
      container.appendChild(dot);
    });
  };


  /* ─────────────────────────────────────────────
     Public API
     ───────────────────────────────────────────── */
  return {
    showScreen, hydrateMenu,
    showGameOver, updateComboHud, updatePowerupBar, flashLevel,
    applyTheme, updateSoundIcon,
    renderLeaderboard, initMenuSnake,
  };
})();


/* ══════════════════════════════════════════════════════
   8. INPUT HANDLER
   Captures keyboard, touch swipe, and D-pad button events.
   ══════════════════════════════════════════════════════ */
const InputHandler = (() => {

  // Key → direction maps
  const KEY_MAP_P1 = {
    ArrowUp: 'UP',    w: 'UP',    W: 'UP',
    ArrowDown: 'DOWN', s: 'DOWN',  S: 'DOWN',
    ArrowLeft: 'LEFT', a: 'LEFT',  A: 'LEFT',
    ArrowRight: 'RIGHT', d: 'RIGHT', D: 'RIGHT',
  };

  const KEY_MAP_P2 = {
    i: 'UP',    I: 'UP',
    k: 'DOWN',  K: 'DOWN',
    j: 'LEFT',  J: 'LEFT',
    l: 'RIGHT', L: 'RIGHT',
  };

  // Touch state
  let touchStartX = 0;
  let touchStartY = 0;


  /** Attach keyboard listener. */
  const initKeyboard = () => {
    document.addEventListener('keydown', (e) => {
      if (KEY_MAP_P1[e.key]) {
        e.preventDefault();
        GameEngine.setDir(KEY_MAP_P1[e.key]);
        return;
      }
      if (KEY_MAP_P2[e.key]) {
        GameEngine.setDir2(KEY_MAP_P2[e.key]);
        return;
      }
      // Pause shortcut
      if ((e.key === 'p' || e.key === 'P' || e.key === 'Escape') && GameEngine.running) {
        // Dispatch to Bootstrap handler via custom event so InputHandler stays decoupled
        document.dispatchEvent(new CustomEvent('game:togglePause'));
      }
      // Restart shortcut (only on game over)
      if ((e.key === 'r' || e.key === 'R') && !GameEngine.running) {
        document.dispatchEvent(new CustomEvent('game:restart'));
      }
    });
  };

  /** Attach swipe-to-control on the game canvas. */
  const initTouchSwipe = () => {
    const canvas = Renderer.canvas;

    canvas.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      e.preventDefault();
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;

      if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return; // tap, not swipe

      if (Math.abs(dx) > Math.abs(dy)) {
        GameEngine.setDir(dx > 0 ? 'RIGHT' : 'LEFT');
      } else {
        GameEngine.setDir(dy > 0 ? 'DOWN' : 'UP');
      }
      e.preventDefault();
    }, { passive: false });
  };

  /** Attach D-pad button events (supports both touch and mouse). */
  const initDpad = () => {
    document.querySelectorAll('[data-dir]').forEach(btn => {
      btn.addEventListener('touchstart', (e) => {
        GameEngine.setDir(btn.dataset.dir);
        e.preventDefault();
      }, { passive: false });
      btn.addEventListener('mousedown', () => GameEngine.setDir(btn.dataset.dir));
    });

    document.querySelectorAll('[data-dir2]').forEach(btn => {
      btn.addEventListener('touchstart', (e) => {
        GameEngine.setDir2(btn.dataset.dir2);
        e.preventDefault();
      }, { passive: false });
      btn.addEventListener('mousedown', () => GameEngine.setDir2(btn.dataset.dir2));
    });
  };

  /** Initialise all input listeners. */
  const init = () => {
    initKeyboard();
    initTouchSwipe();
    initDpad();
  };

  return { init };
})();


/* ══════════════════════════════════════════════════════
   9. BOOTSTRAP
   Wires all modules together after the DOM is ready.
   Handles button bindings and top-level flow control.
   ══════════════════════════════════════════════════════ */
(function bootstrap() {

  let currentLeaderboardFilter = 'all';


  /* ─────────────────────────────────────────────
     Core flow helpers
     ───────────────────────────────────────────── */

  const handlePause = () => {
    AudioEngine.play('click');
    const isPaused = GameEngine.pause();
    document.getElementById('pauseOverlay').hidden = !isPaused;
  };

  /**
   * Show a countdown overlay (3, 2, 1, 0 = GO), then fire callback.
   * @param {number}   from - starting number
   * @param {Function} cb   - called when countdown finishes
   */
  const showCountdown = (from, cb) => {
    const overlay = document.getElementById('countdownOverlay');
    const numEl   = document.getElementById('countdownNum');
    overlay.hidden = false;

    let n = from;

    const tick = () => {
      numEl.textContent = n;
      // Retrigger CSS animation
      numEl.style.animation = 'none';
      void numEl.offsetWidth; // reflow
      numEl.style.animation = 'countPop 0.6s cubic-bezier(0.34,1.56,0.64,1)';

      if (n === 0) {
        overlay.hidden = true;
        cb();
        return;
      }
      n--;
      setTimeout(tick, 750);
    };

    tick();
  };

  const startGame = () => {
    AudioEngine.init();
    AudioEngine.play('click');
    UIController.showScreen('game');

    const is2Player = StateManager.get('mode') === '2player';
    document.getElementById('dpad2P').hidden         = !is2Player;
    document.getElementById('mobileControls').style.display = 'flex';

    showCountdown(3, () => GameEngine.start());
  };

  const restartGame = () => {
    AudioEngine.play('click');
    document.getElementById('pauseOverlay').hidden = true;
    GameEngine.setPaused(false);
    UIController.showScreen('game');
    showCountdown(3, () => GameEngine.start());
  };

  const returnToMenu = () => {
    AudioEngine.play('click');
    GameEngine.setPaused(true);
    document.getElementById('pauseOverlay').hidden = true;
    UIController.showScreen('menu');
    UIController.hydrateMenu();
  };


  /* ─────────────────────────────────────────────
     Keyboard shortcut bridge (from InputHandler)
     ───────────────────────────────────────────── */
  document.addEventListener('game:togglePause', handlePause);
  document.addEventListener('game:restart',     restartGame);


  /* ─────────────────────────────────────────────
     Menu screen bindings
     ───────────────────────────────────────────── */

  // Difficulty selector
  document.getElementById('difficultyGroup').addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-choice');
    if (!btn) return;
    AudioEngine.init();
    AudioEngine.play('click');
    StateManager.set('difficulty', btn.dataset.value);
    document.querySelectorAll('#difficultyGroup .btn-choice').forEach(b => {
      b.classList.toggle('active', b === btn);
    });
  });

  // Mode selector
  document.getElementById('modeGroup').addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-choice');
    if (!btn) return;
    AudioEngine.init();
    AudioEngine.play('click');
    StateManager.set('mode', btn.dataset.value);
    document.querySelectorAll('#modeGroup .btn-choice').forEach(b => {
      b.classList.toggle('active', b === btn);
    });
  });

  // Theme toggle
  document.getElementById('themeCheck').addEventListener('change', (e) => {
    AudioEngine.init();
    UIController.applyTheme(e.target.checked ? 'light' : 'dark');
  });

  // Sound toggle
  document.getElementById('soundCheck').addEventListener('change', (e) => {
    AudioEngine.init();
    StateManager.set('soundOn', e.target.checked);
    UIController.updateSoundIcon();
  });

  document.getElementById('btnStart').addEventListener('click', startGame);

  document.getElementById('btnLeaderboard').addEventListener('click', () => {
    AudioEngine.init();
    AudioEngine.play('click');
    currentLeaderboardFilter = 'all';
    UIController.renderLeaderboard('all');
    UIController.showScreen('leaderboard');
  });


  /* ─────────────────────────────────────────────
     Game screen bindings
     ───────────────────────────────────────────── */

  document.getElementById('btnPause').addEventListener('click',        handlePause);
  document.getElementById('btnRestart').addEventListener('click',      restartGame);
  document.getElementById('btnMenuFromGame').addEventListener('click', returnToMenu);

  document.getElementById('btnResume').addEventListener('click', handlePause);

  document.getElementById('btnMenuFromPause').addEventListener('click', () => {
    AudioEngine.play('click');
    GameEngine.setPaused(false);
    document.getElementById('pauseOverlay').hidden = true;
    UIController.showScreen('menu');
    UIController.hydrateMenu();
  });

  document.getElementById('btnSoundGame').addEventListener('click', () => {
    AudioEngine.init();
    const isOn = !StateManager.get('soundOn');
    StateManager.set('soundOn', isOn);
    UIController.updateSoundIcon();
    document.getElementById('soundCheck').checked = isOn;
  });


  /* ─────────────────────────────────────────────
     Game over screen bindings
     ───────────────────────────────────────────── */

  document.getElementById('btnPlayAgain').addEventListener('click', restartGame);

  document.getElementById('btnMenuFromGameover').addEventListener('click', () => {
    AudioEngine.play('click');
    UIController.showScreen('menu');
    UIController.hydrateMenu();
  });


  /* ─────────────────────────────────────────────
     Leaderboard screen bindings
     ───────────────────────────────────────────── */

  document.querySelectorAll('.lb-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      AudioEngine.play('click');
      currentLeaderboardFilter = btn.dataset.filter;
      document.querySelectorAll('.lb-filter').forEach(b => {
        b.classList.toggle('active', b === btn);
      });
      UIController.renderLeaderboard(currentLeaderboardFilter);
    });
  });

  document.getElementById('btnLbBack').addEventListener('click', () => {
    AudioEngine.play('click');
    UIController.showScreen('menu');
  });


  /* ─────────────────────────────────────────────
     Global resize handler
     ───────────────────────────────────────────── */
  window.addEventListener('resize', () => {
    Renderer.resize();
    UIController.initMenuSnake();
  });


  /* ─────────────────────────────────────────────
     Boot sequence
     ───────────────────────────────────────────── */

  InputHandler.init();
  UIController.initMenuSnake();
  UIController.hydrateMenu();
  UIController.showScreen('menu');

})();
