interface WindowState {
  startMs: number;
  count: number;
}

export class FixedWindowRateLimiter {
  private readonly windows = new Map<string, WindowState>();

  allow(key: string, maxPerWindow: number, windowMs: number, nowMs = Date.now()): boolean {
    const existing = this.windows.get(key);
    if (!existing || (nowMs - existing.startMs) >= windowMs) {
      this.windows.set(key, { startMs: nowMs, count: 1 });
      return true;
    }

    if (existing.count >= maxPerWindow) {
      return false;
    }

    existing.count += 1;
    return true;
  }
}
