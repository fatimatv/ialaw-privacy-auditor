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
    // Patron canonico de sparticuz para playwright-core:
    // - setHeadlessMode "shell" alinea el binario chrome-headless-shell
    //   con el modo de Playwright. Sparticuz desde v117 shipea ese binario
    //   en vez del Chromium completo.
    // - setGraphicsMode false evita extraer swiftshader (libreria de
    //   software rendering) que pesa mucho y no necesitamos para PDF/HTML.
    // - executablePath() extrae chromium + libs (libnss3, etc) a /tmp y
    //   setea LD_LIBRARY_PATH. Debe llamarse despues de los setters.
    sparticuz.setHeadlessMode = "shell";
    sparticuz.setGraphicsMode = false;
    const executablePath = await sparticuz.executablePath();
    return playwrightChromium.launch({
      args: sparticuz.args,
      executablePath,
      headless: sparticuz.headless,
    });
  }
  return playwrightChromium.launch({ headless: true });
}

export type { Browser } from "playwright-core";
