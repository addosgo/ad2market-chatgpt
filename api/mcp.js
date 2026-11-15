import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

export const config = { maxDuration: 20 };

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const contentLength = Number(req.headers["content-length"] || 0);
  if (contentLength > 16384 || JSON.stringify(req.body ?? {}).length > 16384) {
    return res.status(413).json({ error: "Request too large" });
  }
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
      limit: z.number().int().min(1).max(20).optional().describe("Número máximo de resultados")
    }
  }, async ({ query, city, limit = 10 }) => {
    const volumePattern = /\b(?:de\s+)?(\d+(?:[.,]\d+)?)\s*(?:litros?|l)\b/i;
    const volumeMatch = query.match(volumePattern);
    const requestedLiters = volumeMatch ? Number(volumeMatch[1].replace(",", ".")) : null;
    const normalizedQuery = volumeMatch
      ? query.replace(volumePattern, " ").replace(/\s+/g, " ").trim()
      : query;
    const fetchPrices = async (term) => {
      const url = new URL("/api/chatgpt/products", "https://ad2market.com");
      url.searchParams.set("q", term);
      url.searchParams.set("city", city);
      url.searchParams.set("limit", String(requestedLiters !== null ? 20 : limit));
      const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000), cache: "no-store" });
      if (!response.ok) throw new Error("Catalog API returned HTTP " + response.status);
      const data = await response.json();
      return Array.isArray(data.prices) ? data.prices : [];
    };
    try {
      let prices = await fetchPrices(query);
      if (prices.length === 0 && normalizedQuery !== query && normalizedQuery.length >= 2) {
        prices = await fetchPrices(normalizedQuery);
      }
      if (requestedLiters !== null) {
        prices = prices.filter(p => {
          const productVolume = String(p.storeProductName || "").match(/\b(\d+(?:[.,]\d+)?)\s*(?:litros?|l)\b/i);
          return productVolume && Number(productVolume[1].replace(",", ".")) === requestedLiters;
        });
      }
      prices = prices.slice(0, limit);
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

  server.registerTool("find_cheapest_product", {
    title: "Encontrar el producto más económico en AD2 MARKET",
    description: "Busca el precio registrado más bajo de un producto en una localidad, comprobando el formato solicitado. Es una consulta de solo lectura: NO añade productos al carrito ni confirma disponibilidad de reparto. Si hay empate, devuelve todas las opciones empatadas encontradas.",
    inputSchema: {
      query: z.string().trim().min(2).max(100).describe("Producto solicitado, incluida marca o formato cuando proceda"),
      city: z.string().trim().min(2).max(100).describe("Localidad del cliente"),
    }
  }, async ({ query, city }) => {
    const volumePattern = /\\b(?:de\\s+)?(\\d+(?:[.,]\\d+)?)\\s*(?:litros?|l)\\b/i;
    const volumeMatch = query.match(volumePattern);
    const requestedLiters = volumeMatch ? Number(volumeMatch[1].replace(",", ".")) : null;
    const normalizedQuery = volumeMatch ? query.replace(volumePattern, " ").replace(/\\s+/g, " ").trim() : query;
    const fetchPrices = async (term) => {
      const url = new URL("/api/chatgpt/products", "https://ad2market.com");
      url.searchParams.set("q", term);
      url.searchParams.set("city", city);
      url.searchParams.set("limit", "50");
      const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000), cache: "no-store" });
      if (!response.ok) throw new Error("Catalog API returned HTTP " + response.status);
      const data = await response.json();
      return Array.isArray(data.prices) ? data.prices : [];
    };
    try {
      let prices = await fetchPrices(query);
      if (!prices.length && normalizedQuery !== query && normalizedQuery.length >= 2) prices = await fetchPrices(normalizedQuery);
      if (requestedLiters !== null) prices = prices.filter(p => {
        const match = String(p.storeProductName || "").match(/\\b(\\d+(?:[.,]\\d+)?)\\s*(?:litros?|l)\\b/i);
        return match && Number(match[1].replace(",", ".")) === requestedLiters;
      });
      prices = prices.filter(p => Number.isFinite(Number(p.price)) && Number(p.price) > 0);
      prices.sort((a, b) => Number(a.price) - Number(b.price));
      const lowest = prices.length ? Number(prices[0].price) : null;
      const tied = lowest === null ? [] : prices.filter(p => Math.abs(Number(p.price) - lowest) < 0.00001);
      const format = p => ({
        productId: p.productId, productName: p.productName, storeProductName: p.storeProductName,
        brand: p.brand, supermarket: p.supermarket, location: p.location,
        price: p.price, verifiedAt: p.verifiedAt, productSlug: p.productSlug
      });
      return { content: [{ type: "text", text: JSON.stringify({
        service: "AD2 MARKET", city, query, currency: "EUR", checkedResults: prices.length,
        lowestPrice: lowest, cheapestOptions: tied.map(format),
        notice: "Comparación basada en precios registrados, sin reparto. La compra y el carrito requieren autenticación y confirmación del cliente. Si no hay resultados, no implica que el producto no exista."
      }) }] };
    } catch (error) {
      console.error("MCP cheapest product error:", error);
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
