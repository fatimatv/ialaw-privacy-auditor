// Script one-shot para crear un snapshot de Vercel Sandbox con Playwright +
// Chromium pre-instalados. Imprime el snapshot ID al final, que tenes que
// guardar como variable de entorno AUDITOR_BROWSER_SNAPSHOT_ID en Vercel.
//
// Como correrlo (una sola vez):
//
//   1. Crear un Personal Access Token en https://vercel.com/account/tokens
//   2. En PowerShell:
//        $env:VERCEL_TOKEN = "<token>"
//        $env:VERCEL_TEAM_ID = "<team-id-de-.vercel/project.json>"
//        $env:VERCEL_PROJECT_ID = "<projectId-de-.vercel/project.json>"
//        npx tsx scripts/create-snapshot.ts
//   3. Copiar el snapshot ID que imprime al final
//   4. vercel env add AUDITOR_BROWSER_SNAPSHOT_ID production
//      (pegar el ID cuando lo pida)
//   5. vercel deploy --prod  (para que la function pickee la nueva env)

import { Sandbox } from "@vercel/sandbox";

async function main() {
  const credenciales = {
    token: process.env.VERCEL_TOKEN,
    teamId: process.env.VERCEL_TEAM_ID,
    projectId: process.env.VERCEL_PROJECT_ID,
  };

  if (!credenciales.token || !credenciales.teamId || !credenciales.projectId) {
    console.error(
      "Faltan VERCEL_TOKEN, VERCEL_TEAM_ID o VERCEL_PROJECT_ID en el environment.\n" +
        "Lee el comentario arriba en este archivo para instrucciones.",
    );
    process.exit(2);
  }

  console.log("Creando sandbox base (node22, timeout 5 min)...");
  const sandbox = await Sandbox.create({
    ...credenciales,
    runtime: "node22",
    timeout: 300_000,
  });

  try {
    console.log("Instalando playwright...");
    await sandbox.runCommand("npm", ["install", "playwright"]);

    console.log("Descargando Chromium (esto tarda 30-60s)...");
    await sandbox.runCommand("npx", [
      "playwright",
      "install",
      "--with-deps",
      "chromium",
    ]);

    console.log("Creando snapshot del sandbox...");
    const snapshot = await sandbox.snapshot();

    console.log("");
    console.log("=========================================================");
    console.log("Snapshot creado correctamente.");
    console.log("");
    console.log(`Snapshot ID: ${snapshot.snapshotId}`);
    console.log("");
    console.log("Siguiente paso:");
    console.log(
      "  vercel env add AUDITOR_BROWSER_SNAPSHOT_ID production",
    );
    console.log("  (pega el snapshot ID cuando lo pida)");
    console.log("");
    console.log("Y luego:");
    console.log("  vercel deploy --prod");
    console.log("=========================================================");
  } finally {
    await sandbox.stop().catch(() => undefined);
  }
}

main().catch((err) => {
  console.error(err?.stack ?? String(err));
  process.exit(1);
});
