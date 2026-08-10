import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// Tailwind first: utilities only, no Preflight. App.css follows so the
// Workbench's own styling wins any collision. See src/tailwind.css.
import "./tailwind.css";
import "./App.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
