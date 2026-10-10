import { Button, Card, Input, Select } from "@/components/ui";
import { getProfile, requireUser } from "@/lib/auth";
import { updateProfile } from "@/lib/profile";
import { EXAM_NAMES } from "@/lib/queries/content";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const p = await getProfile(user.id);
  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <form action={updateProfile}>
        <Card className="space-y-4">
          <label className="block text-sm">
            <span className="font-medium block mb-1">Display name</span>
            <Input name="displayName" defaultValue={p?.displayName ?? ""} />
          </label>
          <label className="block text-sm">
            <span className="font-medium block mb-1">Target exam</span>
            <Select name="targetExamId" defaultValue={p?.targetExamId ?? "usmle-step1"} className="w-full">
              {Object.entries(EXAM_NAMES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </label>
          <label className="block text-sm">
            <span className="font-medium block mb-1">Exam date</span>
            <Input type="date" name="examDate" defaultValue={p?.examDate ? new Date(p.examDate).toISOString().slice(0, 10) : ""} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="font-medium block mb-1">Daily questions goal</span>
              <Input type="number" name="dailyGoalQuestions" min={5} max={200} defaultValue={p?.dailyGoalQuestions ?? 40} />
            </label>
            <label className="block text-sm">
              <span className="font-medium block mb-1">Daily cards goal</span>
              <Input type="number" name="dailyGoalCards" min={5} max={500} defaultValue={p?.dailyGoalCards ?? 50} />
            </label>
          </div>
          <Button type="submit">Save</Button>
          <p className="text-xs text-muted-foreground">Signed in as {user.email}. Role: {p?.role ?? "student"}.</p>
        </Card>
      </form>
    </div>
  );
}
