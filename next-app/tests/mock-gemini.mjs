import assert from "node:assert/strict";

if (process.env.NIYAM_SANDBOX !== "1") throw Error("Gemini mocking requires the test sandbox.");

const request = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  if (!String(input).startsWith("https://generativelanguage.googleapis.com/"))
    return request(input, options);

  assert.equal(options.headers["x-goog-api-key"], "integration-test-provider-key");
  const body = JSON.parse(options.body);
  let text;
  if (body.systemInstruction.parts[0].text === "Connection test.") {
    text = "OK";
  } else if (body.generationConfig.responseSchema) {
    assert.equal(body.contents[0].parts[0].text, "Example candidate DEMO001");
    text = JSON.stringify([{ code: "DEMO001", name: "Example candidate" }]);
  } else {
    const context = JSON.parse(body.contents[0].parts[0].text);
    assert.match(body.systemInstruction.parts[0].text, /only from the CURRENT authorized source/);
    assert.equal(context.question, "What about my schedule?");
    assert.equal(context.previousTurns.length, 2);
    assert.deepEqual(context.previousTurns.map((turn) => turn.role), ["user", "assistant"]);
    assert.equal(context.previousTurns[0].text, "Hi");
    assert.equal(context.source.length, 1);
    assert.equal(context.source[0].paper, "Data Structures");
    assert.ok(context.source[0].room);
    assert.ok(!JSON.stringify(context).includes("DEMO002"));
    text = "Your Data Structures room is " + context.source[0].room + ".";
  }
  return Response.json({ candidates: [{ content: { parts: [{ text }] } }] });
};
