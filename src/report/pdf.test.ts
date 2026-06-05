import { describe, expect, it } from "vitest";
import type { CalculoPuntaje, ResultadoAuditoria } from "../analyzer/types";
import { crearHtmlReporte, DISCLAIMER_REPORTE, TITULO_REPORTE } from "./pdf";

function metodologiaVacia(puntaje: number): CalculoPuntaje {
  return {
    base: 100,
    deducciones: [
      { severidad: "MUY GRAVE", penalidad_unitaria: 25, cantidad: 0, deduccion_total: 0 },
      { severidad: "GRAVE", penalidad_unitaria: 3, cantidad: 0, deduccion_total: 0 },
      { severidad: "IMPORTANTE", penalidad_unitaria: 2, cantidad: 0, deduccion_total: 0 },
      { severidad: "MODERADA", penalidad_unitaria: 1, cantidad: 0, deduccion_total: 0 },
    ],
    deduccion_total: 100 - puntaje,
    puntaje_final: puntaje,
    formula_texto:
      "Puntaje = cobertura del Art. 18 ponderada por severidad. Pesos: MUY GRAVE 4, GRAVE 3, IMPORTANTE 2, MODERADA 1. Estados: CUMPLE 100%, PARCIAL 50%, INCUMPLE 0%.",
    clasificacion_deber_informar: {
      elementos_faltantes_art18: 0,
      clasificacion: "NO_APLICA",
      norma_aplicable: "—",
      rango_multa: "—",
      criterio:
        "No se detectaron elementos faltantes del Art. 18 Ley 29733; no aplica la clasificacion del deber de informar.",
    },
  };
}

function resultadoBase(overrides: Partial<ResultadoAuditoria> = {}): ResultadoAuditoria {
  const puntaje = overrides.puntaje_cumplimiento ?? 90;
  return {
    sitio: "https://example.com",
    fecha_auditoria: "2026-06-02T00:00:00.000Z",
    resumen_ejecutivo: "Resumen",
    puntaje_cumplimiento: puntaje,
    elementos_faltantes_art18: 0,
    clasificacion_deber_informar: null,
    observaciones: [],
    elementos_cumplidos: [],
    trackers_detectados: [],
    advertencias_metodologicas: [],
    metodologia_calificacion: metodologiaVacia(puntaje),
    cuadro_art18: [],
    ...overrides,
  };
}

