import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const MAX_CAPTURES = 100;
const MAX_TEXT_LENGTH = 180_000;

function text(value, max = 500) {
  return String(value ?? "").slice(0, max);
}

function array(value, max) {
  return Array.isArray(value) ? value.slice(0, max) : [];
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeCapture(input, now = new Date()) {
  const url = text(input?.url, 2_000);
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    throw new Error("A valid Alibaba.com URL is required.");
  }
  if (host !== "alibaba.com" && !host.endsWith(".alibaba.com")) {
    throw new Error("Only Alibaba.com pages can be synchronized.");
  }

  const pageText = text(input?.text, MAX_TEXT_LENGTH);
  const fingerprint = sha256(`${url}\n${pageText}`);
  const receivedAt = now.toISOString();
  return {
    id: `${now.toISOString().replace(/\D/g, "").slice(0, 14)}-${randomBytes(5).toString("hex")}`,
    fingerprint,
    source: "chrome-extension",
    receivedAt,
    capturedAt: text(input?.capturedAt || receivedAt, 100),
    url,
    host,
    title: text(input?.title || "Alibaba.com page", 500),
    pageType: text(input?.pageType, 1_000),
    language: text(input?.language, 50),
    connectorVersion: text(input?.connectorVersion, 50),
    headings: array(input?.headings, 100).map((item) => text(item, 500)),
    metrics: array(input?.metrics, 150).map((item) => text(item, 500)),
    tables: array(input?.tables, 20).map((table) => ({
      tableIndex: Number(table?.tableIndex || 0),
      rows: array(table?.rows, 100).map((row) =>
        array(row, 30).map((cell) => text(cell, 500))
      )
    })),
    text: pageText
  };
}

export class CaptureStore {
  constructor(dataDir) {
    this.dataDir = path.resolve(dataDir);
    this.file = path.join(this.dataDir, "captures.json");
    this.writeQueue = Promise.resolve();
  }

  async initialize() {
    await mkdir(this.dataDir, { recursive: true });
    try {
      await readFile(this.file, "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await this.#write([]);
    }
  }

  async list({ limit = 20 } = {}) {
    const captures = await this.#read();
    return captures.slice(0, Math.max(1, Math.min(Number(limit) || 20, 100)));
  }

  async get(id) {
    const captures = await this.#read();
    return captures.find((item) => item.id === id) || null;
  }

  async add(input) {
    const capture = normalizeCapture(input);
    return this.#serialize(async () => {
      const captures = await this.#read();
      const duplicate = captures.find((item) => item.fingerprint === capture.fingerprint);
      if (duplicate) {
        return { duplicate: true, capture: duplicate };
      }
      const next = [capture, ...captures].slice(0, MAX_CAPTURES);
      await this.#write(next);
      return { duplicate: false, capture };
    });
  }

  async status() {
    const captures = await this.#read();
    return {
      count: captures.length,
      latest: captures[0]
        ? {
            id: captures[0].id,
            title: captures[0].title,
            url: captures[0].url,
            capturedAt: captures[0].capturedAt
          }
        : null
    };
  }

  async context({ limit = 10, maxCharacters = 100_000 } = {}) {
    const captures = await this.list({ limit });
    const parts = captures.map((capture) =>
      JSON.stringify({
        id: capture.id,
        title: capture.title,
        url: capture.url,
        capturedAt: capture.capturedAt,
        headings: capture.headings,
        metrics: capture.metrics,
        tables: capture.tables,
        text: capture.text
      })
    );
    return parts.join("\n\n").slice(0, Math.max(1_000, Math.min(maxCharacters, 150_000)));
  }

  async #read() {
    const value = JSON.parse(await readFile(this.file, "utf8"));
    return Array.isArray(value) ? value : [];
  }

  async #write(value) {
    const temp = `${this.file}.tmp`;
    await writeFile(temp, JSON.stringify(value, null, 2), "utf8");
    await rename(temp, this.file);
  }

  #serialize(operation) {
    const result = this.writeQueue.then(operation, operation);
    this.writeQueue = result.catch(() => {});
    return result;
  }
}
