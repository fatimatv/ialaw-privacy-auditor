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
};

export type ResultadoAuditoria = {
  sitio: string;
  fecha_auditoria: string;
  resumen_ejecutivo: string;
  puntaje_cumplimiento: number;
  elementos_faltantes_art18: number;
  clasificacion_deber_informar: unknown;
  observaciones: Observacion[];
  elementos_cumplidos: string[];
  trackers_detectados: string[];
  advertencias_metodologicas: string[];
};