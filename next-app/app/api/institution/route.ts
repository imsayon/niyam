import type { NextRequest } from "next/server";
import { institutionConfiguration, institutionSchema } from "../../../../server/institution-config.js";
import { audit, transaction } from "../../../../server/store.js";
import { database } from "../../../lib/db";
import { jsonBody } from "../../../lib/record-helpers";
import { checkOrigin, noStore, requireRole, safeResponse } from "../../../lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireRole(request);
    return Response.json(await institutionConfiguration(database()), { headers: noStore });
  } catch (error) {
    return safeResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    checkOrigin(request);
    const account = await requireRole(request, "admin");
    const setting = institutionSchema.parse(await jsonBody(request, 2048));
    await transaction(database(), async (client: import("pg").PoolClient) => {
      await client.query(
        "INSERT INTO niyam_settings(name,value) VALUES ('institution',$1) ON CONFLICT(name) DO UPDATE SET value=excluded.value",
        [setting],
      );
      await audit(client, account.id, "institution.updated", setting.shortName);
    });
    return Response.json(setting, { headers: noStore });
  } catch (error) {
    return safeResponse(error);
  }
}
