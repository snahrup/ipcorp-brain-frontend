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
const briefingRoute = window.location.pathname === "/briefing" && foremanBriefingEnabled();

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("The #root element is missing from index.html");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>{briefingRoute ? <ForemanBriefing /> : <App />}</React.StrictMode>
);
