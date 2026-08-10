// Ported from moumen-soliman/lab `file-upload-staging` (MIT), re-skinned to the
// IP Corporation Workbench palette.
//
// A staging pipeline expressed through motion:
//   · A reflowing grid that never jump-cuts. Tiles are motion.li with `layout`:
//     removing a tile mid-grid makes every later tile glide up and across, and
//     entering tiles scale + unblur in.
//   · An interruptible state machine per tile: queued → uploading → done, or
//     → error frozen at the failure percent. Retry resumes from that percent
//     (the arc never rewinds), removal works in any state and aborts an
//     in-flight transfer, and a freed slot promotes the next queued tile —
//     concurrency is capped so the pipeline is visible.
//
// Changed from upstream: the demo-only simulation mode, failRate and inspect
// overlays are gone — the `upload` adapter is required here, because this
// surface only exists to put real files on real Jira issues. Imports come from
// framer-motion (the app's motion library; same API).

import { MotionConfig, motion } from "framer-motion";
import { type Ref, useEffect, useImperativeHandle, useRef, useState } from "react";

const EASE = [0.22, 1, 0.36, 1] as const;
const EASE_ICON = [0.2, 0, 0, 1] as const;

export interface UploadStagingHandle {
  /** Stage files programmatically (the original File rides along for the adapter). */
  addFiles: (files: { name: string; size: number; kind?: FileKind; file?: File }[]) => void;
}

export type FileKind = "image" | "pdf" | "archive" | "doc" | "sheet" | "file";

/** Your network layer. Report 0-100 via onProgress; resolve on success, throw
 *  on failure; honour the signal so removing a tile cancels the transfer. */
export type UploadFn = (
  file: { name: string; size: number; kind: FileKind; file?: File },
  ctx: { onProgress: (percent: number) => void; signal: AbortSignal }
) => Promise<void>;

type Status = "queued" | "uploading" | "done" | "error";

interface StagedFile {
  id: string;
  name: string;
  size: number;
  kind: FileKind;
  file?: File;
  status: Status;
  progress: number;
}

function kindOf(name: string): FileKind {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (["zip", "tar", "gz", "rar", "7z"].includes(ext)) return "archive";
  if (["doc", "docx", "txt", "md", "pages", "pptx", "ppt"].includes(ext)) return "doc";
  if (["xlsx", "xls", "csv"].includes(ext)) return "sheet";
  return "file";
}

