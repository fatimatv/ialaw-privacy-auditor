import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import type {
  CampoFormulario,
  CheckboxFormulario,
  CookiesBannerDetectado,
  DatosCrawler,
  FormularioDetectado,
  PoliticaPrivacidadDetectada,
  TipoCheckbox,
} from "../analyzer/types";

type EvidenciaPublicaEntrada = {
  url: string;
  html: string;
  politicaTexto?: string;
};

const TEXTO_POLITICA = /(privacidad|protecci[oó]n de datos|datos personales|privacy)/i;
const TEXTO_COOKIES = /(cookie|cookies|aceptar|rechazar|configurar|personalizar)/i;

// Clasificadores de checkboxes por proposito. Se aplican al texto
// asociado al checkbox (label + name) para inferir si es para
// politica/terminos/marketing.
const PATRONES_POLITICA_CHECKBOX = /(privacidad|protecci[oó]n\s+de\s+datos|datos\s+personales|tratamiento\s+de\s+mis\s+datos|aviso\s+de\s+privacidad|privacy)/i;
const PATRONES_TERMINOS_CHECKBOX = /(t[eé]rminos|condiciones|condiciones\s+generales|terms)/i;
const PATRONES_MARKETING_CHECKBOX = /(marketing|publicidad|promoci[oó]n|ofertas|comunicaciones?\s+comerciales|comerciales?|newsletter|bolet[ií]n|recibir\s+(informaci[oó]n|ofertas|novedades|promociones|comunicaciones)|env[ií]o.*(comercial|promocional)|suscribi[a-zñ]+\s+a)/i;

// Senales de que un formulario solicita datos para finalidades
// adicionales (marketing/publicidad).
const CONTEXTO_MARKETING_FORM = /(marketing|publicidad|promoci[oó]n|ofertas|newsletter|bolet[ií]n|suscri[bp][a-zñ]+|recibir\s+(?:informaci[oó]n|ofertas|novedades|promociones)|env[ií]o.*(?:comercial|promocional))/i;

function clasificarTipoCheckbox(texto: string): TipoCheckbox {
  if (PATRONES_POLITICA_CHECKBOX.test(texto)) return "POLITICA_PRIVACIDAD";
  if (PATRONES_MARKETING_CHECKBOX.test(texto)) return "MARKETING_PUBLICIDAD";
  if (PATRONES_TERMINOS_CHECKBOX.test(texto)) return "TERMINOS_CONDICIONES";
  return "OTRO";
}

// Selectores conocidos de Consent Management Platforms. Capturan banners
// inyectados por OneTrust, Cookiebot, Didomi, CookieYes, Quantcast,
// TrustArc, TermsFeed e Iubenda, que la deteccion generica por id/class
// que contengan "cookie" muchas veces no encuentra.
const SELECTORES_CMP = [
  "#onetrust-banner-sdk",
  "#onetrust-consent-sdk",
  "#CybotCookiebotDialog",
  "#didomi-host",
  "#didomi-notice",
  ".didomi-popup-container",
  "#cky-consent",
  ".cky-consent-container",
  ".cky-modal",
  "#qc-cmp2-ui",
  ".qc-cmp2-container",
  "#truste-consent-track",
  "#consent_blackbar",
  ".termsfeed-com---nb-simple",
  "#iubenda-cs-banner",
  ".iubenda-cs-container",
  "#osano-cm-window",
  ".osano-cm-window",
];

const PATRONES_CMP_SCRIPT =
  /(onetrust\.com\/cdn|cookielaw\.org|cookiebot\.com\/uc|sdk\.privacy-center\.org|didomi\.io|cookieyes\.com|quantcast\.mgr|trustarc\.com|iubenda\.com\/iubenda_cs|osano\.com\/(cmp|web))/i;

function resolverUrl(base: string, href?: string): string | undefined {
  if (!href) return undefined;
  try {
    return new URL(href, base).toString();
  } catch {
    return undefined;
  }
}

