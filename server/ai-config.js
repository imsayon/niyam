import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { HttpError } from "./store.js";

export async function aiConfiguration(db) {
  const {
    rows: [row],
  } = await db.query("SELECT value FROM niyam_settings WHERE name='gemini'");
  if (!row)
    return {
      key: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    };
  const key = encryptionKey();
  const { iv, tag, encrypted, model } = row.value;
  const cipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(iv, "base64"),
  );
  cipher.setAuthTag(Buffer.from(tag, "base64"));
  return {
    key: Buffer.concat([
      cipher.update(Buffer.from(encrypted, "base64")),
      cipher.final(),
    ]).toString("utf8"),
    model,
  };
}
function encryptionKey() {
  const value = process.env.AI_ENCRYPTION_KEY;
  if (!value || !/^[a-f0-9]{64}$/i.test(value))
    throw new HttpError(
      503,
      "The server needs an AI encryption key before saving provider credentials.",
    );
  return Buffer.from(value, "hex");
}
export async function saveConfiguration(db, key, model) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(key, "utf8"), cipher.final()]);
  await db.query(
    "INSERT INTO niyam_settings(name,value) VALUES ('gemini',$1) ON CONFLICT(name) DO UPDATE SET value=$1",
    [
      {
        iv: iv.toString("base64"),
        tag: cipher.getAuthTag().toString("base64"),
        encrypted: encrypted.toString("base64"),
        model,
      },
    ],
  );
}
