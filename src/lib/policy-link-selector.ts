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

export function seleccionarHrefPolitica(
  enlaces: EnlaceCandidato[],
  origen: URL,
): string | undefined {
  const candidatos = enlaces.filter((link) =>
    TEXTO_POLITICA.test(`${link.texto ?? ""} ${link.href ?? ""}`),
  );
  if (candidatos.length === 0) return undefined;
  // 1. Same-origin gana siempre. Cualquier anchor del propio sitio cuyo
  //    texto/href mencione política se trata como la política del sitio.
  const mismoOrigen = candidatos.find((link) => {
    if (!link.href) return false;
    try {
      return new URL(link.href).origin === origen.origin;
    } catch {
      return false;
    }
  });
  if (mismoOrigen) return mismoOrigen.href;
  // 2. Sin same-origin solo aceptamos cross-origin si el HOST no es una
  //    red social/aggregator y el PATH del href contiene tokens propios
  //    de una URL de política. El texto del anchor no basta: una bio de
  //    LinkedIn dice "Protección de Datos" pero linkea a /in/<persona>/,
  //    no a una política. Cubre tambien CDNs y subdominios de docs que
  //    alojen una politica legitima (ej. cdn.empresa.com/legal/...).
  const crossOrigenValido = candidatos.find((link) => {
    if (!link.href) return false;
    try {
      const u = new URL(link.href);
      if (DOMINIOS_SOCIALES.test(u.hostname)) return false;
      return PATH_POLITICA.test(u.pathname);
    } catch {
      return false;
    }
  });
  return crossOrigenValido?.href;
}
