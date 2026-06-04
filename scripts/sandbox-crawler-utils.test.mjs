import { describe, expect, it } from "vitest";
import { seleccionarHrefPolitica } from "./sandbox-crawler-utils.mjs";

const origen = new URL("https://clubialegal.org/");

describe("seleccionarHrefPolitica", () => {
  it("prefiere same-origin sobre cross-origin", () => {
    const href = seleccionarHrefPolitica(
      [
        { texto: "Política de privacidad", href: "https://clubialegal.org/privacidad" },
        { texto: "Protección de Datos", href: "https://www.linkedin.com/in/persona/" },
      ],
      origen,
    );
    expect(href).toBe("https://clubialegal.org/privacidad");
  });

  it("rechaza LinkedIn aunque el texto del anchor mencione 'Protección de Datos' (caso clubialegal.org)", () => {
    // Bio profesional de un abogado: el TEXTO incluye los keywords, el
    // HREF apunta a su perfil personal de LinkedIn. Antes el crawler
    // tomaba esto como politica del sitio, devolvia encontrada=true con
    // texto del login page de LinkedIn, y el analyzer pintaba A.10/A.11
    // como cumplidos vacuamente.
    const href = seleccionarHrefPolitica(
      [
        {
          texto: "Fátima Toche Vega Derecho Digital | IA & Protección de Datos",
          href: "https://www.linkedin.com/in/f%C3%A1timatoche/",
        },
      ],
      origen,
    );
    expect(href).toBeUndefined();
  });

  it("rechaza todas las demas redes sociales/aggregators", () => {
    const enlaces = [
      { texto: "Privacy", href: "https://www.facebook.com/page/" },
      { texto: "Privacy", href: "https://twitter.com/usuario" },
      { texto: "Privacy", href: "https://x.com/usuario" },
      { texto: "Privacy", href: "https://www.instagram.com/page/" },
      { texto: "Privacy", href: "https://www.youtube.com/@canal" },
      { texto: "Privacy", href: "https://www.tiktok.com/@user" },
      { texto: "Privacy", href: "https://medium.com/post" },
      { texto: "Privacy", href: "https://nas.io/club" },
    ];
    expect(seleccionarHrefPolitica(enlaces, origen)).toBeUndefined();
  });

  it("acepta cross-origin si el host no es social y el PATH tiene tokens de política (CDN, subdominio docs)", () => {
    const href = seleccionarHrefPolitica(
      [
        {
          texto: "Política de privacidad",
          href: "https://cdn.empresa.com/legal/politica-privacidad.pdf",
        },
      ],
      origen,
    );
    expect(href).toBe("https://cdn.empresa.com/legal/politica-privacidad.pdf");
  });

  it("rechaza cross-origin si el path no contiene tokens de política (post arbitrario)", () => {
    const href = seleccionarHrefPolitica(
      [
        {
          texto: "Datos personales y empresas",
          href: "https://blog-externo.com/articulo/123",
        },
      ],
      origen,
    );
    expect(href).toBeUndefined();
  });

  it("retorna undefined cuando no hay candidatos", () => {
    expect(
      seleccionarHrefPolitica(
        [{ texto: "Inicio", href: "https://clubialegal.org/" }],
        origen,
      ),
    ).toBeUndefined();
  });
});
