import { NextResponse } from "next/server";
import { chromium } from "playwright";
import type { ResultadoAuditoria } from "@/analyzer/types";
import { crearHtmlReporte } from "@/report/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SolicitudReporte = {
  resultado?: ResultadoAuditoria;
};

function nombreArchivoReporte(resultado: ResultadoAuditoria): string {
  const host = resultado.sitio
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9.-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `reporte-ialaw-${host || "auditoria"}.pdf`;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as SolicitudReporte | null;

  if (!body?.resultado) {
    return NextResponse.json({ error: "No se recibio un resultado de auditoria valido." }, { status: 400 });
  }

  const html = crearHtmlReporte(body.resultado);
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

    const bodyPdf = new Uint8Array(pdf);

    return new NextResponse(bodyPdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${nombreArchivoReporte(body.resultado)}"`,
      },
    });
  } finally {
    await browser.close();
  }
}
