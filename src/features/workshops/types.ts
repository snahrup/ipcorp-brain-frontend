// Shapes for the Domain Ownership Workshop seed data and captured session.

export type WaveKey = "1" | "2" | "3" | "F";

export type StageKind = "brief" | "decide" | "capture" | "readback";

export type Stage = {
  n: string;
  name: string;
  min: number;
  kind: StageKind;
};

export type WaveMeta = { label: string; sub: string; color: string };

export type FieldType = "text" | "sens" | "area" | "name";

export type DomainField = {
  k: string;
  label: string;
  type: FieldType;
  req?: boolean;
};

export type Domain = {
  key: string;
  name: string;
  wave: WaveKey;
  tag: string;
  opmodel: string;
  sources: string;
  ident: string;
  defq: string;
  deep: boolean;
  ownerLabel?: string;
  noSteward?: boolean;
  extra?: DomainField[];
};

export type Company = { color: string; tip: string };

export type MatrixRow = {
  dom: string;
  co: string;
  sme: string;
  steward: string;
  owner: string;
  ba: string;
};

export type Suggestion = { v: string; why?: string; src?: string };

export type Advisory = { t: string; src: string };

export type TagStyle = { bg: string; color: string; border: string };

export type RoleMeaning = { title: string; body: string };

export type ParkType = "q" | "r" | "a";

export type ParkItem = {
  /** Stable across edits and reorders so the list keeps its identity. */
  id: string;
  text: string;
  type: ParkType;
  who: string;
  src?: string;
};

export type RaciVerdict = { a?: "yes" | "flag"; note?: string };

/** The full captured session. Persisted to localStorage on every change. */
export type WorkshopState = {
  step: number;
  slide: number;
  guide: boolean;
  fields: Record<string, string>;
  raci: Record<number, RaciVerdict>;
  waves: Record<string, WaveKey>;
  tension: string;
  park: ParkItem[];
  checks: Record<string, boolean>;
  matrix: MatrixRow[];
  person: string;
  openDom: string;
  deepOpen: Record<string, boolean>;
  gloss: string;
  timerSec: number;
};

/** Which surface of the workshop is showing. Mirrors the nav group. */
export type WorkshopSurface = "prepare" | "present" | "run" | "handouts";
