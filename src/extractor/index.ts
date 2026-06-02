import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import type { CampoFormulario, DatosCrawler, FormularioDetectado } from "../analyzer/types";

type EvidenciaPublicaEntrada = {
  url: string;
  html: string;
  politicaTexto?: string;
};

const TEXTO_POLITICA = /(privacidad|protecci[oó]n de datos|datos personales|privacy)/i;
const TEXTO_COOKIES = /(cookie|cookies|aceptar|rechazar|configurar|personalizar)/i;
const CAMPOS_PERSONALES = /(nombre|apellido|email|correo|dni|documento|telefono|tel[eé]fono|direcci[oó]n)/i;

function resolverUrl(base: string, href?: string): string | undefined {
  if (!href) return undefined;
  try {
    return new URL(href, base).toString();
  } catch {
    return undefined;
  }
}

function textoNormalizado(texto: string): string {
  return texto.replace(/\s+/g, " ").trim();
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

function extraerCampos($: cheerio.CheerioAPI, formulario: Element): CampoFormulario[] {
  return $(formulario)
    .find("input, textarea, select")
    .toArray()
    .map((campo) => {
      const elemento = $(campo);
      const id = elemento.attr("id");
      const label = id ? textoNormalizado($(`label[for="${id}"]`).first().text()) : "";

      return {
        name: elemento.attr("name") ?? elemento.attr("id") ?? "",
        type: elemento.attr("type") ?? campo.tagName,
        placeholder: elemento.attr("placeholder") ?? "",
        label,
        required: elemento.is("[required], [aria-required='true']"),
      };
    });
}

function extraerFormularios($: cheerio.CheerioAPI, url: string): FormularioDetectado[] {
  return $("form")
    .toArray()
    .map((formulario) => {
      const form = $(formulario);
      const campos = extraerCampos($, formulario);
      const textoFormulario = textoNormalizado(form.text());
      const paginaOrigen = resolverUrl(url, form.attr("action")) ?? url;
      const checkboxes = form.find("input[type='checkbox']");
      const tieneCamposPersonales = campos.some((campo) =>
        CAMPOS_PERSONALES.test(`${campo.name} ${campo.placeholder} ${campo.label}`)
      );

      return {
        pagina_origen: paginaOrigen,
        checkbox_premarcado: checkboxes.toArray().some((checkbox) => $(checkbox).is("[checked]")),
        tiene_checkbox_consentimiento: checkboxes
          .toArray()
          .some((checkbox) => TEXTO_POLITICA.test(`${textoFormulario} ${$(checkbox).attr("name") ?? ""}`)),
        tiene_link_politica: form
          .find("a")
          .toArray()
          .some((link) => TEXTO_POLITICA.test(`${$(link).text()} ${$(link).attr("href") ?? ""}`)),
        campos: tieneCamposPersonales ? campos : campos,
      };
    });
}

function extraerBannerCookies($: cheerio.CheerioAPI) {
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
    cookies_banner: extraerBannerCookies($),
    html_completo: html,
  };
}
