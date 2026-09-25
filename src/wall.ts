// The sticker wall: ONE canvas, a dense lattice of die-cut stickers drifting on a diagonal,
// each wobbling. setMix() flips the tiles in a wave from a point on screen; setTarget() makes
// nearby tiles turn into pointing soyjaks aimed at that rectangle. Reduced motion: one still frame,
// changes jump with no tween. Sprites load lazily; a tile slaps on when its sticker arrives.
import { WALL, type WallTextId } from "./copy";
import type { WallMix } from "./verdict";

type Rect = { x: number; y: number; w: number; h: number };
type Source = HTMLImageElement | HTMLCanvasElement;

interface TextDef {
  text: string;
  bg: string;
  fg: string;
  lines?: number;
}

// Colours per text sticker; the words come from the copy table.
const TEXT_STYLE: Record<WallTextId, Omit<TextDef, "text">> = {
  t_bugs: { bg: "#141116", fg: "#ffffff" },
  t_shrimps: { bg: "#ff8a5b", fg: "#141116" },
  t_trillions: { bg: "#9b3af9", fg: "#ffffff" },
  t_nooo: { bg: "#ffffff", fg: "#141116", lines: 1 },
  t_date: { bg: "#e8202a", fg: "#ffffff" },
  t_polycule: { bg: "#ffe23d", fg: "#141116" },
  t_ants: { bg: "#ffffff", fg: "#141116" },
  t_ratworld: { bg: "#141116", fg: "#ffe23d", lines: 1 },
  t_antruist: { bg: "#ffe23d", fg: "#141116", lines: 2 },
};

export const TEXT_STICKERS: Record<string, TextDef> = Object.fromEntries(
  (Object.keys(WALL) as WallTextId[]).map((id) => [id, { text: WALL[id], ...TEXT_STYLE[id] }]),
);

interface Sprite {
  src: Source[]; // original frames
  frames: Source[]; // pre-scaled to device px for the current cell size
  ready: boolean;
  readyAt: number;
  text?: TextDef;
}

interface Mix {
  keys: string[];
  cum: number[];
  total: number;
  seed: number;
}

interface Wave {
  t0: number;
  ox: number; // origin in wall coordinates
  oy: number;
  mix: Mix;
  pointing: boolean;
}

interface Cell {
  shown: string | null;
  mirror: boolean;
  from: string | null;
  fromMirror: boolean;
  flipAt: number; // -1 = not flipping
  bornAt: number;
  seen: number;
}

type Info = ReturnType<Wall["info"]>;

interface Placed {
  r: number;
  c: number;
  x: number;
  y: number;
  z: number;
  inf: Info;
}

const WAVE_SPEED = 1.15; // css px per ms
const FLIP_MS = 520;
const SLAP_MS = 300;
const INTRO_MS = 2600;
const DRIFT = { x: -17, y: -10 }; // css px per second
// Pointing stickers, all drawn pointing right: men, women, and a lone soyjakette.
const POINTERS = ["w_soy_pointing_pair", "w_sjette_pointing_pair", "w_sjette_pointing"];
// Stickers with lettering never mirror (text stickers, the bZ badge, the calculator).
const NO_MIRROR = /^(t_|w_soldierA|w_soy_smug_calc)/;

// ---- deterministic hashing -------------------------------------------------

function hash(a: number, b: number, s: number): number {
  let h = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function makeMix(m: WallMix, seed: number): Mix {
  const keys = Object.keys(m).filter((k) => m[k] > 0);
  const cum: number[] = [];
  let total = 0;
  for (const k of keys) cum.push((total += m[k]));
  return { keys, cum, total, seed };
}

function at(mix: Mix, u: number): string {
  const x = u * mix.total;
  for (let i = 0; i < mix.cum.length; i++) if (x < mix.cum[i]) return mix.keys[i];
  return mix.keys[mix.keys.length - 1];
}

const easeOutBack = (x: number) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);

// ---- the wall ----------------------------------------------------------------

