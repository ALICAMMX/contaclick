import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "./client";

// Client-side middleware that attaches the user's Supabase access token
// as a Bearer Authorization header on server-fn requests, so that the
// server-side `requireSupabaseAuth` middleware can authenticate them.
export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
);
