#!/usr/bin/env node
// Script standalone que corre DENTRO de un Vercel Sandbox.
// Recibe URL + cap de paginas via argv, hace multi-page crawl con
// Playwright y emite JSON en stdout con todas las paginas visitadas
// y el texto de la politica de privacidad.
//
// El route handler en el host (/auditar) usa este JSON + el extractor
// (cheerio) + el analyzer para producir el ResultadoAuditoria final.
// Aqui solo se hace lo que requiere un browser real.

import { chromium } from "playwright";

const TEXTO_POLITICA =
  /(privacidad|protecci[oó]n de datos|datos personales|privacy)/i;

const RUTAS_CON_FORMULARIOS =
  /(\/|^)(contact[oa]?|contact-us|register|registro|sign[-_]?up|signup|login|forgot[-_]?password|newsletter|suscri[bc][a-zñ]+|reserva[a-zñ]*|book[a-z]*|cotiza[a-zñ]*|presupuesto|solicitar|onboarding|alta|crear[-_]?cuenta)/i;

const URLS_NO_NAVEGABLES =
  /^(mailto|tel|javascript|sms|whatsapp):|\.(png|jpg|jpeg|gif|svg|webp|pdf|zip|rar|7z|ico|css|js|woff|woff2|ttf|otf|eot|mp4|mp3|webm|mov|avi)(\?|#|$)/i;

const TIMEOUT_NAV_MS = 30_000;
const TIMEOUT_NETWORKIDLE_MS = 8_000;
const TIMEOUT_SITEMAP_MS = 10_000;
const TIMEOUT_POLITICA_MS = 5_000;

function normalizarUrl(href) {
  try {
    const u = new URL(href);
    u.hash = "";
    return u.toString();
  } catch {
    return href;
  }
}

function mismaOrigen(candidata, origen) {
  try {
    return new URL(candidata).origin === origen.origin;
  } catch {
    return false;
  }
}

function priorizarRutas(urls) {
  const probables = [];
  const resto = [];
  for (const u of urls) {
    let path;
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

function seleccionarHrefPolitica(enlaces) {
  return enlaces.find((link) =>
    TEXTO_POLITICA.test(`${link.texto ?? ""} ${link.href ?? ""}`),
  )?.href;
}

async function leerSitemap(browser, origen) {
  const candidatos = [
    `${origen.origin}/sitemap.xml`,
    `${origen.origin}/sitemap_index.xml`,
  ];
  for (const sitemapUrl of candidatos) {
    const page = await browser.newPage();
    try {
      const response = await page
        .goto(sitemapUrl, {
          waitUntil: "domcontentloaded",
          timeout: TIMEOUT_SITEMAP_MS,
        })
        .catch(() => null);
      if (!response || !response.ok()) continue;
      const xml = await response.text().catch(() => "");
      const urls = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) =>
        m[1].trim(),
      );
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

async function extraerEnlacesInternos(page, origen) {
  const hrefs = await page
    .locator("a")
    .evaluateAll((links) =>
      links.map((link) => link.href).filter(Boolean),
    )
    .catch(() => []);
  const conjunto = new Set();
  for (const href of hrefs) {
    const norm = normalizarUrl(href);
    if (!mismaOrigen(norm, origen)) continue;
    if (URLS_NO_NAVEGABLES.test(norm)) continue;
    conjunto.add(norm);
  }
  return Array.from(conjunto);
}

async function abrirYExtraerHtml(browser, url) {
  const page = await browser.newPage();
  try {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: TIMEOUT_NAV_MS,
    });
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

async function obtenerEnlacesYHtmlHome(browser, url, origen) {
  const page = await browser.newPage();
  try {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: TIMEOUT_NAV_MS,
    });
    await page
      .waitForLoadState("networkidle", { timeout: TIMEOUT_NETWORKIDLE_MS })
      .catch(() => undefined);
    const html = await page.content();
    const enlaces = await extraerEnlacesInternos(page, origen);
    const politicaHref = await page
      .locator("a")
      .evaluateAll((links) =>
        links.map((link) => ({
          href: link.href,
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

async function obtenerTextoPolitica(browser, urlPolitica) {
  const page = await browser.newPage();
  try {
    await page
      .goto(urlPolitica, {
        waitUntil: "domcontentloaded",
        timeout: TIMEOUT_NAV_MS,
      })
      .catch(() => undefined);
    return await page
      .locator("body")
      .innerText({ timeout: TIMEOUT_POLITICA_MS })
      .catch(() => "");
  } finally {
    await page.close();
  }
}

async function main() {
  const url = process.argv[2];
  const maxPaginas = Math.max(1, Math.min(20, Number(process.argv[3] ?? 4)));

  if (!url) {
    console.error("Uso: node sandbox-crawler.mjs <url> [maxPaginas]");
    process.exit(2);
  }

  const origen = new URL(url);
  const browser = await chromium.launch({ headless: true });

  try {
    const { html: htmlHome, enlaces, politicaHref } =
      await obtenerEnlacesYHtmlHome(browser, url, origen);

    const sitemap = await leerSitemap(browser, origen);
    const candidatas = sitemap.length > 0 ? sitemap : enlaces;
    const urlNormalizada = normalizarUrl(url);
    const rutasOrdenadas = priorizarRutas(
      Array.from(new Set(candidatas.map(normalizarUrl))).filter(
        (u) => u !== urlNormalizada,
      ),
    );
    const rutasAVisitar = rutasOrdenadas.slice(0, maxPaginas - 1);

    const paginas = [{ url, html: htmlHome }];
    for (const ruta of rutasAVisitar) {
      const html = await abrirYExtraerHtml(browser, ruta);
      if (!html) continue;
      paginas.push({ url: ruta, html });
    }

    let politicaTexto = "";
    let politicaUrl;
    if (politicaHref) {
      politicaUrl = politicaHref;
      politicaTexto = await obtenerTextoPolitica(browser, politicaHref);
    }

    process.stdout.write(
      JSON.stringify({
        url_auditada: url,
        paginas,
        politica_url: politicaUrl,
        politica_texto: politicaTexto,
      }),
    );
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err?.stack ?? String(err));
  process.exit(1);
});
