// Simple admin settings system for Steve (the owner).
// Persisted in localStorage for now. Password-gated access.

export type AdminSettings = {
  hiddenNavSections: string[]; // e.g. ["Resolve", "Trust"]
  hiddenNavItems: string[]; // e.g. ["questions", "risks"]
  theme: {
    accent: string; // hex or css var name
    density: "comfortable" | "compact";
  };
  showExperimental: boolean;
  graphPreset: "balanced" | "high-detail" | "performance";
};

const STORAGE_KEY = "ipcorp-brain-admin-settings-v1";

const defaultSettings: AdminSettings = {
  hiddenNavSections: [],
  hiddenNavItems: [],
  theme: {
    accent: "#f7b955", // default amber
    density: "comfortable",
  },
  showExperimental: false,
  // Default to Performance for the real full-brain dataset (103 nodes / 1360+ provenance-backed links).
  // Users can still switch to Balanced or High Detail in Admin if they want richer visuals.
  graphPreset: "performance",
};

export function getAdminSettings(): AdminSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { ...defaultSettings, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.warn("Failed to load admin settings", e);
  }
  return { ...defaultSettings };
}

export function saveAdminSettings(settings: Partial<AdminSettings>) {
  const current = getAdminSettings();
  const next = { ...current, ...settings };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function resetAdminSettings() {
  localStorage.removeItem(STORAGE_KEY);
}

// Very simple password gate for now.
// In the future this will be replaced by proper Entra ID auth.
const ADMIN_PASSWORD = "ipcorp-brain-admin"; // Change this as needed

export function verifyAdminPassword(password: string): boolean {
  return password === ADMIN_PASSWORD;
}

export function isAdminMode(): boolean {
  // Could also check for a flag set after successful password entry
  return localStorage.getItem("ipcorp-brain-admin-unlocked") === "true";
}

export function unlockAdminMode() {
  localStorage.setItem("ipcorp-brain-admin-unlocked", "true");
}

export function lockAdminMode() {
  localStorage.removeItem("ipcorp-brain-admin-unlocked");
}
