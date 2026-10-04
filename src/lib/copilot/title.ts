import { getAiClient } from "@/lib/ai/openai";

const CASUAL_GREETING = /^(hi|hey|hello|yo|sup|good (morning|afternoon|evening))[.!?]*$/i;

function fallbackTitle(message: string): string {
  const trimmed = message.trim();
  if (CASUAL_GREETING.test(trimmed)) return "Casual Greeting";
  const words = trimmed.split(/\s+/).slice(0, 4).join(" ");
  return words.slice(0, 60) || "New Task";
}

/**
 * Names a task by its INTENT, not a literal summary — "hey" becomes "Casual
 * Greeting", not "Hey". Short (2-4 words, Title Case) so it reads like a
 * label next to a task icon, not a sentence.
 */
export async function generateConversationTitle(firstMessage: string): Promise<string> {
  try {
    const { ai, model } = await getAiClient();
    const response = await ai.responses.create({
      model,
      input: `Classify the INTENT of this first message to an AI assistant, as a short 2-4 word category label in Title Case (no punctuation, no quotes). Describe what KIND of task or question it is, not a literal summary of the words.

Examples:
"hey" -> Casual Greeting
"can you find me 20 leads at Series A SaaS companies" -> Lead Search
"how is my campaign doing" -> Campaign Performance
"the import is broken" -> Bug Report
"write a cold email for this contact" -> Email Draft

Reply with only the label.

Message: "${firstMessage.slice(0, 500)}"`,
      // Gemini 2.5's internal "thinking" tokens are drawn from this same
      // budget before any visible text — a tight cap (e.g. 20) can leave
      // zero room for the actual label and silently return empty output_text,
      // not an error. 200 gives thinking room while the prompt's own "reply
      // with only the label" instruction keeps the visible answer itself short.
      max_output_tokens: 200,
    });
    const text = response.output_text?.trim().replace(/^["']|["']$/g, "");
    return text && text.length > 0 && text.length <= 60 ? text : fallbackTitle(firstMessage);
  } catch {
    return fallbackTitle(firstMessage);
  }
}
