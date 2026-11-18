import test from "node:test";
import assert from "node:assert/strict";
import { gemini } from "../server/outputs.js";
const config = {
  key: "test-configuration-only",
  model: "gemini-3.1-flash-lite",
};
test("AI retries temporary overload and bounds generation output", async (context) => {
  let requests = 0;
  context.mock.method(globalThis, "fetch", async (url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.generationConfig.maxOutputTokens, 2048);
    if (++requests < 3)
      return Response.json({ error: { message: "busy" } }, { status: 503 });
    return Response.json({
      candidates: [
        { content: { parts: [{ text: "120 candidates are assigned." }] } },
      ],
    });
  });
  assert.equal(
    await gemini(null, "Question", "Use the records", undefined, config),
    "120 candidates are assigned.",
  );
  assert.equal(requests, 3);
});
test("AI reports a rejected key without fabricating an answer", async (context) => {
  context.mock.method(globalThis, "fetch", async () =>
    Response.json({ error: { message: "invalid key" } }, { status: 403 }),
  );
  await assert.rejects(
    gemini(null, "Question", "Use the records", undefined, config),
    (error) => error.status === 502 && error.message.includes("403"),
  );
});
