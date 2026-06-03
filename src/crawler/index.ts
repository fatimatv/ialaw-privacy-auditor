import { chromium, type Browser, type Page } from "playwright";
import type { DatosCrawler } from "../analyzer/types";
import { combinarEvidencias, extraerEvidenciaPublica } from "../extractor";
import { validarUrlPublica } from "./url-guard";

const TEXTO_POLITICA = /(privacidad|protecci[oó]n de datos|datos personales|privacy)/i;

// Rutas que tipicamente alojan formularios de captacion de datos.
// Se priorizan para que el crawler las visite primero dentro del cupo.
const RUTAS_CON_FORMULARIOS =
  /(\/|^)(contact[oa]?|contact-us|register|registro|sign[-_]?up|signup|login|forgot[-_]?password|newsletter|suscri[bc][a-zñ]+|reserva[a-zñ]*|book[a-z]*|cotiza[a-zñ]*|presupuesto|solicitar|onboarding|alta|crear[-_]?cuenta)/i;

// URLs que no aportan a una auditoria de privacidad o no son navegables.
const URLS_NO_NAVEGABLES =
  /^(mailto|tel|javascript|sms|whatsapp):|\.(png|jpg|jpeg|gif|svg|webp|pdf|zip|rar|7z|ico|css|js|woff|woff2|ttf|otf|eot|mp4|mp3|webm|mov|avi)(\?|#|$)/i;

const MAX_PAGINAS = Math.max(
  1,
  Math.min(20, Number(process.env.AUDITOR_MAX_PAGINAS ?? 8)),
);
const TIMEOUT_NAV_MS = 30_000;
const TIMEOUT_NETWORKIDLE_MS = 8_000;
const TIMEOUT_SITEMAP_MS = 10_000;
const TIMEOUT_POLITICA_INNERTEXT_MS = 5_000;

export { validarUrlPublica } from "./url-guard";

type EnlaceCandidato = {
  href?: string;
  texto?: string;
};

export function seleccionarHrefPolitica(enlaces: EnlaceCandidato[]): string | undefined {
  return enlaces.find((link) =>
    TEXTO_POLITICA.test(`${link.texto ?? ""} ${link.href ?? ""}`),
  )?.href;
}

function normalizarUrl(href: string): string {
  try {
    const u = new URL(href);
    u.hash = "";
    return u.toString();
  } catch {
    return href;
  }
}

function mismaOrigen(candidata: string, origen: URL): boolean {
  try {
    return new URL(candidata).origin === origen.origin;
  } catch {
    return false;
  }
}

export function priorizarRutas(urls: string[]): string[] {
  const probables: string[] = [];
  const resto: string[] = [];
  for (const u of urls) {
    let path: string;
    try {
      path = new URL(u).pathname;
    } catch {
      continue;
    }
    if (RUTAS_CON_FORMULARIOS.test(path)) probables.push(u);
    else resto.push(u);
  }
  return [...probables, ...resto];
}

async function leerSitemap(browser: Browser, origen: URL): Promise<string[]> {
  const candidatos = [
    `${origen.origin}/sitemap.xml`,
    `${origen.origin}/sitemap_index.xml`,
  ];

  for (const sitemapUrl of candidatos) {
    try {
      await validarUrlPublica(sitemapUrl);
    } catch {
      continue;
    }
    const page = await browser.newPage();
    try {
      const response = await page
        .goto(sitemapUrl, { waitUntil: "domcontentloaded", timeout: TIMEOUT_SITEMAP_MS })
        .catch(() => null);
      if (!response || !response.ok()) continue;
      const xml = await response.text().catch(() => "");
      const urls = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1].trim());
      const filtradas = urls
        .map(normalizarUrl)
        .filter((u) => mismaOrigen(u, origen))
        .filter((u) => !URLS_NO_NAVEGABLES.test(u));
      if (filtradas.length > 0) return Array.from(new Set(filtradas));
    } finally {
      await page.close();
    }
  }

  return [];
}

