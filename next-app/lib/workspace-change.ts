import type pg from "pg";
import { database } from "./db";
import { ApiError } from "./security";

// Match server/store.js transaction and optimistic revision protocol.
// The workspace row lock prevents two stale writers from committing.
export async function change(
  revision: number, actor: string, action: string, target: string,
  work: (data: any, client: pg.PoolClient) => Promise<unknown> | unknown,
  { planning = true }: { planning?: boolean } = {},
) {
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    const { rows: [row] } = await client.query<{ revision: number; data: any }>(
      "SELECT revision, data FROM niyam_workspace WHERE id FOR UPDATE",
    );
    if (!row) throw new ApiError(503, "Workspace is unavailable.");
    if (revision !== row.revision) throw new ApiError(409, "The workspace changed. Refresh and try again.");
    row.data.references ??= [];
    const result = await work(row.data, client);
    const next = row.revision + Number(planning);
    await client.query("UPDATE niyam_workspace SET revision=$1, data=$2 WHERE id", [next, row.data]);
    await client.query("INSERT INTO niyam_audit(actor,action,target) VALUES ($1,$2,$3)", [actor, action, target]);
    await client.query("COMMIT");
    return { revision: next, result };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
