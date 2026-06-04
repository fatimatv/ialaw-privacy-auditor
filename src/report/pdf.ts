import type { ResultadoAuditoria, Severidad } from "../analyzer/types";

const PENALIDADES: Record<Severidad, number> = {
  "MUY GRAVE": 25,
  GRAVE: 15,
  IMPORTANTE: 7,
  MODERADA: 3,
};

// Recalcula el puntaje desde las observaciones recibidas. La autoridad
// final del reporte es lo que esta en el documento PDF: si el cliente
// envia un resultado con observaciones que NO suman al puntaje_cumplimiento
// declarado, recomputamos para mantener internal consistency. Esto
// previene discrepancias UI vs PDF cuando el cliente envia un resultado
// stale o manipulado.
function recalcularPuntaje(resultado: ResultadoAuditoria): {
  puntajeRecalculado: number;
  deduccionRecalculada: number;
  conteoSeveridad: Record<Severidad, number>;
  coincide: boolean;
} {
  const severidades: Severidad[] = ["MUY GRAVE", "GRAVE", "IMPORTANTE", "MODERADA"];
  const conteoSeveridad: Record<Severidad, number> = {
    "MUY GRAVE": 0,
    GRAVE: 0,
    IMPORTANTE: 0,
    MODERADA: 0,
  };
  for (const o of resultado.observaciones) {
    if (severidades.includes(o.severidad as Severidad)) {
      conteoSeveridad[o.severidad as Severidad]++;
    }
  }
  const deduccionRecalculada = severidades.reduce(
    (acc, sev) => acc + conteoSeveridad[sev] * PENALIDADES[sev],
    0,
  );
  const puntajeRecalculado = Math.max(0, 100 - deduccionRecalculada);
  const coincide = puntajeRecalculado === resultado.puntaje_cumplimiento;
  return { puntajeRecalculado, deduccionRecalculada, conteoSeveridad, coincide };
}

export const TITULO_REPORTE = "AUDITORÍA EN PROTECCIÓN DE DATOS PERSONALES DE SITIOS WEB";

export const DISCLAIMER_REPORTE =
  "This report is based on evidence observable from public web pages and on the rule set selected by the user. It does not constitute a full legal certification of compliance and should be complemented with documentary, contractual, organizational and technical evidence when applicable.";

function escaparHtml(valor: unknown): string {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatearFecha(fechaIso: string): string {
  const fecha = new Date(fechaIso);
  if (Number.isNaN(fecha.getTime())) return escaparHtml(fechaIso);
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Lima",
  }).format(fecha);
}

function renderRiesgo(observacion: { riesgo_infraccion?: string; rango_multa_aplicable?: string }): string {
  const partes: string[] = [];
  if (observacion.riesgo_infraccion) {
    partes.push(`<p><strong>Riesgo de infraccion:</strong> ${escaparHtml(observacion.riesgo_infraccion)}</p>`);
  }
  if (observacion.rango_multa_aplicable) {
    partes.push(`<p><strong>Rango de multa aplicable:</strong> ${escaparHtml(observacion.rango_multa_aplicable)}</p>`);
  }
  return partes.join("");
}

function renderDetalles(detalles?: string[]): string {
  if (!detalles || detalles.length === 0) return "";
  return `
    <p><strong>Detalle de sub-elementos:</strong></p>
    <ul class="sub-elementos">
      ${detalles.map((d) => `<li>${escaparHtml(d)}</li>`).join("")}
    </ul>
  `;
}

// El nivel del detector es un codigo tecnico interno
// (ej. "SIN_REVOCACION+SIN_REFERENCIA_ANPDP"); se omite del reporte
// publico por estar en formato de codigo, no en lenguaje juridico.
// Sigue disponible en el JSON crudo de la auditoria para auditoria
// tecnica si hace falta.

export type LogosReporte = {
  /** Logo vertical para la portada del PDF. Acepta data: URI o URL absoluta. */
  vertical?: string;
  /** Logo horizontal para encabezados internos del PDF. */
  horizontal?: string;
};

function renderMarcaPortada(logoVertical?: string): string {
  if (!logoVertical) {
    return `<div class="brand">IALAW</div>`;
  }
  return `<div class="brand brand--logo"><img src="${escaparHtml(logoVertical)}" alt="IALAW" /></div>`;
}

function renderMarcaInterior(logoHorizontal?: string): string {
  if (!logoHorizontal) return "";
  return `<div class="brand-inner"><img src="${escaparHtml(logoHorizontal)}" alt="IALAW" /></div>`;
}