async function extraerEnlacesInternos(page: Page, origen: URL): Promise<string[]> {
  const hrefs = await page
    .locator("a")
    .evaluateAll((links) =>
      links
        .map((link) => (link as HTMLAnchorElement).href)
        .filter((href): href is string => Boolean(href)),
    )
    .catch(() => [] as string[]);

  const conjunto = new Set<string>();
  for (const href of hrefs) {
    const norm = normalizarUrl(href);
    if (!mismaOrigen(norm, origen)) continue;
    if (URLS_NO_NAVEGABLES.test(norm)) continue;
    conjunto.add(norm);
  }
  return Array.from(conjunto);
}

async function abrirYExtraerHtml(browser: Browser, url: string): Promise<string | null> {
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: TIMEOUT_NAV_MS });
    await page
      .waitForLoadState("networkidle", { timeout: TIMEOUT_NETWORKIDLE_MS })
      .catch(() => undefined);
    return await page.content();
  } catch {
    return null;
  } finally {
    await page.close();
  }
}

async function obtenerEnlacesYHtmlHome(
  browser: Browser,
  url: string,
  origen: URL,
): Promise<{ html: string; enlaces: string[]; politicaHref?: string }> {
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: TIMEOUT_NAV_MS });
    await page
      .waitForLoadState("networkidle", { timeout: TIMEOUT_NETWORKIDLE_MS })
      .catch(() => undefined);
    const html = await page.content();
    const enlaces = await extraerEnlacesInternos(page, origen);
    const politicaHref = await page
      .locator("a")
      .evaluateAll((links) =>
        links.map((link) => ({
          href: (link as HTMLAnchorElement).href,
          texto: link.textContent ?? "",
        })),
      )
      .then((links) => seleccionarHrefPolitica(links))
      .catch(() => undefined);
    return { html, enlaces, politicaHref };
  } finally {
    await page.close();
  }
}

async function obtenerTextoPolitica(browser: Browser, urlPolitica: string): Promise<string> {
  const page = await browser.newPage();
  try {
    await page
      .goto(urlPolitica, { waitUntil: "domcontentloaded", timeout: TIMEOUT_NAV_MS })
      .catch(() => undefined);
    return await page
      .locator("body")
      .innerText({ timeout: TIMEOUT_POLITICA_INNERTEXT_MS })
      .catch(() => "");
  } finally {
    await page.close();
  }
}

export async function auditarSitioPublico(urlEntrada: string): Promise<DatosCrawler> {
  const url = await validarUrlPublica(urlEntrada);
  const origen = new URL(url);
  const browser = await chromium.launch({ headless: true });

  try {
    const { html: htmlHome, enlaces, politicaHref } = await obtenerEnlacesYHtmlHome(
      browser,
      url,
      origen,
    );

    const sitemap = await leerSitemap(browser, origen);
    const candidatas = sitemap.length > 0 ? sitemap : enlaces;
    const urlNormalizada = normalizarUrl(url);
    const rutasOrdenadas = priorizarRutas(
      Array.from(new Set(candidatas.map(normalizarUrl))).filter((u) => u !== urlNormalizada),
    );
    const rutasAVisitar = rutasOrdenadas.slice(0, MAX_PAGINAS - 1);

    const paginas: DatosCrawler[] = [];
    paginas.push(extraerEvidenciaPublica({ url, html: htmlHome }));

    for (const ruta of rutasAVisitar) {
      try {
        await validarUrlPublica(ruta);
      } catch {
        continue;
      }
      const html = await abrirYExtraerHtml(browser, ruta);
      if (!html) continue;
      paginas.push(extraerEvidenciaPublica({ url: ruta, html }));
    }

    let politicaTexto = "";
    let politicaUrlValida: string | undefined;
    if (politicaHref) {
      try {
        await validarUrlPublica(politicaHref);
        politicaUrlValida = politicaHref;
        politicaTexto = await obtenerTextoPolitica(browser, politicaHref);
      } catch {
        politicaTexto = "";
      }
    }

    return combinarEvidencias({
      url_auditada: url,
      paginas,
      politica_texto: politicaTexto,
      politica_url: politicaUrlValida,
    });
  } finally {
    await browser.close();
  }
}
