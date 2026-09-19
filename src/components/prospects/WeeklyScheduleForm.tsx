"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Loader2 } from "lucide-react";
import { ThreeDButton } from "@/components/buttons/three-d-button";

interface Schedule {
  id: string;
  weekly_target: number;
  weekday: number;
  time_of_day: string;
  timezone: string;
  is_active: boolean;
  next_run_at: string;
  last_run_at: string | null;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function WeeklyScheduleForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [weeklyTarget, setWeeklyTarget] = useState(25);
  const [weekday, setWeekday] = useState(1);
  const [timeOfDay, setTimeOfDay] = useState("08:00");
  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", []);

  useEffect(() => {
    fetch("/api/prospecting/schedule", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        const existing: Schedule | undefined = data.schedules?.[0];
        if (existing) {
          setSchedule(existing);
          setWeeklyTarget(existing.weekly_target);
          setWeekday(existing.weekday);
          setTimeOfDay(existing.time_of_day);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      if (schedule) {
        const res = await fetch(`/api/prospecting/schedule?id=${schedule.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ weeklyTarget, weekday, timeOfDay, timezone, isActive: true }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to update schedule");
        setSchedule(data.schedule);
      } else {
        const res = await fetch("/api/prospecting/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ weeklyTarget, weekday, timeOfDay, timezone }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to create schedule");
        setSchedule(data.schedule);
      }
      router.refresh();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save schedule");
    } finally {
      setSaving(false);
    }
  }

  async function togglePause() {
    if (!schedule) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/prospecting/schedule?id=${schedule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !schedule.is_active }),
      });
      const data = await res.json();
      if (res.ok) setSchedule(data.schedule);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (loading) return null;

  return (
    <div className="relative">
      <ThreeDButton type="button" variant="soft" size="sm" onClick={() => setOpen((o) => !o)}>
        <CalendarClock className="size-3.5" />
        <span>
          {schedule
            ? `${schedule.is_active ? "Weekly target" : "Paused"}: ${schedule.weekly_target}/wk`
            : "Set weekly target"}
        </span>
      </ThreeDButton>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1.5 w-72 rounded-lg border border-neutral-200 bg-white p-3 shadow-lg">
            <p className="mb-2 text-[12px] font-medium text-neutral-700">
              Automatically find new qualified accounts every week
            </p>
            <label className="mb-2 flex flex-col gap-1 text-[11px] text-neutral-500">
              Target per week
              <input
                type="number"
                min={1}
                max={100}
                className="input"
                value={weeklyTarget}
                onChange={(e) => setWeeklyTarget(Number(e.target.value))}
              />
            </label>
            <div className="mb-2 flex gap-2">
              <label className="flex flex-1 flex-col gap-1 text-[11px] text-neutral-500">
                Day
                <select
                  className="input"
                  value={weekday}
                  onChange={(e) => setWeekday(Number(e.target.value))}
                >
                  {WEEKDAYS.map((d, i) => (
                    <option key={d} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-1 flex-col gap-1 text-[11px] text-neutral-500">
                Time
                <input
                  type="time"
                  className="input"
                  value={timeOfDay}
                  onChange={(e) => setTimeOfDay(e.target.value)}
                />
              </label>
            </div>
            <p className="mb-2 text-[10px] text-neutral-400">Timezone: {timezone}</p>

            {schedule && (
              <p className="mb-2 text-[11px] text-neutral-500">
                Next run: {new Date(schedule.next_run_at).toLocaleString()}
                {schedule.last_run_at && <> · last ran {new Date(schedule.last_run_at).toLocaleDateString()}</>}
              </p>
            )}

            {error && <p className="mb-2 text-[11px] text-red-600">{error}</p>}

            <div className="flex items-center justify-between gap-2">
              {schedule && (
                <ThreeDButton type="button" variant="muted" size="sm" disabled={saving} onClick={togglePause}>
                  {schedule.is_active ? "Pause" : "Resume"}
                </ThreeDButton>
              )}
              <ThreeDButton type="button" variant="solid" size="sm" disabled={saving} onClick={save} className="ml-auto">
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : <span>Save</span>}
              </ThreeDButton>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
