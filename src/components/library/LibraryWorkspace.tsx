"use client";

import Link from "next/link";
import { useMemo, useState, type DragEvent } from "react";
import { ArrowLeft, Check, ChevronRight, Copy, ExternalLink, FilePlus2, FileText, Folder, FolderOpen, FolderPlus, Trash2 } from "lucide-react";
import { Markdown } from "@/components/ui-spec/Markdown";
import { UiRenderer } from "@/components/ui-spec/UiRenderer";
import { cn } from "@/lib/cn";
import type { WorkspaceDocument } from "@/lib/workspace/documents";

type Doc = WorkspaceDocument & { shareUrl: string | null };

type TreeNode = { name: string; path: string; folders: TreeNode[]; docs: Doc[] };

function buildTree(folders: string[], docs: Doc[]): TreeNode {
  const root: TreeNode = { name: "", path: "", folders: [], docs: [] };
  const index = new Map<string, TreeNode>([["", root]]);
  const ensure = (path: string): TreeNode => {
    const existing = index.get(path);
    if (existing) return existing;
    const parentPath = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    const node: TreeNode = { name: path.slice(path.lastIndexOf("/") + 1), path, folders: [], docs: [] };
    index.set(path, node);
    ensure(parentPath).folders.push(node);
    return node;
  };
  [...folders].sort((a, b) => a.localeCompare(b)).forEach(ensure);
  for (const doc of docs) ensure(doc.folder).docs.push(doc);
  const sort = (n: TreeNode) => {
    n.docs.sort((a, b) => a.title.localeCompare(b.title));
    n.folders.forEach(sort);
  };
  sort(root);
  return root;
}

