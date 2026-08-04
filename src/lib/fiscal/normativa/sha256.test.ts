import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { sha256Hex } from "./sha256";
describe("sha256", () => {
  it("vectores conocidos", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("coincide con node:crypto en cadenas largas y con acentos", () => {
    for (const s of ["ñáéí", "x".repeat(1000), JSON.stringify({ a: 1 }), "límite 844.59 → 10,135.11"]) {
      expect(sha256Hex(s)).toBe(createHash("sha256").update(s, "utf8").digest("hex"));
    }
  });
});
