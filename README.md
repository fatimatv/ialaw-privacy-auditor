# IALAW Privacy Auditor

Auditoría determinística de cumplimiento en protección de datos personales para sitios web públicos. Evalúa la evidencia observable de una URL (política de privacidad, formularios, banner de cookies, trackers de terceros) contra la **Ley N° 29733** y el **DS N° 016-2024-JUS** y produce un informe descargable en PDF.

No usa APIs externas ni modelos de IA: el motor jurídico vive en `src/analyzer/index.ts` como un conjunto de reglas y detectores en TypeScript.

## Cómo funciona

1. **Crawler** (`src/crawler`) — abre la URL pública con Playwright, espera carga, busca el enlace a la política de privacidad y, si existe, extrae su texto. Valida la URL contra SSRF (rechaza loopback, IPs privadas, hostnames internos).
2. **Extractor** (`src/extractor`) — sobre el HTML, identifica formularios y sus campos, el banner de cookies y el enlace a la política.
3. **Analyzer** (`src/analyzer`) — corre los detectores y construye observaciones por módulo (A: política, B: formularios, C: cookies y trackers). Cuenta los elementos faltantes del Art. 18 Ley 29733 y clasifica entre Art. 132.5 (leve) y Art. 133.2 (grave) DS 016-2024-JUS.
4. **Report** (`src/report`) — genera el HTML del informe y lo imprime a PDF con Playwright. Incluye cover, observaciones, elementos cumplidos, trackers detectados y advertencias metodológicas.

El informe en PDF lleva siempre el disclaimer obligatorio definido en `AGENTS.md`.

## Stack

- Next.js 16 (App Router) + React 19
- TypeScript estricto
- Playwright (crawling + impresión a PDF)
- cheerio (parsing HTML del lado servidor)
- Zod (validación de payloads)
- Tailwind 4
- Vitest (unit tests para detectores, extractor, crawler y reporte)

## Desarrollo

```bash
npm install
npx playwright install chromium  # solo la primera vez
npm run dev
```

Luego abre [http://localhost:3000](http://localhost:3000) y pega una URL pública.

### Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo Next.js |
| `npm run build` | Build de producción |
| `npm run start` | Sirve el build |
| `npm run lint` | ESLint |
| `npm test` | Corre todos los tests con Vitest |
| `npm run test:watch` | Vitest en modo watch |

## Endpoints

- `POST /auditar` — body `{ "url": "https://..." }` → devuelve `{ evidencia, resultado }`. La evidencia que regresa al cliente es un subconjunto mínimo (contadores y banderas); el HTML completo y el texto de la política no salen del servidor.
- `POST /reporte` — body `{ "resultado": ResultadoAuditoria }` → devuelve el PDF (`application/pdf`).

## Despliegue

Playwright requiere un binario de Chromium (~300 MB). Vercel Functions estándar no lo trae out-of-the-box. Para producción, usar:
- `@sparticuz/chromium` + `playwright-core` en una función Node con tamaño ampliado, o
- un worker dedicado (Vercel Sandbox, Render, Fly.io) que mantenga el browser caliente.

## Reglas legales

El motor de reglas (`src/analyzer/index.ts`) no debe ser reescrito ni diluido sin revisión legal. Los cambios estructurales (refactor, cache, eliminación de código muerto) están permitidos siempre que preserven exactamente qué observaciones se levantan y con qué texto.

## Disclaimer

> This report is based on evidence observable from public web pages and on the rule set selected by the user. It does not constitute a full legal certification of compliance and should be complemented with documentary, contractual, organizational and technical evidence when applicable.
