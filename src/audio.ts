// Sound for the one screen: Web Audio, loaded lazily after the first user gesture.
// Every sound ships as .ogg (Opus) and .mp3; .ogg wins where the browser can play it, and loops
// always go through Web Audio (AudioBufferSourceNode.loop) so they stay gapless.
// Two switches, both remembered: sound effects (on after the first click) and music (off until asked):
// the owner's own Suno song "Save The Shrimps", looped.
// Browsers keep an AudioContext suspended when it is made outside a real user activation (Firefox and Zen:
// a bare Cmd, Ctrl, Alt, Shift or Esc keydown does not count, so the Cmd of Cmd+V does not), and they can
// suspend a running one later (a media key, a system interruption, a background tab). So the context is only
// made on an activating gesture, every later gesture resumes it while it is not running, and a sound asked for
// while it is suspended is dropped rather than queued to burst out late.

export type Sfx =
  | "sfx-keysmash" | "sfx-slot-count" | "sfx-boom" | "sfx-cha-ching" | "sfx-squish" | "sfx-scratch" | "sfx-airhorn"
  | "sfx-blub" | "sfx-nerd-gasp" | "sfx-sad-trombone" | "sfx-synth-stab" | "sfx-evil-laugh"
  | "bark-ackshually" | "bark-based" | "bark-cringe" | "bark-shrimp-council" | "bark-welfare-zero"
  | "vo-ai-god" | "vo-bug-lives" | "vo-date-shrimp" | "vo-nooo" | "vo-polycule" | "vo-save-shrimps" | "vo-trillions"
  | "loop-chant" | "loop-swarm";

const BASE = `${import.meta.env.BASE_URL}audio/`;
const MUSIC = "site-loop";

/** Verdict cue -> what plays when the number lands (in order, each after the last). */
export const VERDICT: Record<string, Sfx[]> = {
  net_negative: ["vo-nooo", "sfx-sad-trombone"],
  saint: ["vo-polycule"],
  ea: ["sfx-blub", "vo-date-shrimp"],
  shrimp: ["vo-save-shrimps", "bark-shrimp-council"],
  doomer: ["vo-ai-god"],
  troll: ["sfx-synth-stab", "vo-trillions", "bark-based"],
  worst: ["sfx-squish", "vo-nooo"],
  hacker: ["sfx-evil-laugh"],
  bugs: ["vo-bug-lives"],
  shrimps: ["vo-save-shrimps"],
};

const store = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private window: the switch still works for this visit */
    }
  },
};

const K_SFX = "ea.sfx";
const K_MUSIC = "ea.music";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();
let ext: "ogg" | "mp3" = "mp3";
let unlocked = false;
let sfxOn = store.get(K_SFX) !== "off";
let musicOn = store.get(K_MUSIC) === "on";
let musicNode: AudioBufferSourceNode | null = null;
const loops = new Map<string, { src: AudioBufferSourceNode; gain: GainNode }>();
let seq = 0; // bumps on every new verdict, so a stale sequence stops
const listeners = new Set<() => void>();
const GESTURES = ["pointerdown", "pointerup", "mousedown", "click", "keydown", "keyup", "touchend"] as const;
const QUIET_KEYS = new Set(["Meta", "OS", "Control", "Alt", "AltGraph", "Shift", "CapsLock", "Fn", "FnLock", "Escape", "Dead", "Unidentified"]);

function pickExt(): "ogg" | "mp3" {
  try {
    const a = document.createElement("audio");
    return a.canPlayType('audio/ogg; codecs="opus"') ? "ogg" : "mp3";
  } catch {
    return "mp3";
  }
}

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.connect(ctx.destination);
  sfxBus = ctx.createGain();
  sfxBus.gain.value = sfxOn ? 0.8 : 0;
  sfxBus.connect(master);
  musicBus = ctx.createGain();
  musicBus.gain.value = 0.42;
  musicBus.connect(master);
  ext = pickExt();
  return ctx;
}

function load(id: string): Promise<AudioBuffer | null> {
  let p = buffers.get(id);
  if (p) return p;
  const c = ensure();
  if (!c) return Promise.resolve(null);
  const get = (e: string) =>
    fetch(`${BASE}${id}.${e}`).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.arrayBuffer();
    });
  const first = ext;
  p = get(first)
    .then((b) => c.decodeAudioData(b))
    .catch(() => {
      if (first !== "ogg") throw new Error("decode");
      return get("mp3").then(async (b) => {
        const out = await c.decodeAudioData(b);
        ext = "mp3"; // this browser says it plays Opus but could not decode it: use mp3 from now on
        return out;
      });
    })
    .catch(() => {
      buffers.delete(id); // one failed fetch or decode must not silence this sound for the rest of the visit
      return null;
    });
  buffers.set(id, p);
  return p;
}

/** Ask a context that is not running to run. Cheap when it already runs. */
function wake() {
  if (!ctx || ctx.state === "running" || ctx.state === "closed") return;
  void ctx.resume().catch(() => {});
}

/** True when the event being handled cannot start audio (an untrusted event, or a modifier or Esc keydown). */
function quietEvent(): boolean {
  const e = (window as unknown as { event?: Event }).event;
  if (!e) return false;
  if (!e.isTrusted) return true;
  return e instanceof KeyboardEvent && (QUIET_KEYS.has(e.key) || e.type === "keyup");
}

