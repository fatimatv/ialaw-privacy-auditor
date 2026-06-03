const TEXTO_POLITICA = /(privacidad|protecci[oó]n de datos|datos personales|privacy)/i;

type EnlaceCandidato = {
  href?: string;
  texto?: string;
};

function mismaOrigen(href: string, origen?: string): boolean {
  if (!origen) return false;
  try {
    return new URL(href).origin === origen;
  } catch {
    return false;
  }
}

// Selecciona el href de politica de privacidad mas probable.
// Preferencia: same-origin sobre cross-origin. Esto evita falsos
// positivos cuando el footer incluye un link a la politica de Google
// (por reCAPTCHA), Cloudflare, o algun proveedor third-party que
// matchea el regex antes que la politica del propio sitio.
export function seleccionarHrefPolitica(
  enlaces: EnlaceCandidato[],
  origen?: string,
): string | undefined {
  const candidatos = enlaces.filter((link) =>
    TEXTO_POLITICA.test(`${link.texto ?? ""} ${link.href ?? ""}`),
  );
  if (candidatos.length === 0) return undefined;
  const mismoOrigen = candidatos.find((link) => link.href && mismaOrigen(link.href, origen));
  return (mismoOrigen ?? candidatos[0])?.href;
}
