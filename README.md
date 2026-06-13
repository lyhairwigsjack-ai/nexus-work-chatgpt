# Nexus Work for ChatGPT

这是 Nexus Work 的 ChatGPT App 版本。Alibaba.com 页面由 Chrome 扩展主动采集并同步到你的私人 MCP 服务，ChatGPT 使用自身模型分析数据，不需要 OpenAI API Key。

## 工作流程

1. 把本文件夹中的云端服务部署到一个支持 Docker 或 Node.js 的 HTTPS 服务。
2. 将 `NEXUS_SYNC_TOKEN` 和 `NEXUS_APP_KEY` 配置为云端环境变量。
3. 在 Chrome 中加载 `chrome-extension` 文件夹。
4. 在扩展中填写云端 HTTPS 地址和 `NEXUS_SYNC_TOKEN`。
5. 登录 Alibaba.com，打开需要分析的后台页面，点击“同步当前页到 ChatGPT”。
6. 在 ChatGPT 开发者模式中创建连接器，地址填写：

```text
https://你的云端域名/mcp?key=你的NEXUS_APP_KEY
```

7. 新建 ChatGPT 对话，添加 Nexus Work 连接器，然后提问：

```text
读取我的 Alibaba 店铺数据，分析流量、商品和询盘表现，并给出本周优先行动计划。
```

## 推荐部署：Render

项目已经包含 `render.yaml` 和 `Dockerfile`。

1. 创建一个私有 GitHub 仓库，把本文件夹上传到仓库。
2. 登录 Render，选择 `New` → `Blueprint`，连接该仓库。
3. Render 会读取 `render.yaml` 创建服务和持久化磁盘。
4. 按提示填写：
   - `NEXUS_SYNC_TOKEN`
   - `NEXUS_APP_KEY`
5. 部署成功后复制形如 `https://nexus-work-xxxx.onrender.com` 的地址。
6. 在浏览器打开 `https://你的域名/health`，显示 `"ok":true` 即部署成功。

必须使用持久化磁盘，否则云服务重启后采集数据可能丢失。

## 安装 Chrome 扩展

1. 在 Chrome 地址栏打开 `chrome://extensions`。
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本项目中的 `chrome-extension` 文件夹。
5. 打开扩展，填写云端服务地址和 `NEXUS_SYNC_TOKEN`，点击“保存并测试”。

扩展只读取你点击同步时当前 Alibaba.com 页面中已经显示的文本、表格和指标，不读取密码、Cookie 或验证码。

## 连接 ChatGPT

根据 OpenAI 官方流程：

1. 打开 ChatGPT `Settings` → `Apps & Connectors`。
2. 在页面底部打开 `Advanced settings`，启用开发者模式。
3. 返回 `Apps & Connectors`，点击 `Create`。
4. 名称填写 `Nexus Work Alibaba Analyst`。
5. 描述填写 `读取我主动同步的 Alibaba.com 后台页面，用于店铺、商品、询盘和订单分析。`
6. Connector URL 填写：

```text
https://你的云端域名/mcp?key=你的NEXUS_APP_KEY
```

7. 创建成功后应显示四个只读工具：
   - `get_store_status`
   - `list_store_captures`
   - `get_store_capture`
   - `get_store_context`

OpenAI 官方说明要求连接器 MCP 地址可通过 HTTPS 访问。开发者模式入口和创建流程参见：

- https://developers.openai.com/apps-sdk/deploy/connect-chatgpt

## 安全说明

- `NEXUS_SYNC_TOKEN` 只填写在 Chrome 扩展和云服务环境变量中。
- `NEXUS_APP_KEY` 只填写在 ChatGPT 连接器 URL 和云服务环境变量中。
- 不要把令牌提交到 GitHub，也不要发送给其他人。
- 当前是单用户私人开发者版本。连接器 URL 中的密钥可能出现在托管平台访问日志中，因此不适合公开发布。
- 如果要发布给多个用户，必须改成 OAuth 2.1，并完成 ChatGPT App 提交流程。

## 本地开发

需要 Node.js 20 或更高版本：

```powershell
npm install
$env:NEXUS_SYNC_TOKEN="至少24个字符"
$env:NEXUS_APP_KEY="另一个至少24个字符的密钥"
npm start
```

健康检查地址为 `http://127.0.0.1:8788/health`，MCP 地址为：

```text
http://127.0.0.1:8788/mcp?key=你的NEXUS_APP_KEY
```

ChatGPT 不能直接访问普通的本机地址；本地测试需要 OpenAI Secure MCP Tunnel、Cloudflare Tunnel 或 ngrok。
