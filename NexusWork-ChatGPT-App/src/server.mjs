import { randomUUID, timingSafeEqual } from "node:crypto";
import cors from "cors";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { CaptureStore } from "./store.mjs";

const port = Number(process.env.PORT || 8788);
const dataDir = process.env.DATA_DIR || "./data";
const syncToken = process.env.NEXUS_SYNC_TOKEN || "";
const appKey = process.env.NEXUS_APP_KEY || "";
const store = new CaptureStore(dataDir);

if (syncToken.length < 24 || appKey.length < 24) {
  throw new Error("NEXUS_SYNC_TOKEN and NEXUS_APP_KEY must each contain at least 24 characters.");
}

await store.initialize();

function secureEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

function requireSyncToken(req) {
  const value = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  return secureEqual(value, syncToken);
}

function requireAppKey(req) {
  const queryKey = String(req.query?.key || "");
  const bearer = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  return secureEqual(queryKey || bearer, appKey);
}

function textResult(value, structuredContent = value) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent
  };
}

function createMcpServer() {
  const server = new McpServer({
    name: "Nexus Work Alibaba Analyst",
    version: "1.0.0"
  });

  server.registerTool(
    "get_store_status",
    {
      title: "查看 Alibaba 数据状态",
      description: "查看 Nexus Work 已同步的 Alibaba.com 页面数量和最近采集页面。",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
    },
    async () => textResult(await store.status())
  );

  server.registerTool(
    "list_store_captures",
    {
      title: "列出 Alibaba 采集页面",
      description: "列出最近从 Alibaba.com 后台同步的页面。先用此工具选择需要深入分析的页面。",
      inputSchema: {
        limit: z.number().int().min(1).max(50).optional().describe("返回页面数量，默认 20")
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
    },
    async ({ limit = 20 }) => {
      const captures = await store.list({ limit });
      const items = captures.map(({ id, title, url, host, capturedAt, receivedAt, metrics, tables, text }) => ({
        id,
        title,
        url,
        host,
        capturedAt,
        receivedAt,
        metricCount: metrics.length,
        tableCount: tables.length,
        characters: text.length
      }));
      return textResult({ items });
    }
  );

  server.registerTool(
    "get_store_capture",
    {
      title: "读取 Alibaba 页面数据",
      description: "根据采集 ID 读取一个 Alibaba.com 后台页面的可见文本、指标和表格。",
      inputSchema: {
        id: z.string().min(1).describe("list_store_captures 返回的采集 ID")
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
    },
    async ({ id }) => {
      const capture = await store.get(id);
      if (!capture) {
        return {
          isError: true,
          content: [{ type: "text", text: `Capture not found: ${id}` }]
        };
      }
      return textResult(capture);
    }
  );

  server.registerTool(
    "get_store_context",
    {
      title: "读取店铺分析上下文",
      description: "合并最近多个 Alibaba.com 后台页面，供 ChatGPT 进行店铺经营、商品、询盘和订单综合分析。",
      inputSchema: {
        limit: z.number().int().min(1).max(20).optional().describe("合并页面数量，默认 10"),
        maxCharacters: z.number().int().min(1000).max(150000).optional().describe("最大字符数，默认 100000")
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
    },
    async ({ limit = 10, maxCharacters = 100_000 }) => {
      const context = await store.context({ limit, maxCharacters });
      return {
        content: [{
          type: "text",
          text: context || "No Alibaba.com pages have been synchronized yet."
        }]
      };
    }
  );

  return server;
}

const app = express();
app.use(express.json({ limit: "2.5mb" }));
app.use(cors({
  origin: true,
  allowedHeaders: ["Authorization", "Content-Type", "Mcp-Session-Id"],
  exposedHeaders: ["Mcp-Session-Id"],
  methods: ["GET", "POST", "DELETE", "OPTIONS"]
}));

app.get("/health", (req, res) => {
  res.set("Cache-Control", "no-store").json({
    ok: true,
    service: "nexus-work-chatgpt-app",
    version: "1.0.0"
  });
});

app.post("/api/captures", async (req, res, next) => {
  try {
    if (!requireSyncToken(req)) {
      res.status(401).json({ error: "Invalid synchronization token." });
      return;
    }
    const result = await store.add(req.body);
    res.json({
      ok: true,
      duplicate: result.duplicate,
      id: result.capture.id,
      title: result.capture.title,
      characters: result.capture.text.length,
      tables: result.capture.tables.length
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/captures/status", async (req, res, next) => {
  try {
    if (!requireSyncToken(req)) {
      res.status(401).json({ error: "Invalid synchronization token." });
      return;
    }
    res.json(await store.status());
  } catch (error) {
    next(error);
  }
});

const transports = new Map();

function authorizeMcp(req, res, next) {
  if (!requireAppKey(req)) {
    res.status(401).json({ error: "Invalid ChatGPT app key." });
    return;
  }
  next();
}

app.post("/mcp", authorizeMcp, async (req, res) => {
  const sessionId = req.headers["mcp-session-id"];
  try {
    let transport;
    if (sessionId && transports.has(sessionId)) {
      transport = transports.get(sessionId);
    } else if (!sessionId && isInitializeRequest(req.body)) {
      const mcpServer = createMcpServer();
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          transports.set(id, { transport, mcpServer });
        }
      });
      transport.onclose = () => {
        if (transport.sessionId) transports.delete(transport.sessionId);
      };
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    } else {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Invalid or missing MCP session." },
        id: null
      });
      return;
    }
    await transport.transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal MCP server error." },
        id: null
      });
    }
  }
});

app.get("/mcp", authorizeMcp, async (req, res) => {
  const session = transports.get(req.headers["mcp-session-id"]);
  if (!session) {
    res.status(400).send("Invalid or missing MCP session.");
    return;
  }
  await session.transport.handleRequest(req, res);
});

app.delete("/mcp", authorizeMcp, async (req, res) => {
  const session = transports.get(req.headers["mcp-session-id"]);
  if (!session) {
    res.status(400).send("Invalid or missing MCP session.");
    return;
  }
  await session.transport.handleRequest(req, res);
});

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) {
    next(error);
    return;
  }
  res.status(400).json({ error: error.message || "Request failed." });
});

const httpServer = app.listen(port, "0.0.0.0", () => {
  console.log(`Nexus Work ChatGPT App listening on port ${port}`);
});

async function shutdown() {
  for (const { transport, mcpServer } of transports.values()) {
    await transport.close().catch(() => {});
    await mcpServer.close().catch(() => {});
  }
  httpServer.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
