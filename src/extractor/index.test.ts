import { describe, expect, it } from "vitest";
import { combinarEvidencias, extraerEvidenciaPublica } from "./index";

describe("extraerEvidenciaPublica", () => {
  it("extrae politica, formularios, banner de cookies y html completo desde evidencia publica", () => {
    const html = `
      <html>
        <body>
          <a href="/privacidad">Política de privacidad</a>
          <form action="/contacto">
            <label>Nombre <input name="nombre" required /></label>
            <label>Email <input name="email" type="email" /></label>
            <label>
              <input type="checkbox" checked />
              Acepto la <a href="/privacidad">política de privacidad</a>
            </label>
          </form>
          <div id="cookies">Usamos cookies. Aceptar</div>
        </body>
      </html>
    `;

    const resultado = extraerEvidenciaPublica({
      url: "https://example.com",
      html,
      politicaTexto: "Política de privacidad de prueba",
    });

    expect(resultado.politica_privacidad).toEqual({
      encontrada: true,
      url: "https://example.com/privacidad",
      texto: "Política de privacidad de prueba",
    });
    expect(resultado.formularios).toHaveLength(1);
    expect(resultado.formularios[0]?.checkbox_premarcado).toBe(true);
    expect(resultado.formularios[0]?.tiene_checkbox_consentimiento).toBe(true);
    expect(resultado.formularios[0]?.tiene_link_politica).toBe(true);
    expect(resultado.cookies_banner.texto).toContain("Usamos cookies");
    expect(resultado.html_completo).toBe(html);
  });

  it("detecta banner CMP por selector OneTrust", () => {
    const html = `
      <html>
        <body>
          <div id="onetrust-banner-sdk">
            Usamos cookies para mejorar tu experiencia. Aceptar o configurar.
          </div>
        </body>
      </html>
    `;
    const r = extraerEvidenciaPublica({ url: "https://example.com", html });
    expect(r.cookies_banner.encontrado).toBe(true);
    expect(r.cookies_banner.texto).toContain("configurar");
  });

  it("detecta CMP por script aunque no haya banner visible", () => {
    const html = `
      <html>
        <head>
          <script src="https://cdn.cookielaw.org/scripttemplates/otSDKStub.js"></script>
        </head>
        <body><div></div></body>
      </html>
    `;
    const r = extraerEvidenciaPublica({ url: "https://example.com", html });
    expect(r.cookies_banner.encontrado).toBe(true);
    expect(r.cookies_banner.texto).toMatch(/CMP detectada por script/);
  });

  it("detecta banner Cookiebot", () => {
    const html = `
      <html>
        <body>
          <div id="CybotCookiebotDialog">
            Este sitio utiliza cookies. Aceptar todas, Rechazar, Personalizar.
          </div>
        </body>
      </html>
    `;
    const r = extraerEvidenciaPublica({ url: "https://example.com", html });
    expect(r.cookies_banner.encontrado).toBe(true);
    expect(r.cookies_banner.texto).toMatch(/Rechazar|Personalizar/);
  });
});

describe("combinarEvidencias", () => {
  const paginaConFormContacto = extraerEvidenciaPublica({
    url: "https://example.com/contacto",
    html: `
      <html><body>
        <form action="/contacto">
          <input name="nombre" />
          <input name="email" />
        </form>
        <div id="onetrust-banner-sdk">Usamos cookies. Aceptar / Rechazar.</div>
      </body></html>
    `,
  });

  const paginaConMismoFormFooter = extraerEvidenciaPublica({
    url: "https://example.com/sobre-nosotros",
    html: `
      <html><body>
        <form action="/contacto">
          <input name="nombre" />
          <input name="email" />
        </form>
      </body></html>
    `,
  });

  const paginaConFormDistinto = extraerEvidenciaPublica({
    url: "https://example.com/newsletter",
    html: `
      <html><body>
        <form action="/newsletter/subscribe">
          <input name="email" />
        </form>
      </body></html>
    `,
  });

  it("deduplica formularios identicos en distintas paginas", () => {
    const merged = combinarEvidencias({
      url_auditada: "https://example.com",
      paginas: [paginaConFormContacto, paginaConMismoFormFooter, paginaConFormDistinto],
    });

    expect(merged.formularios).toHaveLength(2);
    const acciones = merged.formularios.map((f) => f.pagina_origen).sort();
    expect(acciones).toEqual([
      "https://example.com/contacto",
      "https://example.com/newsletter/subscribe",
    ]);
  });

  it("toma el primer cookies banner encontrado", () => {
    const sinBanner = extraerEvidenciaPublica({
      url: "https://example.com/about",
      html: "<html><body><p>nada</p></body></html>",
    });
    const merged = combinarEvidencias({
      url_auditada: "https://example.com",
      paginas: [sinBanner, paginaConFormContacto],
    });
    expect(merged.cookies_banner.encontrado).toBe(true);
    expect(merged.cookies_banner.texto).toMatch(/Aceptar|Rechazar/);
  });

  it("usa la politica suministrada y combina html para deteccion de trackers", () => {
    const home = extraerEvidenciaPublica({
      url: "https://example.com",
      html: `<html><head><script src="https://www.googletagmanager.com/gtm.js"></script></head><body></body></html>`,
    });
    const merged = combinarEvidencias({
      url_auditada: "https://example.com",
      paginas: [home],
      politica_texto: "Politica de prueba.",
      politica_url: "https://example.com/privacidad",
    });
    expect(merged.politica_privacidad).toEqual({
      encontrada: true,
      url: "https://example.com/privacidad",
      texto: "Politica de prueba.",
    });
    expect(merged.html_completo).toContain("googletagmanager");
  });
});
