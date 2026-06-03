import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import type { ResultadoAuditoria } from "@/analyzer/types";
import { limitadorReporte, obtenerIdentificadorCliente } from "@/lib/rate-limit";
import { crearHtmlReporte, type LogosReporte } from "@/report/pdf";

const ES_SERVERLESS = Boolean(
  process.env.VERCEL ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.LAMBDA_TASK_ROOT,
);

function logoComoDataUri(nombreArchivo: string): string | undefined {
  try {
    const ruta = join(process.cwd(), "public", nombreArchivo);
    if (!existsSync(ruta)) return undefined;
    const contenido = readFileSync(ruta);
    return `data:image/svg+xml;base64,${contenido.toString("base64")}`;
  } catch {
    return undefined;
  }
}

function cargarLogos(): LogosReporte {
  return {
    vertical: logoComoDataUri("ialaw-logo-vertical.svg"),
    horizontal: logoComoDataUri("ialaw-logo-horizontal.svg"),
  };
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

async function imprimirLocalmente(html: string): Promise<Buffer> {
  const { chromium } = await import("playwright");
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
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

export async function POST(request: Request) {
  const identificador = obtenerIdentificadorCliente(request.headers);
  const limite = limitadorReporte.check(identificador);
  if (!limite.allowed) {
    return NextResponse.json(
      { error: "Has alcanzado el limite de descargas de reporte. Intenta nuevamente mas tarde." },
      {
        status: 429,
        headers: { "Retry-After": String(limite.retryAfterSeconds ?? 60) },
      },
    );
  }

  const body = (await request.json().catch(() => null)) as SolicitudReporte | null;

  if (!body?.resultado) {
    return NextResponse.json({ error: "No se recibio un resultado de auditoria valido." }, { status: 400 });
  }

  const html = crearHtmlReporte(body.resultado, cargarLogos());

  let pdf: Buffer;
  if (ES_SERVERLESS) {
    const { imprimirPdfEnSandbox } = await import("@/lib/sandbox-printer");
    pdf = await imprimirPdfEnSandbox(html);
  } else {
    pdf = await imprimirLocalmente(html);
  }

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nombreArchivoReporte(body.resultado)}"`,
    },
  });
}
