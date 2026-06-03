import { describe, expect, it } from "vitest";
import { seleccionarHrefPolitica } from "./index";
import { validarUrlPublica } from "./url-guard";

describe("seleccionarHrefPolitica", () => {
  it("elige enlaces de politica por texto aunque la URL no contenga privacidad", () => {
    const href = seleccionarHrefPolitica([
      { href: "https://example.com/legal/123", texto: "Politica de privacidad" },
      { href: "https://example.com/contacto", texto: "Contacto" },
    ]);

    expect(href).toBe("https://example.com/legal/123");
  });

  it("prefiere politicas same-origin cuando hay multiples candidatos", () => {
    // Caso real: footer con reCAPTCHA enlaza a Google privacy ANTES que
    // el propio link de privacidad del sitio. Sin preferencia same-origin,
    // tomariamos la de Google.
    const href = seleccionarHrefPolitica(
      [
        { href: "https://policies.google.com/privacy", texto: "Privacy Policy" },
        { href: "https://www.banco.pe/legal/privacidad", texto: "Politica de privacidad" },
      ],
      "https://www.banco.pe",
    );
    expect(href).toBe("https://www.banco.pe/legal/privacidad");
  });

  it("cae al primer candidato si no hay match same-origin", () => {
    const href = seleccionarHrefPolitica(
      [
        { href: "https://policies.google.com/privacy", texto: "Privacy Policy" },
      ],
      "https://www.banco.pe",
    );
    expect(href).toBe("https://policies.google.com/privacy");
  });
});

describe("validarUrlPublica", () => {
  it("rechaza protocolos distintos de http(s)", async () => {
    await expect(validarUrlPublica("file:///etc/passwd")).rejects.toThrow(/http o https/);
    await expect(validarUrlPublica("ftp://example.com")).rejects.toThrow(/http o https/);
  });

  it("rechaza credenciales embebidas", async () => {
    await expect(validarUrlPublica("https://user:pass@example.com")).rejects.toThrow(/credenciales/);
  });

  it("rechaza hostnames internos por nombre", async () => {
    await expect(validarUrlPublica("http://localhost")).rejects.toThrow(/loopback/);
    await expect(validarUrlPublica("http://app.internal")).rejects.toThrow(/loopback/);
    await expect(validarUrlPublica("http://metadata.google.internal/")).rejects.toThrow(/loopback/);
  });

  it("rechaza IPv4 privadas o reservadas como literal", async () => {
    await expect(validarUrlPublica("http://127.0.0.1")).rejects.toThrow(/interna/);
    await expect(validarUrlPublica("http://10.0.0.5")).rejects.toThrow(/interna/);
    await expect(validarUrlPublica("http://172.16.0.1")).rejects.toThrow(/interna/);
    await expect(validarUrlPublica("http://192.168.1.1")).rejects.toThrow(/interna/);
    await expect(validarUrlPublica("http://169.254.169.254/latest/meta-data/")).rejects.toThrow(/interna/);
  });

  it("rechaza IPv6 loopback y link-local como literal", async () => {
    await expect(validarUrlPublica("http://[::1]/")).rejects.toThrow(/interna/);
    await expect(validarUrlPublica("http://[fe80::1]/")).rejects.toThrow(/interna/);
  });

  it("rechaza URLs malformadas", async () => {
    await expect(validarUrlPublica("not a url")).rejects.toThrow(/inv[aá]lida/);
  });
});
