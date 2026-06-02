import { describe, expect, it } from "vitest";
import { analizarCumplimiento } from "./index";

describe("analizarCumplimiento", () => {
  it("reporta calidad del lenguaje cuando la politica usa consentimiento por conducta implicita", async () => {
    const texto = `
      Empresa Demo S.A.C. RUC 20123456789 con domicilio en Av. Principal N 123, Miraflores, Lima.
      Finalidad principal: gestionar la prestación del servicio solicitado.
      Los datos se almacenan en el banco de datos personales de clientes RNPDP N 12345.
      Los datos obligatorios son necesarios para atender la solicitud y los datos opcionales son facultativos.
      Si no proporciona los datos obligatorios no podremos brindar el servicio solicitado.
      Conservamos los datos durante la vigencia del contrato.
      Puede ejercer sus derechos ARCO mediante formulario de solicitud ARCO o escribiendo a privacidad@example.com.
      Puede revocar su consentimiento en cualquier momento.
      La Autoridad Nacional de Protección de Datos Personales es la autoridad de tutela.
      Ley 29733 y DS 016-2024-JUS.
      Al continuar navegando acepta la política de privacidad.
    `;

    const resultado = await analizarCumplimiento({
      url_auditada: "https://example.com",
      politica_privacidad: { encontrada: true, texto },
      formularios: [],
      cookies_banner: { encontrado: false, texto: "" },
      html_completo: "",
    });

    expect(resultado.observaciones.some((obs) => obs.categoria === "Calidad del lenguaje y forma")).toBe(true);
  });
});
