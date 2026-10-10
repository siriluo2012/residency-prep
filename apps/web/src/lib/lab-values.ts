/** Common reference ranges shown in the exam-style lab values panel. Values are conventional adult ranges. */
export const LAB_VALUES: { group: string; rows: [string, string][] }[] = [
  {
    group: "Serum",
    rows: [
      ["Sodium (Na+)", "136–146 mEq/L"],
      ["Potassium (K+)", "3.5–5.0 mEq/L"],
      ["Chloride (Cl−)", "95–105 mEq/L"],
      ["Bicarbonate (HCO3−)", "22–28 mEq/L"],
      ["Urea nitrogen (BUN)", "7–18 mg/dL"],
      ["Creatinine", "0.6–1.2 mg/dL"],
      ["Glucose, fasting", "70–100 mg/dL"],
      ["Calcium", "8.4–10.2 mg/dL"],
      ["Magnesium", "1.5–2.0 mEq/L"],
      ["Phosphorus", "3.0–4.5 mg/dL"],
      ["Osmolality", "275–295 mOsmol/kg H2O"],
      ["Lactate", "0.5–2.2 mmol/L"],
    ],
  },
  {
    group: "Liver / Pancreas",
    rows: [
      ["ALT", "10–40 U/L"],
      ["AST", "12–38 U/L"],
      ["Alkaline phosphatase", "25–100 U/L"],
      ["Bilirubin, total", "0.1–1.0 mg/dL"],
      ["Bilirubin, direct", "0.0–0.3 mg/dL"],
      ["Albumin", "3.5–5.5 g/dL"],
      ["Amylase", "25–125 U/L"],
      ["Lipase", "10–140 U/L"],
    ],
  },
  {
    group: "Endocrine",
    rows: [
      ["TSH", "0.4–4.0 μU/mL"],
      ["Thyroxine (T4), free", "0.9–1.7 ng/dL"],
      ["Cortisol, 8 AM", "5–23 μg/dL"],
      ["Prolactin", "< 20 ng/mL"],
      ["Hemoglobin A1c", "≤ 6%"],
    ],
  },
  {
    group: "Blood",
    rows: [
      ["Hemoglobin, male / female", "13.5–17.5 / 12.0–16.0 g/dL"],
      ["Hematocrit, male / female", "41–53% / 36–46%"],
      ["Leukocytes", "4,500–11,000/mm3"],
      ["Platelets", "150,000–400,000/mm3"],
      ["MCV", "80–100 fL"],
      ["Reticulocytes", "0.5–1.5%"],
      ["PT", "11–15 s"],
      ["PTT (activated)", "25–40 s"],
      ["ESR, male / female", "0–15 / 0–20 mm/h"],
    ],
  },
  {
    group: "Arterial blood gas",
    rows: [
      ["pH", "7.35–7.45"],
      ["PCO2", "33–45 mm Hg"],
      ["PO2", "75–105 mm Hg"],
    ],
  },
  {
    group: "Cerebrospinal fluid",
    rows: [
      ["Cell count", "0–5/mm3"],
      ["Glucose", "40–70 mg/dL"],
      ["Protein", "< 40 mg/dL"],
      ["Pressure", "70–180 mm H2O"],
    ],
  },
  {
    group: "Urine",
    rows: [
      ["Osmolality", "50–1200 mOsmol/kg H2O"],
      ["Protein", "< 150 mg/24 h"],
      ["Specific gravity", "1.003–1.030"],
    ],
  },
];
