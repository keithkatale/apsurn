"use client";

import { usePathname } from "next/navigation";
import { idFromPath, pushPath } from "@/lib/nav/url-state";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, Loader2, MailCheck, PanelLeftOpen, Search, X } from "lucide-react";
import { ThreeDButton } from "@/components/buttons/three-d-button";
import { BulkActionBar } from "@/components/prospects/BulkActionBar";
import { ContactProfilePanel } from "@/components/prospects/ContactProfilePanel";
import { ContactsTable, type FlatRow } from "@/components/prospects/ContactsTable";
import { ProspectListsGrid } from "@/components/prospects/ProspectListsGrid";
import { NewProspectingRun } from "@/components/prospects/NewProspectingRun";
import { ProspectChatPanel } from "@/components/prospects/ProspectChatPanel";
import type { ProspectSearchCriteria } from "@/components/prospects/ProspectComposeModal";
import { SignalSearchPanel } from "@/components/prospects/SignalSearchPanel";
import { WeeklyScheduleForm } from "@/components/prospects/WeeklyScheduleForm";
import type { ProspectRow } from "@/components/prospects/types";
import { LIST_SOURCE_LABEL, type ProspectListInfo } from "@/lib/prospects/lists";

type LeftPanelMode = "idle" | "form" | "structured-run" | "chat";

