"use client";

import { useState } from "react";
import { Pencil, Trash2, X } from "lucide-react";
import { ThreeDButton } from "@/components/buttons/three-d-button";
import { EnrollInSequenceModal } from "@/components/sequences/EnrollInSequenceModal";
import { LeadStatusPicker } from "./LeadStatusPicker";
import type { ContactRow, ProspectRow } from "./types";

interface EditableFields {
  full_name: string;
  title: string;
  email: string;
  phone: string;
  linkedin_url: string;
}

function fieldsOf(contact: ContactRow): EditableFields {
  return {
    full_name: contact.full_name ?? "",
    title: contact.title ?? "",
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    linkedin_url: contact.linkedin_url ?? "",
  };
}

export function ContactProfilePanel({
  contact,
  company,
  onClose,
  onSaved,
}: {
  contact: ContactRow;
  company: ProspectRow;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState<EditableFields>(fieldsOf(contact));

  function startEdit() {
    setFields(fieldsOf(contact));
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    try {
      await fetch("/api/contacts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactIds: [contact.id],
          full_name: fields.full_name.trim() || null,
          title: fields.title.trim() || null,
          email: fields.email.trim() || null,
          phone: fields.phone.trim() || null,
          linkedin_url: fields.linkedin_url.trim() || null,
        }),
      });
      setEditing(false);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  }

  async function deleteContact() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    await fetch("/api/contacts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactIds: [contact.id], archived: true }),
    });
    onSaved?.();
    onClose();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-neutral-200 bg-white px-4 py-3 pr-10">
        <div className="min-w-0">
          {editing ? (
            <input
              className="input w-full text-base font-medium"
              value={fields.full_name}
              onChange={(e) => setFields((f) => ({ ...f, full_name: e.target.value }))}
              placeholder="Full name"
            />
          ) : (
            <>
              <h2 className="truncate text-base font-semibold text-neutral-900">{contact.full_name || "Unnamed contact"}</h2>
              {contact.title && <p className="text-xs text-neutral-500">{contact.title}</p>}
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 rounded-full p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <LeadStatusPicker contactId={contact.id} value={contact.lead_status} />
            <span className="text-xs text-neutral-400">
              {contact.contact_origin}
              {contact.confidence != null ? ` · ${Math.round(contact.confidence * 100)}% confidence` : ""}
            </span>
          </div>

          <div className="flex flex-col gap-1 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm">
            <span className="text-neutral-500">Company</span>
            <span className="text-neutral-900">
              {company.name} <span className="text-neutral-400">({company.domain})</span>
            </span>
            {company.industry && <span className="text-xs text-neutral-500">{company.industry}</span>}
            {company.location && <span className="text-xs text-neutral-500">{company.location}</span>}
          </div>

          {editing ? (
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-neutral-700">Title</span>
                <input
                  className="input"
                  value={fields.title}
                  onChange={(e) => setFields((f) => ({ ...f, title: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-neutral-700">Email</span>
                <input
                  className="input"
                  type="email"
                  value={fields.email}
                  onChange={(e) => setFields((f) => ({ ...f, email: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-neutral-700">Phone</span>
                <input
                  className="input"
                  value={fields.phone}
                  onChange={(e) => setFields((f) => ({ ...f, phone: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-neutral-700">LinkedIn</span>
                <input
                  className="input"
                  value={fields.linkedin_url}
                  onChange={(e) => setFields((f) => ({ ...f, linkedin_url: e.target.value }))}
                />
              </label>
            </div>
          ) : (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-neutral-500">Email</dt>
              <dd className="min-w-0 truncate text-neutral-900">
                {contact.email ?? "—"}
                {contact.email && <span className="ml-1 text-xs text-neutral-400">({contact.email_status})</span>}
              </dd>

              <dt className="text-neutral-500">Phone</dt>
              <dd className="text-neutral-900">{contact.phone ?? "—"}</dd>

              {contact.qualify_reason && (
                <>
                  <dt className="text-neutral-500">Why fit</dt>
                  <dd className="text-neutral-900">{contact.qualify_reason}</dd>
                </>
              )}

              <dt className="text-neutral-500">LinkedIn</dt>
              <dd className="min-w-0 truncate text-neutral-900">
                {contact.linkedin_url ? (
                  <a href={contact.linkedin_url} target="_blank" rel="noreferrer" className="underline">
                    {contact.linkedin_url}
                  </a>
                ) : (
                  "—"
                )}
              </dd>

              {contact.evidence?.[0]?.url && (
                <>
                  <dt className="text-neutral-500">Source</dt>
                  <dd className="min-w-0 truncate text-neutral-900">
                    <a href={contact.evidence[0].url} target="_blank" rel="noreferrer" className="underline">
                      {contact.evidence[0].url}
                    </a>
                  </dd>
                </>
              )}
            </dl>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-neutral-200 bg-white p-3">
        {editing ? (
          <>
            <ThreeDButton type="button" variant="solid" size="sm" disabled={saving} onClick={save}>
              {saving ? "Saving…" : "Save"}
            </ThreeDButton>
            <ThreeDButton type="button" variant="soft" size="sm" disabled={saving} onClick={() => setEditing(false)}>
              Cancel
            </ThreeDButton>
          </>
        ) : (
          <>
            <ThreeDButton type="button" variant="soft" size="sm" onClick={startEdit}>
              <Pencil className="size-3.5" />
              <span>Edit</span>
            </ThreeDButton>
            <EnrollInSequenceModal
              contactIds={[contact.id]}
              trigger={(openModal) => (
                <ThreeDButton type="button" variant="soft" size="sm" onClick={openModal}>
                  Enroll in sequence
                </ThreeDButton>
              )}
            />
            <ThreeDButton type="button" variant="destructive" size="sm" onClick={deleteContact}>
              <Trash2 className="size-3.5" />
              <span>{confirmingDelete ? "Confirm delete?" : "Delete"}</span>
            </ThreeDButton>
          </>
        )}
      </div>
    </div>
  );
}