export function formatFileSize(bytes: number) {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

// Middle-truncate, keeping the start and the extension — a tail ellipsis would
// eat exactly the part that tells files apart.
function truncateName(name: string, max = 16) {
  if (name.length <= max) return name;
  const head = name.slice(0, Math.ceil((max - 1) * 0.55));
  const tail = name.slice(-(max - 1 - head.length));
  return `${head}…${tail}`;
}

const R = 13;
const CIRC = 2 * Math.PI * R;

export function UploadStaging({
  upload,
  concurrency = 2,
  accept,
  helper,
  ref,
}: {
  /** The real uploader — required; there is no simulation mode in this port. */
  upload: UploadFn;
  /** How many transfers run at once; the rest wait in the visible queue. */
  concurrency?: number;
  /** Passed through to the file input. */
  accept?: string;
  /** One line under the drop line, e.g. the size limit. */
  helper?: string;
  ref?: Ref<UploadStagingHandle>;
}) {
  const [files, setFiles] = useState<StagedFile[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const idRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // One AbortController per in-flight transfer, so removal cancels it.
  const activeRef = useRef(new Map<string, AbortController>());

  function addFiles(metas: { name: string; size: number; kind?: FileKind; file?: File }[]) {
    setFiles((list) => [
      ...list,
      ...metas.map((meta) => {
        idRef.current += 1;
        return {
          id: `f${idRef.current}`,
          name: meta.name,
          size: meta.size,
          kind: meta.kind ?? kindOf(meta.name),
          file: meta.file,
          status: "queued" as const,
          progress: 0,
        };
      }),
    ]);
  }

  // addFiles closes over setFiles and a ref only, both stable for the
  // component's lifetime, so the handle never needs rebuilding.
  // biome-ignore lint/correctness/useExhaustiveDependencies: addFiles is identity-stable in everything it reads
  useImperativeHandle(ref, () => ({ addFiles }), []);

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragOver(false);
    const dropped = [...(event.dataTransfer?.files ?? [])].map((file) => ({
      name: file.name,
      size: file.size,
      file,
    }));
    if (dropped.length) addFiles(dropped);
  }

  // The pipeline. Freed slots promote queued tiles, then every uploading tile
  // that isn't in flight yet gets its adapter call. Progress is forward-only:
  // the arc never rewinds, so a retried transfer catches up to its frozen
  // percent before it visibly moves again.
  useEffect(() => {
    const uploadingCount = files.filter((f) => f.status === "uploading").length;
    if (uploadingCount < concurrency && files.some((f) => f.status === "queued")) {
      setFiles((list) => {
        let free = concurrency - list.filter((f) => f.status === "uploading").length;
        return list.map((f) => {
          if (f.status !== "queued" || free <= 0) return f;
          free -= 1;
          return { ...f, status: "uploading" as const };
        });
      });
      return;
    }
    for (const f of files) {
      if (f.status !== "uploading" || activeRef.current.has(f.id)) continue;
      const controller = new AbortController();
      activeRef.current.set(f.id, controller);
      const patch = (id: string, up: (x: StagedFile) => StagedFile) =>
        setFiles((list) => list.map((x) => (x.id === id ? up(x) : x)));
      upload(
        { name: f.name, size: f.size, kind: f.kind, file: f.file },
        {
          onProgress: (percent) =>
            patch(f.id, (x) =>
              x.status === "uploading"
                ? { ...x, progress: Math.min(100, Math.max(x.progress, percent)) }
                : x
            ),
          signal: controller.signal,
        }
      )
        .then(() => {
          activeRef.current.delete(f.id);
          patch(f.id, (x) => ({ ...x, status: "done", progress: 100 }));
        })
        .catch(() => {
          activeRef.current.delete(f.id);
          if (controller.signal.aborted) return; // removed, not failed
          patch(f.id, (x) => ({ ...x, status: "error", progress: Math.round(x.progress) }));
        });
    }
  }, [upload, files, concurrency]);

  // Abort everything in flight on unmount.
  useEffect(
    () => () => {
      for (const controller of activeRef.current.values()) controller.abort();
      activeRef.current.clear();
    },
    []
  );

  function retry(id: string) {
    setFiles((list) =>
      list.map((file) => (file.id === id ? { ...file, status: "queued" as const } : file))
    );
  }

  const retryAllFailed = () => {
    for (const f of files.filter((item) => item.status === "error")) retry(f.id);
  };
  const remove = (id: string) => {
    activeRef.current.get(id)?.abort();
    activeRef.current.delete(id);
    setFiles((list) => list.filter((file) => file.id !== id));
  };
  const clearDone = () => setFiles((list) => list.filter((file) => file.status !== "done"));

  const counts = {
    queued: files.filter((f) => f.status === "queued").length,
    uploading: files.filter((f) => f.status === "uploading").length,
    done: files.filter((f) => f.status === "done").length,
    error: files.filter((f) => f.status === "error").length,
  };

  const ghostBtnClass =
    "tw-button h-7 cursor-pointer rounded-lg bg-ipc-bg-2 px-2.5 text-xs font-medium text-ipc-text-soft transition-[background-color,scale] duration-150 hover:bg-ipc-line active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ipc-action";

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative flex w-full flex-col gap-3">
        {/* Dropzone: real drops and the picker both stage the original File.
            The div only listens for drag events — the click path is the
            labelled browse button, so this is not an interactive element. */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: drop target only; keyboard users attach via the browse button */}
        <div
          className={[
            "flex flex-col items-center gap-1 rounded-[10px] border-[1.5px] border-dashed px-4 py-4 text-center transition-[border-color,background-color] duration-150",
            dragOver ? "border-ipc-action bg-ipc-bg-2" : "border-ipc-line-strong bg-ipc-panel-soft",
          ].join(" ")}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <span className="inline-flex text-ipc-muted" aria-hidden="true">
            <UploadIcon />
          </span>
          <p className="m-0 text-[12.5px] text-ipc-text-soft">
            Drop deliverables here or{" "}
            <button
              type="button"
              className="tw-button cursor-pointer text-[length:inherit] font-medium text-ipc-action underline decoration-ipc-soft underline-offset-[3px] transition-[text-decoration-color] duration-150 hover:decoration-ipc-action focus-visible:rounded-[2px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ipc-action"
              onClick={() => fileInputRef.current?.click()}
            >
              browse
            </button>
          </p>
          {helper && <p className="m-0 text-[11px] text-ipc-muted">{helper}</p>}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={accept}
            className="sr-only"
            aria-label="Choose files to attach"
            onChange={(event) => {
              const picked = [...(event.target.files ?? [])].map((file) => ({
                name: file.name,
                size: file.size,
                file,
              }));
              if (picked.length) addFiles(picked);
              event.target.value = "";
            }}
          />
        </div>

        {/* The staging grid. `layout` on every tile: on any list change the
            survivors glide to their new spots. */}
        {files.length > 0 && (
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(6.25rem,1fr))] gap-2 p-0">
            {files.map((file) => (
              <motion.li
                key={file.id}
                layout
                initial={{ opacity: 0, scale: 0.95, filter: "blur(2px)" }}
                animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                transition={{ layout: { duration: 0.3, ease: EASE }, duration: 0.24, ease: EASE }}
                className={[
                  "group/tile relative flex flex-col items-center gap-0.5 rounded-[10px] px-2 pb-2.5 pt-3 transition-[box-shadow,background-color] duration-[350ms]",
                  file.status === "done"
                    ? "bg-[#fbfdfc] shadow-[inset_0_0_0_1px_#e1e4e8,0_0_0_1.5px_rgba(30,123,77,0.35)]"
                    : file.status === "error"
                      ? "bg-ipc-panel shadow-[inset_0_0_0_1px_#e1e4e8,0_0_0_1.5px_rgba(200,16,46,0.35)]"
                      : "bg-ipc-panel shadow-[inset_0_0_0_1px_#e1e4e8,0_1px_2px_rgba(14,35,56,0.05)]",
                ].join(" ")}
                data-status={file.status}
              >
                <button
                  type="button"
                  className="tw-button absolute right-1 top-1 z-[1] inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-[5px] text-ipc-muted opacity-0 transition-[opacity,background-color,color,scale] duration-150 after:absolute after:-inset-1.5 after:content-[''] hover:bg-ipc-bg-2 hover:text-ipc-text focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ipc-action active:scale-[0.96] group-hover/tile:opacity-100 [@media(hover:none)]:opacity-100"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => remove(file.id)}
                >
                  <XIcon />
                </button>

                {/* The visual: type icon inside the progress ring; the check or
                    the retry button takes over the same footprint. */}
                <span className="relative inline-flex h-[34px] w-[34px] items-center justify-center">
                  <svg
                    className="absolute inset-0 -rotate-90"
                    width="34"
                    height="34"
                    viewBox="0 0 34 34"
                    aria-hidden="true"
                  >
                    <circle
                      className="fill-none stroke-ipc-bg-2 stroke-[2.5]"
                      cx="17"
                      cy="17"
                      r={R}
                    />
                    <circle
                      className={[
                        // linear on purpose: real network progress IS the texture
                        "fill-none stroke-[2.5] [stroke-linecap:round] [transition:stroke-dashoffset_140ms_linear,stroke_200ms_ease,opacity_250ms_ease]",
                        file.status === "queued"
                          ? "stroke-ipc-soft"
                          : file.status === "error"
                            ? "stroke-ipc-red"
                            : file.status === "done"
                              ? "stroke-ipc-action opacity-0"
                              : "stroke-ipc-action",
                      ].join(" ")}
                      cx="17"
                      cy="17"
                      r={R}
                      strokeDasharray={CIRC}
                      strokeDashoffset={CIRC * (1 - file.progress / 100)}
                    />
                  </svg>
                  {/* Contextual swap: the kind icon ducks out when the check or
                      retry takes the footprint. */}
                  <motion.span
                    className="inline-flex text-ipc-text-soft"
                    initial={false}
                    animate={
                      file.status === "done" || file.status === "error"
                        ? { opacity: 0, scale: 0.25, filter: "blur(4px)" }
                        : { opacity: 1, scale: 1, filter: "blur(0px)" }
                    }
                    transition={{ duration: 0.2, ease: EASE_ICON }}
                  >
                    <KindIcon kind={file.kind} />
                  </motion.span>
                  {file.status === "done" && (
                    <svg
                      className="absolute inset-0"
                      width="34"
                      height="34"
                      viewBox="0 0 34 34"
                      aria-hidden="true"
                    >
                      {/* The settle: the check draws itself in. */}
                      <motion.path
                        className="fill-none stroke-ipc-green stroke-[2.5] [stroke-linecap:round] [stroke-linejoin:round]"
                        d="M11 17.5l4 4 8-9"
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 0.35, ease: EASE, delay: 0.12 }}
                      />
                    </svg>
                  )}
                  {file.status === "error" && (
                    <motion.button
                      type="button"
                      className="tw-button absolute inset-0 inline-flex cursor-pointer items-center justify-center rounded-full text-ipc-red transition-[background-color,scale] duration-150 after:absolute after:-inset-1 after:content-[''] hover:bg-ipc-red/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ipc-red active:scale-[0.96]"
                      aria-label={`Retry ${file.name}, failed at ${file.progress}%`}
                      onClick={() => retry(file.id)}
                      initial={{ opacity: 0, scale: 0.25, filter: "blur(4px)" }}
                      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                      transition={{ duration: 0.2, ease: EASE_ICON }}
                    >
                      <RetryIcon />
                    </motion.button>
                  )}
                </span>

                <span
                  className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-medium text-ipc-text"
                  title={file.name}
                >
                  {truncateName(file.name)}
                </span>
                <span
                  className={`min-h-[15px] text-[10px] tabular-nums ${
                    file.status === "error" ? "text-ipc-red" : "text-ipc-muted"
                  }`}
                >
                  {file.status === "uploading" && `${Math.floor(file.progress)}%`}
                  {file.status === "queued" && "queued"}
                  {file.status === "done" && formatFileSize(file.size)}
                  {file.status === "error" && `failed at ${file.progress}%`}
                </span>
              </motion.li>
            ))}
          </ul>
        )}

        {/* Pipeline footer. */}
        {files.length > 0 && (
          <div className="flex min-h-7 items-center justify-between gap-2">
            <span className="text-xs tabular-nums text-ipc-muted">
              {counts.done}/{files.length} attached
              {counts.error > 0 && (
                <span className="font-medium text-ipc-red"> · {counts.error} failed</span>
              )}
            </span>
            <span className="inline-flex gap-1.5">
              {counts.error > 0 && (
                <motion.button
                  type="button"
                  className={ghostBtnClass}
                  onClick={retryAllFailed}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2, ease: EASE_ICON }}
                >
                  Retry failed
                </motion.button>
              )}
              {counts.done > 0 && (
                <motion.button
                  type="button"
                  className={ghostBtnClass}
                  onClick={clearDone}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2, ease: EASE_ICON }}
                >
                  Clear done
                </motion.button>
              )}
            </span>
          </div>
        )}

        <span className="sr-only" aria-live="polite">
          {counts.error > 0
            ? `${counts.error} ${counts.error === 1 ? "upload" : "uploads"} failed.`
            : counts.uploading > 0
              ? `Uploading ${counts.uploading} of ${files.length}.`
              : files.length > 0 && counts.done === files.length
                ? "All uploads finished."
                : ""}
        </span>
      </div>
    </MotionConfig>
  );
}

