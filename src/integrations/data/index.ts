/**
 * Polymorphic data layer entry point.
 *
 * - In the web build (default) this re-exports the Supabase client.
 * - In the desktop build (Electron, VITE_TARGET=desktop) this will switch to
 *   the local SQLite adapter wrapped in a Supabase-shaped facade (Phase 2).
 *
 * Phase 1 keeps web behavior unchanged; consumers can already import from
 * `@/integrations/data` instead of `@/integrations/supabase/client` to make
 * the migration painless later.
 */
import { supabase } from "@/integrations/supabase/client";
import { isDesktop } from "@/integrations/local/client";

export const dataTarget: "web" | "desktop" =
  isDesktop() || import.meta.env.VITE_TARGET === "desktop" ? "desktop" : "web";

export const dataClient = supabase; // Phase 2: swap for local facade when dataTarget === "desktop"
