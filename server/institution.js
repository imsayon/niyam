import { institutionConfiguration, institutionSchema } from "./institution-config.js";
import { requireRole } from "./accounts.js";
import { audit } from "./store.js";

export { defaultInstitution, institutionConfiguration } from "./institution-config.js";

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
