import { ChevronRight, MessagesSquare, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AgentMessage } from "./AgentDispatchButton";

const TIME = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
});

function at(iso: string) {
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? TIME.format(date) : "";
}

/**
 * The run's conversation, for reading back what an agent did and why.
 *
 * Messages only. Tool calls, file reads and command output are deliberately not here:
 * they are what the agent used, not what it decided, and they bury the reasoning. The
 * full raw stream stays available under the result block for anyone who needs it.
 *
 * Collapsed by default once a run has finished, and open while one is live so the
 * reasoning can be watched as it arrives.
 */
export function AgentTranscript({
  messages,
  agentLabel,
  running,
}: {
  messages: AgentMessage[];
  agentLabel: string;
  running: boolean;
}) {
  const [open, setOpen] = useState(running);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const feed = useRef<HTMLDivElement | null>(null);
  const count = messages.length;

  // A live run opens itself. Once it ends the panel keeps whatever the reader chose,
  // so a transcript being read does not collapse under them when the run finishes.
  useEffect(() => {
    if (running) setOpen(true);
  }, [running]);

  // Follow the tail while the run is live, but only when the reader is already at the
  // bottom. Yanking the view away from someone reading an earlier message is worse
  // than making them scroll.
  useEffect(() => {
    const node = feed.current;
    if (!node || !running || !open) return;
    const nearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 120;
    if (nearBottom) node.scrollTop = node.scrollHeight;
  }, [running, open]);

  if (!count) return null;

  const spoken = messages.filter((m) => m.role === "agent").length;

  return (
    <section className="wb-tx" data-open={open ? "true" : undefined}>
      <button
        type="button"
        className="wb-tx-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronRight className="wb-tx-chevron" size={15} aria-hidden="true" />
        <MessagesSquare size={15} aria-hidden="true" />
        <span>Conversation</span>
        <small>
          {spoken === 0
            ? running
              ? "waiting for the first reply"
              : "no reply recorded"
            : `${spoken} ${spoken === 1 ? "message" : "messages"}`}
        </small>
        {running && <span className="wb-tx-live">Live</span>}
      </button>

      {open && (
        <div className="wb-tx-feed" ref={feed}>
          {messages.map((message) => {
            const sent = message.role === "sent";
            // The dispatch prompt is long and structural. It matters for an audit but
            // it should not push the reply off the screen, so it starts clipped.
            const long = message.text.length > 900;
            const isOpen = expanded.has(message.seq);
            return (
              <article key={message.seq} className="wb-tx-msg" data-role={message.role}>
                <header>
                  {sent ? (
                    <User size={13} aria-hidden="true" />
                  ) : (
                    <MessagesSquare size={13} aria-hidden="true" />
                  )}
                  <strong>{sent ? "Sent to the agent" : agentLabel}</strong>
                  <time dateTime={message.at}>{at(message.at)}</time>
                </header>
                <p data-clipped={long && !isOpen ? "true" : undefined}>{message.text}</p>
                {long && (
                  <button
                    type="button"
                    className="wb-tx-more"
                    onClick={() =>
                      setExpanded((current) => {
                        const next = new Set(current);
                        if (next.has(message.seq)) next.delete(message.seq);
                        else next.add(message.seq);
                        return next;
                      })
                    }
                  >
                    {isOpen ? "Show less" : "Show all"}
                  </button>
                )}
              </article>
            );
          })}
          {running && (
            <p className="wb-tx-pending" role="status">
              {agentLabel} is still working. New messages appear here as they arrive.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
