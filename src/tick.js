// Fixed game tick clock, decoupled from rendering.
// alpha is the 0..1 progress through the current tick (for interpolation).

export const TICK_MS = 600;

export class Ticker {
  constructor(tickMs = TICK_MS) {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();

    this.tickMs = tickMs;
    this.tick = 0;
    this.paused = false;
    this.callbacks = [];

    this.lastTickTime = now;
    this.nextTickTime = now + this.tickMs;
    this.alpha = 0;

    this._onVisibilityChange = () => {
      if (!document.hidden) this.resync();
    };
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', this._onVisibilityChange);
    }
  }

  subscribe(fn) {
    this.callbacks.push(fn);
    return () => {
      const i = this.callbacks.indexOf(fn);
      if (i >= 0) this.callbacks.splice(i, 1);
    };
  }

  // Resync rather than consuming a backlog after a pause, tab switch or stall.
  // Alpha is held at 1 until the next scheduled tick so the mesh does not snap
  // backward to the previous tile after a resumed tab.
  resync(now = (typeof performance !== 'undefined' ? performance.now() : Date.now())) {
    this.lastTickTime = now - this.tickMs;
    this.nextTickTime = now + this.tickMs;
    this.alpha = 1;
  }

  setPaused(value) {
    const v = !!value;
    if (this.paused === v) return;
    this.paused = v;
    this.resync();
  }

  // Called once per rendered frame with a DOMHighResTimeStamp.
  update(now) {
    if (this.paused) return;
    if (!Number.isFinite(now)) return;

    if (now < this.lastTickTime) {
      this.resync(now);
      return;
    }

    if (now >= this.nextTickTime) {
      const due = Math.floor((now - this.nextTickTime) / this.tickMs) + 1;

      // More than two missed ticks means a hidden tab or long stall: resync
      // instead of bursting through the backlog.
      if (due > 2) {
        this.resync(now);
        return;
      }

      for (let i = 0; i < due; i++) {
        this.lastTickTime = this.nextTickTime;
        this.nextTickTime += this.tickMs;
        this.tick++;
        for (const cb of this.callbacks) cb(this.tick);
      }
    }

    this.alpha = Math.min(1, Math.max(0, (now - this.lastTickTime) / this.tickMs));
  }
}
