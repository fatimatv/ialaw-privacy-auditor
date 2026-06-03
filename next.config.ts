import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @sparticuz/chromium incluye un binario nativo de Chromium comprimido
  // (.tar.br) que Next/Turbopack rompe si intenta bundlearlo. playwright-core
  // tambien depende de archivos del filesystem que no deben tocarse. Ambos
  // deben quedarse como externals para que las route functions de Vercel
  // puedan cargarlos en runtime.
  serverExternalPackages: ["@sparticuz/chromium", "playwright-core"],
};

export default nextConfig;
