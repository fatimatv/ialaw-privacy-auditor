"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ResultadoAuditoria } from "@/analyzer/types";
import { normalizarUrl } from "@/lib/url-normalize";

const ETAPAS_AUDITORIA: ReadonlyArray<{ desde: number; label: string }> = [
  { desde: 0, label: "Conectando con el sitio…" },
  { desde: 30, label: "Cargando contenido público…" },
  { desde: 55, label: "Localizando política de privacidad…" },
  { desde: 80, label: "Analizando contra Ley 29733 y DS 016-2024-JUS…" },
];

type RespuestaAuditoria = {
  resultado: ResultadoAuditoria;
  evidencia: {
    formularios: unknown[];
    politica_privacidad: { encontrada: boolean; url?: string };
    cookies_banner: { encontrado?: boolean };
    trackers_detectados?: string[];
  };
};

const severidadColor: Record<string, string> = {
  "MUY GRAVE": "bg-red-950 text-white",
  GRAVE: "bg-red-100 text-red-950",
  IMPORTANTE: "bg-amber-100 text-stone-950",
  MODERADA: "bg-blue-100 text-blue-950",
};

const PENALIDADES_UI: Record<string, number> = {
  "MUY GRAVE": 25,
  GRAVE: 15,
  IMPORTANTE: 7,
  MODERADA: 3,
};

