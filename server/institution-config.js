import { z } from "zod";

export const defaultInstitution = {
  name: "Dayananda Sagar College of Engineering",
  shortName: "DSCE",
};
export const institutionSchema = z.object({
  name: z.string().trim().min(2).max(150),
  shortName: z.string().trim().min(2).max(32),
});

export async function institutionConfiguration(db) {
  const { rows: [row] } = await db.query(
    "SELECT value FROM niyam_settings WHERE name='institution'",
  );
  return row ? institutionSchema.parse(row.value) : defaultInstitution;
}
