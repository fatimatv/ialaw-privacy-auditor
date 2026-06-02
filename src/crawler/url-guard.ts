import { promises as dns } from "node:dns";
import net from "node:net";

const HOSTNAMES_BLOQUEADOS = /^(localhost|.+\.localhost|.+\.local|.+\.internal|metadata\.google\.internal)$/i;

function ipv4PrivadaOReservada(ip: string): boolean {
  if (!net.isIPv4(ip)) return false;
  const [a, b] = ip.split(".").map(Number);
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function ipv6PrivadaOReservada(ip: string): boolean {
  if (!net.isIPv6(ip)) return false;
  const norm = ip.toLowerCase();
  if (norm === "::1" || norm === "::") return true;
  if (/^f[cd][0-9a-f]{2}:/.test(norm)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(norm)) return true;
  const v4Mapped = norm.match(/^::ffff:([0-9.]+)$/);
  if (v4Mapped) return ipv4PrivadaOReservada(v4Mapped[1]);
  return false;
}

function ipPrivadaOReservada(ip: string): boolean {
  return ipv4PrivadaOReservada(ip) || ipv6PrivadaOReservada(ip);
}

export async function validarUrlPublica(urlEntrada: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(urlEntrada);
  } catch {
    throw new Error("URL inválida.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Solo se admiten URLs http o https.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("No se admiten URLs con credenciales embebidas.");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname) {
    throw new Error("La URL no incluye un host.");
  }
  if (HOSTNAMES_BLOQUEADOS.test(hostname)) {
    throw new Error("No se permiten hostnames internos o de loopback.");
  }

  if (net.isIP(hostname)) {
    if (ipPrivadaOReservada(hostname)) {
      throw new Error("La URL apunta a una IP interna o reservada.");
    }
    return parsed.toString();
  }

  let registros: { address: string }[];
  try {
    registros = await dns.lookup(hostname, { all: true });
  } catch {
    throw new Error("No se pudo resolver el dominio.");
  }
  if (registros.length === 0) {
    throw new Error("No se pudo resolver el dominio.");
  }
  for (const { address } of registros) {
    if (ipPrivadaOReservada(address)) {
      throw new Error("La URL resuelve a una IP interna o reservada.");
    }
  }

  return parsed.toString();
}
