"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Input } from "@/components/ui";

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const redirectTo = `${typeof window !== "undefined" ? window.location.origin : ""}/auth/callback?next=${encodeURIComponent(next)}`;

  async function magicLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  async function google() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
  }

  if (sent) {
    return <p className="rounded-md border border-border p-4 text-sm">Check your email for a sign-in link.</p>;
  }

  return (
    <div className="space-y-4">
      <Button variant="secondary" className="w-full" onClick={google}>
        Continue with Google
      </Button>
      <div className="text-center text-xs text-muted-foreground">or</div>
      <form onSubmit={magicLink} className="space-y-3">
        <Input type="email" required placeholder="you@school.edu" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Sending..." : "Email me a sign-in link"}
        </Button>
      </form>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