export class Wall {
  private ctx: CanvasRenderingContext2D;
  private sprites = new Map<string, Sprite>();
  private cells = new Map<number, Cell>();
  private waves: Wave[] = [];
  private waveCount = 0;
  private idle: Mix;
  private target: Rect | null = null;
  private W = 0;
  private H = 0;
  private dpr = 1;
  private dprCap = 2;
  private cell = 120;
  private rowH = 104;
  private t = 0; // wall clock, ms
  private px = 0; // drift offset, css px
  private py = 0;
  private speed = 1;
  private speedTarget = 1;
  private last = 0;
  private frame = 0;
  private raf = 0;
  private reduced: boolean;
  private paused = false;
  private dirty = true;
  private slow = 0;
  private fontFamily = "Meme, Impact, Anton, 'Arial Narrow', sans-serif";
  /** Rolling average draw cost in ms, and frame count (dev checks). */
  stats = { drawMs: 0, frames: 0, stickers: 0 };

  constructor(private canvas: HTMLCanvasElement, idle: WallMix) {
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.idle = makeMix(idle, 7);
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    this.reduced = mq.matches;
    mq.addEventListener("change", () => {
      this.reduced = mq.matches;
      this.kick();
    });
    addEventListener("resize", () => this.resize());
    this.resize();
    this.kick();
  }

  /** Register an image sticker (one or more frames). Loads lazily when asked. */
  add(id: string, urls: string[]) {
    if (!this.sprites.has(id)) this.sprites.set(id, { src: [], frames: [], ready: false, readyAt: 0 });
    (this.sprites.get(id) as Sprite & { urls?: string[] }).urls = urls;
  }

  /** Register an empty tile: a wave flips it off to the bare purple ground. */
  addBlank(id: string) {
    this.sprites.set(id, { src: [], frames: [], ready: true, readyAt: 0 });
  }

  /** Start loading the listed stickers (or all registered). */
  load(ids?: string[]) {
    for (const [id, s] of this.sprites) {
      if (ids && !ids.includes(id)) continue;
      const urls = (s as Sprite & { urls?: string[] }).urls;
      if (!urls || s.src.length || s.text) continue;
      const imgs = urls.map((u) => {
        const img = new Image();
        img.decoding = "async";
        img.src = u;
        return img;
      });
      s.src = imgs;
      Promise.all(imgs.map((i) => i.decode()))
        .then(() => {
          s.frames = imgs.map((i) => this.prescale(i));
          s.ready = true;
          s.readyAt = this.t;
          this.kick();
        })
        .catch(() => {
          /* a missing sticker just stays blank */
        });
    }
  }

  /** Text stickers render on the device, zero bytes. Call after the display font is ready. */
  renderText() {
    for (const [id, def] of Object.entries(TEXT_STICKERS)) {
      const c = this.drawTextSticker(def);
      const s = this.sprites.get(id);
      if (s) {
        s.frames = [c];
        s.text = def;
      } else this.sprites.set(id, { src: [], frames: [c], ready: true, readyAt: this.t, text: def });
      const sp = this.sprites.get(id)!;
      if (!sp.ready) {
        sp.ready = true;
        sp.readyAt = this.t;
      }
    }
    this.kick();
  }

  /** Flip the wall to a new sticker mix in a wave starting at a screen point. */
  setMix(mix: WallMix, origin: { x: number; y: number }, pointing: boolean) {
    this.waves.push({
      t0: this.t,
      ox: origin.x - this.px,
      oy: origin.y - this.py,
      mix: makeMix(mix, 11 + ++this.waveCount * 13),
      pointing,
    });
    if (this.waves.length > 3) this.waves.shift();
    this.kick();
  }

  /** The rectangle pointing soyjaks aim at (screen css px), or null. */
  setTarget(r: Rect | null) {
    this.target = r;
    this.dirty = true;
    if (this.reduced || this.paused) this.kick();
  }

  /** Busy: the wall churns faster while the judge thinks. */
  setBusy(b: boolean) {
    this.speedTarget = b ? 7 : 1;
  }

  setPaused(p: boolean) {
    this.paused = p;
    this.kick();
  }

  get isStill() {
    return this.reduced || this.paused;
  }

  // ---- internals -----------------------------------------------------------

  private kick() {
    this.dirty = true;
    if (!this.raf) this.raf = requestAnimationFrame((ts) => this.tick(ts));
  }