function textoNormalizado(texto: string): string {
  // Stripping de chars invisibles que CMS (WordPress/Elementor) y
  // builders de texto insertan dentro de palabras y rompen los regex
  // de los detectores:
  // - U+00AD soft hyphen (hyphenation hints)
  // - U+200B zero-width space
  // - U+200C zero-width non-joiner
  // - U+200D zero-width joiner
  // - U+FEFF BOM / zero-width no-break space
  // Tambien normalizamos a NFC para que caracteres descompuestos
  // (e + acento combinado) queden como sus formas precompuestas.
  return texto
    .normalize("NFC")
    .replace(/[­​‌‍﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extraerPolitica($: cheerio.CheerioAPI, url: string, politicaTexto?: string) {
  const enlace = $("a")
    .toArray()
    .map((elemento) => {
      const link = $(elemento);
      return {
        href: resolverUrl(url, link.attr("href")),
        texto: textoNormalizado(link.text()),
      };
    })
    .find((link) => TEXTO_POLITICA.test(`${link.texto} ${link.href ?? ""}`));

  const texto = textoNormalizado(politicaTexto ?? "");

  return {
    encontrada: Boolean(enlace || texto),
    url: enlace?.href,
    texto,
  };
}

function buscarLabelPorFor($: cheerio.CheerioAPI, id: string): string {
  const label = $("label")
    .toArray()
    .find((el) => $(el).attr("for") === id);
  return label ? textoNormalizado($(label).text()) : "";
}

function extraerCampos($: cheerio.CheerioAPI, formulario: Element): CampoFormulario[] {
  return $(formulario)
    .find("input, textarea, select")
    .toArray()
    .map((campo) => {
      const elemento = $(campo);
      const id = elemento.attr("id");
      const label = id ? buscarLabelPorFor($, id) : "";

      return {
        name: elemento.attr("name") ?? elemento.attr("id") ?? "",
        type: elemento.attr("type") ?? campo.tagName,
        placeholder: elemento.attr("placeholder") ?? "",
        label,
        required: elemento.is("[required], [aria-required='true']"),
      };
    });
}

function extraerLabelCheckbox(
  $: cheerio.CheerioAPI,
  checkbox: Element,
): string {
  const el = $(checkbox);
  // 1) <label for="id">…</label> apuntando al checkbox.
  const id = el.attr("id");
  if (id) {
    const label = $("label")
      .toArray()
      .find((lab) => $(lab).attr("for") === id);
    if (label) {
      const t = textoNormalizado($(label).text());
      if (t.length > 0) return t;
    }
  }
  // 2) <label> ancestro envolvente.
  const labelEnvolvente = el.closest("label");
  if (labelEnvolvente.length > 0) {
    const t = textoNormalizado(labelEnvolvente.text());
    if (t.length > 0) return t;
  }
  // 3) Texto del contenedor inmediato (li, p, div pequeño).
  const padre = el.parent();
  if (padre.length > 0) {
    const t = textoNormalizado(padre.text());
    if (t.length > 0 && t.length < 600) return t;
  }
  return "";
}

function extraerCheckboxesDetallados(
  $: cheerio.CheerioAPI,
  formulario: Element,
): CheckboxFormulario[] {
  return $(formulario)
    .find("input[type='checkbox']")
    .toArray()
    .map((checkbox) => {
      const el = $(checkbox);
      const label = extraerLabelCheckbox($, checkbox);
      const name = el.attr("name") ?? "";
      const tipo = clasificarTipoCheckbox(`${label} ${name}`);
      return {
        label,
        premarcado: el.is("[checked]"),
        tipo,
      };
    });
}

function detectarContextoMarketing(
  paginaOrigen: string,
  textoFormulario: string,
  campos: CampoFormulario[],
): boolean {
  if (CONTEXTO_MARKETING_FORM.test(paginaOrigen)) return true;
  if (CONTEXTO_MARKETING_FORM.test(textoFormulario)) return true;
  for (const c of campos) {
    if (
      CONTEXTO_MARKETING_FORM.test(
        `${c.name ?? ""} ${c.placeholder ?? ""} ${c.label ?? ""}`,
      )
    ) {
      return true;
    }
  }
  return false;
}

function extraerFormularios($: cheerio.CheerioAPI, url: string): FormularioDetectado[] {
  return $("form")
    .toArray()
    .map((formulario) => {
      const form = $(formulario);
      const campos = extraerCampos($, formulario);
      const textoFormulario = textoNormalizado(form.text());
      const paginaOrigen = resolverUrl(url, form.attr("action")) ?? url;
      const checkboxes = extraerCheckboxesDetallados($, formulario);
      const contextoMarketing = detectarContextoMarketing(paginaOrigen, textoFormulario, campos);

      // Back-compat: estos dos booleanos se computan ahora desde la
      // lista detallada para que los detectores existentes (B.1..B.4)
      // sigan funcionando sin tocarlos.
      const tieneCheckboxConsentimiento = checkboxes.some(
        (c) => c.tipo === "POLITICA_PRIVACIDAD" || c.tipo === "TERMINOS_CONDICIONES",
      );
      // Si no hay match en el label pero el texto general del form
      // habla de politica de privacidad y hay algun checkbox, mantenemos
      // la heuristica original (texto del form menciona politica).
      const tieneCheckboxConsentimientoFallback = checkboxes.length > 0 && TEXTO_POLITICA.test(textoFormulario);

      return {
        pagina_origen: paginaOrigen,
        checkbox_premarcado: checkboxes.some((c) => c.premarcado),
        tiene_checkbox_consentimiento: tieneCheckboxConsentimiento || tieneCheckboxConsentimientoFallback,
        tiene_link_politica: form
          .find("a")
          .toArray()
          .some((link) => TEXTO_POLITICA.test(`${$(link).text()} ${$(link).attr("href") ?? ""}`)),
        campos,
        checkboxes,
        contexto_marketing: contextoMarketing,
      };
    });
}

function extraerBannerCookies($: cheerio.CheerioAPI, html: string): CookiesBannerDetectado {
  for (const selector of SELECTORES_CMP) {
    const elemento = $(selector).first();
    if (elemento.length === 0) continue;
    const texto = textoNormalizado(elemento.text());
    if (texto.length > 0 && texto.length < 1500) {
      return { encontrado: true, texto };
    }
    return {
      encontrado: true,
      texto: "Banner detectado por selector CMP conocido (sin texto visible — probablemente inyectado dinamicamente).",
    };
  }

  if (PATRONES_CMP_SCRIPT.test(html)) {
    return {
      encontrado: true,
      texto: "CMP detectada por script de terceros — el banner puede inyectarse despues de la carga inicial.",
    };
  }

  const candidatos = $("[id*='cookie' i], [class*='cookie' i], [aria-label*='cookie' i]")
    .toArray()
    .map((elemento) => textoNormalizado($(elemento).text()))
    .filter((texto) => texto.length > 0 && texto.length < 800 && TEXTO_COOKIES.test(texto));

  const texto = candidatos[0] ?? "";

  return {
    encontrado: Boolean(texto),
    texto,
  };
}

export function extraerEvidenciaPublica(entrada: EvidenciaPublicaEntrada): DatosCrawler {
  const html = entrada.html ?? "";
  const $ = cheerio.load(html);

  return {
    url_auditada: entrada.url,
    politica_privacidad: extraerPolitica($, entrada.url, entrada.politicaTexto),
    formularios: extraerFormularios($, entrada.url),
    cookies_banner: extraerBannerCookies($, html),
    html_completo: html,
  };
}

type CombinarEvidenciasEntrada = {
  url_auditada: string;
  paginas: DatosCrawler[];
  politica_texto?: string;
  politica_url?: string;
};

function claveDedupFormulario(f: FormularioDetectado): string {
  const nombres = f.campos.map((c) => c.name ?? "").sort().join(",");
  return `${f.pagina_origen}|${nombres}`;
}

export function combinarEvidencias(entrada: CombinarEvidenciasEntrada): DatosCrawler {
  const { url_auditada, paginas, politica_texto, politica_url } = entrada;

  const vistos = new Set<string>();
  const formularios: FormularioDetectado[] = [];
  for (const pagina of paginas) {
    for (const formulario of pagina.formularios) {
      const clave = claveDedupFormulario(formulario);
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      formularios.push(formulario);
    }
  }

  const cookies_banner: CookiesBannerDetectado =
    paginas.find((p) => p.cookies_banner.encontrado)?.cookies_banner ?? {
      encontrado: false,
      texto: "",
    };

  const html_completo = paginas.map((p) => p.html_completo ?? "").join("\n");

  const primeraConPolitica = paginas.find((p) => p.politica_privacidad?.url);
  const urlPolitica = politica_url ?? primeraConPolitica?.politica_privacidad?.url;
  const textoPolitica = textoNormalizado(politica_texto ?? "");

  const politica_privacidad: PoliticaPrivacidadDetectada = {
    encontrada: Boolean(urlPolitica || textoPolitica),
    url: urlPolitica,
    texto: textoPolitica,
  };

  return {
    url_auditada,
    politica_privacidad,
    formularios,
    cookies_banner,
    html_completo,
  };
}
