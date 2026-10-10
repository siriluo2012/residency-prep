import { describe, expect, it } from "vitest";
import { heuristicGrade } from "./oet-grader";

const POINTS = [
  "Newly diagnosed type 2 diabetes",
  "HbA1c 9.2%",
  "Metformin 500 mg twice daily started",
  "BMI 34",
  "Please accept for education and further management",
];

const GOOD = `Dear Dr Chen,

I am writing to refer Mr James Ortiz, a 54-year-old man, for education and further management of newly diagnosed type 2 diabetes.

He presented this week with thirst and polyuria. Random glucose was 18 mmol/L and HbA1c 9.2%. BMI is 34. There is a family history of type 2 diabetes. He does not smoke.

I have started metformin 500 mg twice daily, given diet advice, and requested urine ACR and a lipid profile. Blood pressure today was 138/84 mmHg.

Please accept him for diabetes education and further management. I would be grateful if you could also advise on whether a second agent is needed.

Yours sincerely,
Dr A. Patel
General Practitioner`;

describe("heuristicGrade", () => {
  it("scores a complete referral around grade B", () => {
    const g = heuristicGrade(GOOD, {
      keyPoints: POINTS,
      recipient: "Dr Chen, Endocrinologist",
      instruction: "Write a referral letter",
      wordLimit: 200,
    });
    expect(g.source).toBe("heuristic");
    expect(g.overall_score).toBeGreaterThanOrEqual(300);
    expect(g.missed_key_points.length).toBeLessThan(3);
    expect(g.criteria).toHaveLength(6);
  });

  it("penalises a short informal note", () => {
    const g = heuristicGrade("hey, can you see this guy? thanks", {
      keyPoints: POINTS,
      recipient: "Dr Chen, Endocrinologist",
      instruction: "Write a referral letter",
      wordLimit: 200,
    });
    expect(g.overall_score).toBeLessThan(300);
    expect(g.missed_key_points.length).toBeGreaterThan(0);
  });
});
