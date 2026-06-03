import type { Browser } from "playwright-core";
import { chromium as playwrightChromium } from "playwright-core";

// Vercel pone VERCEL=1, AWS Lambda expone AWS_LAMBDA_FUNCTION_NAME y
// LAMBDA_TASK_ROOT. Cualquiera de ellos significa que no tenemos un
// Chromium del sistema y debemos usar el binario que provee
// @sparticuz/chromium (pensado especificamente para serverless).
const ES_SERVERLESS = Boolean(
  process.env.VERCEL ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.LAMBDA_TASK_ROOT,
);

export async function lanzarChromium(): Promise<Browser> {
  if (ES_SERVERLESS) {
    const sparticuz = (await import("@sparticuz/chromium")).default;
    return playwrightChromium.launch({
      args: sparticuz.args,
      executablePath: await sparticuz.executablePath(),
      headless: true,
    });
  }
  return playwrightChromium.launch({ headless: true });
}

export type { Browser } from "playwright-core";
