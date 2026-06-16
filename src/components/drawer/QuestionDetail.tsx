import { MessageSquareText } from "lucide-react";
import { formatPriority, formatStatus } from "../../lib/utils";
import type { OpenQuestion } from "../../types/brain";
import { DrawerHeader, MetaGrid } from "../ui";

interface QuestionDetailProps {
  question: OpenQuestion;
}

export function QuestionDetail({ question }: QuestionDetailProps) {
  return (
    <div className="drawer-stack">
      <DrawerHeader icon={MessageSquareText} eyebrow={question.id} title={question.question} />
      <MetaGrid
        items={[
          ["Priority", formatPriority(question.priority)],
          ["Owner", question.answerOwner],
          ["Target", question.target],
          ["Status", formatStatus(question.status)],
        ]}
      />
    </div>
  );
}
