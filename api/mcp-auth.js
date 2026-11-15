import handler from "./mcp.js";

export default async function authenticatedMcp(req, res) {
  const authorization = req.headers.authorization;
  if (typeof authorization !== "string" || !/^Bearer\s+\S+$/i.test(authorization)) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("WWW-Authenticate", 'Bearer resource_metadata="https://ad2market-chatgpt.vercel.app/.well-known/oauth-protected-resource/api/mcp-auth"');
    res.setHeader("Access-Control-Expose-Headers", "WWW-Authenticate");
    return res.status(401).json({ error: "authorization_required", message: "Conecta tu cuenta de AD2 MARKET para utilizar el carrito." });
  }
  return handler(req, res);
}
