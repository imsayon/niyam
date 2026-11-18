const { _electron: electron, expect } = require("@playwright/test");
const fs = require("node:fs/promises");
(async () => {
  if (!process.env.NIYAM_DESKTOP_PATH || !process.env.NIYAM_STUDENT_PASSWORD)
    throw Error("Desktop smoke configuration is missing");
  const application = await electron.launch({
    executablePath: process.env.NIYAM_DESKTOP_PATH,
  });
  try {
    const window = await application.firstWindow();
    const failures = [];
    window.on("pageerror", (error) => failures.push(error.message));
    await window.getByLabel("Email address").fill("student@niyam.example");
    await window
      .getByLabel("Password", { exact: true })
      .fill(process.env.NIYAM_STUDENT_PASSWORD);
    await window.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      window.getByRole("heading", { name: "My exams & seats" }),
    ).toBeVisible();
    await expect(
      window.getByRole("heading", { name: "Data Structures" }),
    ).toBeVisible();
    await expect(window.getByText("A-101", { exact: true })).toBeVisible();
    await window.reload();
    await expect(
      window.getByRole("heading", { name: "Data Structures" }),
    ).toBeVisible();
    await fs.mkdir("local/desktop-evidence", { recursive: true });
    await window.screenshot({
      path: "local/desktop-evidence/windows-student.png",
      fullPage: true,
    });
    if (failures.length) throw Error(failures.join("\n"));
    console.log(
      "Installed Windows app signed in, read its published seat, and retained its authenticated session after reload.",
    );
  } finally {
    await application.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
