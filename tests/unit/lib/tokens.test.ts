import { describe, expect, it } from "vitest";
import { generateToken, hashToken } from "@/lib/tokens";

describe("tokens", () => {
  it("generates URL-safe 256-bit tokens that differ every time", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it("hashes with sha256 hex, matching Postgres encode(digest(token, 'sha256'), 'hex')", () => {
    // select encode(extensions.digest('tok-valid', 'sha256'), 'hex');
    // value produced by the local database
    expect(hashToken("tok-valid")).toBe("8a972ef09d46611c0d6f74edb193879957b4e42c156241e090b1eb206eca92e3");
    // NIST test vector
    expect(hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
