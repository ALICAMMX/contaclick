import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";

const authenticatedServerFnFetch: typeof fetch = async (input, init) => {
  if (typeof window === "undefined") {
    return fetch(input, init);
  }

  const headers = new Headers(init?.headers);
  if (!headers.has("authorization")) {
    const { supabase } = await import("./integrations/supabase/client");
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers.set("authorization", `Bearer ${token}`);
  }

  return fetch(input, { ...init, headers });
};

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware],
  serverFns: {
    fetch: authenticatedServerFnFetch,
  },
}));
