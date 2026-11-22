import type { NextRequest } from "next/server";
import { z } from "zod";
import { get } from "../../../../../../server/workspace-domain.js";
import { rosterFor } from "../../../../../lib/auth";
import { jsonBody, recordId, requestRevision } from "../../../../../lib/record-helpers";
import { ApiError, checkOrigin, noStore, requireRole, safeResponse, type Account } from "../../../../../lib/security";
import { change } from "../../../../../lib/workspace-change";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const decision = z.object({
  revision: requestRevision,
  action: z.enum(["approve", "reject", "disable"]),
  rosterId: recordId.optional(),
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    checkOrigin(request);
    const account = await requireRole(request, "admin");
    const id = z.uuid().parse((await context.params).id);
    const body = decision.parse(await jsonBody(request, 2048));
    const result = await change(body.revision, account.id, "account." + body.action, id,
      async (data, client) => {
        const { rows: [pending] } = await client.query<Account & { verified_at: Date | null }>(
          "SELECT * FROM niyam_accounts WHERE id=$1 FOR UPDATE", [id],
        );
        if (!pending || pending.role === "admin")
          throw new ApiError(422, "Account cannot be managed here.");
        if (body.action === "approve") {
          if (!pending.verified_at || pending.status !== "pending")
            throw new ApiError(422, "The email must be verified and awaiting approval.");
          const person = get(rosterFor(data, pending.role), body.rosterId);
          const { rowCount } = await client.query(
            "SELECT id FROM niyam_accounts WHERE role=$1 AND roster_id=$2", [pending.role, person.id],
          );
          if (rowCount) throw new ApiError(409, "That roster record is already linked.");
          await client.query("UPDATE niyam_accounts SET status='active',roster_id=$1 WHERE id=$2", [person.id, id]);
        } else {
          await client.query(
            "UPDATE niyam_accounts SET status=$1 WHERE id=$2", [body.action === "disable" ? "disabled" : "rejected", id],
          );
          await client.query("DELETE FROM niyam_sessions WHERE account_id=$1", [id]);
        }
      }, { planning: false },
    );
    return Response.json(result, { headers: noStore });
  } catch (error) {
    return safeResponse(error);
  }
}
