import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Sandbox } from "@vercel/sandbox";

const SCRIPT_RUTA = join(process.cwd(), "scripts", "sandbox-printer.mjs");
const SCRIPT_CONTENIDO = readFileSync(SCRIPT_RUTA, "utf-8");

type ConSalida = {
  exitCode: number;
  stdout: () => Promise<string>;
  stderr: () => Promise<string>;
};

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

export async function imprimirPdfEnSandbox(html: string): Promise<Buffer> {
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
      await sandbox.runCommand("npm", ["install", "playwright"]);
      await sandbox.runCommand("npx", ["playwright", "install", "--with-deps", "chromium"]);
    }

    await sandbox.writeFiles([
      { path: "sandbox-printer.mjs", content: SCRIPT_CONTENIDO },
      { path: "informe.html", content: html },
    ]);

    const ejecucion = (await sandbox.runCommand("sh", [
      "-c",
      "PLAYWRIGHT_BROWSERS_PATH=0 node sandbox-printer.mjs",
    ])) as unknown as ConSalida;

    if (ejecucion.exitCode !== 0) {
      const stderr = await ejecucion.stderr();
      throw new Error(
        `Sandbox printer termino con codigo ${ejecucion.exitCode}: ${stderr.slice(0, 500)}`,
      );
    }

    const base64 = (await (
      (await sandbox.runCommand("base64", ["-w", "0", "salida.pdf"])) as unknown as ConSalida
    ).stdout()).trim();

    return Buffer.from(base64, "base64");
  } finally {
    await sandbox.stop().catch(() => undefined);
  }
}
