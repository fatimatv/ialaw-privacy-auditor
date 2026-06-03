import type { DatosCrawler } from "../analyzer/types";
import { validarUrlPublica } from "./url-guard";

// En produccion (Vercel) lanzar Chromium directo en la function no
// funciona: Vercel Functions migraron a Amazon Linux 2023 y los binarios
// de @sparticuz/chromium fallan por libnss3.so faltante. Solucion:
// delegar el trabajo de Playwright a un Vercel Sandbox (microVM con
// Linux completo). En local seguimos usando Playwright directo.
const ES_SERVERLESS = Boolean(
  process.env.VERCEL ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.LAMBDA_TASK_ROOT,
);

const PAGINAS_POR_DEFECTO = ES_SERVERLESS ? 4 : 8;
const MAX_PAGINAS = Math.max(
  1,
  Math.min(20, Number(process.env.AUDITOR_MAX_PAGINAS ?? PAGINAS_POR_DEFECTO)),
);

export { validarUrlPublica } from "./url-guard";

export async function auditarSitioPublico(urlEntrada: string): Promise<DatosCrawler> {
  const url = await validarUrlPublica(urlEntrada);

  if (ES_SERVERLESS) {
    const { auditarEnSandbox } = await import("../lib/sandbox-crawler");
    return auditarEnSandbox(url, MAX_PAGINAS);
  }

  const { auditarLocal } = await import("./local");
  return auditarLocal(url, MAX_PAGINAS);
}

// Helpers exportados que el test del crawler todavia ejercita.
export { seleccionarHrefPolitica } from "./local";
