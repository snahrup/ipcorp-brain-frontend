// Ported from evilrabbit/lifeline (MIT), re-skinned and simplified.
//
// Upstream classifies each person as a mentor or someone met, with a photo and a
// two-color dot legend. Attendees here carry no such classification: the seed
// gives one attendee string per meeting, and inferring org or role from it would
// be a guess presented as fact. So every attendee renders identically, from
// initials only — no imagery enters this surface.

import { cx } from "./lifeline-utils";
import type { LifelineMarker, LifelinePerson } from "./types";

export function aggregateLifelinePeople(marker: LifelineMarker): LifelinePerson[] {
  const seen = new Map<string, LifelinePerson>();

  for (const person of marker.people ?? []) {
    if (!seen.has(person.name)) seen.set(person.name, person);
  }

  return [...seen.values()];
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function LifelinePeople({
  people,
  allowWrap = false,
}: {
  people: LifelinePerson[];
  allowWrap?: boolean;
}) {
  if (people.length === 0) return null;

  return (
    <div className="w-full space-y-2.5">
      {people.map((person) => (
        <div key={person.name} className="flex w-full items-center gap-2.5">
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ipc-bg-2 text-[9px] font-semibold text-ipc-support ring-1 ring-ipc-line transition-colors duration-300 group-hover:bg-ipc-navy group-hover:text-white group-hover:ring-ipc-navy"
            aria-hidden="true"
          >
            {getInitials(person.name)}
          </span>
          <p
            className={cx(
              "text-left text-[12.5px] text-ipc-muted transition-colors duration-300 group-hover:text-ipc-text-soft",
              allowWrap ? "leading-snug" : "truncate whitespace-nowrap"
            )}
          >
            {person.name}
          </p>
        </div>
      ))}
    </div>
  );
}
