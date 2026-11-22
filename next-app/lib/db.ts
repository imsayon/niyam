import pg from "pg";
// One short-lived Node pool per Next server process. Never import from Client Components.
type Globals = typeof globalThis & { __niyamNextPool?: pg.Pool };
const globals = globalThis as Globals;
export function database(): pg.Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  return (globals.__niyamNextPool ??= new pg.Pool({
    connectionString, max: 5, connectionTimeoutMillis: 10000, idleTimeoutMillis: 15000,
  }));
}
