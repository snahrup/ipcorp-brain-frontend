import { GATEWAY } from "../../lib/gateway";
import type { TeamLibraryFile, TeamLibraryManifest, TeamLibraryPreview } from "./types";

const LIBRARY_API = `${GATEWAY}/team-library`;

export class TeamLibraryGatewayError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "TeamLibraryGatewayError";
    this.status = status;
    this.code = code;
  }
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${LIBRARY_API}${path}`, { signal });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new TeamLibraryGatewayError(
      "The local Workbench data gateway is not running. Start the Team Library connection and try again.",
      503,
      "gateway_offline"
    );
  }

  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    data?: T;
    error?: string;
    code?: string;
  };
  if (!response.ok || payload.ok === false || payload.data === undefined) {
    throw new TeamLibraryGatewayError(
      payload.error || `Team Library request failed with HTTP ${response.status}.`,
      response.status,
      payload.code
    );
  }
  return payload.data;
}

const previewRequests = new Map<string, Promise<TeamLibraryPreview>>();

function preview(path: string) {
  const existing = previewRequests.get(path);
  if (existing) return existing;

  let sharedRequest: Promise<TeamLibraryPreview>;
  sharedRequest = request<TeamLibraryPreview>(`/preview?path=${encodeURIComponent(path)}`).finally(
    () => {
      if (previewRequests.get(path) === sharedRequest) previewRequests.delete(path);
    }
  );
  previewRequests.set(path, sharedRequest);
  return sharedRequest;
}

async function download(file: TeamLibraryFile) {
  let response: Response;
  try {
    response = await fetch(teamLibraryGateway.fileUrl(file.path));
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new TeamLibraryGatewayError(
      "The local Workbench data gateway is unavailable, so this file could not be downloaded.",
      503,
      "gateway_offline"
    );
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
    };
    throw new TeamLibraryGatewayError(
      payload.error || `Team Library download failed with HTTP ${response.status}.`,
      response.status,
      payload.code
    );
  }

  const objectUrl = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = file.name;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

export const teamLibraryGateway = {
  manifest: () => request<TeamLibraryManifest>("/manifest"),
  preview,
  fileUrl: (path: string) => `${LIBRARY_API}/file?path=${encodeURIComponent(path)}`,
  download,
};