  private resize() {
    const W = innerWidth;
    const H = innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, this.dprCap);
    const cell = Math.round(Math.max(84, Math.min(138, W / 10.5)));
    const rescale = cell !== this.cell || dpr !== this.dpr || !this.W;
    if (cell !== this.cell) this.cells.clear();
    this.W = W;
    this.H = H;
    this.dpr = dpr;
    this.cell = cell;
    this.rowH = Math.round(cell * 0.84);
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.canvas.style.width = `${W}px`;
    this.canvas.style.height = `${H}px`;
    // A phone's toolbar changes only the height: keep the scaled stickers.
    if (rescale) {
      for (const s of this.sprites.values()) {
        if (s.text) s.frames = [this.drawTextSticker(s.text)];
        else if (s.ready) s.frames = s.src.map((i) => this.prescale(i as HTMLImageElement));
      }
    }
    this.kick();
  }

  /** Device-pixel copy of a sticker at the wall's display size: per-frame draws stay 1:1. */
  private prescale(img: HTMLImageElement): HTMLCanvasElement {
    const max = this.cell * 1.16 * this.dpr;
    const k = max / Math.max(img.naturalWidth, img.naturalHeight);
    const w = Math.max(1, Math.round(img.naturalWidth * k));
    const h = Math.max(1, Math.round(img.naturalHeight * k));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const x = c.getContext("2d")!;
    x.imageSmoothingQuality = "high";
    x.drawImage(img, 0, 0, w, h);
    return c;
  }

  private drawTextSticker(def: TextDef): HTMLCanvasElement {
    const d = this.dpr;
    const maxW = this.cell * 1.3 * d;
    const maxH = this.cell * 0.78 * d;
    const probe = document.createElement("canvas").getContext("2d")!;
    const words = def.text.split(" ");
    let size = this.cell * 0.34 * d;
    let lines: string[] = [];
    for (; size > 8 * d; size *= 0.92) {
      probe.font = `${size}px ${this.fontFamily}`;
      lines = [];
      let cur = "";
      for (const w of words) {
        const next = cur ? `${cur} ${w}` : w;
        if (probe.measureText(next).width > maxW - size * 0.9 && cur) {
          lines.push(cur);
          cur = w;
        } else cur = next;
      }
      lines.push(cur);
      const widest = Math.max(...lines.map((l) => probe.measureText(l).width));
      const tall = lines.length * size * 1.02;
      if ((def.lines ?? 4) >= lines.length && widest <= maxW - size * 0.9 && tall <= maxH) break;
    }
    probe.font = `${size}px ${this.fontFamily}`;
    const widest = Math.max(...lines.map((l) => probe.measureText(l).width));
    const padX = size * 0.45;
    const padY = size * 0.34;
    const rim = Math.max(3, this.cell * 0.045 * d);
    const sh = rim * 1.6;
    const bw = widest + padX * 2;
    const bh = lines.length * size * 1.0 + padY * 2;
    const c = document.createElement("canvas");
    c.width = Math.ceil(bw + rim * 2 + sh * 2);
    c.height = Math.ceil(bh + rim * 2 + sh * 2);
    const x = c.getContext("2d")!;
    const ox = sh;
    const oy = sh * 0.7;
    // white vinyl rim with a soft shadow
    x.save();
    x.shadowColor = "rgba(24,8,44,0.42)";
    x.shadowBlur = sh * 0.9;
    x.shadowOffsetY = sh * 0.45;
    x.fillStyle = "#ffffff";
    round(x, ox, oy, bw + rim * 2, bh + rim * 2, size * 0.34 + rim);
    x.fill();
    x.restore();
    x.strokeStyle = "rgba(70,60,90,0.28)";
    x.lineWidth = Math.max(1, d * 0.8);
    round(x, ox, oy, bw + rim * 2, bh + rim * 2, size * 0.34 + rim);
    x.stroke();
    // printed field
    x.fillStyle = def.bg;
    round(x, ox + rim, oy + rim, bw, bh, size * 0.3);
    x.fill();
    if (def.bg === "#ffffff") {
      x.strokeStyle = "#141116";
      x.lineWidth = Math.max(2, size * 0.07);
      round(x, ox + rim + x.lineWidth / 2, oy + rim + x.lineWidth / 2, bw - x.lineWidth, bh - x.lineWidth, size * 0.28);
      x.stroke();
    }
    x.fillStyle = def.fg;
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.font = `${size}px ${this.fontFamily}`;
    lines.forEach((l, i) => {
      x.fillText(l, ox + rim + bw / 2, oy + rim + padY + size * (i + 0.53));
    });
    return c;
  }

  info(r: number, c: number) {
    const a = hash(r, c, 1);
    const b = hash(r, c, 2);
    const e = hash(r, c, 3);
    const f = hash(r, c, 4);
    return {
      a,
      b,
      e,
      f,
      rot: (a - 0.5) * 0.52, // about +-15 degrees
      dx: (b - 0.5) * 0.3,
      dy: (e - 0.5) * 0.26,
      s: 0.84 + f * 0.16,
      z: hash(r, c, 5),
      phase: a * Math.PI * 2,
      period: 2600 + b * 1700,
    };
  }

  private pick(mix: Mix, r: number, c: number): string {
    const s = mix.seed;
    let id = at(mix, hash(r, c, s));
    const left = at(mix, hash(r, c - 1, s));
    const upA = at(mix, hash(r - 1, c, s));
    const upB = at(mix, hash(r - 1, r & 1 ? c + 1 : c - 1, s));
    if (id === left || id === upA || id === upB) id = at(mix, hash(r, c, s + 101));
    return id;
  }

  private wantFor(r: number, c: number, wx: number, wy: number, sx: number, sy: number, a: number) {
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      const arrive = w.t0 + Math.hypot(wx - w.ox, wy - w.oy) / WAVE_SPEED + a * 110;
      if (this.isStill || this.t >= arrive) {
        if (w.pointing && this.target && i === this.waves.length - 1) {
          const t = this.target;
          const ddx = Math.max(t.x - sx, 0, sx - (t.x + t.w));
          const ddy = Math.max(t.y - sy, 0, sy - (t.y + t.h));
          const ring = this.cell * 1.9;
          if (Math.hypot(ddx, ddy) < ring && hash(r, c, 9) < 0.72) {
            const u = hash(r, c, 10);
            return { id: POINTERS[u < 0.45 ? 0 : u < 0.85 ? 1 : 2], mirror: sx > t.x + t.w / 2 };
          }
        }
        const id = this.pick(w.mix, r, c);
        return { id, mirror: !NO_MIRROR.test(id) && hash(r, c, 8) < 0.3 };
      }
    }
    const id = this.pick(this.idle, r, c);
    return { id, mirror: !NO_MIRROR.test(id) && hash(r, c, 8) < 0.3 };
  }

  private tick(ts: number) {
    this.raf = 0;
    const dt = this.last ? Math.min(50, ts - this.last) : 16;
    this.last = ts;
    const still = this.isStill;
    if (!still) {
      this.t += dt;
      this.speed += (this.speedTarget - this.speed) * Math.min(1, dt / 260);
      this.px += (DRIFT.x * this.speed * dt) / 1000;
      this.py += (DRIFT.y * this.speed * dt) / 1000;
      // Adaptive quality: a long run of slow frames drops the canvas to 1x.
      this.slow = dt > 24 ? this.slow + 1 : Math.max(0, this.slow - 2);
      if (this.slow > 90 && this.dprCap > 1) {
        this.dprCap = 1;
        this.slow = 0;
        this.resize();
      }
    } else {
      this.t += dt; // keeps load timestamps sane; nothing moves
    }
    if (still && !this.dirty) {
      this.last = 0;
      return;
    }
    this.dirty = false;
    const d0 = performance.now();
    this.draw(still);
    this.stats.drawMs = this.stats.drawMs * 0.95 + (performance.now() - d0) * 0.05;
    this.stats.frames++;
    if (!still) this.raf = requestAnimationFrame((n) => this.tick(n));
    else this.last = 0;
  }

  private draw(still: boolean) {
    const { ctx, cell, rowH, dpr } = this;
    const t = this.t;
    this.frame++;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#7d2fe0";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const m = cell * 1.2;
    const c0 = Math.floor((-this.px - m) / cell) - 1;
    const c1 = Math.ceil((this.W - this.px + m) / cell);
    const r0 = Math.floor((-this.py - m) / rowH) - 1;
    const r1 = Math.ceil((this.H - this.py + m) / rowH);
    const list: Placed[] = [];
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const inf = this.info(r, c);
        const x = (c + 0.5 + (r & 1) * 0.5 + inf.dx) * cell;
        const y = (r + 0.5) * rowH + inf.dy * cell;
        list.push({ r, c, x, y, z: inf.z, inf });
      }
    }
    list.sort((p, q) => p.z - q.z);

    for (const p of list) {
      const inf = p.inf;
      const sx = p.x + this.px;
      const sy = p.y + this.py;
      const key = p.r * 65536 + p.c;
      let st = this.cells.get(key);
      const want = this.wantFor(p.r, p.c, p.x, p.y, sx, sy, inf.a);
      const wantReady = this.sprites.get(want.id)?.ready ?? false;
      if (!st) {
        st = { shown: null, mirror: want.mirror, from: null, fromMirror: false, flipAt: -1, bornAt: -1e9, seen: 0 };
        this.cells.set(key, st);
      }
      st.seen = this.frame;
      if (st.shown === null) {
        if (wantReady) {
          st.shown = want.id;
          st.mirror = want.mirror;
          st.bornAt = still ? -1e9 : t < INTRO_MS ? t + inf.b * 900 : t;
        }
      } else if ((want.id !== st.shown || want.mirror !== st.mirror) && st.flipAt < 0 && wantReady) {
        if (still) {
          st.shown = want.id;
          st.mirror = want.mirror;
        } else {
          st.from = st.shown;
          st.fromMirror = st.mirror;
          st.shown = want.id;
          st.mirror = want.mirror;
          st.flipAt = t;
        }
      }
      if (st.flipAt >= 0 && (still || t - st.flipAt >= FLIP_MS)) st.flipAt = -1;
      if (st.shown === null) continue;

      let id = st.shown;
      let mirror = st.mirror;
      let fx = 1;
      let lift = 1;
      let alpha = 1;
      let scale = inf.s;
      if (st.flipAt >= 0) {
        const q = (t - st.flipAt) / FLIP_MS;
        const cos = Math.cos(q * Math.PI);
        if (q < 0.5 && st.from) {
          id = st.from;
          mirror = st.fromMirror;
        }
        fx = Math.max(0.04, Math.abs(cos));
        lift = 1 + 0.14 * Math.sin(q * Math.PI);
      }
      if (!still && t < st.bornAt + SLAP_MS) {
        if (t < st.bornAt) continue;
        const q = (t - st.bornAt) / SLAP_MS;
        scale *= 1.5 - 0.5 * easeOutBack(q);
        alpha = Math.min(1, q * 3.5);
      }
      const sp = this.sprites.get(id);
      if (!sp || !sp.frames.length) continue;
      const frames = sp.frames;
      const img = frames.length > 1 ? frames[Math.floor(t / 430 + inf.b * 2) % frames.length] : frames[0];

      let rot = inf.rot;
      if (POINTERS.includes(id) && this.target && this.waves.length && this.waves[this.waves.length - 1].pointing) {
        const tg = this.target;
        const ang = Math.atan2(tg.y + tg.h / 2 - sy, tg.x + tg.w / 2 - sx);
        const natural = mirror ? Math.PI - 0.3 : 0.3;
        let d = ang - natural;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        rot = Math.max(-0.7, Math.min(0.7, d));
      }
      if (!still) rot += Math.sin((t / inf.period) * Math.PI * 2 + inf.phase) * (0.05 + (this.speed - 1) * 0.012);
      const k = scale * lift;
      const kx = k * fx * (mirror ? -1 : 1);
      const cs = Math.cos(rot);
      const sn = Math.sin(rot);
      ctx.globalAlpha = alpha;
      ctx.setTransform(cs * kx, sn * kx, -sn * k, cs * k, sx * dpr, sy * dpr);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
    }
    ctx.globalAlpha = 1;
    if (this.frame % 120 === 0 && this.cells.size > 1200) {
      for (const [k, v] of this.cells) if (v.seen < this.frame - 30) this.cells.delete(k);
    }
  }
}

function round(x: CanvasRenderingContext2D, X: number, Y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  x.beginPath();
  x.moveTo(X + rr, Y);
  x.arcTo(X + w, Y, X + w, Y + h, rr);
  x.arcTo(X + w, Y + h, X, Y + h, rr);
  x.arcTo(X, Y + h, X, Y, rr);
  x.arcTo(X, Y, X + w, Y, rr);
  x.closePath();
}
