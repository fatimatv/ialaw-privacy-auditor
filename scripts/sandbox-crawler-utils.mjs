// Logica pura del crawler que vale la pena unit-testear sin tener que
// arrancar Playwright. Solo regexes + la heuristica para elegir el
// href de la politica de privacidad entre los anchors de una pagina.

export const TEXTO_POLITICA =
  /(privacidad|protecci[oó]n de datos|datos personales|privacy)/i;

export const DOMINIOS_SOCIALES =
  /(^|\.)(linkedin|facebook|fb|instagram|twitter|x|youtube|youtu|tiktok|pinterest|reddit|threads|mastodon|bsky|whatsapp|wa|t|telegram|medium|substack|nas\.io|github)\.[a-z.]+$/i;
export const PATH_POLITICA =
  /(privac|proteccion[-_]?datos|datos[-_]?personales|aviso[-_]?legal|legal\/|politica|terminos|terms|gdpr|lgpd)/i;

// www.iriartelaw.com y iriartelaw.com son el mismo sitio para todo
// efecto practico. Esta normalizacion las trata como equivalentes.
function hostnameNormalizado(hostname) {
  return hostname.replace(/^www\./i, "").toLowerCase();
}

function mismoRegistrado(a, b) {
  return hostnameNormalizado(a) === hostnameNormalizado(b);
}

// Ranking de paths same-site: el primer match no es buen ranking, hay
// que premiar paths que claramente nombran una politica (ej.
// /politica-de-privacidad/) y penalizar paths que sugieren herramienta
// o landing distinta del documento legal (ej. /autodiagnostico-...).
function puntajePath(pathname) {
  const p = pathname.toLowerCase();
  let s = 0;
  if (/politica[-_/]de[-_/]privacidad|politica[-_/]privacidad|privacy[-_/]policy|aviso[-_/]de[-_/]privacidad|aviso[-_/]privacidad/.test(p)) s += 100;
  if (/(^|\/)(privacidad|privacy)(\/|$)/.test(p)) s += 60;
  if (/privac/.test(p)) s += 30;
  if (/proteccion[-_]?datos|datos[-_]?personales/.test(p)) s += 10;
  if (/diagnostico|autodiagnostico|servicios|blog|noticias|landing|herramienta|checklist|calculadora|equipo|nosotros|contacto|trabaja|carreras?|press|prensa|portfolio/.test(p)) s -= 50;
  return s;
}

export function seleccionarHrefPolitica(enlaces, origen) {
  const candidatos = enlaces.filter((link) =>
    TEXTO_POLITICA.test(`${link.texto ?? ""} ${link.href ?? ""}`),
  );
  if (candidatos.length === 0) return undefined;

  // 1. Same-site (apex-equivalente). Entre varios, gana el de mayor
  //    puntaje de path. Si el mejor es negativo, seguimos a cross-origin.
  const mismoSitio = candidatos
    .map((link) => {
      if (!link.href) return null;
      let u;
      try { u = new URL(link.href); } catch { return null; }
      if (!mismoRegistrado(u.hostname, origen.hostname)) return null;
      return { href: link.href, score: puntajePath(u.pathname) };
    })
    .filter(Boolean);

  if (mismoSitio.length > 0) {
    mismoSitio.sort((a, b) => b.score - a.score);
    if (mismoSitio[0].score >= 0) return mismoSitio[0].href;
  }

  // 2. Cross-origin solo si no es red social y el path tiene tokens
  //    de politica. Cubre CDNs / docs.X.com legitimos.
  const crossOrigenValido = candidatos.find((link) => {
    if (!link.href) return false;
    try {
      const u = new URL(link.href);
      if (mismoRegistrado(u.hostname, origen.hostname)) return false;
      if (DOMINIOS_SOCIALES.test(u.hostname)) return false;
      return PATH_POLITICA.test(u.pathname);
    } catch {
      return false;
    }
  });
  return crossOrigenValido?.href;
}