describe("crearHtmlReporte", () => {
  it("incluye el titulo principal y el disclaimer obligatorio", () => {
    const html = crearHtmlReporte(resultadoBase({ puntaje_cumplimiento: 88, elementos_faltantes_art18: 1 }));
    expect(html).toContain(TITULO_REPORTE);
    expect(html).toContain(DISCLAIMER_REPORTE);
    expect(html).toContain("https://example.com");
  });

  it("muestra el logo vertical en portada y el horizontal antes del resumen cuando se pasan", () => {
    const html = crearHtmlReporte(resultadoBase(), {
      vertical: "data:image/svg+xml;base64,VkVSVA==",
      horizontal: "data:image/svg+xml;base64,SE9SSVo=",
    });
    expect(html).toContain(`src="data:image/svg+xml;base64,VkVSVA=="`);
    expect(html).toContain(`src="data:image/svg+xml;base64,SE9SSVo="`);
    expect(html).not.toMatch(/<div class="brand">IALAW<\/div>/);
  });

  it("cae al texto IALAW cuando no se proporciona logo", () => {
    const html = crearHtmlReporte(resultadoBase());
    expect(html).toContain(`<div class="brand">IALAW</div>`);
    expect(html).not.toContain(`<div class="brand brand--logo">`);
    expect(html).not.toContain(`<div class="brand-inner">`);
    expect(html).not.toContain("data:image/svg+xml");
  });

  it("renderiza riesgo y rango de multa cuando estan presentes", () => {
    const html = crearHtmlReporte(
      resultadoBase({
        puntaje_cumplimiento: 60,
        elementos_faltantes_art18: 3,
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
      }),
    );
    expect(html).toContain("Riesgo de infraccion");
    expect(html).toContain("Rango de multa aplicable");
    expect(html).toContain("más de 5 hasta 50 UIT");
  });

  it("renderiza la seccion de metodologia con tabla de deducciones y clasificacion", () => {
    const obsBase = {
      modulo: "A",
      categoria: "X",
      evidencia: "e",
      norma_vulnerada: "n",
      riesgo_infraccion: "leve",
      base_infraccion: "b",
      recomendacion: "r",
    };
    const html = crearHtmlReporte(
      resultadoBase({
        puntaje_cumplimiento: 75,
        elementos_faltantes_art18: 2,
        observaciones: [
          { id: "OBS-01", severidad: "GRAVE", hallazgo: "h", ...obsBase },
          { id: "OBS-02", severidad: "IMPORTANTE", hallazgo: "h", ...obsBase },
          { id: "OBS-03", severidad: "MODERADA", hallazgo: "h", ...obsBase },
        ],
        metodologia_calificacion: {
          base: 100,
          deducciones: [
            { severidad: "MUY GRAVE", penalidad_unitaria: 4, cantidad: 0, deduccion_total: 0 },
            { severidad: "GRAVE", penalidad_unitaria: 3, cantidad: 1, deduccion_total: 3 },
            { severidad: "IMPORTANTE", penalidad_unitaria: 2, cantidad: 1, deduccion_total: 2 },
            { severidad: "MODERADA", penalidad_unitaria: 1, cantidad: 1, deduccion_total: 1 },
          ],
          deduccion_total: 25,
          puntaje_final: 75,
          formula_texto: "Puntaje = cobertura del Art. 18 ponderada por severidad. Pesos: MUY GRAVE 4, GRAVE 3, IMPORTANTE 2, MODERADA 1. Estados: CUMPLE 100%, PARCIAL 50%, INCUMPLE 0%.",
          clasificacion_deber_informar: {
            elementos_faltantes_art18: 2,
            clasificacion: "LEVE",
            norma_aplicable: "Art. 132.5 DS 016-2024-JUS",
            rango_multa: "0.5 a 5 UIT",
            criterio:
              "Art. 132.5 DS 016-2024-JUS (LEVE) si faltan 1-2 condiciones del Art. 18 Ley 29733; Art. 133.2 DS 016-2024-JUS (GRAVE) si faltan 3 o mas.",
          },
        },
      }),
    );
    expect(html).toContain("Metodologia de calificacion");
    expect(html).toContain("cobertura del Art. 18 ponderada por severidad");
    expect(html).toContain("75 / 100");
    expect(html).toContain("Art. 132.5 DS 016-2024-JUS");
    expect(html).toContain("0.5 a 5 UIT");
  });

  it("renderiza detalles de sub-elementos cuando una observacion los incluye", () => {
    const html = crearHtmlReporte(
      resultadoBase({
        observaciones: [
          {
            id: "OBS-01",
            modulo: "A",
            categoria: "Derechos ARCO",
            severidad: "IMPORTANTE",
            hallazgo: "ARCO incompleto",
            evidencia: "e",
            norma_vulnerada: "Art. 18",
            riesgo_infraccion: "leve",
            base_infraccion: "Art. 132.5",
            recomendacion: "r",
            detalles: [
              "No se menciona el derecho de revocacion",
              "No se menciona la ANPDP como autoridad de tutela",
            ],
            nivel: "SIN_REVOCACION+SIN_REFERENCIA_ANPDP",
          },
        ],
      }),
    );
    expect(html).toContain("Detalle de sub-elementos");
    expect(html).toContain("derecho de revocacion");
    expect(html).toContain("ANPDP como autoridad de tutela");
    // El codigo tecnico del nivel no debe aparecer en el PDF publico:
    // es un identificador interno en formato code-style, no espanol juridico.
    expect(html).not.toContain("SIN_REVOCACION+SIN_REFERENCIA_ANPDP");
  });

  it("renderiza el cuadro de estado por elemento del Art. 18", () => {
    const html = crearHtmlReporte(
      resultadoBase({
        cuadro_art18: [
          {
            codigo: "A.2",
            categoria: "Identidad y domicilio del responsable",
            estado: "CUMPLE",
            norma: "Art. 18 Ley 29733",
            comentario: "Identificados",
            severidad_implicada: "IMPORTANTE",
            peso: 2,
          },
          {
            codigo: "A.5",
            categoria: "Banco de datos personales",
            estado: "PARCIAL",
            norma: "Art. 34 Ley 29733",
            comentario: "Falta código RNPDP",
            severidad_implicada: "IMPORTANTE",
            peso: 2,
          },
          {
            codigo: "A.9",
            categoria: "Derechos ARCO y mecanismos de ejercicio",
            estado: "INCUMPLE",
            norma: "Art. 18-19 Ley 29733",
            comentario: "ARCO no mencionados",
            severidad_implicada: "GRAVE",
            peso: 3,
          },
        ],
      }),
    );
    expect(html).toContain("Estado por elemento del Art. 18 Ley 29733");
    expect(html).toContain("Identidad y domicilio del responsable");
    expect(html).toContain("estado-CUMPLE");
    expect(html).toContain("estado-PARCIAL");
    expect(html).toContain("estado-INCUMPLE");
  });

  it("recalcula el puntaje desde las observaciones cuando puntaje_cumplimiento no coincide y emite advertencia", () => {
    const obsBase = {
      modulo: "A",
      categoria: "X",
      evidencia: "e",
      norma_vulnerada: "n",
      riesgo_infraccion: "leve",
      base_infraccion: "b",
      recomendacion: "r",
    };
    const html = crearHtmlReporte(
      resultadoBase({
        // Cliente reporta 50 pero las observaciones suman solo 15 (1 GRAVE).
        // El PDF debe mostrar 85 (recalculado) y advertir del mismatch.
        puntaje_cumplimiento: 50,
        observaciones: [
          { id: "OBS-01", severidad: "GRAVE", hallazgo: "h", ...obsBase },
        ],
      }),
    );
    expect(html).toContain("85 / 100");
    expect(html).not.toContain(">50/100<");
    expect(html).toMatch(/puntaje recibido por el cliente.*50.*no coincide.*85/i);
  });

  it("no emite advertencia cuando puntaje_cumplimiento y observaciones coinciden", () => {
    const obsBase = {
      modulo: "A",
      categoria: "X",
      evidencia: "e",
      norma_vulnerada: "n",
      riesgo_infraccion: "leve",
      base_infraccion: "b",
      recomendacion: "r",
    };
    const html = crearHtmlReporte(
      resultadoBase({
        puntaje_cumplimiento: 85,
        observaciones: [
          { id: "OBS-01", severidad: "GRAVE", hallazgo: "h", ...obsBase },
        ],
      }),
    );
    expect(html).not.toMatch(/no coincide.*recalculo/i);
  });

  it("renderiza elementos cumplidos como tarjetas estructuradas", () => {
    const html = crearHtmlReporte(
      resultadoBase({
        elementos_cumplidos: [
          {
            categoria: "Finalidad del tratamiento",
            norma: "Art. 7 + 18 Ley 29733",
            evidencia_detectada: "La politica declara finalidades especificas y no usa formulas genericas.",
          },
        ],
      }),
    );
    expect(html).toContain("Finalidad del tratamiento");
    expect(html).toContain("CUMPLE");
    expect(html).toContain("formulas genericas");
  });
});
