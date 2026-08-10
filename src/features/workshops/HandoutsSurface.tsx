import { useMemo } from "react";
import { DOMAINS, OWNER_DUTIES, PILLARS_SHORT, ROLE_MEANING, WAVE_META } from "./data";
import type { MatrixRow, WorkshopState } from "./types";
import type { WorkshopController } from "./useWorkshopState";
import { domainFields, download, initials } from "./useWorkshopState";

type Seat = {
  domainKey: string;
  domainName: string;
  wave: string;
  role: keyof typeof ROLE_MEANING;
};

/** Every seat a person holds across the roster, plus the Finance security owner. */
function seatsFor(state: WorkshopState, person: string): Seat[] {
  const seats: Seat[] = [];
  const roles: { key: keyof MatrixRow; role: Seat["role"] }[] = [
    { key: "owner", role: "owner" },
    { key: "steward", role: "steward" },
    { key: "sme", role: "sme" },
    { key: "ba", role: "ba" },
  ];
  for (const row of state.matrix) {
    const domain = DOMAINS.find((entry) => entry.key === row.dom);
    if (!domain) continue;
    for (const { key, role } of roles) {
      if (row[key].trim() === person) {
        seats.push({
          domainKey: domain.key,
          domainName: domain.name,
          wave: state.waves[domain.key],
          role,
        });
      }
    }
  }
  if ((state.fields["d.finance.secowner"] || "").trim() === person) {
    seats.push({
      domainKey: "finance",
      domainName: "Finance",
      wave: state.waves.finance,
      role: "sec",
    });
  }
  return seats;
}

/** Anyone whose name appears anywhere on the roster gets a handout. */
function namedPeople(state: WorkshopState): string[] {
  const found = new Set<string>();
  for (const row of state.matrix) {
    for (const value of [row.owner, row.steward, row.sme, row.ba]) {
      const name = value.trim();
      if (name) found.add(name);
    }
  }
  const security = (state.fields["d.finance.secowner"] || "").trim();
  if (security) found.add(security);
  return Array.from(found).sort((a, b) => a.localeCompare(b));
}

function handoutMarkdown(state: WorkshopState, person: string) {
  const seats = seatsFor(state, person);
  const lines: string[] = [];
  lines.push(`# ${person}`);
  lines.push("");
  if (!seats.length) {
    lines.push("_No seats captured on the roster._");
    return lines.join("\n");
  }
  lines.push("## Your seats");
  for (const seat of seats) {
    lines.push(
      `- **${seat.domainName}** (${WAVE_META[seat.wave as "1"].label}): ${ROLE_MEANING[seat.role].title}`
    );
  }
  lines.push("");
  lines.push("## What the role means");
  const uniqueRoles = Array.from(new Set(seats.map((seat) => seat.role)));
  for (const role of uniqueRoles) {
    lines.push(`### ${ROLE_MEANING[role].title}`);
    lines.push(ROLE_MEANING[role].body);
    lines.push("");
  }
  const domainKeys = Array.from(new Set(seats.map((seat) => seat.domainKey)));
  lines.push("## Your domains");
  for (const key of domainKeys) {
    const domain = DOMAINS.find((entry) => entry.key === key);
    if (!domain) continue;
    lines.push("");
    lines.push(`### ${domain.name}`);
    for (const field of domainFields(domain)) {
      const value = state.fields[`d.${key}.${field.k}`]?.trim();
      if (value) lines.push(`- **${field.label}:** ${value}`);
    }
    const decision = state.fields[`d.${key}.defcall`]?.trim();
    if (decision) lines.push(`- **First decision to settle:** ${decision}`);
  }
  const duties = uniqueRoles.includes("owner") ? OWNER_DUTIES : PILLARS_SHORT;
  lines.push("");
  lines.push("## What you are agreeing to");
  for (const duty of duties) lines.push(`- ${duty}`);
  const followUps = state.park.filter((item) => item.who.trim() === person);
  if (followUps.length) {
    lines.push("");
    lines.push("## Your follow-ups");
    for (const item of followUps) lines.push(`- ${item.text}`);
  }
  return lines.join("\n");
}

