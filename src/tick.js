// Fixed game tick clock, decoupled from rendering.
// alpha is the 0..1 progress through the current tick (for interpolation).

export const TICK_MS = 600;

export class Ticker {
  constructor(tickMs = TICK_MS) {
    this.tickMs = tickMs;
    this.tick = 0;
    this.acc = 0;
    this.alpha = 0;
    this.paused = false;
    this.lastTime = -1;
    this.callbacks = [];
  }

  subscribe(fn) {
    this.callbacks.push(fn);
    return () => {
      const i = this.callbacks.indexOf(fn);
      if (i >= 0) this.callbacks.splice(i, 1);
    };
  }

  setPaused(value) {
    const v = !!value;
    if (this.paused === v) return;
    this.paused = v;
    // Resync the clock on resume so we never consume a giant backlog.
    if (!v) this.lastTime = -1;
  }

  // Called once per rendered frame with a DOMHighResTimeStamp.
  update(now) {
    if (this.lastTime < 0) {
      this.lastTime = now;
      return;
    }
    if (this.paused) return;

    let dt = now - this.lastTime;
    this.lastTime = now;
    // Clamp to avoid a spiral of death after tab switches / long stalls.
    if (dt < 0) dt = 0;
    if (dt > this.tickMs * 5) dt = this.tickMs * 5;

    this.acc += dt;
    let guard = 0;
    while (this.acc >= this.tickMs && guard < 6) {
      this.acc -= this.tickMs;
      this.tick++;
      guard++;
      for (const cb of this.callbacks) cb(this.tick);
    }
    if (this.acc >= this.tickMs) this.acc = this.tickMs - 0.0001; // safety
    this.alpha = Math.min(1, Math.max(0, this.acc / this.tickMs));
  }
}
