function visibleText(element) {
  return (element?.innerText || "").replace(/\s+/g, " ").trim();
}

function collectAlibabaPage() {
  const tables = [...document.querySelectorAll("table")].slice(0, 20).map((table, tableIndex) => {
    const rows = [...table.querySelectorAll("tr")].slice(0, 100).map((row) =>
      [...row.querySelectorAll("th,td")].slice(0, 30).map((cell) => visibleText(cell).slice(0, 500))
    ).filter((row) => row.some(Boolean));
    return { tableIndex, rows };
  }).filter((table) => table.rows.length);

  const headings = [...document.querySelectorAll("h1,h2,h3,[role='heading']")]
    .map(visibleText).filter(Boolean).slice(0, 100);

  const metrics = [...document.querySelectorAll("[class*='metric'],[class*='stat'],[class*='number'],[class*='value'],[class*='count']")]
    .map(visibleText).filter((value) => value && value.length < 300).slice(0, 150);

  return {
    source: "nexus-work-chatgpt-extension",
    connectorVersion: "1.0.0",
    capturedAt: new Date().toISOString(),
    url: location.href,
    title: document.title,
    pageType: location.hostname + location.pathname,
    language: document.documentElement.lang || "",
    headings,
    metrics: [...new Set(metrics)],
    tables,
    text: visibleText(document.body).slice(0, 180000)
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "NEXUS_CAPTURE_PAGE") return;
  try {
    sendResponse({ ok: true, data: collectAlibabaPage() });
  } catch (error) {
    sendResponse({ ok: false, error: error.message });
  }
  return true;
});
