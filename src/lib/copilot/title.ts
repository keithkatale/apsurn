import { getAiClient } from "@/lib/ai/openai";

function fallbackTitle(message: string): string {
  const words = message.trim().split(/\s+/).slice(0, 5).join(" ");
  return words.slice(0, 60) || "New conversation";
}

export async function generateConversationTitle(firstMessage: string): Promise<string> {
  try {
    const { ai, model } = await getAiClient();
    const response = await ai.responses.create({
      model,
      input: `Generate a short 2-4 word title (no punctuation, no quotes) summarizing this chat message. Reply with only the title.\n\nMessage: "${firstMessage.slice(0, 500)}"`,
      max_output_tokens: 20,
    });
    const text = response.output_text?.trim().replace(/^["']|["']$/g, "");
    return text && text.length > 0 && text.length <= 80 ? text : fallbackTitle(firstMessage);
  } catch {
    return fallbackTitle(firstMessage);
  }
}
