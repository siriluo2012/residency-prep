import Link from "next/link";
import { getUser } from "@/lib/supabase/server";
import { getProfile, hasRole, type Role } from "@/lib/auth";

const NAV = [
  { href: "/qbank", label: "QBank" },
  { href: "/flashcards", label: "Flashcards" },
  { href: "/animations", label: "Animations" },
  { href: "/oet", label: "OET" },
  { href: "/guides/ecfmg-certification", label: "ECFMG" },
];

export async function SiteHeader() {
  const user = await getUser();
  let role: Role = "student";
  if (user && process.env.DATABASE_URL) {
    try {
      role = ((await getProfile(user.id))?.role as Role) ?? "student";
    } catch {
      /* no db */
    }
  }
  return (
    <header className="border-b border-border bg-card/80 backdrop-blur sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-6">
        <Link href="/" className="font-semibold tracking-tight">
          Residency<span className="text-primary">Prep</span>
        </Link>
        <nav className="hidden md:flex items-center gap-4 text-sm text-muted-foreground">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="hover:text-foreground">
              {n.label}
            </Link>
          ))}
          {user && hasRole(role, "reviewer") && (
            <Link href="/review" className="hover:text-foreground">
              Review
            </Link>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          {user ? (
            <>
              <Link href="/dashboard" className="hover:underline">
                Dashboard
              </Link>
              <form action="/auth/signout" method="post">
                <button className="text-muted-foreground hover:text-foreground">Sign out</button>
              </form>
            </>
          ) : (
            <Link href="/login" className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 font-medium">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