export function HandoutsSurface({ controller }: { controller: WorkshopController }) {
  const { state, patch, say } = controller;
  const people = useMemo(() => namedPeople(state), [state]);
  const person = state.person && people.includes(state.person) ? state.person : people[0] || "";
  const seats = person ? seatsFor(state, person) : [];
  const uniqueRoles = Array.from(new Set(seats.map((seat) => seat.role)));
  const domainKeys = Array.from(new Set(seats.map((seat) => seat.domainKey)));
  const followUps = state.park.filter((item) => item.who.trim() === person);
  const duties = uniqueRoles.includes("owner") ? OWNER_DUTIES : PILLARS_SHORT;

  if (!people.length) {
    return (
      <section className="ws-card">
        <h3>No names on the roster yet</h3>
        <p className="ws-card-note" style={{ marginTop: 6 }}>
          Fill in the roster on the Workshop stage and each person's handout builds itself from what
          was captured.
        </p>
      </section>
    );
  }

  return (
    <>
      <section className="ws-card ws-np">
        <h3>Who is this for</h3>
        <p className="ws-card-note">
          Every handout is built from what the room captured. Nothing is written twice.
        </p>
        <div className="ws-people-grid" style={{ marginTop: 14 }}>
          {people.map((name) => (
            <button
              type="button"
              key={name}
              className={`ws-people-card ${name === person ? "is-on" : ""}`}
              onClick={() => patch({ person: name })}
            >
              <span className="ws-avatar" aria-hidden="true">
                {initials(name)}
              </span>
              <span>
                <strong>{name}</strong>
                <small>
                  {seatsFor(state, name).length} seat
                  {seatsFor(state, name).length === 1 ? "" : "s"}
                </small>
              </span>
            </button>
          ))}
        </div>
        <div className="ws-toolbar" style={{ marginTop: 16 }}>
          <button type="button" className="ws-btn" onClick={() => window.print()}>
            Print this handout
          </button>
          <button
            type="button"
            className="ws-btn"
            onClick={() => {
              const all = people.map((name) => handoutMarkdown(state, name)).join("\n\n---\n\n");
              download("domain-ownership-handouts.md", all, "text/markdown");
              say("All handouts downloaded");
            }}
          >
            Download all as Markdown
          </button>
        </div>
      </section>

      <article className="ws-sheet">
        <img
          className="ws-sheet-logo"
          src="/brand/ip-corporation-official.png"
          alt="IP Corporation"
        />
        <div>
          <span className="ws-kicker">Domain ownership</span>
          <h3 style={{ marginTop: 6 }}>{person}</h3>
        </div>

        <div>
          <h4 style={{ fontSize: 14, marginBottom: 8 }}>Your seats</h4>
          <table className="ws-sheet-table">
            <thead>
              <tr>
                <th>Domain</th>
                <th>Wave</th>
                <th>Seat</th>
              </tr>
            </thead>
            <tbody>
              {seats.map((seat) => (
                <tr key={`${seat.domainKey}-${seat.role}`}>
                  <td style={{ color: "#14314f", fontWeight: 600 }}>{seat.domainName}</td>
                  <td>
                    <span className="ws-pill">
                      <span
                        className="ws-dot"
                        style={{ background: WAVE_META[seat.wave as "1"].color }}
                        aria-hidden="true"
                      />
                      {WAVE_META[seat.wave as "1"].label}
                    </span>
                  </td>
                  <td>{ROLE_MEANING[seat.role].title}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <h4 style={{ fontSize: 14, marginBottom: 8 }}>What your role means</h4>
          {uniqueRoles.map((role) => (
            <p key={role} className="ws-card-note" style={{ marginBottom: 8 }}>
              <strong style={{ color: "#14314f" }}>{ROLE_MEANING[role].title}. </strong>
              {ROLE_MEANING[role].body}
            </p>
          ))}
        </div>

        {domainKeys.map((key) => {
          const domain = DOMAINS.find((entry) => entry.key === key);
          if (!domain) return null;
          const captured = domainFields(domain)
            .map((field) => ({
              label: field.label,
              value: state.fields[`d.${key}.${field.k}`]?.trim(),
            }))
            .filter((entry) => entry.value);
          const decision = state.fields[`d.${key}.defcall`]?.trim();
          if (!captured.length && !decision) return null;
          return (
            <div key={key}>
              <h4 style={{ fontSize: 14, marginBottom: 8 }}>{domain.name}</h4>
              <table className="ws-sheet-table">
                <tbody>
                  {captured.map((entry) => (
                    <tr key={entry.label}>
                      <td style={{ width: "34%", color: "#14314f", fontWeight: 600 }}>
                        {entry.label}
                      </td>
                      <td>{entry.value}</td>
                    </tr>
                  ))}
                  {decision ? (
                    <tr>
                      <td style={{ color: "#14314f", fontWeight: 600 }}>
                        First decision to settle
                      </td>
                      <td>{decision}</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          );
        })}

        <div>
          <h4 style={{ fontSize: 14, marginBottom: 8 }}>What you are agreeing to</h4>
          <ul className="ws-list">
            {duties.map((duty) => (
              <li key={duty}>{duty}</li>
            ))}
          </ul>
        </div>

        {followUps.length ? (
          <div>
            <h4 style={{ fontSize: 14, marginBottom: 8 }}>Your follow-ups</h4>
            <ul className="ws-list">
              {followUps.map((item) => (
                <li key={item.text}>{item.text}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="ws-card-note" style={{ borderTop: "1px solid #eef1f4", paddingTop: 16 }}>
          Next: your domain workshop is scheduled from here, and the definition above is the first
          thing you settle. Questions go to Patrick Stiller or Steve Nahrup.
        </p>
      </article>
    </>
  );
}
