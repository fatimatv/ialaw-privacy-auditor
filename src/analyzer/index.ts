// src/analyzer/index.js
// Motor de reglas de alta calidad — Ley 29733 + DS 016-2024-JUS
// Sin dependencia de API externa

import type {
  CalculoPuntaje,
  ClasificacionDeberInformar,
  CookiesBannerDetectado,
  DatosCrawler,
  DeduccionPuntaje,
  ElementoArt18,
  ElementoCumplido,
  EstadoElemento,
  FormularioDetectado,
  Observacion,
  PoliticaPrivacidadDetectada,
  ResultadoAuditoria,
  Severidad,
} from './types'

type ResultadoDetector = {
  cumple: boolean | 'PARCIAL'
  nivel?: string
  alerta?: boolean
  alertas?: string[]
  detalles?: string[]
  faltantes?: string[]
  alerta_ruc?: boolean
  alerta_representante?: boolean
  usa_hipervinculo?: boolean
}

type ResultadoBannerCookies = {
  adecuado: boolean
  nivel?: string
}

type ClasificacionInfraccion = {
  tipo: 'LEVE' | 'GRAVE'
  articulo: string
  rango_multa: string
} | null

type DatoExcesivoDetectado = {
  formulario: string
  dato_excesivo: string
}

type DatosCrawlerEntrada = Partial<Omit<DatosCrawler, 'formularios'>> & {
  formularios?: FormularioDetectado[]
}

// ─────────────────────────────────────────────────
// HELPERS COMPARTIDOS
// ─────────────────────────────────────────────────

// Detecta si la politica DECLARA EXPRESAMENTE que no comparte/transfiere
// datos (a terceros, a nivel nacional, a nivel internacional, al
// extranjero o fuera del Peru). Bajo el principio de veracidad de las
// declaraciones, si la politica lo afirma asi, se asume verdadero y no
// se trata como incumplimiento. Se busca una NEGACION + un OBJETO de
// transferencia en la MISMA oracion para evitar falsos positivos.
const NEGACION_TRANSFERENCIA =
  /(no\s+(?:se\s+)?(?:transfer[a-zñáéíóú]+|compart[a-zñáéíóú]+|cede[a-zñáéíóú]*|comunic[a-zñáéíóú]+|vend[a-zñáéíóú]+|distribuy[a-zñáéíóú]*|divulg[a-zñáéíóú]*|entreg[a-zñáéíóú]+|realiza[a-zñáéíóú]*|hace[a-zñáéíóú]*|efectu[a-zñáéíóú]+)|datos\s+(?:solo|únicamente|exclusivamente)\s+(?:en\s+)?per[uú]|datos\s+permanece[a-zñáéíóú]+\s+en\s+(?:el\s+)?per[uú])/i
const OBJETO_TRANSFERENCIA =
  /(?:a\s+terceros|con\s+terceros|a\s+(?:nivel\s+)?nacional|a\s+(?:nivel\s+)?internacional|al\s+extranjero|al\s+exterior|fuera\s+del\s+(?:pa[ií]s|per[uú])|a\s+(?:otros\s+)?pa[ií]ses|transferencia(?:s)?(?:\s+internacional)?|fuera\s+del\s+territorio\s+nacional)/i

function declaraQueNoComparte(t: string): boolean {
  const oraciones = t.split(/[.!?\n]+/)
  return oraciones.some(
    (s) => NEGACION_TRANSFERENCIA.test(s) && OBJETO_TRANSFERENCIA.test(s),
  )
}

// ─────────────────────────────────────────────────
// NIVEL 1: FUNCIONES DE DETECCIÓN ATÓMICA
// Cada función detecta UN concepto normativo con múltiples variantes
// ─────────────────────────────────────────────────

