import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @sparticuz/chromium incluye un binario nativo de Chromium comprimido
  // (.tar.br) que Next/Turbopack rompe si intenta bundlearlo. playwright-core
  // tambien depende de archivos del filesystem que no deben tocarse. Ambos
  // deben quedarse como externals para que las route functions de Vercel
  // puedan cargarlos en runtime.
  serverExternalPackages: ["@sparticuz/chromium", "playwright-core"],

  // playwright-core hace require('../browsers.json') dinamicamente; sparticuz
  // necesita su bin/ con el .tar.br del Chromium. Sin esto, Vercel los excluye
  // del bundle de la function por file tracing y vemos
  // "Cannot find module '/var/task/node_modules/playwright-core/browsers.json'"
  // al primer launch.
  outputFileTracingIncludes: {
    "/auditar": [
      "./node_modules/playwright-core/**/*",
      "./node_modules/@sparticuz/chromium/**/*",
    ],
    "/reporte": [
      "./node_modules/playwright-core/**/*",
      "./node_modules/@sparticuz/chromium/**/*",
    ],
  },
};

export default nextConfig;
