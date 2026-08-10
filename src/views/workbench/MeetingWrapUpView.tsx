import { CalendarCheck2 } from "lucide-react";
import { useMemo } from "react";
import { brain } from "../../data";
import { MeetingCloseoutPanel } from "../../features/meeting-closeout/MeetingCloseoutPanel";
import type { MeetingEntry } from "../../types/brain";

export function MeetingWrapUpView() {
  const preparedMeetings = useMemo<MeetingEntry[]>(() => {
    if (brain.meetingIndex.meetings?.length) return [...brain.meetingIndex.meetings];
    return [
      ...brain.meetingIndex.upcoming,
      ...brain.meetingIndex.active,
      ...brain.meetingIndex.recent,
    ];
  }, []);

  return (
    <div className="wb-page mc-page" data-testid="meeting-wrap-up-page">
      <section className="mc-page-hero">
        <div>
          <span className="mc-eyebrow">
            <CalendarCheck2 size={15} /> Meetings / Meeting Wrap-up
          </span>
          <h1>Close out today&apos;s meetings.</h1>
          <p>
            Process a listed meeting, review the proposed follow-up, and keep the completed package
            in the Brain.
          </p>
        </div>
        <div className="mc-phase-note">
          <span>Post-meeting</span>
          <strong>Review before anything leaves the Workbench</strong>
        </div>
      </section>

      <MeetingCloseoutPanel preparedMeetings={preparedMeetings} />
    </div>
  );
}
