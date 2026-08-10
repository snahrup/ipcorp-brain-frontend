import {
  DECISION_CARDS,
  KIND_COLORS,
  PEOPLE_CARDS,
  PREFILL_ITEMS,
  PREP_STAGE_NOTES,
  RISK_CARDS,
  STAGES,
} from "./data";
import { CheckRow } from "./parts";
import type { WorkshopController } from "./useWorkshopState";
import { initials } from "./useWorkshopState";

const AGENDA_LEGEND = [
  { label: "Brief the room", color: KIND_COLORS.brief },
  { label: "Decide", color: KIND_COLORS.decide },
  { label: "Capture", color: KIND_COLORS.capture },
  { label: "Read back", color: KIND_COLORS.readback },
];

const TOTAL_MINUTES = STAGES.reduce((sum, stage) => sum + stage.min, 0);

export function PrepareSurface({ controller }: { controller: WorkshopController }) {
  const { state, toggleCheck } = controller;

  const stats = [
    { big: String(STAGES.length), label: "stages in the run of show" },
    { big: String(TOTAL_MINUTES), label: "minutes, timed per stage" },
    { big: String(state.matrix.length), label: "roster rows loaded as captured" },
    { big: "3", label: "decisions the room must land" },
  ];

  return (
    <>
      <section className="ws-hero">
        <span className="ws-kicker">Facilitator prep</span>
        <h2>Everything you need before the room fills up.</h2>
        <p className="ws-hero-lede">
          The roster is already loaded as captured, so nobody starts from a blank page. Your job is
          to run the eight stages on time, land three decisions, and leave with an export. This page
          is yours alone; nothing here is shown on the screenshare.
        </p>
        <div className="ws-stats">
          {stats.map((stat) => (
            <div className="ws-stat" key={stat.label}>
              <div className="ws-stat-big">{stat.big}</div>
              <div className="ws-stat-label">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="ws-card">
        <h3>The two hours, at a glance</h3>
        <p className="ws-card-note">Segments are sized by the minutes each stage gets.</p>
        <div className="ws-agenda" style={{ marginTop: 14 }}>
          {STAGES.map((stage) => (
            <div
              className="ws-agenda-seg"
              key={stage.n}
              style={{
                background: KIND_COLORS[stage.kind],
                width: `${((stage.min / TOTAL_MINUTES) * 100).toFixed(2)}%`,
              }}
              title={`${stage.name} · ${stage.min} minutes`}
            >
              <strong>{stage.n}</strong>
              <span>{stage.name}</span>
            </div>
          ))}
        </div>
        <div className="ws-legend">
          {AGENDA_LEGEND.map((entry) => (
            <span key={entry.label}>
              <span className="ws-swatch" style={{ background: entry.color }} />
              {entry.label}
            </span>
          ))}
        </div>
      </section>

      <section className="ws-grid">
        {STAGES.map((stage, index) => {
          const note = PREP_STAGE_NOTES[index];
          return (
            <article
              className="ws-stagecard"
              key={stage.n}
              style={{ borderTopColor: KIND_COLORS[stage.kind] }}
            >
              <div className="ws-stagecard-head">
                <strong>{stage.n}</strong>
                <h4>{stage.name}</h4>
                <em>{stage.min}m</em>
              </div>
              <p className="ws-note">{note.goal}</p>
              <p className="ws-note is-landed">
                <b>Landed when:</b> {note.landed}
              </p>
              <p className="ws-note is-watch">
                <b>Watch:</b> {note.watch}
              </p>
            </article>
          );
        })}
      </section>

      <section>
        <h3 style={{ marginBottom: 12 }}>Three decisions the room has to land</h3>
        <div className="ws-grid">
          {DECISION_CARDS.map((card) => (
            <article className="ws-dark" key={card.n}>
              <span className="ws-dark-num">Decision {card.n}</span>
              <h4>{card.title}</h4>
              <p>{card.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h3 style={{ marginBottom: 4 }}>Know the room</h3>
        <p className="ws-card-note" style={{ marginBottom: 12 }}>
          Who is in the seats, and what each person is carrying into the session.
        </p>
        <div className="ws-grid">
          {PEOPLE_CARDS.map((person) => (
            <article className="ws-person" key={person.name}>
              <span className="ws-avatar" aria-hidden="true">
                {initials(person.name)}
              </span>
              <div>
                <strong>{person.name}</strong>
                <p>{person.why}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h3 style={{ marginBottom: 4 }}>What will get pushed back on</h3>
        <p className="ws-card-note" style={{ marginBottom: 12 }}>
          Each one has an answer already. Say it once, then move.
        </p>
        <div className="ws-grid">
          {RISK_CARDS.map((risk) => (
            <article className="ws-card" key={risk.claim}>
              <strong style={{ fontSize: 13.5, color: "#14314f" }}>{risk.claim}</strong>
              <p className="ws-card-note" style={{ marginTop: 7 }}>
                {risk.counter}
              </p>
              <span className="ws-src">source · {risk.src}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="ws-card">
        <h3>Before you start</h3>
        <p className="ws-card-note">These stay checked between sessions on this device.</p>
        <div style={{ marginTop: 8 }}>
          {PREFILL_ITEMS.map((item) => (
            <CheckRow
              key={item.k}
              on={Boolean(state.checks[item.k])}
              title={item.t}
              onToggle={() => toggleCheck(item.k)}
            />
          ))}
        </div>
      </section>
    </>
  );
}
