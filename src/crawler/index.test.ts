import { describe, expect, it } from "vitest";
import { seleccionarHrefPolitica } from "./index";

describe("seleccionarHrefPolitica", () => {
  it("elige enlaces de politica por texto aunque la URL no contenga privacidad", () => {
    const href = seleccionarHrefPolitica([
      { href: "https://example.com/legal/123", texto: "Politica de privacidad" },
      { href: "https://example.com/contacto", texto: "Contacto" },
    ]);

    expect(href).toBe("https://example.com/legal/123");
  });
});
