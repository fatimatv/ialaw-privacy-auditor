const TEXTO_POLITICA = /(privacidad|protecci[oó]n de datos|datos personales|privacy)/i;

type EnlaceCandidato = {
  href?: string;
  texto?: string;
};

export function seleccionarHrefPolitica(enlaces: EnlaceCandidato[]): string | undefined {
  return enlaces.find((link) =>
    TEXTO_POLITICA.test(`${link.texto ?? ""} ${link.href ?? ""}`),
  )?.href;
}
