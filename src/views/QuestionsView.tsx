import { motion } from "framer-motion";
import { useMemo } from "react";
import { EmptyState, FilterSummary, MetaPill } from "../components/ui";
import { ViewHero } from "../components/ui/ViewHero";
import { brain } from "../data";
import { filterByQuery } from "../lib/search";
import { formatPriority, formatStatus, groupBy } from "../lib/utils";
import type { Detail, OpenQuestion } from "../types/brain";

interface QuestionsViewProps {
  openDetail: (detail: Detail) => void;
  query: string;
}

export function QuestionsView({ openDetail, query }: QuestionsViewProps) {
  const questions = useMemo(
    () =>
      filterByQuery(brain.openQuestions, query, (question: OpenQuestion) => [
        question.question,
        question.answerOwner,
        question.priority,
        question.target,
        question.status,
      ]),
    [query]
  );

  const grouped = groupBy(
    questions,
    (question: OpenQuestion) => question.priority || "Unprioritized"
  );

  return (
    <div className="view-stack">
      <ViewHero view="questions" />
      <FilterSummary
        query={query}
        count={questions.length}
        total={brain.openQuestions.length}
        noun="questions"
      />

      {/* Premium tie-in to the central 3D knowledge graph experience */}
      {questions.length > 0 && (
        <div
          style={{
            margin: "0 0 16px 0",
            fontSize: 12,
            color: "var(--muted)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            paddingLeft: 4,
          }}
        >
          <span>These questions are part of the living synthesis.</span>
          <button
            onClick={() => {
              // Switch to the main graph view and suggest the user searches or uses the Decision Lineage lens
              window.dispatchEvent(
                new CustomEvent("navigate-to-graph", {
                  detail: { suggestLens: "decision-lineage-deep" },
                })
              );
            }}
            style={{
              fontSize: 11,
              padding: "3px 10px",
              borderRadius: "var(--radius-pill)",
              background: "var(--accent-dim)",
              color: "var(--accent)",
              border: "1px solid rgba(26,130,197,0.3)",
              cursor: "pointer",
            }}
          >
            Explore connections in the 3D graph →
          </button>
        </div>
      )}
      <section className="question-grid">
        {Object.entries(grouped).map(([priority, items]) => (
          <article className="glass-card question-column" key={priority}>
            <div className="column-heading compact">
              <span className="mono-kicker">{items.length} questions</span>
              <h2>{formatPriority(priority)}</h2>
            </div>
            <div className="question-list">
              {items.length === 0 ? (
                <EmptyState
                  message="No questions in this priority."
                  hint="These surface from real meetings and work. Explore the 3D graph to see how open questions connect to decisions, systems, and insights across the full knowledge map."
                />
              ) : (
                items.map((question: OpenQuestion, index: number) => (
                  <motion.button
                    className="question-card"
                    key={question.id}
                    onClick={() => openDetail({ kind: "question", value: question })}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.025 }}
                  >
                    <strong>{question.question}</strong>
                    <span className="owner-row">
                      <MetaPill label="Owner" value={question.answerOwner} />
                      <MetaPill label="Target" value={question.target} />
                    </span>
                    <small>{formatStatus(question.status)}</small>
                  </motion.button>
                ))
              )}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
