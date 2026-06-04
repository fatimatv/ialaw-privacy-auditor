// Acepta URLs sin esquema ("empresa.com", "www.empresa.com") y devuelve la
// URL canonica con https://. Si la entrada no es salvable devuelve "".
// La validacion SSRF (validarUrlPublica) sigue siendo responsabilidad del
// crawler — esto solo normaliza la forma sintactica.
export function normalizarUrl(entrada: string): string {
  const limpio = (entrada ?? "").trim();
  if (!limpio) return "";

  // Si ya trae esquema http(s), respetarlo tal cual; cualquier otro esquema
  // (ftp, javascript, file, data, etc.) se descarta para no abrir vectores
  // raros antes de que llegue al guard SSRF.
  if (/^https?:\/\//i.test(limpio)) {
    try {
      return new URL(limpio).toString();
    } catch {
      return "";
    }
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(limpio)) {
    return "";
  }

  // Sin esquema: anteponer https:// y validar.
  try {
    return new URL(`https://${limpio}`).toString();
  } catch {
    return "";
  }
}
