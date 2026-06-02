import { chromium } from "playwright";
import { extraerEvidenciaPublica } from "../extractor";
import { validarUrlPublica } from "./url-guard";

const TEXTO_POLITICA = /(privacidad|protecci[oó]n de datos|datos personales|privacy)/i;

type EnlaceCandidato = {
  href?: string;
  texto?: string;
};

export { validarUrlPublica } from "./url-guard";

export function seleccionarHrefPolitica(enlaces: EnlaceCandidato[]): string | undefined {
  return enlaces.find((link) => TEXTO_POLITICA.test(`${link.texto ?? ""} ${link.href ?? ""}`))?.href;
}

export async function auditarSitioPublico(urlEntrada: string) {
  const url = await validarUrlPublica(urlEntrada);
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
      try {
        await validarUrlPublica(politicaHref);
        const policyPage = await browser.newPage();
        await policyPage.goto(politicaHref, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => undefined);
        politicaTexto = await policyPage.locator("body").innerText({ timeout: 5000 }).catch(() => "");
        await policyPage.close();
      } catch {
        politicaTexto = "";
      }
    }

    return extraerEvidenciaPublica({ url, html, politicaTexto });
  } finally {
    await browser.close();
  }
}
