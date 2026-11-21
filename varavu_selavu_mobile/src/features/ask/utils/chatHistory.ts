/** A chat bubble as the UI holds it. `isError` marks bubbles the client produced itself
 * (network failures, 403s, AI limits); they were never said by the model. */
export interface ChatBubble {
  role: 'user' | 'assistant';
  content: string;
  isError?: boolean;
}

/**
 * The {role, content} history to send to /analysis/chat. Client-side error bubbles are
 * dropped together with the question that failed: sending "❌ Error: CSRF token missing" back
 * as if the assistant had said it teaches the model that it can't help, and skews every
 * later answer in the conversation.
 */
export function toApiHistory(bubbles: ChatBubble[]): { role: 'user' | 'assistant'; content: string }[] {
  const out: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const b of bubbles) {
    if (b.isError) {
      if (out.length && out[out.length - 1].role === 'user') out.pop();
      continue;
    }
    out.push({ role: b.role, content: b.content });
  }
  return out;
}
