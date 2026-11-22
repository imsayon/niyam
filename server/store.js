import pg from "pg";

export function database(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL is required");
  return new pg.Pool({
    connectionString: url,
    max: 5,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 15000,
  });
}

export async function setup(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS niyam_settings (name text PRIMARY KEY, value jsonb NOT NULL);
    CREATE TABLE IF NOT EXISTS niyam_workspace (
      id boolean PRIMARY KEY DEFAULT true CHECK (id),
      revision integer NOT NULL DEFAULT 0,
      data jsonb NOT NULL
    );
    CREATE TABLE IF NOT EXISTS niyam_accounts (
      id uuid PRIMARY KEY,
      email text NOT NULL UNIQUE,
      name text NOT NULL,
      role text NOT NULL CHECK (role IN ('admin','faculty','student')),
      status text NOT NULL CHECK (status IN ('pending','active','rejected','disabled')),
      roster_id text,
      password_hash text,
      verified_at timestamptz,
      UNIQUE (role, roster_id)
    );
    ALTER TABLE niyam_accounts ALTER COLUMN password_hash DROP NOT NULL;
    CREATE TABLE IF NOT EXISTS niyam_sessions (
      token_hash text PRIMARY KEY,
      account_id uuid NOT NULL REFERENCES niyam_accounts(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL
    );
    CREATE TABLE IF NOT EXISTS niyam_account_tokens (
      token_hash text PRIMARY KEY,
      account_id uuid NOT NULL REFERENCES niyam_accounts(id) ON DELETE CASCADE,
      purpose text NOT NULL CHECK (purpose IN ('verify','reset')),
      expires_at timestamptz NOT NULL
    );
    CREATE TABLE IF NOT EXISTS niyam_audit (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      at timestamptz NOT NULL DEFAULT now(),
      actor text NOT NULL,
      action text NOT NULL,
      target text NOT NULL
    );
    INSERT INTO niyam_workspace(data) VALUES ('{"events":[],"sittings":[],"rooms":[],"faculty":[],"students":[],"enrollments":[],"leaves":[],"runs":[],"imports":[],"references":[]}') ON CONFLICT DO NOTHING;
    UPDATE niyam_workspace SET data=jsonb_set(data,'{references}','[]'::jsonb,true) WHERE NOT (data ? 'references');
  `);
}

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export async function transaction(db, work) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function snapshot(db) {
  const {
    rows: [row],
  } = await db.query("SELECT revision, data FROM niyam_workspace WHERE id");
  if (!row.data.references) row.data.references = [];
  return row;
}

export async function audit(db, actor, action, target) {
  await db.query(
    "INSERT INTO niyam_audit(actor,action,target) VALUES ($1,$2,$3)",
    [actor, action, target],
  );
}

export async function change(
  db,
  revision,
  actor,
  action,
  target,
  work,
  { planning = true } = {},
) {
  return transaction(db, async (client) => {
    const {
      rows: [row],
    } = await client.query(
      "SELECT revision, data FROM niyam_workspace WHERE id FOR UPDATE",
    );
    if (revision !== row.revision)
      throw new HttpError(409, "The workspace changed. Refresh and try again.");
    const result = await work(row.data, client);
    const next = row.revision + Number(planning);
    await client.query(
      "UPDATE niyam_workspace SET revision=$1, data=$2 WHERE id",
      [next, row.data],
    );
    await audit(client, actor, action, target);
    return { revision: next, result };
  });
}
