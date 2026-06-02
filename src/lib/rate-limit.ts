// Rate limiter en memoria (per-instance) para los endpoints de auditoria.
//
// Limitacion conocida: cada worker/serverless instance tiene su propio
// Map. Si se desplega a un entorno con cold starts o multiples instancias
// (Vercel Functions, Cloud Run, etc.) el limite no se comparte entre
// instancias. Para tener limite global, swapear createInMemoryRateLimiter
// por una implementacion sobre Upstash Redis manteniendo la misma firma
// RateLimiter.

export type ResultadoRateLimit = {
  allowed: boolean;
  retryAfterSeconds?: number;
};

export type RateLimiter = {
  check(identificador: string): ResultadoRateLimit;
};

type BucketState = {
  count: number;
  resetAt: number;
};

type OpcionesRateLimit = {
  windowMs: number;
  max: number;
};

const LIMITE_TAMANO_MAPA_ANTES_DE_PURGAR = 1000;

export function createInMemoryRateLimiter(opciones: OpcionesRateLimit): RateLimiter {
  const { windowMs, max } = opciones;
  const buckets = new Map<string, BucketState>();

  function purgarVencidos(now: number) {
    if (buckets.size < LIMITE_TAMANO_MAPA_ANTES_DE_PURGAR) return;
    for (const [clave, estado] of buckets) {
      if (estado.resetAt < now) buckets.delete(clave);
    }
  }

  return {
    check(identificador) {
      const now = Date.now();
      purgarVencidos(now);

      let estado = buckets.get(identificador);
      if (!estado || estado.resetAt < now) {
        estado = { count: 0, resetAt: now + windowMs };
        buckets.set(identificador, estado);
      }
      estado.count += 1;

      if (estado.count > max) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((estado.resetAt - now) / 1000)),
        };
      }
      return { allowed: true };
    },
  };
}

// Obtiene la IP del cliente. En Vercel/Cloud Run/Cloudflare el reverso
// agrega x-forwarded-for; en otros entornos puede llegar x-real-ip. Si
// nada llega devolvemos "anon" para que multiples llamadas anonimas
// compartan un solo bucket (peor caso para el cliente, no para nosotros).
export function obtenerIdentificadorCliente(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const primero = xff.split(",")[0]?.trim();
    if (primero) return primero;
  }
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  return "anon";
}

function leerEntero(nombreEnv: string, porDefecto: number): number {
  const valor = process.env[nombreEnv];
  if (!valor) return porDefecto;
  const numero = Number(valor);
  return Number.isFinite(numero) && numero > 0 ? numero : porDefecto;
}

// Limiters compartidos por todos los handlers. Se instancian a nivel modulo
// para que el Map sobreviva entre requests dentro de la misma instancia.
export const limitadorAuditar = createInMemoryRateLimiter({
  windowMs: leerEntero("AUDITAR_LIMIT_WINDOW_MS", 10 * 60_000),
  max: leerEntero("AUDITAR_LIMIT_MAX", 10),
});

export const limitadorReporte = createInMemoryRateLimiter({
  windowMs: leerEntero("REPORTE_LIMIT_WINDOW_MS", 10 * 60_000),
  max: leerEntero("REPORTE_LIMIT_MAX", 30),
});
