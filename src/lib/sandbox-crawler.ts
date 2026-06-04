import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Sandbox } from "@vercel/sandbox";
import type { DatosCrawler } from "../analyzer/types";
import { combinarEvidencias, extraerEvidenciaPublica } from "../extractor";

type ConSalida = {
  exitCode: number;
  stdout: () => Promise<string>;
  stderr: () => Promise<string>;
};

// Lectura sincronica al cargar el modulo. El script vive en
// scripts/sandbox-crawler.mjs y lo leemos UNA vez por instancia (warm
// start = 0 IO). Vercel lo incluye en el bundle de la function gracias
// al outputFileTracing (incluido abajo en next.config si hiciera falta;
// en la practica Vercel lo agarra del package porque esta dentro de
// process.cwd() y referenciado por readFileSync con path absoluto).
const SCRIPT_RUTA = join(process.cwd(), "scripts", "sandbox-crawler.mjs");
const SCRIPT_CONTENIDO = readFileSync(SCRIPT_RUTA, "utf-8");
// El script principal importa la logica pura de utils via
// `./sandbox-crawler-utils.mjs`. Hay que inyectar ese archivo en el
// mismo directorio del sandbox o el import falla con ERR_MODULE_NOT_FOUND.
const UTILS_RUTA = join(process.cwd(), "scripts", "sandbox-crawler-utils.mjs");
const UTILS_CONTENIDO = readFileSync(UTILS_RUTA, "utf-8");

function obtenerCredenciales(): {
  token?: string;
  teamId?: string;
  projectId?: string;
} {
  if (
    process.env.VERCEL_TOKEN &&
    process.env.VERCEL_TEAM_ID &&
    process.env.VERCEL_PROJECT_ID
  ) {
    return {
      token: process.env.VERCEL_TOKEN,
      teamId: process.env.VERCEL_TEAM_ID,
      projectId: process.env.VERCEL_PROJECT_ID,
    };
  }
  return {};
}

type SalidaSandbox = {
  url_auditada: string;
  paginas: { url: string; html: string }[];
  politica_url?: string;
  politica_texto?: string;
  advertencias_crawler?: string[];
};

export async function auditarEnSandbox(
  url: string,
  maxPaginas: number,
): Promise<DatosCrawler> {
  const snapshotId = process.env.AUDITOR_BROWSER_SNAPSHOT_ID;
  const credenciales = obtenerCredenciales();

  const sandbox = snapshotId
    ? await Sandbox.create({
        ...credenciales,
        source: { type: "snapshot", snapshotId },
        timeout: 120_000,
      })
    : await Sandbox.create({
        ...credenciales,
        runtime: "node22",
        timeout: 300_000,
      });

  try {
    if (!snapshotId) {
      // Cold start sin snapshot: instalar Playwright y Chromium dentro
      // del sandbox. Para produccion, el operador deberia crear el
      // snapshot una vez (scripts/create-snapshot.ts) y exportar
      // AUDITOR_BROWSER_SNAPSHOT_ID para evitar este tiempo (~60s).
      await sandbox.runCommand("npm", ["install", "playwright"]);
      await sandbox.runCommand("npx", ["playwright", "install", "--with-deps", "chromium"]);
    }

    await sandbox.writeFiles([
      {
        path: "sandbox-crawler.mjs",
        content: SCRIPT_CONTENIDO,
      },
      {
        path: "sandbox-crawler-utils.mjs",
        content: UTILS_CONTENIDO,
      },
    ]);

    // PLAYWRIGHT_BROWSERS_PATH=0 hace que playwright busque el binario
    // de Chromium dentro de node_modules en vez de ~/.cache. Es donde
    // el snapshot lo dejo (ver scripts/create-snapshot.ts).
    // Usamos `env` en vez de `sh -c` para evitar pasar la URL por shell
    // (donde tendriamos que escapar y arriesgar command injection).
    const ejecucion = (await sandbox.runCommand("env", [
      "PLAYWRIGHT_BROWSERS_PATH=0",
      "node",
      "sandbox-crawler.mjs",
      url,
      String(maxPaginas),
    ])) as unknown as ConSalida;

    if (ejecucion.exitCode !== 0) {
      const stderr = await ejecucion.stderr();
      throw new Error(
        `Sandbox crawler termino con codigo ${ejecucion.exitCode}: ${stderr.slice(0, 500)}`,
      );
    }

    const stdout = await ejecucion.stdout();
    const salida: SalidaSandbox = JSON.parse(stdout);

    const paginas = salida.paginas.map((p) =>
      extraerEvidenciaPublica({ url: p.url, html: p.html }),
    );

    return combinarEvidencias({
      url_auditada: salida.url_auditada,
      paginas,
      politica_texto: salida.politica_texto,
      politica_url: salida.politica_url,
      advertencias_crawler: salida.advertencias_crawler,
    });
  } finally {
    await sandbox.stop().catch(() => undefined);
  }
}
