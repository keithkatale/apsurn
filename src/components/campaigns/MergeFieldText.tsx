"use client";

import { useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import {
  isMergeFieldKey,
  leadMergeVars,
  MERGE_FIELD_LABELS,
  parseMergeSegments,
  type LeadMergeSource,
  type MergeFieldKey,
} from "@/lib/outreach/merge-fields";

function chipLabel(key: MergeFieldKey, lead: LeadMergeSource | null | undefined): string {
  const vars = leadMergeVars(lead);
  return vars[key] || key.replace(/_/g, " ");
}

function FieldChip({
  fieldKey,
  lead,
  onReplace,
}: {
  fieldKey: MergeFieldKey;
  lead: LeadMergeSource | null | undefined;
  onReplace: (nextRaw: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const filled = Boolean(leadMergeVars(lead)[fieldKey]);
  const label = chipLabel(fieldKey, lead);

  if (editing) {
    return (
      <input
        autoFocus
        defaultValue={`{{${fieldKey}}}`}
        onClick={(event) => event.stopPropagation()}
        onBlur={(event) => {
          onReplace(event.target.value);
          setEditing(false);
        }}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onReplace((event.target as HTMLInputElement).value);
            setEditing(false);
          }
          if (event.key === "Escape") {
            event.preventDefault();
            setEditing(false);
          }
        }}
        className="mx-0.5 inline-block min-w-[5rem] rounded-md border border-[#4379EE] bg-white px-1.5 py-0.5 align-baseline font-mono text-[12px] text-neutral-800 outline-none"
        aria-label={`Edit {{${fieldKey}}}`}
      />
    );
  }

  return (
    <button
      type="button"
      data-merge-chip
      onClick={(event) => {
        event.stopPropagation();
        setEditing(true);
      }}
      title={`{{${fieldKey}}} — click to edit`}
      className={cn(
        "merge-field-chip mx-0.5 inline-flex max-w-[16rem] items-center truncate rounded-md px-2 py-0.5 text-[12px] font-medium align-baseline",
        filled ? "merge-field-chip--filled" : "merge-field-chip--empty",
      )}
    >
      {label}
    </button>
  );
}

/** Preview chips that show the field name (First name, Company), not a lead’s value and not {{raw}}. */
export function MergeFieldPreview({ value, className }: { value: string; className?: string }) {
  const segments = parseMergeSegments(value);
  if (!value.trim()) return null;
  return (
    <span className={cn("inline leading-relaxed", className)}>
      {segments.map((segment, index) => {
        if (segment.type === "text") return <span key={`t-${index}`}>{segment.value}</span>;
        return (
          <span key={`${segment.key}-${index}`} className="merge-field-chip merge-field-chip--filled mx-0.5 inline-flex max-w-[12rem] items-center truncate rounded-md px-2 py-0.5 text-[12px] font-medium align-baseline">
            {MERGE_FIELD_LABELS[segment.key]}
          </span>
        );
      })}
    </span>
  );
}

/**
 * Stores {{tokens}}; always shows lead values as chips unless the user is editing.
 * Click a chip → raw {{token}}. Click surrounding text → edit full string.
 */
export function MergeFieldText({
  value,
  onChange,
  lead,
  multiline = false,
  placeholder,
  className,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  lead: LeadMergeSource | null | undefined;
  multiline?: boolean;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [editingFull, setEditingFull] = useState(false);
  const [draft, setDraft] = useState(value);
  const segments = parseMergeSegments(value);
  const empty = !value.trim();
  const showEditor = editingFull || empty;

  function startFullEdit() {
    setDraft(value);
    setEditingFull(true);
  }

  function commitFull(next: string) {
    onChange(next);
    setDraft(next);
    setEditingFull(false);
  }

  function replaceSegment(index: number, nextRaw: string) {
    const next = segments
      .map((segment, i) => {
        if (i !== index) return segment.type === "field" ? segment.raw : segment.value;
        const trimmed = nextRaw.trim();
        const match = /^\{\{\s*(\w+)\s*\}\}$/.exec(trimmed);
        if (match && isMergeFieldKey(match[1])) return `{{${match[1]}}}`;
        if (isMergeFieldKey(trimmed)) return `{{${trimmed}}}`;
        return nextRaw;
      })
      .join("");
    onChange(next);
  }

  if (disabled) {
    return <p className={cn("text-[13px] text-neutral-400", className)}>{placeholder}</p>;
  }

  if (showEditor) {
    return (
      <textarea
        autoFocus={editingFull}
        className={cn(
          "w-full bg-transparent text-[14px] leading-relaxed text-neutral-800 outline-none placeholder:text-neutral-400",
          multiline ? "min-h-[8rem] resize-y" : "h-7 resize-none overflow-hidden",
          className,
        )}
        value={editingFull ? draft : value}
        placeholder={placeholder}
        rows={multiline ? 6 : 1}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          setEditingFull(true);
          // Live-update while empty so parent state stays in sync as they type
          if (empty || !multiline) onChange(next);
        }}
        onBlur={(event) => commitFull(event.target.value)}
        onKeyDown={(event) => {
          if (!multiline && event.key === "Enter") {
            event.preventDefault();
            commitFull((event.target as HTMLTextAreaElement).value);
          }
        }}
      />
    );
  }

  return (
    <div
      className={cn(
        "w-full cursor-text rounded-md text-left text-[14px] leading-relaxed text-neutral-800",
        multiline ? "min-h-[8rem] whitespace-pre-wrap" : "min-h-7",
        className,
      )}
      role="textbox"
      tabIndex={0}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("[data-merge-chip]")) return;
        startFullEdit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          if ((event.target as HTMLElement).closest("[data-merge-chip]")) return;
          event.preventDefault();
          startFullEdit();
        }
      }}
    >
      {segments.map((segment, index) => {
        if (segment.type === "text") {
          return <span key={`t-${index}`}>{segment.value}</span>;
        }
        return (
          <FieldChip
            key={`${segment.key}-${index}`}
            fieldKey={segment.key}
            lead={lead}
            onReplace={(raw) => replaceSegment(index, raw)}
          />
        );
      })}
    </div>
  );
}
