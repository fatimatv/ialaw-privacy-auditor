import Link from "next/link";

export const metadata = {
  title: "Metodología — IALAW Privacy Auditor",
  description:
    "Cómo el motor evalúa el cumplimiento del Art. 18 Ley 29733: estados, severidades, fórmula del puntaje y alcance del análisis.",
};

const ELEMENTOS = [
  { codigo: "A.2", categoria: "Identidad y domicilio del responsable", severidad: "IMPORTANTE", peso: 2, norma: "Art. 18 Ley 29733 + Art. 6.1.1 DS 016-2024-JUS + Guía ANPDP §4.1" },
  { codigo: "A.3", categoria: "Finalidad del tratamiento", severidad: "GRAVE", peso: 3, norma: "Art. 7 + Art. 18 Ley 29733 + Art. 10.2 DS 016-2024-JUS + Guía ANPDP §4.2" },
  { codigo: "A.4", categoria: "Destinatarios de los datos", severidad: "GRAVE", peso: 3, norma: "Art. 18 Ley 29733 + Art. 6.1.3 DS 016-2024-JUS + Guía ANPDP §4.3" },
  { codigo: "A.4b", categoria: "Transferencia internacional de datos", severidad: "GRAVE", peso: 3, norma: "Art. 15 Ley 29733 + Art. 6.1.7 DS 016-2024-JUS" },
  { codigo: "A.5", categoria: "Banco de datos personales", severidad: "IMPORTANTE", peso: 2, norma: "Art. 18 + Art. 29 + Art. 34 Ley 29733 + Art. 6.1.4 DS 016-2024-JUS + Guía ANPDP §4.4" },
  { codigo: "A.6", categoria: "Carácter obligatorio o facultativo de los datos", severidad: "IMPORTANTE", peso: 2, norma: "Art. 18 Ley 29733 + Guía ANPDP §4.3" },
  { codigo: "A.7", categoria: "Consecuencias de proporcionar o negar los datos", severidad: "MODERADA", peso: 1, norma: "Art. 18 Ley 29733 + Art. 6.1.6 DS 016-2024-JUS + Guía ANPDP §4.4" },
  { codigo: "A.8", categoria: "Plazo de conservación de datos", severidad: "IMPORTANTE", peso: 2, norma: "Art. 8 + Art. 18 Ley 29733 + Art. 6.1.9 DS 016-2024-JUS + Guía ANPDP §4.6" },
  { codigo: "A.9", categoria: "Derechos ARCO y mecanismos de ejercicio", severidad: "GRAVE", peso: 3, norma: "Arts. 18-25 Ley 29733 + Art. 6.1.10 DS 016-2024-JUS + Guía ANPDP §4.7" },
  { codigo: "A.10", categoria: "Decisiones automatizadas y perfilamiento", severidad: "IMPORTANTE", peso: 2, norma: "Art. 6.1.8 DS 016-2024-JUS" },
  { codigo: "A.11", categoria: "Calidad del lenguaje y forma", severidad: "IMPORTANTE", peso: 2, norma: "Art. 5 DS 016-2024-JUS + Guía ANPDP §5" },
  { codigo: "A.12", categoria: "Vigencia normativa", severidad: "IMPORTANTE", peso: 2, norma: "Ley 29733 + DS 016-2024-JUS" },
];

const ESTADOS = [
  { estado: "CUMPLE", factor: "100%", descripcion: "El elemento está declarado de forma específica, lícita y completa en la política." },
  { estado: "PARCIAL", factor: "50%", descripcion: "El elemento está presente pero con deficiencias salvables (ej. nombre del responsable sin domicilio completo)." },
  { estado: "INCUMPLE", factor: "0%", descripcion: "El elemento está ausente o tan deficiente que no satisface la obligación." },
  { estado: "NO_VERIFICADO", factor: "—", descripcion: "El detector no pudo evaluar; el elemento se excluye del denominador (no premia ni castiga)." },
];

const SEVERIDADES = [
  { sev: "MUY GRAVE", peso: 4, art: "Art. 133.2 DS 016-2024-JUS", uso: "Incumplimiento total del deber de informar (sin política de privacidad)." },
  { sev: "GRAVE", peso: 3, art: "Art. 133.2 DS 016-2024-JUS", uso: "Faltan 3+ condiciones del Art. 18, o incumplimientos sustantivos puntuales (finalidad, destinatarios, ARCO, transferencia internacional)." },
  { sev: "IMPORTANTE", peso: 2, art: "Art. 132.5 DS 016-2024-JUS", uso: "Elementos del Art. 18 faltantes con menor peso individual (banco de datos, plazo, vigencia normativa)." },
  { sev: "MODERADA", peso: 1, art: "Art. 132.5 DS 016-2024-JUS", uso: "Deficiencias menores o información complementaria ausente (consecuencias, identificación parcial)." },
];

