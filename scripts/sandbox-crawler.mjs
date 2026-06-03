#!/usr/bin/env node
// Script standalone que corre DENTRO de un Vercel Sandbox.
// Recibe URL + cap de paginas via argv, hace multi-page crawl con
// Playwright y emite JSON en stdout con todas las paginas visitadas
// y el texto de la politica de privacidad.
//
// El route handler en el host (/auditar) usa este JSON + el extractor
// (cheerio) + el analyzer para producir el ResultadoAuditoria final.
// Aqui solo se hace lo que requiere un browser real.

import { promises as dns } from "node:dns";
import net from "node:net";
import { chromium } from "playwright";

const TEXTO_POLITICA =
  /(privacidad|protecci[oó]n de datos|datos personales|privacy)/i;

// Defensa en profundidad SSRF: el route handler valida la URL inicial,
// pero dentro del sandbox vamos a navegar a URLs descubiertas (sitemap,
// links internos, politica). Cada una debe pasar la misma validacion:
// no http(s) -> rechazar; hostnames internos -> rechazar; resolver DNS
// y rechazar si cualquier registro apunta a IPv4 privada/reservada o
// IPv6 loopback/link-local/ULA. Esta logica es un port directo de
// src/crawler/url-guard.ts.
const HOSTNAMES_BLOQUEADOS =
  /^(localhost|.+\.localhost|.+\.local|.+\.internal|metadata\.google\.internal)$/i;

function ipv4PrivadaOReservada(ip) {
  if (!net.isIPv4(ip)) return false;
  const [a, b] = ip.split(".").map(Number);
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function ipv6PrivadaOReservada(ip) {
  if (!net.isIPv6(ip)) return false;
  const norm = ip.toLowerCase();
  if (norm === "::1" || norm === "::") return true;
  if (/^f[cd][0-9a-f]{2}:/.test(norm)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(norm)) return true;
  const v4Mapped = norm.match(/^::ffff:([0-9.]+)$/);
  if (v4Mapped) return ipv4PrivadaOReservada(v4Mapped[1]);
  return false;
}

function ipPrivadaOReservada(ip) {
  return ipv4PrivadaOReservada(ip) || ipv6PrivadaOReservada(ip);
}

async function validarUrlPublica(urlEntrada) {
  let parsed;
  try {
    parsed = new URL(urlEntrada);
  } catch {
    throw new Error("URL inválida.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Solo se admiten URLs http o https.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("No se admiten URLs con credenciales embebidas.");
  }
  const hostname = parsed.hostname.toLowerCase();
  if (!hostname) throw new Error("La URL no incluye un host.");
  if (HOSTNAMES_BLOQUEADOS.test(hostname)) {
    throw new Error("No se permiten hostnames internos o de loopback.");
  }
  if (net.isIP(hostname)) {
    if (ipPrivadaOReservada(hostname)) {
      throw new Error("La URL apunta a una IP interna o reservada.");
    }
    return parsed.toString();
  }
  let registros;
  try {
    registros = await dns.lookup(hostname, { all: true });
  } catch {
    throw new Error("No se pudo resolver el dominio.");
  }
  if (registros.length === 0) throw new Error("No se pudo resolver el dominio.");
  for (const { address } of registros) {
    if (ipPrivadaOReservada(address)) {
      throw new Error("La URL resuelve a una IP interna o reservada.");
    }
  }
  return parsed.toString();
}

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

function seleccionarHrefPolitica(enlaces, origen) {
  const candidatos = enlaces.filter((link) =>
    TEXTO_POLITICA.test(`${link.texto ?? ""} ${link.href ?? ""}`),
  );
  if (candidatos.length === 0) return undefined;
  // Preferir same-origin: muchos sitios tienen links a politicas de
  // terceros (Google reCAPTCHA, Cloudflare, etc) que matchean antes
  // que la politica del propio sitio.
  const mismoOrigen = candidatos.find((link) => {
    if (!link.href || !origen) return false;
    try {
      return new URL(link.href).origin === origen.origin;
    } catch {
      return false;
    }
  });
  return (mismoOrigen ?? candidatos[0])?.href;
}

async function leerSitemap(browser, origen) {
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
    const page = await context.newPage();
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
  const page = await context.newPage();
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
  const page = await context.newPage();
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
      .then((links) => seleccionarHrefPolitica(links, origen))
      .catch(() => undefined);
    return { html, enlaces, politicaHref };
  } finally {
    await page.close();
  }
}

async function obtenerTextoPolitica(browser, urlPolitica) {
  const page = await context.newPage();
  try {
    // waitUntil: "load" en vez de domcontentloaded para esperar todos
    // los resources (Elementor/WordPress carga contenido en stages).
    await page
      .goto(urlPolitica, {
        waitUntil: "load",
        timeout: TIMEOUT_NAV_MS,
      })
      .catch(() => undefined);
    await page
      .waitForLoadState("networkidle", { timeout: TIMEOUT_NETWORKIDLE_MS })
      .catch(() => undefined);

    // innerText devuelve solo texto visible; si por algun motivo viene
    // demasiado corto (lazy-loading, accordion colapsado, etc.) caemos
    // a textContent que retorna TODO el texto del DOM, incluso oculto.
    const innerText = await page
      .locator("body")
      .innerText({ timeout: 15_000 })
      .catch(() => "");
    if (innerText && innerText.length >= 800) return innerText;

    const textContent = await page
      .locator("body")
      .evaluate((el) => el.textContent ?? "")
      .catch(() => "");
    return textContent.length > innerText.length ? textContent : innerText;
  } finally {
    await page.close();
  }
}

// UA realista de Chrome estable. Sin esto, muchos sitios con anti-bot
// (Akamai, Cloudflare, Imperva, Datadome) detectan el "HeadlessChrome"
// de Playwright y sirven HTML vacio o un captcha. Es la primer linea de
// defensa que vence; sitios mas duros siguen filtrando.
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// El contexto se crea en main() y se setea aca para que las helpers
// (leerSitemap, abrirYExtraerHtml, etc.) lo puedan usar sin necesidad
// de pasarlo como parametro en cada llamada.
let context;

async function nuevoContexto(browser) {
  const ctx = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1920, height: 1080 },
    locale: "es-PE",
    timezoneId: "America/Lima",
    extraHTTPHeaders: {
      "Accept-Language": "es-PE,es;q=0.9,en;q=0.8",
    },
  });
  // Quitar navigator.webdriver=true, el flag mas obvio de headless.
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  return ctx;
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
  context = await nuevoContexto(browser);

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
      try {
        await validarUrlPublica(ruta);
      } catch {
        continue;
      }
      const html = await abrirYExtraerHtml(browser, ruta);
      if (!html) continue;
      paginas.push({ url: ruta, html });
    }

    let politicaTexto = "";
    let politicaUrl;
    if (politicaHref) {
      try {
        await validarUrlPublica(politicaHref);
        politicaUrl = politicaHref;
        politicaTexto = await obtenerTextoPolitica(browser, politicaHref);
      } catch {
        // politicaHref invalida o apunta a una IP interna: la dejamos
        // afuera. El analyzer fallara con "no se encontro politica" que
        // es el comportamiento correcto.
      }
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