/** Wait (briefly) for the context to run; the answer is whether it runs now. */
function running(c: AudioContext, ms = 350): Promise<boolean> {
  if (c.state === "running") return Promise.resolve(true);
  wake();
  return new Promise((done) => {
    const t = setTimeout(finish, ms);
    function finish() {
      clearTimeout(t);
      c.removeEventListener("statechange", check);
      done(c.state === "running");
    }
    function check() {
      if (c.state === "running") finish();
    }
    c.addEventListener("statechange", check);
  });
}

// Every real gesture: the first one unlocks (as main.ts also asks), later ones wake a suspended context.
function onGesture(e: Event) {
  if (!e.isTrusted) return;
  if (!unlocked) unlock();
  else wake();
}
function onVisible() {
  if (document.visibilityState === "visible") wake();
}
try {
  for (const type of GESTURES) addEventListener(type, onGesture, { capture: true, passive: true });
  document.addEventListener("visibilitychange", onVisible);
  addEventListener("pageshow", onVisible);
} catch {
  /* no window (tests): nothing to listen to */
}

/** Call on the first user gesture: makes the context, fetches the common sounds.
 *  A gesture that cannot start audio (the Cmd of Cmd+V) waits for the next one, which the listeners above catch. */
export function unlock() {
  if (unlocked) {
    wake();
    return;
  }
  if (quietEvent()) return;
  const c = ensure();
  if (!c) return;
  unlocked = true;
  void c.resume().catch(() => {});
  const warm = () => {
    for (const id of ["sfx-keysmash", "sfx-slot-count", "sfx-boom", "sfx-scratch", "sfx-cha-ching", "loop-swarm"]) void load(id);
  };
  if (sfxOn) warm();
  if (musicOn) void startMusic();
  emit();
}

function emit() {
  for (const fn of listeners) fn();
}

export function onChange(fn: () => void) {
  listeners.add(fn);
}

export const state = () => ({ sfx: sfxOn, music: musicOn, unlocked });

/** Play one sound now; `maxMs` cuts it short with a quick fade. Resolves when it ends. */
export async function play(id: Sfx, gain = 1, maxMs = 0): Promise<void> {
  if (!sfxOn || !unlocked) return;
  const c = ensure();
  if (!c) return;
  wake();
  const buf = await load(id);
  if (!buf || !sfxBus || !sfxOn) return;
  // A suspended context would hold this sound and fire it later, on top of whatever plays then: skip it.
  if (!(await running(c)) || !sfxOn) return;
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(g).connect(sfxBus);
  src.start();
  let ms = buf.duration * 1000;
  if (maxMs > 0 && maxMs < ms) {
    ms = maxMs;
    const end = c.currentTime + maxMs / 1000;
    g.gain.setValueAtTime(gain, end - 0.08);
    g.gain.linearRampToValueAtTime(0, end);
    src.stop(end + 0.02);
  }
  // onended never comes if the context is suspended mid-sound; a timer keeps sequences moving.
  await new Promise<void>((r) => {
    const t = setTimeout(r, ms + 400);
    src.onended = () => {
      clearTimeout(t);
      r();
    };
  });
}

/** Play a list one after another; a newer sequence cancels this one between sounds. */
export async function sequence(ids: Sfx[], gapMs = 120): Promise<boolean> {
  const mine = ++seq;
  for (const id of ids) {
    if (mine !== seq || !sfxOn) return false;
    await play(id);
    await new Promise((r) => setTimeout(r, gapMs));
  }
  return mine === seq;
}

export function cancelSequence() {
  seq++;
}

/** A looped sound effect (the swarm while weighing, the chant under the arguing soldiers). */
export async function loop(id: Sfx, gain = 0.5, ms = 0) {
  if (!sfxOn || !unlocked || loops.has(id)) return;
  const c = ensure();
  const buf = await load(id);
  if (!c || !buf || !sfxBus || loops.has(id) || !sfxOn) return;
  wake();
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const g = c.createGain();
  g.gain.setValueAtTime(0, c.currentTime);
  g.gain.linearRampToValueAtTime(gain, c.currentTime + 0.25);
  src.connect(g).connect(sfxBus);
  src.start();
  loops.set(id, { src, gain: g });
  if (ms > 0) setTimeout(() => stopLoop(id), ms);
}

export function stopLoop(id: Sfx) {
  const l = loops.get(id);
  if (!l || !ctx) return;
  loops.delete(id);
  l.gain.gain.cancelScheduledValues(ctx.currentTime);
  l.gain.gain.setValueAtTime(l.gain.gain.value, ctx.currentTime);
  l.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
  l.src.stop(ctx.currentTime + 0.35);
}

async function startMusic() {
  const c = ensure();
  if (!c || musicNode) return;
  const buf = await load(MUSIC);
  if (!buf || !musicBus || !musicOn || musicNode) return;
  wake();
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.loopStart = 0;
  src.loopEnd = buf.duration;
  src.connect(musicBus);
  src.start();
  musicNode = src;
}

function stopMusic() {
  musicNode?.stop();
  musicNode = null;
}

export function setSfx(on: boolean) {
  sfxOn = on;
  store.set(K_SFX, on ? "on" : "off");
  if (sfxBus && ctx) sfxBus.gain.setTargetAtTime(on ? 0.8 : 0, ctx.currentTime, 0.02);
  if (on) wake();
  if (!on) {
    cancelSequence();
    for (const id of [...loops.keys()]) stopLoop(id as Sfx);
  }
  emit();
}

export function setMusic(on: boolean) {
  musicOn = on;
  store.set(K_MUSIC, on ? "on" : "off");
  if (on) {
    unlock();
    void ctx?.resume().catch(() => {});
    void startMusic();
  } else stopMusic();
  emit();
}
