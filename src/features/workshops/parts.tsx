import { PEOPLE, SENS_OPTS, SUGGEST } from "./data";
import type { FieldType } from "./types";

export function CheckRow({
  on,
  title,
  note,
  onToggle,
}: {
  on: boolean;
  title: string;
  note?: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`ws-check ${on ? "is-on" : ""}`}
      aria-pressed={on}
      onClick={onToggle}
    >
      <span className="ws-check-box" aria-hidden="true">
        {on ? "✓" : ""}
      </span>
      <span className="ws-check-text">
        <strong>{title}</strong>
        {note ? <small>{note}</small> : null}
      </span>
    </button>
  );
}

/**
 * A captured field. With guidance on, the draft answer sits underneath with its
 * reasoning and source, and one tap adopts it.
 */
export function Field({
  fieldKey,
  label,
  type = "text",
  required,
  value,
  guide,
  onChange,
}: {
  fieldKey: string;
  label: string;
  type?: FieldType;
  required?: boolean;
  value: string;
  guide: boolean;
  onChange: (value: string) => void;
}) {
  const suggestion = SUGGEST[fieldKey];
  const applied = Boolean(suggestion) && value.trim() === (suggestion?.v || "").trim();
  const id = `ws-${fieldKey.replace(/[^a-z0-9]/gi, "-")}`;
  const listId = type === "name" ? "ws-people-list" : undefined;

  return (
    <div className="ws-field">
      <label className="ws-field-label" htmlFor={id}>
        <span
          className="ws-field-dot"
          style={{ background: value.trim() ? "#1e7b4d" : "#e1e4e8" }}
          aria-hidden="true"
        />
        {label}
        {required ? <span style={{ color: "#1b5e9e" }}>*</span> : null}
      </label>

      {type === "sens" ? (
        <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
          {SENS_OPTS.map((option) => (
            <option key={option || "none"} value={option}>
              {option || "Not set"}
            </option>
          ))}
        </select>
      ) : type === "area" ? (
        <textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input
          id={id}
          type="text"
          list={listId}
          autoComplete="off"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}

      {guide && suggestion ? (
        <div className={`ws-suggest ${applied ? "is-applied" : ""}`}>
          <div className="ws-suggest-body">
            <strong>{suggestion.v}</strong>
            {suggestion.why ? <span>{suggestion.why}</span> : null}
            {suggestion.src ? <span className="ws-src">source · {suggestion.src}</span> : null}
          </div>
          <button type="button" className="ws-use" onClick={() => onChange(suggestion.v)}>
            {applied ? "In use ✓" : "Use"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** One shared datalist keeps every name input consistent. */
export function PeopleDatalist() {
  return (
    <datalist id="ws-people-list">
      {PEOPLE.map((person) => (
        <option key={person} value={person} />
      ))}
    </datalist>
  );
}

export function StageHeading({
  ghost,
  kicker,
  title,
  lede,
}: {
  ghost: string;
  kicker: string;
  title: string;
  lede: string;
}) {
  return (
    <div className="ws-stage-head">
      <span className="ws-ghost" aria-hidden="true">
        {ghost}
      </span>
      <div className="ws-stage-head-inner">
        <span className="ws-kicker">{kicker}</span>
        <h2>{title}</h2>
        <p className="ws-stage-lede">{lede}</p>
      </div>
    </div>
  );
}
