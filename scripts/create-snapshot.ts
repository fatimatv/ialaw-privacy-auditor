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
    console.log("Verificando cwd inicial...");
    const pwdResult = await sandbox.runCommand("pwd", []);
    console.log("  cwd:", (await pwdResult.stdout()).trim());

    // El sandbox corre Amazon Linux (dnf). Playwright --with-deps asume
    // Ubuntu/apt-get y falla. Hay que instalar las libs del sistema que
    // Chromium necesita (nss, gtk3, libXcomposite, etc.) por separado.
    // Lista tomada del skill oficial de Vercel agent-browser.
    const CHROMIUM_SYSTEM_DEPS = [
      "nss", "nspr", "libxkbcommon", "atk", "at-spi2-atk", "at-spi2-core",
      "libXcomposite", "libXdamage", "libXrandr", "libXfixes", "libXcursor",
      "libXi", "libXtst", "libXScrnSaver", "libXext", "mesa-libgbm", "libdrm",
      "mesa-libGL", "mesa-libEGL", "cups-libs", "alsa-lib", "pango", "cairo",
      "gtk3", "dbus-libs",
    ];
    console.log("Instalando librerias del sistema para Chromium...");
    const depsResult = await sandbox.runCommand("sh", [
      "-c",
      `sudo dnf clean all 2>&1 && sudo dnf install -y --skip-broken ${CHROMIUM_SYSTEM_DEPS.join(" ")} 2>&1 && sudo ldconfig 2>&1`,
    ]);
    if (depsResult.exitCode !== 0) {
      console.error("  stderr:", await depsResult.stderr());
      throw new Error("dnf install fallo");
    }

    console.log("Instalando playwright (sin postinstall que descarga browsers)...");
    await sandbox.runCommand("sh", [
      "-c",
      "PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install playwright",
    ]);

    console.log("Descargando Chromium en node_modules (esto tarda 30-60s)...");
    const installResult = await sandbox.runCommand("sh", [
      "-c",
      "PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium",
    ]);
    console.log("  exitCode:", installResult.exitCode);
    if (installResult.exitCode !== 0) {
      console.error("  stderr:", await installResult.stderr());
      throw new Error("Playwright install fallo");
    }

    console.log("Verificando que el binario quedo en node_modules...");
    const lsResult = await sandbox.runCommand("sh", [
      "-c",
      "find node_modules/playwright-core -name 'chrome-headless-shell' -type f 2>/dev/null | head -5",
    ]);
    const found = (await lsResult.stdout()).trim();
    console.log("  Binarios encontrados:");
    console.log(found || "  (ninguno)");
    if (!found) {
      throw new Error(
        "chrome-headless-shell no esta en node_modules. PLAYWRIGHT_BROWSERS_PATH=0 no funciono.",
      );
    }

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
