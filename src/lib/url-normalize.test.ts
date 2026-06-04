import { describe, expect, it } from "vitest";
import { normalizarUrl } from "./url-normalize";

describe("normalizarUrl", () => {
  it("acepta URLs con https y las devuelve canonicas", () => {
    expect(normalizarUrl("https://empresa.com")).toBe("https://empresa.com/");
    expect(normalizarUrl("  https://empresa.com/politica  ")).toBe("https://empresa.com/politica");
  });

  it("acepta URLs con http y las respeta (no las fuerza a https)", () => {
    // Algunos dominios viejos solo responden por http; el crawler decide.
    expect(normalizarUrl("http://avendano.pe")).toBe("http://avendano.pe/");
  });

  it("antepone https:// cuando la URL no trae esquema", () => {
    expect(normalizarUrl("superfanzone.com")).toBe("https://superfanzone.com/");
    expect(normalizarUrl("www.starbucks.pe")).toBe("https://www.starbucks.pe/");
    expect(normalizarUrl("empresa.com/politica-de-privacidad")).toBe(
      "https://empresa.com/politica-de-privacidad",
    );
  });

  it("rechaza esquemas que no son http(s)", () => {
    expect(normalizarUrl("javascript:alert(1)")).toBe("");
    expect(normalizarUrl("ftp://archivo.empresa.com")).toBe("");
    expect(normalizarUrl("file:///etc/passwd")).toBe("");
    expect(normalizarUrl("data:text/html,<h1>x</h1>")).toBe("");
  });

  it("devuelve cadena vacia para entradas vacias o invalidas", () => {
    expect(normalizarUrl("")).toBe("");
    expect(normalizarUrl("   ")).toBe("");
    // Espacios en la entrada => URL invalida => "" (no llega al guard SSRF).
    expect(normalizarUrl("no es una url")).toBe("");
  });
});
