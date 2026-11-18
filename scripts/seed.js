import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { database, setup, transaction } from "../server/store.js";
import { hashPassword } from "../server/accounts.js";
import { fixture } from "../server/fixture.js";

export async function seedDemo(db, passwords) {
  await transaction(db, async (client) => {
    const {
      rows: [row],
    } = await client.query(
      "SELECT data FROM niyam_workspace WHERE id FOR UPDATE",
    );
    if (row.data.events.length === 0) {
      await client.query(
        "UPDATE niyam_workspace SET data=$1, revision=revision+1 WHERE id",
        [fixture()],
      );
    }
    for (const role of ["admin", "faculty", "student"]) {
      if (!passwords[role] || passwords[role].length < 14)
        throw new Error("Demo passwords must have at least 14 characters");
      await client.query(
        `INSERT INTO niyam_accounts(id,email,name,role,status,roster_id,password_hash,verified_at)
        VALUES ($1,$2,$3,$4,'active',$5,$6,now()) ON CONFLICT(email) DO NOTHING`,
        [
          randomUUID(),
          role + "@niyam.example",
          "Demo " + role,
          role,
          role === "admin" ? null : role + "-1",
          await hashPassword(passwords[role]),
        ],
      );
    }
  });
}
if (process.argv[1]?.endsWith("/scripts/seed.js")) {
  const file = "local/demo-accounts.json";
  await mkdir("local", { recursive: true, mode: 0o700 });
  let passwords;
  try {
    passwords = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    passwords = Object.fromEntries(
      ["admin", "faculty", "student"].map((role) => [
        role,
        randomBytes(18).toString("base64url"),
      ]),
    );
    await writeFile(file, JSON.stringify(passwords, null, 2), {
      mode: 0o600,
      flag: "wx",
    });
  }
  const envFile = await readFile(".env", "utf8");
  if (!envFile.includes("AI_ENCRYPTION_KEY="))
    await writeFile(
      ".env",
      envFile + "\nAI_ENCRYPTION_KEY=" + randomBytes(32).toString("hex") + "\n",
      { mode: 0o600 },
    );
  await chmod(".env", 0o600);
  const db = database();
  try {
    await setup(db);
    await seedDemo(db, passwords);
    console.log("Demo accounts provisioned. Credentials are in " + file);
  } finally {
    await db.end();
  }
}