function ago(iso: string) {
  const minutes = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function LibraryWorkspace({
  initial,
  initialFolders,
  initialId,
  loadError,
}: {
  initial: Doc[];
  initialFolders: string[];
  initialId?: string;
  loadError?: string | null;
}) {
  const [docs, setDocs] = useState<Doc[]>(initial);
  const [folders, setFolders] = useState<string[]>(initialFolders);
  const [selectedId, setSelectedId] = useState<string | null>(initialId && initial.some((d) => d.id === initialId) ? initialId : null);
  const [activeFolder, setActiveFolder] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [naming, setNaming] = useState<null | "folder" | "file">(null);
  const [nameDraft, setNameDraft] = useState("");
  const [dragOver, setDragOver] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(loadError ?? null);
  const [copied, setCopied] = useState(false);
  const [showList, setShowList] = useState(!initialId);

  const selected = docs.find((d) => d.id === selectedId) ?? null;
  const tree = useMemo(() => buildTree(folders, docs), [folders, docs]);

  if (selected && loadedId !== selected.id) {
    setLoadedId(selected.id);
    setTitle(selected.title);
    setBody(selected.body);
    setEditing(false);
  }
  const dirty = selected ? title !== selected.title || body !== selected.body : false;

  async function call<T>(url: string, init: RequestInit): Promise<T> {
    const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
    const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
    if (!res.ok) throw new Error(data?.error || "Something went wrong");
    return data as T;
  }

  const withShare = (d: WorkspaceDocument): Doc => ({
    ...d,
    shareUrl: d.isPublic && d.shareSlug ? `${window.location.origin}/p/${d.shareSlug}` : null,
  });

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setMessage(null);
    try {
      await task();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function commitName() {
    const name = nameDraft.trim();
    const kind = naming;
    setNaming(null);
    setNameDraft("");
    if (!name || !kind) return;
    await run(async () => {
      if (kind === "folder") {
        const data = await call<{ path: string }>("/api/library/folders", {
          method: "POST",
          body: JSON.stringify({ path: activeFolder ? `${activeFolder}/${name}` : name }),
        });
        setFolders((prev) => [...new Set([...prev, data.path])]);
        setCollapsed((prev) => {
          const next = new Set(prev);
          next.delete(activeFolder);
          return next;
        });
      } else {
        const data = await call<{ document: WorkspaceDocument }>("/api/library", {
          method: "POST",
          body: JSON.stringify({ title: name, folder: activeFolder, body: "" }),
        });
        const doc = withShare(data.document);
        setDocs((prev) => [doc, ...prev]);
        setSelectedId(doc.id);
        setEditing(true);
      }
    });
  }

  async function save() {
    if (!selected) return;
    await run(async () => {
      const data = await call<{ document: WorkspaceDocument }>(`/api/library/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title, body }),
      });
      const next = { ...withShare(data.document), shareUrl: selected.shareUrl };
      setDocs((prev) => prev.map((d) => (d.id === next.id ? next : d)));
      setLoadedId(next.id);
      setMessage("Saved");
    });
  }

  async function move(docId: string, folder: string) {
    const doc = docs.find((d) => d.id === docId);
    if (!doc || doc.folder === folder) return;
    await run(async () => {
      const data = await call<{ document: WorkspaceDocument }>(`/api/library/${docId}`, { method: "PATCH", body: JSON.stringify({ folder }) });
      const next = { ...withShare(data.document), shareUrl: doc.shareUrl };
      setDocs((prev) => prev.map((d) => (d.id === docId ? next : d)));
      if (folder) setFolders((prev) => [...new Set([...prev, folder])]);
    });
  }

  async function togglePublic() {
    if (!selected) return;
    await run(async () => {
      const data = await call<{ document: WorkspaceDocument }>(`/api/library/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({ public: !selected.isPublic }),
      });
      const next = withShare(data.document);
      setDocs((prev) => prev.map((d) => (d.id === next.id ? next : d)));
    });
  }

  async function removeDoc() {
    if (!selected || !window.confirm(`Delete "${selected.title}"? This can't be undone.`)) return;
    await run(async () => {
      await call(`/api/library/${selected.id}`, { method: "DELETE" });
      setDocs((prev) => prev.filter((d) => d.id !== selected.id));
      setSelectedId(null);
      setLoadedId(null);
    });
  }

  async function removeFolder(path: string) {
    await run(async () => {
      await call(`/api/library/folders?path=${encodeURIComponent(path)}`, { method: "DELETE" });
      setFolders((prev) => prev.filter((f) => f !== path));
      if (activeFolder === path) setActiveFolder("");
    });
  }

  async function copyLink() {
    if (!selected?.shareUrl) return;
    try {
      await navigator.clipboard.writeText(selected.shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  }

  function dropOn(event: DragEvent, folder: string) {
    event.preventDefault();
    setDragOver(null);
    const id = event.dataTransfer.getData("text/plain");
    if (id) void move(id, folder);
  }

  function renderFolder(node: TreeNode, depth: number) {
    const isOpen = !collapsed.has(node.path);
    const isActive = activeFolder === node.path && !selectedId;
    return (
      <li key={node.path}>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(node.path);
          }}
          onDragLeave={() => setDragOver(null)}
          onDrop={(e) => dropOn(e, node.path)}
          className={cn(
            "group flex items-center rounded-md pr-1",
            dragOver === node.path ? "bg-[#E8F1FC]" : isActive ? "bg-neutral-100" : "hover:bg-neutral-50",
          )}
          style={{ paddingLeft: depth * 12 }}
        >
          <button
            type="button"
            onClick={() => {
              setActiveFolder(node.path);
              setSelectedId(null);
              setCollapsed((prev) => {
                const next = new Set(prev);
                if (next.has(node.path)) next.delete(node.path);
                else next.add(node.path);
                return next;
              });
            }}
            className="flex min-w-0 flex-1 items-center gap-1.5 px-1.5 py-1.5 text-left text-[13px] text-neutral-800"
          >
            <ChevronRight className={cn("size-3 shrink-0 text-neutral-400 transition-transform", isOpen && "rotate-90")} aria-hidden />
            {isOpen ? <FolderOpen className="size-4 shrink-0 text-[#4379EE]" aria-hidden /> : <Folder className="size-4 shrink-0 text-[#4379EE]" aria-hidden />}
            <span className="truncate font-medium">{node.name}</span>
          </button>
          {node.docs.length === 0 && node.folders.length === 0 ? (
            <button
              type="button"
              onClick={() => void removeFolder(node.path)}
              aria-label={`Delete folder ${node.name}`}
              className="hidden shrink-0 rounded p-1 text-neutral-400 hover:text-red-600 group-hover:block"
            >
              <Trash2 className="size-3" />
            </button>
          ) : null}
        </div>
        {isOpen ? (
          <ul>
            {node.folders.map((child) => renderFolder(child, depth + 1))}
            {node.docs.map((d) => renderFile(d, depth + 1))}
          </ul>
        ) : null}
      </li>
    );
  }

  function renderFile(d: Doc, depth: number) {
    return (
      <li key={d.id} style={{ paddingLeft: depth * 12 }}>
        <button
          type="button"
          draggable
          onDragStart={(e) => e.dataTransfer.setData("text/plain", d.id)}
          onClick={() => {
            setSelectedId(d.id);
            setActiveFolder(d.folder);
            setShowList(false);
          }}
          className={cn(
            "flex w-full items-center gap-1.5 rounded-md px-1.5 py-1.5 pl-5 text-left text-[13px]",
            d.id === selectedId ? "bg-neutral-100 font-medium text-neutral-900" : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900",
          )}
        >
          <FileText className="size-4 shrink-0 text-neutral-400" aria-hidden />
          <span className="truncate">{d.title}</span>
          {d.isPublic ? <span className="ml-auto shrink-0 rounded-full bg-emerald-50 px-1.5 text-[9.5px] font-semibold text-emerald-700">Public</span> : null}
        </button>
      </li>
    );
  }

  const panel = "rounded-lg border border-[#EEEEEE] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)]";
  const empty = docs.length === 0 && folders.length === 0;
  const allFolders = ["", ...folders];

  return (
    <div className="grid h-full min-h-0 flex-1 gap-0 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-4 lg:p-4">
      <aside className={cn(panel, "min-h-0 flex-col", showList ? "flex" : "hidden lg:flex")}>
        <div className="flex shrink-0 items-center justify-between px-3 py-3">
          <h1 className="font-heading text-[16px] font-semibold tracking-tight text-neutral-900">Library</h1>
          <div className="flex gap-0.5">
            <button
              type="button"
              onClick={() => {
                setNaming("file");
                setNameDraft("");
              }}
              aria-label="New file"
              title="New file"
              className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
            >
              <FilePlus2 className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setNaming("folder");
                setNameDraft("");
              }}
              aria-label="New folder"
              title="New folder"
              className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
            >
              <FolderPlus className="size-4" />
            </button>
          </div>
        </div>

        {naming ? (
          <div className="shrink-0 px-3 pb-2">
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => void commitName()}
              onKeyDown={(e) => {
                if (e.key === "Enter") void commitName();
                if (e.key === "Escape") {
                  setNaming(null);
                  setNameDraft("");
                }
              }}
              placeholder={`${naming === "file" ? "File" : "Folder"} name${activeFolder ? ` in ${activeFolder}` : ""}`}
              aria-label="Name"
              className="w-full rounded-md bg-neutral-100 px-2.5 py-1.5 text-[13px] text-neutral-900 outline-none ring-1 ring-[#4379EE] placeholder:text-neutral-400"
            />
          </div>
        ) : null}

        <div
          className={cn("min-h-0 flex-1 overflow-y-auto px-1.5 pb-2", dragOver === "" && "bg-[#E8F1FC]/40")}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver("");
          }}
          onDragLeave={() => setDragOver(null)}
          onDrop={(e) => dropOn(e, "")}
        >
          {empty ? (
            <p className="px-3 py-6 text-center text-[13px] leading-snug text-neutral-500">
              Your workspace is empty. Ask{" "}
              <Link href="/dashboard/copilot" className="font-medium text-[#4379EE] hover:underline">
                Copilot
              </Link>{" "}
              to write a brand identity, a template or a client page, and it will organize the files for you.
            </p>
          ) : (
            <ul>
              {tree.folders.map((f) => renderFolder(f, 0))}
              {tree.docs.map((d) => renderFile(d, 0))}
            </ul>
          )}
        </div>
      </aside>

      <section className={cn(panel, "min-h-0 flex-col", showList ? "hidden lg:flex" : "flex")}>
        <button
          type="button"
          onClick={() => setShowList(true)}
          className="inline-flex items-center gap-1.5 px-4 pb-1 pt-3 text-[13px] font-medium text-neutral-600 lg:hidden"
        >
          <ArrowLeft className="size-4" />
          Files
        </button>
        {!selected ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 text-center">
            <p className="text-[14px] font-medium text-neutral-900">{message && loadError ? "The Library couldn't load" : "Pick a file"}</p>
            <p className="max-w-sm text-[13px] text-neutral-500">
              {message && loadError ? message : "Documents open here as formatted pages. Drag files between folders to reorganize."}
            </p>
          </div>
        ) : (
          <>
            <header className="flex shrink-0 flex-wrap items-center gap-2 px-5 pb-1 pt-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11.5px] text-neutral-400">{selected.folder ? `${selected.folder.replace(/\//g, " / ")}` : "Top level"} · v{selected.version} · {ago(selected.updatedAt)}</p>
                {editing ? (
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    aria-label="Title"
                    className="w-full bg-transparent font-heading text-[22px] font-semibold tracking-tight text-neutral-900 outline-none"
                  />
                ) : (
                  <h2 className="truncate font-heading text-[22px] font-semibold tracking-tight text-neutral-900">{selected.title}</h2>
                )}
              </div>
              <select
                value={selected.folder}
                onChange={(e) => void move(selected.id, e.target.value)}
                aria-label="Move to folder"
                className="max-w-40 rounded-full bg-neutral-100 px-3 py-1.5 text-[12px] text-neutral-700 outline-none"
              >
                {allFolders.map((f) => (
                  <option key={f} value={f}>
                    {f ? f : "Top level"}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setEditing((v) => !v)}
                className="rounded-full bg-neutral-100 px-3 py-1.5 text-[12px] font-medium text-neutral-700 hover:bg-neutral-200/80"
              >
                {editing ? "View" : "Edit"}
              </button>
              {editing ? (
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={busy || !dirty}
                  className="rounded-full bg-[#4379EE] px-4 py-1.5 text-[12px] font-medium text-white hover:bg-[#3567D6] disabled:opacity-40"
                >
                  Save
                </button>
              ) : null}
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-2">
              {editing ? (
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  aria-label="Content"
                  placeholder="Write in Markdown, or ask Copilot to draft this for you."
                  className="h-full min-h-[20rem] w-full resize-none bg-transparent font-mono text-[13px] leading-relaxed text-neutral-800 outline-none placeholder:text-neutral-400"
                />
              ) : (
                <div className="space-y-6">
                  {selected.blocks ? <UiRenderer blocks={selected.blocks} /> : null}
                  {selected.body.trim() ? (
                    <Markdown>{selected.body}</Markdown>
                  ) : !selected.blocks ? (
                    <p className="text-[13px] text-neutral-400">This file is empty. Click Edit, or ask Copilot to write it.</p>
                  ) : null}
                </div>
              )}
            </div>

            <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-5 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void togglePublic()}
                  disabled={busy}
                  className="rounded-full bg-neutral-100 px-3 py-1.5 text-[12px] font-medium text-neutral-700 hover:bg-neutral-200/80"
                >
                  {selected.isPublic ? "Unpublish" : "Publish link"}
                </button>
                {selected.shareUrl ? (
                  <>
                    <a href={selected.shareUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-[12px] font-medium text-[#4379EE] hover:underline">
                      <ExternalLink className="size-3" aria-hidden /> Open page
                    </a>
                    <button type="button" onClick={() => void copyLink()} className="inline-flex items-center gap-1 text-[12px] font-medium text-neutral-600 hover:text-neutral-900">
                      {copied ? <Check className="size-3" aria-hidden /> : <Copy className="size-3" aria-hidden />}
                      {copied ? "Copied" : "Copy link"}
                    </button>
                  </>
                ) : (
                  <span className="text-[11.5px] text-neutral-400">Private. Only you can see this.</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {message ? <span className="text-[12px] text-neutral-500">{message}</span> : null}
                <button type="button" onClick={() => void removeDoc()} disabled={busy} className="inline-flex items-center gap-1 text-[12px] font-medium text-red-600 hover:underline">
                  <Trash2 className="size-3" aria-hidden /> Delete
                </button>
              </div>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
