export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const latest = "https://github.com/imsayon/niyam/releases/latest/download/Niyam-Setup-x64.exe";
export async function GET() {
  const configured = process.env.INSTALLER_URL;
  const obsolete = !!configured && (configured.includes("imsayon/niyam-downloads/") || configured.includes("imsayon/niyam/releases/download/v0.1.0/"));
  const windows = configured && !obsolete && /^https:\/\//.test(configured) ? configured : latest;
  return Response.json({ windows, sha256: windows === configured ? process.env.INSTALLER_SHA256 || null : null }, { headers: { "Cache-Control": "no-store" } });
}
