// src/analyzer/index.js
// Motor de reglas de alta calidad — Ley 29733 + DS 016-2024-JUS
// Sin dependencia de API externa

import type {
  CookiesBannerDetectado,
  DatosCrawler,
  FormularioDetectado,
  Observacion,
  PoliticaPrivacidadDetectada,
  ResultadoAuditoria,
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

    if (!tieneNombre) {
      resultado.cumple = false
      resultado.nivel = 'SIN_RAZON_SOCIAL'
      resultado.detalles?.push('No se identifica la razón social o denominación del responsable')
    }
    if (!tieneRUC && tieneNombre) {
      resultado.alerta_ruc = true
      resultado.detalles?.push('No se indica el RUC (recomendado por Guía ANPDP §4.1)')
    }
    if (!tieneDomicilioCompleto) {
      resultado.cumple = false
      resultado.nivel = resultado.nivel || 'DOMICILIO_INCOMPLETO'
      resultado.detalles?.push('El domicilio no incluye los componentes mínimos: vía (calle/av/jr), número y distrito/provincia (Guía ANPDP §4.1)')
    }
    if (pareceExtranjero && !tieneRepresentante) {
      resultado.alerta_representante = true
      resultado.detalles?.push('El responsable podría no estar establecido en Perú sin designar representante (Art. 7 DS 016-2024-JUS)')
    }
    return resultado
  },

  // A.3 — FINALIDAD
  finalidad(t: string): ResultadoDetector {
    const resultado: ResultadoDetector = { cumple: true, detalles: [] }
    const tieneFinalidad = /(finalidad|objetivo del tratamiento|para qué|propósito|usamos tus datos para|tratamos tus datos para)/i.test(t)
    if (!tieneFinalidad) {
      return { cumple: false, nivel: 'AUSENCIA_TOTAL', detalles: ['No se declara ninguna finalidad del tratamiento'] }
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
    const frasesEncontradas = frasesGenericas.filter(r => r.test(t))
    if (frasesEncontradas.length > 0) {
      resultado.cumple = false
      resultado.nivel = 'FINALIDAD_GENERICA'
      resultado.detalles?.push('Se usan frases genéricas o inexactas prohibidas por la Guía ANPDP §4.2: "entre otras finalidades", "etcétera", "fines comerciales", u otras expresiones vagas')
    }

    const tieneFinAdic = /(publicidad|marketing|comercial|perfilamiento|prospección|comunicaciones comerciales|envío.*promocion)/i.test(t)
    const distingueFinalidades = /(finalidad.*principal|finalidad.*primaria|finalidad.*consustancial|necesaria.*para el servicio|adicional|secundaria|finalidad.*opcional)/i.test(t)
    if (tieneFinAdic && !distingueFinalidades) {
      resultado.cumple = false
      resultado.nivel = resultado.nivel || 'SIN_DISTINCION_FINALIDADES'
      resultado.detalles?.push('Se declaran finalidades adicionales (marketing/publicidad) sin distinguirlas de las finalidades principales/consustanciales al servicio (Guía ANPDP §4.2)')
    }

    if (tieneFinAdic) {
      const tieneMecanismoNegativa = /(sí\s*acepto|no\s*acepto|acepto\s*\(\s*\)|no\s*acepto\s*\(\s*\)|marque.*si|puede\s+negarse|puede\s+oponerse|si\s+no\s+desea|para\s+no\s+recibir)/i.test(t)
      const tieneConsentimientoIndep = /(checkbox|casilla|marcar|seleccionar).*?(publicidad|marketing|comercial)/i.test(t)

      if (!tieneMecanismoNegativa && !tieneConsentimientoIndep) {
        resultado.cumple = false
        resultado.nivel = resultado.nivel || 'SIN_MECANISMO_NEGATIVA'
        resultado.detalles?.push('Las finalidades adicionales no cuentan con mecanismo de negativa independiente disponible para el titular (Guía ANPDP §4.2 + Art. 10.2 DS 016-2024-JUS)')
      }

      const condicionaServicio = /(solo.*si.*acepta|únicamente.*aceptando|no.*podremos.*atender.*si.*no.*acepta.*publicidad|requisito.*aceptar.*marketing)/i.test(t)
      if (condicionaServicio) {
        resultado.cumple = false
        resultado.nivel = 'CONDICIONAMIENTO_ILICITO'
        resultado.detalles?.push('Se condiciona la prestación del servicio a la aceptación de finalidades adicionales no indispensables (Art. 3.2 DS 016-2024-JUS)')
      }
    }

    const checkboxUnico = /(acepto\s+la\s+política\s+de\s+privacidad|he\s+leído\s+y\s+acepto|acepto\s+los\s+términos).*?(publicidad|marketing|comunicaciones comerciales)/i.test(t)
    if (checkboxUnico) {
      resultado.cumple = false
      resultado.nivel = 'CONSENTIMIENTO_EN_BLOQUE'
      resultado.detalles?.push('Se solicita consentimiento en bloque para finalidades principales y adicionales con una sola casilla — práctica expresamente prohibida por la Guía ANPDP §5')
    }

    return resultado
  },

  // A.4 — DESTINATARIOS
  destinatarios(t: string): ResultadoDetector {
    const declara = /(destinatario|receptor|comparten.*datos|transferimos.*a|comunicamos.*a|proveedores.*que|terceros.*que|encargados.*de\s+tratamiento)/i.test(t)
    const noTransfiere = /(no\s+se\s+transfieren|no\s+compartimos|no\s+cedemos|no\s+transferimos|no\s+comunicamos\s+a\s+terceros)/i.test(t)
    const usaHipervinculo = /(ver\s+lista|más\s+información|consultar\s+aquí|enlace|hipervínculo|link)/i.test(t)
    if (!declara && !noTransfiere) {
      return {
        cumple: false,
        nivel: 'AUSENCIA',
        detalles: ['No se identifican destinatarios ni se declara expresamente que no hay transferencia a terceros']
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
    const paisesExtranjeros = /(estados\s+unidos|usa|u\.s\.a|europa|españa|colombia|chile|argentina|brasil|méxico|canadá|reino\s+unido|alemania|francia|irlanda|holanda|suiza)/i.test(t)
    const declaraTransferencia = /(transferencia\s+internacional|flujo\s+transfronterizo|fuera\s+del\s+país|fuera\s+del\s+perú|datos.*al\s+extranjero|países\s+con\s+nivel\s+adecuado)/i.test(t)
    const declaraNoTransfiere = /(no\s+se\s+realiza.*transferencia\s+internacional|datos.*solo.*perú|no\s+transferimos\s+datos\s+fuera|datos.*permanecen\s+en\s+perú)/i.test(t)

    if (declaraNoTransfiere) return { cumple: true }
    if ((mencionaServicioExterno || paisesExtranjeros) && !declaraTransferencia) {
      return {
        cumple: false,
        nivel: 'TRANSFERENCIA_NO_DECLARADA',
        detalles: ['Se detectan servicios o referencias a países extranjeros que implican transferencia internacional de datos sin que la política la declare formalmente (Art. 15 Ley 29733 + Art. 6.1.7 DS 016-2024-JUS)']
      }
    }
    if (declaraTransferencia) {
      const indicaPais = /(a\s+[A-ZÁÉÍÓÚ][a-záéíóú]+|hacia\s+[A-Z]|país\s+destinatario|[A-Z][a-z]+\s+\(proveedor)/i.test(t)
      const mencionaNivelAdecuado = /(nivel\s+adecuado|nivel\s+de\s+protecci[oó]n|cláusulas\s+contractuales|mecanismo\s+alternativo|consentimiento.*transferencia)/i.test(t)
      if (!indicaPais) {
        return { cumple: false, nivel: 'SIN_PAIS_DESTINATARIO', detalles: ['Se declara transferencia internacional pero no se identifica el país o países destinatarios'] }
      }
      if (!mencionaNivelAdecuado) {
        return { cumple: false, nivel: 'SIN_NIVEL_PROTECCION', detalles: ['Se declara transferencia internacional con país identificado pero no se informa sobre el nivel de protección adecuado ni el mecanismo alternativo aplicable (Art. 15 Ley 29733)'] }
      }
    }
    return { cumple: true }
  },

  // A.5 — BANCO DE DATOS
  bancoDatos(t: string): ResultadoDetector {
    const menciona = /(banco\s+de\s+datos|base\s+de\s+datos\s+personal|RNPDP|registro\s+nacional)/i.test(t)
    const tieneCodigoRNPDP = /RNPDP\s*[n°º\-#]?\s*\d{3,}/i.test(t)
    if (!menciona) return { cumple: false, nivel: 'AUSENCIA', detalles: ['La política no menciona el banco de datos en que se almacenarán los datos'] }
    if (!tieneCodigoRNPDP) return { cumple: 'PARCIAL', nivel: 'SIN_CODIGO_RNPDP', detalles: ['Se menciona el banco de datos pero no se indica el código de inscripción en el RNPDP'] }
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
    if (esVago && !plazoDeterminado) return { cumple: false, nivel: 'PLAZO_INDETERMINADO', detalles: ['El plazo de conservación es vago e indeterminado. La normativa exige plazo determinado o, al menos, criterio determinable'] }
    return { cumple: true }
  },

  // A.9 — DERECHOS ARCO + REVOCACIÓN + ANPDP
  derechosARCO(t: string): ResultadoDetector {
    const resultado: ResultadoDetector = { cumple: true, faltantes: [], detalles: [] }
    const mencionaDerechos = /(derechos?\s+(de\s+)?(acceso|rectificaci[oó]n|cancelaci[oó]n|oposici[oó]n)|derechos?\s+ARCO|titular.*derechos?)/i.test(t)
    if (!mencionaDerechos) return { cumple: false, nivel: 'AUSENCIA_TOTAL', detalles: ['La política no hace mención de los derechos del titular (derechos ARCO)'] }
    const tieneEmail = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/i.test(t)
    const tieneDireccionFisica = /(mesa\s+de\s+partes|nuestras\s+oficinas|en\s+(la\s+)?direcci[oó]n|presencialmente\s+en)/i.test(t)
    const tieneFormulario = /(formulario|form|portal|plataforma|sistema)\s+(de\s+)?(solicitud|ARCO|derechos)/i.test(t)
    const tieneCanal = tieneEmail || tieneDireccionFisica || tieneFormulario
    if (!tieneCanal) {
      resultado.cumple = false
      resultado.faltantes?.push('SIN_CANAL_VERIFICABLE')
      resultado.detalles?.push('No se indica un canal concreto y verificable para ejercer los derechos ARCO (correo electrónico, dirección física o formulario)')
    }
    const mencionaRevocacion = /(revocar|revocaci[oó]n|retirar.*consentimiento|dejar\s+de\s+autorizar|cancelar.*consentimiento)/i.test(t)
    if (!mencionaRevocacion) {
      resultado.cumple = false
      resultado.faltantes?.push('SIN_REVOCACION')
      resultado.detalles?.push('No se informa sobre el derecho de revocación del consentimiento en cualquier momento (Art. 10 DS 016-2024-JUS)')
    }
    const mencionaANPDP = /(ANPDP|DGTAIPD|Autoridad\s+Nacional\s+de\s+Protecci[oó]n|tutela|Ministerio\s+de\s+Justicia.*protecci[oó]n\s+de\s+datos)/i.test(t)
    if (!mencionaANPDP) {
      resultado.faltantes?.push('SIN_REFERENCIA_ANPDP')
      resultado.detalles?.push('No se menciona la ANPDP como autoridad ante la que el titular puede ejercer su derecho de tutela')
    }
    if ((resultado.faltantes?.length || 0) > 0 && !resultado.nivel) {
      resultado.nivel = resultado.faltantes?.join('+')
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
  } = datosCrawler
  const politica_privacidad: PoliticaPrivacidadDetectada = politicaPrivacidadEntrada ?? { encontrada: false, texto: '' }
  const formularios: FormularioDetectado[] = Array.isArray(formulariosEntrada) ? formulariosEntrada : []
  const cookies_banner: CookiesBannerDetectado = cookiesBannerEntrada ?? { encontrado: false, texto: '' }
  const html_completo = typeof htmlCompletoEntrada === 'string' ? htmlCompletoEntrada : ''
  const texto = typeof politica_privacidad.texto === 'string' ? politica_privacidad.texto : ''
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

  // A.0 — Existencia de la política
  if (!politica_privacidad?.encontrada || !texto || texto.length < 100) {
    observaciones.push({
      id: `OBS-${String(observaciones.length + 1).padStart(2, '0')}`,
      modulo: 'A',
      categoria: 'Existencia de política de privacidad',
      severidad: 'GRAVE',
      hallazgo: 'No se encontró política de privacidad publicada o accesible en el sitio web.',
      evidencia: 'AUSENTE: no se encontró documento de política de privacidad.',
      norma_vulnerada: 'Art. 18 párrafo 2 Ley 29733 + Art. 7 DS 016-2024-JUS',
      riesgo_infraccion: 'grave',
      base_infraccion: 'Art. 133.2 DS 016-2024-JUS (incumplimiento total del deber de informar)',
      recomendacion: 'Publicar una Política de Privacidad fácilmente accesible e identificable desde el sitio web, preferiblemente desde el footer.'
    })
    contadorElementosFaltantesArt18 += 8 // todos los elementos faltan
  } else {

    // A.2 — Identidad y domicilio
    const r_identidad = detectores.identidad
    if (!r_identidad.cumple) {
      contadorElementosFaltantesArt18++
      observaciones.push({
        id: `OBS-${String(observaciones.length + 1).padStart(2, '0')}`,
        modulo: 'A',
        categoria: 'Identidad y domicilio del responsable',
        severidad: 'IMPORTANTE',
        hallazgo: r_identidad.nivel === 'AUSENCIA_TOTAL'
          ? 'No se identifica al titular del banco de datos ni su domicilio.'
          : r_identidad.nivel === 'SIN_RAZON_SOCIAL' || r_identidad.nivel === 'SIN_NOMBRE'
            ? 'La política no identifica claramente la razón social del responsable del tratamiento.'
            : 'La política no indica el domicilio o dirección del responsable del tratamiento.',
        evidencia: 'AUSENTE en el texto de la política.',
        norma_vulnerada: 'Art. 18 Ley 29733 + Art. 6.1.1 DS 016-2024-JUS',
        riesgo_infraccion: 'leve/grave (según total de elementos faltantes)',
        base_infraccion: 'Art. 132.5 o 133.2 DS 016-2024-JUS',
        recomendacion: 'Incluir nombre o razón social completa y dirección física del responsable del tratamiento.'
      })
    }

    // A.3 — Finalidad
    // TODO(legal): el bloque original ramificaba sobre el nivel
    // 'FINES_ADICIONALES_SIN_CONSENTIMIENTO_INDEPENDIENTE', pero
    // det.finalidad() nunca lo retorna (los niveles reales son
    // FINALIDAD_GENERICA, SIN_DISTINCION_FINALIDADES, SIN_MECANISMO_NEGATIVA,
    // CONDICIONAMIENTO_ILICITO, CONSENTIMIENTO_EN_BLOQUE, AUSENCIA_TOTAL).
    // Hoy siempre cae en el texto de 'ausencia/insuficiente'; revisar si
    // se quiere diferenciar el hallazgo y la recomendacion por nivel.
    const r_finalidad = detectores.finalidad
    if (!r_finalidad.cumple) {
      contadorElementosFaltantesArt18++
      observaciones.push({
        id: `OBS-${String(observaciones.length + 1).padStart(2, '0')}`,
        modulo: 'A',
        categoria: 'Finalidad del tratamiento',
        severidad: 'GRAVE',
        hallazgo: 'La política no declara las finalidades del tratamiento.',
        evidencia: 'AUSENTE o INSUFICIENTE en la política.',
        norma_vulnerada: 'Art. 18 + Art. 7 (principio de finalidad) Ley 29733 + Art. 10.2 DS 016-2024-JUS',
        riesgo_infraccion: 'grave',
        base_infraccion: 'Art. 133.3 DS 016-2024-JUS',
        recomendacion: 'Declarar de forma clara, explícita y lícita las finalidades para las que se tratan los datos.'
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
    const r_transf = detectores.transferencia
    if (!r_transf.cumple) {
      contadorElementosFaltantesArt18++
      observaciones.push({
        id: `OBS-${String(observaciones.length + 1).padStart(2, '0')}`,
        modulo: 'A',
        categoria: 'Transferencia internacional de datos',
        severidad: r_transf.nivel === 'TRANSFERENCIA_NO_DECLARADA' ? 'GRAVE' : 'IMPORTANTE',
        hallazgo: r_transf.nivel === 'TRANSFERENCIA_NO_DECLARADA'
          ? 'Se detecta el uso de servicios de terceros en el extranjero (proveedores cloud, analytics, etc.) pero la política no declara el flujo transfronterizo de datos.'
          : 'Se declara transferencia internacional pero no se identifica el país destinatario ni el nivel de protección.',
        evidencia: r_transf.nivel === 'TRANSFERENCIA_NO_DECLARADA'
          ? 'Indicios de servicios extranjeros detectados en el sitio sin declaración de transferencia internacional.'
          : 'La política menciona transferencia internacional sin especificar país destinatario.',
        norma_vulnerada: 'Art. 15 Ley 29733 + Art. 6.1.7 DS 016-2024-JUS',
        riesgo_infraccion: 'grave',
        base_infraccion: 'Art. 133.2 DS 016-2024-JUS',
        recomendacion: 'Declarar el flujo transfronterizo, identificar los países destinatarios e informar si cuentan con nivel de protección adecuado o el mecanismo alternativo aplicable (Art. 15 Ley 29733).'
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
    if (!r_plazo.cumple) {
      contadorElementosFaltantesArt18++
      observaciones.push({
        id: `OBS-${String(observaciones.length + 1).padStart(2, '0')}`,
        modulo: 'A',
        categoria: 'Plazo de conservación de datos',
        severidad: 'IMPORTANTE',
        hallazgo: r_plazo.nivel === 'PLAZO_INDETERMINADO'
          ? 'El plazo de conservación declarado es vago e indeterminado ("el tiempo necesario") sin criterio claro que lo delimite.'
          : 'La política no informa el plazo o criterio de conservación de los datos personales.',
        evidencia: 'AUSENTE o INDETERMINADO en la política.',
        norma_vulnerada: 'Art. 18 Ley 29733 + Art. 6.1.9 DS 016-2024-JUS',
        riesgo_infraccion: 'leve',
        base_infraccion: 'Art. 132.5 DS 016-2024-JUS',
        recomendacion: 'Indicar un plazo determinado o un criterio determinable (ej: "mientras dure la relación contractual + 5 años por obligaciones legales").'
      })
    }

    // A.9 — Derechos ARCO
    const r_arco = detectores.arco
    if (!r_arco.cumple) {
      const nivelArco = r_arco.nivel || ''
      if (nivelArco === 'AUSENCIA_TOTAL') contadorElementosFaltantesArt18++
      observaciones.push({
        id: `OBS-${String(observaciones.length + 1).padStart(2, '0')}`,
        modulo: 'A',
        categoria: 'Derechos ARCO y mecanismos de ejercicio',
        severidad: nivelArco === 'AUSENCIA_TOTAL' ? 'GRAVE' : 'IMPORTANTE',
        hallazgo: nivelArco === 'AUSENCIA_TOTAL'
          ? 'La política no informa sobre los derechos ARCO ni los mecanismos para ejercerlos.'
          : `Información sobre derechos ARCO incompleta. Falta(n): ${nivelArco.replace(/\+/g, ', ')}`,
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
    if (!politicaMencionaCookies) {
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

  // ── PUNTAJE Y RESUMEN ──
  const contMuyGrave = observaciones.filter(o => o.severidad === 'MUY GRAVE').length
  const contGrave = observaciones.filter(o => o.severidad === 'GRAVE').length
  const contImportante = observaciones.filter(o => o.severidad === 'IMPORTANTE').length
  const contModerada = observaciones.filter(o => o.severidad === 'MODERADA').length

  let puntaje = 100
    - (contMuyGrave * 25)
    - (contGrave * 15)
    - (contImportante * 7)
    - (contModerada * 3)
  puntaje = Math.max(0, puntaje)

  const elementosCumplidos = []
  if (detectores.identidad.cumple) elementosCumplidos.push('Identidad y domicilio del responsable declarados (Art. 18 Ley 29733)')
  if (detectores.finalidad.cumple) elementosCumplidos.push('Finalidades del tratamiento declaradas (Art. 7 + 18 Ley 29733)')
  if (detectores.destinatarios.cumple) elementosCumplidos.push('Destinatarios identificados (Art. 18 Ley 29733)')
  if (detectores.plazo.cumple) elementosCumplidos.push('Plazo de conservación indicado (Art. 18 Ley 29733)')
  if (detectores.arco.cumple) elementosCumplidos.push('Derechos ARCO con canal de ejercicio informados (Art. 18-19 Ley 29733)')
  if (formularios.every(f => !f.checkbox_premarcado)) elementosCumplidos.push('No se detectaron checkboxes pre-marcados')

  return {
    sitio: url_auditada,
    fecha_auditoria: new Date().toISOString(),
    resumen_ejecutivo: `Auditoría de cumplimiento bajo Ley N° 29733 y DS N° 016-2024-JUS. Se identificaron ${observaciones.length} observaciones: ${contGrave} grave(s), ${contImportante} importante(s), ${contModerada} moderada(s). Puntaje de cumplimiento: ${puntaje}/100.`,
    puntaje_cumplimiento: puntaje,
    elementos_faltantes_art18: contadorElementosFaltantesArt18,
    clasificacion_deber_informar: clasificacion,
    observaciones,
    elementos_cumplidos: elementosCumplidos,
    trackers_detectados: trackersEncontrados,
    advertencias_metodologicas: [
      'Este análisis es automatizado mediante motor de reglas. No reemplaza la auditoría legal especializada.',
      'La verificación de inscripción efectiva en el RNPDP requiere consulta directa a la ANPDP.',
      'Las observaciones sobre datos sensibles y proporcionalidad requieren verificación manual del auditor.',
      'Los trackers detectados en el HTML son indicativos, no determinantes de una infracción confirmada.',
      'La coherencia entre política declarada y prácticas internas requiere auditoría documental adicional.'
    ]
  }
}