export default function MetodologiaPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-12 sm:px-10">
      <div className="mb-6">
        <Link href="/" className="text-xs font-semibold uppercase tracking-wider text-[#011EF4] hover:underline">
          ← Volver al auditor
        </Link>
      </div>

      <header className="mb-10">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#FBBB02]">Transparencia</p>
        <h1 className="mt-2 text-3xl font-black text-[#011EF4] sm:text-4xl">
          Metodología de evaluación
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-[#374151]">
          Cómo el motor evalúa el cumplimiento del Art. 18 de la Ley N° 29733 y el Decreto Supremo N° 016-2024-JUS. Esta página describe exactamente qué se mide, cómo se mide y qué <em>no</em> se mide, para que cualquier persona pueda reconstruir el resultado manualmente.
        </p>
      </header>

      <section className="mb-10">
        <h2 className="text-xl font-black uppercase tracking-wider text-[#011EF4]">1. Qué hace el motor</h2>
        <ul className="mt-3 list-disc space-y-2 pl-6 text-sm leading-6 text-[#374151]">
          <li>
            Visita la URL pública que indicaste con un navegador real (Chromium) dentro de un sandbox aislado.
          </li>
          <li>
            Sigue enlaces hacia páginas relacionadas (política de privacidad, formularios, términos) y descarga el texto.
          </li>
          <li>
            Si la política está publicada como PDF, lo descarga y extrae el texto.
          </li>
          <li>
            Corre 12 detectores deterministas (sin IA) sobre el texto para evaluar cada elemento del Art. 18.
          </li>
          <li>
            Calcula el puntaje y produce un informe con observaciones, recomendaciones y referencias normativas.
          </li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-black uppercase tracking-wider text-[#011EF4]">2. Qué NO hace el motor</h2>
        <ul className="mt-3 list-disc space-y-2 pl-6 text-sm leading-6 text-[#374151]">
          <li>
            <strong>No usa IA</strong>: el motor es 100% determinístico, basado en reglas y expresiones regulares. Dos auditorías del mismo sitio sin cambios devuelven el mismo resultado.
          </li>
          <li>
            <strong>No envía formularios</strong>: no rellena ni somete formularios de captación. Solo observa su estructura HTML.
          </li>
          <li>
            <strong>No accede a áreas privadas</strong>: no inicia sesión, no usa contraseñas, no escanea endpoints autenticados.
          </li>
          <li>
            <strong>No persiste tu información</strong>: las URLs auditadas y los textos extraídos no se almacenan más allá del request.
          </li>
          <li>
            <strong>No reemplaza una auditoría legal</strong>: el motor identifica indicios; no certifica cumplimiento ni emite opinión vinculante.
          </li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-black uppercase tracking-wider text-[#011EF4]">3. Fórmula del puntaje</h2>
        <p className="mt-3 text-sm leading-6 text-[#374151]">
          El puntaje es la <strong>cobertura del Art. 18 ponderada por severidad</strong>: cada uno de los 12 elementos pesa según la severidad de la infracción que generaría si estuviera incompleto. La fórmula:
        </p>
        <pre className="mt-4 overflow-x-auto rounded-lg border border-[#dfe3ef] bg-[#f7f8fb] p-4 text-xs text-[#374151]">
          {`puntaje = Σ (factor_estado(e) × peso(e))  /  Σ (100 × peso(e))   × 100

donde:
  factor_estado: CUMPLE = 100, PARCIAL = 50, INCUMPLE = 0
  peso por severidad: MUY GRAVE = 4, GRAVE = 3, IMPORTANTE = 2, MODERADA = 1
  NO_VERIFICADO se excluye del denominador.`}
        </pre>
        <p className="mt-4 text-sm leading-6 text-[#374151]">
          Ejemplo: un sitio con 10 elementos CUMPLE, 1 PARCIAL (A.7, peso 1) y 1 INCUMPLE (A.9, peso 3) en los 12 evaluados:
        </p>
        <pre className="mt-2 overflow-x-auto rounded-lg border border-[#dfe3ef] bg-[#f7f8fb] p-4 text-xs text-[#374151]">
          {`numerador = (100 × 23) + (50 × 1) + (0 × 3) = 2 350
denominador = 100 × 27 = 2 700
puntaje = 2 350 / 2 700 × 100 ≈ 87 / 100`}
        </pre>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-black uppercase tracking-wider text-[#011EF4]">4. Estados por elemento</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#dfe3ef] bg-[#f7f8fb] text-left">
                <th className="px-3 py-2 font-bold">Estado</th>
                <th className="px-3 py-2 font-bold">Factor</th>
                <th className="px-3 py-2 font-bold">Cuándo se asigna</th>
              </tr>
            </thead>
            <tbody>
              {ESTADOS.map((e) => (
                <tr key={e.estado} className="border-b border-[#dfe3ef]">
                  <td className="px-3 py-2 font-mono font-bold text-[#011EF4]">{e.estado}</td>
                  <td className="px-3 py-2 font-mono">{e.factor}</td>
                  <td className="px-3 py-2 text-[#374151]">{e.descripcion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-black uppercase tracking-wider text-[#011EF4]">5. Severidades y multas aplicables</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#dfe3ef] bg-[#f7f8fb] text-left">
                <th className="px-3 py-2 font-bold">Severidad</th>
                <th className="px-3 py-2 font-bold">Peso</th>
                <th className="px-3 py-2 font-bold">Norma</th>
                <th className="px-3 py-2 font-bold">Uso</th>
              </tr>
            </thead>
            <tbody>
              {SEVERIDADES.map((s) => (
                <tr key={s.sev} className="border-b border-[#dfe3ef]">
                  <td className="px-3 py-2 font-mono font-bold">{s.sev}</td>
                  <td className="px-3 py-2 font-mono">{s.peso}</td>
                  <td className="px-3 py-2 text-[#374151]">{s.art}</td>
                  <td className="px-3 py-2 text-[#374151]">{s.uso}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-black uppercase tracking-wider text-[#011EF4]">6. Elementos del Art. 18 evaluados</h2>
        <p className="mt-3 text-sm leading-6 text-[#374151]">
          El motor evalúa 12 elementos del deber de informar. Cada uno tiene una severidad implícita y un peso fijo (la columna de la derecha entra en la fórmula).
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#dfe3ef] bg-[#f7f8fb] text-left">
                <th className="px-3 py-2 font-bold">Cód.</th>
                <th className="px-3 py-2 font-bold">Categoría</th>
                <th className="px-3 py-2 font-bold">Norma</th>
                <th className="px-3 py-2 font-bold">Severidad</th>
                <th className="px-3 py-2 font-bold text-right">Peso</th>
              </tr>
            </thead>
            <tbody>
              {ELEMENTOS.map((e) => (
                <tr key={e.codigo} className="border-b border-[#dfe3ef] align-top">
                  <td className="px-3 py-2 font-mono font-bold text-[#011EF4]">{e.codigo}</td>
                  <td className="px-3 py-2 text-[#374151]">{e.categoria}</td>
                  <td className="px-3 py-2 text-xs text-[#6F7072]">{e.norma}</td>
                  <td className="px-3 py-2 font-mono text-xs">{e.severidad}</td>
                  <td className="px-3 py-2 text-right font-mono">{e.peso}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-[#f7f8fb]">
                <td className="px-3 py-2 font-bold" colSpan={4}>Suma de pesos (denominador máximo)</td>
                <td className="px-3 py-2 text-right font-mono font-bold">27</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-black uppercase tracking-wider text-[#011EF4]">7. Advertencias metodológicas</h2>
        <ul className="mt-3 list-disc space-y-2 pl-6 text-sm leading-6 text-[#374151]">
          <li>
            La verificación de la inscripción efectiva del banco de datos en el RNPDP requiere consulta directa a la ANPDP. El motor solo verifica la mención del código.
          </li>
          <li>
            Las observaciones sobre datos sensibles, proporcionalidad y coherencia entre lo declarado y las prácticas internas requieren auditoría documental complementaria.
          </li>
          <li>
            Los trackers detectados en el HTML son indicativos, no determinantes de una infracción confirmada.
          </li>
          <li>
            Cambios recientes en la web pueden no estar reflejados si la página depende de JavaScript no estándar o requiere consentimiento previo de cookies.
          </li>
        </ul>
      </section>

      <section className="mb-10 rounded-xl border border-[#FBBB02]/40 bg-[#fff8e1] p-5">
        <h2 className="text-sm font-black uppercase tracking-wider text-[#374151]">Aviso legal</h2>
        <p className="mt-2 text-sm leading-6 text-[#374151]">
          Este informe se basa en evidencia observable desde páginas web públicas y en el conjunto de reglas seleccionado por el usuario. No constituye una certificación legal completa de cumplimiento y debe complementarse con evidencia documental, contractual, organizacional y técnica cuando corresponda.
        </p>
      </section>

      <p className="text-xs text-[#6F7072]">
        El código fuente del motor es auditable. Cualquier cambio en la fórmula del puntaje, en los pesos por elemento o en los detectores se refleja en esta página.
      </p>
    </main>
  );
}
