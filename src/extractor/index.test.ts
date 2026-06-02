import { describe, expect, it } from "vitest";
import { extraerEvidenciaPublica } from "./index";

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
});
