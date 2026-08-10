import { useState } from "react";
import {
  CERT_CHIPS,
  COMPANIES,
  DEEP_QS,
  DOMAINS,
  FRAME_ITEMS,
  GLOSSARY,
  GROUND_RULES,
  MATRIX_ADVISORY,
  MEDALLION,
  META_CARDS,
  MX_GROUP_ORDER,
  MX_ORDER,
  PILLARS,
  RACI,
  RACI_ROLES,
  SEAT_CARDS,
  SEQ_CAPTURED,
  SEQ_CHARTER,
  STAGES,
  TAG_STYLE,
  TENSION_OPTS,
  WAVE_META,
  WAVE_NOTES,
  WAVE_ORDER,
} from "./data";
import { CheckRow, Field, StageHeading } from "./parts";
import type { MatrixRow } from "./types";
import type { WorkshopController } from "./useWorkshopState";
import { buildSummary, domainFields, download, STAGE_COUNT } from "./useWorkshopState";

const STAGE_LEDES = [
  "The roster is loaded as captured. We amend it together; nobody designs from a blank page. Settle the four seats and the shared words before any debate starts.",
  "A verdict on every row. Agreed moves us on; a flag is fine and becomes an open item in the export. Do not solve isolation questions here.",
  "One sequence, decided out loud. The captured order and the charter order differ, so the room picks one and the export carries it.",
  "Every first-wave domain needs at least one row with both an owner and a steward. Add a company row wherever a seat is missing.",
  "The roster says who. This says what each domain actually covers, where its truth lives, and the one definition call its owner settles first.",
  "Before any name goes upstream, the person hears the day job. If nobody will stand behind a domain, record that. It is a finding.",
  "Everything raised but not settled. Each item gets an owner before we close.",
  "Read it back, export it, and name the one person who writes it up.",
];

export function RunSurface({ controller }: { controller: WorkshopController }) {
  const { state, patch } = controller;
  const step = Math.min(state.step, STAGE_COUNT - 1);
  const stage = STAGES[step];

  return (
    <>
      <StageHeading
        ghost={stage.n}
        kicker={`Stage ${step + 1} of ${STAGE_COUNT} · ${stage.min} minutes`}
        title={stage.name}
        lede={STAGE_LEDES[step]}
      />

      {step === 0 && <StageFraming controller={controller} />}
      {step === 1 && <StageRoles controller={controller} />}
      {step === 2 && <StagePrecedence controller={controller} />}
      {step === 3 && <StageRoster controller={controller} />}
      {step === 4 && <StageDefinitions controller={controller} />}
      {step === 5 && <StageCommitments controller={controller} />}
      {step === 6 && <StagePark controller={controller} />}
      {step === 7 && <StageReadback controller={controller} />}

      <div className="ws-stage-nav">
        <button
          type="button"
          className="ws-btn"
          disabled={step === 0}
          onClick={() => patch({ step: Math.max(0, step - 1) })}
        >
          {step > 0 ? `Back · ${STAGES[step - 1].name}` : "Back"}
        </button>
        <button
          type="button"
          className="ws-btn is-primary"
          disabled={step === STAGE_COUNT - 1}
          onClick={() => patch({ step: Math.min(STAGE_COUNT - 1, step + 1) })}
        >
          {step < STAGE_COUNT - 1 ? `Next · ${STAGES[step + 1].name}` : "Next"}
        </button>
      </div>
    </>
  );
}

