"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { ThreeDButton } from "@/components/buttons/three-d-button";
import { EnrollInSequenceModal } from "@/components/sequences/EnrollInSequenceModal";
import { LeadStatusPicker } from "./LeadStatusPicker";
import type { ContactRow, ProspectRow } from "./types";

export function ContactProfileModal({
  contact,
  company,
  onClose,
}: {
  contact: ContactRow;
  company: ProspectRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleted, setDeleted] = useState(false);

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
    setDeleted(true);
    router.refresh();
    onClose();
  }

  if (deleted) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-6">
      <div className="mt-10 flex w-full max-w-lg flex-col gap-4 rounded-lg border border-neutral-200 bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-medium text-neutral-900">{contact.full_name ?? "Unnamed contact"}</h2>
            {contact.title && <p className="text-sm text-neutral-500">{contact.title}</p>}
          </div>
          <ThreeDButton type="button" variant="soft" size="sm" onClick={onClose}>
            Close
          </ThreeDButton>
        </div>

        <div className="flex items-center gap-2">
          <LeadStatusPicker contactId={contact.id} value={contact.lead_status} />
          <span className="text-xs text-neutral-400">
            {contact.contact_origin}
            {contact.confidence != null ? ` · ${Math.round(contact.confidence * 100)}% confidence` : ""}
          </span>
        </div>

        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
          <dt className="text-neutral-500">Company</dt>
          <dd className="text-neutral-900">
            {company.name} <span className="text-neutral-400">({company.domain})</span>
          </dd>

          <dt className="text-neutral-500">Industry</dt>
          <dd className="text-neutral-900">{company.industry ?? "—"}</dd>

          <dt className="text-neutral-500">Location</dt>
          <dd className="text-neutral-900">{company.location ?? "—"}</dd>

          <dt className="text-neutral-500">Email</dt>
          <dd className="text-neutral-900">
            {contact.email ?? "—"}
            {contact.email && <span className="ml-1 text-xs text-neutral-400">({contact.email_status})</span>}
          </dd>

          <dt className="text-neutral-500">Phone</dt>
          <dd className="text-neutral-900">{contact.phone ?? "—"}</dd>

          <dt className="text-neutral-500">LinkedIn</dt>
          <dd className="text-neutral-900">
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
              <dd className="text-neutral-900">
                <a href={contact.evidence[0].url} target="_blank" rel="noreferrer" className="underline">
                  {contact.evidence[0].url}
                </a>
              </dd>
            </>
          )}
        </dl>

        <div className="flex items-center gap-2 border-t border-neutral-100 pt-4">
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
        </div>
      </div>
    </div>
  );
}
