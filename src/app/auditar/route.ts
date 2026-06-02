import { NextResponse } from "next/server";
import { z } from "zod";
import { analizarCumplimiento } from "@/analyzer";
import { auditarSitioPublico } from "@/crawler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SolicitudAuditoria = z.object({
  url: z.string().url(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = SolicitudAuditoria.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Ingresa una URL pública válida." }, { status: 400 });
  }

  try {
    const evidencia = await auditarSitioPublico(parsed.data.url);
    const resultado = await analizarCumplimiento(evidencia);

    return NextResponse.json({ evidencia, resultado });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo completar la auditoría.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
