import { describe, expect, it } from "vitest";
import type { ResultadoAuditoria } from "../analyzer/types";
import { crearHtmlReporte, DISCLAIMER_REPORTE, TITULO_REPORTE } from "./pdf";

describe("crearHtmlReporte", () => {
  it("incluye el titulo principal y el disclaimer obligatorio", () => {
    const resultado: ResultadoAuditoria = {
      sitio: "https://example.com",
      fecha_auditoria: "2026-06-02T00:00:00.000Z",
      resumen_ejecutivo: "Resumen de prueba",
      puntaje_cumplimiento: 88,
      elementos_faltantes_art18: 1,
      clasificacion_deber_informar: null,
      observaciones: [],
      elementos_cumplidos: [],
      trackers_detectados: [],
      advertencias_metodologicas: [],
    };

    const html = crearHtmlReporte(resultado);

    expect(html).toContain(TITULO_REPORTE);
    expect(html).toContain(DISCLAIMER_REPORTE);
    expect(html).toContain("https://example.com");
  });

  it("muestra el logo vertical en portada y el horizontal antes del resumen cuando se pasan", () => {
    const resultado: ResultadoAuditoria = {
      sitio: "https://example.com",
      fecha_auditoria: "2026-06-02T00:00:00.000Z",
      resumen_ejecutivo: "Resumen",
      puntaje_cumplimiento: 90,
      elementos_faltantes_art18: 0,
      clasificacion_deber_informar: null,
      observaciones: [],
      elementos_cumplidos: [],
      trackers_detectados: [],
      advertencias_metodologicas: [],
    };
    const html = crearHtmlReporte(resultado, {
      vertical: "data:image/svg+xml;base64,VkVSVA==",
      horizontal: "data:image/svg+xml;base64,SE9SSVo=",
    });
    expect(html).toContain(`src="data:image/svg+xml;base64,VkVSVA=="`);
    expect(html).toContain(`src="data:image/svg+xml;base64,SE9SSVo="`);
    expect(html).not.toMatch(/<div class="brand">IALAW<\/div>/);
  });

  it("cae al texto IALAW cuando no se proporciona logo", () => {
    const resultado: ResultadoAuditoria = {
      sitio: "https://example.com",
      fecha_auditoria: "2026-06-02T00:00:00.000Z",
      resumen_ejecutivo: "Resumen",
      puntaje_cumplimiento: 90,
      elementos_faltantes_art18: 0,
      clasificacion_deber_informar: null,
      observaciones: [],
      elementos_cumplidos: [],
      trackers_detectados: [],
      advertencias_metodologicas: [],
    };
    const html = crearHtmlReporte(resultado);
    expect(html).toContain(`<div class="brand">IALAW</div>`);
    expect(html).not.toContain(`<div class="brand brand--logo">`);
    expect(html).not.toContain(`<div class="brand-inner">`);
    expect(html).not.toContain("data:image/svg+xml");
  });

  it("renderiza riesgo y rango de multa cuando estan presentes", () => {
    const resultado: ResultadoAuditoria = {
      sitio: "https://example.com",
      fecha_auditoria: "2026-06-02T00:00:00.000Z",
      resumen_ejecutivo: "Resumen",
      puntaje_cumplimiento: 60,
      elementos_faltantes_art18: 3,
      clasificacion_deber_informar: null,
      observaciones: [
        {
          id: "OBS-01",
          modulo: "A",
          categoria: "Cat",
          severidad: "GRAVE",
          hallazgo: "h",
          evidencia: "e",
          norma_vulnerada: "n",
          riesgo_infraccion: "grave",
          base_infraccion: "Art. 133.2 DS 016-2024-JUS",
          recomendacion: "r",
          rango_multa_aplicable: "más de 5 hasta 50 UIT",
        },
      ],
      elementos_cumplidos: [],
      trackers_detectados: [],
      advertencias_metodologicas: [],
    };

    const html = crearHtmlReporte(resultado);

    expect(html).toContain("Riesgo de infraccion");
    expect(html).toContain("Rango de multa aplicable");
    expect(html).toContain("más de 5 hasta 50 UIT");
  });
});
