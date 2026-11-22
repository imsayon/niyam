import type pg from "pg";
import { change as changeWorkspace, snapshot as readWorkspace } from "../../server/store.js";
import { database } from "./db";

export function snapshot() {
  return readWorkspace(database());
}

export function change<Result>(
  revision: number, actor: string, action: string, target: string,
  work: (data: any, client: pg.PoolClient) => Promise<Result> | Result,
  options?: { planning?: boolean },
): Promise<{ revision: number; result: Result }> {
  return changeWorkspace(database(), revision, actor, action, target, work, options);
}
