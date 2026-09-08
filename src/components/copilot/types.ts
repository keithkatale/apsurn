export type UIMessage =
  | { id: string; role: "user"; content: string }
  | { id: string; role: "model"; content: string }
  | { id: string; role: "tool"; toolName: string; status: "running" | "done"; result?: unknown };

export interface ActiveTool {
  name: string;
  status: "running" | "done";
  result?: unknown;
}
