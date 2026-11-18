import { writeFile, mkdir, readFile } from "node:fs/promises";
import { database, setup, transaction } from "../server/store.js";

const db = database();
try {
  await setup(db);
  if (process.argv[2] === "restore") {
    const source = JSON.parse(await readFile(process.argv[3], "utf8"));
    if (source.version !== 1) throw Error("Unsupported backup version");
    await transaction(db, async (client) => {
      const {
        rows: [current],
      } = await client.query(
        "SELECT data FROM niyam_workspace WHERE id FOR UPDATE",
      );
      const {
        rows: [accounts],
      } = await client.query("SELECT count(*) AS count FROM niyam_accounts");
      if (current.data.events.length || Number(accounts.count))
        throw Error("Restore requires an empty database.");
      await client.query(
        "UPDATE niyam_workspace SET data=$1,revision=$2 WHERE id",
        [source.workspace.data, source.workspace.revision],
      );
      for (const account of source.accounts)
        await client.query(
          "INSERT INTO niyam_accounts(id,email,name,role,status,roster_id,password_hash,verified_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
          Object.values(account),
        );
      for (const row of source.audit)
        await client.query(
          "INSERT INTO niyam_audit(at,actor,action,target) VALUES ($1,$2,$3,$4)",
          [row.at, row.actor, row.action, row.target],
        );
      for (const row of source.settings)
        await client.query(
          "INSERT INTO niyam_settings(name,value) VALUES ($1,$2)",
          [row.name, row.value],
        );
    });
    console.log(
      "Backup restored. Existing sessions were excluded. Keep the original AI_ENCRYPTION_KEY to use restored provider settings.",
    );
  } else {
    const backup = await transaction(db, async (client) => {
      await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      const {
        rows: [workspace],
      } = await client.query(
        "SELECT data,revision FROM niyam_workspace WHERE id",
      );
      const { rows: accounts } = await client.query(
        "SELECT id,email,name,role,status,roster_id,password_hash,verified_at FROM niyam_accounts",
      );
      const { rows: audit } = await client.query(
        "SELECT at,actor,action,target FROM niyam_audit ORDER BY id",
      );
      const { rows: settings } = await client.query(
        "SELECT name,value FROM niyam_settings",
      );
      return {
        version: 1,
        at: new Date().toISOString(),
        workspace,
        accounts,
        audit,
        settings,
      };
    });
    await mkdir("local/backups", { recursive: true, mode: 0o700 });
    const file =
      "local/backups/niyam-" +
      new Date().toISOString().replaceAll(":", "-") +
      ".json";
    await writeFile(file, JSON.stringify(backup), { mode: 0o600, flag: "wx" });
    console.log("Created " + file);
  }
} finally {
  await db.end();
}
