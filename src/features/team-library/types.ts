export type TeamLibraryState = "local-sync" | "partial";

export interface TeamLibraryFile {
  name: string;
  path: string;
  sectionId: string;
  extension: string;
  group: string;
  bytes: number;
  modifiedAt: string;
  previewable: boolean;
}

export interface TeamLibrarySection {
  id: string;
  index: string;
  title: string;
  summary: string;
  fileCount: number;
  available: boolean;
}

export interface TeamLibraryGuide {
  id: string;
  title: string;
  summary: string;
  paths: string[];
  files: TeamLibraryFile[];
}

export interface TeamLibraryManifest {
  source: string;
  state: TeamLibraryState;
  limitation: string;
  refreshedAt: string;
  newestLocalModifiedAt: string;
  publication: {
    publishedAt: string | null;
    sourceRevision: string | null;
  };
  sections: TeamLibrarySection[];
  guides: TeamLibraryGuide[];
  files: TeamLibraryFile[];
  missingSections: string[];
  totalFiles: number;
  contentBytes: number;
}

export interface TeamLibraryPreview {
  path: string;
  extension: string;
  content: string;
  modifiedAt: string;
}
