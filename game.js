/*
 * 丑三つの間 — canvas renderer + game logic.
 * All screens, UI and text are drawn to <canvas id="game"> with JavaScript.
 * No DOM UI elements, no external network requests, no embedded assets
 * (the jump-scare image is loaded from ./assets/ghost.jpg, a sibling file).
 */
(function () {
  "use strict";

  /* ============================== constants ============================== */

  const COLORS = {
    bg: "#0b0908",
    bgPanel: "#15100e",
    bgCard: "#1e1613",
    bgCardHover: "#271c17",
    ink: "#ece3d4",
    inkDim: "#9c8d7c",
    inkFaint: "#6b5f52",
    line: "#362a21",
    lineSoft: "#241b16",
    accent: "#8a2620",
    accentBright: "#c1443a",
    gold: "#a6823f",
  };

  const FONT_DISPLAY = '"Hiragino Mincho ProN","Yu Mincho","YuMincho",serif';
  const FONT_BODY = '"Hiragino Mincho ProN","Yu Mincho","YuMincho",serif';
  const FONT_UI = '"Hiragino Sans","Yu Gothic","Meiryo",sans-serif';

  const REDUCED_MOTION =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const HOTSPOTS = [
    { id: "scroll", label: "床の間の掛け軸" },
    { id: "closet", label: "押入れ" },
    { id: "altar", label: "仏壇" },
    { id: "tatami", label: "畳" },
    { id: "mirror", label: "鏡台" },
    { id: "door", label: "出口の襖", exit: true },
  ];

  const AMBIENT = [
    "どこか遠くで、柱時計が時を刻んでいる。",
    "行灯の灯りが、わずかに揺れた。",
    "畳の下で、何かがきしんだ気がした。",
    "障子の向こうを、何かが横切った。",
    "線香の匂いが、ふっと濃くなった。",
  ];

  const CLOCK_START_SEC = 1 * 3600 + 57 * 60; // 午前1時57分00秒
  const CLOCK_END_SEC = 2 * 3600; // 午前2時00分00秒(丑三つ時)
  const CRITICAL_REMAINING = 30;

  /* ============================== canvas setup ============================== */

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  let cssWidth = 0;
  let cssHeight = 0;

  function fitCanvas(w, h) {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    if (cssWidth === w && cssHeight === h && canvas._dpr === dpr) return;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cssWidth = w;
    cssHeight = h;
    canvas._dpr = dpr;
  }

  /* ============================== small draw helpers ============================== */

  function roundRectPath(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function measureSpaced(text, spacing) {
    let w = 0;
    for (const ch of text) w += ctx.measureText(ch).width + spacing;
    if (text.length) w -= spacing;
    return w;
  }

  // Draws text with manual per-character letter-spacing. align: 'left'|'center'
  function fillTextSpaced(text, x, y, align, spacing) {
    spacing = spacing || 0;
    const total = measureSpaced(text, spacing);
    let cx = align === "center" ? x - total / 2 : x;
    const prevAlign = ctx.textAlign;
    ctx.textAlign = "left"; // positions below are already per-character left edges
    for (const ch of text) {
      ctx.fillText(ch, cx, y);
      cx += ctx.measureText(ch).width + spacing;
    }
    ctx.textAlign = prevAlign;
    return total;
  }

  // word-wrap for Japanese text (character-based), respects explicit \n
  function wrapText(text, maxWidth) {
    const paragraphs = String(text).split("\n");
    const lines = [];
    paragraphs.forEach((para, pi) => {
      if (para === "") {
        lines.push("");
        return;
      }
      let line = "";
      for (const ch of para) {
        const test = line + ch;
        if (line !== "" && ctx.measureText(test).width > maxWidth) {
          lines.push(line);
          line = ch;
        } else {
          line = test;
        }
      }
      lines.push(line);
    });
    return lines;
  }

  /* ============================== icon drawing ============================== */

  function icStrokeCircle(cx, cy, r) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  function icFillCircle(cx, cy, r) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  function icLine(x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  function icStrokeRoundRect(x, y, w, h, r) {
    roundRectPath(x, y, w, h, r);
    ctx.stroke();
  }
  function icPolyline(pts) {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();
  }
  function icStrokeEllipse(cx, cy, rx, ry) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  const ICONS = {
    scroll() {
      icStrokeCircle(16, 9, 2.4);
      icStrokeCircle(32, 9, 2.4);
      icLine(16, 9, 32, 9);
      icStrokeRoundRect(15, 11, 18, 27, 1);
      ctx.save();
      ctx.globalAlpha *= 0.55;
      ctx.beginPath();
      ctx.moveTo(19, 22);
      ctx.lineTo(24, 16);
      ctx.lineTo(29, 22);
      ctx.lineTo(25, 22);
      ctx.lineTo(25, 30);
      ctx.lineTo(23, 30);
      ctx.lineTo(23, 22);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      icStrokeCircle(16, 38, 2.4);
      icStrokeCircle(32, 38, 2.4);
      icLine(16, 38, 32, 38);
    },
    altar() {
      icPolyline([
        [12, 20],
        [24, 8],
        [36, 20],
      ]);
      icStrokeRoundRect(13, 20, 22, 20, 1);
      icStrokeRoundRect(17, 30, 14, 8, 1);
      icFillCircle(24, 34, 1.6);
      icLine(17, 25, 31, 25);
    },
    closet() {
      icStrokeRoundRect(9, 9, 30, 30, 1);
      icLine(24, 9, 24, 39);
      icFillCircle(20, 24, 1.6);
      icFillCircle(28, 24, 1.6);
    },
    tatami() {
      icStrokeRoundRect(8, 14, 32, 22, 1);
      ctx.save();
      ctx.globalAlpha *= 0.6;
      icStrokeRoundRect(12, 18, 24, 14, 0.5);
      ctx.restore();
      icLine(8, 14, 16, 8);
      ctx.save();
      ctx.globalAlpha *= 0.5;
      icLine(16, 8, 40, 8);
      ctx.restore();
    },
    mirror() {
      icStrokeEllipse(24, 19, 11, 14);
      icLine(24, 33, 24, 40);
      icLine(16, 40, 32, 40);
      ctx.save();
      ctx.globalAlpha *= 0.65;
      icLine(18, 10, 28, 24);
      icLine(25, 12, 20, 26);
      ctx.restore();
    },
    door() {
      icStrokeRoundRect(12, 6, 24, 36, 1);
      icLine(12, 16, 36, 16);
      icLine(12, 27, 36, 27);
      icLine(24, 6, 24, 42);
      icStrokeCircle(30, 34, 3.4);
    },
    key() {
      icStrokeCircle(16, 24, 7);
      icLine(22, 24, 38, 24);
      icLine(32, 24, 32, 30);
      icLine(37, 24, 37, 29);
    },
    charm() {
      icStrokeRoundRect(14, 10, 20, 26, 2);
      icLine(24, 4, 24, 10);
      icLine(18, 18, 30, 18);
      icLine(18, 24, 30, 24);
    },
  };

  // x,y is the icon's CENTER (all call sites pass a center point)
  function drawIcon(name, x, y, size, color, alpha) {
    const fn = ICONS[name];
    if (!fn) return;
    ctx.save();
    ctx.translate(x - size / 2, y - size / 2);
    const s = size / 48;
    ctx.scale(s, s);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.6;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    fn();
    ctx.restore();
  }

  /* ============================== input handling ============================== */

  let hitRegions = [];
  const pointer = { x: -1, y: -1, down: false };

  function addHit(x, y, w, h, onClick) {
    hitRegions.push({ x, y, w, h, onClick });
  }

  function isHover(x, y, w, h) {
    return (
      pointer.x >= x &&
      pointer.x <= x + w &&
      pointer.y >= y &&
      pointer.y <= y + h
    );
  }

  function toLocal(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function pickHit(x, y) {
    for (let i = hitRegions.length - 1; i >= 0; i--) {
      const r = hitRegions[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r;
    }
    return null;
  }

  canvas.addEventListener("pointermove", (e) => {
    const p = toLocal(e);
    pointer.x = p.x;
    pointer.y = p.y;
    canvas.style.cursor = pickHit(p.x, p.y) ? "pointer" : "default";
    if (logScroll.dragging) {
      const dy = p.y - logScroll.lastY;
      logScroll.lastY = p.y;
      logScroll.offset = clamp(
        logScroll.offset - dy,
        0,
        Math.max(0, logScroll.maxOffset)
      );
    }
  });

  canvas.addEventListener("pointerdown", (e) => {
    const p = toLocal(e);
    pointer.down = true;
    if (logScroll.hit && isHover(logScroll.hit.x, logScroll.hit.y, logScroll.hit.w, logScroll.hit.h)) {
      logScroll.dragging = true;
      logScroll.lastY = p.y;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (err) {}
    }
  });

  window.addEventListener("pointerup", (e) => {
    pointer.down = false;
    logScroll.dragging = false;
  });

  canvas.addEventListener("click", (e) => {
    const p = toLocal(e);
    const hit = pickHit(p.x, p.y);
    if (hit && hit.onClick) {
      ensureAudio();
      hit.onClick();
    }
  });

  canvas.addEventListener(
    "wheel",
    (e) => {
      if (
        logScroll.hit &&
        isHover(logScroll.hit.x, logScroll.hit.y, logScroll.hit.w, logScroll.hit.h)
      ) {
        e.preventDefault();
        logScroll.offset = clamp(
          logScroll.offset + e.deltaY,
          0,
          Math.max(0, logScroll.maxOffset)
        );
      }
    },
    { passive: false }
  );

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  const logScroll = { offset: 0, maxOffset: 0, dragging: false, lastY: 0, hit: null };

  /* ============================== widgets ============================== */

  function drawButton(opts) {
    // opts: {x,y,w,h,label,variant:'default'|'primary'|'ghost',font,fontSize,small,disabled,onClick,spacing}
    const { x, y, w, h, label } = opts;
    const hovered = !opts.disabled && isHover(x, y, w, h);
    const primary = opts.variant === "primary";

    ctx.save();
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    if (hovered) {
      grad.addColorStop(0, COLORS.bgCardHover);
      grad.addColorStop(1, COLORS.bgCard);
    } else {
      grad.addColorStop(0, COLORS.bgCard);
      grad.addColorStop(1, COLORS.bgPanel);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = hovered ? COLORS.gold : primary ? COLORS.gold : COLORS.line;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.strokeStyle = "rgba(166,130,63,.25)";
    ctx.strokeRect(x + 3.5, y + 3.5, w - 7, h - 7);

    ctx.globalAlpha = opts.disabled ? 0.35 : 1;
    ctx.fillStyle = primary ? COLORS.gold : COLORS.ink;
    ctx.font = (opts.fontWeight || "700") + " " + (opts.fontSize || 15) + "px " + FONT_UI;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    fillTextSpaced(label, x + w / 2, y + h / 2 + 1, "center", opts.spacing === undefined ? 2 : opts.spacing);
    ctx.restore();

    if (!opts.disabled) addHit(x, y, w, h, opts.onClick);
    return hovered;
  }

  function drawPanelBox(x, y, w, h) {
    ctx.fillStyle = COLORS.bgPanel;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  /* ============================== audio ============================== */

  let audioCtx = null;
  let masterGain = null;
  let audioMuted = false;

  function ensureAudio() {
    if (audioCtx) return;
    initAudio();
  }

  function initAudio() {
    if (audioCtx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = new AC();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.55;
    masterGain.connect(audioCtx.destination);
    startBGM();
  }

  function startBGM() {
    const bgmGain = audioCtx.createGain();
    bgmGain.gain.value = 0;
    bgmGain.connect(masterGain);

    [55, 82.5, 110].forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      osc.type = i === 1 ? "sine" : "triangle";
      osc.frequency.value = freq;
      const gain = audioCtx.createGain();
      gain.gain.value = i === 0 ? 0.5 : 0.22;
      const filter = audioCtx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 320;
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(bgmGain);
      osc.start();
    });

    const lfo = audioCtx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = audioCtx.createGain();
    lfoGain.gain.value = 0.04;
    lfo.connect(lfoGain);
    lfoGain.connect(bgmGain.gain);
    lfo.start();

    bgmGain.gain.setValueAtTime(0, audioCtx.currentTime);
    bgmGain.gain.linearRampToValueAtTime(0.09, audioCtx.currentTime + 3);
  }

  function playSting() {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.06, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
    g.connect(masterGain);

    [220, 233, 415].forEach((freq) => {
      const osc = audioCtx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      osc.connect(g);
      osc.start(now);
      osc.stop(now + 0.9);
    });
  }

  function toggleMute() {
    audioMuted = !audioMuted;
    if (masterGain && audioCtx) {
      masterGain.gain.setTargetAtTime(audioMuted ? 0 : 0.55, audioCtx.currentTime, 0.05);
    }
  }

  /* ============================== jump-scare ============================== */

  const ghostImg = new Image();
  let ghostReady = false;
  ghostImg.onload = () => (ghostReady = true);
  ghostImg.src = "assets/ghost.jpg";

  let scareStart = 0;
  let scareActive = false;

  function jumpscare() {
    scareStart = performance.now();
    scareActive = true;
    playSting();
  }

  function drawJumpscare(now) {
    if (!scareActive) return;
    const t = now - scareStart;
    const dur = REDUCED_MOTION ? 500 : 460;
    if (t > dur) {
      scareActive = false;
      return;
    }
    const p = t / dur;

    let bgAlpha;
    if (REDUCED_MOTION) {
      bgAlpha = p < 0.3 ? (p / 0.3) * 0.9 : 0.9 * (1 - (p - 0.3) / 0.7);
    } else {
      if (p < 0.1) bgAlpha = (p / 0.1) * 0.88;
      else if (p < 0.72) bgAlpha = 0.88;
      else bgAlpha = 0.88 * (1 - (p - 0.72) / 0.28);
    }

    ctx.save();
    ctx.fillStyle = "rgba(0,0,0," + bgAlpha.toFixed(3) + ")";
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    if (ghostReady) {
      let scale, alpha;
      if (REDUCED_MOTION) {
        scale = 1;
        alpha = bgAlpha / 0.9;
      } else if (p < 0.18) {
        const q = p / 0.18;
        scale = 0.8 + 0.26 * q;
        alpha = q;
      } else if (p < 0.35) {
        const q = (p - 0.18) / 0.17;
        scale = 1.06 - 0.06 * q;
        alpha = 1;
      } else {
        scale = 1;
        alpha = 1;
      }
      const maxW = Math.min(cssWidth * 0.78, 460);
      const ratio = ghostImg.naturalHeight / ghostImg.naturalWidth || 700 / 656;
      let w = maxW * scale;
      let h = w * ratio;
      const maxH = cssHeight * 0.78;
      if (h > maxH) {
        h = maxH * scale;
        w = h / ratio;
      }
      ctx.globalAlpha = clamp(alpha, 0, 1);
      ctx.drawImage(ghostImg, cssWidth / 2 - w / 2, cssHeight / 2 - h / 2, w, h);
    }
    ctx.restore();
  }

  /* ============================== background effects ============================== */

  const grainCanvas = document.createElement("canvas");
  grainCanvas.width = 120;
  grainCanvas.height = 120;
  (function makeGrain() {
    const g = grainCanvas.getContext("2d");
    const img = g.createImageData(120, 120);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = Math.random() < 0.5 ? v * 0.12 : 0;
    }
    g.putImageData(img, 0, 0);
  })();
  const grainPattern = ctx.createPattern(grainCanvas, "repeat");

  function drawBackground(now) {
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    // lamp glow
    if (!REDUCED_MOTION) {
      const t = now / 1000;
      const flicker =
        0.9 +
        0.1 * Math.sin(t * 1.15) +
        (Math.sin(t * 7.3) > 0.93 ? -0.18 : 0);
      drawLampGlow(clamp(flicker, 0.6, 1));
    } else {
      drawLampGlow(1);
    }

    // vignette
    const vg = ctx.createRadialGradient(
      cssWidth / 2,
      cssHeight * 0.4,
      Math.min(cssWidth, cssHeight) * 0.1,
      cssWidth / 2,
      cssHeight * 0.4,
      Math.max(cssWidth, cssHeight) * 0.75
    );
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(0.35, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,.7)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    // grain
    ctx.save();
    ctx.globalCompositeOperation = "overlay";
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = grainPattern;
    ctx.fillRect(0, 0, cssWidth, cssHeight);
    ctx.restore();
  }

  function drawLampGlow(intensity) {
    const size = Math.min(Math.max(cssWidth, cssHeight) * 0.6, 640);
    const cx = cssWidth / 2;
    const cy = -size * 0.1;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, size / 2);
    grad.addColorStop(0, "rgba(166,130,63," + (0.16 * intensity).toFixed(3) + ")");
    grad.addColorStop(0.45, "rgba(166,130,63," + (0.05 * intensity).toFixed(3) + ")");
    grad.addColorStop(1, "rgba(166,130,63,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
  }

  /* ============================== game state ============================== */

  const state = {
    screen: "title", // 'title' | 'game' | 'end'
    inventory: [], // [{id,label}]
    flags: {
      closetOpened: false,
      dollPulled: false,
      altarOpened: false,
      tatamiChecked: false,
      scrollChecked: false,
      mirrorSeen: false,
    },
    digits: { d1: null, d2: null, d3: null },
    dial: [0, 0, 0],
    active: null,
    panelTitle: "部屋のようす",
    clockSec: CLOCK_START_SEC,
    timerCritical: false,
    timerId: null,
    log: [], // [{text, cls}]
    actionButtons: [], // [{label, onClick}]
    dialVisible: false,
    dialShakeAt: 0,
    endTitle: "",
    endText: "",
  };

  function formatClock(totalSec) {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return "午前" + h12 + "時" + String(m).padStart(2, "0") + "分" + String(s).padStart(2, "0") + "秒";
  }

  function addLine(text, cls) {
    state.log.push({ text, cls });
    trimLog();
    logScroll.offset = Infinity; // clamp to bottom on next layout
  }

  function trimLog() {
    while (state.log.length > 24) state.log.shift();
  }

  function clearActions() {
    state.actionButtons = [];
    state.dialVisible = false;
  }

  function addAction(label, fn) {
    state.actionButtons.push({ label, onClick: fn });
  }

  function addItem(id, label) {
    if (state.inventory.some((it) => it.id === id)) return;
    state.inventory.push({ id, label });
  }

  function startTimer() {
    state.clockSec = CLOCK_START_SEC;
    state.timerCritical = false;
    clearInterval(state.timerId);
    state.timerId = setInterval(() => {
      state.clockSec += 1;
      const remaining = CLOCK_END_SEC - state.clockSec;
      if (remaining === CRITICAL_REMAINING) {
        state.timerCritical = true;
        jumpscare();
      }
      if (remaining <= 0) {
        clearInterval(state.timerId);
        gameOver();
      }
    }, 1000);
  }

  function stopTimer() {
    clearInterval(state.timerId);
  }

  function gameOver() {
    stopTimer();
    clearActions();
    addLine("時計が、午前二時を告げた。丑三つ時――襖はまだ開かない。", "flavor");
    jumpscare();
    setTimeout(() => {
      state.endTitle = "ゲームオーバー";
      state.endText = "丑三つ時になった。\n\n襖の向こうで、何かが静かに笑っていた気配がした。";
      state.screen = "end";
    }, 700);
  }

  function onHotspot(h) {
    state.active = h.id;
    clearActions();
    state.panelTitle = h.label;

    switch (h.id) {
      case "scroll":
        return handleScroll();
      case "closet":
        return handleCloset();
      case "altar":
        return handleAltar();
      case "tatami":
        return handleTatami();
      case "mirror":
        return handleMirror();
      case "door":
        return handleDoor();
    }
  }

  function handleScroll() {
    if (!state.flags.scrollChecked) {
      addLine("床の間に掛け軸が下がっている。山水画は、ところどころ黄ばんでいた。");
      addAction("裏側を覗く", () => {
        state.flags.scrollChecked = true;
        state.digits.d1 = 3;
        addLine("裏側に小さな走り書きがあった。", "flavor");
        addLine("暗証番号　一桁目：3", "clue");
        clearActions();
      });
    } else {
      addLine("掛け軸に、他の仕掛けはなさそうだ。", "flavor");
    }
  }

  function handleCloset() {
    if (!state.flags.closetOpened) {
      state.flags.closetOpened = true;
      addLine("襖を開けると、暗い押入れの奥に何かが座っている。よく見ると、古い市松人形だった。");
      addAction("人形に近づく", () => {
        addLine("人形の帯に、何か硬いものが縫い付けられている。");
        clearActions();
        addAction("帯をほどく", () => {
          state.flags.dollPulled = true;
          addLine("中から、小さな鍵が出てきた。", "flavor");
          addItem("key", "古びた鍵");
          clearActions();
        });
      });
    } else if (!state.flags.dollPulled) {
      addLine("人形の帯に、まだ何か縫い付けられている。");
      addAction("帯をほどく", () => {
        state.flags.dollPulled = true;
        addLine("中から、小さな鍵が出てきた。", "flavor");
        addItem("key", "古びた鍵");
        clearActions();
      });
    } else {
      addLine("人形はもう何も持っていない。……人形と、目が合った気がした。", "flavor");
    }
  }

  function handleAltar() {
    if (state.flags.altarOpened) {
      addLine("引き出しはもう空だ。", "flavor");
      return;
    }
    addLine("仏壇には古い位牌と線香立て。下の引き出しに、小さな南京錠がかかっている。");
    if (state.inventory.some((it) => it.id === "key")) {
      addAction("鍵で開ける", () => {
        state.flags.altarOpened = true;
        state.digits.d3 = 8;
        addLine("鍵はぴったりと合い、引き出しが開いた。中には黄ばんだメモが一枚。", "flavor");
        addLine("暗証番号　三桁目：8", "clue");
        addItem("charm", "お守り");
        clearActions();
      });
    } else {
      addLine("鍵が必要なようだ。", "flavor");
    }
  }

  function handleTatami() {
    if (!state.flags.tatamiChecked) {
      addLine("畳が一枚だけ、わずかに浮いている。");
      addAction("めくってみる", () => {
        state.flags.tatamiChecked = true;
        state.digits.d2 = 4;
        addLine("めくると、床板に古い刻み跡があった。", "flavor");
        addLine("暗証番号　二桁目：4", "clue");
        clearActions();
      });
    } else {
      addLine("床板には、もう何もなさそうだ。", "flavor");
    }
  }

  function handleMirror() {
    if (!state.flags.mirrorSeen) {
      state.flags.mirrorSeen = true;
      addLine("古い鏡台。鏡は斜めにひびが入り、埃をかぶっている。");
      addAction("鏡を覗き込む", () => {
        jumpscare();
        addLine("鏡を覗き込むと、一瞬だけ――自分ではない誰かが、こちらを見ていた気がした。", "flavor");
        clearActions();
      });
    } else {
      addLine("もう、あの鏡は覗きたくない。", "flavor");
    }
  }

  function handleDoor() {
    addLine("襖の脇に、古いダイヤル錠がついている。三桁の数字を合わせるようだ。");
    clearActions();
    state.dialVisible = true;
  }

  function tryDial() {
    const { d1, d2, d3 } = state.digits;
    if (d1 === null || d2 === null || d3 === null) {
      addLine("まだ、何か足りない気がする。", "flavor");
      return;
    }
    const ok = state.dial[0] === d1 && state.dial[1] === d2 && state.dial[2] === d3;
    if (ok) {
      goToEnding();
    } else {
      state.dialShakeAt = performance.now();
      addLine("かちり、と虚しい音が鳴った。番号が違うようだ。", "flavor");
    }
  }

  function goToEnding() {
    stopTimer();
    state.dialVisible = false;
    clearActions();
    addLine("ダイヤルが小さく鳴り、襖がすっと開いた。");
    setTimeout(() => {
      state.endTitle = "脱出成功";
      let text = "外は静まり返った廊下だった。振り返らずに、あなたはその部屋を後にした。";
      if (state.flags.mirrorSeen) {
        text += "\n\n――ただ、鏡の中で笑っていたあの顔だけは、まだ脳裏から離れない。";
      }
      state.endText = text;
      state.screen = "end";
    }, 900);
  }

  function ambientTick() {
    if (state.screen !== "game") return;
    const line = AMBIENT[Math.floor(Math.random() * AMBIENT.length)];
    addLine(line, "flavor");
    if (Math.random() < 0.2) jumpscare();
  }

  function resetState() {
    stopTimer();
    state.inventory = [];
    state.flags = {
      closetOpened: false,
      dollPulled: false,
      altarOpened: false,
      tatamiChecked: false,
      scrollChecked: false,
      mirrorSeen: false,
    };
    state.digits = { d1: null, d2: null, d3: null };
    state.dial = [0, 0, 0];
    state.active = null;
    state.panelTitle = "部屋のようす";
    state.clockSec = CLOCK_START_SEC;
    state.timerCritical = false;
    state.log = [];
    clearActions();
    logScroll.offset = 0;
  }

  function startGame() {
    state.screen = "game";
    initAudio();
    startTimer();
    addLine("目を開けると、そこは知らない和室だった。畳の匂いと、線香の残り香がする。");
    addLine("出口は、恐らくあの襖だけだ。");
    addLine("時計は、午前一時五十七分を指していた。丑三つ時になる前に、ここを出なければ。", "flavor");
  }

  /* ============================== layout + draw: TITLE ============================== */

  function layoutTitle(vw, vh) {
    ctx.font = "400 12px " + FONT_DISPLAY;
    const markH = 130;

    const titleSize = clamp(vw * 0.08, 38, 61);
    ctx.font = "800 " + titleSize + "px " + FONT_DISPLAY;
    const titleH = titleSize * 1.2;

    const subSize = 16;
    ctx.font = subSize + "px " + FONT_BODY;
    const subMaxWidth = Math.min(vw - 40, 34 * subSize * 0.62);
    const subLine1 = "目を開けると、そこは知らない和室だった。";
    const subLine2 = "時計の針は、丑三つ時に近づいている。";
    const subLines1 = wrapText(subLine1, subMaxWidth);
    const subLines2 = wrapText(subLine2, subMaxWidth);
    const subLineH = subSize * 1.9;
    const subH = (subLines1.length + subLines2.length) * subLineH;

    const btnW = 220;
    const btnH = 52;

    const gap = 28;
    const contentH = markH + gap + titleH + gap + subH + gap + btnH;
    const totalH = Math.max(vh, contentH + 80);

    return {
      totalH,
      markH,
      titleSize,
      titleH,
      subSize,
      subLines1,
      subLines2,
      subLineH,
      subH,
      btnW,
      btnH,
      gap,
      contentH,
    };
  }

  function drawTitle(L) {
    let y = (L.totalH - L.contentH) / 2;
    const cx = cssWidth / 2;

    // vertical title mark "怪異譚"
    ctx.save();
    ctx.font = "400 12px " + FONT_DISPLAY;
    ctx.fillStyle = COLORS.inkFaint;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const mark = "怪異譚";
    const chGap = L.markH / (mark.length + 0.5);
    let my = y + chGap * 0.75;
    for (const ch of mark) {
      ctx.fillText(ch, cx, my);
      my += chGap;
    }
    ctx.restore();
    y += L.markH + L.gap;

    // h1
    ctx.save();
    ctx.font = "800 " + L.titleSize + "px " + FONT_DISPLAY;
    ctx.fillStyle = COLORS.ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.shadowColor = "rgba(193,68,58,.35)";
    ctx.shadowBlur = 28;
    fillTextSpaced("丑三つの間", cx, y + L.titleSize * 0.85, "center", L.titleSize * 0.08);
    ctx.restore();
    y += L.titleH + L.gap;

    // subtitle
    ctx.save();
    ctx.font = L.subSize + "px " + FONT_BODY;
    ctx.fillStyle = COLORS.inkDim;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let sy = y + L.subLineH / 2;
    for (const line of L.subLines1) {
      ctx.fillText(line, cx, sy);
      sy += L.subLineH;
    }
    for (const line of L.subLines2) {
      ctx.fillText(line, cx, sy);
      sy += L.subLineH;
    }
    ctx.restore();
    y += L.subH + L.gap;

    // button
    drawButton({
      x: cx - L.btnW / 2,
      y,
      w: L.btnW,
      h: L.btnH,
      label: "目を、開ける",
      variant: "primary",
      onClick: startGame,
    });
  }

  /* ============================== layout + draw: GAME ============================== */

  function layoutGame(vw, vh) {
    const sidePad = clamp(vw * 0.04, 16, 32);
    const topPad = clamp(vw * 0.05, 24, 56);
    const stageW = Math.min(vw - sidePad * 2, 1040);
    const stageX = (vw - stageW) / 2;

    let y = topPad;

    // header
    ctx.font = "700 20px " + FONT_DISPLAY;
    const titleW = measureSpaced("丑三つの間", 3);
    ctx.font = "700 12px " + FONT_UI;
    const muteW = 100;
    const timerW = 150;
    const controlsW = muteW + 12 + timerW;
    const headerNeeds = titleW + 12 + controlsW;
    const headerStacked = headerNeeds > stageW;
    const headerH = headerStacked ? 34 + 8 + 40 : 40;
    const headerBlockH = headerH + 14 + 28;
    y += headerBlockH;

    // layout columns
    const narrow = vw < 780;
    const colGap = 28;
    let gridW, panelW, panelX, gridX;
    if (narrow) {
      gridW = stageW;
      panelW = stageW;
      gridX = stageX;
      panelX = stageX;
    } else {
      const avail = stageW - colGap;
      gridW = avail * (1.35 / 2.35);
      panelW = avail * (1 / 2.35);
      gridX = stageX;
      panelX = stageX + gridW + colGap;
    }

    const columns = vw >= 560 ? 3 : 2;
    const cellGap = 14;
    const cellW = (gridW - (columns - 1) * cellGap) / columns;
    const cellH = 112;
    const rows = Math.ceil(HOTSPOTS.length / columns);
    const gridH = rows * cellH + (rows - 1) * cellGap;

    const gridY = y;

    // panel layout
    const panelPadX = 22;
    const panelPadTop = 22;
    const panelPadBottom = 20;
    let panelY = narrow ? gridY + gridH + colGap : gridY;

    let py = panelY + panelPadTop;
    ctx.font = "600 16px " + FONT_DISPLAY;
    const panelHeaderH = 16 * 1.3 + 10 + 1; // text + padding-bottom + border
    py += panelHeaderH + 12;

    const logY = py;
    const logH = 300;
    py += logH;

    // action area (must mirror drawDial / drawActionButtons geometry exactly)
    let actionsH = 0;
    if (state.dialVisible) {
      actionsH = 22 + (40 + 6 + 48 + 6 + 40) + 14 + 44;
    } else if (state.actionButtons.length) {
      actionsH = measureActionButtonsHeight(panelW - panelPadX * 2);
    }
    const actionsY = py;
    py += actionsH;

    // inventory
    const invY = py + (actionsH ? 18 : 14);
    const invH = 40;
    py = invY + invH;

    const panelH = py - panelY + panelPadBottom;

    const contentBottom = Math.max(
      narrow ? panelY + panelH : Math.max(gridY + gridH, panelY + panelH),
      0
    );
    const totalH = Math.max(vh, contentBottom + 64);

    return {
      totalH,
      stageX,
      stageW,
      topPad,
      headerH,
      headerStacked,
      headerBlockH,
      titleW,
      narrow,
      gridX,
      gridY,
      gridW,
      gridH,
      columns,
      cellGap,
      cellW,
      cellH,
      rows,
      panelX,
      panelY,
      panelW,
      panelH,
      panelPadX,
      panelPadTop,
      panelHeaderH,
      logY,
      logH,
      actionsY,
      actionsH,
      invY,
      invH,
      headerY: topPad,
    };
  }

  function drawGame(L, now) {
    // header
    let hy = L.headerY;
    ctx.save();
    ctx.font = "700 20px " + FONT_DISPLAY;
    ctx.fillStyle = COLORS.ink;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    fillTextSpaced("丑三つの間", L.stageX, hy + 2, "left", 3);
    ctx.restore();

    const controlsY = L.headerStacked ? hy + 34 + 8 : hy;
    let cx = L.stageX + L.stageW;

    // timer (right-most)
    const timerText = formatClock(state.clockSec);
    ctx.font = "12px " + FONT_UI;
    const timerTextW = ctx.measureText(timerText).width;
    const timerW = timerTextW + 28;
    const timerH = 32;
    const timerX = cx - timerW;
    const timerY = controlsY;
    ctx.save();
    let timerAlpha = 1;
    if (state.timerCritical && !REDUCED_MOTION) {
      timerAlpha = 0.7 + 0.3 * Math.sin(now / 160);
    }
    ctx.globalAlpha = timerAlpha;
    ctx.strokeStyle = state.timerCritical ? COLORS.accentBright : COLORS.line;
    ctx.strokeRect(timerX + 0.5, timerY + 0.5, timerW - 1, timerH - 1);
    ctx.fillStyle = state.timerCritical ? COLORS.accentBright : COLORS.inkDim;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(timerText, timerX + timerW / 2, timerY + timerH / 2 + 1);
    ctx.restore();

    // mute button (left of timer)
    const muteLabel = audioMuted ? "音:OFF" : "音:ON";
    const muteW = 90;
    const muteH = 32;
    const muteX = timerX - 12 - muteW;
    drawButton({
      x: muteX,
      y: controlsY,
      w: muteW,
      h: muteH,
      label: muteLabel,
      fontSize: 11,
      spacing: 1,
      onClick: toggleMute,
    });

    // hotspot grid
    HOTSPOTS.forEach((h, i) => {
      const col = i % L.columns;
      const row = Math.floor(i / L.columns);
      const x = L.gridX + col * (L.cellW + L.cellGap);
      const y = L.gridY + row * (L.cellH + L.cellGap);
      drawHotspotCard(h, x, y, L.cellW, L.cellH);
    });

    // panel
    drawPanelBox(L.panelX, L.panelY, L.panelW, L.panelH);
    const innerX = L.panelX + L.panelPadX;
    const innerW = L.panelW - L.panelPadX * 2;

    // panel header
    ctx.save();
    ctx.font = "600 16px " + FONT_DISPLAY;
    ctx.fillStyle = COLORS.gold;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    fillTextSpaced(state.panelTitle, innerX, L.panelY + L.panelPadTop + 16, "left", 1.6);
    ctx.strokeStyle = COLORS.lineSoft;
    ctx.beginPath();
    ctx.moveTo(innerX, L.panelY + L.panelPadTop + L.panelHeaderH);
    ctx.lineTo(innerX + innerW, L.panelY + L.panelPadTop + L.panelHeaderH);
    ctx.stroke();
    ctx.restore();

    drawLog(innerX, L.logY, innerW, L.logH);

    if (state.dialVisible) {
      drawDial(innerX, L.actionsY, innerW, now);
    } else if (state.actionButtons.length) {
      drawActionButtons(innerX, L.actionsY, innerW);
    }

    drawInventory(innerX, L.invY, innerW);
  }

  function drawHotspotCard(h, x, y, w, h_) {
    const hovered = isHover(x, y, w, h_);
    const active = state.active === h.id;
    ctx.save();
    ctx.fillStyle = hovered ? COLORS.bgCardHover : COLORS.bgCard;
    ctx.fillRect(x, y, w, h_);
    let strokeColor = COLORS.line;
    if (h.exit) strokeColor = hovered ? COLORS.accentBright : "rgba(138,38,32,.5)";
    if (active) strokeColor = COLORS.gold;
    if (hovered && !h.exit) strokeColor = COLORS.inkFaint;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h_ - 1);
    if (active) {
      ctx.strokeStyle = "rgba(166,130,63,.35)";
      ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h_ - 3);
    }

    const iconColor = active || hovered ? COLORS.ink : COLORS.inkDim;

    const iconSize = 34;
    const iconLabelGap = 10;
    const labelLineH = 16;
    ctx.font = "12px " + FONT_UI;
    const lines = wrapText(h.label, w - 12);
    const contentH = iconSize + iconLabelGap + lines.length * labelLineH;
    const contentTop = y + (h_ - contentH) / 2;

    drawIcon(h.id, x + w / 2, contentTop + iconSize / 2, iconSize, iconColor);

    ctx.fillStyle = iconColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    let ty = contentTop + iconSize + iconLabelGap;
    for (const line of lines) {
      fillTextSpaced(line, x + w / 2, ty, "center", 1);
      ty += labelLineH;
    }
    ctx.restore();

    addHit(x, y, w, h_, () => onHotspot(h));
  }

  function drawLog(x, y, w, h) {
    ctx.save();
    roundRectPath(x, y, w, h, 0);
    ctx.clip();

    ctx.font = "15px " + FONT_BODY;
    const lineH = 15 * 1.85;
    const flavorLineH = 13 * 1.85;

    // measure total content height
    let totalH = 0;
    const measured = state.log.map((entry, i) => {
      const isFlavor = entry.cls === "flavor";
      ctx.font = (isFlavor ? "italic " : "") + (isFlavor ? "13px " : "15px ") + FONT_BODY;
      const lines = wrapText(entry.text, w - 4);
      const lh = isFlavor ? flavorLineH : lineH;
      const blockH = lines.length * lh;
      totalH += blockH + (i < state.log.length - 1 ? 12 : 0);
      return { lines, lh, cls: entry.cls, isLast: i === state.log.length - 1 };
    });

    logScroll.maxOffset = Math.max(0, totalH - h);
    if (!isFinite(logScroll.offset) || logScroll.offset > logScroll.maxOffset) {
      logScroll.offset = logScroll.maxOffset;
    }
    logScroll.hit = { x, y, w, h };

    let cy = y - logScroll.offset;
    measured.forEach((m) => {
      let color = COLORS.inkDim;
      if (m.cls === "flavor") color = COLORS.inkFaint;
      else if (m.cls === "clue") color = COLORS.gold;
      else if (m.isLast) color = COLORS.ink;

      ctx.font = (m.cls === "flavor" ? "italic 13px " : "15px ") + FONT_BODY;
      ctx.fillStyle = color;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      m.lines.forEach((line) => {
        if (cy + m.lh > y && cy < y + h) ctx.fillText(line, x + 2, cy);
        cy += m.lh;
      });
      cy += 12;
    });

    ctx.restore();

    // scrollbar hint
    if (logScroll.maxOffset > 0) {
      const trackH = h;
      const thumbH = Math.max(24, (h / totalH) * trackH);
      const thumbY = y + (logScroll.offset / logScroll.maxOffset) * (trackH - thumbH);
      ctx.save();
      ctx.fillStyle = COLORS.line;
      ctx.fillRect(x + w - 3, thumbY, 3, thumbH);
      ctx.restore();
    }
  }

  function measureActionButtonsHeight(w) {
    if (!state.actionButtons.length) return 0;
    let bx = 0;
    let rows = 1;
    const bh = 40;
    state.actionButtons.forEach((a) => {
      ctx.font = "700 13px " + FONT_UI;
      const tw = measureSpaced(a.label, 2);
      const bw = tw + 44;
      if (bx + bw > w) {
        rows++;
        bx = 0;
      }
      bx += bw + 10;
    });
    return 14 + rows * bh + (rows - 1) * 10;
  }

  function drawActionButtons(x, y, w) {
    ctx.save();
    ctx.strokeStyle = COLORS.lineSoft;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.stroke();
    ctx.restore();

    let bx = x;
    let by = y + 14;
    const bh = 40;
    state.actionButtons.forEach((a) => {
      ctx.font = "700 13px " + FONT_UI;
      const tw = measureSpaced(a.label, 2);
      const bw = tw + 44;
      if (bx + bw > x + w) {
        bx = x;
        by += bh + 10;
      }
      drawButton({ x: bx, y: by, w: bw, h: bh, label: a.label, fontSize: 13, spacing: 2, onClick: a.onClick });
      bx += bw + 10;
    });
  }

  function drawDial(x, y, w, now) {
    ctx.save();
    ctx.strokeStyle = COLORS.lineSoft;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.stroke();
    ctx.restore();

    let shakeOffset = 0;
    if (!REDUCED_MOTION && state.dialShakeAt) {
      const t = performance.now() - state.dialShakeAt;
      if (t < 400) {
        const p = t / 400;
        const wave = Math.sin(p * Math.PI * 4);
        shakeOffset = wave * 6 * (1 - p);
      }
    }

    const colW = 44;
    const colGap = 14;
    const totalDialW = colW * 3 + colGap * 2;
    let dx = x + (w - totalDialW) / 2 + shakeOffset;
    const dy = y + 14 + 8;

    state.dial.forEach((val, i) => {
      const cx0 = dx;
      const upH = 40;
      const digitH = 48;
      const downH = 40;

      drawButton({
        x: cx0,
        y: dy,
        w: colW,
        h: upH,
        label: "▲",
        fontSize: 15,
        spacing: 0,
        onClick: () => {
          state.dial[i] = (state.dial[i] + 1) % 10;
        },
      });

      const digitY = dy + upH + 6;
      ctx.save();
      ctx.fillStyle = COLORS.bg;
      ctx.strokeStyle = COLORS.lineSoft;
      ctx.strokeRect(cx0 + 0.5, digitY + 0.5, colW - 1, digitH - 1);
      ctx.font = "30px " + FONT_DISPLAY;
      ctx.fillStyle = COLORS.ink;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(val), cx0 + colW / 2, digitY + digitH / 2 + 2);
      ctx.restore();

      drawButton({
        x: cx0,
        y: digitY + digitH + 6,
        w: colW,
        h: downH,
        label: "▼",
        fontSize: 15,
        spacing: 0,
        onClick: () => {
          state.dial[i] = (state.dial[i] + 9) % 10;
        },
      });

      dx += colW + colGap;
    });

    const tryY = dy + 40 + 6 + 48 + 6 + 40 + 14;
    const tryW = 120;
    drawButton({
      x: x + (w - tryW) / 2,
      y: tryY,
      w: tryW,
      h: 44,
      label: "試す",
      fontSize: 14,
      spacing: 2,
      onClick: tryDial,
    });
  }

  function drawInventory(x, y, w) {
    if (!state.inventory.length) {
      ctx.save();
      ctx.font = "12px " + FONT_UI;
      ctx.fillStyle = COLORS.inkFaint;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("持ち物はまだない", x, y);
      ctx.restore();
      return;
    }
    let ix = x;
    let iy = y;
    const chH = 34;
    state.inventory.forEach((item) => {
      ctx.font = "12px " + FONT_UI;
      const tw = ctx.measureText(item.label).width;
      const chW = 18 + 8 + tw + 28;
      if (ix + chW > x + w) {
        ix = x;
        iy += chH + 10;
      }
      ctx.save();
      ctx.fillStyle = COLORS.bgCard;
      ctx.strokeStyle = COLORS.line;
      ctx.fillRect(ix, iy, chW, chH);
      ctx.strokeRect(ix + 0.5, iy + 0.5, chW - 1, chH - 1);
      drawIcon(item.id, ix + 14 + 9, iy + chH / 2, 18, COLORS.gold);
      ctx.fillStyle = COLORS.inkDim;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(item.label, ix + 14 + 18 + 8, iy + chH / 2 + 1);
      ctx.restore();
      ix += chW + 10;
    });
  }

  /* ============================== layout + draw: END ============================== */

  function layoutEnd(vw, vh) {
    const markH = 130;

    const titleSize = clamp(vw * 0.06, 32, 45);
    ctx.font = "800 " + titleSize + "px " + FONT_DISPLAY;
    const titleH = titleSize * 1.2;

    const textSize = 16;
    ctx.font = textSize + "px " + FONT_BODY;
    const maxWidth = Math.min(vw - 40, 38 * textSize * 0.62);
    const lines = wrapText(state.endText, maxWidth);
    const lineH = textSize * 2;
    const textH = lines.length * lineH;

    const btnW = 240;
    const btnH = 52;

    const gap = 26;
    const contentH = markH + gap + titleH + gap + textH + gap + btnH;
    const totalH = Math.max(vh, contentH + 80);

    return { totalH, markH, titleSize, titleH, textSize, lines, lineH, textH, btnW, btnH, gap, contentH };
  }

  function drawEnd(L) {
    let y = (L.totalH - L.contentH) / 2;
    const cx = cssWidth / 2;

    ctx.save();
    ctx.font = "400 12px " + FONT_DISPLAY;
    ctx.fillStyle = COLORS.inkFaint;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const mark = "怪異譚";
    const chGap = L.markH / (mark.length + 0.5);
    let my = y + chGap * 0.75;
    for (const ch of mark) {
      ctx.fillText(ch, cx, my);
      my += chGap;
    }
    ctx.restore();
    y += L.markH + L.gap;

    ctx.save();
    ctx.font = "800 " + L.titleSize + "px " + FONT_DISPLAY;
    ctx.fillStyle = COLORS.accentBright;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    fillTextSpaced(state.endTitle, cx, y + L.titleSize * 0.85, "center", L.titleSize * 0.1);
    ctx.restore();
    y += L.titleH + L.gap;

    ctx.save();
    ctx.font = L.textSize + "px " + FONT_BODY;
    ctx.fillStyle = COLORS.inkDim;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let ty = y + L.lineH / 2;
    for (const line of L.lines) {
      ctx.fillText(line, cx, ty);
      ty += L.lineH;
    }
    ctx.restore();
    y += L.textH + L.gap;

    drawButton({
      x: cx - L.btnW / 2,
      y,
      w: L.btnW,
      h: L.btnH,
      label: "もう一度、目を閉じる",
      fontSize: 14,
      spacing: 2,
      onClick: () => {
        resetState();
        state.screen = "title";
      },
    });
  }

  /* ============================== main loop ============================== */

  function frame(now) {
    hitRegions = [];

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let L, targetH;
    if (state.screen === "title") {
      L = layoutTitle(vw, vh);
      targetH = L.totalH;
    } else if (state.screen === "game") {
      L = layoutGame(vw, vh);
      targetH = L.totalH;
    } else {
      L = layoutEnd(vw, vh);
      targetH = L.totalH;
    }

    fitCanvas(vw, targetH);
    drawBackground(now);

    if (state.screen === "title") drawTitle(L);
    else if (state.screen === "game") drawGame(L, now);
    else drawEnd(L);

    drawJumpscare(now);

    requestAnimationFrame(frame);
  }

  setInterval(ambientTick, 12000);
  requestAnimationFrame(frame);
})();
