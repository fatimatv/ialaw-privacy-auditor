import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // En produccion, /auditar y /reporte delegan el trabajo de Playwright
  // a un sandbox de Vercel (@vercel/sandbox). Los scripts que corren
  // dentro del sandbox viven en scripts/ y se leen por readFileSync
  // desde el route handler. Hay que decirle al file tracing de Vercel
  // que los incluya en el bundle de la function.
  outputFileTracingIncludes: {
    "/auditar": ["./scripts/sandbox-crawler.mjs"],
    "/reporte": ["./scripts/sandbox-printer.mjs"],
  },
};

export default nextConfig;
