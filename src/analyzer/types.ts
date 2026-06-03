export type Severidad =
  | "MUY GRAVE"
  | "GRAVE"
  | "IMPORTANTE"
  | "MODERADA";

export type CampoFormulario = {
  name?: string;
  type?: string;
  placeholder?: string;
  label?: string;
  required?: boolean;
};

export type FormularioDetectado = {
  pagina_origen: string;
  checkbox_premarcado: boolean;
  tiene_checkbox_consentimiento: boolean;
  tiene_link_politica: boolean;
  campos: CampoFormulario[];
};

export type PoliticaPrivacidadDetectada = {
  encontrada: boolean;
  url?: string;
  texto?: string;
};

export type CookiesBannerDetectado = {
  encontrado?: boolean;
  texto?: string;
};

export type DatosCrawler = {
  url_auditada: string;
  politica_privacidad: PoliticaPrivacidadDetectada;
  formularios: FormularioDetectado[];
  cookies_banner: CookiesBannerDetectado;
  html_completo: string;
};

export type Observacion = {
  id: string;
  modulo: string;
  categoria: string;
  severidad: Severidad | string;
  hallazgo: string;
  evidencia: string;
  norma_vulnerada: string;
  riesgo_infraccion: string;
  base_infraccion: string;
  recomendacion: string;
  requiere_verificacion_manual?: boolean;
  rango_multa_aplicable?: string;
  /** Codigo tecnico del nivel emitido por el detector (ej. "DOMICILIO_INCOMPLETO", "SIN_REVOCACION+SIN_REFERENCIA_ANPDP"). Util para auditoria y debugging. */
  nivel?: string;
  /** Descripciones especificas y legibles de cada sub-elemento que fallo dentro de esta categoria. */
  detalles?: string[];
};

export type ElementoCumplido = {
  categoria: string;
  norma: string;
  evidencia_detectada: string;
};

export type DeduccionPuntaje = {
  severidad: Severidad;
  penalidad_unitaria: number;
  cantidad: number;
  deduccion_total: number;
};

export type ClasificacionDeberInformar = {
  elementos_faltantes_art18: number;
  clasificacion: "NO_APLICA" | "LEVE" | "GRAVE";
  norma_aplicable: string;
  rango_multa: string;
  criterio: string;
};

export type CalculoPuntaje = {
  base: number;
  deducciones: DeduccionPuntaje[];
  deduccion_total: number;
  puntaje_final: number;
  formula_texto: string;
  clasificacion_deber_informar: ClasificacionDeberInformar;
};

export type ResultadoAuditoria = {
  sitio: string;
  fecha_auditoria: string;
  resumen_ejecutivo: string;
  puntaje_cumplimiento: number;
  elementos_faltantes_art18: number;
  /** Mantenido por compatibilidad. La version estructurada esta en metodologia_calificacion.clasificacion_deber_informar. */
  clasificacion_deber_informar: unknown;
  observaciones: Observacion[];
  elementos_cumplidos: ElementoCumplido[];
  trackers_detectados: string[];
  advertencias_metodologicas: string[];
  metodologia_calificacion: CalculoPuntaje;
};
