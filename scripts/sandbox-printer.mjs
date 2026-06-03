#!/usr/bin/env node
// Script que corre dentro del Vercel Sandbox para imprimir HTML a PDF.
// El HTML se lee desde el archivo informe.html en la cwd del sandbox.
// El PDF resultante se escribe a salida.pdf.
//
// El route handler en el host (/reporte) hace:
//   1. crearHtmlReporte(resultado) -> HTML
//   2. writeFiles("informe.html", HTML)
//   3. runCommand("node", ["sandbox-printer.mjs"])
//   4. runCommand("base64", ["-w", "0", "salida.pdf"]) y decodifica

import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

async function main() {
  const html = await readFile("informe.html", "utf-8");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate:
        '<div style="width:100%;font-size:9px;color:#6F7072;padding:0 18mm;text-align:right;">Pagina <span class="pageNumber"></span> de <span class="totalPages"></span></div>',
      margin: {
        top: "10mm",
        right: "0mm",
        bottom: "14mm",
        left: "0mm",
      },
    });
    await writeFile("salida.pdf", pdf);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err?.stack ?? String(err));
  process.exit(1);
});
