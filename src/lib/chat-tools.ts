export type ToolCall = {
  name: string;
  args: Record<string, unknown>;
};

export const CHAT_TOOL_DECLARATIONS = [
  {
    name: "get_current_time",
    description: "Get the current date and time (ISO 8601, local timezone offset).",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "calculate",
    description: "Evaluate a basic arithmetic expression using +, -, *, /, %, parentheses, and decimals.",
    parameters: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "The arithmetic expression to evaluate, e.g. (12.5 + 3) * 2",
        },
      },
      required: ["expression"],
    },
  },
  {
    name: "lookup_weather",
    description: "Look up a short weather summary for a city (demo tool; returns a deterministic sample).",
    parameters: {
      type: "object",
      properties: {
        city: { type: "string", description: "City name, e.g. Nairobi" },
      },
      required: ["city"],
    },
  },
] as const;

function safeCalculate(expression: string): string {
  const cleaned = expression.replace(/\s+/g, "");
  if (!/^[\d.+\-*/%()]+$/.test(cleaned)) {
    throw new Error("Expression may only contain numbers and + - * / % ( ).");
  }
  // eslint-disable-next-line no-new-func
  const value = Function(`"use strict"; return (${cleaned});`)() as unknown;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("Expression did not evaluate to a finite number.");
  }
  return String(value);
}

export function runTool(call: ToolCall): string {
  switch (call.name) {
    case "get_current_time":
      return new Date().toISOString();
    case "calculate": {
      const expression = String(call.args.expression ?? "");
      if (!expression.trim()) throw new Error("expression is required");
      return safeCalculate(expression);
    }
    case "lookup_weather": {
      const city = String(call.args.city ?? "").trim() || "Unknown";
      return JSON.stringify({
        city,
        summary: "Partly cloudy",
        tempC: 22,
        note: "Demo weather tool — not live data.",
      });
    }
    default:
      throw new Error(`Unknown tool: ${call.name}`);
  }
}

export function toolStepLabel(name: string, phase: "start" | "done", args?: Record<string, unknown>): string {
  const detail =
    name === "calculate" && args?.expression
      ? ` \`${String(args.expression)}\``
      : name === "lookup_weather" && args?.city
        ? ` in ${String(args.city)}`
        : "";

  if (phase === "start") {
    if (name === "get_current_time") return "Calling get_current_time";
    if (name === "calculate") return `Calling calculate${detail}`;
    if (name === "lookup_weather") return `Calling lookup_weather${detail}`;
    return `Calling ${name}`;
  }

  if (name === "get_current_time") return "Got current time";
  if (name === "calculate") return `Calculated${detail}`;
  if (name === "lookup_weather") return `Looked up weather${detail}`;
  return `Finished ${name}`;
}
