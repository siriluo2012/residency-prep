import Link from "next/link";
import { Card, CardTitle } from "@/components/ui";

const EXAMS = [
  { id: "usmle-step1", name: "USMLE Step 1", blurb: "Foundational science vignettes, 11 organ-system blueprint, pass/fail.", href: "/qbank?exam=usmle-step1" },
  { id: "usmle-step2ck", name: "USMLE Step 2 CK", blurb: "Clinical management, next-best-step, 3-digit score that residency programs weigh heavily.", href: "/qbank?exam=usmle-step2ck" },
  { id: "oet-medicine", name: "OET Medicine", blurb: "Listening, reading, referral-letter writing, and role-play speaking for ECFMG English proficiency.", href: "/oet" },
  { id: "ecfmg", name: "ECFMG Certification", blurb: "Pathways 1-6, credential verification, OET requirement, and timeline to the Match.", href: "/guides/ecfmg-certification" },
];

export default function Home() {
  return (
    <div className="space-y-12">
      <section className="pt-8 pb-4 max-w-3xl">
        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">
          Residency exam prep that is free, ad-free, and physician-reviewed.
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          A UWorld-style question bank, spaced-repetition flashcards, and short animated explainers for the
          concepts that never stick from text alone. Every item is license-tracked and reviewed by a physician
          before you see it.
        </p>
        <div className="mt-6 flex gap-3">
          <Link href="/login" className="rounded-md bg-primary text-primary-foreground px-5 py-2.5 font-medium">
            Start for free
          </Link>
          <Link href="/animations" className="rounded-md border border-border px-5 py-2.5 font-medium hover:bg-muted">
            See an animation
          </Link>
        </div>
      </section>

      <section className="grid md:grid-cols-2 gap-4">
        {EXAMS.map((e) => (
          <Link key={e.id} href={e.href}>
            <Card className="h-full hover:border-primary transition">
              <CardTitle>{e.name}</CardTitle>
              <p className="text-sm text-muted-foreground">{e.blurb}</p>
            </Card>
          </Link>
        ))}
      </section>

      <section className="grid md:grid-cols-3 gap-6 text-sm">
        <div>
          <h3 className="font-semibold mb-1">No ads, no paywall</h3>
          <p className="text-muted-foreground">Accounts exist only to track your progress. We do not sell attention or data.</p>
        </div>
        <div>
          <h3 className="font-semibold mb-1">Reviewed before published</h3>
          <p className="text-muted-foreground">
            Questions are drafted from open sources and by Claude, then approved by a physician. Every item has a
            report button.
          </p>
        </div>
        <div>
          <h3 className="font-semibold mb-1">Concepts that move</h3>
          <p className="text-muted-foreground">
            Cardiac cycle, nephron handling, coagulation cascade, and more as looping, scrubbable animations with
            captions.
          </p>
        </div>
      </section>
    </div>
  );
}
