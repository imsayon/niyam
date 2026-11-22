import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { adminEmail } from "../../lib/auth";
import { getAccountFromToken, googleEnabled, mailEnabled, publicAccount } from "../../lib/security";
import { WorkspaceApp } from "../_components/workspace";

const pages = new Set(["examinations", "rooms", "allocation", "students", "faculty", "leaves", "imports", "reports", "access", "audit", "settings"]);

export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug = [] } = await params;
  if (slug.length && (slug.length !== 1 || !pages.has(slug[0]))) notFound();
  const account = await getAccountFromToken((await cookies()).get("niyam")?.value);
  const google = googleEnabled();
  const recovery = mailEnabled();
  return <WorkspaceApp initialSession={{ account: account ? publicAccount(account) : null, adminEmail, google, recovery, registration: recovery && !google }} />;
}
