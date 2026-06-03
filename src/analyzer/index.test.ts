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

  it("acepta domicilios sin prefijo Av./Calle cuando vienen tras frase de domicilio", async () => {
    // Caso real iriartelaw: "domiciliada en Enrique Palacios 360, ofc. 612.
    // Miraflores" — no usa el prefijo "Av." pero el domicilio esta completo.
    const texto = `
      IRIARTE & ASOCIADOS S.CIVIL DE R.L. con RUC: 20514828246, domiciliada en
      Enrique Palacios 360, ofc. 612. Miraflores, provincia y departamento de Lima.
      Finalidad: gestionar consultas legales.
      Banco de datos RNPDP N 99999.
      Datos obligatorios y facultativos identificados.
      Si no proporciona los datos no podremos brindar el servicio.
      Conservamos los datos durante la vigencia del contrato.
      Derechos ARCO via privacidad@iriartelaw.com. Puede revocar su consentimiento.
      Autoridad Nacional de Proteccion de Datos como autoridad de tutela.
      Ley 29733 y DS 016-2024-JUS.
    `;

    const resultado = await analizarCumplimiento({
      url_auditada: "https://iriartelaw.com",
      politica_privacidad: { encontrada: true, texto },
      formularios: [],
      cookies_banner: { encontrado: false, texto: "" },
      html_completo: "",
    });

    const observacionDomicilio = resultado.observaciones.find(
      (o) => o.categoria === "Identidad y domicilio del responsable",
    );
    expect(observacionDomicilio).toBeUndefined();
  });

  it("reconoce el código RNPDP cuando se declara con frase 'con registro NNNNN' (sin la sigla RNPDP)", async () => {
    // Caso real Starbucks: la política dice "bancos de datos denominados
    // 'Usuarios Web', con registro 19086" — sin la palabra "RNPDP".
    const texto = `
      Empresa Demo S.A.C. con RUC 20123456789, domiciliada en Av. Principal 123, Miraflores, Lima.
      Finalidad: gestión de clientes.
      Los datos personales serán almacenados en los bancos de datos denominados "Usuarios Web", con registro 19086.
      Datos obligatorios y facultativos identificados.
      Si no proporciona los datos no podremos brindar el servicio.
      Conservamos los datos durante la vigencia del contrato.
      Derechos ARCO via arco@example.com. Puede revocar el consentimiento.
      La Autoridad Nacional de Protección de Datos Personales es la autoridad de tutela.
      Ley 29733 y DS 016-2024-JUS.
    `;
    const resultado = await analizarCumplimiento({
      url_auditada: "https://example.com",
      politica_privacidad: { encontrada: true, texto },
      formularios: [],
      cookies_banner: { encontrado: false, texto: "" },
      html_completo: "",
    });
    const obsBanco = resultado.observaciones.find((o) => o.categoria === "Banco de datos personales");
    expect(obsBanco).toBeUndefined();
  });

  it("sigue reportando PARCIAL cuando se menciona banco de datos sin ningun codigo", async () => {
    const texto = `
      Empresa Demo S.A.C. con RUC 20123456789, domiciliada en Av. Principal 123, Miraflores, Lima.
      Finalidad: gestión de clientes.
      Los datos se almacenan en un banco de datos personales propio.
      Datos obligatorios y facultativos. Si no proporciona no atenderemos.
      Conservamos durante la vigencia. Derechos ARCO via x@y.com. Revocar.
      ANPDP autoridad tutela. Ley 29733.
    `;
    const resultado = await analizarCumplimiento({
      url_auditada: "https://example.com",
      politica_privacidad: { encontrada: true, texto },
      formularios: [],
      cookies_banner: { encontrado: false, texto: "" },
      html_completo: "",
    });
    const obsBanco = resultado.observaciones.find((o) => o.categoria === "Banco de datos personales");
    expect(obsBanco).toBeDefined();
    expect(obsBanco?.severidad).toBe("MODERADA");
  });

  it("sigue reportando como incompleto un domicilio sin via ni frase introductoria", async () => {
    const texto = `
      Empresa Demo S.A.C. RUC 20123456789. Enrique Palacios 360.
      Finalidad: gestionar la prestacion del servicio.
      Banco de datos RNPDP N 12345.
      Datos obligatorios y facultativos.
      Si no proporciona los datos no podremos brindar el servicio.
      Conservamos los datos durante la vigencia del contrato.
      Derechos ARCO via arco@example.com. Puede revocar consentimiento.
      Autoridad Nacional de Proteccion de Datos como tutela.
      Ley 29733.
    `;
    const resultado = await analizarCumplimiento({
      url_auditada: "https://example.com",
      politica_privacidad: { encontrada: true, texto },
      formularios: [],
      cookies_banner: { encontrado: false, texto: "" },
      html_completo: "",
    });
    const observacionDomicilio = resultado.observaciones.find(
      (o) => o.categoria === "Identidad y domicilio del responsable",
    );
    expect(observacionDomicilio).toBeDefined();
  });
});
