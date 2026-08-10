export type DailyPrepState = "ready" | "partial" | "empty" | "unavailable";
export type PrepPackageState = "ready" | "partial" | "missing";

export interface DailyPrepArtifact {
  name: string;
  role: string;
  type: string;
  size: number;
  updatedAt: string;
}

export interface DailyPrepSection {
  heading: string;
  content: string;
}

export interface DailyPrepPackage {
  id: string;
  title: string;
  when?: string;
  organizer?: string;
  invited?: string;
  preparedAt?: string;
  evidenceState?: string;
  status: PrepPackageState;
  missing: string[];
  updatedAt?: string;
  artifacts: DailyPrepArtifact[];
  sections: DailyPrepSection[];
}

export interface DailyMeetingPrep {
  date: string;
  state: DailyPrepState;
  reason?: string;
  sourceLabel: string;
  updatedAt?: string;
  summary: { checked: number; built: number; skipped: number; blocked: number };
  packages: DailyPrepPackage[];
  skipped: Array<{ title: string; reason: string }>;
}

export async function fetchDailyMeetingPrep(
  date: string,
  signal?: AbortSignal
): Promise<DailyMeetingPrep> {
  const response = await fetch(`/api/meeting-prep/daily?date=${encodeURIComponent(date)}`, {
    signal,
  });
  const body = await response.json();
  if (!response.ok || !body.ok)
    throw new Error(body.message || "Daily meeting prep could not be loaded.");
  return body.data as DailyMeetingPrep;
}

export function prepFileUrl(
  date: string,
  packageId: string,
  fileName: string,
  options: { download?: boolean; print?: boolean } = {}
) {
  const query = new URLSearchParams({ date, package: packageId, file: fileName });
  if (options.download) query.set("download", "true");
  if (options.print) query.set("print", "true");
  return `/api/meeting-prep/file?${query.toString()}`;
}