/* ---------------- Stage 1 ---------------- */
function StageFraming({ controller }: { controller: WorkshopController }) {
  const { state, patch, toggleCheck } = controller;
  const open = GLOSSARY.find((entry) => entry.term === state.gloss);

  return (
    <>
      <div className="ws-grid">
        {SEAT_CARDS.map((seat) => (
          <article className="ws-card" key={seat.abbr}>
            <span className="ws-avatar" aria-hidden="true">
              {seat.abbr}
            </span>
            <strong style={{ display: "block", marginTop: 10, fontSize: 15, color: "#14314f" }}>
              {seat.title}
            </strong>
            <div className="ws-kicker" style={{ marginTop: 3 }}>
              {seat.sub}
            </div>
            <p className="ws-card-note" style={{ marginTop: 8 }}>
              {seat.body}
            </p>
          </article>
        ))}
      </div>

      <div
        className="ws-card"
        style={{ borderLeft: "4px solid #1b5e9e", background: "rgba(27,94,158,0.04)" }}
      >
        <h3>We bring a proposal; the room amends it</h3>
        <p className="ws-card-note" style={{ marginTop: 6 }}>
          The team pre-builds the proposed model, and named stewards validate coverage and surface
          gaps rather than designing from a blank page. That is why the roster arrives filled in.
        </p>
        <span className="ws-src">source · ADR-0009</span>
      </div>

      <section className="ws-card">
        <h3>The words we are using</h3>
        <p className="ws-card-note">Tap a term to see what it means here.</p>
        <div className="ws-gloss-row" style={{ marginTop: 12 }}>
          {GLOSSARY.map((entry) => (
            <button
              type="button"
              key={entry.term}
              className={`ws-gloss-chip ${state.gloss === entry.term ? "is-on" : ""}`}
              onClick={() => patch({ gloss: state.gloss === entry.term ? "" : entry.term })}
            >
              {entry.term}
            </button>
          ))}
        </div>
        {open ? (
          <div className="ws-gloss-body">
            <strong style={{ color: "#14314f" }}>{open.term}. </strong>
            {open.body}
          </div>
        ) : null}
      </section>

      <section className="ws-card">
        <h3>What we leave with</h3>
        <div style={{ marginTop: 8 }}>
          {FRAME_ITEMS.map((item) => (
            <CheckRow
              key={item.k}
              on={Boolean(state.checks[item.k])}
              title={item.t}
              note={item.s}
              onToggle={() => toggleCheck(item.k)}
            />
          ))}
        </div>
      </section>
    </>
  );
}

