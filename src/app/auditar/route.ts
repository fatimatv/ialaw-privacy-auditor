import { NextResponse } from "next/server";
import { z } from "zod";
import { analizarCumplimiento } from "@/analyzer";
import { auditarSitioPublico } from "@/crawler";
import { limitadorAuditar, obtenerIdentificadorCliente } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SolicitudAuditoria = z.object({
  url: z.string().url(),
});

export async function POST(request: Request) {
  const identificador = obtenerIdentificadorCliente(request.headers);
  const limite = limitadorAuditar.check(identificador);
  if (!limite.allowed) {
    return NextResponse.json(
      { error: "Has alcanzado el limite de auditorias. Intenta nuevamente mas tarde." },
      {
        status: 429,
        headers: { "Retry-After": String(limite.retryAfterSeconds ?? 60) },
      },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = SolicitudAuditoria.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Ingresa una URL pública válida." }, { status: 400 });
  }

  try {
    const evidencia = await auditarSitioPublico(parsed.data.url);
    const resultado = await analizarCumplimiento(evidencia);

    const evidenciaCliente = {
      url_auditada: evidencia.url_auditada,
      politica_privacidad: {
        encontrada: evidencia.politica_privacidad.encontrada,
        url: evidencia.politica_privacidad.url,
      },
      formularios: evidencia.formularios.map((f) => ({
        pagina_origen: f.pagina_origen,
        checkbox_premarcado: f.checkbox_premarcado,
        tiene_checkbox_consentimiento: f.tiene_checkbox_consentimiento,
        tiene_link_politica: f.tiene_link_politica,
      })),
      cookies_banner: { encontrado: evidencia.cookies_banner.encontrado },
    };

    return NextResponse.json({ evidencia: evidenciaCliente, resultado });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo completar la auditoría.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
