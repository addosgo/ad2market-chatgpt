export default function protectedResource(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=300");
  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });
  return res.status(200).json({
    resource: "https://ad2market-chatgpt.vercel.app/api/mcp-auth",
    authorization_servers: ["https://ad2market.com/api/auth"],
    scopes_supported: ["openid", "cart:read", "cart:write"],
    bearer_methods_supported: ["header"]
  });
}
