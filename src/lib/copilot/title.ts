const CASUAL_GREETING = /^(hi|hey|hello|yo|sup|good (morning|afternoon|evening))[.!?]*$/i;

function fallbackTitle(message: string): string {
  const trimmed = message.trim();
  if (CASUAL_GREETING.test(trimmed)) return "Casual Greeting";
  const words = trimmed.split(/\s+/).slice(0, 4).join(" ");
  return words.slice(0, 60) || "New Task";
}

/** The first few words of the message. No model call — a greeting should not wait on a second request. */
export function generateConversationTitle(firstMessage: string): string {
  return fallbackTitle(firstMessage);
}