/* ---------------- Stage 2 ---------------- */
function StageRoles({ controller }: { controller: WorkshopController }) {
  const { state, setRaci, setRaciNote, applyRaciAll } = controller;

  return (
    <>
      <div className="ws-toolbar">
        <div className="ws-toolbar-spacer" />
        <button type="button" className="ws-btn is-small" onClick={applyRaciAll}>
          Mark all rows agreed
        </button>
      </div>

      <div className="ws-table-wrap">
        <table className="ws-table">
          <thead>
            <tr>
              <th>Activity</th>
              {RACI_ROLES.map((role) => (
                <th key={role}>{role}</th>
              ))}
              <th>Room verdict</th>
            </tr>
          </thead>
          <tbody>
            {RACI.map((row, index) => {
              const verdict = state.raci[index] || {};
              return (
                <tr key={row[0]}>
                  <td className="ws-table-act">{row[0]}</td>
                  {row.slice(1).map((tags, cell) => (
                    <td key={`${row[0]}-${RACI_ROLES[cell]}`}>
                      {tags.split("/").map((tag) => {
                        const style = TAG_STYLE[tag];
                        return (
                          <span
                            className="ws-tag"
                            key={tag}
                            style={{
                              background: style.bg,
                              color: style.color,
                              borderColor: style.border,
                              marginRight: 3,
                            }}
                          >
                            {tag}
                          </span>
                        );
                      })}
                    </td>
                  ))}
                  <td>
                    <div className="ws-verdict">
                      <button
                        type="button"
                        className={verdict.a === "yes" ? "is-yes" : ""}
                        onClick={() => setRaci(index, "yes")}
                      >
                        Agreed
                      </button>
                      <button
                        type="button"
                        className={verdict.a === "flag" ? "is-flag" : ""}
                        onClick={() => setRaci(index, "flag")}
                      >
                        Flag
                      </button>
                    </div>
                    {verdict.a === "flag" ? (
                      <div className="ws-flag-note">
                        <input
                          type="text"
                          placeholder="What needs to change"
                          value={verdict.note || ""}
                          onChange={(event) => setRaciNote(index, event.target.value)}
                        />
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="ws-card">
        <h3>Known gaps this session closes</h3>
        <p className="ws-card-note" style={{ marginTop: 6 }}>
          A Finance security owner has to sign off the cross-company access posture. The
          Manufacturing steward should be paired with MES and OT expertise. The captured roster has
          no seat for the company-scope isolation authority or the shared conformed dimensions; both
          are added on the roster stage.
        </p>
      </div>
    </>
  );
}

/* ---------------- Stage 3 ---------------- */
function StagePrecedence({ controller }: { controller: WorkshopController }) {
  const { state, patch, toggleCheck, moveWave, applyWaves } = controller;

  return (
    <>
      <div className="ws-toolbar">
        <div className="ws-toolbar-spacer" />
        <button type="button" className="ws-btn is-small" onClick={applyWaves}>
          Apply recommended waves
        </button>
      </div>

      <div className="ws-grid">
        <div className="ws-card">
          <span className="ws-kicker">Captured order</span>
          <div className="ws-seq" style={{ marginTop: 10 }}>
            {SEQ_CAPTURED.map((name, index) => (
              <span className={`ws-seq-chip ${index === 0 ? "is-lead" : ""}`} key={name}>
                {name}
              </span>
            ))}
          </div>
        </div>
        <div className="ws-card">
          <span className="ws-kicker">Charter recommendation</span>
          <div className="ws-seq" style={{ marginTop: 10 }}>
            {SEQ_CHARTER.map((name, index) => (
              <span className={`ws-seq-chip ${index === 0 ? "is-lead" : ""}`} key={name}>
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="ws-waves">
        {WAVE_ORDER.map((wave) => (
          <section className="ws-wave" key={wave} style={{ borderTopColor: WAVE_META[wave].color }}>
            <div>
              <h4>{WAVE_META[wave].label}</h4>
              <small>{WAVE_META[wave].sub}</small>
            </div>
            {DOMAINS.filter((domain) => state.waves[domain.key] === wave).map((domain) => (
              <div className="ws-chip" key={domain.key}>
                <span
                  className="ws-dot"
                  style={{ background: WAVE_META[wave].color }}
                  aria-hidden="true"
                />
                <span>
                  {domain.name}
                  {WAVE_NOTES[domain.key] ? (
                    <span className="ws-chip-note">{WAVE_NOTES[domain.key]}</span>
                  ) : null}
                </span>
                <span className="ws-chip-move">
                  <button
                    type="button"
                    aria-label={`Move ${domain.name} earlier`}
                    onClick={() => moveWave(domain.key, -1)}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${domain.name} later`}
                    onClick={() => moveWave(domain.key, 1)}
                  >
                    →
                  </button>
                </span>
              </div>
            ))}
          </section>
        ))}
      </div>

      <div className="ws-card">
        <CheckRow
          on={Boolean(state.checks["waves.agreed"])}
          title="Order of precedence agreed by the room"
          note="The waves above reflect the decision, not just the proposal."
          onToggle={() => toggleCheck("waves.agreed")}
        />
      </div>

      <section className="ws-amber-panel">
        <h3>Say the Sales tension out loud</h3>
        <p className="ws-card-note">
          The charter phases Sales at wave two, but the 30-day executive ask wants Sales named up
          front. Pick one.
        </p>
        <div style={{ marginTop: 6 }}>
          {TENSION_OPTS.map((option) => (
            <CheckRow
              key={option.v}
              on={state.tension === option.v}
              title={option.t}
              note={option.s}
              onToggle={() => patch({ tension: state.tension === option.v ? "" : option.v })}
            />
          ))}
        </div>
      </section>
    </>
  );
}

/* ---------------- Stage 4 ---------------- */
const ROSTER_COLUMNS: { key: keyof MatrixRow; label: string; tip: string }[] = [
  {
    key: "sme",
    label: "SME",
    tip: "Deepest hands-on knowledge of the data where it lives. First call on what a field actually means.",
  },
  {
    key: "steward",
    label: "Data Steward",
    tip: "Day-to-day quality: glossary, metadata, DQ rules, certification readiness, escalating conflicts.",
  },
  {
    key: "owner",
    label: "Data Owner",
    tip: "Senior business leader. Approves definitions and certification, prioritizes work, owns access decisions.",
  },
  {
    key: "ba",
    label: "Business Analyst",
    tip: "The bridge: documents definitions, requirements, and report needs the steward signs off.",
  },
];

function StageRoster({ controller }: { controller: WorkshopController }) {
  const { state, updateRow, addRow, removeRow, restoreMatrix, isNamed } = controller;

  return (
    <>
      <div className="ws-toolbar">
        <div className="ws-toolbar-spacer" />
        <button type="button" className="ws-btn is-small" onClick={restoreMatrix}>
          Restore the captured roster
        </button>
      </div>

      <div style={{ display: "grid", gap: 14 }}>
        {MX_GROUP_ORDER.map((key) => {
          const domain = DOMAINS.find((entry) => entry.key === key);
          if (!domain) return null;
          const wave = WAVE_META[state.waves[key]];
          const advisories = MATRIX_ADVISORY[key] || [];
          const rows = state.matrix
            .map((row, index) => ({ row, index }))
            .filter((entry) => entry.row.dom === key);

          return (
            <section className="ws-roster-group" key={key}>
              <header className="ws-roster-head">
                <h4>{domain.name}</h4>
                <span className="ws-pill" title="Position in the captured spreadsheet">
                  #{MX_ORDER[key]}
                </span>
                <span className="ws-pill">
                  <span className="ws-dot" style={{ background: wave.color }} aria-hidden="true" />
                  {wave.label}
                </span>
                {isNamed(key) ? <span className="ws-named">✓ owner and steward named</span> : null}
                <div className="ws-toolbar-spacer" />
                <button
                  type="button"
                  className="ws-btn is-small is-quiet"
                  onClick={() => addRow(key)}
                >
                  + Add a company row
                </button>
              </header>

              {advisories.length ? (
                <div style={{ display: "grid", gap: 7, padding: "12px 16px 0" }}>
                  {advisories.map((advisory) => (
                    <div className="ws-advisory" key={advisory.t}>
                      <span className="ws-advisory-tag">brain</span>
                      <span>
                        {advisory.t}
                        <span className="ws-src">source · {advisory.src}</span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="ws-roster-rows">
                <table className="ws-roster-table">
                  <thead>
                    <tr>
                      <th title="Which operating company this row covers.">Company</th>
                      {ROSTER_COLUMNS.map((column) => (
                        <th key={column.key} title={column.tip}>
                          {column.label}
                        </th>
                      ))}
                      <th aria-label="Remove row" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length ? (
                      rows.map(({ row, index }) => (
                        <tr key={`${key}-${index}`}>
                          <td>
                            <div className="ws-co-cell">
                              <span
                                className="ws-dot"
                                style={{ background: COMPANIES[row.co]?.color || "#d5d9de" }}
                                aria-hidden="true"
                              />
                              <select
                                value={row.co}
                                title={COMPANIES[row.co]?.tip || "No company set yet."}
                                onChange={(event) => updateRow(index, "co", event.target.value)}
                              >
                                <option value="">Company not set</option>
                                {Object.keys(COMPANIES).map((company) => (
                                  <option key={company} value={company}>
                                    {company}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </td>
                          {ROSTER_COLUMNS.map((column) => (
                            <td key={column.key}>
                              <input
                                type="text"
                                list="ws-people-list"
                                autoComplete="off"
                                aria-label={`${domain.name} ${column.label}`}
                                value={row[column.key]}
                                onChange={(event) =>
                                  updateRow(index, column.key, event.target.value)
                                }
                              />
                            </td>
                          ))}
                          <td>
                            <button
                              type="button"
                              className="ws-row-del"
                              aria-label="Remove this row"
                              onClick={() => {
                                const filled = ROSTER_COLUMNS.some((column) =>
                                  row[column.key].trim()
                                );
                                if (
                                  filled &&
                                  !window.confirm("Remove this row? It has names in it.")
                                )
                                  return;
                                removeRow(index);
                              }}
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} style={{ color: "#8a9099", fontSize: 12.5, padding: 14 }}>
                          No rows yet. Add a company row to name this domain.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>

      <section className="ws-card">
        <h3>Rules that hold no matter who is named</h3>
        <div className="ws-grid" style={{ marginTop: 12 }}>
          {GROUND_RULES.map((rule) => (
            <div className="ws-fact" key={rule.k}>
              <div className="ws-fact-key">{rule.k}</div>
              <div className="ws-fact-value">{rule.v}</div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

/* ---------------- Stage 5 ---------------- */
function StageDefinitions({ controller }: { controller: WorkshopController }) {
  const { state, patch, setField, toggleCheck, applyAllDrafts, isNamed } = controller;

  return (
    <>
      <div className="ws-toolbar">
        <div className="ws-toolbar-spacer" />
        <button type="button" className="ws-btn is-small" onClick={applyAllDrafts}>
          Apply all draft answers
        </button>
      </div>

      <section className="ws-card">
        <h3>Where each decision actually lands</h3>
        <div className="ws-medallion" style={{ marginTop: 12 }}>
          {MEDALLION.map((layer) => (
            <div className="ws-med" key={layer.name}>
              <h5>
                <span className="ws-dot" style={{ background: layer.color }} aria-hidden="true" />
                {layer.name}
              </h5>
              <p>{layer.body}</p>
            </div>
          ))}
        </div>
      </section>

      <div style={{ display: "grid", gap: 12 }}>
        {MX_GROUP_ORDER.map((key) => {
          const domain = DOMAINS.find((entry) => entry.key === key);
          if (!domain) return null;
          const isOpen = state.openDom === key;
          const wave = WAVE_META[state.waves[key]];
          const fields = domainFields(domain);
          const pips = [
            ...fields.filter((field) => field.req).map((field) => `d.${key}.${field.k}`),
            `d.${key}.defcall`,
          ];

          return (
            <article className={`ws-dom ${isNamed(key) ? "is-named" : ""}`} key={key}>
              <button
                type="button"
                className="ws-dom-head"
                aria-expanded={isOpen}
                onClick={() => patch({ openDom: isOpen ? "" : key })}
              >
                <div className="ws-dom-title">
                  <h4>{domain.name}</h4>
                  <small>{domain.tag}</small>
                </div>
                <span className="ws-pill">
                  <span className="ws-dot" style={{ background: wave.color }} aria-hidden="true" />
                  {wave.label}
                </span>
                <span className="ws-pips" aria-hidden="true">
                  {pips.map((pipKey) => (
                    <span
                      className={`ws-pip ${state.fields[pipKey]?.trim() ? "is-on" : ""}`}
                      key={pipKey}
                    />
                  ))}
                </span>
                {isNamed(key) ? <span className="ws-named">✓</span> : null}
                <span style={{ color: "#8a9099", fontSize: 13 }}>{isOpen ? "▾" : "▸"}</span>
              </button>

              {isOpen ? (
                <div className="ws-dom-body">
                  <div className="ws-grid">
                    <div className="ws-fact">
                      <div className="ws-fact-key">How it is run</div>
                      <div className="ws-fact-value">{domain.opmodel}</div>
                    </div>
                    <div className="ws-fact">
                      <div className="ws-fact-key">Sources</div>
                      <div className="ws-fact-value">{domain.sources}</div>
                    </div>
                    <div className="ws-fact">
                      <div className="ws-fact-key">Key identifiers</div>
                      <div className="ws-fact-value">{domain.ident}</div>
                    </div>
                  </div>

                  <div className="ws-dom-fields">
                    {fields.map((field) => (
                      <Field
                        key={field.k}
                        fieldKey={`d.${key}.${field.k}`}
                        label={field.label}
                        type={field.type}
                        required={field.req}
                        guide={state.guide}
                        value={state.fields[`d.${key}.${field.k}`] || ""}
                        onChange={(value) => setField(`d.${key}.${field.k}`, value)}
                      />
                    ))}
                  </div>

                  <div className="ws-decision">
                    <div className="ws-decision-key">The definition call this domain carries</div>
                    <p style={{ fontSize: 13, color: "#14314f", fontWeight: 500 }}>{domain.defq}</p>
                    <Field
                      fieldKey={`d.${key}.defcall`}
                      label="How the room settles it, or the draft the owner approves"
                      type="area"
                      required
                      guide={state.guide}
                      value={state.fields[`d.${key}.defcall`] || ""}
                      onChange={(value) => setField(`d.${key}.defcall`, value)}
                    />
                    <CheckRow
                      on={Boolean(state.checks[`assign.${key}`])}
                      title="Assigned to the owner as their first approval item"
                      onToggle={() => toggleCheck(`assign.${key}`)}
                    />
                  </div>

                  <div>
                    <button
                      type="button"
                      className="ws-btn is-small is-quiet"
                      onClick={() =>
                        patch({
                          deepOpen: { ...state.deepOpen, [key]: !state.deepOpen[key] },
                        })
                      }
                    >
                      {state.deepOpen[key] ? "Hide" : "Open"} the twelve-question deep dive
                    </button>
                    {state.deepOpen[key] ? (
                      <div className="ws-dom-fields" style={{ marginTop: 12 }}>
                        {DEEP_QS.map((question, index) => (
                          <Field
                            key={question}
                            fieldKey={`deep.${key}.${index}`}
                            label={`${index + 1}. ${question}`}
                            type="area"
                            guide={state.guide}
                            value={state.fields[`deep.${key}.${index}`] || ""}
                            onChange={(value) => setField(`deep.${key}.${index}`, value)}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </>
  );
}

/* ---------------- Stage 6 ---------------- */
function StageCommitments({ controller }: { controller: WorkshopController }) {
  const { state, toggleCheck, firstWave } = controller;

  return (
    <>
      <section>
        <h3 style={{ marginBottom: 12 }}>What a steward actually does, week to week</h3>
        <div className="ws-grid">
          {PILLARS.map((pillar) => (
            <article className="ws-card" key={pillar.n}>
              <span className="ws-kicker">Pillar {pillar.n}</span>
              <strong style={{ display: "block", marginTop: 6, fontSize: 15, color: "#14314f" }}>
                {pillar.k}
              </strong>
              <p className="ws-card-note" style={{ marginTop: 7 }}>
                {pillar.v}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="ws-card">
        <h3>Every certified asset carries this</h3>
        <div className="ws-grid" style={{ marginTop: 12 }}>
          {META_CARDS.map((card) => (
            <div className="ws-fact" key={card.k}>
              <div className="ws-fact-key">{card.k}</div>
              <div className="ws-fact-value">{card.v}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="ws-card">
        <h3>Certified only when all eight are true</h3>
        <div className="ws-gloss-row" style={{ marginTop: 12 }}>
          {CERT_CHIPS.map((chip) => (
            <span className="ws-seq-chip" key={chip}>
              {chip}
            </span>
          ))}
        </div>
      </section>

      <section className="ws-card">
        <h3>Acknowledgments for first-wave candidates</h3>
        <p className="ws-card-note">Check each one as it is walked through live.</p>
        <div style={{ marginTop: 8 }}>
          {firstWave.map((domain) => (
            <div key={domain.key}>
              <CheckRow
                on={Boolean(state.checks[`commit.${domain.key}.owner`])}
                title={`${domain.name}: owner candidate has heard what the seat does`}
                onToggle={() => toggleCheck(`commit.${domain.key}.owner`)}
              />
              {!domain.noSteward ? (
                <CheckRow
                  on={Boolean(state.checks[`commit.${domain.key}.steward`])}
                  title={`${domain.name}: steward candidate has heard the five pillars`}
                  onToggle={() => toggleCheck(`commit.${domain.key}.steward`)}
                />
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

/* ---------------- Stage 7 ---------------- */
const PARK_STYLE: Record<string, { label: string; bg: string; color: string }> = {
  q: { label: "Question", bg: "rgba(27,94,158,0.12)", color: "#1b5e9e" },
  r: { label: "Risk", bg: "rgba(200,16,46,0.1)", color: "#c8102e" },
  a: { label: "Action", bg: "rgba(30,123,77,0.12)", color: "#1e7b4d" },
};

function StagePark({ controller }: { controller: WorkshopController }) {
  const { state, addPark, removePark, seedPark } = controller;
  const [text, setText] = useState("");
  const [type, setType] = useState<"q" | "r" | "a">("q");
  const [who, setWho] = useState("");

  const submit = () => {
    addPark(text, type, who);
    setText("");
    setWho("");
  };

  return (
    <>
      <div className="ws-toolbar">
        <div className="ws-toolbar-spacer" />
        <button type="button" className="ws-btn is-small" onClick={seedPark}>
          Add the known open items
        </button>
      </div>

      <section className="ws-card">
        <div className="ws-park-form">
          <div className="ws-field">
            <label className="ws-field-label" htmlFor="ws-park-text">
              Item
            </label>
            <input
              id="ws-park-text"
              type="text"
              value={text}
              placeholder="What was raised but not settled"
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submit();
                }
              }}
            />
          </div>
          <div className="ws-field">
            <label className="ws-field-label" htmlFor="ws-park-type">
              Type
            </label>
            <select
              id="ws-park-type"
              value={type}
              onChange={(event) => setType(event.target.value as "q" | "r" | "a")}
            >
              <option value="q">Open question</option>
              <option value="r">Risk</option>
              <option value="a">Action</option>
            </select>
          </div>
          <div className="ws-field">
            <label className="ws-field-label" htmlFor="ws-park-who">
              Owner
            </label>
            <input
              id="ws-park-who"
              type="text"
              list="ws-people-list"
              value={who}
              placeholder="Who carries it"
              onChange={(event) => setWho(event.target.value)}
            />
          </div>
          <button type="button" className="ws-btn is-primary" onClick={submit}>
            Park it
          </button>
        </div>
      </section>

      <div style={{ display: "grid", gap: 9 }}>
        {state.park.length ? (
          state.park.map((item, index) => {
            const style = PARK_STYLE[item.type];
            return (
              <div className="ws-park-item" key={item.id}>
                <span className="ws-park-type" style={{ background: style.bg, color: style.color }}>
                  {style.label}
                </span>
                <div className="ws-park-body">
                  {item.text}
                  <div className="ws-park-meta" style={{ color: item.who ? "#1e7b4d" : "#c8102e" }}>
                    {item.who ? `owner · ${item.who}` : "no owner yet"}
                    {item.src ? `  ·  ${item.src}` : ""}
                  </div>
                </div>
                <button
                  type="button"
                  className="ws-row-del"
                  aria-label="Remove this item"
                  onClick={() => removePark(index)}
                >
                  ×
                </button>
              </div>
            );
          })
        ) : (
          <div className="ws-empty">
            Nothing parked yet. Capture anything the room should not chase live.
          </div>
        )}
      </div>
    </>
  );
}

/* ---------------- Stage 8 ---------------- */
function StageReadback({ controller }: { controller: WorkshopController }) {
  const { state, patch, isNamed, firstWave, progress, say } = controller;
  const named = firstWave.filter((domain) => isNamed(domain.key));
  const complete = firstWave.length > 0 && named.length === firstWave.length;
  const summary = buildSummary(state, isNamed);

  const definitions = DOMAINS.filter((domain) =>
    state.fields[`d.${domain.key}.defcall`]?.trim()
  ).length;
  const flags = RACI.filter((_, index) => state.raci[index]?.a === "flag").length;
  const unowned = state.park.filter((item) => !item.who.trim()).length;

  const tiles = [
    {
      big: `${named.length}/${firstWave.length}`,
      label: "first-wave domains with both seats named",
    },
    { big: String(state.matrix.length), label: "roster rows on the record" },
    { big: `${definitions}/${DOMAINS.length}`, label: "definition calls settled or assigned" },
    { big: String(flags), label: "role-model rows flagged for change" },
    { big: String(state.park.length), label: "items in the parking lot" },
    { big: String(unowned), label: "parked items with no owner yet" },
    { big: `${progress}%`, label: "of the session captured" },
    { big: state.tension ? "Yes" : "No", label: "Sales phasing settled" },
  ];

  const onImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!parsed || typeof parsed !== "object" || !parsed.fields) throw new Error("bad file");
        patch(parsed);
        say("Session loaded");
      } catch {
        say("That file is not a saved session");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  };

  return (
    <>
      <div className={`ws-seal ${complete ? "is-complete" : "is-partial"}`}>
        <span
          className="ws-seal-mark"
          style={{ background: complete ? "#1e7b4d" : "#b0761a" }}
          aria-hidden="true"
        >
          {complete ? "✓" : "!"}
        </span>
        <div>
          <strong style={{ fontSize: 16, color: "#14314f", display: "block" }}>
            {complete ? "First-wave roster complete" : "First-wave roster incomplete"}
          </strong>
          <span style={{ fontSize: 13, color: "#5a6169" }}>
            {complete
              ? "Every first-wave domain has an owner and a steward. Export it and write it up."
              : `${named.length} of ${firstWave.length} first-wave domains have both seats named.`}
          </span>
        </div>
      </div>

      <div className="ws-grid">
        {tiles.map((tile) => (
          <div className="ws-stat" key={tile.label}>
            <div className="ws-stat-big">{tile.big}</div>
            <div className="ws-stat-label">{tile.label}</div>
          </div>
        ))}
      </div>

      <section className="ws-card">
        <h3>Read it back</h3>
        <p className="ws-card-note">This is exactly what the export contains.</p>
        <pre className="ws-summary" style={{ marginTop: 12 }}>
          {summary}
        </pre>
        <div className="ws-toolbar" style={{ marginTop: 16 }}>
          <button
            type="button"
            className="ws-btn is-primary"
            onClick={() => {
              download("domain-ownership-workshop.md", summary, "text/markdown");
              say("Markdown downloaded");
            }}
          >
            Download Markdown
          </button>
          <button
            type="button"
            className="ws-btn"
            onClick={() => {
              download(
                "domain-ownership-workshop.json",
                JSON.stringify(state, null, 2),
                "application/json"
              );
              say("JSON downloaded");
            }}
          >
            Download JSON
          </button>
          <button
            type="button"
            className="ws-btn"
            onClick={() => {
              navigator.clipboard?.writeText(summary).then(
                () => say("Copied"),
                () => say("Copy was blocked. Use Download instead.")
              );
            }}
          >
            Copy
          </button>
          <label className="ws-btn" htmlFor="ws-import" style={{ display: "inline-flex" }}>
            Load a saved session
            <input
              id="ws-import"
              type="file"
              accept=".json"
              style={{ display: "none" }}
              onChange={onImport}
            />
          </label>
        </div>
      </section>
    </>
  );
}