function Svg({
  children,
  size = 15,
  sw = 1.8,
}: {
  children: React.ReactNode;
  size?: number;
  sw?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function KindIcon({ kind }: { kind: FileKind }) {
  if (kind === "image")
    return (
      <Svg size={14}>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21" />
      </Svg>
    );
  if (kind === "archive")
    return (
      <Svg size={14}>
        <rect x="2" y="3" width="20" height="5" rx="1" />
        <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4" />
      </Svg>
    );
  if (kind === "doc")
    return (
      <Svg size={14}>
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5Z" />
        <path d="M14 2v4a2 2 0 0 0 2 2h4M8 13h8M8 17h5" />
      </Svg>
    );
  if (kind === "sheet")
    return (
      <Svg size={14}>
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5Z" />
        <path d="M14 2v4a2 2 0 0 0 2 2h4M8 12h8M8 16h8M12 12v8" />
      </Svg>
    );
  // pdf and the generic file share the plain document glyph.
  return (
    <Svg size={14}>
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    </Svg>
  );
}

function UploadIcon() {
  return (
    <Svg size={18}>
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <path d="m16 6-4-4-4 4M12 2v13" />
    </Svg>
  );
}

function XIcon() {
  return (
    <Svg size={11} sw={2.2}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Svg>
  );
}

function RetryIcon() {
  return (
    <Svg size={13} sw={2}>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </Svg>
  );
}
