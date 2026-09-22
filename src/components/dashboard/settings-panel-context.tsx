"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type SettingsPanelContextValue = {
  open: boolean;
  openSettings: () => void;
  closeSettings: () => void;
};

const SettingsPanelContext = createContext<SettingsPanelContextValue | null>(null);

export function SettingsPanelProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openSettings = useCallback(() => setOpen(true), []);
  const closeSettings = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ open, openSettings, closeSettings }), [open, openSettings, closeSettings]);
  return <SettingsPanelContext.Provider value={value}>{children}</SettingsPanelContext.Provider>;
}

export function useSettingsPanel() {
  const value = useContext(SettingsPanelContext);
  if (!value) throw new Error("useSettingsPanel must be used within SettingsPanelProvider");
  return value;
}
