// Logica pura del crawler que vale la pena unit-testear sin tener que
// arrancar Playwright. Solo regexes + la heuristica para elegir el
// href de la politica de privacidad entre los anchors de una pagina.

export const TEXTO_POLITICA =
  /(privacidad|protecci[oó]n de datos|datos personales|privacy)/i;

// Cuando NINGUN anchor del propio sitio matchea TEXTO_POLITICA, antes
// caiamos al primer candidato cross-origin — y esos suelen ser bios de
// LinkedIn donde alguien dice "Protección de Datos" en su titulo
// profesional, no la politica del sitio (caso real: clubialegal.org ->
// linkedin.com/in/fatimatoche/). DOMINIOS_SOCIALES rechaza esos hosts;
// PATH_POLITICA exige que el path del href contenga tokens que solo
// aparecen en URLs de politicas reales, no en perfiles ni posts.
export const DOMINIOS_SOCIALES =
  /(^|\.)(linkedin|facebook|fb|instagram|twitter|x|youtube|youtu|tiktok|pinterest|reddit|threads|mastodon|bsky|whatsapp|wa|t|telegram|medium|substack|nas\.io|github)\.[a-z.]+$/i;
export const PATH_POLITICA =
  /(privac|proteccion[-_]?datos|datos[-_]?personales|aviso[-_]?legal|legal\/|politica|terminos|terms|gdpr|lgpd)/i;

export function seleccionarHrefPolitica(enlaces, origen) {
  const candidatos = enlaces.filter((link) =>
    TEXTO_POLITICA.test(`${link.texto ?? ""} ${link.href ?? ""}`),
  );
  if (candidatos.length === 0) return undefined;
  // 1. Same-origin gana siempre. Cualquier anchor del propio sitio cuyo
  //    texto/href mencione política se trata como la política del sitio.
  const mismoOrigen = candidatos.find((link) => {
    if (!link.href || !origen) return false;
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
