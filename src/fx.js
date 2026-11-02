// DOM combat overlays: hitsplats, floating health bars and banners.
// All positions are projected from live, interpolated 3D mesh positions.

const SPLAT_LIFE_MS = 600;
const BAR_TICKS = 10;

export class Fx {
  constructor({ overlay, banner, render }) {
    this.overlay = overlay;
    this.bannerEl = banner;
    this.bannerMain = banner ? banner.querySelector('.main') : null;
    this.bannerSub = banner ? banner.querySelector('.sub') : null;
    this.render = render;

    this.splats = [];
    this.bars = new Map();
    this.bannerTimer = null;
    this.slotTick = null;
    this.slots = new Map();
  }

  banner(main, sub = '', ms = 900) {
    if (!this.bannerEl) return;
    const title = main == null ? '' : String(main);
    const isDeath = /you\s+died|you\s+are\s+dead/i.test(title);
    this.bannerEl.classList.toggle('dead', isDeath);
    if (this.bannerMain) this.bannerMain.textContent = main;
    if (this.bannerSub) this.bannerSub.textContent = sub || '';
    this.bannerEl.classList.add('visible');
    if (this.bannerTimer) {
      clearTimeout(this.bannerTimer);
      this.bannerTimer = null;
    }
    if (ms > 0) {
      this.bannerTimer = setTimeout(() => {
        this.bannerEl.classList.remove('visible');
        this.bannerTimer = null;
      }, ms);
    }
  }

  clearBanner() {
    if (this.bannerTimer) {
      clearTimeout(this.bannerTimer);
      this.bannerTimer = null;
    }
    if (this.bannerEl) {
      this.bannerEl.classList.remove('visible');
      this.bannerEl.classList.remove('dead');
    }
  }

  // ref = { kind: 'player' } or { kind: 'enemy', id }
  splat(ref, kind, text, tick) {
    if (!this.overlay) return;
    const el = document.createElement('div');
    el.className = `splat ${kind}`;
    el.textContent = text;
    el.style.opacity = '1';
    this.overlay.appendChild(el);

    const key = ref.kind === 'enemy' ? ref.id : 'player';
    if (this.slotTick !== tick) {
      this.slotTick = tick;
      this.slots.clear();
    }
    const slot = this.slots.get(key) || 0;
    this.slots.set(key, slot + 1);

    const offsets = [0, -20, 20, -34, 34];
    const ox = offsets[slot % offsets.length];
    const oy = slot >= offsets.length ? -12 : 0;

    this.splats.push({ el, ref, born: performance.now(), ox, oy, last: null });
  }

  clearTransient() {
    for (const s of this.splats) s.el.remove();
    this.splats.length = 0;
    for (const bar of this.bars.values()) bar.el.remove();
    this.bars.clear();
    this.slots.clear();
    this.slotTick = null;
    this.clearBanner();
  }

  _ensureBar(key, isPlayer) {
    let bar = this.bars.get(key);
    if (!bar) {
      const el = document.createElement('div');
      el.className = isPlayer ? 'hpbar player' : 'hpbar enemy';
      const fill = document.createElement('div');
      fill.className = 'fill';
      el.appendChild(fill);
      this.overlay.appendChild(el);
      bar = { el, fill };
      this.bars.set(key, bar);
    }
    return bar;
  }

  update(tick, entities, now = performance.now()) {
    // Hitsplats float up and fade over roughly one tick.
    for (let i = this.splats.length - 1; i >= 0; i--) {
      const s = this.splats[i];
      const age = now - s.born;
      if (age >= SPLAT_LIFE_MS) {
        s.el.remove();
        this.splats.splice(i, 1);
        continue;
      }
      const p = Math.max(0, Math.min(1, age / SPLAT_LIFE_MS));
      const yOffset = s.ref.kind === 'player' ? 2.05 : 1.4;
      const anchor = this.render.entityScreen(s.ref, yOffset);
      if (anchor) s.last = anchor;
      if (!s.last) {
        s.el.style.opacity = '0';
        continue;
      }
      s.el.style.left = `${s.last.x + s.ox}px`;
      s.el.style.top = `${s.last.y + s.oy - 28 * p}px`;
      s.el.style.opacity = String(1 - p * p);
      s.el.style.transform = `translate(-50%, -50%) scale(${(1.12 - 0.12 * p).toFixed(3)})`;
    }

    // Health bars: any entity damaged within the last 10 ticks.
    const active = new Set();
    const entries = [];
    if (entities.player) {
      entries.push({ key: 'player', ref: { kind: 'player' }, ent: entities.player, y: 2.1, isPlayer: true });
    }
    if (entities.enemies) {
      for (const e of entities.enemies) {
        entries.push({ key: e.id, ref: { kind: 'enemy', id: e.id }, ent: e, y: 1.5, isPlayer: false });
      }
    }

    const placed = [];
    for (const it of entries) {
      const ent = it.ent;
      const alive = it.isPlayer ? ent.hp > 0 : ent.alive;
      if (!alive) continue;
      if (ent.damageTick == null) continue;
      if (tick - ent.damageTick > BAR_TICKS) continue;

      active.add(it.key);
      const bar = this._ensureBar(it.key, it.isPlayer);
      const scr = this.render.entityScreen(it.ref, it.y);
      if (!scr) {
        bar.el.style.display = 'none';
        continue;
      }
      bar.el.style.display = 'block';
      bar.el.style.zIndex = it.isPlayer ? '1' : '2';
      const frac = Math.max(0, Math.min(1, ent.hp / ent.maxHp));
      bar.fill.style.width = `${(frac * 100).toFixed(1)}%`;
      placed.push({ bar, x: scr.x, y: scr.y, isPlayer: it.isPlayer });
    }

    // Lay bars out by screen position. A wolf north of the player can be
    // visually hidden behind the player model, so make sure its bar is clearly
    // above the player's bar rather than sharing the same screen row.
    const playerBar = placed.find((p) => p.isPlayer) || null;
    if (playerBar) {
      for (const p of placed) {
        if (p.isPlayer) continue;
        if (Math.abs(p.x - playerBar.x) < 48 && p.y > playerBar.y - 10) {
          p.y = playerBar.y - 10;
        }
      }
    }

    for (const p of placed) {
      p.bar.el.style.left = `${p.x}px`;
      p.bar.el.style.top = `${p.y}px`;
    }

    for (const [key, bar] of Array.from(this.bars.entries())) {
      if (!active.has(key)) {
        bar.el.remove();
        this.bars.delete(key);
      }
    }
  }
}
