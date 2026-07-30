/**
 * Where the local gateway lives, from the point of view of whoever is looking.
 *
 * On this machine the app calls the gateway directly on :8817. Reached over the public
 * tunnel the browser is on a phone, and 127.0.0.1 there means the phone, not this
 * machine, so every request would fail. In that case calls go to /api on the same
 * origin and the dev server proxies them across.
 */
const LOCAL = new Set(["127.0.0.1", "localhost", "::1"]);

export const GATEWAY = LOCAL.has(globalThis.location?.hostname ?? "127.0.0.1")
  ? "http://127.0.0.1:8817/api"
  : "/api";
