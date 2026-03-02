import crypto from "node:crypto";

export function generateId(): string {
  return crypto.randomUUID();
}

export function truncateFingerprint(fingerprint: string): string {
  if (fingerprint.length <= 16) {
    return fingerprint;
  }

  return `${fingerprint.slice(0, 8)}...${fingerprint.slice(-8)}`;
}

export function unixNow(): number {
  return Date.now();
}
