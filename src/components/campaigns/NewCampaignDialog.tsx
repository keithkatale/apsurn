"use client";

import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { ArrowLeft, FileSpreadsheet, Loader2, Search, Upload, Users, X } from "lucide-react";
import { cn } from "@/lib/cn";

export function NewCampaignDialog({
  availableLeadCount,
  generating,
  onClose,
  onUseLeads,
  onFindLeads,
  onCreateManual,
}: {
  availableLeadCount: number;
  generating: boolean;
  onClose: () => void;
  onUseLeads: () => void;
  onFindLeads: () => void;
  onCreateManual: (input: { name: string; about: string; file: File }) => Promise<void>;
}) {
  const [step, setStep] = useState<"choose" | "manual">("choose");
  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function takeFile(next: File | null) {
    if (!next) return;
    if (!/\.csv$/i.test(next.name)) {
      setError("Upload a .csv file.");
      return;
    }
    setError(null);
    setFile(next);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragOver(false);
    takeFile(event.dataTransfer.files?.[0] ?? null);
  }

  async function create() {
    if (!file || !name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onCreateManual({ name: name.trim(), about: about.trim(), file });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create that campaign");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => { if (!busy) onClose(); }}>
      <div
        role="dialog"
        aria-labelledby="new-campaign-title"
        className="w-full max-w-[440px] rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_24px_60px_rgba(0,0,0,0.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            {step === "manual" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setStep("choose")}
                className="mb-2 inline-flex items-center gap-1 text-[12px] font-medium text-neutral-500 hover:text-neutral-800 disabled:opacity-50"
              >
                <ArrowLeft className="size-3.5" />
                Back
              </button>
            ) : null}
            <h2 id="new-campaign-title" className="font-heading text-[20px] font-semibold tracking-[-0.03em] text-neutral-950">
              {step === "choose" ? "New campaign" : "Create it yourself"}
            </h2>
            <p className="mt-1 text-[13px] leading-snug text-neutral-500">
              {step === "choose"
                ? "Start from the leads you have, find new ones, or bring your own list."
                : "Name the campaign, upload the people, and we’ll pick an icon from the list."}
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            aria-label="Close"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800 disabled:opacity-50"
          >
            <X className="size-4" />
          </button>
        </div>

        {step === "choose" ? (
          <div className="mt-4 flex flex-col gap-2">
            <Option
              icon={<Users className="size-4" />}
              title="Use available leads"
              detail={
                availableLeadCount === 0
                  ? "No leads yet. Find accounts or upload a list."
                  : `Build a campaign from ${availableLeadCount} lead${availableLeadCount === 1 ? "" : "s"} already saved.`
              }
              disabled={availableLeadCount === 0 || generating}
              onClick={onUseLeads}
            />
            <Option
              icon={<Search className="size-4" />}
              title="Find new leads"
              detail="Search for new accounts, then come back and put them in a campaign."
              onClick={onFindLeads}
            />
            <Option
              icon={<Upload className="size-4" />}
              title="Create manually"
              detail="Name the campaign and upload your own leads as a CSV."
              onClick={() => setStep("manual")}
            />
          </div>
        ) : (
          <form
            className="mt-4 flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <label className="block">
              <span className="text-[12px] font-medium text-neutral-700">Campaign name</span>
              <input
                autoFocus
                value={name}
                disabled={busy}
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
                placeholder="Series A founders"
                className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-[14px] text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-[#4379EE]"
              />
            </label>
            <label className="block">
              <span className="text-[12px] font-medium text-neutral-700">What this campaign is about</span>
              <textarea
                value={about}
                disabled={busy}
                maxLength={500}
                rows={3}
                onChange={(event) => setAbout(event.target.value)}
                placeholder="Founders who just raised, and the reason you’re writing."
                className="mt-1 w-full resize-none rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-[14px] leading-snug text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-[#4379EE]"
              />
            </label>
            <div>
              <span className="text-[12px] font-medium text-neutral-700">Leads</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                className={cn(
                  "mt-1 flex w-full items-center gap-3 rounded-xl border border-dashed px-3 py-3 text-left transition",
                  dragOver ? "border-[#4379EE] bg-[#E8F1FC]" : "border-neutral-300 bg-neutral-50 hover:border-neutral-400",
                )}
              >
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-neutral-700 shadow-sm">
                  <FileSpreadsheet className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-neutral-900">
                    {file ? file.name : "Drop a CSV, or click to choose"}
                  </span>
                  <span className="block text-[12px] text-neutral-500">Name, email, and company columns are enough.</span>
                </span>
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(event) => takeFile(event.target.files?.[0] ?? null)}
              />
            </div>
            {error ? <p className="text-[13px] text-red-600">{error}</p> : null}
            <button
              type="submit"
              disabled={busy || !name.trim() || !file}
              className="mt-1 inline-flex h-10 items-center justify-center gap-2 rounded-full bg-neutral-900 text-[14px] font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-500"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {busy ? "Reading the list and choosing an icon…" : "Create campaign"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function Option({
  icon,
  title,
  detail,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-3 text-left transition hover:border-[#4379EE] hover:bg-[#E8F1FC]/70 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-neutral-200 disabled:hover:bg-white"
    >
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-800">{icon}</span>
      <span className="min-w-0 pt-0.5">
        <span className="block text-[14px] font-semibold text-neutral-950">{title}</span>
        <span className="mt-0.5 block text-[12px] leading-snug text-neutral-500">{detail}</span>
      </span>
    </button>
  );
}
