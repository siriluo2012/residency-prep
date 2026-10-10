import Link from "next/link";
import { Card, CardTitle } from "@/components/ui";
import { listGuides } from "@/lib/guides";

export const metadata = { title: "Guides" };

export default function GuidesIndex() {
  const guides = listGuides();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Guides</h1>
      <div className="grid md:grid-cols-2 gap-4">
        {guides.map((g) => (
          <Link key={g.slug} href={`/guides/${g.slug}`}>
            <Card className="h-full hover:border-primary transition">
              <CardTitle>{g.title}</CardTitle>
              <p className="text-sm text-muted-foreground">{g.description}</p>
              <p className="text-xs text-muted-foreground mt-2">Verified {g.verified_at}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
