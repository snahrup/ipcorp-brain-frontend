import type { TeamLibraryFile, TeamLibraryGuide, TeamLibrarySection } from "./types";

export const TEAM_LIBRARY_COLLECTIONS = [
  {
    id: "00 - Adoption and Rollout Toolkit",
    index: "00",
    title: "Adoption and rollout toolkit",
    summary:
      "Playbooks, launch material, readiness workbooks, migration guidance, and the reviewed change ledger.",
  },
  {
    id: "01 - Engagement Overview",
    index: "01",
    title: "Engagement overview",
    summary:
      "Company and system context, data flows, glossary, platform overview, planning approach, and architecture decisions.",
  },
  {
    id: "02 - Architecture Reference",
    index: "02",
    title: "Architecture reference",
    summary:
      "Fabric, Purview, integration, medallion, security, and infrastructure guidance for design reviews.",
  },
  {
    id: "03 - Engagement Updates",
    index: "03",
    title: "Engagement updates",
    summary: "Reviewed meeting decisions, follow-up, and engagement history.",
  },
  {
    id: "04 - Power BI Strategy and Analysis",
    index: "04",
    title: "Power BI strategy and analysis",
    summary: "Cross-model overlap, DAX patterns, ETL architecture, and consolidation analysis.",
  },
  {
    id: "05 - Diagram Sources",
    index: "05",
    title: "Architecture diagrams",
    summary: "Visual views of medallion, product, plant-floor, and Salesforce-to-M3 flows.",
  },
] as const;

const TEAM_LIBRARY_GUIDES = [
  {
    id: "brief-team",
    title: "Brief the team",
    summary: "Start the Fabric and Purview launch conversation with the reviewed decisions.",
  },
  {
    id: "purview-launch",
    title: "Prepare the Purview launch",
    summary: "Review prerequisites, domains, data quality, lineage, access, and ownership.",
  },
  {
    id: "domain-review",
    title: "Run a domain and model review",
    summary: "Review systems, semantic models, DAX, relationships, overlap, and key decisions.",
  },
  {
    id: "operations",
    title: "Plan operations or migration",
    summary: "Review capacity, workspaces, monitoring, refresh, continuity, and release planning.",
  },
  {
    id: "rollout",
    title: "Understand the rollout",
    summary: "Review the operating model, roles, adoption measures, and checklists.",
  },
  {
    id: "change-ledger",
    title: "See what changed",
    summary:
      "Review additions, exclusions, privacy updates, major decisions, and known limitations.",
  },
] as const;

export type TeamLibraryPreviewKind =
  | "markdown"
  | "diagram"
  | "csv"
  | "text"
  | "pdf"
  | "image"
  | "unsupported";

export interface NativeViewerInfo {
  application: string;
  detail: string;
}

export interface LibraryItemPresentation {
  title: string;
  collectionTitle: string;
  contentType: string;
  updatedLabel: string;
}

const nativeViewerByExtension: Record<string, NativeViewerInfo> = {
  docx: {
    application: "Microsoft Word",
    detail:
      "A browser-safe preview is not available for this Word document. Download only when you are ready to open it in Word.",
  },
  pdf: {
    application: "a PDF viewer",
    detail: "This PDF can be read in the browser without downloading the original.",
  },
  pptx: {
    application: "Microsoft PowerPoint",
    detail:
      "A browser-safe preview is not available for this presentation. Download only when you are ready to open it in PowerPoint.",
  },
  xlsx: {
    application: "Microsoft Excel",
    detail:
      "A browser-safe preview is not available for this workbook. Download only when you are ready to open it in Excel.",
  },
};

const inlineImageExtensions = new Set(["gif", "jpeg", "jpg", "png", "svg", "webp"]);

export function normalizeLibrarySections(sections: TeamLibrarySection[]) {
  const received = new Map(sections.map((section) => [section.id, section]));
  return TEAM_LIBRARY_COLLECTIONS.map((collection) => {
    const section = received.get(collection.id);
    return {
      ...collection,
      fileCount: section?.fileCount || 0,
      available: section?.available === true,
    };
  });
}

export function normalizeLibraryGuides(guides: TeamLibraryGuide[]) {
  const received = new Map(guides.map((guide) => [guide.id, guide]));
  return TEAM_LIBRARY_GUIDES.map((guide) => ({
    ...guide,
    files: received.get(guide.id)?.files || [],
  }));
}

