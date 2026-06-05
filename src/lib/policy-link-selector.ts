// Heuristica para identificar el href "más probable" de la política de
// privacidad entre los anchors de una página. Misma logica que
// scripts/sandbox-crawler-utils.mjs (que vive en .mjs porque corre dentro
// del Vercel Sandbox sin acceso al bundle del host); aqui esta tipada en
// TypeScript para que el extractor cheerio del host la pueda usar
// directamente. Cualquier cambio aqui debe replicarse en el .mjs y
// viceversa — ambos archivos tienen tests de regresion.

export const TEXTO_POLITICA =
  /(privacidad|protecci[oó]n de datos|datos personales|privacy)/i;

const DOMINIOS_SOCIALES =
  /(^|\.)(linkedin|facebook|fb|instagram|twitter|x|youtube|youtu|tiktok|pinterest|reddit|threads|mastodon|bsky|whatsapp|wa|t|telegram|medium|substack|nas\.io|github)\.[a-z.]+$/i;

const PATH_POLITICA =
  /(privac|proteccion[-_]?datos|datos[-_]?personales|aviso[-_]?legal|legal\/|politica|terminos|terms|gdpr|lgpd)/i;

export type EnlaceCandidato = {
  href?: string;
  texto?: string;
};

// www.iriartelaw.com y iriartelaw.com son el mismo sitio para todo
// efecto practico. Si la auditoria es de iriartelaw.com y la politica
// vive en www.iriartelaw.com/politica-de-privacidad/, esa politica es
// la del sitio — no un tercero. Esta normalizacion las trata como
// equivalentes.
function hostnameNormalizado(hostname: string): string {
  return hostname.replace(/^www\./i, "").toLowerCase();
}

function mismoRegistrado(a: string, b: string): boolean {
  return hostnameNormalizado(a) === hostnameNormalizado(b);
}

// Ranking de paths: cuando hay varios candidatos del mismo sitio, no
// alcanza con quedarse con el primero. iriartelaw.com tiene tanto
// /politica-de-privacidad/ como /autodiagnostico-proteccion-datos-
// personales/ (una herramienta diagnostica). El segundo NO es la
// politica; el primero si. El ranking premia los paths que claramente
// nombran una politica y penaliza los que sugieren "otra cosa que
// menciona datos personales".
function puntajePath(pathname: string): number {
  const p = pathname.toLowerCase();
  let s = 0;
  // Frases compuestas tipicas de politica:
  if (/politica[-_/]de[-_/]privacidad|politica[-_/]privacidad|privacy[-_/]policy|aviso[-_/]de[-_/]privacidad|aviso[-_/]privacidad/.test(p)) s += 100;
  // /privacidad/ o /privacy/ como segmento propio:
  if (/(^|\/)(privacidad|privacy)(\/|$)/.test(p)) s += 60;
  // Cualquier mencion clara de "privac":
  if (/privac/.test(p)) s += 30;
  // Proteccion de datos sola — mas generica, puede ser otra cosa:
  if (/proteccion[-_]?datos|datos[-_]?personales/.test(p)) s += 10;
  // Penalizacion: sugiere herramienta/landing/marketing de otra cosa,
  // no la politica del sitio.
  if (/diagnostico|autodiagnostico|servicios|blog|noticias|landing|herramienta|checklist|calculadora|equipo|nosotros|contacto|trabaja|carreras?|press|prensa|portfolio/.test(p)) s -= 50;
  return s;
}

export function seleccionarHrefPolitica(
  enlaces: EnlaceCandidato[],
  origen: URL,
): string | undefined {
  const candidatos = enlaces.filter((link) =>
    TEXTO_POLITICA.test(`${link.texto ?? ""} ${link.href ?? ""}`),
  );
  if (candidatos.length === 0) return undefined;

  // 1. Same-site (apex-equivalente). Cuando hay varios, gana el de
  //    mayor puntaje de path. Eso evita que un /autodiagnostico-
  //    proteccion-datos-personales/ ranquee antes que /politica-de-
  //    privacidad/. Si el mejor puntaje es negativo (todos same-site
  //    son sospechosos), seguimos a cross-origin.
  const mismoSitio = candidatos
    .map((link) => {
      if (!link.href) return null;
      let u: URL;
      try { u = new URL(link.href); } catch { return null; }
      if (!mismoRegistrado(u.hostname, origen.hostname)) return null;
      return { href: link.href, score: puntajePath(u.pathname) };
    })
    .filter((x): x is { href: string; score: number } => x !== null);

  if (mismoSitio.length > 0) {
    mismoSitio.sort((a, b) => b.score - a.score);
    if (mismoSitio[0].score >= 0) return mismoSitio[0].href;
  }

  // 2. Sin same-site valido, aceptamos cross-origin si el host no es
  //    red social/aggregator y el path tiene tokens de politica.
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
