export function buildAccountContextInstruction(snapshot: unknown): string {
  return `Current account snapshot (already loaded, do not call get_account_snapshot again this turn unless the user asks for fresh numbers):\n${JSON.stringify(snapshot).slice(0, 6000)}`;
}
