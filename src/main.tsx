import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ForemanBriefing, foremanBriefingEnabled } from "./features/foreman/ForemanBriefing";
// Tailwind first: utilities only, no Preflight. App.css follows so the
// Workbench's own styling wins any collision. See src/tailwind.css.
import "./tailwind.css";
import "./App.css";

// Track FB-1: /briefing renders the Foreman Briefing instead of the shell,
// only while the toggle is on. With the toggle off nothing anywhere changes.
// The prefix also catches /briefing/meeting/<id> from countdown toasts; the
// per-meeting chapters land in FB-3b, and until then a toast click opens the
// briefing itself rather than a dead route.
const briefingRoute = window.location.pathname.startsWith("/briefing") && foremanBriefingEnabled();

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("The #root element is missing from index.html");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>{briefingRoute ? <ForemanBriefing /> : <App />}</React.StrictMode>
);
