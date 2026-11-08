import type { AiService } from './ai.service';
import { buildFacts, buildSystemPrompt, buildUserPrompt, guardAnswer, type AiContextInput } from './context';

export type AiAnswerResult =
  | { ok: true; text: string; included: number; total: number }
  | { ok: false; reason: string };

/**
 * پاسخ مدل با نگهبان.
 *
 * این تابع تنها راه استفاده از مدل است: هیچ‌جا `complete` را مستقیم صدا نمی‌زنیم
 * تا خروجی مدل بی‌نگهبان به مشتری نرسد.
 */
export async function answerWithAi(
  ai: AiService,
  input: AiContextInput,
  question: string,
): Promise<AiAnswerResult> {
  if (!ai.enabled) return { ok: false, reason: 'ai_disabled' };

  const { facts, included, total } = buildFacts(input);
  const system = buildSystemPrompt(input.shop);
  const user = buildUserPrompt(question, facts, input.history, input.historyLimit);

  const text = await ai.complete(system, user);
  if (!text) return { ok: false, reason: 'no_answer' };

  const guard = guardAnswer(text, facts);
  if (!guard.ok) return { ok: false, reason: guard.reason ?? 'rejected' };

  return { ok: true, text: text.trim(), included, total };
}
