"""Stage hand-authored OET Medicine practice tasks (no API key)."""
# Clinical prose is allowed to run long.
# ruff: noqa: E501

from __future__ import annotations

from rich.console import Console

from ..models import (
    OetComprehensionItem,
    OetComprehensionPayload,
    OetSpeakingPayload,
    OetTask,
    OetWritingPayload,
    Provenance,
)
from ..sink import FileSink

console = Console()

PROV = Provenance(
    source="human",
    license="original",
    attribution="Residency Prep contributors",
    generation_batch="oet-reference-20261009",
    ai_drafted=False,
)


def _tasks() -> list[OetTask]:
    writing = OetTask(
        id="oet-ref-writing-t2dm",
        subtest="writing",
        title="Referral: newly diagnosed type 2 diabetes",
        payload=OetWritingPayload(
            case_notes=(
                "City Medical Centre — Outpatient notes\n"
                "Date: 12 March 2026\n"
                "Patient: Mr James Ortiz, 54 years, warehouse supervisor\n"
                "Reason for visit: 4 weeks of thirst, polyuria, blurred vision, 4 kg weight loss\n\n"
                "PMH: hypertension (ramipril 5 mg daily); no previous diabetes\n"
                "FH: mother type 2 diabetes\n"
                "SH: never smoked; alcohol 8 units/week; BMI 34 kg/m²\n\n"
                "Exam: BP 138/84 mmHg; otherwise unremarkable; no foot ulcers; fundi not dilated today\n"
                "Investigations: random glucose 18.1 mmol/L; HbA1c 9.2% (77 mmol/mol); urine glucose 3+, ketones negative; creatinine 78 µmol/L; eGFR 92\n"
                "Plan: started metformin 500 mg twice daily with food; diet sheet given; urine ACR and fasting lipids requested\n"
                "Request: refer to diabetes education and endocrine clinic for further management, including whether a second agent is needed now"
            ),
            task_instruction=(
                "Using the case notes, write a letter to Dr Mei Chen, Endocrinologist, referring Mr Ortiz. "
                "Explain why you are writing and give the relevant history, findings and current plan. "
                "Do not use note form."
            ),
            recipient="Dr Mei Chen, Endocrinologist, Riverside Hospital",
            word_limit=200,
            key_content_points=[
                "Newly diagnosed type 2 diabetes after thirst, polyuria and weight loss",
                "HbA1c 9.2% and random glucose 18.1 mmol/L, ketones negative",
                "BMI 34 and family history of type 2 diabetes",
                "Hypertension treated with ramipril",
                "Metformin 500 mg twice daily started",
                "Please accept for education and advice on a second agent",
            ],
            model_answer=(
                "Dear Dr Chen,\n\n"
                "I am writing to refer Mr James Ortiz, a 54-year-old warehouse supervisor, for education and "
                "further management of newly diagnosed type 2 diabetes.\n\n"
                "He presented with four weeks of thirst, polyuria, blurred vision and 4 kg of weight loss. Random "
                "glucose was 18.1 mmol/L and HbA1c 9.2%. Urine ketones were negative. BMI is 34 kg/m² and his mother "
                "has type 2 diabetes. He takes ramipril 5 mg daily for hypertension, does not smoke, and drinks 8 units of alcohol a week.\n\n"
                "I have started metformin 500 mg twice daily and requested urine ACR and a lipid profile. Blood pressure today was 138/84 mmHg. "
                "Feet are intact; dilated fundoscopy has not yet been done.\n\n"
                "Please accept him for diabetes education and advise whether a second glucose-lowering agent is needed now.\n\n"
                "Yours sincerely,\nDr A. Patel\nGeneral Practitioner"
            ),
        ),
        provenance=PROV,
        status="draft",
    )
    reading = OetTask(
        id="oet-ref-reading-discharge",
        subtest="reading",
        part="A",
        title="Discharge summary: community-acquired pneumonia",
        payload=OetComprehensionPayload(
            passage=(
                "Discharge summary — Ward 7B, 9 March 2026\n"
                "Mrs Elena Varga, 71, admitted 4 March with fever, productive cough and confusion. "
                "Chest radiograph showed right lower-lobe consolidation. CURB-65 score 3 (confusion, urea 9.1 mmol/L, age). "
                "Blood cultures negative. Sputum grew Streptococcus pneumoniae sensitive to penicillin.\n\n"
                "Treatment: IV benzylpenicillin 1.2 g QID for 48 hours, then oral amoxicillin 500 mg TDS to complete 5 days in total. "
                "Oxygen weaned; saturations 96% on air at rest. Mobilising independently. Confusion resolved by day 2.\n\n"
                "Other issues: CKD stage 3 (baseline creatinine 128 µmol/L, discharge 134). Hold ramipril until GP reviews renal function in 1 week. "
                "Influenza and pneumococcal vaccines overdue — GP to arrange.\n\n"
                "Follow-up: chest radiograph in 6 weeks via GP to confirm resolution. Return sooner if fever or breathlessness recurs. "
                "No home oxygen. Smoking cessation discussed; she has cut from 15 to 5 cigarettes/day and accepted a varenicline prescription."
            ),
            items=[
                OetComprehensionItem(
                    type="mcq",
                    prompt="What was the CURB-65 score on admission, and which elements scored?",
                    options=[
                        "2 — confusion and age",
                        "3 — confusion, urea and age",
                        "3 — urea, respiratory rate and age",
                        "4 — confusion, urea, blood pressure and age",
                    ],
                    answer="3 — confusion, urea and age",
                    explanation="The summary lists CURB-65 of 3 from confusion, urea 9.1 mmol/L, and age. Respiratory rate and blood pressure are not given as scoring items.",
                ),
                OetComprehensionItem(
                    type="short_answer",
                    prompt="Which antibiotic and duration complete the course after IV benzylpenicillin?",
                    answer="oral amoxicillin 500 mg TDS to complete 5 days in total",
                    accepted_answers=["amoxicillin 500 mg TDS to complete 5 days", "oral amoxicillin 5 days total"],
                    explanation="IV benzylpenicillin for 48 hours then oral amoxicillin 500 mg three times daily, total duration 5 days.",
                ),
                OetComprehensionItem(
                    type="mcq",
                    prompt="What should the GP do about ramipril?",
                    options=[
                        "Restart the admission dose immediately",
                        "Increase the dose because of CKD",
                        "Hold it and review renal function in 1 week",
                        "Switch to an angiotensin-receptor blocker",
                    ],
                    answer="Hold it and review renal function in 1 week",
                    explanation="Ramipril is held until the GP reviews renal function in one week; creatinine is slightly above her CKD-3 baseline.",
                ),
                OetComprehensionItem(
                    type="gap_fill",
                    prompt="The follow-up chest radiograph should be arranged in _____ weeks.",
                    answer="6",
                    accepted_answers=["six"],
                    explanation="The summary asks for a chest radiograph in 6 weeks via the GP.",
                ),
            ],
        ),
        provenance=PROV,
        status="draft",
    )
    listening = OetTask(
        id="oet-ref-listening-handover",
        subtest="listening",
        part="B",
        title="Handover: overnight chest pain",
        payload=OetComprehensionPayload(
            passage=(
                "[Transcript of a 90-second ward handover. No audio file in the local build; read as a listening item.]\n\n"
                "Night registrar: Just to flag Mr David Cole in bay 4. Fifty-eight, came in at 02:10 with 40 minutes of central chest pressure "
                "radiating to the left arm, associated with sweating. Troponin I at 3 hours was 86 ng/L — our 99th centile is 14. ECG showed "
                "1 mm ST depression in V4 to V6, no ST elevation, no Q waves. Aspirin 300 mg and ticagrelor 180 mg given in ED, heparin infusion running. "
                "He's pain-free now on 2 litres of oxygen. Cardiology want him for angiography this morning, first slot, nil by mouth from 06:00. "
                "He's a type 2 diabetic on metformin — hold the morning dose. Allergies: morphine, so we used fentanyl. "
                "If pain returns, repeat ECG and call me; do not give further morphine."
            ),
            items=[
                OetComprehensionItem(
                    type="mcq",
                    prompt="Why is angiography planned this morning?",
                    options=[
                        "ST-elevation myocardial infarction",
                        "Non-ST-elevation ACS with a rising troponin and ST depression",
                        "Unstable arrhythmia",
                        "Failed thrombolysis",
                    ],
                    answer="Non-ST-elevation ACS with a rising troponin and ST depression",
                    explanation="Troponin is above the 99th centile with ST depression and no ST elevation — NSTE-ACS, listed for same-morning angiography.",
                ),
                OetComprehensionItem(
                    type="short_answer",
                    prompt="Which antiplatelet loading doses were given in the emergency department?",
                    answer="aspirin 300 mg and ticagrelor 180 mg",
                    accepted_answers=["aspirin 300 mg and ticagrelor 180 mg", "aspirin 300 and ticagrelor 180"],
                    explanation="The registrar lists aspirin 300 mg and ticagrelor 180 mg in ED.",
                ),
                OetComprehensionItem(
                    type="mcq",
                    prompt="What should the day team do about metformin?",
                    options=[
                        "Give the morning dose with a sip of water",
                        "Hold the morning dose because he is nil by mouth for angiography",
                        "Switch to insulin sliding scale immediately",
                        "Double the evening dose instead",
                    ],
                    answer="Hold the morning dose because he is nil by mouth for angiography",
                    explanation="He is nil by mouth from 06:00 for angiography; the morning metformin is held.",
                ),
            ],
        ),
        provenance=PROV,
        status="draft",
    )
    speaking = OetTask(
        id="oet-ref-speaking-asthma",
        subtest="speaking",
        title="Role-play: asthma action plan after an exacerbation",
        payload=OetSpeakingPayload(
            setting="GP clinic, 8 minutes. You are the doctor. The patient is a 19-year-old university student seen 5 days after an emergency-department visit for an asthma exacerbation.",
            candidate_card=(
                "TASK\n"
                "- Confirm recovery: nocturnal symptoms, reliever use, peak flow if known\n"
                "- Check inhaler technique briefly and whether a spacer is used\n"
                "- Explain a written action plan: green (well), amber (worsening), red (emergency)\n"
                "- Increase preventer (budesonide/formoterol 2 puffs twice daily) for 2 weeks then review\n"
                "- Safety-net: if speaking in short sentences, blue lips, or peak flow <50% of best — call emergency services\n"
                "Do not lecture. Find out what the student finds hard about taking a preventer at university."
            ),
            interlocutor_card=(
                "You are Alex, 19, first-year student. You went to ED five nights ago with wheeze after a cold. "
                "You feel better but still wake once a night. You use salbutamol 4–6 times a day. You often forget the preventer "
                "because the inhaler is in your shared bathroom. You are worried steroids will make you gain weight. "
                "You will accept a spacer and a phone reminder if the doctor explains why the preventer is not the same as 'steroid tablets'. "
                "You do not know your best peak flow."
            ),
            model_dialogue=(
                "Doctor: Thanks for coming in, Alex. How have the nights been since emergency?\n"
                "Alex: Still waking once. The blue inhaler helps.\n"
                "Doctor: How many times a day are you using it?\n"
                "Alex: Maybe five. The brown one I forget — it lives in the bathroom.\n"
                "Doctor: The brown inhaler is a low-dose steroid that stays in the lungs. It is not the same as steroid tablets, so it does not put weight on in the way you are thinking. "
                "If we keep it next to your phone and take two puffs morning and night for the next two weeks, the night waking should settle. I will also give you a spacer and a one-page plan for if you worsen."
            ),
            assessment_focus=[
                "Relationship building and finding the barrier to preventer use",
                "Clear explanation of inhaled versus systemic steroids",
                "Shared action plan with specific emergency signs",
            ],
        ),
        provenance=PROV,
        status="draft",
    )
    return [writing, reading, listening, speaking]


def run() -> None:
    fs = FileSink()
    existing = {r["id"]: r for r in fs.read("oet")}
    n = 0
    for t in _tasks():
        existing[t.id] = t.model_dump(exclude_none=True)
        n += 1
        console.print(f"staged {t.id} ({t.subtest})")
    fs.rewrite("oet", [OetTask.model_validate(v) for v in existing.values()])
    console.print(f"{n} reference OET tasks staged")