export function crearHtmlReporte(resultado: ResultadoAuditoria, logos: LogosReporte = {}): string {
  // Recalculamos el puntaje desde las observaciones recibidas. Si el
  // cliente envio un resultado donde puntaje_cumplimiento NO suma al
  // total de las observaciones (estado stale, dos audits cruzados),
  // tomamos el recalculado como autoridad final del PDF para que el
  // documento sea internamente consistente y no muestre 79 en una
  // parte y 82 en otra. La advertencia de mismatch va al final del
  // reporte en advertencias metodologicas.
  const rc = recalcularPuntaje(resultado);
  const puntajeFinal = rc.puntajeRecalculado;

  const observaciones = resultado.observaciones
    .map(
      (observacion) => `
        <article class="observation">
          <div class="observation-header">
            <div>
              <p class="eyebrow">${escaparHtml(observacion.id)} / Modulo ${escaparHtml(observacion.modulo)}</p>
              <h3>${escaparHtml(observacion.categoria)}</h3>
            </div>
            <span class="severity">${escaparHtml(observacion.severidad)}</span>
          </div>
          <p><strong>Hallazgo:</strong> ${escaparHtml(observacion.hallazgo)}</p>
          ${renderDetalles(observacion.detalles)}
          <p><strong>Evidencia:</strong> ${escaparHtml(observacion.evidencia)}</p>
          <p><strong>Norma vulnerada:</strong> ${escaparHtml(observacion.norma_vulnerada)}</p>
          <p><strong>Base infraccion:</strong> ${escaparHtml(observacion.base_infraccion)}</p>
          ${renderRiesgo(observacion)}
          <p><strong>Recomendacion:</strong> ${escaparHtml(observacion.recomendacion)}</p>
        </article>
      `
    )
    .join("");

  const cumplidos = resultado.elementos_cumplidos
    .map(
      (item) => `
        <article class="compliance">
          <div class="compliance-header">
            <h3>${escaparHtml(item.categoria)}</h3>
            <span class="ok-badge">CUMPLE</span>
          </div>
          <p><strong>Norma:</strong> ${escaparHtml(item.norma)}</p>
          <p><strong>Evidencia detectada:</strong> ${escaparHtml(item.evidencia_detectada)}</p>
        </article>
      `,
    )
    .join("");
  const trackers = resultado.trackers_detectados.map((item) => `<li>${escaparHtml(item)}</li>`).join("");
  // Si el puntaje recalculado desde las observaciones NO coincide con
  // el que el cliente envio, agregamos una advertencia metodologica para
  // que el lector sepa que el PDF muestra el recalculo desde las
  // observaciones (autoridad interna) y no el valor recibido.
  const advertenciasExtra: string[] = [];
  if (!rc.coincide) {
    advertenciasExtra.push(
      `El puntaje recibido por el cliente (${resultado.puntaje_cumplimiento}/100) no coincide con el recalculo desde las observaciones listadas en este reporte (${rc.puntajeRecalculado}/100). Esto indica que el cliente envió un resultado de una auditoría distinta a la que se está reportando. El PDF muestra el recalculo desde las observaciones como autoridad final. Verifique haciendo una nueva auditoría.`,
    );
  }
  const advertencias = [
    ...advertenciasExtra,
    ...resultado.advertencias_metodologicas,
  ]
    .map((item) => `<li>${escaparHtml(item)}</li>`)
    .join("");

  const m = resultado.metodologia_calificacion;
  // Las filas de deducciones tambien las regeneramos desde las observaciones
  // recibidas para que la tabla refleje exactamente lo que el PDF lista
  // mas abajo. Asi la tabla siempre suma al puntaje mostrado en la portada.
  const severidadesOrden: Severidad[] = ["MUY GRAVE", "GRAVE", "IMPORTANTE", "MODERADA"];
  const filasDeducciones = severidadesOrden
    .map((sev) => {
      const cantidad = rc.conteoSeveridad[sev];
      const penalidad = PENALIDADES[sev];
      const ded = cantidad * penalidad;
      return `
        <tr>
          <td>${escaparHtml(sev)}</td>
          <td>−${escaparHtml(penalidad)}</td>
          <td>${escaparHtml(cantidad)}</td>
          <td>−${escaparHtml(ded)}</td>
        </tr>
      `;
    })
    .join("");
  const cdi = m.clasificacion_deber_informar;

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>${TITULO_REPORTE}</title>
    <style>
      @page { size: A4; margin: 18mm; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        color: #111827;
        font-family: Arial, Helvetica, sans-serif;
        font-size: 12px;
        line-height: 1.5;
      }
      .cover {
        min-height: 88vh;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        background: #011EF4;
        color: #ffffff;
        padding: 34px;
      }
      .brand {
        font-size: 20px;
        font-weight: 900;
        letter-spacing: 0.22em;
      }
      .brand--logo img {
        display: block;
        max-height: 140px;
        max-width: 220px;
        height: auto;
        width: auto;
      }
      .brand-inner {
        margin-bottom: 14px;
      }
      .brand-inner img {
        display: block;
        height: 36px;
        width: auto;
      }
      h1 {
        margin: 70px 0 18px;
        max-width: 680px;
        font-size: 34px;
        line-height: 1.05;
        text-transform: uppercase;
      }
      .subtitle {
        max-width: 620px;
        color: rgba(255, 255, 255, 0.84);
        font-size: 14px;
      }
      .score {
        display: inline-block;
        margin-top: 28px;
        background: #FBBB02;
        color: #111827;
        padding: 14px 18px;
        font-size: 28px;
        font-weight: 900;
      }
      .section {
        page-break-inside: avoid;
        padding: 22px 0;
        border-bottom: 1px solid #dfe3ef;
      }
      h2 {
        margin: 0 0 12px;
        color: #011EF4;
        font-size: 16px;
        text-transform: uppercase;
      }
      h3 {
        margin: 2px 0 0;
        font-size: 14px;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }
      .metric {
        background: #f4f6fb;
        border-left: 4px solid #011EF4;
        padding: 12px;
      }
      .metric strong {
        display: block;
        font-size: 18px;
      }
      .observation {
        page-break-inside: avoid;
        margin: 0 0 14px;
        padding: 14px;
        border: 1px solid #dfe3ef;
      }
      .observation-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }
      .eyebrow {
        margin: 0;
        color: #6F7072;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
      }
      .severity {
        background: #FBBB02;
        color: #111827;
        padding: 4px 8px;
        font-size: 10px;
        font-weight: 900;
        text-transform: uppercase;
      }
      ul {
        margin: 0;
        padding-left: 18px;
      }
      .disclaimer {
        margin-top: 22px;
        border-left: 4px solid #FBBB02;
        background: #fff8df;
        padding: 12px;
        color: #374151;
      }
      .sub-elementos {
        margin: 6px 0 12px 0;
        padding-left: 22px;
        color: #374151;
      }
      .sub-elementos li {
        margin-bottom: 4px;
      }
      .nivel-tecnico {
        margin-top: 8px;
        color: #6F7072;
        font-size: 10px;
      }
      .nivel-tecnico code {
        background: #f4f6fb;
        padding: 1px 6px;
        border: 1px solid #dfe3ef;
        font-family: "Courier New", monospace;
        font-size: 10px;
      }
      .compliance {
        page-break-inside: avoid;
        margin: 0 0 12px;
        padding: 14px;
        border: 1px solid #c8d6c8;
        background: #f6fbf6;
      }
      .compliance-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 6px;
      }
      .ok-badge {
        background: #1f9d55;
        color: #ffffff;
        padding: 4px 8px;
        font-size: 10px;
        font-weight: 900;
        text-transform: uppercase;
        white-space: nowrap;
      }
      .metodologia table {
        width: 100%;
        border-collapse: collapse;
        margin: 10px 0;
        font-size: 11px;
      }
      .metodologia th, .metodologia td {
        text-align: left;
        padding: 8px 10px;
        border-bottom: 1px solid #dfe3ef;
      }
      .metodologia thead th {
        background: #f4f6fb;
        color: #011EF4;
        font-weight: 900;
        text-transform: uppercase;
        font-size: 10px;
      }
      .metodologia .total-row {
        font-weight: 900;
        background: #fff8df;
      }
      .metodologia .total-row td {
        border-bottom: 2px solid #FBBB02;
      }
      .formula {
        background: #f4f6fb;
        padding: 12px;
        border-left: 4px solid #011EF4;
        margin: 10px 0;
        font-family: "Courier New", monospace;
        font-size: 11px;
        color: #111827;
      }
      .cuadro-art18 table {
        width: 100%;
        border-collapse: collapse;
        font-size: 10px;
        margin: 10px 0;
      }
      .cuadro-art18 th, .cuadro-art18 td {
        text-align: left;
        padding: 7px 8px;
        border-bottom: 1px solid #dfe3ef;
        vertical-align: top;
      }
      .cuadro-art18 thead th {
        background: #f4f6fb;
        color: #011EF4;
        font-weight: 900;
        text-transform: uppercase;
        font-size: 9px;
      }
      .cuadro-art18 .codigo {
        font-weight: 900;
        color: #6F7072;
        white-space: nowrap;
      }
      .estado-pill {
        display: inline-block;
        padding: 2px 7px;
        border-radius: 9999px;
        font-size: 9px;
        font-weight: 900;
        text-transform: uppercase;
        white-space: nowrap;
      }
      .estado-CUMPLE { background: #d4edda; color: #0f5132; }
      .estado-PARCIAL { background: #fff3cd; color: #664d03; }
      .estado-INCUMPLE { background: #f8d7da; color: #842029; }
      .estado-NO_VERIFICADO { background: #e2e3e5; color: #41464b; }
    </style>
  </head>
  <body>
    <section class="cover">
      <div>
        ${renderMarcaPortada(logos.vertical)}
        <h1>${TITULO_REPORTE}</h1>
        <p class="subtitle">${escaparHtml(resultado.resumen_ejecutivo)}</p>
        <div class="score">${escaparHtml(puntajeFinal)}/100</div>
      </div>
      <div>
        <p><strong>Sitio auditado:</strong> ${escaparHtml(resultado.sitio)}</p>
        <p><strong>Fecha y hora:</strong> ${formatearFecha(resultado.fecha_auditoria)}</p>
        <p style="font-size: 10px; opacity: 0.7;"><strong>ID de auditoria:</strong> ${escaparHtml(resultado.fecha_auditoria)}</p>
      </div>
    </section>

    ${renderMarcaInterior(logos.horizontal)}

    <section class="section">
      <h2>Resumen ejecutivo</h2>
      <div class="grid">
        <div class="metric"><span>Puntaje</span><strong>${escaparHtml(puntajeFinal)}/100</strong></div>
        <div class="metric"><span>Observaciones</span><strong>${escaparHtml(resultado.observaciones.length)}</strong></div>
        <div class="metric"><span>Elementos faltantes Art. 18</span><strong>${escaparHtml(resultado.elementos_faltantes_art18)}</strong></div>
        <div class="metric"><span>Trackers detectados</span><strong>${escaparHtml(resultado.trackers_detectados.length)}</strong></div>
      </div>
      <p class="disclaimer">${DISCLAIMER_REPORTE}</p>
    </section>

    <section class="section cuadro-art18">
      <h2>Estado por elemento del Art. 18 Ley 29733</h2>
      <p>Resumen at-a-glance del cumplimiento por cada deber de informar exigido por el Art. 18 Ley N° 29733. Las observaciones e incumplimientos se detallan más abajo.</p>
      <table>
        <thead>
          <tr>
            <th>Cód.</th>
            <th>Elemento</th>
            <th>Estado</th>
            <th>Comentario</th>
            <th>Norma</th>
          </tr>
        </thead>
        <tbody>
          ${resultado.cuadro_art18
            .map(
              (e) => `
                <tr>
                  <td class="codigo">${escaparHtml(e.codigo)}</td>
                  <td><strong>${escaparHtml(e.categoria)}</strong></td>
                  <td><span class="estado-pill estado-${escaparHtml(e.estado)}">${escaparHtml(e.estado.replace("_", " "))}</span></td>
                  <td>${escaparHtml(e.comentario)}</td>
                  <td>${escaparHtml(e.norma)}</td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </section>

    <section class="section metodologia">
      <h2>Metodologia de calificacion</h2>
      <p class="formula">${escaparHtml(m.formula_texto)}</p>
      <table>
        <thead>
          <tr>
            <th>Severidad</th>
            <th>Penalidad unitaria</th>
            <th>Observaciones</th>
            <th>Deduccion</th>
          </tr>
        </thead>
        <tbody>
          ${filasDeducciones}
          <tr class="total-row">
            <td colspan="3">Puntaje base 100 − total de deducciones (${escaparHtml(rc.deduccionRecalculada)})</td>
            <td>${escaparHtml(puntajeFinal)} / 100</td>
          </tr>
        </tbody>
      </table>
      <p style="margin-top: 14px;"><strong>Clasificacion del deber de informar (Art. 132.5 vs 133.2 DS 016-2024-JUS):</strong></p>
      <p>${escaparHtml(cdi.criterio)}</p>
      <p>
        <strong>Resultado de esta auditoria:</strong>
        ${escaparHtml(cdi.elementos_faltantes_art18)} elemento(s) faltante(s) del Art. 18
        → infraccion <strong>${escaparHtml(cdi.clasificacion)}</strong>
        (${escaparHtml(cdi.norma_aplicable)}, rango de multa: ${escaparHtml(cdi.rango_multa)}).
      </p>
    </section>

    <section class="section">
      <h2>Observaciones</h2>
      ${observaciones || "<p>No se registraron observaciones.</p>"}
    </section>

    <section class="section">
      <h2>Elementos cumplidos</h2>
      ${cumplidos || "<p>No se registraron elementos cumplidos.</p>"}
    </section>

    <section class="section">
      <h2>Trackers detectados</h2>
      <ul>${trackers || "<li>No se detectaron trackers en el HTML evaluado.</li>"}</ul>
    </section>

    <section class="section">
      <h2>Advertencias metodologicas</h2>
      <ul>${advertencias}</ul>
    </section>
  </body>
</html>`;
}
