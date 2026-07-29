import { AlertCircle, Download, FileWarning, RefreshCw, ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { TeamLibraryGatewayError, teamLibraryGateway } from "./api";
import { CsvPreview } from "./CsvPreview";
import { MarkdownContent } from "./MarkdownContent";
import { MermaidDiagram } from "./MermaidDiagram";
import {
  formatDate,
  getNativeViewerInfo,
  getPreviewKind,
  presentLibraryItem,
  type TeamLibraryPreviewKind,
} from "./presentation";
import type { TeamLibraryFile, TeamLibraryPreview } from "./types";

interface LibraryPreviewDrawerProps {
  file: TeamLibraryFile;
  onClose: () => void;
}

const endpointPreviewKinds = new Set<TeamLibraryPreviewKind>([
  "markdown",
  "diagram",
  "csv",
  "text",
]);

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function previewErrorCopy(error: unknown) {
  if (error instanceof TeamLibraryGatewayError) {
    if (error.code === "library_preview_unsupported") {
      return {
        title: "Preview not available in browser",
        detail: "This published format can only be opened after an explicit download.",
        retryable: false,
      };
    }
    if (error.code === "library_preview_too_large") {
      return {
        title: "Preview is too large for the browser",
        detail: "Download the original only if you need to review it in its desktop app.",
        retryable: false,
      };
    }
    return {
      title: "Preview unavailable",
      detail: "This item could not be opened. Try the preview again.",
      retryable: true,
    };
  }
  return {
    title: "Preview unavailable",
    detail: "This item could not be opened. Try the preview again.",
    retryable: true,
  };
}

function PlainTextContent({ content }: { content: string }) {
  const paragraphs = content
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  if (!paragraphs.length) {
    return <div className="tl-content-empty">This item does not contain readable text.</div>;
  }
  const occurrences = new Map<string, number>();
  const keyedParagraphs = paragraphs.map((paragraph) => {
    const occurrence = occurrences.get(paragraph) || 0;
    occurrences.set(paragraph, occurrence + 1);
    return {
      key: `${paragraph.slice(0, 48)}-${occurrence}`,
      paragraph,
    };
  });
  return (
    <article className="tl-plain-text" data-testid="formatted-text">
      {keyedParagraphs.map(({ key, paragraph }) => (
        <p key={key}>{paragraph}</p>
      ))}
    </article>
  );
}

function PreviewContent({
  file,
  kind,
  preview,
  loading,
  error,
  onRetry,
  onInlineLoad,
  onInlineError,
}: {
  file: TeamLibraryFile;
  kind: TeamLibraryPreviewKind;
  preview: TeamLibraryPreview | null;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  onInlineLoad: () => void;
  onInlineError: () => void;
}) {
  const displayTitle = presentLibraryItem(file).title;
  if (kind === "unsupported") {
    const viewer = getNativeViewerInfo(file);
    return (
      <div className="tl-preview-unavailable" data-testid="preview-unsupported">
        <span className="tl-preview-state-icon">
          <FileWarning size={24} aria-hidden="true" />
        </span>
        <div>
          <strong>Preview not available in browser</strong>
          <p>{viewer.detail}</p>
          <span>Download opens it in {viewer.application}.</span>
        </div>
      </div>
    );
  }

  if (error) {
    const copy = previewErrorCopy(error);
    return (
      <div className="tl-preview-error" role="alert">
        <span className="tl-preview-state-icon">
          <AlertCircle size={24} aria-hidden="true" />
        </span>
        <div>
          <strong>{copy.title}</strong>
          <p>{copy.detail}</p>
          {copy.retryable ? (
            <button type="button" className="wb-button wb-button-secondary" onClick={onRetry}>
              <RefreshCw size={16} aria-hidden="true" />
              Try preview again
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (kind === "pdf") {
    return (
      <div className="tl-inline-preview">
        {loading ? (
          <div className="tl-preview-loading" role="status">
            <RefreshCw className="is-spinning" size={20} aria-hidden="true" />
            Loading the PDF preview...
          </div>
        ) : null}
        <iframe
          className={loading ? "is-loading" : undefined}
          src={teamLibraryGateway.fileUrl(file.path)}
          title={`Preview of ${displayTitle}`}
          onLoad={onInlineLoad}
          onError={onInlineError}
        />
      </div>
    );
  }

  if (kind === "image") {
    return (
      <div className="tl-inline-preview tl-image-preview">
        {loading ? (
          <div className="tl-preview-loading" role="status">
            <RefreshCw className="is-spinning" size={20} aria-hidden="true" />
            Loading the image preview...
          </div>
        ) : null}
        <img
          className={loading ? "is-loading" : undefined}
          src={teamLibraryGateway.fileUrl(file.path)}
          alt={`Preview of ${displayTitle}`}
          onLoad={onInlineLoad}
          onError={onInlineError}
        />
      </div>
    );
  }

  if (loading || !preview) {
    return (
      <div className="tl-preview-loading" role="status">
        <RefreshCw className="is-spinning" size={20} aria-hidden="true" />
        Loading preview...
      </div>
    );
  }

  if (!preview.content.trim()) {
    return <div className="tl-content-empty">No readable content was found in this item.</div>;
  }
  if (kind === "diagram") {
    return <MermaidDiagram source={preview.content} />;
  }
  if (kind === "csv") return <CsvPreview content={preview.content} />;
  if (kind === "markdown")
    return <MarkdownContent content={preview.content} titleToOmit={displayTitle} />;
  return <PlainTextContent content={preview.content} />;
}

export function LibraryPreviewDrawer({ file, onClose }: LibraryPreviewDrawerProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previewRequestRef = useRef(0);
  const kind = useMemo(() => getPreviewKind(file), [file]);
  const item = useMemo(() => presentLibraryItem(file), [file]);
  const usesPreviewEndpoint = endpointPreviewKinds.has(kind);
  const [preview, setPreview] = useState<TeamLibraryPreview | null>(null);
  const [previewError, setPreviewError] = useState<unknown>(null);
  const [loading, setLoading] = useState(usesPreviewEndpoint || kind === "pdf" || kind === "image");
  const [downloadState, setDownloadState] = useState<"idle" | "loading" | "success" | "error">(
    "idle"
  );
  const [downloadMessage, setDownloadMessage] = useState("");

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), iframe, input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) || []
      ).filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) {
        event.preventDefault();
        panelRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1] || first;
      if (!panelRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [onClose]);

  const loadPreview = useCallback(() => {
    setPreview(null);
    setPreviewError(null);
    setDownloadState("idle");
    setDownloadMessage("");

    if (!usesPreviewEndpoint) {
      setLoading(kind === "pdf" || kind === "image");
      return null;
    }

    const requestId = previewRequestRef.current + 1;
    previewRequestRef.current = requestId;
    setLoading(true);
    teamLibraryGateway
      .preview(file.path)
      .then((result) => {
        if (previewRequestRef.current === requestId) setPreview(result);
      })
      .catch((error) => {
        if (previewRequestRef.current === requestId && !isAbortError(error)) {
          setPreviewError(error);
        }
      })
      .finally(() => {
        if (previewRequestRef.current === requestId) setLoading(false);
      });
    return requestId;
  }, [file.path, kind, usesPreviewEndpoint]);

  useEffect(() => {
    loadPreview();
    return () => {
      previewRequestRef.current += 1;
    };
  }, [loadPreview]);

  const downloadFile = async () => {
    setDownloadState("loading");
    setDownloadMessage("");
    try {
      await teamLibraryGateway.download(file);
      setDownloadState("success");
      setDownloadMessage("Download started.");
    } catch {
      setDownloadState("error");
      setDownloadMessage("The download could not start. Try again.");
    }
  };

  return (
    <div className="tl-preview-layer">
      <button
        type="button"
        className="tl-preview-backdrop"
        aria-label="Close Team Library preview"
        tabIndex={-1}
        onClick={onClose}
      />
      <section
        ref={panelRef}
        className="tl-preview-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        data-testid="team-library-preview-drawer"
      >
        <header className="tl-preview-header">
          <div>
            <span className="wb-kicker">{item.contentType}</span>
            <h2 id={titleId}>{item.title}</h2>
            <p id={descriptionId}>{item.collectionTitle}</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="wb-icon-button"
            onClick={onClose}
            aria-label="Close Team Library preview"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <dl className="tl-preview-metadata" aria-label="Item details">
          <div>
            <dt>Collection</dt>
            <dd>{item.collectionTitle}</dd>
          </div>
          <div>
            <dt>Updated</dt>
            <dd>{formatDate(preview?.modifiedAt || file.modifiedAt)}</dd>
          </div>
          <div>
            <dt>Type</dt>
            <dd>{item.contentType}</dd>
          </div>
        </dl>

        <div className="tl-preview-body" aria-busy={loading}>
          <PreviewContent
            file={file}
            kind={kind}
            preview={preview}
            loading={loading}
            error={previewError}
            onRetry={() => loadPreview()}
            onInlineLoad={() => setLoading(false)}
            onInlineError={() => {
              setLoading(false);
              setPreviewError(
                new TeamLibraryGatewayError(
                  "The preview could not be loaded.",
                  500,
                  "library_inline_preview_failed"
                )
              );
            }}
          />
        </div>

        <footer className="tl-preview-footer">
          <div
            className={`tl-download-status ${downloadState === "error" ? "is-error" : ""}`}
            role={downloadState === "error" ? "alert" : "status"}
            aria-live="polite"
          >
            {downloadState === "success" ? <ShieldCheck size={17} aria-hidden="true" /> : null}
            {downloadState === "error" ? <AlertCircle size={17} aria-hidden="true" /> : null}
            <span>
              {downloadMessage ||
                "Previewing does not download anything. Use Download only when you need the original."}
            </span>
          </div>
          <button
            type="button"
            className="wb-button wb-button-primary"
            onClick={() => void downloadFile()}
            disabled={downloadState === "loading"}
          >
            {downloadState === "loading" ? (
              <RefreshCw className="is-spinning" size={17} aria-hidden="true" />
            ) : (
              <Download size={17} aria-hidden="true" />
            )}
            {downloadState === "loading" ? "Downloading..." : "Download original"}
          </button>
        </footer>
      </section>
    </div>
  );
}
