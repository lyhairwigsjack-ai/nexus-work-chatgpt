import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CaptureStore, normalizeCapture } from "../src/store.mjs";

const temp = await mkdtemp(path.join(os.tmpdir(), "nexus-work-"));
try {
  const store = new CaptureStore(temp);
  await store.initialize();

  const sample = {
    url: "https://seller.alibaba.com/dashboard",
    title: "Store dashboard",
    capturedAt: "2026-06-13T00:00:00.000Z",
    headings: ["Overview"],
    metrics: ["Inquiries 12"],
    tables: [{ tableIndex: 0, rows: [["Metric", "Value"], ["Inquiries", "12"]] }],
    text: "Exposure 1200 Clicks 80 Inquiries 12"
  };

  const normalized = normalizeCapture(sample);
  assert.equal(normalized.host, "seller.alibaba.com");
  assert.equal(normalized.title, "Store dashboard");

  const first = await store.add(sample);
  const duplicate = await store.add(sample);
  assert.equal(first.duplicate, false);
  assert.equal(duplicate.duplicate, true);

  const status = await store.status();
  assert.equal(status.count, 1);
  assert.equal((await store.list()).length, 1);
  assert.match(await store.context(), /Inquiries 12/);

  assert.throws(
    () => normalizeCapture({ ...sample, url: "https://example.com" }),
    /Only Alibaba/
  );

  console.log("store tests passed");
} finally {
  await rm(temp, { recursive: true, force: true });
}
