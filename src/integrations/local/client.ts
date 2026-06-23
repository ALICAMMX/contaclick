/**
 * Local SQLite client adapter for ContaClick Desktop (Electron).
 *
 * Exposes a tiny query API compatible with the patterns used across the app.
 * In Phase 2 we'll wrap this in a Supabase-shaped facade so existing routes
 * can switch with a single import change.
 */

type Json = unknown;

declare global {
  interface Window {
    contaclick?: {
      isDesktop: true;
      db: {
        run: (sql: string, params?: Record<string, Json>) => Promise<{ changes: number; lastInsertRowid: number }>;
        all: <T = Record<string, Json>>(sql: string, params?: Record<string, Json>) => Promise<T[]>;
        get: <T = Record<string, Json>>(sql: string, params?: Record<string, Json>) => Promise<T | undefined>;
      };
      app: {
        info: () => Promise<{ version: string; userDataDir: string; dbPath: string }>;
        backup: () => Promise<{ ok: boolean; path?: string }>;
      };
    };
  }
}

export const isDesktop = (): boolean =>
  typeof window !== "undefined" && Boolean(window.contaclick?.isDesktop);

export const localDb = {
  run(sql: string, params?: Record<string, Json>) {
    if (!isDesktop()) throw new Error("localDb only available in desktop build");
    return window.contaclick!.db.run(sql, params);
  },
  all<T = Record<string, Json>>(sql: string, params?: Record<string, Json>) {
    if (!isDesktop()) throw new Error("localDb only available in desktop build");
    return window.contaclick!.db.all<T>(sql, params);
  },
  get<T = Record<string, Json>>(sql: string, params?: Record<string, Json>) {
    if (!isDesktop()) throw new Error("localDb only available in desktop build");
    return window.contaclick!.db.get<T>(sql, params);
  },
};

export const localApp = {
  info: () => window.contaclick!.app.info(),
  backup: () => window.contaclick!.app.backup(),
};
