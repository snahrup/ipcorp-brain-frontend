import type { AgentMessage, AgentReviewCard } from "./types";

export function getPendingReviewCards(
  messages: AgentMessage[],
  attemptedReviewIds: ReadonlySet<string>
): AgentReviewCard[] {
  const seen = new Set<string>();
  const pending: AgentReviewCard[] = [];

  for (const message of messages) {
    for (const review of message.reviewCards ?? []) {
      if (attemptedReviewIds.has(review.id) || seen.has(review.id)) continue;
      seen.add(review.id);
      pending.push(review);
    }
  }

  return pending;
}
