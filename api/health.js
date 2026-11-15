
export default function handler(req, res) {
  res.status(200).json({
    service: "AD2 MARKET ChatGPT MCP",
    status: "ok",
    version: "1.0.0"
  });
}
