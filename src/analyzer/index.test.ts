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

  it("acepta como cumplimiento una politica que declara expresamente no compartir datos a nivel nacional o internacional", async () => {
    const texto = `
      Empresa Demo S.A.C. con RUC 20123456789, domiciliada en Av. Principal 123, Miraflores, Lima.
      Finalidad: gestión de clientes.
      No compartimos sus datos a nivel nacional o internacional.
      Los datos se almacenan en el banco de datos personales de clientes, RNPDP N° 12345.
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
    const obsDest = resultado.observaciones.find((o) => o.categoria === "Destinatarios de los datos");
    const obsTransf = resultado.observaciones.find((o) => o.categoria === "Transferencia internacional de datos");
    expect(obsDest).toBeUndefined();
    expect(obsTransf).toBeUndefined();
  });

  it("cuando la politica declara no compartir pero hay trackers, emite advertencia MODERADA de coherencia (no GRAVE)", async () => {
    const texto = `
      Empresa Demo S.A.C. con RUC 20123456789, domiciliada en Av. Principal 123, Miraflores, Lima.
      Finalidad: gestión de clientes.
      No transferimos datos al extranjero. Los datos permanecen en Perú.
      Banco de datos RNPDP N° 12345.
      Datos obligatorios y facultativos. Si no proporciona no atenderemos.
      Conservamos durante la vigencia.
      Derechos ARCO via arco@example.com. Puede revocar consentimiento.
      ANPDP autoridad tutela. Ley 29733.
    `;
    const htmlConTrackers = '<html><script src="https://www.googletagmanager.com/gtm.js"></script></html>';
    const resultado = await analizarCumplimiento({
      url_auditada: "https://example.com",
      politica_privacidad: { encontrada: true, texto },
      formularios: [],
      cookies_banner: { encontrado: false, texto: "" },
      html_completo: htmlConTrackers,
    });
    const obsTrackersGrave = resultado.observaciones.find((o) => o.categoria === "Trackers de terceros no declarados");
    const obsCoherencia = resultado.observaciones.find((o) => o.categoria === "Coherencia entre declaración y trackers detectados");
    expect(obsTrackersGrave).toBeUndefined();
    expect(obsCoherencia).toBeDefined();
    expect(obsCoherencia?.severidad).toBe("MODERADA");
    expect(obsCoherencia?.requiere_verificacion_manual).toBe(true);
  });

  it("incumplimientos parciales reciben severidad MODERADA y no incrementan el contador Art. 18", async () => {
    // Texto con UNA deficiencia parcial por categoria: razon social SI esta
    // pero el domicilio queda incompleto; finalidad declarada pero con
    // expresion generica prohibida; banco de datos mencionado sin codigo;
    // ARCO mencionados pero sin revocacion ni ANPDP; plazo vago.
    const texto = `
      Empresa Demo S.A.C. con RUC 20123456789. Sin direccion completa.
      Finalidad: gestionar nuestros servicios y entre otras finalidades comerciales.
      No compartimos sus datos a nivel nacional o internacional.
      Los datos se almacenan en el banco de datos personales de clientes.
      Datos obligatorios y facultativos identificados.
      Si no proporciona los datos no podremos brindar el servicio.
      Conservamos los datos por el tiempo necesario.
      Puede ejercer sus derechos ARCO escribiendo a privacidad@example.com.
      Ley 29733 y DS 016-2024-JUS.
    `;
    const resultado = await analizarCumplimiento({
      url_auditada: "https://example.com",
      politica_privacidad: { encontrada: true, texto },
      formularios: [],
      cookies_banner: { encontrado: false, texto: "" },
      html_completo: "",
    });
    const obsIdentidad = resultado.observaciones.find((o) => o.categoria === "Identidad y domicilio del responsable");
    const obsBanco = resultado.observaciones.find((o) => o.categoria === "Banco de datos personales");
    const obsPlazo = resultado.observaciones.find((o) => o.categoria === "Plazo de conservación de datos");
    const obsArco = resultado.observaciones.find((o) => o.categoria === "Derechos ARCO y mecanismos de ejercicio");
    expect(obsIdentidad?.severidad).toBe("MODERADA");
    expect(obsBanco?.severidad).toBe("MODERADA");
    expect(obsPlazo?.severidad).toBe("MODERADA");
    expect(obsArco?.severidad).toBe("MODERADA");
    // Los cinco elementos son PARCIALES (no AUSENCIA TOTAL), por lo que
    // ninguno debe incrementar contadorElementosFaltantesArt18.
    expect(resultado.elementos_faltantes_art18).toBe(0);
    // El cuadro Art. 18 debe mostrar estos elementos como PARCIAL, no INCUMPLE.
    const cuadro = resultado.cuadro_art18;
    expect(cuadro.find((e) => e.codigo === "A.2")?.estado).toBe("PARCIAL");
    expect(cuadro.find((e) => e.codigo === "A.5")?.estado).toBe("PARCIAL");
    expect(cuadro.find((e) => e.codigo === "A.8")?.estado).toBe("PARCIAL");
    expect(cuadro.find((e) => e.codigo === "A.9")?.estado).toBe("PARCIAL");
  });

  it("finalidad con expresion generica (PARCIAL) recibe IMPORTANTE; condicionamiento ilicito (HARD) recibe GRAVE", async () => {
    const textoGenerico = `
      Empresa Demo S.A.C. con RUC 20123456789, domiciliada en Av. Principal 123, Miraflores, Lima.
      Finalidad: gestionar nuestros servicios y entre otras finalidades comerciales.
      Banco de datos RNPDP N° 12345. Datos obligatorios y facultativos.
      Si no proporciona no atenderemos. Conservamos durante la vigencia.
      Derechos ARCO via arco@example.com. Puede revocar consentimiento.
      ANPDP autoridad tutela. Ley 29733.
    `;
    const r1 = await analizarCumplimiento({
      url_auditada: "https://example.com",
      politica_privacidad: { encontrada: true, texto: textoGenerico },
      formularios: [],
      cookies_banner: { encontrado: false, texto: "" },
      html_completo: "",
    });
    const obsFinG = r1.observaciones.find((o) => o.categoria === "Finalidad del tratamiento");
    expect(obsFinG?.severidad).toBe("IMPORTANTE");

    const textoCondicionado = `
      Empresa Demo S.A.C. con RUC 20123456789, domiciliada en Av. Principal 123, Miraflores, Lima.
      Finalidad principal: gestionar el servicio.
      Solo si acepta nuestra publicidad podremos continuar con su registro.
      Banco de datos RNPDP N° 12345. Datos obligatorios y facultativos.
      Si no proporciona no atenderemos. Conservamos durante la vigencia.
      Derechos ARCO via arco@example.com. Puede revocar consentimiento.
      ANPDP autoridad tutela. Ley 29733.
    `;
    const r2 = await analizarCumplimiento({
      url_auditada: "https://example.com",
      politica_privacidad: { encontrada: true, texto: textoCondicionado },
      formularios: [],
      cookies_banner: { encontrado: false, texto: "" },
      html_completo: "",
    });
    const obsFinC = r2.observaciones.find((o) => o.categoria === "Finalidad del tratamiento");
    expect(obsFinC?.severidad).toBe("GRAVE");
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

  it("cuando no hay politica de privacidad emite MUY GRAVE + observaciones por elemento del Art. 18 y puntaje muy bajo", async () => {
    // Caso real avendano.pe: la web no tiene politica de privacidad. El
    // cuadro_art18 muestra 12 INCUMPLE y el puntaje debe reflejarlo.
    // Regresion contra el bug previo en que el puntaje quedaba en 82/100
    // (solo una observacion GRAVE -15) pese a tener 12 elementos faltantes.
    const resultado = await analizarCumplimiento({
      url_auditada: "http://www.avendano.pe/",
      politica_privacidad: { encontrada: false, texto: "" },
      formularios: [],
      cookies_banner: { encontrado: false, texto: "" },
      html_completo: "<html></html>",
    });

    const obsExistencia = resultado.observaciones.find(
      (o) => o.categoria === "Existencia de política de privacidad",
    );
    expect(obsExistencia).toBeDefined();
    expect(obsExistencia?.severidad).toBe("MUY GRAVE");

    // El cuadro_art18 muestra 12 INCUMPLE; la cantidad de observaciones
    // del Modulo A debe estar en el mismo orden de magnitud (umbrella +
    // las del Art. 18 que aplican sobre texto vacio).
    const obsModuloA = resultado.observaciones.filter((o) => o.modulo === "A");
    expect(obsModuloA.length).toBeGreaterThanOrEqual(8);

    // Puntaje muy bajo (la suma de penalidades excede 100, queda en 0).
    expect(resultado.puntaje_cumplimiento).toBeLessThanOrEqual(20);

    // Clasificacion correcta: 3+ elementos faltantes => GRAVE Art. 133.2.
    expect(resultado.elementos_faltantes_art18).toBeGreaterThanOrEqual(3);
    expect(
      resultado.metodologia_calificacion?.clasificacion_deber_informar?.clasificacion,
    ).toBe("GRAVE");
  });
});
