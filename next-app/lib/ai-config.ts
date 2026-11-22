import { createDecipheriv } from "node:crypto";
import { database } from "./db";
import { ApiError } from "./security";

interface EncryptedSetting {
  iv: string;
  tag: string;
  encrypted: string;
  model: string;
}
export interface AiConfiguration { key?: string; model: string }
function encryptionKey(): Buffer {
  const value = process.env.AI_ENCRYPTION_KEY;
  if (!value || !/^[a-f0-9]{64}$/i.test(value)) {
    throw new ApiError(503, "The server needs an AI encryption key before reading provider credentials.");
  }
  return Buffer.from(value, "hex");
}
export async function aiConfiguration(): Promise<AiConfiguration> {
  const { rows: [row] } = await database().query<{ value: EncryptedSetting }>(
    "SELECT value FROM niyam_settings WHERE name='gemini'"
  );
  if (!row) {
    return { key: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite" };
  }
  const { iv, tag, encrypted, model } = row.value;
  const cipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
  cipher.setAuthTag(Buffer.from(tag, "base64"));
  const key = Buffer.concat([
    cipher.update(Buffer.from(encrypted, "base64")),
    cipher.final(),
  ]).toString("utf8");
  return { key, model };
}
