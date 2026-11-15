export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  const base = "https://ad2market-chatgpt.vercel.app/api/mcp";
  const headers = { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" };
  const send = async (id, method, params) => {
    const r = await fetch(base, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }), signal: AbortSignal.timeout(12000) });
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  try {
    const init = await send(1, "initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "ad2-market-selftest", version: "1.0" } });
    const tools = await send(2, "tools/list", {});
    const search = await send(3, "tools/call", { name: "search_products", arguments: { query: "leche", city: "Málaga", limit: 3 } });
    return res.status(200).json({ initialize: { status: init.status, protocol: init.data?.result?.protocolVersion, error: init.data?.error }, tools: { status: tools.status, names: tools.data?.result?.tools?.map(x => x.name), error: tools.data?.error }, search: { status: search.status, isError: search.data?.result?.isError, sample: search.data?.result?.content?.[0]?.text?.slice(0,500), error: search.data?.error } });
  } catch (e) { return res.status(500).json({ error: String(e) }); }
}
