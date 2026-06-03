"use client";

import { FormEvent, useMemo, useState } from "react";
import type { ResultadoAuditoria } from "@/analyzer/types";

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

export default function Home() {
  const [url, setUrl] = useState("");
  const [resultado, setResultado] = useState<RespuestaAuditoria | null>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [descargandoPdf, setDescargandoPdf] = useState(false);

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

  async function auditar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCargando(true);
    setError("");
    setResultado(null);

    try {
      const response = await fetch("/auditar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "No se pudo completar la auditoria.");
      }

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
      const response = await fetch("/reporte", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resultado: resultado.resultado }),
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
      <section className="border-b border-[#dfe3ef] bg-[#011EF4] text-white">
        <div className="mx-auto flex min-h-[44vh] max-w-6xl flex-col justify-between px-6 py-8 sm:px-10">
          <header className="flex items-center justify-between gap-4">
            <div className="text-xl font-black tracking-[0.22em]">IALAW</div>
            <div className="rounded-full border border-white/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white/85">
              Motor deterministico
            </div>
          </header>

          <div className="grid gap-10 py-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div>
              <p className="mb-4 text-sm font-bold uppercase tracking-[0.2em] text-[#FBBB02]">
                Auditoría pública de privacidad
              </p>
              <h1 className="max-w-3xl text-4xl font-black uppercase leading-tight sm:text-6xl">
                Auditoría en protección de datos personales de sitios web
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-white/82">
                El flujo visita una URL publica, extrae politica, formularios, cookies y HTML visible,
                y evalua el resultado con el motor juridico existente.
              </p>
            </div>

            <form onSubmit={auditar} className="border border-white/20 bg-white p-3 text-[#111827] shadow-2xl">
              <label htmlFor="url" className="sr-only">
                URL publica a auditar
              </label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  id="url"
                  name="url"
                  type="url"
                  required
                  placeholder="https://empresa.com"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  className="min-h-14 flex-1 border border-[#d9deea] bg-white px-4 text-base outline-none transition focus:border-[#011EF4] focus:ring-4 focus:ring-[#011EF4]/15"
                />
                <button
                  type="submit"
                  disabled={cargando}
                  className="min-h-14 bg-[#FBBB02] px-6 text-sm font-black uppercase tracking-wide text-[#111827] transition hover:bg-white disabled:cursor-wait disabled:opacity-70"
                >
                  {cargando ? "Auditando" : "Auditar"}
                </button>
              </div>
              <p className="mt-3 text-xs leading-5 text-[#6F7072]">
                No usa APIs externas ni IA. No envia formularios ni accede a areas privadas.
              </p>
            </form>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-6 py-8 sm:px-10 lg:grid-cols-[0.8fr_1.2fr]">
        <aside className="space-y-4">
          <div className="border border-[#dfe3ef] bg-white p-5">
            <h2 className="text-sm font-black uppercase tracking-wide text-[#011EF4]">Estado</h2>
            {error ? (
              <p className="mt-4 border-l-4 border-red-600 bg-red-50 p-4 text-sm text-red-950">{error}</p>
            ) : resultado ? (
              <div className="mt-4 space-y-5">
                <div>
                  <div className="text-6xl font-black text-[#011EF4]">
                    {resultado.resultado.puntaje_cumplimiento}
                  </div>
                  <p className="text-sm font-semibold text-[#6F7072]">Puntaje de cumplimiento</p>
                </div>
                <p className="text-sm leading-6 text-[#374151]">{resultado.resultado.resumen_ejecutivo}</p>
                <button
                  type="button"
                  onClick={descargarReportePdf}
                  disabled={descargandoPdf}
                  className="min-h-12 w-full bg-[#011EF4] px-4 text-sm font-black uppercase tracking-wide text-white transition hover:bg-[#0015a8] disabled:cursor-wait disabled:opacity-70"
                >
                  {descargandoPdf ? "Generando PDF" : "Descargar reporte PDF"}
                </button>
              </div>
            ) : (
              <p className="mt-4 text-sm leading-6 text-[#6F7072]">
                Ingresa una URL publica para iniciar la auditoria automatizada.
              </p>
            )}
          </div>

          {resultado && (
            <div className="border border-[#dfe3ef] bg-white p-5">
              <h2 className="text-sm font-black uppercase tracking-wide text-[#011EF4]">Evidencia</h2>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="bg-[#f4f6fb] p-3">
                  <dt className="text-[#6F7072]">Politica</dt>
                  <dd className="font-bold">{resultado.evidencia.politica_privacidad.encontrada ? "Detectada" : "No detectada"}</dd>
                </div>
                <div className="bg-[#f4f6fb] p-3">
                  <dt className="text-[#6F7072]">Formularios</dt>
                  <dd className="font-bold">{resultado.evidencia.formularios.length}</dd>
                </div>
                <div className="bg-[#f4f6fb] p-3">
                  <dt className="text-[#6F7072]">Cookies</dt>
                  <dd className="font-bold">{resultado.evidencia.cookies_banner.encontrado ? "Detectado" : "No detectado"}</dd>
                </div>
                <div className="bg-[#f4f6fb] p-3">
                  <dt className="text-[#6F7072]">Art. 18</dt>
                  <dd className="font-bold">{resultado.resultado.elementos_faltantes_art18} faltantes</dd>
                </div>
              </dl>
            </div>
          )}
        </aside>

        <div className="space-y-6">
          {resultado && (
            <>
              <section className="border border-[#dfe3ef] bg-white p-5">
                <h2 className="text-sm font-black uppercase tracking-wide text-[#011EF4]">Metodología de calificación</h2>
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
                    {resultado.resultado.metodologia_calificacion.deducciones.map((d) => (
                      <tr key={d.severidad} className="border-b border-[#e6e9f2]">
                        <td className="py-2">{d.severidad}</td>
                        <td className="py-2">−{d.penalidad_unitaria}</td>
                        <td className="py-2">{d.cantidad}</td>
                        <td className="py-2">−{d.deduccion_total}</td>
                      </tr>
                    ))}
                    <tr className="bg-[#fff8df] font-black">
                      <td className="py-2" colSpan={3}>
                        Puntaje base 100 − total de deducciones ({resultado.resultado.metodologia_calificacion.deduccion_total})
                      </td>
                      <td className="py-2">{resultado.resultado.metodologia_calificacion.puntaje_final} / 100</td>
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

              <section className="border border-[#dfe3ef] bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-sm font-black uppercase tracking-wide text-[#011EF4]">Observaciones</h2>
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
                    <article key={observacion.id} className="border border-[#e6e9f2] p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wide text-[#6F7072]">
                            {observacion.id} / Modulo {observacion.modulo}
                          </p>
                          <h3 className="mt-1 text-lg font-black">{observacion.categoria}</h3>
                        </div>
                        <span className={`px-3 py-1 text-xs font-black ${severidadColor[observacion.severidad] ?? "bg-zinc-100"}`}>
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
                <div className="border border-[#dfe3ef] bg-white p-5">
                  <h2 className="text-sm font-black uppercase tracking-wide text-[#011EF4]">Elementos cumplidos</h2>
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
                <div className="border border-[#dfe3ef] bg-white p-5">
                  <h2 className="text-sm font-black uppercase tracking-wide text-[#011EF4]">Trackers detectados</h2>
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
