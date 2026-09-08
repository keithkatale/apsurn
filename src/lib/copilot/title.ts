import { createGenAIClient, getAiModel } from "@/lib/ai/vertex";

function fallbackTitle(message: string): string {
  const words = message.trim().split(/\s+/).slice(0, 5).join(" ");
  return words.slice(0, 60) || "New conversation";
}

export async function generateConversationTitle(firstMessage: string): Promise<string> {
  try {
    const ai = createGenAIClient();
    const response = await ai.models.generateContent({
      model: getAiModel(),
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Generate a short 2-4 word title (no punctuation, no quotes) summarizing this chat message. Reply with only the title.\n\nMessage: "${firstMessage.slice(0, 500)}"`,
            },
          ],
        },
      ],
      config: { temperature: 0.2, maxOutputTokens: 20, thinkingConfig: { thinkingBudget: 0 } },
    });
    const text = response.text?.trim().replace(/^["']|["']$/g, "");
    return text && text.length > 0 && text.length <= 80 ? text : fallbackTitle(firstMessage);
  } catch {
    return fallbackTitle(firstMessage);
  }
}