export function getPreviewKind(file: TeamLibraryFile): TeamLibraryPreviewKind {
  const extension = file.extension.toLowerCase();
  if (extension === "pdf") return "pdf";
  if (inlineImageExtensions.has(extension)) return "image";
  if (!file.previewable) return "unsupported";
  if (file.extension === "md") return "markdown";
  if (file.extension === "mmd") return "diagram";
  if (file.extension === "csv") return "csv";
  if (file.extension === "txt") return "text";
  return "unsupported";
}

export function getNativeViewerInfo(file: TeamLibraryFile): NativeViewerInfo {
  return (
    nativeViewerByExtension[file.extension.toLowerCase()] || {
      application: "the associated desktop app",
      detail:
        "A browser-safe preview is not available for this item. Nothing downloads unless you choose Download.",
    }
  );
}

export function getCollectionTitle(file: TeamLibraryFile) {
  return (
    TEAM_LIBRARY_COLLECTIONS.find((collection) => collection.id === file.sectionId)?.title ||
    "Team Library"
  );
}

export function getContentType(file: TeamLibraryFile) {
  const extension = file.extension.toLowerCase();
  if (extension === "xlsx") return "Workbook";
  if (extension === "pptx") return "Presentation";
  if (extension === "docx") return "Document";
  if (extension === "pdf") return "PDF";
  if (extension === "mmd") return "Diagram";
  if (extension === "md") return "Reference";
  if (extension === "csv") return "Data table";
  if (extension === "txt") return "Notes";
  if (inlineImageExtensions.has(extension)) return "Image";
  return file.group || "Reference";
}

export function getReadableItemTitle(file: TeamLibraryFile) {
  const baseName = file.name.split(/[\\/]/).pop() || file.name;
  const withoutExtension = file.extension
    ? baseName.replace(new RegExp(`\\.${file.extension}$`, "i"), "")
    : baseName;
  const dateMatch = withoutExtension.match(/^(\d{4})-(\d{2})-(\d{2})\s*[-_.]\s*(.+)$/);
  const dateLabel = dateMatch
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}T00:00:00Z`))
    : "";
  const withoutDate = dateMatch ? dateMatch[4] : withoutExtension;
  const withoutPrefix = withoutDate
    .replace(/^ADR-\d{4}\s*[-_.]\s*/i, "")
    .replace(/^\d{1,2}\s*[-_.]\s*/, "");
  const cleaned = withoutPrefix.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return "Untitled item";
  if (/[a-z]/.test(cleaned) && /[A-Z]/.test(cleaned)) return cleaned;
  const acronyms = new Set([
    "BI",
    "CDW",
    "DAX",
    "ETL",
    "IP",
    "KPI",
    "M3",
    "MDM",
    "MES",
    "NAC",
    "PCD",
    "SQL",
  ]);
  const readableTitle = cleaned.replace(
    /\b([a-z])([a-z]*)/gi,
    (_match, first: string, rest: string) => {
      const smallWord = `${first}${rest}`.toLowerCase();
      if (["and", "or", "the", "to", "for", "of", "in"].includes(smallWord)) return smallWord;
      const upperWord = smallWord.toUpperCase();
      if (acronyms.has(upperWord)) return upperWord;
      return `${first.toUpperCase()}${rest.toLowerCase()}`;
    }
  );
  return dateLabel ? `${readableTitle} (${dateLabel})` : readableTitle;
}

export function presentLibraryItem(file: TeamLibraryFile): LibraryItemPresentation {
  return {
    title: getReadableItemTitle(file),
    collectionTitle: getCollectionTitle(file),
    contentType: getContentType(file),
    updatedLabel: formatDate(file.modifiedAt),
  };
}

export function formatDate(value?: string | null) {
  if (!value) return "Not recorded";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

export function filterLibraryFiles(
  files: TeamLibraryFile[],
  collectionId: string,
  group: string,
  query: string
) {
  const needle = query.trim().toLowerCase();
  return files.filter((file) => {
    if (collectionId !== "all" && file.sectionId !== collectionId) return false;
    if (group !== "All" && file.group !== group) return false;
    if (!needle) return true;
    return `${getReadableItemTitle(file)} ${getContentType(file)} ${getCollectionTitle(file)}`
      .toLowerCase()
      .includes(needle);
  });
}
