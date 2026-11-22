const { _electron: electron, expect } = require("@playwright/test");
const fs = require("node:fs/promises");
const { origin } = require("../desktop/target.json");
const evidence = "local/desktop-evidence";

(async () => {
  if (!process.env.NIYAM_DESKTOP_PATH)
    throw Error("NIYAM_DESKTOP_PATH is required");
  const expectedSha = process.env.NIYAM_EXPECTED_SHA;
  const password = process.env.NIYAM_ADMIN_PASSWORD;
  if (new URL(origin).protocol !== "https:") throw Error("Expected HTTPS");
  if (expectedSha) {
    if (!password) throw Error("A preview admin password is required");
    await expect.poll(async () => {
      try {
        const response = await fetch(new URL("/api/health", origin), {
          signal: AbortSignal.timeout(10000),
        });
        if (response.ok) return (await response.json()).version;
      } catch {
        // Wait for the acceptance service to finish deploying.
      }
    }, { timeout: 240000, intervals: [2000, 4000, 8000] }).toBe(expectedSha);
  }
  const application = await electron.launch({
    executablePath: process.env.NIYAM_DESKTOP_PATH,
  });
  try {
    const window = await application.firstWindow();
    const failures = [];
    window.on("pageerror", (error) => failures.push(error.message));
    await expect(window.getByRole("tab", { name: "Admin" })).toBeVisible({
      timeout: 120000,
    });
    expect(new URL(window.url()).origin).toBe(origin);
    await expect(window.getByRole("tab", { name: "Faculty" })).toBeVisible();
    await expect(window.getByRole("tab", { name: "Student" })).toBeVisible();
    const bridge = await window.evaluate(() =>
      typeof window.niyamDesktop?.openLogin === "function",
    );
    if (!bridge) throw Error("The secure desktop login bridge is missing");
    await window.getByRole("tab", { name: "Student" }).click();
    await expect(
      window.getByRole("button", { name: "Continue with Google" }),
    ).toBeVisible();
    await window.getByRole("tab", { name: "Admin" }).click();
    await fs.mkdir(evidence, { recursive: true });
    await window.screenshot({ path: `${evidence}/windows-sign-in.png`, fullPage: true });
    if (password) {
      await expect(window.getByLabel("Email address")).toHaveValue("admin.niyam@dsce.edu.in");
      await window
        .getByLabel("Password", { exact: true })
        .fill(password);
      await window.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(
        window.getByRole("heading", { name: "A clear view. Every exam." }),
      ).toBeVisible({ timeout: 60000 });
      await window.reload();
      await expect(
        window.getByRole("heading", { name: "A clear view. Every exam." }),
      ).toBeVisible();
      const account = await window.evaluate(async () => {
        const session = await fetch("/api/session");
        const workspace = await fetch("/api/workspace");
        return session.ok && workspace.ok
          && (await session.json()).account?.role === "admin"
          && (await workspace.json()).data?.students?.length > 0;
      });
      if (!account) throw Error("The installed app lost access to the admin workspace after reloading");
      if (expectedSha) {
        await window.screenshot({ path: `${evidence}/windows-workspace.png`, fullPage: true });
      }
      console.log("Windows installer: admin sign-in and session retention verified");
    } else {
      console.log(
        "Windows installer: landing and desktop bridge verified; authenticated smoke skipped (NIYAM_ADMIN_PASSWORD not set)",
      );
    }
    if (failures.length) throw Error(failures.join("\n"));
  } finally {
    await application.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
