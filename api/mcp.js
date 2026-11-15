import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

export const config = { maxDuration: 20 };

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use MCP POST requests" });
  }

  const server = new McpServer({ name: "ad2-market", version: "1.0.0" });
  server.registerTool("search_products", {
    title: "Buscar productos en AD2 MARKET",
    description: "Busca precios registrados de productos en supermercados de una localidad española. Devuelve establecimientos, precios y fecha de verificación. No inventes precios ni disponibilidad.",
    inputSchema: {
      query: z.string().trim().min(2).max(100).describe("Producto que desea buscar el cliente"),
      city: z.string().trim().min(2).max(100).describe("Localidad española, por ejemplo Málaga"),
      limit: z.number().int().min(1).max(30).optional().describe("Número máximo de resultados")
    }
  }, async ({ query, city, limit = 20 }) => {
    const url = new URL("/api/chatgpt/products", "https://ad2market.com");
    url.searchParams.set("q", query);
    url.searchParams.set("city", city);
    url.searchParams.set("limit", String(limit));
    try {
      const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000), cache: "no-store" });
      if (!response.ok) throw new Error("Catalog API returned HTTP " + response.status);
      const data = await response.json();
      const prices = Array.isArray(data.prices) ? data.prices : [];
      const result = {
        service: "AD2 MARKET", query, city, currency: "EUR",
        count: prices.length,
        prices: prices.map(p => ({
          productName: p.productName, storeProductName: p.storeProductName,
          brand: p.brand, supermarket: p.supermarket, location: p.location,
          price: p.price, regularPrice: p.regularPrice,
          verifiedAt: p.verifiedAt, source: p.source, productSlug: p.productSlug
        })),
        notice: "Precios registrados, sujetos a cambios. El reparto no está incluido. Comprueba el producto y formato antes de comparar."
      };
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    } catch (error) {
      console.error("MCP catalog error:", error);
      return { isError: true, content: [{ type: "text", text: "No se pudo consultar el catálogo de AD2 MARKET en este momento." }] };
    }
  });

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP handler error:", error);
    if (!res.headersSent) res.status(500).json({ error: "Internal MCP error" });
  } finally {
    await server.close();
  }
}
