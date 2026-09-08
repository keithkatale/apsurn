"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2, Download } from "lucide-react";
import { EnrollInSequenceModal } from "@/components/sequences/EnrollInSequenceModal";
import { LEAD_STATUSES, type LeadStatus } from "./types";
import { toCsv, downloadCsv } from "@/lib/prospecting/csv";
import type { ContactRow, ProspectRow } from "./types";

export function BulkActionBar({
  selectedContactIds,
  contacts,
  prospects,
  onCleared,
}: {
  selectedContactIds: string[];
  contacts: ContactRow[];
  prospects: ProspectRow[];
  onCleared: () => void;
}) {
  const router = useRouter();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function patchContacts(body: { lead_status?: LeadStatus; archived?: boolean }) {
    setBusy(true);
    try {
      await fetch("/api/contacts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: selectedContactIds, ...body }),
      });
      router.refresh();
      onCleared();
    } finally {
      setBusy(false);
      setConfirmingDelete(false);
      setStatusMenuOpen(false);
    }
  }

  function exportSelected() {
    const companyByContactId = new Map<string, ProspectRow>();
    for (const p of prospects) {
      for (const c of p.contacts) companyByContactId.set(c.id, p);
    }
    const selected = contacts
      .filter((c) => selectedContactIds.includes(c.id))
      .map((c) => ({ contact: c, company: companyByContactId.get(c.id) }));

    const csv = toCsv(selected, [
      { key: "company", header: "Company", value: (r) => r.company?.name ?? "" },
      { key: "domain", header: "Domain", value: (r) => r.company?.domain ?? "" },
      { key: "name", header: "Contact Name", value: (r) => r.contact.full_name ?? "" },
      { key: "title", header: "Title", value: (r) => r.contact.title ?? "" },
      { key: "email", header: "Email", value: (r) => r.contact.email ?? "" },
      { key: "email_status", header: "Email Status", value: (r) => r.contact.email_status },
      { key: "phone", header: "Phone", value: (r) => r.contact.phone ?? "" },
      { key: "linkedin", header: "LinkedIn", value: (r) => r.contact.linkedin_url ?? "" },
      { key: "lead_status", header: "Lead Status", value: (r) => r.contact.lead_status },
      { key: "company_status", header: "Company Status", value: (r) => r.company?.status ?? "" },
    ]);
    downloadCsv(`contacts-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  const btn =
    "inline-flex h-7 items-center gap-1.5 rounded border border-neutral-200 bg-white px-2.5 text-[12px] font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50";

  return (
    <div className="flex flex-wrap items-center gap-1.5 border border-neutral-200 bg-neutral-50 px-2 py-1.5">
      <span className="mr-1 text-[12px] font-medium text-neutral-600">
        {selectedContactIds.length} selected
      </span>

      <div className="relative">
        <button
          type="button"
          disabled={busy}
          onClick={() => setStatusMenuOpen((o) => !o)}
          className={btn}
        >
          Change status
        </button>
        {statusMenuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setStatusMenuOpen(false)} />
            <div className="absolute left-0 z-50 mt-0.5 flex w-28 flex-col overflow-hidden rounded border border-neutral-200 bg-white shadow-sm">
              {LEAD_STATUSES.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => patchContacts({ lead_status: status })}
                  className="px-2 py-1 text-left text-[12px] capitalize text-neutral-700 hover:bg-neutral-50"
                >
                  {status}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <button type="button" className={btn} onClick={exportSelected}>
        <Download className="size-3" />
        Export CSV
      </button>

      <EnrollInSequenceModal
        contactIds={selectedContactIds}
        onDone={onCleared}
        trigger={(openModal) => (
          <button type="button" className={btn} onClick={openModal}>
            Enroll in sequence
          </button>
        )}
      />

      <button
        type="button"
        disabled={busy}
        className={`${btn} border-red-200 text-red-700 hover:bg-red-50`}
        onClick={() => {
          if (confirmingDelete) {
            patchContacts({ archived: true });
          } else {
            setConfirmingDelete(true);
          }
        }}
      >
        <Trash2 className="size-3" />
        {confirmingDelete ? "Confirm delete?" : "Delete"}
      </button>
    </div>
  );
}
