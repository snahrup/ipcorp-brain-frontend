/**
 * Where the local gateway lives, from the point of view of whoever is looking.
 *
 * On this machine the app calls the gateway directly on :8817. Reached over the public
 * tunnel the browser is on a phone, and 127.0.0.1 there means the phone, not this
 * machine, so every request would fail. In that case calls go to /api on the same
 * origin and the dev server proxies them across.
 */
const LOCAL = new Set(["127.0.0.1", "localhost", "::1"]);

// A build may pin the gateway explicitly (vite.foreman.config.ts sets "/api"
// so a side-by-side preview reaches its own gateway through that dev server's
// proxy instead of the everyday one on 8817). Unset, nothing changes.
const PINNED = import.meta.env?.VITE_GATEWAY_URL as string | undefined;

export const GATEWAY =
  PINNED ||
  (LOCAL.has(globalThis.location?.hostname ?? "127.0.0.1") ? "http://127.0.0.1:8817/api" : "/api");
