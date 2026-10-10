import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { DEV_COOKIE, envDevUser, parseDevCookie } from "@/lib/dev-auth";
import { startLocalSession } from "@/lib/local-session";
import { LoginForm } from "./login-form";
import { Button } from "@/components/ui";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/dashboard";
  if (envDevUser()) redirect(next);
  const fromCookie = parseDevCookie((await cookies()).get(DEV_COOKIE)?.value);
  if (fromCookie) redirect(next);

  const supabaseOn = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const localOn = process.env.NODE_ENV !== "production";

  return (
    <div className="max-w-md mx-auto mt-12 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold mb-1">Sign in</h1>
        <p className="text-sm text-muted-foreground">
          Accounts save QBank progress, flashcard schedules, and OET attempts. Nothing is paid.
        </p>
      </div>

      {localOn && (
        <form action={startLocalSession} className="rounded-lg border border-border p-4 space-y-3">
          <input type="hidden" name="next" value={next} />
          <p className="text-sm font-medium">Continue locally (no cloud account)</p>
          <p className="text-xs text-muted-foreground">
            Uses this machine’s Postgres. Physician can open the review queue; student is the normal study view.
            Disabled automatically in production.
          </p>
          <label className="block text-sm">
            Role
            <select name="role" defaultValue="physician" className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2">
              <option value="physician">Physician (review + study)</option>
              <option value="student">Student</option>
            </select>
          </label>
          <Button type="submit" className="w-full">
            Continue locally
          </Button>
        </form>
      )}

      {supabaseOn && (
        <div>
          {localOn && <div className="text-center text-xs text-muted-foreground mb-4">or a real account</div>}
          <LoginForm next={next} />
        </div>
      )}

      {!supabaseOn && !localOn && (
        <p className="text-sm text-muted-foreground">
          Sign-in is not configured. Set <code>NEXT_PUBLIC_SUPABASE_URL</code> for hosted accounts.
        </p>
      )}
    </div>
  );
}
