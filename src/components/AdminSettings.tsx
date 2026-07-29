import { useEffect, useRef, useState } from "react";
import {
  type AdminSettings as AdminSettingsType,
  getAdminSettings,
  isAdminMode,
  lockAdminMode,
  saveAdminSettings,
  unlockAdminMode,
  verifyAdminPassword,
} from "../lib/adminSettings";

interface AdminSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

const graphPresets: Array<{
  key: AdminSettingsType["graphPreset"];
  label: string;
}> = [
  { key: "balanced", label: "Balanced (recommended for most use)" },
  {
    key: "high-detail",
    label: "High Detail — maximum nodes, particles, and connections (for deep exploration)",
  },
  {
    key: "performance",
    label: "Performance — aggressive simplification for very large or slow machines",
  },
];

export function AdminSettings({ isOpen, onClose }: AdminSettingsProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(isAdminMode());
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const [settings, setSettings] = useState<AdminSettingsType>(getAdminSettings());

  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    panel
      ?.querySelector<HTMLElement>("input, button, select, textarea, a[href], [tabindex='0']")
      ?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panel) return;

      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex='0']"
        )
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (verifyAdminPassword(password)) {
      unlockAdminMode();
      setIsUnlocked(true);
      setPassword("");
      setError("");
    } else {
      setError("Incorrect password");
    }
  };

  const handleSave = () => {
    saveAdminSettings(settings);
    // Try live update for graph-related prefs first (no full reload if possible)
    window.dispatchEvent(new CustomEvent("admin-settings-updated", { detail: settings }));
    // Still reload for nav/structural changes (safe default)
    setTimeout(() => window.location.reload(), 180);
  };

  const handleLock = () => {
    lockAdminMode();
    setIsUnlocked(false);
    onClose();
  };

  return (
    <div className="admin-overlay">
      <button
        type="button"
        className="admin-overlay-dismiss"
        onClick={onClose}
        aria-label="Close settings"
      />
      <div
        ref={panelRef}
        className="admin-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-settings-title"
        tabIndex={-1}
      >
        <div className="admin-header">
          <h2 id="admin-settings-title">Admin Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="admin-close"
            aria-label="Close settings"
          >
            ×
          </button>
        </div>

        {!isUnlocked ? (
          <div className="admin-auth">
            <p>Enter admin password to access settings.</p>
            <form onSubmit={handlePasswordSubmit}>
              <label htmlFor="admin-password">Admin password</label>
              <input
                id="admin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Admin password"
              />
              <button type="submit">Unlock</button>
            </form>
            {error && <div className="admin-error">{error}</div>}
          </div>
        ) : (
          <div className="admin-content">
            <section>
              <h3>Navigation Visibility</h3>
              <p className="admin-hint">Hide sections or individual items from the sidebar.</p>

              <div className="admin-nav-controls">
                {["Orient", "Prepare", "Resolve", "Trust"].map((section) => (
                  <label key={section} className="admin-checkbox">
                    <input
                      type="checkbox"
                      checked={!settings.hiddenNavSections.includes(section)}
                      onChange={(e) => {
                        const hidden = e.target.checked
                          ? settings.hiddenNavSections.filter((s) => s !== section)
                          : [...settings.hiddenNavSections, section];
                        setSettings({ ...settings, hiddenNavSections: hidden });
                      }}
                    />
                    Show “{section}” section
                  </label>
                ))}
              </div>
            </section>

            <section>
              <h3>Graph Experience (Central Feature)</h3>
              <p className="admin-hint">
                These directly control the 3D knowledge graphs — the soul of the app. Changes apply
                on next load or via Reset View.
              </p>
              <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                {graphPresets.map((p) => (
                  <label key={p.key} className="admin-radio">
                    <input
                      type="radio"
                      name="graphPreset"
                      checked={settings.graphPreset === p.key}
                      onChange={() => setSettings({ ...settings, graphPreset: p.key })}
                    />
                    {p.label}
                  </label>
                ))}
              </div>
              <div style={{ marginTop: 12 }}>
                <label className="admin-checkbox">
                  <input
                    type="checkbox"
                    checked={settings.showExperimental}
                    onChange={(e) =>
                      setSettings({ ...settings, showExperimental: e.target.checked })
                    }
                  />
                  Show experimental lenses & features (Decision Lineage Deep, extra reference
                  emphasis, etc.)
                </label>
              </div>
            </section>

            <section>
              <h3>Theme & Density</h3>
              <div className="admin-theme">
                <label>
                  Accent Color
                  <input
                    type="color"
                    value={settings.theme.accent}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        theme: { ...settings.theme, accent: e.target.value },
                      })
                    }
                  />
                </label>
              </div>
              <p className="admin-hint">More theme options coming (density, fonts, etc.)</p>
            </section>

            <section>
              <h3>Steve Graph Controls (Experimental)</h3>
              <p className="admin-hint">
                These unlock when "Show experimental" is checked above. They give you maximum power
                over the central 3D knowledge graphs.
              </p>
              <ul style={{ fontSize: 12, opacity: 0.85, marginTop: 6, paddingLeft: 18 }}>
                <li>
                  Decision Lineage (Deep) lens — full parsed ADR relationships + supersedes from the
                  actual brain
                </li>
                <li>Stronger emphasis modes on node click and meeting focus</li>
                <li>
                  Future: reference layer prominence, custom force presets, graph export with
                  provenance
                </li>
              </ul>
            </section>

            <div className="admin-actions">
              <button
                type="button"
                onClick={() => {
                  // Steve Mode preset — maximum power and detail for the central 3D graphs
                  const steveMode = {
                    ...settings,
                    graphPreset: "high-detail" as const,
                    showExperimental: true,
                    theme: { ...settings.theme, accent: "#1B5E9E" },
                  };
                  setSettings(steveMode);
                  // Auto-save and reload so the graphs immediately reflect the premium Steve experience
                  saveAdminSettings(steveMode);
                  setTimeout(() => window.location.reload(), 120);
                }}
                style={{
                  background: "var(--accent)",
                  color: "var(--accent-text)",
                  fontWeight: 600,
                }}
              >
                Activate Steve Mode (Max Graph Detail + Experimental)
              </button>

              <button type="button" onClick={handleSave} className="primary-action">
                Save & Reload
              </button>
              <button type="button" onClick={handleLock} className="ghost-action">
                Lock Admin Mode
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
