import { describe, expect, it } from "vitest";
import { applyRating, humanInterval, newCardRow, previewIntervals } from "./fsrs";

describe("fsrs wrapper", () => {
  it("creates a new card due now", () => {
    const now = new Date("2026-10-08T12:00:00Z");
    const row = newCardRow(now);
    expect(row.state).toBe("new");
    expect(row.reps).toBe(0);
    expect(row.due.getTime()).toBe(now.getTime());
  });

  it("Good on a new card schedules it later than Again", () => {
    const now = new Date("2026-10-08T12:00:00Z");
    const base = { ...newCardRow(now), suspended: false, buriedUntil: null };
    const again = applyRating(base, 1, now);
    const good = applyRating(base, 3, now);
    const easy = applyRating(base, 4, now);
    expect(again.card.due.getTime()).toBeLessThan(good.card.due.getTime());
    expect(good.card.due.getTime()).toBeLessThan(easy.card.due.getTime());
    expect(good.card.reps).toBe(1);
    expect(good.log.rating).toBe(3);
  });

  it("intervals grow with repeated Good ratings", () => {
    let now = new Date("2026-10-08T12:00:00Z");
    let row = { ...newCardRow(now), suspended: false, buriedUntil: null };
    const gaps: number[] = [];
    for (let i = 0; i < 4; i++) {
      const { card } = applyRating(row, 3, now);
      gaps.push(card.due.getTime() - now.getTime());
      row = { ...row, ...card };
      now = card.due;
    }
    expect(gaps[3]).toBeGreaterThan(gaps[0]);
  });

  it("previewIntervals returns four labels", () => {
    const now = new Date();
    const iv = previewIntervals(newCardRow(now), now);
    expect(Object.keys(iv)).toEqual(["1", "2", "3", "4"]);
    expect(typeof iv[3].label).toBe("string");
  });

  it("humanInterval formats", () => {
    expect(humanInterval(30_000)).toBe("1m");
    expect(humanInterval(3 * 3_600_000)).toBe("3h");
    expect(humanInterval(5 * 86_400_000)).toBe("5d");
    expect(humanInterval(400 * 86_400_000)).toBe("1.1y");
  });
});
