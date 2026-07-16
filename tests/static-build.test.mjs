import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("static Netlify export contains the secure app shell and assets", async () => {
  const html = await readFile(new URL("../out/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(html, /AI Face Monitor/);
  assert.match(html, /Checking secure session/);
  assert.match(html, /protected attendance system/);
  assert.doesNotMatch(html, /Starter Project|Codex is working/);
  assert.match(source, /AI server is not responding/);
  assert.match(source, /Try Again/);
  assert.match(source, /controller\.abort\(\)/);
  assert.match(source, /Search name, roll or department/);
  assert.match(source, /face-monitor-preferences/);
  assert.match(source, /form\.append\("threshold"/);
  assert.match(source, /AI reconnecting/);
  assert.match(source, /Show password/);
  assert.match(source, /Class Sessions/);
  assert.match(source, /Recognition record corrected/);
  assert.match(source, /custom-reports/);
  assert.match(source, /Download Backup/);
  assert.match(source, /Audit Activity/);
  await access(new URL("../out/favicon.svg", import.meta.url));
  await access(new URL("../out/og.png", import.meta.url));
});
