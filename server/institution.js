import { z } from "zod";
import { requireRole } from "./accounts.js";
import { audit } from "./store.js";

export const defaultInstitution = {
  name: "Dayananda Sagar College of Engineering",
  shortName: "DSCE",
};
const institutionSchema = z.object({
  name: z.string().trim().min(2).max(150),
  shortName: z.string().trim().min(2).max(32),
});

export async function institutionConfiguration(db) {
  const { rows: [row] } = await db.query(
    "SELECT value FROM niyam_settings WHERE name='institution'",
  );
  return row ? institutionSchema.parse(row.value) : defaultInstitution;
}

export function institutionApi(app, db) {
  app.get("/api/institution", async (req, res) => {
    requireRole(req);
    res.json(await institutionConfiguration(db));
  });
  app.put("/api/institution", async (req, res) => {
    const account = requireRole(req, "admin");
    const value = institutionSchema.parse(req.body);
    await db.query(
      `INSERT INTO niyam_settings(name,value) VALUES ('institution',$1)
       ON CONFLICT(name) DO UPDATE SET value=excluded.value`,
      [value],
    );
    await audit(db, account.id, "institution.updated", value.shortName);
    res.json(value);
  });
}
