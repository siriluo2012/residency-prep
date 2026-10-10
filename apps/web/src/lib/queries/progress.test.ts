import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));

import { buildPlan, type SystemStat } from "./progress";

const sys = (over: Partial<SystemStat>): SystemStat => ({
  topicId: "x",
  name: "X",
  weightMin: 5,
  weightMax: 10,
  attempted: 0,
  correct: 0,
  accuracy: null,
  avgTimeMs: null,
  available: 100,
  coverageRatio: null,
  ...over,
});

describe("buildPlan", () => {
  it("computes a daily target with a review buffer", () => {
    const examDate = new Date(Date.now() + 30 * 86_400_000);
    const plan = buildPlan({ examDate, remainingQuestions: 1000, systems: [], dailyGoal: 40 });
    expect(plan.daysLeft).toBe(30);
    expect(plan.reviewBufferDays).toBe(4);
    expect(plan.studyDays).toBe(26);
    expect(plan.dailyNeeded).toBe(Math.ceil(1000 / 26));
  });

  it("falls back to the daily goal without an exam date", () => {
    const plan = buildPlan({ examDate: null, remainingQuestions: 500, systems: [], dailyGoal: 40 });
    expect(plan.daysLeft).toBeNull();
    expect(plan.dailyNeeded).toBe(40);
  });

  it("prioritizes weak, heavily weighted, under-covered systems", () => {
    const systems = [
      sys({ topicId: "strong-heavy", weightMin: 12, weightMax: 16, accuracy: 0.9, coverageRatio: 1 }),
      sys({ topicId: "weak-heavy", weightMin: 12, weightMax: 16, accuracy: 0.5, coverageRatio: 0.4 }),
      sys({ topicId: "weak-light", weightMin: 1, weightMax: 3, accuracy: 0.4, coverageRatio: 0.2 }),
      sys({ topicId: "empty", available: 0 }),
    ];
    const plan = buildPlan({ examDate: null, remainingQuestions: 100, systems, dailyGoal: 40 });
    expect(plan.focus[0].topicId).toBe("weak-heavy");
    expect(plan.focus.map((f) => f.topicId)).not.toContain("empty");
  });
});