export function ProspectsWorkspace({
  initialCompanies,
  initialLists = [],
  openFind = false,
}: {
  initialCompanies: ProspectRow[];
  initialLists?: ProspectListInfo[];
  openFind?: boolean;
}) {
  const [companies, setCompanies] = useState<ProspectRow[]>(initialCompanies);
  const [panelOpen, setPanelOpen] = useState(openFind);
  const [leftMode, setLeftMode] = useState<LeftPanelMode>(openFind ? "form" : "idle");
  const [activeCriteria, setActiveCriteria] = useState<ProspectSearchCriteria | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [profileIds, setProfileIds] = useState<{ contactId: string; companyId: string } | null>(null);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [lists, setLists] = useState<ProspectListInfo[]>(initialLists);
  // The address bar picks the view: /dashboard/prospects is the grid, /dashboard/prospects/all the general list,
  // /dashboard/prospects/<id> one list. An unknown id shows the grid.
  const pathId = idFromPath(usePathname(), "/dashboard/prospects");
  const openList = pathId === "all" || (pathId && lists.some((list) => list.id === pathId)) ? pathId : null;
  const setOpenList = useCallback((id: string | null) => pushPath(id ? `/dashboard/prospects/${id}` : "/dashboard/prospects"), []);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/prospect-companies");
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.companies)) setCompanies(data.companies as ProspectRow[]);
      if (Array.isArray(data.lists)) setLists(data.lists as ProspectListInfo[]);
    } catch {
      // best-effort; the next event will retry
    }
  }, []);

  const active = companies.filter((p) => !p.archived_at);

  const query = search.trim().toLowerCase();
  const matchesQuery = useCallback(
    (p: ProspectRow) =>
      !query ||
      p.name.toLowerCase().includes(query) ||
      p.domain.toLowerCase().includes(query) ||
      p.contacts.some((c) => c.full_name?.toLowerCase().includes(query)),
    [query]
  );

  // A saved company stays visible unless it was explicitly rejected; that was a deliberate action.
  const qualified = useMemo(
    () =>
      active
        .filter((p) => p.status !== "rejected" && matchesQuery(p) && (!openList || openList === "all" || p.list_id === openList))
        .filter((p) => p.contacts.length > 0),
    [active, matchesQuery, openList],
  );
  const gridProspects = useMemo(() => active.filter((p) => p.status !== "rejected" && p.contacts.length > 0), [active]);
  const currentList = lists.find((list) => list.id === openList) ?? null;

  async function createList(name: string) {
    const res = await fetch("/api/prospect-lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.list) {
      setLists((prev) => [data.list as ProspectListInfo, ...prev]);
      setOpenList(data.list.id as string);
    }
  }

  const [verifying, setVerifying] = useState(false);
  const [verifyNote, setVerifyNote] = useState<string | null>(null);
  async function verifyAll() {
    setVerifying(true);
    setVerifyNote(null);
    try {
      const res = await fetch("/api/contacts/verify", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Verification failed");
      setVerifyNote(
        data.checked === 0 && data.unanswered === 0
          ? "Every email is already verified."
          : `${data.verified} verified, ${data.invalid + data.risky} held back${data.unanswered ? `, ${data.unanswered} unanswered` : ""}.`,
      );
      await refetch();
    } catch (error) {
      setVerifyNote(error instanceof Error ? error.message : "Verification failed");
    } finally {
      setVerifying(false);
    }
  }

  async function moveCompanyTo(companyId: string, listId: string) {
    setCompanies((prev) => prev.map((p) => (p.id === companyId ? { ...p, list_id: listId } : p)));
    await fetch("/api/prospect-lists/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listId, companyIds: [companyId] }),
    });
    await refetch();
  }

  const allContacts = useMemo(() => qualified.flatMap((p) => p.contacts), [qualified]);

  const profileRow: FlatRow | null = useMemo(() => {
    if (!profileIds) return null;
    const company = companies.find((c) => c.id === profileIds.companyId);
    const contact = company?.contacts.find((c) => c.id === profileIds.contactId);
    if (!company || !contact) return null;
    return { contact, company };
  }, [companies, profileIds]);

  function openPanel() {
    if (leftMode === "idle") setLeftMode("form");
    setPanelOpen(true);
  }

  useEffect(() => {
    if (openFind) openPanel();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open once from query
  }, [openFind]);

  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden">
      <div
        className={`shrink-0 overflow-hidden bg-white md:transition-[width] md:duration-300 md:ease-out ${
          panelOpen ? "fixed inset-0 z-40 md:static md:w-[420px] md:border-r md:border-neutral-200" : "w-0"
        }`}
      >
        <div className="relative flex h-full w-full flex-col md:w-[420px]">
          <button
            type="button"
            onClick={() => setPanelOpen(false)}
            aria-label="Collapse panel"
            className="absolute right-3 top-3 z-10 rounded-full p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
          >
            <X className="size-4" />
          </button>

          {leftMode === "form" ? (
            <SignalSearchPanel
              onApprove={(criteria) => {
                setActiveCriteria(criteria);
                setLeftMode("structured-run");
              }}
              onTalkToAi={() => setLeftMode("chat")}
            />
          ) : leftMode === "structured-run" && activeCriteria ? (
            <NewProspectingRun criteria={activeCriteria} onLeadSaved={refetch} onRunFinished={refetch} />
          ) : leftMode === "chat" ? (
            <ProspectChatPanel onLeadSaved={refetch} onRunFinished={refetch} />
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-3 px-3 py-3 md:px-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="flex shrink-0 items-center gap-2">
              {searchOpen ? (
                <input
                  autoFocus
                  className="input w-full py-1.5 sm:w-44"
                  placeholder="Search…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onBlur={() => {
                    if (!search.trim()) setSearchOpen(false);
                  }}
                />
              ) : (
                <button
                  type="button"
                  aria-label="Search prospects"
                  onClick={() => setSearchOpen(true)}
                  className="rounded-full p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
                >
                  <Search className="size-4" />
                </button>
              )}
            </div>
            {openList ? (
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setOpenList(null);
                    setSelected(new Set());
                  }}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium text-neutral-600 hover:bg-neutral-100"
                >
                  <ChevronLeft className="size-3.5" />
                  Lists
                </button>
                <p className="min-w-0 truncate text-[14px] font-semibold text-neutral-900">{currentList?.name ?? "All prospects"}</p>
                {currentList ? <span className="shrink-0 text-[12px] text-neutral-400">{LIST_SOURCE_LABEL[currentList.source]}</span> : null}
              </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-end gap-2 sm:ml-auto">
              {selected.size > 0 ? (
                <BulkActionBar
                  selectedContactIds={[...selected]}
                  contacts={allContacts}
                  prospects={qualified}
                  onCleared={() => setSelected(new Set())}
                />
              ) : (
                <>
                  {verifyNote ? <span className="text-[12px] text-neutral-500">{verifyNote}</span> : null}
                  <button
                    type="button"
                    onClick={() => void verifyAll()}
                    disabled={verifying}
                    title="Check every email before it is ever sent to"
                    className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1.5 text-[12px] font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
                  >
                    {verifying ? <Loader2 className="size-3.5 animate-spin" /> : <MailCheck className="size-3.5" />}
                    {verifying ? "Verifying…" : "Verify emails"}
                  </button>
                  <WeeklyScheduleForm />
                  <ThreeDButton type="button" variant="solid" size="sm" onClick={openPanel}>
                    <PanelLeftOpen className="size-4" />
                    <span>Find prospects</span>
                  </ThreeDButton>
                </>
              )}
            </div>
          </div>

          {!openList ? (
            <ProspectListsGrid lists={lists} prospects={gridProspects} onOpen={setOpenList} onCreate={createList} />
          ) : (
            <div className="flex flex-col gap-3">
              {qualified.length === 0 ? (
                <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-center">
                  <p className="text-sm text-neutral-500">
                    {active.length === 0 ? "No prospects have been generated yet. Click “Find prospects” to build your first list." : "Nothing in this list yet. Open All prospects and pick a list for a contact in the List column."}
                  </p>
                </div>
              ) : (
                <ContactsTable
                  prospects={qualified}
                  selected={selected}
                  onSelectedChange={setSelected}
                  lists={lists}
                  onMoveToList={moveCompanyTo}
                  onOpenProfile={(row) => setProfileIds({ contactId: row.contact.id, companyId: row.company.id })}
                />
              )}
            </div>
          )}
        </div>
      </div>

      <div
        className={`shrink-0 overflow-hidden bg-white md:transition-[width] md:duration-300 md:ease-out ${
          profileRow ? "fixed inset-0 z-40 md:static md:w-[420px] md:border-l md:border-neutral-200" : "w-0"
        }`}
      >
        <div className="h-full w-full md:w-[420px]">
          {profileRow && (
            <ContactProfilePanel
              contact={profileRow.contact}
              company={profileRow.company}
              onClose={() => setProfileIds(null)}
              onSaved={refetch}
            />
          )}
        </div>
      </div>
    </div>
  );
}
