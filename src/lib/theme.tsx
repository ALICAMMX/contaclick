import { createContext, useContext, useEffect, useState, ReactNode } from "react";

type Theme = "light" | "dark";
const ThemeCtx = createContext<{ theme: Theme; toggle: () => void; setTheme: (t: Theme) => void }>({
  theme: "light",
  toggle: () => {},
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = (localStorage.getItem("cc-theme") as Theme | null);
    const initial: Theme = stored ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setThemeState(initial);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", theme === "dark");
    try { localStorage.setItem("cc-theme", theme); } catch {}
  }, [theme]);

  return (
    <ThemeCtx.Provider value={{
      theme,
      setTheme: setThemeState,
      toggle: () => setThemeState((t) => (t === "dark" ? "light" : "dark")),
    }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export const useTheme = () => useContext(ThemeCtx);
