function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const HIDDEN_KEYS = new Set([
  "agent",
  "task",
  "confirmed",
  "reasoning",
  "tools",
  "id",
  "callId",
  "parentId",
  "needsLeads",
  "leadPull",
  "artifactId",
]);

function humanizeKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\bid\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (char) => char.toUpperCase());
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function shortenId(value: string): string {
  return isUuid(value) ? value.slice(0, 8) : value;
}

function rowLabel(row: Record<string, unknown>): string | null {
  const parts = [
    row.full_name,
    row.fullName,
    row.name,
    row.title,
    row.subject,
    row.keyword,
    row.handle,
    row.domain,
    row.email,
    row.company,
    row.companyName,
    row.status,
    row.lead_status,
    row.leadStatus,
    row.platform,
  ]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .map((part) => part.trim());
  if (parts.length === 0) return null;
  return [...new Set(parts)].slice(0, 4).join(" · ");
}

function isEmpty(value: unknown): boolean {
  if (value == null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (isRecord(value)) return Object.keys(value).length === 0;
  return false;
}

function visibleEntries(value: Record<string, unknown>, hidden: Set<string>): Array<[string, unknown]> {
  return Object.entries(value).filter(([key, item]) => !hidden.has(key) && !isEmpty(item));
}

export function InspectorValue({
  value,
  hiddenKeys = HIDDEN_KEYS,
}: {
  value: unknown;
  hiddenKeys?: Set<string>;
}) {
  if (isEmpty(value)) return null;

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return <p className="copilot-inspector-prose">{typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)}</p>;
  }

  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === "string" || typeof item === "number")) {
      return (
        <ul className="copilot-inspector-tags">
          {value.map((item) => (
            <li key={String(item)}>{String(item)}</li>
          ))}
        </ul>
      );
    }

    const rows = value.map((item, index) => {
      if (!isRecord(item)) return { key: `${index}`, label: String(item) };
      return { key: String(item.id ?? index), label: rowLabel(item) ?? `Item ${index + 1}` };
    });

    return (
      <ul className="copilot-inspector-list">
        {rows.map((row) => (
          <li key={row.key}>{row.label}</li>
        ))}
      </ul>
    );
  }

  if (!isRecord(value)) return <p className="copilot-inspector-prose">{String(value)}</p>;

  if (typeof value.error === "string") {
    return <p className="copilot-inspector-error">{value.error}</p>;
  }

  if (typeof value.summary === "string" && visibleEntries(value, hiddenKeys).every(([key]) => key === "summary")) {
    return <p className="copilot-inspector-prose">{value.summary}</p>;
  }

  const entries = visibleEntries(value, hiddenKeys);
  if (entries.length === 0) {
    return typeof value.summary === "string" ? <p className="copilot-inspector-prose">{value.summary}</p> : null;
  }

  return (
    <dl className="copilot-inspector-fields">
      {typeof value.summary === "string" ? (
        <div className="copilot-inspector-field copilot-inspector-field-block">
          <dt>Summary</dt>
          <dd>{value.summary}</dd>
        </div>
      ) : null}
      {entries
        .filter(([key]) => key !== "summary")
        .map(([key, item]) => (
          <div key={key} className="copilot-inspector-field">
            <dt>{humanizeKey(key)}</dt>
            <dd>
              {typeof item === "string" && isUuid(item) ? (
                shortenId(item)
              ) : typeof item === "string" || typeof item === "number" || typeof item === "boolean" ? (
                typeof item === "boolean" ? (item ? "Yes" : "No") : String(item)
              ) : (
                <InspectorValue value={item} hiddenKeys={hiddenKeys} />
              )}
            </dd>
          </div>
        ))}
    </dl>
  );
}

export function inspectorArgEntries(args: Record<string, unknown> | undefined): Array<[string, unknown]> {
  if (!args) return [];
  return visibleEntries(args, HIDDEN_KEYS);
}
