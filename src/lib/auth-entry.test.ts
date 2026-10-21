import { describe, it, expect, beforeEach } from "vitest";
import { safeNext, rememberReturnPath, takeReturnPath } from "./auth-entry";

// The sign-in round trip hands the browser back to a public landing page and
// then sends the user wherever they originally asked for. That stored value
// must never be able to point outside this site.

describe("safeNext", () => {
  it("keeps a same-origin path", () => {
    expect(safeNext("/app/clientes", "/app")).toBe("/app/clientes");
  });

  it("falls back when nothing was stored", () => {
    expect(safeNext(undefined, "/app")).toBe("/app");
    expect(safeNext("", "/app")).toBe("/app");
  });

  it("rejects an absolute external URL", () => {
    expect(safeNext("https://ejemplo-falso.mx/app", "/app")).toBe("/app");
  });

  it("rejects a protocol-relative URL", () => {
    expect(safeNext("//ejemplo-falso.mx/app", "/app")).toBe("/app");
  });
});

describe("rememberReturnPath / takeReturnPath", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    (globalThis as Record<string, unknown>).window = {
      sessionStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    };
  });

  it("remembers a same-origin destination and clears it after one read", () => {
    rememberReturnPath("/app/sat-sync");
    expect(takeReturnPath()).toBe("/app/sat-sync");
    expect(takeReturnPath()).toBeUndefined();
  });

  it("refuses to store an external destination", () => {
    rememberReturnPath("https://ejemplo-falso.mx/app");
    expect(store.size).toBe(0);
    expect(takeReturnPath()).toBeUndefined();
  });

  it("refuses to store a protocol-relative destination", () => {
    rememberReturnPath("//ejemplo-falso.mx/app");
    expect(store.size).toBe(0);
    expect(takeReturnPath()).toBeUndefined();
  });

  it("clears a previously stored destination when none is requested", () => {
    rememberReturnPath("/app/sat-sync");
    rememberReturnPath(undefined);
    expect(takeReturnPath()).toBeUndefined();
  });
});
