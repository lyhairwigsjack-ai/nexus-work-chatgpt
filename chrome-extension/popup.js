const endpointInput = document.querySelector("#endpoint");
const tokenInput = document.querySelector("#syncToken");
const serviceState = document.querySelector("#serviceState");
const pageState = document.querySelector("#pageState");
const result = document.querySelector("#result");
const captureButton = document.querySelector("#capture");
let config = { endpoint: "", syncToken: "" };
let serviceOnline = false;

function normalizeEndpoint(value) {
  const url = new URL(value.trim());
  if (url.protocol !== "https:" && !["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error("云端服务必须使用 HTTPS");
  }
  return url.origin + url.pathname.replace(/\/+$/, "");
}

function isAlibaba(url = "") {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "alibaba.com" || host.endsWith(".alibaba.com");
  } catch {
    return false;
  }
}

function setResult(message, type = "") {
  result.className = type;
  result.textContent = message;
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function requestEndpointPermission(endpoint) {
  const origin = `${new URL(endpoint).origin}/*`;
  const allowed = await chrome.permissions.request({ origins: [origin] });
  if (!allowed) throw new Error("需要允许扩展访问你的 Nexus Work 云端地址");
}

async function cloudFetch(path, options = {}) {
  if (!config.endpoint || !config.syncToken) throw new Error("请先配置云端地址和同步令牌");
  return fetch(`${config.endpoint}${path}`, {
    ...options,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${config.syncToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
}

async function checkService() {
  if (!config.endpoint || !config.syncToken) {
    serviceOnline = false;
    serviceState.className = "service-state checking";
    serviceState.textContent = "尚未配置云端服务";
    captureButton.disabled = true;
    return;
  }

  serviceState.className = "service-state checking";
  serviceState.textContent = "正在连接 ChatGPT App...";
  try {
    const health = await fetch(`${config.endpoint}/health`, { cache: "no-store" });
    if (!health.ok) throw new Error("服务健康检查失败");
    const status = await cloudFetch("/api/captures/status");
    const data = await status.json();
    if (!status.ok) throw new Error(data.error || "同步令牌不正确");
    serviceOnline = true;
    serviceState.className = "service-state ok";
    serviceState.textContent = `ChatGPT App 已连接 · 已同步 ${data.count || 0} 页`;
  } catch (error) {
    serviceOnline = false;
    serviceState.className = "service-state error";
    serviceState.textContent = `连接失败：${error.message}`;
  }
  await refreshPageState();
}

async function sendCapture(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: "NEXUS_CAPTURE_PAGE" });
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    return chrome.tabs.sendMessage(tabId, { type: "NEXUS_CAPTURE_PAGE" });
  }
}

async function refreshPageState() {
  const tab = await activeTab();
  const valid = Boolean(tab && isAlibaba(tab.url));
  if (valid) {
    pageState.innerHTML = `<b>${tab.title || "Alibaba.com"}</b><p>${new URL(tab.url).hostname}</p>`;
  } else {
    pageState.innerHTML = "<b>当前不是 Alibaba.com 页面</b><p>请先打开并登录阿里巴巴国际站。</p>";
  }
  captureButton.disabled = !serviceOnline || !valid;
}

document.querySelector("#save").addEventListener("click", async () => {
  try {
    const endpoint = normalizeEndpoint(endpointInput.value);
    await requestEndpointPermission(endpoint);
    config = { endpoint, syncToken: tokenInput.value.trim() };
    if (!config.syncToken) throw new Error("请输入同步令牌");
    await chrome.storage.local.set({ nexusCloudConfig: config });
    setResult("配置已保存，正在测试连接...");
    await checkService();
  } catch (error) {
    setResult(error.message, "error");
  }
});

document.querySelector("#forget").addEventListener("click", async () => {
  await chrome.storage.local.remove(["nexusCloudConfig"]);
  config = { endpoint: "", syncToken: "" };
  endpointInput.value = "";
  tokenInput.value = "";
  setResult("云端配置已清除。");
  await checkService();
});

document.querySelector("#openAlibaba").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://www.alibaba.com/" });
});

captureButton.addEventListener("click", async () => {
  captureButton.disabled = true;
  captureButton.textContent = "正在同步...";
  setResult("");
  try {
    const tab = await activeTab();
    if (!tab || !isAlibaba(tab.url)) throw new Error("请在 Alibaba.com 页面使用");
    const capture = await sendCapture(tab.id);
    if (!capture?.ok) throw new Error(capture?.error || "无法读取当前页面");
    const response = await cloudFetch("/api/captures", {
      method: "POST",
      body: JSON.stringify(capture.data)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "云端同步失败");
    setResult(
      data.duplicate
        ? "此页面内容已经同步过，可以直接在 ChatGPT 中分析。"
        : `同步成功：${data.tables} 个表格，${data.characters} 个文本字符。`,
      "ok"
    );
    await checkService();
  } catch (error) {
    setResult(error.message, "error");
  } finally {
    captureButton.textContent = "同步当前页到 ChatGPT";
    await refreshPageState();
  }
});

async function init() {
  const stored = await chrome.storage.local.get(["nexusCloudConfig"]);
  config = stored.nexusCloudConfig || config;
  endpointInput.value = config.endpoint;
  tokenInput.value = config.syncToken;
  await checkService();
}

init();
