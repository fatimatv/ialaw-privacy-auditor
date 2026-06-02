import { chromium } from "playwright";
import { extraerEvidenciaPublica } from "../extractor";

const TEXTO_POLITICA = /(privacidad|protecci[oó]n de datos|datos personales|privacy)/i;

type EnlaceCandidato = {
  href?: string;
  texto?: string;
};

export function seleccionarHrefPolitica(enlaces: EnlaceCandidato[]): string | undefined {
  return enlaces.find((link) => TEXTO_POLITICA.test(`${link.texto ?? ""} ${link.href ?? ""}`))?.href;
}

function validarUrlPublica(url: string): string {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Solo se admiten URLs http o https.");
  }
  return parsed.toString();
}

export async function auditarSitioPublico(urlEntrada: string) {
  const url = validarUrlPublica(urlEntrada);
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => undefined);

    const html = await page.content();
    const politicaHref = await page
      .locator("a")
      .evaluateAll((links) => {
        return links.map((link) => ({
          href: (link as HTMLAnchorElement).href,
          texto: link.textContent ?? "",
        }));
      })
      .then((links) => seleccionarHrefPolitica(links))
      .catch(() => undefined);

    let politicaTexto = "";
    if (politicaHref) {
      const policyPage = await browser.newPage();
      await policyPage.goto(politicaHref, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => undefined);
      politicaTexto = await policyPage.locator("body").innerText({ timeout: 5000 }).catch(() => "");
      await policyPage.close();
    }

    return extraerEvidenciaPublica({ url, html, politicaTexto });
  } finally {
    await browser.close();
  }
}