const det = {
  // A.2 — IDENTIDAD Y DOMICILIO
  identidadResponsable(t: string): ResultadoDetector {
    const tieneNombre = /(S\.?A\.?C?\.?|S\.?R\.?L?\.?|S\.?\s*Civil\s+de\s+R\.?\s*L\.?|E\.?I\.?R\.?L?\.?|sociedad\s+(an[oó]nima|civil|comercial|de\s+responsabilidad)|empresa|corporaci[oó]n|grupo\s+\w+|raz[oó]n social|denominaci[oó]n social|asociaci[oó]n\s+civil)/i.test(t)
    const tieneRUC = /RUC[\s:]*\d{11}/i.test(t)
    const tieneVia = /(av\.|avenida|jr\.|jirón|calle|pasaje|psje\.|carretera|prolongaci[oó]n)/i.test(t)
    // Tambien aceptamos domicilios sin prefijo de via explicita cuando
    // van introducidos por una frase de domicilio ("domiciliada en X",
    // "con sede en X", etc.). En Lima es habitual decir "domiciliada en
    // Enrique Palacios 360" sin escribir "Av./Calle/Jr.". El nombre de
    // la via se infiere de la frase introductoria + el numero/distrito
    // que sigue, lo que cubre la exigencia de via+numero+distrito de la
    // Guia ANPDP §4.1 sin pedir literalidad innecesaria.
    const tieneFraseDomicilio = /(domicilio\s+en|domiciliad[oa]\s+en|ubicad[oa]\s+en|con\s+sede\s+en|sede\s+social\s+en|oficinas?\s+en)/i.test(t)
    const tieneNumero = /n[°º]?\s*\d+|#\s*\d+|\d+\s*,\s*(piso|of\.|oficina|dpto)/i.test(t)
    const tieneDistrito = /(miraflores|san isidro|surco|barranco|lince|jesús maría|magdalena|pueblo libre|san borja|la molina|surquillo|chorrillos|ate|san juan|los olivos|independencia|comas|callao|lima|cercado|trujillo|arequipa|cusco|piura|chiclayo)/i.test(t)
    const tieneDomicilioCompleto = (tieneVia || tieneFraseDomicilio) && (tieneNumero || tieneDistrito)
    const pareceExtranjero = /(incorporated|inc\.|ltd\.|llc\.|gmbh|s\.p\.a\.|b\.v\.|plc\.|corp\.|delaware|cayman|irlanda|holanda|luxemburgo)/i.test(t)
    const tieneRepresentante = /(representante en perú|representante legal en perú|delegado en perú)/i.test(t)
    const resultado: ResultadoDetector = { cumple: true, detalles: [] }

    const faltaNombre = !tieneNombre
    const faltaDomicilio = !tieneDomicilioCompleto
    if (faltaNombre) {
      resultado.nivel = 'SIN_RAZON_SOCIAL'
      resultado.detalles?.push('No se identifica la razón social o denominación del responsable (Art. 18 párr. 1 Ley 29733 + Art. 6.1.1 DS 016-2024-JUS + Guía ANPDP sobre el Deber de Informar §4.1).')
    }
    if (!tieneRUC && tieneNombre) {
      resultado.alerta_ruc = true
      resultado.detalles?.push('No se indica el RUC (recomendado por Guía ANPDP §4.1)')
    }
    if (faltaDomicilio) {
      resultado.nivel = resultado.nivel ? `${resultado.nivel}+DOMICILIO_INCOMPLETO` : 'DOMICILIO_INCOMPLETO'
      resultado.detalles?.push('El domicilio no incluye los componentes mínimos: vía (calle/av/jr) o frase introductoria de domicilio + número y distrito/provincia (Art. 18 Ley 29733 + Art. 6.1.1 DS 016-2024-JUS + Guía ANPDP sobre el Deber de Informar §4.1).')
    }
    if (pareceExtranjero && !tieneRepresentante) {
      resultado.alerta_representante = true
      resultado.detalles?.push('El responsable podría no estar establecido en Perú sin designar representante (Art. 7 DS 016-2024-JUS)')
    }
    // Si falta el NOMBRE -> incumple total (falta el dato esencial del responsable).
    // Si el nombre esta y solo falta el domicilio completo -> PARCIAL (la
    // politica identifica al responsable pero su direccion es deficiente).
    if (faltaNombre) resultado.cumple = false
    else if (faltaDomicilio) resultado.cumple = 'PARCIAL'
    return resultado
  },

  // A.3 — FINALIDAD
  finalidad(t: string): ResultadoDetector {
    const resultado: ResultadoDetector = { cumple: true, detalles: [] }
    const tieneFinalidad = /(finalidad|objetivo del tratamiento|para qué|propósito|usamos tus datos para|tratamos tus datos para)/i.test(t)
    if (!tieneFinalidad) {
      return { cumple: false, nivel: 'AUSENCIA_TOTAL', detalles: ['No se declara ninguna finalidad del tratamiento (Art. 7 — principio de finalidad + Art. 18 Ley 29733 — deber de informar + Guía ANPDP sobre el Deber de Informar §4.2).'] }
    }

    const frasesGenericas = [
      /entre\s+otras\s+finalidades/i,
      /otras\s+modalidades\s+análogas/i,
      /etcétera|etc\./i,
      /fines\s+comerciales\s*\.?\s*$/im,
      /gestión\s+empresarial\s*\.?\s*$/im,
      /mejora\s+de\s+(nuestros\s+)?servicios\s*\.?\s*$/im,
      /prestación\s+de\s+servicios\s*\.?\s*$/im,
      /entre\s+otros\s+usos/i,
      /y\s+otros\s+fines\s+similares/i,
    ]
    // Acumulamos niveles. Al final decidimos si es PARCIAL (hay finalidades
    // pero con deficiencias salvables) o FALSE (practica prohibida o
    // ausencia). Niveles "soft" -> PARCIAL; "hard" -> false.
    let hayHard = false
    let haySoft = false
    const frasesEncontradas = frasesGenericas.filter(r => r.test(t))
    if (frasesEncontradas.length > 0) {
      haySoft = true
      resultado.nivel = 'FINALIDAD_GENERICA'
      resultado.detalles?.push('Se usan frases genéricas o inexactas prohibidas por la Guía ANPDP §4.2: "entre otras finalidades", "etcétera", "fines comerciales", u otras expresiones vagas')
    }

    const tieneFinAdic = /(publicidad|marketing|comercial|perfilamiento|prospección|comunicaciones comerciales|envío.*promocion)/i.test(t)
    const distingueFinalidades = /(finalidad.*principal|finalidad.*primaria|finalidad.*consustancial|necesaria.*para el servicio|adicional|secundaria|finalidad.*opcional)/i.test(t)
    if (tieneFinAdic && !distingueFinalidades) {
      haySoft = true
      resultado.nivel = resultado.nivel || 'SIN_DISTINCION_FINALIDADES'
      resultado.detalles?.push('Se declaran finalidades adicionales (marketing/publicidad) sin distinguirlas de las finalidades principales/consustanciales al servicio (Guía ANPDP §4.2)')
    }

    if (tieneFinAdic) {
      const tieneMecanismoNegativa = /(sí\s*acepto|no\s*acepto|acepto\s*\(\s*\)|no\s*acepto\s*\(\s*\)|marque.*si|puede\s+negarse|puede\s+oponerse|si\s+no\s+desea|para\s+no\s+recibir)/i.test(t)
      const tieneConsentimientoIndep = /(checkbox|casilla|marcar|seleccionar).*?(publicidad|marketing|comercial)/i.test(t)

      if (!tieneMecanismoNegativa && !tieneConsentimientoIndep) {
        haySoft = true
        resultado.nivel = resultado.nivel || 'SIN_MECANISMO_NEGATIVA'
        resultado.detalles?.push('Las finalidades adicionales no cuentan con mecanismo de negativa independiente disponible para el titular (Guía ANPDP §4.2 + Art. 10.2 DS 016-2024-JUS)')
      }

      // Para evitar falsos positivos en politicas largas (los .* del
      // regex original cruzaban oraciones), partimos el texto por
      // oracion y exigimos que los tres signos esten en la MISMA
      // oracion: (1) lenguaje condicional, (2) "acepta", (3) mencion
      // de marketing/publicidad. Si las tres senales coexisten en una
      // oracion, es razonable inferir que el servicio se condiciona a
      // la aceptacion de finalidades adicionales.
      const oraciones = t.split(/[.!?\n]+/)
      const condicionaServicio = oraciones.some((s) => {
        const sLow = s.toLowerCase()
        const hayCondicional = /(solo\s+si|únicamente\s+si|s[oó]lo\s+si|si\s+no\s+acepta|requisito\s+(?:obligatorio\s+)?(?:para|de)|debes?\s+aceptar|para\s+(?:poder\s+)?(?:usar|acceder|disfrutar|registrarse)|no\s+(?:podemos|podremos|podr[aá]|sera\s+posible)\s+(?:atender|brindar|prestar|registrar))/i.test(sLow)
        const hayAceptar = /\bacepta(?:r|s|n)?\b/i.test(sLow)
        const hayMarketing = /(publicidad|marketing|comerciales|promoci[oó]n|env[ií]o\s+de\s+(?:ofertas|comunicaciones))/i.test(sLow)
        return hayCondicional && hayAceptar && hayMarketing
      })
      if (condicionaServicio) {
        hayHard = true
        resultado.nivel = 'CONDICIONAMIENTO_ILICITO'
        resultado.detalles?.push('Se condiciona la prestación del servicio a la aceptación de finalidades adicionales (marketing/publicidad) no indispensables — práctica prohibida por el Art. 3.2 DS 016-2024-JUS.')
      }
    }

    const checkboxUnico = /(acepto\s+la\s+política\s+de\s+privacidad|he\s+leído\s+y\s+acepto|acepto\s+los\s+términos).*?(publicidad|marketing|comunicaciones comerciales)/i.test(t)
    if (checkboxUnico) {
      hayHard = true
      resultado.nivel = 'CONSENTIMIENTO_EN_BLOQUE'
      resultado.detalles?.push('Se solicita consentimiento en bloque para finalidades principales y adicionales con una sola casilla — práctica expresamente prohibida por la Guía ANPDP §5')
    }

    // Hard: practica prohibida o ausencia -> cumple: false (peso completo).
    // Soft: hay finalidades declaradas pero deficientes -> cumple: 'PARCIAL'.
    if (hayHard) resultado.cumple = false
    else if (haySoft) resultado.cumple = 'PARCIAL'
    return resultado
  },

  // A.4 — DESTINATARIOS
  destinatarios(t: string): ResultadoDetector {
    const declara = /(destinatario|receptor|comparten.*datos|transferimos.*a|comunicamos.*a|proveedores.*que|terceros.*que|encargados.*de\s+tratamiento)/i.test(t)
    const noTransfiere = declaraQueNoComparte(t)
    const usaHipervinculo = /(ver\s+lista|más\s+información|consultar\s+aquí|enlace|hipervínculo|link)/i.test(t)
    if (!declara && !noTransfiere) {
      return {
        cumple: false,
        nivel: 'AUSENCIA',
        detalles: ['No se identifican destinatarios ni se declara expresamente que no hay transferencia a terceros (Art. 18 Ley 29733 + Art. 6.1.3 DS 016-2024-JUS + Guía ANPDP sobre el Deber de Informar §4.3).']
      }
    }
    return { cumple: true, usa_hipervinculo: usaHipervinculo }
  },

  // A.4b — TRANSFERENCIA INTERNACIONAL
  transferenciaInternacional(t: string): ResultadoDetector {
    const serviciosExtranjeros = [
      'google', 'aws', 'amazon web services', 'microsoft azure', 'salesforce',
      'hubspot', 'zendesk', 'intercom', 'mailchimp', 'sendgrid', 'twilio',
      'stripe', 'paypal', 'cloudflare', 'akamai', 'fastly', 'shopify',
      'oracle cloud', 'ibm cloud', 'firebase', 'mongodb atlas',
    ]
    const regexServicios = new RegExp(serviciosExtranjeros.join('|'), 'i')
    const mencionaServicioExterno = regexServicios.test(t)
    const PAISES_EXT_INNER = 'estados\\s+unidos|\\bUSA\\b|u\\.s\\.a\\.?|EE\\.?\\s*UU\\.?|europa|españa|colombia|chile|argentina|brasil|méxico|canad[áa]|reino\\s+unido|alemania|francia|irlanda|holanda|pa[ií]ses\\s+bajos|suiza'
    const paisesExtranjeros = new RegExp(`(${PAISES_EXT_INNER})`, 'i').test(t)
    // declaraTransferencia acepta dos formas:
    //  (a) la formula literal "transferencia internacional / flujo
    //      transfronterizo / fuera del pais / fuera del peru / datos al
    //      extranjero / paises con nivel adecuado".
    //  (b) identificacion del destinatario por su ubicacion en un pais
    //      extranjero ("ubicado/domiciliado/sede/oficinas en ... Estados
    //      Unidos / USA / Chile / ..."). El Art. 15 Ley 29733 + Art.
    //      6.1.7 DS 016-2024-JUS no exigen la frase literal "transferencia
    //      internacional": basta con que la politica nombre al
    //      destinatario y a su pais. Caso real starbucks.pe: declara
    //      "Amazon Web Service Inc, ubicado en ..., USA" y "Salesforce
    //      INC, ubicado en Dulles - Virgina - Estados Unidos" — esa es
    //      la forma estandar en politicas peruanas y deberia contar como
    //      declaracion (la deficiencia que QUEDA ahi es no informar el
    //      sustento legal de la transferencia, que es PARCIAL).
    const formulaLiteral = /(transferencia\s+internacional|flujo\s+transfronterizo|fuera\s+del\s+país|fuera\s+del\s+perú|datos.*al\s+extranjero|países\s+con\s+nivel\s+adecuado)/i.test(t)
    const destinatarioUbicadoEnExterior = new RegExp(
      `(ubicad[oa]\\s+en|domiciliad[oa]\\s+en|con\\s+sede\\s+en|sede\\s+(social\\s+)?en|domicilio\\s+(social\\s+)?en|oficinas?\\s+en|residen(cia|te)?\\s+en|establecid[oa]\\s+en)[^.]{0,250}(${PAISES_EXT_INNER})`,
      'i',
    ).test(t)
    const declaraTransferencia = formulaLiteral || destinatarioUbicadoEnExterior
    const declaraNoTransfiere = declaraQueNoComparte(t)

    if (declaraNoTransfiere) return { cumple: true }
    if ((mencionaServicioExterno || paisesExtranjeros) && !declaraTransferencia) {
      return {
        cumple: false,
        nivel: 'TRANSFERENCIA_NO_DECLARADA',
        detalles: ['Se detectan servicios o referencias a países extranjeros que implican transferencia internacional de datos sin que la política la declare formalmente (Art. 15 Ley 29733 + Art. 6.1.7 DS 016-2024-JUS)']
      }
    }
    if (declaraTransferencia) {
      // Cualquiera de:
      // (a) un pais de la lista de paisesExtranjeros — independientemente
      //     de su construccion sintactica ("Localizacion: Estados Unidos",
      //     "almacenamiento en USA", etc.). El regex original solo
      //     reconocia "a Pais" o "hacia Pais", lo que dejaba afuera
      //     declaraciones por bullet/etiqueta.
      // (b) un patron gramatical clasico ("a [Pais]", "hacia [Pais]",
      //     "pais destinatario", "[Empresa] (proveedor").
      const indicaPais = paisesExtranjeros || /(a\s+[A-ZÁÉÍÓÚ][a-záéíóú]+|hacia\s+[A-Z]|pa[ií]s\s+destinatario|[A-Z][a-z]+\s+\(proveedor|localizaci[oó]n\s*:|domicilio\s+en\s+[A-Z])/i.test(t)
      // El patron de consentimiento debe ser estricto: "consentimiento
      // expreso/explicito/informado/previo [para/a la] transferencia
      // [internacional]". Antes era `consentimiento.*transferencia` que
      // matcheaba sobre el documento entero (consentimiento general en
      // un parrafo + "transferencia" de activos comerciales en otro) y
      // marcaba CUMPLE politicas que no declaraban sustento legal.
      const mencionaNivelAdecuado = /(nivel\s+adecuado|nivel\s+de\s+protecci[oó]n|cl[áa]usulas\s+contractuales(\s+tipo)?|normas\s+corporativas\s+vinculantes|mecanismo\s+alternativo|consentimiento\s+(expreso|expl[íi]cito|informado|previo|libre)[^.]{0,80}(la\s+|esta\s+|dicha\s+|para\s+(la\s+)?)?transferencia|transferencia\s+[^.]{0,80}consentimiento\s+(expreso|expl[íi]cito|informado|previo|libre)|garant[ií]as\s+(adecuadas|suficientes))/i.test(t)
      if (!indicaPais) {
        return {
          cumple: false,
          nivel: 'SIN_PAIS_DESTINATARIO',
          detalles: ['Se declara transferencia internacional pero no se identifica el país o países destinatarios (Art. 15 Ley 29733 + Art. 6.1.7 DS 016-2024-JUS + Guía ANPDP sobre el Deber de Informar §4.5).'],
        }
      }
      if (!mencionaNivelAdecuado) {
        // PARCIAL: el pais SI esta identificado, pero falta el otro
        // componente que exige el Art. 15: declarar si el destinatario
        // cuenta con nivel adecuado de proteccion reconocido por la
        // ANPDP o, en su defecto, el mecanismo alternativo aplicable.
        return {
          cumple: 'PARCIAL',
          nivel: 'SIN_NIVEL_PROTECCION',
          detalles: [
            'La política identifica el país destinatario de la transferencia internacional, pero no indica el sustento legal de la transferencia: ni el "nivel adecuado de protección" reconocido por la ANPDP, ni el mecanismo alternativo aplicable — cláusulas contractuales tipo, normas corporativas vinculantes, consentimiento explícito del titular u otro — exigido por el Art. 15 Ley 29733 + Arts. 11 a 13 DS 016-2024-JUS + Guía ANPDP sobre el Deber de Informar §4.5.',
          ],
        }
      }
    }
    return { cumple: true }
  },

  // A.5 — BANCO DE DATOS
  // menciona: el texto habla de un banco/base de datos personales o RNPDP.
  //   Acepta plural ("bancos de datos") y singular ("banco de datos").
  // tieneCodigoRNPDP: el codigo de inscripcion puede aparecer en varios
  //   formatos. Antes solo se aceptaba el patron canonico "RNPDP N° XXXXX",
  //   pero en politicas peruanas reales tambien aparece como:
  //     "con registro 19086"
  //     "registro N° 19086"
  //     "codigo de inscripcion: 19086"
  //     "inscrito con N° 19086"
  //     "banco de datos denominado X, N° 19086"
  bancoDatos(t: string): ResultadoDetector {
    const menciona = /(bancos?\s+de\s+datos|bases?\s+de\s+datos\s+personal|RNPDP|registro\s+nacional)/i.test(t)
    const tieneCodigoRNPDP =
      // (a) Forma canonica: RNPDP N° XXXXX (o RNPDP: XXXXX, RNPDP 19086).
      /RNPDP\s*[n°º\-:#]?\s*\d{3,}/i.test(t) ||
      // (b) "registro|inscripcion|codigo de inscripcion" + digitos, con o
      //     sin separador y con o sin "N°" intermedio. Como ya validamos
      //     que el texto habla de un banco de datos, "registro 19086" o
      //     "con registro 19086" se interpreta razonablemente como el
      //     codigo de inscripcion en el RNPDP.
      /\b(?:con\s+)?(?:registro|inscripci[oó]n|c[oó]digo\s+de\s+inscripci[oó]n)\s*(?:[#:.-]\s*|n[°º]?\s*[:.]?\s*)?\d{3,}/i.test(t) ||
      // (c) "N° XXXXX" o "Nro XXXXX" cerca de la mencion del banco de datos
      //     (dentro de ~300 caracteres / misma oracion extendida).
      /(?:bancos?|bases?)\s+de\s+datos[^.]{0,300}\b(?:n[°º]|nro\.?|num\.?)\s*[:.]?\s*\d{3,}/i.test(t)

    if (!menciona) return { cumple: false, nivel: 'AUSENCIA', detalles: ['La política no menciona el banco de datos en que se almacenarán los datos (Art. 18 Ley 29733 — deber de informar + Art. 6.1.4 DS 016-2024-JUS + Guía ANPDP sobre el Deber de Informar §4.4).'] }
    if (!tieneCodigoRNPDP) return { cumple: 'PARCIAL', nivel: 'SIN_CODIGO_RNPDP', detalles: ['Se menciona el banco de datos pero no se indica el código de inscripción en el Registro Nacional de Protección de Datos Personales — RNPDP (Art. 29 + Art. 34 Ley 29733 — inscripción obligatoria del banco de datos + Art. 6.1.4 DS 016-2024-JUS + Guía ANPDP sobre el Deber de Informar §4.4).'] }
    return { cumple: true }
  },

  // A.6 — CARÁCTER OBLIGATORIO / FACULTATIVO
  obligatoriedad(t: string): ResultadoDetector {
    const tieneDistincion = /(obligatorio|facultativo|requerido|opcional|campo.*obligatorio|datos.*necesarios.*para|datos.*indispensables|marcados?\s+con\s+\*|asterisco.*obligatorio|\*\s*campo.*obligatorio)/i.test(t)
    const mencionaSensibles = /(dato.*sensible|salud|biométrico|étnico|racial|religioso|político|sindical|orientación sexual)/i.test(t)
    const indicaObligatoriedad = /(obligatorio|necesario|requerido)/i.test(t)
    if (!tieneDistincion) return { cumple: false, nivel: 'AUSENCIA', detalles: ['No se informa qué datos son de entrega obligatoria y cuáles facultativos (Art. 18 Ley 29733)'] }
    if (mencionaSensibles && !indicaObligatoriedad) return { cumple: false, nivel: 'SIN_INDICACION_EN_SENSIBLES', detalles: ['Se mencionan datos sensibles pero no se explicita el carácter obligatorio o facultativo de su entrega — la Guía ANPDP §4.3 señala que esta indicación es ineludible para datos sensibles'] }
    return { cumple: true }
  },

  // A.7 — CONSECUENCIAS
  consecuencias(t: string): ResultadoDetector {
    const tienePositivaONegativa = /(consecuencia|no\s+podremos|en\s+caso\s+de\s+no|si\s+no\s+proporciona|negativa\s+a|sin\s+proporcionar|de\s+no\s+facilitar|no\s+se\s+podrá\s+brindar|no\s+será\s+posible\s+atender)/i.test(t)
    return {
      cumple: tienePositivaONegativa,
      detalles: tienePositivaONegativa ? [] : ['No se informa sobre las consecuencias de proporcionar los datos ni de la negativa a hacerlo (Art. 18 Ley 29733 + Guía ANPDP §4.4)']
    }
  },

  // A.8 — PLAZO DE CONSERVACIÓN
  plazoConservacion(t: string): ResultadoDetector {
    const tieneAlgoPlazo = /(conserva|almacena|retenci[oó]n|plazo|tiempo.*datos|[0-9]+\s*(año|mes|día)|mientras.*vigente|mientras.*dure|hasta.*cancelaci)/i.test(t)
    const plazosVagos = [
      /tiempo\s+necesario/i,
      /plazo\s+razonable/i,
      /lo\s+que\s+sea\s+necesario/i,
      /el\s+tiempo\s+que\s+corresponda/i,
      /mientras\s+sea\s+necesario\s*\./i,
      /tiempo\s+indeterminado/i,
      /indefinidamente/i,
      /hasta\s+nuevo\s+aviso\s*\./i,
    ]
    const esVago = plazosVagos.some(r => r.test(t))
    const plazoDeterminado = /(\d+\s*(año|mes|día|semana)|mientras\s+dure\s+la\s+relaci[oó]n|hasta\s+que\s+revoque|durante\s+la\s+vigencia\s+del\s+contrato|hasta\s+que\s+solicite\s+su\s+cancelaci[oó]n)/i.test(t)
    if (!tieneAlgoPlazo) return { cumple: false, nivel: 'AUSENCIA', detalles: ['La política no incluye el plazo de conservación de los datos (Art. 18 Ley 29733 + Art. 6.1.9 DS 016-2024-JUS)'] }
    // El plazo VAGO se trata como PARCIAL: la politica menciona un plazo
    // pero deficientemente. La ausencia total se mantiene como incumple
    // total porque ahi falta el elemento por completo.
    if (esVago && !plazoDeterminado) return { cumple: 'PARCIAL', nivel: 'PLAZO_INDETERMINADO', detalles: ['El plazo de conservación es vago e indeterminado. La normativa exige plazo determinado o, al menos, criterio determinable (Art. 8 — principio de calidad + Art. 18 Ley 29733 + Art. 6.1.9 DS 016-2024-JUS + Guía ANPDP sobre el Deber de Informar §4.6).'] }
    return { cumple: true }
  },

  // A.9 — DERECHOS ARCO + REVOCACIÓN + ANPDP
  derechosARCO(t: string): ResultadoDetector {
    const resultado: ResultadoDetector = { cumple: true, faltantes: [], detalles: [] }
    const mencionaDerechos = /(derechos?\s+(de\s+)?(acceso|rectificaci[oó]n|cancelaci[oó]n|oposici[oó]n)|derechos?\s+ARCO|titular.*derechos?)/i.test(t)
    if (!mencionaDerechos) return { cumple: false, nivel: 'AUSENCIA_TOTAL', detalles: ['La política no hace mención de los derechos del titular (derechos ARCO: acceso, rectificación, cancelación y oposición — Arts. 18 a 25 Ley 29733 + Art. 6.1.10 DS 016-2024-JUS + Guía ANPDP sobre el Deber de Informar §4.7).'] }
    const tieneEmail = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/i.test(t)
    const tieneDireccionFisica = /(mesa\s+de\s+partes|nuestras\s+oficinas|en\s+(la\s+)?direcci[oó]n|presencialmente\s+en)/i.test(t)
    const tieneFormulario = /(formulario|form|portal|plataforma|sistema)\s+(de\s+)?(solicitud|ARCO|derechos)/i.test(t)
    const tieneCanal = tieneEmail || tieneDireccionFisica || tieneFormulario
    if (!tieneCanal) {
      resultado.faltantes?.push('SIN_CANAL_VERIFICABLE')
      resultado.detalles?.push('No se indica un canal concreto y verificable para ejercer los derechos ARCO — correo electrónico, dirección física o formulario (Art. 19 Ley 29733 — derecho a contactar al responsable + Art. 6.1.10 DS 016-2024-JUS + Guía ANPDP sobre el Deber de Informar §4.7).')
    }
    const mencionaRevocacion = /(revocar|revocaci[oó]n|retirar.*consentimiento|dejar\s+de\s+autorizar|cancelar.*consentimiento)/i.test(t)
    if (!mencionaRevocacion) {
      resultado.faltantes?.push('SIN_REVOCACION')
      resultado.detalles?.push('No se informa sobre el derecho de revocación del consentimiento en cualquier momento (Art. 10 DS 016-2024-JUS)')
    }
    const mencionaANPDP = /(ANPDP|DGTAIPD|Autoridad\s+Nacional\s+de\s+Protecci[oó]n|tutela|Ministerio\s+de\s+Justicia.*protecci[oó]n\s+de\s+datos)/i.test(t)
    if (!mencionaANPDP) {
      resultado.faltantes?.push('SIN_REFERENCIA_ANPDP')
      resultado.detalles?.push('No se menciona a la Autoridad Nacional de Protección de Datos Personales — ANPDP como autoridad ante la que el titular puede ejercer su derecho de tutela (Art. 24 Ley 29733 — derecho de tutela + Guía ANPDP sobre el Deber de Informar §4.7).')
    }
    // Si la politica MENCIONA los derechos ARCO pero faltan uno o mas
    // sub-elementos, es cumplimiento PARCIAL. Solo es incumplimiento
    // total cuando la politica no menciona los derechos en absoluto
    // (rama AUSENCIA_TOTAL arriba).
    if ((resultado.faltantes?.length || 0) > 0) {
      resultado.cumple = 'PARCIAL'
      if (!resultado.nivel) resultado.nivel = resultado.faltantes?.join('+')
    }
    return resultado
  },

  // A.10 — DECISIONES AUTOMATIZADAS Y PERFILAMIENTO
  decisionesAutomatizadas(t: string): ResultadoDetector {
    const indiciosPerfil = /(perfilamiento|profiling|scoring\s+crediticio|segmentaci[oó]n\s+autom|decisión\s+autom|procesamiento\s+autom|inteligencia\s+artificial.*decisión|algoritmo.*evalúa|sistema.*determina\s+autom)/i.test(t)
    const loInforma = /(elaboraci[oó]n\s+de\s+perfiles|perfilamiento.*le\s+inform|le\s+comunicamos.*perfil|decisiones\s+autom.*consecuencias|sus\s+datos.*ser[aá]n\s+usados\s+para\s+.*perfil)/i.test(t)
    if (indiciosPerfil && !loInforma) {
      return { cumple: false, nivel: 'PERFILAMIENTO_NO_INFORMADO', detalles: ['Se detectan indicios de perfilamiento o decisiones automatizadas sin que la política informe al titular sobre su existencia y consecuencias (Art. 6.1.8 DS 016-2024-JUS — obligación del reglamento vigente)'] }
    }
    return { cumple: true }
  },

  // A.11 — CALIDAD DEL LENGUAJE Y FORMA
  calidadLenguaje(t: string): ResultadoDetector {
    const alertas: string[] = []
    const tieneTranscripcionLegal = /(artículo\s+\d+[°º]?\s*[\.\-]\s*[A-Z].{50,200}artículo\s+\d+|según\s+lo\s+dispuesto\s+en\s+el\s+artículo\s+\d+\s+de\s+la\s+ley\s+n[°º]?\s*\d{5})/i.test(t)
    if (tieneTranscripcionLegal) alertas.push('CITAS_LEGALES_LITERALES')
    const frasesConfusas = [
      /acepta.*los.*términos.*y.*condiciones.*y.*la.*política/i,
      /al\s+(usar|navegar|acceder|continuar).*acepta/i,
      /entendemos\s+que\s+acepta/i,
      /se\s+entiende\s+que\s+consiente/i,
      /su\s+silencio\s+implica\s+aceptaci[oó]n/i,
    ]
    if (frasesConfusas.some(r => r.test(t))) alertas.push('CONSENTIMIENTO_POR_CONDUCTA_IMPLICITA')
    if (t.length < 800) alertas.push('POLITICA_POSIBLEMENTE_INSUFICIENTE_POR_LONGITUD')
    return alertas.length > 0
      ? {
          cumple: false,
          nivel: alertas.join('+'),
          detalles: alertas.map(a => {
            if (a === 'CITAS_LEGALES_LITERALES') return 'La política incluye transcripciones literales de artículos de ley — la Guía ANPDP §5 recomienda usar lenguaje sencillo y evitar citas legales'
            if (a === 'CONSENTIMIENTO_POR_CONDUCTA_IMPLICITA') return 'Se usa lenguaje que induce a pensar que continuar navegando o usar el servicio equivale a otorgar consentimiento — esto no es un consentimiento expreso válido (Art. 5 DS 016-2024-JUS)'
            if (a === 'POLITICA_POSIBLEMENTE_INSUFICIENTE_POR_LONGITUD') return 'La política es muy breve para contener todos los elementos exigidos por el Art. 18 Ley 29733 — revisar completitud'
            return a
          })
        }
      : { cumple: true }
  },

  // A.12 — VIGENCIA NORMATIVA
  reglamentoVigente(t: string): ResultadoDetector {
    const alertas: string[] = []
    if (/DS[.\s]*003[-–]2013|003[-–]2013[-–]JUS|D\.S\.N[°º].*003.*2013/i.test(t)) alertas.push('CITA_REGLAMENTO_DEROGADO')
    if (/GDPR|reglamento.*europeo.*protecci[oó]n|EU\s+2016\/679|directiva.*95\/46/i.test(t) && !/ley.*29733|29733/i.test(t)) alertas.push('SOLO_GDPR_SIN_NORMATIVA_PERUANA')
    if (!/ley.*29733|29733/i.test(t)) alertas.push('SIN_MENCION_LEY_29733')
    return alertas.length > 0 ? { cumple: false, nivel: alertas.join('+'), alertas } : { cumple: true }
  },
}

// ─────────────────────────────────────────────────
// NIVEL 2: REGLAS DE FORMULARIOS (desde el HTML)
// ─────────────────────────────────────────────────

const detForm = {

  // B.2 — Checkbox pre-marcado (Art. 5 DS 016 — consentimiento NO puede ser pasivo)
  checkboxPreMarcado(formularios: FormularioDetectado[]): FormularioDetectado[] {
    return formularios.filter(f => f.checkbox_premarcado === true)
  },

  // B.2 — Sin mecanismo de consentimiento activo
  sinConsentimientoActivo(formularios: FormularioDetectado[]): FormularioDetectado[] {
    // Formularios que capturan datos personales pero no tienen ningún checkbox
    return formularios.filter(f => {
      const tieneCamposPersonales = f.campos?.some(c =>
        /(nombre|apellido|email|correo|dni|telefono|direcci[oó]n)/i.test(c.name || c.placeholder || c.label || '')
      )
      return tieneCamposPersonales && !f.tiene_checkbox_consentimiento
    })
  },

  // B.1 — Sin enlace a política de privacidad en el formulario
  sinLinkPolitica(formularios: FormularioDetectado[]): FormularioDetectado[] {
    return formularios.filter(f => {
      const tieneCamposPersonales = f.campos?.some(c =>
        /(nombre|apellido|email|correo|dni|telefono)/i.test(c.name || c.placeholder || c.label || '')
      )
      return tieneCamposPersonales && !f.tiene_link_politica
    })
  },

  // B.3 — Datos sensibles en formulario sin garantía de consentimiento escrito
  datosSensibles(formularios: FormularioDetectado[]): FormularioDetectado[] {
    const camposSensibles = /(salud|enfermedad|diagnóstico|discapacidad|religion|etnia|raza|político|sindical|orientaci[oó]n sexual|biométri|huella|facial|iris)/i
    return formularios.filter(f =>
      f.campos?.some(c => camposSensibles.test(c.name || c.placeholder || c.label || ''))
    )
  },

  // B.5 — Marketing/publicidad sin checkbox separado
  // El formulario declara contexto de marketing/publicidad (en pagina_origen,
  // texto del form, o campos como "newsletter"/"suscripcion") pero no tiene
  // un checkbox SEPARADO con label de marketing/publicidad. La normativa
  // exige consentimiento independiente para las finalidades adicionales:
  // Art. 18 Ley 29733 + Art. 5 + Art. 10.2 DS 016-2024-JUS + Guia ANPDP §4.2.
  marketingSinCheckboxSeparado(formularios: FormularioDetectado[]): FormularioDetectado[] {
    return formularios.filter((f) => {
      if (!f.contexto_marketing) return false
      const tieneMarketing = (f.checkboxes ?? []).some(
        (c) => c.tipo === 'MARKETING_PUBLICIDAD',
      )
      return !tieneMarketing
    })
  },

  // B.4 — Campos posiblemente excesivos para la finalidad aparente
  datosExcesivos(formularios: FormularioDetectado[]): DatoExcesivoDetectado[] {
    const alertas: DatoExcesivoDetectado[] = []
    formularios.forEach(f => {
      const pagina = f.pagina_origen || ''
      const esContacto = /contact|consul|mensaje/i.test(pagina)
      const esSuscripcion = /suscri|newsletter|boletin/i.test(pagina)
      const campitos = f.campos?.map(c => c.name || c.placeholder || c.label || '') || []

      if (esContacto) {
        const tieneDNI = campitos.some(c => /dni|documento|identidad/i.test(c))
        const tieneTarjeta = campitos.some(c => /tarjeta|crédito|débito|cvv/i.test(c))
        if (tieneDNI) alertas.push({ formulario: pagina, dato_excesivo: 'DNI en formulario de contacto' })
        if (tieneTarjeta) alertas.push({ formulario: pagina, dato_excesivo: 'Datos de tarjeta en formulario de contacto' })
      }
      if (esSuscripcion) {
        const tieneDNI = campitos.some(c => /dni|documento/i.test(c))
        const tieneDir = campitos.some(c => /direcci[oó]n|domicilio/i.test(c))
        if (tieneDNI) alertas.push({ formulario: pagina, dato_excesivo: 'DNI en formulario de suscripción' })
        if (tieneDir) alertas.push({ formulario: pagina, dato_excesivo: 'Dirección en formulario de suscripción' })
      }
    })
    return alertas
  },
}

// ─────────────────────────────────────────────────
// NIVEL 3: REGLAS DE COOKIES Y TERCEROS
// ─────────────────────────────────────────────────

const detCookies = {
  // Detecta trackers de terceros en el HTML que implican flujo transfronterizo
  trackersDetectados(htmlCompleto: string): string[] {
    const trackers = {
      'Google Analytics / GTM': /googletagmanager|google-analytics|gtag\(/i,
      'Meta Pixel (Facebook)': /facebook\.net\/tr|fbq\(|connect\.facebook/i,
      'LinkedIn Insight': /linkedin\.com\/li\.lms-analytics|snap\.licdn/i,
      'HubSpot': /hs-scripts\.com|hubspot\.com\/hs/i,
      'Hotjar': /hotjar\.com|hjBootstrap/i,
      'Zendesk': /zendesk\.com\/embeddable/i,
      'Intercom': /intercom\.io|widget\.intercom/i,
      'TikTok Pixel': /analytics\.tiktok\.com/i,
    }
    const encontrados: string[] = []
    for (const [nombre, regex] of Object.entries(trackers)) {
      if (regex.test(htmlCompleto)) encontrados.push(nombre)
    }
    return encontrados
  },

  // Verifica si el banner de cookies permite rechazo granular
  bannerAdecuado(textoCookies: string): ResultadoBannerCookies {
    if (!textoCookies) return { adecuado: false, nivel: 'SIN_BANNER' }
    const permiteRechazar = /(rechazar|no acepto|solo.*necesarias|personalizar|configurar.*cookies)/i.test(textoCookies)
    const soloBtnAceptar = /aceptar/i.test(textoCookies) && !permiteRechazar
    if (soloBtnAceptar) return { adecuado: false, nivel: 'SOLO_BOTON_ACEPTAR' }
    if (!permiteRechazar) return { adecuado: false, nivel: 'SIN_OPCION_RECHAZAR' }
    return { adecuado: true }
  },
}

// ─────────────────────────────────────────────────
// NIVEL 4: CONTADOR PARA INFRACCIÓN ART. 132.5 vs 133.2
// La distinción entre leve y grave depende del NÚMERO de
// elementos faltantes del Art. 18 Ley 29733
// ─────────────────────────────────────────────────

function clasificarInfraccionDeber(elementosFaltantes: number): ClasificacionInfraccion {
  // Art. 132.5 DS 016: leve si faltan 1-2 condiciones del Art. 18
  // Art. 133.2 DS 016: grave si faltan 3 o más condiciones del Art. 18
  if (elementosFaltantes <= 0) return null
  if (elementosFaltantes <= 2) return {
    tipo: 'LEVE',
    articulo: 'Art. 132.5 DS 016-2024-JUS',
    rango_multa: '0.5 a 5 UIT'
  }
  return {
    tipo: 'GRAVE',
    articulo: 'Art. 133.2 DS 016-2024-JUS',
    rango_multa: 'más de 5 hasta 50 UIT'
  }
}

// ─────────────────────────────────────────────────
// MOTOR PRINCIPAL
// ─────────────────────────────────────────────────

export async function analizarCumplimiento(datosCrawler: DatosCrawlerEntrada = {}): Promise<ResultadoAuditoria> {
  const {
    url_auditada = '',
    politica_privacidad: politicaPrivacidadEntrada,
    formularios: formulariosEntrada,
    cookies_banner: cookiesBannerEntrada,
    html_completo: htmlCompletoEntrada,
    advertencias_crawler: advertenciasCrawlerEntrada,
  } = datosCrawler
  const advertenciasCrawler = Array.isArray(advertenciasCrawlerEntrada) ? advertenciasCrawlerEntrada : []
  const politica_privacidad: PoliticaPrivacidadDetectada = politicaPrivacidadEntrada ?? { encontrada: false, texto: '' }
  const formularios: FormularioDetectado[] = Array.isArray(formulariosEntrada) ? formulariosEntrada : []
  const cookies_banner: CookiesBannerDetectado = cookiesBannerEntrada ?? { encontrado: false, texto: '' }
  const html_completo = typeof htmlCompletoEntrada === 'string' ? htmlCompletoEntrada : ''
  const texto = typeof politica_privacidad.texto === 'string' ? politica_privacidad.texto : ''
  // "Hay política" significa: el crawler la encontro Y el texto extraido
  // es suficiente para sostener una evaluacion (umbral 100 chars, ver
  // OBS-01 mas abajo). Si esto es false, todas las reglas Art. 18 caen a
  // INCUMPLE y ningun detector puede levantar un "cumplido": A.10 y A.11
  // son detectores en negativo ("no detecte perfilamiento", "no detecte
  // mal lenguaje") que devuelven cumple=true vacuamente sobre texto
  // vacio, y sin esta puerta se colaban como cumplidos espurios.
  const hayPolitica = Boolean(politica_privacidad?.encontrada) && texto.length >= 100
  const observaciones: Observacion[] = []
  let contadorElementosFaltantesArt18 = 0

  // Resultados de los detectores: se calculan una sola vez y se reutilizan
  // tanto para levantar observaciones como para el calculo de
  // elementos_cumplidos al final. Si la politica no existe los detectores
  // corren sobre texto vacio y todos devuelven cumple=false, que es el
  // comportamiento esperado.
  const detectores = {
    identidad: det.identidadResponsable(texto),
    finalidad: det.finalidad(texto),
    destinatarios: det.destinatarios(texto),
    transferencia: det.transferenciaInternacional(texto),
    bancoDatos: det.bancoDatos(texto),
    obligatoriedad: det.obligatoriedad(texto),
    consecuencias: det.consecuencias(texto),
    plazo: det.plazoConservacion(texto),
    arco: det.derechosARCO(texto),
    automatizadas: det.decisionesAutomatizadas(texto),
    lenguaje: det.calidadLenguaje(texto),
    reglamento: det.reglamentoVigente(texto),
  }

  // ── MÓDULO A: POLÍTICA DE PRIVACIDAD ──

  // A.0 — Existencia de la política. Si no existe se emite una observacion
  // MUY GRAVE (incumplimiento total del deber de informar Art. 18 + Art.
  // 133.2 DS 016-2024-JUS) y se DEJA QUE corran los chequeos A.2–A.12
  // sobre texto vacio: cada elemento ausente del Art. 18 emite su propia
  // observacion. Esto evita la incoherencia previa en que el cuadro_art18
  // mostraba 8 INCUMPLE pero el puntaje solo deducia un GRAVE — situacion
  // en la que "no tener politica" puntuaba mejor que "tener una politica
  // mala con los mismos elementos faltantes".
  if (!hayPolitica) {
    observaciones.push({
      id: `OBS-${String(observaciones.length + 1).padStart(2, '0')}`,
      modulo: 'A',
      categoria: 'Existencia de política de privacidad',
      severidad: 'MUY GRAVE',
      hallazgo: 'No se encontró política de privacidad publicada o accesible en el sitio web. Esto configura un incumplimiento total del deber de informar.',
      evidencia: 'AUSENTE: no se encontró documento de política de privacidad.',
      norma_vulnerada: 'Art. 18 párrafo 2 Ley 29733 + Art. 7 DS 016-2024-JUS',
      riesgo_infraccion: 'muy grave',
      base_infraccion: 'Art. 133.2 DS 016-2024-JUS (incumplimiento total del deber de informar)',
      recomendacion: 'Publicar una Política de Privacidad fácilmente accesible e identificable desde el sitio web, preferiblemente desde el footer, que cubra todos los elementos exigidos por el Art. 18 Ley 29733.'
    })
  }

  {

    // A.2 — Identidad y domicilio
    const r_identidad = detectores.identidad
    if (!r_identidad.cumple || r_identidad.cumple === 'PARCIAL') {
      if (!r_identidad.cumple) contadorElementosFaltantesArt18++
      const esParcialIdentidad = r_identidad.cumple === 'PARCIAL'
      observaciones.push({
        id: `OBS-${String(observaciones.length + 1).padStart(2, '0')}`,
        modulo: 'A',
        categoria: 'Identidad y domicilio del responsable',
        severidad: esParcialIdentidad ? 'MODERADA' : 'IMPORTANTE',
        hallazgo: r_identidad.nivel === 'AUSENCIA_TOTAL'
          ? 'No se identifica al titular del banco de datos ni su domicilio.'
          : r_identidad.nivel === 'SIN_RAZON_SOCIAL' || r_identidad.nivel === 'SIN_NOMBRE'
            ? 'La política no identifica claramente la razón social del responsable del tratamiento.'
            : 'La política identifica al responsable pero su domicilio está incompleto (falta vía, número o distrito).',
        evidencia: esParcialIdentidad ? 'Identificación PARCIAL en la política.' : 'AUSENTE en el texto de la política.',
        norma_vulnerada: 'Art. 18 Ley 29733 + Art. 6.1.1 DS 016-2024-JUS + Guía ANPDP §4.1',
        riesgo_infraccion: 'leve/grave (según total de elementos faltantes)',
        base_infraccion: 'Art. 132.5 o 133.2 DS 016-2024-JUS',
        recomendacion: esParcialIdentidad
          ? 'Completar la dirección con vía (Av./Calle/Jr./etc.), número y distrito/provincia.'
          : 'Incluir nombre o razón social completa y dirección física del responsable del tratamiento.'
      })
    }

    // A.3 — Finalidad. Hallazgo y recomendacion se ajustan al nivel
    // emitido por el detector para no contradecirse con los detalles:
    // antes el header decia siempre "no declara finalidades" aunque
    // el problema real fuera otro (finalidades adicionales sin
    // distincion, sin mecanismo de negativa, etc.).
    const r_finalidad = detectores.finalidad
    if (!r_finalidad.cumple || r_finalidad.cumple === 'PARCIAL') {
      if (!r_finalidad.cumple) contadorElementosFaltantesArt18++
      const esParcialFinalidad = r_finalidad.cumple === 'PARCIAL'
      const nivelFin = r_finalidad.nivel || ''
      let hallazgoFin: string
      let recomendacionFin: string
      if (nivelFin === 'AUSENCIA_TOTAL') {
        hallazgoFin = 'La política no declara ninguna finalidad del tratamiento.'
        recomendacionFin = 'Declarar de forma clara, explícita y lícita las finalidades para las que se tratan los datos.'
      } else if (nivelFin.startsWith('FINALIDAD_GENERICA')) {
        hallazgoFin = 'Las finalidades declaradas usan frases genéricas o expresiones imprecisas prohibidas por la Guía ANPDP §4.2.'
        recomendacionFin = 'Reformular las finalidades de forma específica, evitando expresiones como "fines comerciales", "mejora de servicios" o "entre otras finalidades". Cada finalidad debe poder identificarse por sí sola.'
      } else if (nivelFin.includes('CONSENTIMIENTO_EN_BLOQUE')) {
        hallazgoFin = 'Se solicita consentimiento en bloque para finalidades principales y adicionales con una sola casilla — práctica prohibida por la Guía ANPDP §5.'
        recomendacionFin = 'Separar las casillas de consentimiento por finalidad. El titular debe poder aceptar la finalidad principal sin verse obligado a aceptar las adicionales.'
      } else if (nivelFin.includes('CONDICIONAMIENTO_ILICITO')) {
        hallazgoFin = 'Se condiciona la prestación del servicio a la aceptación de finalidades adicionales no indispensables — práctica prohibida por el Art. 3.2 DS 016-2024-JUS.'
        recomendacionFin = 'Eliminar el condicionamiento. El servicio principal debe poder prestarse aunque el titular rechace las finalidades adicionales (marketing, perfilamiento, etc.).'
      } else if (nivelFin.includes('SIN_DISTINCION_FINALIDADES')) {
        hallazgoFin = 'La política declara finalidades adicionales (marketing, publicidad, perfilamiento) sin distinguirlas de las finalidades principales o consustanciales al servicio.'
        recomendacionFin = 'Identificar expresamente qué finalidades son principales y cuáles adicionales, e implementar un consentimiento independiente para cada finalidad adicional.'
      } else if (nivelFin.includes('SIN_MECANISMO_NEGATIVA')) {
        hallazgoFin = 'Las finalidades adicionales declaradas no cuentan con un mecanismo de negativa independiente disponible al titular.'
        recomendacionFin = 'Implementar un mecanismo de oposición independiente para las finalidades adicionales (checkbox separado, opción "no acepto", botón de baja, etc.).'
      } else {
        hallazgoFin = 'La declaración de finalidades del tratamiento presenta uno o más problemas exigidos por la normativa. Revisar los detalles por sub-elemento.'
        recomendacionFin = 'Revisar las finalidades declaradas a la luz del Art. 7 (principio de finalidad) y la Guía ANPDP §4.2.'
      }
      // Niveles "hard" (ausencia total, condicionamiento ilicito o
      // consentimiento en bloque): practicas prohibidas o ausencia
      // completa → GRAVE. Niveles "soft" (finalidad generica, sin
      // distincion, sin mecanismo de negativa): la politica DECLARA
      // finalidades pero con deficiencias subsanables → IMPORTANTE.
      const severidadFin: 'GRAVE' | 'IMPORTANTE' = esParcialFinalidad ? 'IMPORTANTE' : 'GRAVE'
      observaciones.push({
        id: `OBS-${String(observaciones.length + 1).padStart(2, '0')}`,
        modulo: 'A',
        categoria: 'Finalidad del tratamiento',
        severidad: severidadFin,
        hallazgo: hallazgoFin,
        evidencia: nivelFin === 'AUSENCIA_TOTAL' ? 'AUSENTE en la política.' : 'INSUFICIENTE o INCORRECTA en la política.',
        norma_vulnerada: 'Art. 7 (principio de finalidad) + Art. 18 Ley 29733 + Art. 10.2 DS 016-2024-JUS + Guía ANPDP sobre el Deber de Informar §4.2',
        riesgo_infraccion: severidadFin === 'GRAVE' ? 'grave' : 'leve',
        base_infraccion: severidadFin === 'GRAVE' ? 'Art. 133.3 DS 016-2024-JUS' : 'Art. 132.5 DS 016-2024-JUS',
        recomendacion: recomendacionFin,
      })
    }

    // A.4 — Destinatarios
    const r_dest = detectores.destinatarios
    if (!r_dest.cumple) {
      contadorElementosFaltantesArt18++
      observaciones.push({
        id: `OBS-${String(observaciones.length + 1).padStart(2, '0')}`,
        modulo: 'A',
        categoria: 'Destinatarios de los datos',
        severidad: 'GRAVE',
        hallazgo: 'La política no informa sobre los destinatarios o receptores de los datos personales.',
        evidencia: 'AUSENTE: no se encontró mención de destinatarios en la política.',
        norma_vulnerada: 'Art. 18 Ley 29733 + Art. 6.1.3 DS 016-2024-JUS',
        riesgo_infraccion: 'grave',
        base_infraccion: 'Art. 133.2 DS 016-2024-JUS',
        recomendacion: 'Identificar a los destinatarios o categorías de destinatarios. Si no hay transferencia a terceros, declararlo expresamente.'
      })
    }

    // A.4b — Transferencia internacional
    // El detector puede emitir tres niveles distintos. Antes el hallazgo
    // y la recomendacion combinaban "no se identifica país NI nivel de
    // proteccion", que era contradictorio cuando el pais SI estaba
    // identificado (caso reportado en capece.org.pe). Ahora cada nivel
    // tiene su propio texto.
    const r_transf = detectores.transferencia
    if (!r_transf.cumple || r_transf.cumple === 'PARCIAL') {
      if (!r_transf.cumple) contadorElementosFaltantesArt18++
      const nivelT = r_transf.nivel || ''
      let hallazgoT: string
      let evidenciaT: string
      let recomendacionT: string
      let severidadT: 'GRAVE' | 'IMPORTANTE' | 'MODERADA'
      if (nivelT === 'TRANSFERENCIA_NO_DECLARADA') {
        severidadT = 'GRAVE'
        hallazgoT = 'Se detecta el uso de servicios de terceros en el extranjero (proveedores cloud, analytics, etc.) pero la política no declara el flujo transfronterizo de datos.'
        evidenciaT = 'Indicios de servicios extranjeros detectados en el sitio sin declaración de transferencia internacional.'
        recomendacionT = 'Declarar la transferencia internacional, identificar los países destinatarios e informar si cuentan con nivel adecuado de protección o el mecanismo alternativo aplicable (Art. 15 Ley 29733).'
      } else if (nivelT === 'SIN_PAIS_DESTINATARIO') {
        severidadT = 'IMPORTANTE'
        hallazgoT = 'La política declara transferencia internacional pero no identifica el país o países destinatarios.'
        evidenciaT = 'La política menciona transferencia internacional sin especificar el país destinatario.'
        recomendacionT = 'Identificar expresamente los países destinatarios de la transferencia internacional.'
      } else {
        // SIN_NIVEL_PROTECCION (cumple PARCIAL)
        severidadT = 'MODERADA'
        hallazgoT = 'La política identifica el país destinatario de la transferencia internacional pero no indica el sustento legal de la transferencia (nivel adecuado de protección o mecanismo alternativo).'
        evidenciaT = 'País identificado en la política; falta indicación del nivel adecuado de protección o mecanismo alternativo.'
        recomendacionT = 'Complementar declarando si el país destinatario cuenta con nivel adecuado de protección reconocido por la ANPDP, o el mecanismo alternativo aplicable: cláusulas contractuales tipo, normas corporativas vinculantes (BCR) o consentimiento explícito del titular (Art. 15 Ley 29733 + Arts. 11 a 13 DS 016-2024-JUS).'
      }
      observaciones.push({
        id: `OBS-${String(observaciones.length + 1).padStart(2, '0')}`,
        modulo: 'A',
        categoria: 'Transferencia internacional de datos',
        severidad: severidadT,
        hallazgo: hallazgoT,
        evidencia: evidenciaT,
        norma_vulnerada: 'Art. 15 Ley 29733 + Art. 6.1.7 DS 016-2024-JUS + Arts. 11 a 13 DS 016-2024-JUS + Guía ANPDP sobre el Deber de Informar §4.5',
        riesgo_infraccion: severidadT === 'GRAVE' ? 'grave' : 'leve',
        base_infraccion: severidadT === 'GRAVE' ? 'Art. 133.2 DS 016-2024-JUS' : 'Art. 132.5 DS 016-2024-JUS',
        recomendacion: recomendacionT,
      })
    }

    // A.5 — Banco de datos
    const r_banco = detectores.bancoDatos
    if (!r_banco.cumple || r_banco.cumple === 'PARCIAL') {
      if (!r_banco.cumple) contadorElementosFaltantesArt18++
      observaciones.push({
        id: `OBS-${String(observaciones.length + 1).padStart(2, '0')}`,
        modulo: 'A',
        categoria: 'Banco de datos personales',
        severidad: !r_banco.cumple ? 'IMPORTANTE' : 'MODERADA',
        hallazgo: !r_banco.cumple
          ? 'La política no menciona la existencia del banco de datos en que se almacenarán los datos.'
          : 'Se menciona el banco de datos pero no se indica el código de inscripción en el RNPDP.',
        evidencia: 'AUSENTE o INCOMPLETO en la política.',
        norma_vulnerada: 'Art. 18 Ley 29733 + Art. 6.1.4 DS 016-2024-JUS + Art. 34 Ley 29733',
        riesgo_infraccion: 'leve',
        base_infraccion: 'Art. 132.5 DS 016-2024-JUS',
        recomendacion: 'Indicar el nombre del banco de datos y su código de inscripción en el RNPDP (ej: "RNPDP N° XXXXX"). Verificar que el banco esté efectivamente inscrito.'
      })
    }

    // A.6 — Carácter obligatorio/facultativo
    const r_oblig = detectores.obligatoriedad
    if (!r_oblig.cumple) {
      contadorElementosFaltantesArt18++
      observaciones.push({
        id: `OBS-${String(observaciones.length + 1).padStart(2, '0')}`,
        modulo: 'A',
        categoria: 'Carácter obligatorio o facultativo de los datos',
        severidad: 'IMPORTANTE',
        hallazgo: 'La política no informa qué datos son de entrega obligatoria y cuáles facultativos.',
        evidencia: 'AUSENTE en la política.',
        norma_vulnerada: 'Art. 18 Ley 29733 (especialmente respecto de datos sensibles)',
        riesgo_infraccion: 'leve',
        base_infraccion: 'Art. 132.5 DS 016-2024-JUS',
        recomendacion: 'Indicar expresamente qué campos son obligatorios y cuáles facultativos, con especial énfasis en datos sensibles.'
      })
    }

    // A.7 — Consecuencias
    const r_consec = detectores.consecuencias
    if (!r_consec.cumple) {
      contadorElementosFaltantesArt18++
      observaciones.push({
        id: `OBS-${String(observaciones.length + 1).padStart(2, '0')}`,
        modulo: 'A',
        categoria: 'Consecuencias de proporcionar o negar los datos',
        severidad: 'MODERADA',
        hallazgo: 'La política no informa sobre las consecuencias de proporcionar los datos ni de la negativa a hacerlo.',
        evidencia: 'AUSENTE en la política.',
        norma_vulnerada: 'Art. 18 Ley 29733 + Art. 6.1.6 DS 016-2024-JUS',
        riesgo_infraccion: 'leve',
        base_infraccion: 'Art. 132.5 DS 016-2024-JUS',
        recomendacion: 'Indicar qué sucede si el titular no proporciona los datos obligatorios (ej: "no podremos brindar el servicio solicitado").'
      })
    }

    // A.8 — Plazo de conservación
    const r_plazo = detectores.plazo
    if (!r_plazo.cumple || r_plazo.cumple === 'PARCIAL') {
      if (!r_plazo.cumple) contadorElementosFaltantesArt18++
      const esParcialPlazo = r_plazo.cumple === 'PARCIAL'
      observaciones.push({
        id: `OBS-${String(observaciones.length + 1).padStart(2, '0')}`,
        modulo: 'A',
        categoria: 'Plazo de conservación de datos',
        severidad: esParcialPlazo ? 'MODERADA' : 'IMPORTANTE',
        hallazgo: r_plazo.nivel === 'PLAZO_INDETERMINADO'
          ? 'El plazo de conservación declarado es vago e indeterminado ("el tiempo necesario") sin criterio claro que lo delimite.'
          : 'La política no informa el plazo o criterio de conservación de los datos personales.',
        evidencia: esParcialPlazo ? 'PARCIAL: plazo mencionado de forma indeterminada.' : 'AUSENTE en la política.',
        norma_vulnerada: 'Art. 18 Ley 29733 + Art. 6.1.9 DS 016-2024-JUS',
        riesgo_infraccion: 'leve',
        base_infraccion: 'Art. 132.5 DS 016-2024-JUS',
        recomendacion: 'Indicar un plazo determinado o un criterio determinable (ej: "mientras dure la relación contractual + 5 años por obligaciones legales").'
      })
    }

    // A.9 — Derechos ARCO
    const r_arco = detectores.arco
    if (!r_arco.cumple || r_arco.cumple === 'PARCIAL') {
      const nivelArco = r_arco.nivel || ''
      // Solo se cuenta como faltante del Art. 18 si AUSENCIA_TOTAL.
      // PARCIAL (faltan sub-elementos) no incrementa el contador.
      if (nivelArco === 'AUSENCIA_TOTAL') contadorElementosFaltantesArt18++
      const esParcialArco = r_arco.cumple === 'PARCIAL'
      observaciones.push({
        id: `OBS-${String(observaciones.length + 1).padStart(2, '0')}`,
        modulo: 'A',
        categoria: 'Derechos ARCO y mecanismos de ejercicio',
        severidad: nivelArco === 'AUSENCIA_TOTAL' ? 'GRAVE' : (esParcialArco ? 'MODERADA' : 'IMPORTANTE'),
        hallazgo: nivelArco === 'AUSENCIA_TOTAL'
          ? 'La política no informa sobre los derechos ARCO ni los mecanismos para ejercerlos.'
          : 'Información sobre derechos ARCO incompleta: la política menciona los derechos pero omite uno o más elementos exigidos por la Ley 29733 y la Guía ANPDP. Revisar el detalle por sub-elementos.',
        evidencia: 'AUSENTE o INCOMPLETO en la política.',
        norma_vulnerada: 'Art. 18-19 Ley 29733 + Art. 6.1.10 DS 016-2024-JUS',
        riesgo_infraccion: nivelArco === 'AUSENCIA_TOTAL' ? 'grave' : 'leve',
        base_infraccion: nivelArco === 'AUSENCIA_TOTAL' ? 'Art. 133.2 DS 016-2024-JUS' : 'Art. 132.5 DS 016-2024-JUS',
        recomendacion: 'Incluir: (1) descripción de los derechos ARCO, (2) canal concreto para ejercerlos (email o dirección), (3) derecho de revocación del consentimiento, (4) referencia a la ANPDP como autoridad de tutela.'
      })
    }

    // A.10 — Decisiones automatizadas
    const r_auto = detectores.automatizadas
    if (!r_auto.cumple) {
      observaciones.push({
        id: `OBS-${String(observaciones.length + 1).padStart(2, '0')}`,
        modulo: 'A',
        categoria: 'Decisiones automatizadas y perfilamiento',
        severidad: 'IMPORTANTE',
        hallazgo: 'Se detectan indicios de perfilamiento o decisiones automatizadas sin que la política informe al titular sobre su existencia y consecuencias.',
        evidencia: 'Indicios detectados en el texto sin declaración normativa correspondiente.',
        norma_vulnerada: 'Art. 6.1.8 DS 016-2024-JUS',
        riesgo_infraccion: 'leve',
        base_infraccion: 'Art. 132.5 DS 016-2024-JUS',
        recomendacion: 'Informar expresamente si se realizan decisiones automatizadas o perfilamiento, e indicar las consecuencias para el titular (Art. 6.1.8 DS 016-2024-JUS — obligación del reglamento vigente).'
      })
    }

    // A.11 — Calidad del lenguaje y forma
    const r_lenguaje = detectores.lenguaje
    if (!r_lenguaje.cumple) {
      observaciones.push({
        id: `OBS-${String(observaciones.length + 1).padStart(2, '0')}`,
        modulo: 'A',
        categoria: 'Calidad del lenguaje y forma',
        severidad: 'IMPORTANTE',
        hallazgo: `La política presenta problemas de claridad, forma o mecanismo de consentimiento: ${(r_lenguaje.detalles || []).join(' ')}`,
        evidencia: r_lenguaje.nivel || 'Alertas de calidad de lenguaje detectadas.',
        norma_vulnerada: 'Guía ANPDP §5 + Art. 5 DS 016-2024-JUS',
        riesgo_infraccion: 'leve',
        base_infraccion: 'Art. 132.5 DS 016-2024-JUS',
        recomendacion: 'Reformular la política con lenguaje detallado, sencillo, expreso e inequívoco; evitar citas legales literales y fórmulas de consentimiento por conducta implícita.'
      })
    }

    // A.12 — Alertas normativas
    const r_norm = detectores.reglamento
    if (!r_norm.cumple) {
      const niveles = (r_norm.nivel || '').split('+')
      niveles.forEach(nivel => {
        observaciones.push({
          id: `OBS-${String(observaciones.length + 1).padStart(2, '0')}`,
          modulo: 'A',
          categoria: 'Vigencia normativa',
          severidad: nivel === 'CITA_REGLAMENTO_DEROGADO' ? 'GRAVE' : 'IMPORTANTE',
          hallazgo: nivel === 'CITA_REGLAMENTO_DEROGADO'
            ? 'La política cita el DS 003-2013-JUS, que ha sido derogado y reemplazado por el DS 016-2024-JUS (reglamento vigente).'
            : nivel === 'SOLO_GDPR_SIN_NORMATIVA_PERUANA'
              ? 'La política hace referencia al GDPR europeo sin mencionar la normativa peruana aplicable (Ley 29733, DS 016-2024-JUS).'
              : 'La política no hace referencia a la Ley N° 29733, Ley de Protección de Datos Personales del Perú.',
          evidencia: 'Detectado en el texto de la política.',
          norma_vulnerada: 'Ley 29733 + DS 016-2024-JUS',
          riesgo_infraccion: nivel === 'CITA_REGLAMENTO_DEROGADO' ? 'grave' : 'leve',
          base_infraccion: nivel === 'CITA_REGLAMENTO_DEROGADO' ? 'Art. 133.2 DS 016-2024-JUS' : 'Art. 132.5 DS 016-2024-JUS',
          recomendacion: nivel === 'CITA_REGLAMENTO_DEROGADO'
            ? 'Actualizar todas las referencias al DS 003-2013-JUS por el DS 016-2024-JUS vigente.'
            : 'Incluir referencia expresa a la Ley N° 29733 y al DS N° 016-2024-JUS como marco normativo aplicable.'
        })
      })
    }
  }

  // ── MÓDULO B: FORMULARIOS ──

  const formsPreMarcados = detForm.checkboxPreMarcado(formularios)
  if (formsPreMarcados.length > 0) {
    observaciones.push({
      id: `OBS-${String(observaciones.length + 1).padStart(2, '0')}`,
      modulo: 'B',
      categoria: 'Consentimiento pasivo — checkbox pre-marcado',
      severidad: 'GRAVE',
      hallazgo: `Se detectaron ${formsPreMarcados.length} formulario(s) con checkbox de consentimiento pre-marcado. El consentimiento pre-marcado no es válido bajo la normativa peruana.`,
      evidencia: `Formularios afectados: ${formsPreMarcados.map(f => f.pagina_origen).join(', ')}`,
      norma_vulnerada: 'Art. 5.1 DS 016-2024-JUS (consentimiento expreso = acción concreta, directa y explícita)',
      riesgo_infraccion: 'grave',
      base_infraccion: 'Art. 133.3 DS 016-2024-JUS',
      recomendacion: 'Eliminar el atributo "checked" de todos los checkboxes de consentimiento. El titular debe marcar activamente su consentimiento.'
    })
  }

  const formsSinConsent = detForm.sinConsentimientoActivo(formularios)
  if (formsSinConsent.length > 0) {
    observaciones.push({
      id: `OBS-${String(observaciones.length + 1).padStart(2, '0')}`,
      modulo: 'B',
      categoria: 'Ausencia de mecanismo de consentimiento en formulario',
      severidad: 'GRAVE',
      hallazgo: `${formsSinConsent.length} formulario(s) recopilan datos personales sin ningún mecanismo de obtención de consentimiento activo.`,
      evidencia: `Formularios sin checkbox: ${formsSinConsent.map(f => f.pagina_origen).join(', ')}`,
      norma_vulnerada: 'Art. 13.5 Ley 29733 + Arts. 1-5 DS 016-2024-JUS',
      riesgo_infraccion: 'grave',
      base_infraccion: 'Art. 133.3 DS 016-2024-JUS',
      recomendacion: 'Incorporar un checkbox de consentimiento activo (no pre-marcado) vinculado a la política de privacidad en cada formulario que recopile datos personales.'
    })
  }

  const formsSinLink = detForm.sinLinkPolitica(formularios)
  if (formsSinLink.length > 0) {
    observaciones.push({
      id: `OBS-${String(observaciones.length + 1).padStart(2, '0')}`,
      modulo: 'B',
      categoria: 'Formulario sin enlace a política de privacidad',
      severidad: 'IMPORTANTE',
      hallazgo: `${formsSinLink.length} formulario(s) capturan datos sin enlace visible a la política de privacidad, incumpliendo el deber de informar en el punto de recopilación.`,
      evidencia: `Formularios afectados: ${formsSinLink.map(f => f.pagina_origen).join(', ')}`,
      norma_vulnerada: 'Art. 18 Ley 29733 (información previa a la recopilación) + Guía Deber de Informar ANPDP (información disponible en el lugar de recopilación)',
      riesgo_infraccion: 'leve',
      base_infraccion: 'Art. 132.5 DS 016-2024-JUS',
      recomendacion: 'Incluir un enlace visible a la política de privacidad completa en o junto a cada formulario de captación.'
    })
  }

  const formsMarketingSinCheckbox = detForm.marketingSinCheckboxSeparado(formularios)
  if (formsMarketingSinCheckbox.length > 0) {
    observaciones.push({
      id: `OBS-${String(observaciones.length + 1).padStart(2, '0')}`,
      modulo: 'B',
      categoria: 'Marketing/publicidad sin checkbox de consentimiento independiente',
      severidad: 'IMPORTANTE',
      hallazgo: `${formsMarketingSinCheckbox.length} formulario(s) con contexto de marketing, publicidad o suscripcion no tienen un checkbox separado para el consentimiento de la finalidad adicional. El titular no puede aceptar la finalidad principal del formulario sin aceptar, en bloque, la finalidad de marketing.`,
      evidencia: `Formularios afectados: ${formsMarketingSinCheckbox.map((f) => f.pagina_origen).join(', ')}`,
      norma_vulnerada: 'Art. 18 Ley 29733 + Art. 5 (consentimiento expreso e inequivoco) + Art. 10.2 DS 016-2024-JUS + Guia ANPDP sobre el Deber de Informar §4.2',
      riesgo_infraccion: 'leve',
      base_infraccion: 'Art. 132.5 DS 016-2024-JUS',
      recomendacion: 'Implementar un checkbox separado (no pre-marcado) para el consentimiento de marketing/publicidad, independiente del consentimiento de la politica de privacidad. El titular debe poder aceptar la finalidad principal del formulario sin verse obligado a aceptar las finalidades adicionales.',
      detalles: formsMarketingSinCheckbox.map((f) => {
        const cs = (f.checkboxes ?? []).filter((c) => c.tipo !== 'OTRO')
        const enc = cs.map((c) => c.tipo.replace('_', ' ').toLowerCase()).join(', ') || 'ninguno con label clasificable'
        return `Formulario ${f.pagina_origen}: ${(f.checkboxes ?? []).length} checkbox(es) detectado(s) — clasificados como: ${enc}. No se encontro checkbox con label de marketing/publicidad.`
      }),
    })
  }

  const formsSensibles = detForm.datosSensibles(formularios)
  if (formsSensibles.length > 0) {
    observaciones.push({
      id: `OBS-${String(observaciones.length + 1).padStart(2, '0')}`,
      modulo: 'B',
      categoria: 'Datos sensibles en formulario — alerta de consentimiento escrito',
      severidad: 'GRAVE',
      hallazgo: 'Se detectan campos que podrían corresponder a datos sensibles. El tratamiento de datos sensibles requiere consentimiento expreso y por escrito (Art. 13.6 Ley 29733).',
      evidencia: `Campos detectados en formularios: ${formsSensibles.map(f => f.pagina_origen).join(', ')}`,
      norma_vulnerada: 'Art. 13.6 Ley 29733 + Art. 8 DS 016-2024-JUS',
      riesgo_infraccion: 'grave',
      base_infraccion: 'Art. 133.5-6 DS 016-2024-JUS',
      recomendacion: 'Verificar si los campos detectados constituyen datos sensibles. De confirmarse, implementar mecanismo de consentimiento escrito (firma digital, electrónica u otro que garantice la voluntad del titular).',
      requiere_verificacion_manual: true
    })
  }

  const excesivos = detForm.datosExcesivos(formularios)
  if (excesivos.length > 0) {
    observaciones.push({
      id: `OBS-${String(observaciones.length + 1).padStart(2, '0')}`,
      modulo: 'B',
      categoria: 'Posible exceso de datos respecto a la finalidad',
      severidad: 'MODERADA',
      hallazgo: `Se solicitan datos que aparentemente no son necesarios, pertinentes ni adecuados para la finalidad del formulario: ${excesivos.map(e => e.dato_excesivo).join('; ')}`,
      evidencia: excesivos.map(e => `${e.dato_excesivo} en ${e.formulario}`).join(' | '),
      norma_vulnerada: 'Art. 7 Ley 29733 (principio de proporcionalidad)',
      riesgo_infraccion: 'leve',
      base_infraccion: 'Art. 132.1 DS 016-2024-JUS',
      recomendacion: 'Revisar la necesidad de cada campo solicitado respecto a la finalidad del formulario. Eliminar o hacer facultativos los datos no indispensables.',
      requiere_verificacion_manual: true
    })
  }

  // ── MÓDULO C: COOKIES Y TRACKERS ──

  const trackersEncontrados = html_completo
    ? detCookies.trackersDetectados(html_completo)
    : []

  if (trackersEncontrados.length > 0) {
    const textoPol = texto || ''
    const politicaMencionaCookies = /(cookie|rastreo|seguimiento|analytics|tracker)/i.test(textoPol)
    const politicaDeclaraNoTransfiere = declaraQueNoComparte(textoPol)
    if (!politicaMencionaCookies && !politicaDeclaraNoTransfiere) {
      observaciones.push({
        id: `OBS-${String(observaciones.length + 1).padStart(2, '0')}`,
        modulo: 'C',
        categoria: 'Trackers de terceros no declarados',
        severidad: 'GRAVE',
        hallazgo: `El sitio utiliza servicios de terceros en el extranjero (${trackersEncontrados.join(', ')}) que implican transferencia internacional de datos, sin que la política de privacidad lo declare.`,
        evidencia: `Scripts de terceros detectados: ${trackersEncontrados.join(', ')}`,
        norma_vulnerada: 'Art. 15 Ley 29733 (flujo transfronterizo) + Art. 6.1.7 DS 016-2024-JUS',
        riesgo_infraccion: 'grave',
        base_infraccion: 'Art. 133.2 DS 016-2024-JUS',
        recomendacion: `Declarar en la política la transferencia internacional de datos a los países donde operan: ${trackersEncontrados.join(', ')}. Informar al titular sobre el uso de estas herramientas y sus finalidades.`
      })
    } else if (politicaDeclaraNoTransfiere) {
      // La politica declara expresamente que no comparte/transfiere
      // datos, pero el sitio si tiene trackers de terceros extranjeros.
      // Bajo el principio de veracidad de las declaraciones se acepta
      // la afirmacion de la politica, pero se anota una advertencia
      // metodologica para que el auditor verifique manualmente la
      // coherencia entre la declaracion y los trackers detectados.
      observaciones.push({
        id: `OBS-${String(observaciones.length + 1).padStart(2, '0')}`,
        modulo: 'C',
        categoria: 'Coherencia entre declaración y trackers detectados',
        severidad: 'MODERADA',
        hallazgo: `La política declara que no se comparten/transfieren datos, pero el sitio integra scripts de terceros extranjeros (${trackersEncontrados.join(', ')}) cuya tecnología típicamente implica flujo transfronterizo de datos. Verificación manual requerida para confirmar coherencia.`,
        evidencia: `Scripts de terceros detectados: ${trackersEncontrados.join(', ')}`,
        norma_vulnerada: 'Art. 15 Ley 29733 + Art. 6.1.7 DS 016-2024-JUS — principio de veracidad e integridad de la declaración',
        riesgo_infraccion: 'leve',
        base_infraccion: 'Art. 132.5 DS 016-2024-JUS',
        recomendacion: `Verificar la coherencia entre la declaración de la política y los servicios de terceros efectivamente integrados en el sitio (${trackersEncontrados.join(', ')}). De confirmarse el uso, complementar la política declarando esos flujos o configurar los servicios para que no envíen datos personales al extranjero.`,
        requiere_verificacion_manual: true,
      })
    }
  }

  const r_banner = detCookies.bannerAdecuado(cookies_banner.texto || '')
  if (!r_banner.adecuado) {
    observaciones.push({
      id: `OBS-${String(observaciones.length + 1).padStart(2, '0')}`,
      modulo: 'C',
      categoria: 'Banner de cookies',
      severidad: 'MODERADA',
      hallazgo: r_banner.nivel === 'SIN_BANNER'
        ? 'No se detectó banner o aviso de cookies en el sitio.'
        : r_banner.nivel === 'SOLO_BOTON_ACEPTAR'
          ? 'El banner de cookies solo ofrece la opción de aceptar, sin permitir rechazar o configurar las cookies no esenciales.'
          : 'El banner de cookies no ofrece opción clara de rechazo.',
      evidencia: cookies_banner?.texto || 'No detectado.',
      norma_vulnerada: 'Art. 5 DS 016-2024-JUS (consentimiento para tratamiento de datos de navegación) + Art. 6.1.8 (perfilamiento)',
      riesgo_infraccion: 'leve',
      base_infraccion: 'Art. 132.5 DS 016-2024-JUS',
      recomendacion: 'Implementar banner de cookies que permita al usuario aceptar, rechazar o configurar por categorías (necesarias / analíticas / marketing) antes de que se activen.'
    })
  }

  // ── RECLASIFICACIÓN FINAL DEL DEBER DE INFORMAR ──
  // Ajusta la severidad de las observaciones de módulo A
  // según el conteo total (Art. 132.5 vs 133.2 DS 016)
  const clasificacion = clasificarInfraccionDeber(contadorElementosFaltantesArt18)
  if (clasificacion) {
    observaciones
      .filter(o => o.modulo === 'A' && o.base_infraccion.includes('132.5 o 133.2'))
      .forEach(o => {
        o.base_infraccion = clasificacion.articulo
        o.riesgo_infraccion = clasificacion.tipo.toLowerCase()
        o.rango_multa_aplicable = clasificacion.rango_multa
      })
  }

  // ── ENRIQUECIMIENTO DE OBSERVACIONES ──
  // Cada detector del modulo A devuelve `nivel` (codigo tecnico) y
  // `detalles` (mensajes legibles por sub-elemento que fallo). Hacemos
  // un post-pass que vincula esos datos a cada observacion ya pusheada
  // por categoria, para que el reporte muestre el por que concreto en
  // lugar de un codigo tipo "SIN_REVOCACION+SIN_REFERENCIA_ANPDP".
  const detectorPorCategoria: Record<string, { detalles?: string[]; nivel?: string }> = {
    'Identidad y domicilio del responsable': detectores.identidad,
    'Finalidad del tratamiento': detectores.finalidad,
    'Destinatarios de los datos': detectores.destinatarios,
    'Transferencia internacional de datos': detectores.transferencia,
    'Banco de datos personales': detectores.bancoDatos,
    'Carácter obligatorio o facultativo de los datos': detectores.obligatoriedad,
    'Consecuencias de proporcionar o negar los datos': detectores.consecuencias,
    'Plazo de conservación de datos': detectores.plazo,
    'Derechos ARCO y mecanismos de ejercicio': detectores.arco,
    'Decisiones automatizadas y perfilamiento': detectores.automatizadas,
    'Calidad del lenguaje y forma': detectores.lenguaje,
  }
  for (const obs of observaciones) {
    const det = detectorPorCategoria[obs.categoria]
    if (!det) continue
    if (det.nivel) obs.nivel = det.nivel
    if (det.detalles && det.detalles.length > 0) obs.detalles = det.detalles.slice()
  }

  // ── CONTEO DE OBSERVACIONES POR SEVERIDAD (informativo) ──
  // Mostramos cuantas observaciones cayeron en cada severidad como dato
  // de contexto. En el modelo previo (deductivo) este conteo manejaba la
  // formula del puntaje. En el modelo vigente — cobertura del Art. 18
  // ponderada por severidad — el puntaje se calcula POR ELEMENTO sobre
  // el cuadro_art18 (ver mas abajo), no a partir de las observaciones.
  // Esta tabla queda como resumen informativo del reporte.
  const PESO_POR_SEVERIDAD: Record<Severidad, number> = {
    'MUY GRAVE': 4,
    GRAVE: 3,
    IMPORTANTE: 2,
    MODERADA: 1,
  }
  const severidadesOrdenadas: Severidad[] = ['MUY GRAVE', 'GRAVE', 'IMPORTANTE', 'MODERADA']
  const deducciones: DeduccionPuntaje[] = severidadesOrdenadas.map((severidad) => {
    const cantidad = observaciones.filter((o) => o.severidad === severidad).length
    const penalidad_unitaria = PESO_POR_SEVERIDAD[severidad]
    return {
      severidad,
      penalidad_unitaria,
      cantidad,
      deduccion_total: cantidad * penalidad_unitaria,
    }
  })

  const contMuyGrave = deducciones.find((d) => d.severidad === 'MUY GRAVE')?.cantidad ?? 0
  const contGrave = deducciones.find((d) => d.severidad === 'GRAVE')?.cantidad ?? 0
  const contImportante = deducciones.find((d) => d.severidad === 'IMPORTANTE')?.cantidad ?? 0
  const contModerada = deducciones.find((d) => d.severidad === 'MODERADA')?.cantidad ?? 0

  const clasificacionDeberInformar: ClasificacionDeberInformar = clasificacion
    ? {
        elementos_faltantes_art18: contadorElementosFaltantesArt18,
        clasificacion: clasificacion.tipo,
        norma_aplicable: clasificacion.articulo,
        rango_multa: clasificacion.rango_multa,
        criterio:
          'Art. 132.5 DS 016-2024-JUS (LEVE) si faltan 1-2 condiciones del Art. 18 Ley 29733; Art. 133.2 DS 016-2024-JUS (GRAVE) si faltan 3 o mas.',
      }
    : {
        elementos_faltantes_art18: 0,
        clasificacion: 'NO_APLICA',
        norma_aplicable: '—',
        rango_multa: '—',
        criterio:
          'No se detectaron elementos faltantes del Art. 18 Ley 29733; no aplica la clasificacion del deber de informar.',
      }

  // ── ELEMENTOS CUMPLIDOS ──
  // Estructurados como objetos con norma y evidencia para mostrarlos
  // en el reporte con el mismo nivel de detalle que las observaciones.
  // Solo CUMPLE puro entra a elementos_cumplidos. PARCIAL aparece en el
  // cuadro_art18 como PARCIAL y en observaciones (con severidad MODERADA),
  // pero no es un cumplimiento — la comprobacion con `=== true` evita el
  // bug previo en que 'PARCIAL' (string truthy) caia aca como cumplido y
  // el mismo elemento aparecia simultaneamente como observacion y como
  // cumplido (caso tailoy.com.pe).
  const elementosCumplidos: ElementoCumplido[] = []
  // Sin politica real no hay cumplidos posibles de los detectores Art.18.
  // El gate `hayPolitica` corta aqui los detectores en negativo (A.10,
  // A.11) que devolverian cumple=true vacuamente sobre texto vacio. Los
  // cumplidos transversales (consentimiento activo en formularios) se
  // evaluan al final con su propia logica independiente.
  if (hayPolitica && detectores.identidad.cumple === true) {
    elementosCumplidos.push({
      categoria: 'Identidad y domicilio del responsable',
      norma: 'Art. 18 Ley 29733 + Art. 6.1.1 DS 016-2024-JUS',
      evidencia_detectada:
        'Se identificaron razón social/denominación, RUC (cuando aplica) y domicilio con los componentes minimos (via/frase de domicilio + numero o distrito) exigidos por la Guia ANPDP §4.1.',
    })
  }
  if (hayPolitica && detectores.finalidad.cumple === true) {
    elementosCumplidos.push({
      categoria: 'Finalidad del tratamiento',
      norma: 'Art. 7 + Art. 18 Ley 29733',
      evidencia_detectada:
        'La politica declara finalidades especificas, no usa formulas genericas prohibidas por la Guia ANPDP §4.2 y, cuando hay finalidades adicionales, distingue su mecanismo de consentimiento.',
    })
  }
  if (hayPolitica && detectores.destinatarios.cumple === true) {
    elementosCumplidos.push({
      categoria: 'Destinatarios de los datos',
      norma: 'Art. 18 Ley 29733 + Art. 6.1.3 DS 016-2024-JUS',
      evidencia_detectada:
        'La politica identifica destinatarios o declara expresamente que no se transfieren datos a terceros.',
    })
  }
  if (hayPolitica && detectores.plazo.cumple === true) {
    elementosCumplidos.push({
      categoria: 'Plazo de conservación de datos',
      norma: 'Art. 18 Ley 29733 + Art. 6.1.9 DS 016-2024-JUS',
      evidencia_detectada:
        'La politica indica un plazo determinado o un criterio determinable de conservacion de los datos.',
    })
  }
  if (hayPolitica && detectores.arco.cumple === true) {
    elementosCumplidos.push({
      categoria: 'Derechos ARCO y mecanismos de ejercicio',
      norma: 'Art. 18-19 Ley 29733 + Art. 6.1.10 DS 016-2024-JUS',
      evidencia_detectada:
        'La politica describe los derechos ARCO, ofrece un canal verificable para ejercerlos, informa la revocacion del consentimiento y menciona a la ANPDP como autoridad de tutela.',
    })
  }
  if (hayPolitica && detectores.transferencia.cumple === true) {
    elementosCumplidos.push({
      categoria: 'Transferencia internacional de datos',
      norma: 'Art. 15 Ley 29733 + Art. 6.1.7 DS 016-2024-JUS',
      evidencia_detectada:
        'No se detecta transferencia internacional, o se declara con pais destinatario y nivel de proteccion.',
    })
  }
  if (hayPolitica && detectores.bancoDatos.cumple === true) {
    elementosCumplidos.push({
      categoria: 'Banco de datos personales',
      norma: 'Art. 18 + Art. 29 + Art. 34 Ley 29733 + Art. 6.1.4 DS 016-2024-JUS',
      evidencia_detectada:
        'La politica identifica el banco de datos con codigo RNPDP (sigla literal o "con registro NNNNN").',
    })
  }
  if (hayPolitica && detectores.obligatoriedad.cumple === true) {
    elementosCumplidos.push({
      categoria: 'Carácter obligatorio o facultativo de los datos',
      norma: 'Art. 18 Ley 29733 + Guía ANPDP §4.3',
      evidencia_detectada:
        'La politica distingue entre datos obligatorios y facultativos para los formularios de captacion.',
    })
  }
  if (hayPolitica && detectores.consecuencias.cumple === true) {
    elementosCumplidos.push({
      categoria: 'Consecuencias de proporcionar o negar los datos',
      norma: 'Art. 18 Ley 29733 + Art. 6.1.6 DS 016-2024-JUS',
      evidencia_detectada:
        'La politica informa las consecuencias de proporcionar o negar los datos solicitados.',
    })
  }
  if (hayPolitica && detectores.automatizadas.cumple === true) {
    elementosCumplidos.push({
      categoria: 'Decisiones automatizadas y perfilamiento',
      norma: 'Art. 6.1.8 DS 016-2024-JUS',
      evidencia_detectada:
        'Sin perfilamiento detectado, o se informa expresamente al titular cuando existen decisiones automatizadas.',
    })
  }
  if (hayPolitica && detectores.lenguaje.cumple === true) {
    elementosCumplidos.push({
      categoria: 'Calidad del lenguaje y forma',
      norma: 'Art. 5 DS 016-2024-JUS + Guía ANPDP §5',
      evidencia_detectada:
        'La politica usa lenguaje detallado, sencillo y expreso; sin transcripciones legales literales ni consentimiento por conducta implicita.',
    })
  }
  if (hayPolitica && detectores.reglamento.cumple === true) {
    elementosCumplidos.push({
      categoria: 'Vigencia normativa',
      norma: 'Ley 29733 + DS 016-2024-JUS (reglamento vigente)',
      evidencia_detectada:
        'La politica referencia la normativa peruana vigente (Ley 29733 y DS 016-2024-JUS); no cita el DS 003-2013-JUS derogado.',
    })
  }
  if (formularios.length > 0 && formularios.every((f) => !f.checkbox_premarcado)) {
    elementosCumplidos.push({
      categoria: 'Consentimiento activo en formularios',
      norma: 'Art. 5 DS 016-2024-JUS',
      evidencia_detectada:
        'Ningun formulario de captacion presenta checkboxes pre-marcados (consentimiento pasivo no valido).',
    })
  }

  // ── CUADRO DE ESTADO POR ELEMENTO DEL ART. 18 ──
  // Vista at-a-glance: por cada elemento del Art. 18 Ley 29733, su
  // estado (cumple / parcial / incumple / no verificado) + norma + un
  // comentario corto. Si no hay politica, todos los elementos quedan
  // como INCUMPLE porque la ausencia total impide verificarlos.
  function estado(d: { cumple?: boolean | 'PARCIAL' } | undefined): EstadoElemento {
    if (!hayPolitica) return 'INCUMPLE'
    if (!d) return 'NO_VERIFICADO'
    if (d.cumple === true) return 'CUMPLE'
    if (d.cumple === 'PARCIAL') return 'PARCIAL'
    return 'INCUMPLE'
  }
  function comentarioObsOCumplido(categoria: string, descCumple: string): string {
    const obs = observaciones.find((o) => o.categoria === categoria)
    if (obs) {
      // Toma el detalle mas especifico (el primero), si lo hay; sino el hallazgo.
      const det = obs.detalles?.[0]
      if (det) return det.split('(')[0].trim().slice(0, 200)
      return obs.hallazgo.slice(0, 200)
    }
    return descCumple
  }
  // Severidad implicada por elemento del Art. 18 — refleja la severidad
  // que el detector emitiria si el elemento estuviera faltante. Es el
  // peso usado en la formula del puntaje. Severidades alineadas con
  // las que emite cada bloque de observacion mas arriba en el archivo.
  const SEVERIDAD_POR_ELEMENTO: Record<string, Severidad> = {
    'A.2': 'IMPORTANTE',
    'A.3': 'GRAVE',
    'A.4': 'GRAVE',
    'A.4b': 'GRAVE',
    'A.5': 'IMPORTANTE',
    'A.6': 'IMPORTANTE',
    'A.7': 'MODERADA',
    'A.8': 'IMPORTANTE',
    'A.9': 'GRAVE',
    'A.10': 'IMPORTANTE',
    'A.11': 'IMPORTANTE',
    'A.12': 'IMPORTANTE',
  }
  function pesoDe(codigo: string): { severidad_implicada: Severidad; peso: number } {
    const severidad = SEVERIDAD_POR_ELEMENTO[codigo] ?? 'IMPORTANTE'
    return { severidad_implicada: severidad, peso: PESO_POR_SEVERIDAD[severidad] }
  }
  const cuadroArt18: ElementoArt18[] = [
    {
      codigo: 'A.2',
      categoria: 'Identidad y domicilio del responsable',
      estado: estado(detectores.identidad),
      norma: 'Art. 18 Ley 29733 + Art. 6.1.1 DS 016-2024-JUS + Guía ANPDP §4.1',
      comentario: comentarioObsOCumplido('Identidad y domicilio del responsable', 'Razón social/denominación, RUC y domicilio completo identificados.'),
      ...pesoDe('A.2'),
    },
    {
      codigo: 'A.3',
      categoria: 'Finalidad del tratamiento',
      estado: estado(detectores.finalidad),
      norma: 'Art. 7 + Art. 18 Ley 29733 + Art. 10.2 DS 016-2024-JUS + Guía ANPDP §4.2',
      comentario: comentarioObsOCumplido('Finalidad del tratamiento', 'Finalidades declaradas de forma específica y lícita.'),
      ...pesoDe('A.3'),
    },
    {
      codigo: 'A.4',
      categoria: 'Destinatarios de los datos',
      estado: estado(detectores.destinatarios),
      norma: 'Art. 18 Ley 29733 + Art. 6.1.3 DS 016-2024-JUS + Guía ANPDP §4.3',
      comentario: comentarioObsOCumplido('Destinatarios de los datos', 'Destinatarios identificados (o expresamente declarado que no hay transferencia).'),
      ...pesoDe('A.4'),
    },
    {
      codigo: 'A.4b',
      categoria: 'Transferencia internacional de datos',
      estado: estado(detectores.transferencia),
      norma: 'Art. 15 Ley 29733 + Art. 6.1.7 DS 016-2024-JUS',
      comentario: comentarioObsOCumplido('Transferencia internacional de datos', 'Sin transferencia internacional detectada, o declarada con país + nivel de protección.'),
      ...pesoDe('A.4b'),
    },
    {
      codigo: 'A.5',
      categoria: 'Banco de datos personales',
      estado: estado(detectores.bancoDatos),
      norma: 'Art. 18 + Art. 29 + Art. 34 Ley 29733 + Art. 6.1.4 DS 016-2024-JUS + Guía ANPDP §4.4',
      comentario: comentarioObsOCumplido('Banco de datos personales', 'Banco de datos identificado con código RNPDP.'),
      ...pesoDe('A.5'),
    },
    {
      codigo: 'A.6',
      categoria: 'Carácter obligatorio o facultativo de los datos',
      estado: estado(detectores.obligatoriedad),
      norma: 'Art. 18 Ley 29733 + Guía ANPDP §4.3',
      comentario: comentarioObsOCumplido('Carácter obligatorio o facultativo de los datos', 'La política distingue datos obligatorios de facultativos.'),
      ...pesoDe('A.6'),
    },
    {
      codigo: 'A.7',
      categoria: 'Consecuencias de proporcionar o negar los datos',
      estado: estado(detectores.consecuencias),
      norma: 'Art. 18 Ley 29733 + Art. 6.1.6 DS 016-2024-JUS + Guía ANPDP §4.4',
      comentario: comentarioObsOCumplido('Consecuencias de proporcionar o negar los datos', 'Se informan las consecuencias de proporcionar o no los datos.'),
      ...pesoDe('A.7'),
    },
    {
      codigo: 'A.8',
      categoria: 'Plazo de conservación de datos',
      estado: estado(detectores.plazo),
      norma: 'Art. 8 + Art. 18 Ley 29733 + Art. 6.1.9 DS 016-2024-JUS + Guía ANPDP §4.6',
      comentario: comentarioObsOCumplido('Plazo de conservación de datos', 'Plazo determinado o criterio determinable indicado.'),
      ...pesoDe('A.8'),
    },
    {
      codigo: 'A.9',
      categoria: 'Derechos ARCO y mecanismos de ejercicio',
      estado: estado(detectores.arco),
      norma: 'Arts. 18-25 Ley 29733 + Art. 6.1.10 DS 016-2024-JUS + Guía ANPDP §4.7',
      comentario: comentarioObsOCumplido('Derechos ARCO y mecanismos de ejercicio', 'Derechos ARCO declarados con canal de ejercicio, revocación y mención a la ANPDP.'),
      ...pesoDe('A.9'),
    },
    {
      codigo: 'A.10',
      categoria: 'Decisiones automatizadas y perfilamiento',
      estado: estado(detectores.automatizadas),
      norma: 'Art. 6.1.8 DS 016-2024-JUS',
      comentario: comentarioObsOCumplido('Decisiones automatizadas y perfilamiento', 'Sin perfilamiento detectado, o informado al titular.'),
      ...pesoDe('A.10'),
    },
    {
      codigo: 'A.11',
      categoria: 'Calidad del lenguaje y forma',
      estado: estado(detectores.lenguaje),
      norma: 'Art. 5 DS 016-2024-JUS + Guía ANPDP §5',
      comentario: comentarioObsOCumplido('Calidad del lenguaje y forma', 'Lenguaje claro, sin transcripciones legales literales ni consentimiento por conducta implícita.'),
      ...pesoDe('A.11'),
    },
    {
      codigo: 'A.12',
      categoria: 'Vigencia normativa',
      estado: estado(detectores.reglamento),
      norma: 'Ley 29733 + DS 016-2024-JUS (vigente; reemplazó al DS 003-2013-JUS derogado)',
      comentario: comentarioObsOCumplido('Vigencia normativa', 'La política referencia la normativa peruana vigente.'),
      ...pesoDe('A.12'),
    },
  ]

  // ── PUNTAJE: COBERTURA DEL ART. 18 PONDERADA POR SEVERIDAD ──
  // Un solo numero que refleja el cumplimiento global del checklist.
  // Cada elemento del cuadro pesa segun la severidad de la infraccion
  // que generaria si estuviera incompleto (peso = MUY GRAVE 4, GRAVE 3,
  // IMPORTANTE 2, MODERADA 1). Sobre eso se aplica el factor del estado
  // (CUMPLE 100%, PARCIAL 50%, INCUMPLE 0%). NO_VERIFICADO se excluye
  // del denominador para no premiar ni castigar lo no verificable.
  // Resultado: 0-100. El sitio tiene "todo el checklist cumplido" -> 100.
  // El sitio sin politica -> 0 (todo INCUMPLE).
  const FACTOR_ESTADO: Record<EstadoElemento, number> = {
    CUMPLE: 100,
    PARCIAL: 50,
    INCUMPLE: 0,
    NO_VERIFICADO: 0,
  }
  const elementosEvaluados = cuadroArt18.filter((e) => e.estado !== 'NO_VERIFICADO')
  const numerador = elementosEvaluados.reduce(
    (acc, e) => acc + e.peso * FACTOR_ESTADO[e.estado],
    0,
  )
  const denominador = elementosEvaluados.reduce((acc, e) => acc + e.peso * 100, 0)
  const puntaje = denominador === 0 ? 0 : Math.round((numerador / denominador) * 100)
  const deduccion_total = 100 - puntaje

  const metodologia_calificacion: CalculoPuntaje = {
    base: 100,
    deducciones,
    deduccion_total,
    puntaje_final: puntaje,
    formula_texto:
      'Puntaje = cobertura del Art. 18 ponderada por severidad. Cada elemento del cuadro pesa segun la severidad de la infraccion que generaria si estuviera incompleto (MUY GRAVE 4, GRAVE 3, IMPORTANTE 2, MODERADA 1). Estados: CUMPLE 100%, PARCIAL 50%, INCUMPLE 0%. Los elementos NO_VERIFICADO se excluyen del denominador. La tabla de observaciones por severidad es informativa y no entra en la formula.',
    clasificacion_deber_informar: clasificacionDeberInformar,
  }

  return {
    sitio: url_auditada,
    fecha_auditoria: new Date().toISOString(),
    resumen_ejecutivo: `Auditoría de cumplimiento bajo Ley N° 29733 y DS N° 016-2024-JUS. Se identificaron ${observaciones.length} observaciones: ${contMuyGrave} muy grave(s), ${contGrave} grave(s), ${contImportante} importante(s), ${contModerada} moderada(s). Puntaje de cumplimiento del Art. 18 (cobertura ponderada por severidad): ${puntaje}/100.`,
    puntaje_cumplimiento: puntaje,
    elementos_faltantes_art18: contadorElementosFaltantesArt18,
    clasificacion_deber_informar: clasificacion,
    observaciones,
    elementos_cumplidos: elementosCumplidos,
    trackers_detectados: trackersEncontrados,
    advertencias_metodologicas: [
      ...advertenciasCrawler,
      'Este análisis es automatizado mediante motor de reglas. No reemplaza la auditoría legal especializada.',
      'La verificación de inscripción efectiva en el RNPDP requiere consulta directa a la ANPDP.',
      'Las observaciones sobre datos sensibles y proporcionalidad requieren verificación manual del auditor.',
      'Los trackers detectados en el HTML son indicativos, no determinantes de una infracción confirmada.',
      'La coherencia entre política declarada y prácticas internas requiere auditoría documental adicional.'
    ],
    metodologia_calificacion,
    cuadro_art18: cuadroArt18,
  }
}
