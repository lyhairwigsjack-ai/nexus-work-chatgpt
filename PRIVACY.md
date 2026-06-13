# Privacy

Nexus Work for ChatGPT processes only Alibaba.com page content that the user explicitly chooses to synchronize from the Chrome extension.

Collected fields may include the current page URL, title, visible headings, visible metrics, rendered tables, visible page text, and capture time.

The extension is not designed to collect Alibaba.com passwords, cookies, session tokens, SMS codes, hidden pages, or content from non-Alibaba websites.

Captured business data is stored in the data directory configured by the operator of the private MCP service. The service does not call the OpenAI API. When the user invokes the app in ChatGPT, requested captured data is returned to ChatGPT through MCP and is then processed according to the user's ChatGPT account and workspace settings.

Operators should protect `NEXUS_SYNC_TOKEN` and `NEXUS_APP_KEY`, use HTTPS, maintain a persistent private data volume, restrict access to the deployment account, and rotate credentials if they are exposed.
