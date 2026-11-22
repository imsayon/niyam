const { _electron: electron, expect } = require("@playwright/test");
const fs = require("node:fs/promises");

(async () => {
  if (!process.env.NIYAM_DESKTOP_PATH)
    throw Error("NIYAM_DESKTOP_PATH is required");
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
    if (process.env.NIYAM_ADMIN_PASSWORD) {
      await window.getByLabel("Email address").fill("admin.niyam@dsce.edu.in");
      await window
        .getByLabel("Password", { exact: true })
        .fill(process.env.NIYAM_ADMIN_PASSWORD);
      await window.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(
        window.getByRole("heading", { name: "A clear view. Every exam." }),
      ).toBeVisible({ timeout: 60000 });
      const result = await window.evaluate(async () =>
        (await fetch("/api/workspace")).json(),
      );
      if (!result.data?.students?.length)
        throw Error("The administrator could not read the workspace");
      await window.reload();
      await expect(
        window.getByRole("heading", { name: "A clear view. Every exam." }),
      ).toBeVisible();
      console.log("Windows installer: admin sign-in and session retention verified");
    } else {
      console.log(
        "Windows installer: landing and desktop bridge verified; authenticated smoke skipped (NIYAM_ADMIN_PASSWORD not set)",
      );
    }
    await fs.mkdir("local/desktop-evidence", { recursive: true });
    await window.screenshot({
      path: "local/desktop-evidence/windows-smoke.png",
      fullPage: true,
    });
    if (failures.length) throw Error(failures.join("\n"));
  } finally {
    await application.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
