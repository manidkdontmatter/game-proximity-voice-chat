import { describe, expect, it } from "vitest";
import { FixedWindowRateLimiter } from "../src/rate-limit.js";

describe("FixedWindowRateLimiter", () => {
  it("allows up to max in same window", () => {
    const limiter = new FixedWindowRateLimiter();
    const now = 1000;

    expect(limiter.allow("k", 2, 60_000, now)).toBe(true);
    expect(limiter.allow("k", 2, 60_000, now + 1)).toBe(true);
    expect(limiter.allow("k", 2, 60_000, now + 2)).toBe(false);
  });

  it("resets after window", () => {
    const limiter = new FixedWindowRateLimiter();
    const now = 1000;

    expect(limiter.allow("k", 1, 100, now)).toBe(true);
    expect(limiter.allow("k", 1, 100, now + 50)).toBe(false);
    expect(limiter.allow("k", 1, 100, now + 101)).toBe(true);
  });
});
