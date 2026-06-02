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
});
