import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("static Netlify export contains the secure app shell and assets", async () => {
  const html = await readFile(new URL("../out/index.html", import.meta.url), "utf8");
  assert.match(html, /AI Face Monitor/);
  assert.match(html, /Checking secure session/);
  assert.match(html, /protected attendance system/);
  assert.doesNotMatch(html, /Starter Project|Codex is working/);
  await access(new URL("../out/favicon.svg", import.meta.url));
  await access(new URL("../out/og.png", import.meta.url));
});
