import type { Digest, SlackMessage } from "./types";

const WEEK_SECONDS = 7 * 24 * 60 * 60;
const TOP_THREAD_COUNT = 3;

/**
 * Build the weekly digest for one Slack channel.
 *
 * The week starts at `weekStart` and runs for 7 days.
 *
 * Returns:
 *  - topThreads: the 3 most active threads this week
 *  - unanswered: questions posted this week that nobody has answered
 */
export function buildDigest(messages: SlackMessage[], weekStart: Date): Digest {
  const start = weekStart.getTime() / 1000;
  const end = start + WEEK_SECONDS;
  const inWeek = (m: SlackMessage) => {
    const t = Number(m.ts);
    return t >= start && t < end;
  };

  const byTs = new Map(messages.map((m) => [m.ts, m]));

  // Group this week's human replies by thread. reply_count on the parent is an
  // all-time total, so we count the replies ourselves.
  const repliesByThread = new Map<string, SlackMessage[]>();
  for (const m of messages) {
    if (!isReply(m) || !inWeek(m) || m.subtype) continue;
    const replies = repliesByThread.get(m.thread_ts!) ?? [];
    replies.push(m);
    repliesByThread.set(m.thread_ts!, replies);
  }

  // Threads started before this week still count if they were active this week.
  const topThreads = [...repliesByThread]
    .map(([thread_ts, replies]) => ({
      thread_ts,
      text: byTs.get(thread_ts)?.text ?? "",
      repliesThisWeek: replies.length,
    }))
    .sort((a, b) => b.repliesThisWeek - a.repliesThisWeek || Number(a.thread_ts) - Number(b.thread_ts))
    .slice(0, TOP_THREAD_COUNT);

  // A question is answered once someone other than the asker replies (bots
  // and the asker's own follow-ups don't count).
  const unanswered = messages
    .filter((m) => !isReply(m) && !m.subtype && inWeek(m) && isQuestion(m.text))
    .filter((m) => !(repliesByThread.get(m.ts) ?? []).some((r) => r.user !== m.user))
    .sort((a, b) => Number(a.ts) - Number(b.ts))
    .map(({ ts, user, text }) => ({ ts, user, text }));

  return { topThreads, unanswered };
}

function isReply(m: SlackMessage): boolean {
  return m.thread_ts !== undefined && m.thread_ts !== m.ts;
}

function isQuestion(text: string): boolean {
  return text.trim().endsWith("?");
}
