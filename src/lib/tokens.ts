import { createHash, randomBytes } from "node:crypto";

/** 256-bit random token, URL-safe. Only ever sent in the invitation email/link. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * sha256 hex of a token. Must match the database:
 * encode(extensions.digest(token, 'sha256'), 'hex').
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
