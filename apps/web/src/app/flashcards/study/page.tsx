import Link from "next/link";
import { Empty } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getStudyQueue } from "@/lib/flashcards";
import { isExamId } from "@/lib/queries/content";
import { StudySession } from "@/components/flashcards/study-session";

export const metadata = { title: "Study" };

export default async function StudyPage({ searchParams }: PageProps<"/flashcards/study">) {
  await requireUser();
  const sp = await searchParams;
  const exam = isExamId(sp.exam) ? sp.exam : "usmle-step1";
  const topic = typeof sp.topic === "string" ? sp.topic : undefined;
  const queue = await getStudyQueue({ exam, topic });
  if (!queue.length) {
    return (
      <Empty title="Nothing due">
        You are caught up. <Link className="underline" href={`/flashcards?exam=${exam}`}>Back to decks</Link>
      </Empty>
    );
  }
  return <StudySession initial={queue} exam={exam} />;
}