export default function Home() {
  const [url, setUrl] = useState("");
  const [resultado, setResultado] = useState<RespuestaAuditoria | null>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [descargandoPdf, setDescargandoPdf] = useState(false);

  // Barra de progreso estimada: avanza asintoticamente hacia 95% durante
  // la auditoria (la duracion real depende del sitio, no la conocemos en
  // tiempo real porque /auditar no transmite eventos intermedios). Al
  // recibir la respuesta saltamos a 100% antes de ocultarla.
  useEffect(() => {
    if (!cargando) {
      setProgreso(0);
      return;
    }
    const inicio = Date.now();
    const id = setInterval(() => {
      const t = (Date.now() - inicio) / 1000;
      // 1 - exp(-t/12) llega a ~95% alrededor de 36 s.
      const p = Math.min(95, 95 * (1 - Math.exp(-t / 12)));
      setProgreso(p);
    }, 200);
    return () => clearInterval(id);
  }, [cargando]);

  const etapaActual = useMemo(() => {
    return (
      [...ETAPAS_AUDITORIA].reverse().find((e) => progreso >= e.desde)?.label ??
      ETAPAS_AUDITORIA[0].label
    );
  }, [progreso]);

  const observaciones = useMemo(
    () => resultado?.resultado.observaciones ?? [],
    [resultado],
  );
  const conteo = useMemo(() => {
    return observaciones.reduce<Record<string, number>>((acc, observacion) => {
      acc[observacion.severidad] = (acc[observacion.severidad] ?? 0) + 1;
      return acc;
    }, {});
  }, [observaciones]);

  // Recalculamos el puntaje desde las observaciones mostradas. La UI usa
  // este recalculado como autoridad final para que SIEMPRE coincida con
  // las observaciones listadas debajo (y con lo que sale en el PDF).
  // Antes podia haber un desfase si la state se actualizaba parcialmente.
  const puntajeRecalculado = useMemo(() => {
    const ded = observaciones.reduce(
      (acc, o) => acc + (PENALIDADES_UI[o.severidad] ?? 0),
      0,
    );
    return Math.max(0, 100 - ded);
  }, [observaciones]);
  const deduccionesRecalculadas = useMemo(() => {
    const orden = ["MUY GRAVE", "GRAVE", "IMPORTANTE", "MODERADA"];
    return orden.map((sev) => {
      const cantidad = observaciones.filter((o) => o.severidad === sev).length;
      const pen = PENALIDADES_UI[sev] ?? 0;
      return { severidad: sev, penalidad_unitaria: pen, cantidad, deduccion_total: cantidad * pen };
    });
  }, [observaciones]);
  const deduccionTotalRecalculada = useMemo(
    () => deduccionesRecalculadas.reduce((a, d) => a + d.deduccion_total, 0),
    [deduccionesRecalculadas],
  );
  const mismatchPuntaje = useMemo(() => {
    if (!resultado) return false;
    return puntajeRecalculado !== resultado.resultado.puntaje_cumplimiento;
  }, [resultado, puntajeRecalculado]);

  async function auditar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const urlNormalizada = normalizarUrl(url);
    if (!urlNormalizada) {
      setError("URL no soportada. Solo se aceptan direcciones http o https.");
      return;
    }
    if (urlNormalizada !== url) setUrl(urlNormalizada);
    setCargando(true);
    setError("");
    setResultado(null);

    try {
      const response = await fetch("/auditar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlNormalizada }),
      });

      // Algunas respuestas no son JSON: 504 FUNCTION_INVOCATION_TIMEOUT
      // de Vercel viene en text/plain, 502/503 a veces como HTML. Si no
      // intentamos parsear como JSON, el .json() arroja un error opaco
      // ("Unexpected token 'A'…") en lugar del mensaje real.
      const contentType = response.headers.get("content-type") ?? "";
      const esJson = contentType.includes("application/json");
      const data = esJson ? await response.json().catch(() => null) : null;

      if (!response.ok) {
        const mensajePorStatus =
          response.status === 504
            ? "La auditoria tardo mas de 60 segundos. El sitio puede ser muy pesado o estar lento; intenta nuevamente o probá con la URL directa de la política de privacidad."
            : response.status === 429
              ? "Has alcanzado el limite de auditorias. Esperá unos minutos y reintentá."
              : response.status >= 500
                ? `Error en el servidor (HTTP ${response.status}). Reintentá en unos segundos.`
                : `No se pudo completar la auditoria (HTTP ${response.status}).`;
        throw new Error(data?.error ?? mensajePorStatus);
      }

      setProgreso(100);
      setResultado(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar la auditoria.");
    } finally {
      setCargando(false);
    }
  }

  async function descargarReportePdf() {
    if (!resultado) return;

    setDescargandoPdf(true);
    setError("");

    try {
      // Normalizamos el resultado antes de enviarlo al PDF: el
      // puntaje_cumplimiento, las deducciones y el puntaje_final pasan a
      // ser los recalculados desde las observaciones que la UI muestra.
      // Asi el PDF descargado siempre coincide con lo que la usuaria vio
      // en pantalla. Si el motor envio algo distinto, queda registrado
      // en el campo `puntaje_motor_reportado` para auditoria interna.
      const resultadoNormalizado: ResultadoAuditoria = {
        ...resultado.resultado,
        puntaje_cumplimiento: puntajeRecalculado,
        metodologia_calificacion: {
          ...resultado.resultado.metodologia_calificacion,
          deducciones: deduccionesRecalculadas as ResultadoAuditoria["metodologia_calificacion"]["deducciones"],
          deduccion_total: deduccionTotalRecalculada,
          puntaje_final: puntajeRecalculado,
        },
      };
      const response = await fetch("/reporte", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resultado: resultadoNormalizado }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "No se pudo generar el reporte PDF.");
      }

      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = "reporte-ialaw-privacidad.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar el reporte PDF.");
    } finally {
      setDescargandoPdf(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-[#111827]">
      <header className="sticky top-0 z-50 border-b border-[#dfe3ef] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4 sm:px-10">
          <Link href="/" className="flex items-center gap-3">
            <span className="text-lg font-black tracking-[0.22em] text-[#011EF4]">IALAW</span>
            <span className="hidden text-xs font-semibold uppercase tracking-wider text-[#6F7072] sm:inline">
              · Privacy Auditor
            </span>
          </Link>
          <a
            href="https://www.iriartelaw.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden text-xs font-bold uppercase tracking-wide text-[#011EF4] hover:text-[#0015a8] sm:inline"
          >
            iriartelaw.com →
          </a>
        </div>
      </header>

      <section className="border-b border-[#dfe3ef] bg-gradient-to-br from-[#011EF4] via-[#011EF4] to-[#0015a8] text-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-14 sm:px-10 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div>
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.22em] text-[#FBBB02]">
                Auditoría pública de privacidad · Ley N° 29733 + DS 016-2024-JUS
              </p>
              <h1 className="max-w-3xl text-4xl font-black uppercase leading-[1.05] sm:text-5xl lg:text-6xl">
                Auditoría en protección de datos personales de sitios web
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-white/85">
                Motor determinístico. Visita la URL pública, extrae política, formularios,
                banner de cookies y trackers, y evalúa el contenido contra la normativa
                peruana vigente.
              </p>
            </div>

            <form
              onSubmit={auditar}
              className="rounded-2xl border border-white/20 bg-white p-4 text-[#111827] shadow-2xl"
            >
              <label htmlFor="url" className="sr-only">
                URL pública a auditar
              </label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  id="url"
                  name="url"
                  type="text"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                  placeholder="empresa.com o https://empresa.com"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  className="min-h-14 flex-1 rounded-xl border border-[#d9deea] bg-white px-4 text-base outline-none transition focus:border-[#011EF4] focus:ring-4 focus:ring-[#011EF4]/15"
                />
                <button
                  type="submit"
                  disabled={cargando}
                  className="min-h-14 rounded-xl bg-[#FBBB02] px-6 text-sm font-black uppercase tracking-wide text-[#111827] shadow-sm transition hover:bg-[#e7a900] hover:shadow disabled:cursor-wait disabled:opacity-70"
                >
                  {cargando ? "Auditando…" : "Auditar"}
                </button>
              </div>
              {cargando ? (
                <div
                  className="mt-4 space-y-2"
                  role="status"
                  aria-live="polite"
                  aria-label="Auditando"
                >
                  <div className="flex items-center justify-between text-xs font-semibold text-[#011EF4]">
                    <span>{etapaActual}</span>
                    <span className="tabular-nums">{Math.round(progreso)}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[#e6e9f2]">
                    <div
                      className="h-full rounded-full bg-[#011EF4] transition-[width] duration-300 ease-out"
                      style={{ width: `${progreso}%` }}
                    />
                  </div>
                  <p className="text-[11px] leading-4 text-[#6F7072]">
                    El tiempo estimado depende del sitio. Suele tardar entre 15 y 45 segundos.
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-xs leading-5 text-[#6F7072]">
                  Sin APIs externas ni IA. No se envían formularios ni se accede a áreas privadas.
                </p>
              )}
            </form>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-6 py-10 sm:px-10 lg:grid-cols-[0.8fr_1.2fr]">
        <aside className="space-y-4">
          <div className="rounded-2xl border border-[#dfe3ef] bg-white p-6 shadow-sm">
            <h2 className="text-xs font-black uppercase tracking-[0.18em] text-[#011EF4]">Estado</h2>
            {error ? (
              <p className="mt-4 rounded-lg border-l-4 border-red-600 bg-red-50 p-4 text-sm text-red-950">{error}</p>
            ) : resultado ? (
              <div className="mt-4 space-y-5">
                <div>
                  <div className="text-6xl font-black leading-none text-[#011EF4]">
                    {puntajeRecalculado}
                  </div>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-[#6F7072]">
                    Puntaje de cumplimiento
                  </p>
                  <p className="mt-1 text-[10px] text-[#6F7072]">
                    Auditoría: {new Date(resultado.resultado.fecha_auditoria).toLocaleString("es-PE", { timeZone: "America/Lima" })}
                  </p>
                  {mismatchPuntaje && (
                    <p className="mt-2 rounded border-l-2 border-amber-500 bg-amber-50 p-2 text-[10px] text-amber-900">
                      <strong>Aviso:</strong> el puntaje recalculado desde las observaciones ({puntajeRecalculado}) no coincide con el reportado por el motor ({resultado.resultado.puntaje_cumplimiento}). Se muestra el recalculado. Si el desfase persiste, audite nuevamente.
                    </p>
                  )}
                </div>
                <p className="text-sm leading-6 text-[#374151]">{resultado.resultado.resumen_ejecutivo}</p>
                <button
                  type="button"
                  onClick={descargarReportePdf}
                  disabled={descargandoPdf}
                  className="min-h-12 w-full rounded-xl bg-[#011EF4] px-4 text-sm font-black uppercase tracking-wide text-white shadow-sm transition hover:bg-[#0015a8] hover:shadow disabled:cursor-wait disabled:opacity-70"
                >
                  {descargandoPdf ? "Generando PDF…" : "Descargar reporte PDF"}
                </button>
              </div>
            ) : (
              <p className="mt-4 text-sm leading-6 text-[#6F7072]">
                Ingresa una URL pública para iniciar la auditoría automatizada.
              </p>
            )}
          </div>

          {resultado && (
            <div className="rounded-2xl border border-[#dfe3ef] bg-white p-6 shadow-sm">
              <h2 className="text-xs font-black uppercase tracking-[0.18em] text-[#011EF4]">Evidencia</h2>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-[#f4f6fb] p-3">
                  <dt className="text-xs text-[#6F7072]">Política</dt>
                  <dd className="mt-0.5 font-bold">{resultado.evidencia.politica_privacidad.encontrada ? "Detectada" : "No detectada"}</dd>
                </div>
                <div className="rounded-lg bg-[#f4f6fb] p-3">
                  <dt className="text-xs text-[#6F7072]">Formularios</dt>
                  <dd className="mt-0.5 font-bold">{resultado.evidencia.formularios.length}</dd>
                </div>
                <div className="rounded-lg bg-[#f4f6fb] p-3">
                  <dt className="text-xs text-[#6F7072]">Cookies</dt>
                  <dd className="mt-0.5 font-bold">{resultado.evidencia.cookies_banner.encontrado ? "Detectado" : "No detectado"}</dd>
                </div>
                <div className="rounded-lg bg-[#f4f6fb] p-3">
                  <dt className="text-xs text-[#6F7072]">Art. 18</dt>
                  <dd className="mt-0.5 font-bold">{resultado.resultado.elementos_faltantes_art18} faltantes</dd>
                </div>
              </dl>
            </div>
          )}
        </aside>

        <div className="space-y-6">
          {resultado && (
            <>
              <section className="rounded-2xl border border-[#dfe3ef] bg-white p-6 shadow-sm">
                <h2 className="text-xs font-black uppercase tracking-[0.18em] text-[#011EF4]">Estado por elemento del Art. 18 Ley 29733</h2>
                <p className="mt-2 text-xs text-[#6F7072]">Resumen at-a-glance del cumplimiento por cada deber de informar.</p>
                <table className="mt-4 w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#dfe3ef] text-left uppercase text-[#011EF4]">
                      <th className="py-2 pr-2 font-black">Cód.</th>
                      <th className="py-2 pr-2 font-black">Elemento</th>
                      <th className="py-2 pr-2 font-black">Estado</th>
                      <th className="py-2 pr-2 font-black">Comentario</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.resultado.cuadro_art18.map((e) => {
                      const colorByEstado: Record<string, string> = {
                        CUMPLE: "bg-green-100 text-green-900",
                        PARCIAL: "bg-amber-100 text-amber-900",
                        INCUMPLE: "bg-red-100 text-red-900",
                        NO_VERIFICADO: "bg-zinc-100 text-zinc-700",
                      };
                      return (
                        <tr key={e.codigo} className="border-b border-[#e6e9f2] align-top">
                          <td className="py-2 pr-2 font-mono text-[#6F7072]">{e.codigo}</td>
                          <td className="py-2 pr-2 font-bold">{e.categoria}</td>
                          <td className="py-2 pr-2">
                            <span className={`inline-block px-2 py-0.5 text-[10px] font-black uppercase ${colorByEstado[e.estado] ?? "bg-zinc-100"}`}>
                              {e.estado.replace("_", " ")}
                            </span>
                          </td>
                          <td className="py-2 pr-2 text-[#374151]">{e.comentario}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>

              <section className="rounded-2xl border border-[#dfe3ef] bg-white p-6 shadow-sm">
                <h2 className="text-xs font-black uppercase tracking-[0.18em] text-[#011EF4]">Metodología de calificación</h2>
                <p className="mt-3 border-l-4 border-[#011EF4] bg-[#f4f6fb] p-3 font-mono text-xs text-[#111827]">
                  {resultado.resultado.metodologia_calificacion.formula_texto}
                </p>
                <table className="mt-4 w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#dfe3ef] text-left text-xs uppercase text-[#011EF4]">
                      <th className="py-2 font-black">Severidad</th>
                      <th className="py-2 font-black">Penalidad</th>
                      <th className="py-2 font-black">Cantidad</th>
                      <th className="py-2 font-black">Deducción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deduccionesRecalculadas.map((d) => (
                      <tr key={d.severidad} className="border-b border-[#e6e9f2]">
                        <td className="py-2">{d.severidad}</td>
                        <td className="py-2">−{d.penalidad_unitaria}</td>
                        <td className="py-2">{d.cantidad}</td>
                        <td className="py-2">−{d.deduccion_total}</td>
                      </tr>
                    ))}
                    <tr className="bg-[#fff8df] font-black">
                      <td className="py-2" colSpan={3}>
                        Puntaje base 100 − total de deducciones ({deduccionTotalRecalculada})
                      </td>
                      <td className="py-2">{puntajeRecalculado} / 100</td>
                    </tr>
                  </tbody>
                </table>
                <p className="mt-4 text-xs text-[#6F7072]">
                  <strong>Clasificación del deber de informar:</strong>{" "}
                  {resultado.resultado.metodologia_calificacion.clasificacion_deber_informar.criterio}
                </p>
                <p className="mt-2 text-xs text-[#6F7072]">
                  <strong>Resultado en esta auditoría:</strong>{" "}
                  {resultado.resultado.metodologia_calificacion.clasificacion_deber_informar.elementos_faltantes_art18}{" "}
                  elemento(s) faltante(s) del Art. 18 → infracción{" "}
                  <strong>{resultado.resultado.metodologia_calificacion.clasificacion_deber_informar.clasificacion}</strong>{" "}
                  ({resultado.resultado.metodologia_calificacion.clasificacion_deber_informar.norma_aplicable}, rango de multa:{" "}
                  {resultado.resultado.metodologia_calificacion.clasificacion_deber_informar.rango_multa}).
                </p>
              </section>

              <section className="rounded-2xl border border-[#dfe3ef] bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-xs font-black uppercase tracking-[0.18em] text-[#011EF4]">Observaciones</h2>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(conteo).map(([severidad, cantidad]) => (
                      <span key={severidad} className={`px-3 py-1 text-xs font-bold ${severidadColor[severidad] ?? "bg-zinc-100"}`}>
                        {severidad}: {cantidad}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  {observaciones.map((observacion) => (
                    <article key={observacion.id} className="rounded-xl border border-[#e6e9f2] p-5 transition hover:border-[#d4d9e6]">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wide text-[#6F7072]">
                            {observacion.id} · Módulo {observacion.modulo}
                          </p>
                          <h3 className="mt-1 text-lg font-black leading-tight">{observacion.categoria}</h3>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-black ${severidadColor[observacion.severidad] ?? "bg-zinc-100"}`}>
                          {observacion.severidad}
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-[#374151]">{observacion.hallazgo}</p>
                      {observacion.detalles && observacion.detalles.length > 0 && (
                        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[#374151]">
                          {observacion.detalles.map((d, idx) => (
                            <li key={idx}>{d}</li>
                          ))}
                        </ul>
                      )}
                      <p className="mt-3 border-l-4 border-[#FBBB02] bg-[#fff8df] p-3 text-sm text-[#374151]">
                        {observacion.evidencia}
                      </p>
                    </article>
                  ))}
                </div>
              </section>

              <section className="grid gap-6 md:grid-cols-2">
                <div className="rounded-2xl border border-[#dfe3ef] bg-white p-6 shadow-sm">
                  <h2 className="text-xs font-black uppercase tracking-[0.18em] text-[#011EF4]">Elementos cumplidos</h2>
                  <ul className="mt-4 space-y-3 text-sm leading-6 text-[#374151]">
                    {resultado.resultado.elementos_cumplidos.map((item, idx) => (
                      <li key={idx} className="border-l-4 border-[#1f9d55] pl-3">
                        <strong>{item.categoria}</strong>
                        <div className="mt-1 text-xs text-[#6F7072]">{item.norma}</div>
                        <div className="mt-1">{item.evidencia_detectada}</div>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-2xl border border-[#dfe3ef] bg-white p-6 shadow-sm">
                  <h2 className="text-xs font-black uppercase tracking-[0.18em] text-[#011EF4]">Trackers detectados</h2>
                  <ul className="mt-4 space-y-3 text-sm leading-6 text-[#374151]">
                    {resultado.resultado.trackers_detectados.length > 0 ? (
                      resultado.resultado.trackers_detectados.map((tracker) => (
                        <li key={tracker} className="border-l-4 border-[#FBBB02] pl-3">
                          {tracker}
                        </li>
                      ))
                    ) : (
                      <li className="text-[#6F7072]">No se detectaron trackers en el HTML evaluado.</li>
                    )}
                  </ul>
                </div>
              </section>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
