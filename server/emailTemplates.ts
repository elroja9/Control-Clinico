import type { Company, Patient, Cita, Consultation, User, Factura, CasoLegal, DocumentoCaso } from "../src/data/mockData";
import { textoSobre, colorMarca } from "./branding";
import { terminoPersona } from "../src/utils/terminoPersona";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const FORMULA_LABEL: Record<string, string> = {
  HARRIS_BENEDICT_OBESOS: "Harris Benedict (Obesos)",
  MIFFLIN_ST_JEOR: "Mifflin St Jeor",
  MULLER: "Müller"
};

const DIRECCION_LABEL: Record<string, string> = {
  DEFICIT: "Déficit",
  MANTENIMIENTO: "Mantenimiento",
  SUPERAVIT: "Superávit"
};

// 4 kcal/g carbohidratos y proteína, 9 kcal/g grasa — el dato guardado es % de la
// distribución calórica; los gramos se calculan solo para mostrar en el correo.
function gramosDesdeMacroPct(pct: number | null, totalCalorias: number, kcalPorGramo: 4 | 9): number | null {
  if (pct == null) return null;
  return Math.round((pct / 100) * totalCalorias / kcalPorGramo);
}

function escapeHtml(value: string | number | null | undefined): string {
  const str = String(value ?? "");
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------------------------------------------------------------------------
// Utilidades de URL y fechas
// ---------------------------------------------------------------------------

const FUENTE = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const COLOR_TEXTO = "#0f172a";
const COLOR_TENUE = "#475569";

/** Solo http(s): evita javascript: y data: en href/src. */
function esUrlHttp(url: string | null | undefined): url is string {
  return typeof url === "string" && /^https?:\/\/[^\s"'<>]+$/i.test(url.trim());
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const DIAS_CORTOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

interface FechaHoraParseada {
  anio: number;
  mes: number; // 1-12
  dia: number;
  hora: number | null;
  minuto: number | null;
}

/** Interpreta "YYYY-MM-DDTHH:MM" sin pasar por zonas horarias (la cita es hora local de la clínica). */
function parseFechaHora(valor: string | null | undefined): FechaHoraParseada | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(String(valor ?? ""));
  if (!m) return null;
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return {
    anio: Number(m[1]),
    mes,
    dia,
    hora: m[4] != null ? Number(m[4]) : null,
    minuto: m[5] != null ? Number(m[5]) : null
  };
}

function diaSemana(p: FechaHoraParseada): number {
  return new Date(Date.UTC(p.anio, p.mes - 1, p.dia)).getUTCDay();
}

/** "martes 2 de diciembre de 2026" */
function fechaLarga(p: FechaHoraParseada): string {
  return `${DIAS[diaSemana(p)]} ${p.dia} de ${MESES[p.mes - 1]} de ${p.anio}`;
}

function horaTexto(h: number, min: number): string {
  const hh = ((h % 24) + 24) % 24;
  return `${hh % 12 || 12}:${String(min).padStart(2, "0")} ${hh < 12 ? "a. m." : "p. m."}`;
}

/** "9:00 a. m. a 9:45 a. m. (45 min)" */
function horaConDuracion(p: FechaHoraParseada, duracionMinutos: number): string | null {
  if (p.hora == null || p.minuto == null) return null;
  const inicio = horaTexto(p.hora, p.minuto);
  if (!duracionMinutos || duracionMinutos <= 0) return inicio;
  const finTotal = (p.hora * 60 + p.minuto + duracionMinutos) % 1440;
  const fin = horaTexto(Math.floor(finTotal / 60), finTotal % 60);
  return `${inicio} a ${fin} (${duracionMinutos} min)`;
}

/** "mar 2 dic, 9:00 a. m." para asuntos. */
function fechaCorta(valor: string): string {
  const p = parseFechaHora(valor);
  if (!p) return valor;
  const base = `${DIAS_CORTOS[diaSemana(p)]} ${p.dia} ${MESES_CORTOS[p.mes - 1]}`;
  return p.hora != null && p.minuto != null ? `${base}, ${horaTexto(p.hora, p.minuto)}` : base;
}

/** "martes 2 de diciembre de 2026, 9:00 a. m." para la comparación Antes/Ahora. */
function fechaHoraLarga(valor: string): string {
  const p = parseFechaHora(valor);
  if (!p) return valor;
  return p.hora != null && p.minuto != null ? `${fechaLarga(p)}, ${horaTexto(p.hora, p.minuto)}` : fechaLarga(p);
}

function urlMapas(direccion: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}`;
}

function soloDigitos(v: string | null | undefined): string {
  return String(v ?? "").replace(/\D/g, "");
}

// ---------------------------------------------------------------------------
// Shell y componentes visuales (tablas + estilos inline, compatible con Outlook)
// ---------------------------------------------------------------------------

function emailShell(company: Company, title: string, bodyHtml: string, preheader = ""): string {
  // El color del texto sobre la banda de marca se calcula por luminancia: un blanco fijo se
  // vuelve ilegible cuando la clínica configura un color claro (hay casos reales en la base).
  const primario = colorMarca(company.colorPrimario, colorMarca(company.colorSidebar, "#0f766e"));
  const textoBanda = textoSobre(primario);
  const nombre = escapeHtml(company.nombreComercial);

  // Un logo data: base64 lo bloquea Gmail, así que solo se usa una URL http(s) pública.
  const marca = esUrlHttp(company.logoUrl)
    ? `<img src="${escapeHtml(company.logoUrl.trim())}" height="48" alt="${nombre}" style="display:block;border:0;outline:none;max-height:48px;max-width:240px;height:auto;" />`
    : `<span data-marca="nombre" style="color:${textoBanda};font-family:${FUENTE};font-size:22px;line-height:1.3;font-weight:bold;">${nombre}</span>`;

  const relleno = "&zwnj;&nbsp;".repeat(40);
  const preheaderHtml = preheader
    ? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}${relleno}</div>`
    : "";

  const pieLineas = [
    `<strong style="color:${COLOR_TEXTO};">${nombre}</strong>`,
    company.identificacion ? `Identificación: ${escapeHtml(company.identificacion)}` : "",
    company.otrasSenas && company.otrasSenas.trim() ? escapeHtml(company.otrasSenas.trim()) : "",
    company.correoEmisor ? escapeHtml(company.correoEmisor) : ""
  ].filter(Boolean).join("<br/>");

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${escapeHtml(title)}</title>
    <style>
      @media only screen and (max-width:620px) {
        .contenedor { width:100% !important; }
        .px { padding-left:16px !important; padding-right:16px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:#f1f5f9;font-family:${FUENTE};">
    ${preheaderHtml}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" class="contenedor" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #e2e8f0;">
            <tr>
              <td class="px" bgcolor="${primario}" style="background-color:${primario};padding:24px;text-align:left;">
                ${marca}
              </td>
            </tr>
            <tr>
              <td class="px" style="padding:28px 24px 8px 24px;font-family:${FUENTE};">
                <h1 style="margin:0;color:${COLOR_TEXTO};font-family:${FUENTE};font-size:24px;line-height:1.3;font-weight:bold;">${escapeHtml(title)}</h1>
              </td>
            </tr>
            <tr>
              <td class="px" style="padding:8px 24px 28px 24px;color:#1e293b;font-family:${FUENTE};font-size:16px;line-height:1.5;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td class="px" bgcolor="#f8fafc" style="background-color:#f8fafc;padding:20px 24px;border-top:1px solid #e2e8f0;font-family:${FUENTE};font-size:13px;line-height:1.5;color:${COLOR_TENUE};">
                ${pieLineas}
                <br/><br/>
                <span style="color:#64748b;">Este es un correo automático.</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Párrafo estándar del cuerpo. `html` ya debe venir escapado. */
function parrafo(html: string, estilo = ""): string {
  return `<p style="margin:0 0 16px 0;font-size:16px;line-height:1.5;${estilo}">${html}</p>`;
}

/** Botón "bulletproof": tabla con bgcolor para que Outlook respete color y relleno. */
function boton(company: Company, href: string, etiqueta: string): string {
  const color = colorMarca(company.colorPrimario, colorMarca(company.colorSidebar, "#0f766e"));
  const textoColor = textoSobre(color);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 12px 8px 0;display:inline-table;">
    <tr>
      <td align="center" bgcolor="${color}" style="background-color:${color};border-radius:8px;">
        <a href="${escapeHtml(href)}" target="_blank" style="display:inline-block;padding:12px 24px;font-family:${FUENTE};font-size:16px;line-height:1.2;font-weight:bold;color:${textoColor};text-decoration:none;border-radius:8px;">${escapeHtml(etiqueta)}</a>
      </td>
    </tr>
  </table>`;
}

interface FilaDetalle {
  etiqueta: string;
  texto: string | null | undefined;
  /** HTML ya escapado que reemplaza al texto en el correo HTML (p. ej. valor tachado). */
  html?: string;
}

/** Tarjeta de detalles: una fila por dato con etiqueta; omite las filas sin valor. */
function tarjetaDetalles(filas: FilaDetalle[]): string {
  const visibles = filas.filter(f => f.texto != null && String(f.texto).trim() !== "");
  const filasHtml = visibles
    .map((f, i) => `
      <tr>
        <td style="padding:12px 16px;${i < visibles.length - 1 ? "border-bottom:1px solid #e2e8f0;" : ""}font-family:${FUENTE};">
          <div style="color:${COLOR_TENUE};font-size:12px;line-height:1.4;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;">${escapeHtml(f.etiqueta)}</div>
          <div style="color:${COLOR_TEXTO};font-size:16px;line-height:1.5;">${f.html ?? escapeHtml(f.texto)}</div>
        </td>
      </tr>`)
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f8fafc" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin:0 0 20px 0;">${filasHtml}</table>`;
}

function textoDetalles(filas: FilaDetalle[]): string {
  return filas
    .filter(f => f.texto != null && String(f.texto).trim() !== "")
    .map(f => `${f.etiqueta}: ${f.texto}`)
    .join("\n");
}

function badge(texto: string, fondo: string, color: string): string {
  return `<span style="display:inline-block;background-color:${fondo};color:${color};font-family:${FUENTE};font-size:13px;line-height:1.2;font-weight:bold;padding:6px 12px;border-radius:999px;">${escapeHtml(texto)}</span>`;
}

/** Tarjeta simple con etiqueta y valor (valor ya escapado), usada por consulta, factura, etc. */
function infoCard(label: string, value: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;">
    <tr>
      <td bgcolor="#f8fafc" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;font-family:${FUENTE};">
        <span style="display:block;color:${COLOR_TENUE};font-size:12px;line-height:1.4;text-transform:uppercase;font-weight:bold;letter-spacing:0.5px;">${escapeHtml(label)}</span>
        <span style="display:block;color:${COLOR_TEXTO};font-size:16px;line-height:1.5;">${value}</span>
      </td>
    </tr>
  </table>`;
}

function seccion(titulo: string): string {
  return `<h2 style="color:${COLOR_TEXTO};font-family:${FUENTE};font-size:14px;line-height:1.4;text-transform:uppercase;letter-spacing:0.5px;margin:24px 0 8px 0;padding-bottom:4px;border-bottom:2px solid #e2e8f0;">${escapeHtml(titulo)}</h2>`;
}

function firma(nombre: string): string {
  return `<p style="margin:16px 0 0 0;font-size:16px;line-height:1.5;font-weight:bold;color:${COLOR_TEXTO};">${escapeHtml(nombre)}</p>`;
}

// ---------------------------------------------------------------------------
// Citas
// ---------------------------------------------------------------------------

type TipoNotifCita = "CONFIRMACION" | "CANCELACION" | "MODIFICACION";

function modalidadTexto(cita: Cita): string {
  return cita.tipoVisita === "DOMICILIO" ? "A domicilio" : "En consultorio";
}

function direccionCita(company: Company, cita: Cita): string | null {
  if (cita.tipoVisita === "DOMICILIO") return cita.direccionDomicilio?.trim() || null;
  return company.otrasSenas?.trim() || null;
}

export function renderCitaEmail(params: {
  company: Company;
  patient: Patient;
  cita: Cita;
  tipoNotif: TipoNotifCita;
  /** Nombre del servicio del catálogo; si no se pasa, la fila se omite. */
  servicio?: string | null;
  /** Nombre del profesional a cargo; si no se pasa, la fila se omite. */
  profesional?: string | null;
  /** Fecha y hora previas ("YYYY-MM-DDTHH:MM") para mostrar Antes / Ahora en una reprogramación. */
  fechaAnterior?: string | null;
}): RenderedEmail {
  const { company, patient, cita, tipoNotif, servicio, profesional, fechaAnterior } = params;
  const parsed = parseFechaHora(cita.fechaHora);
  const cancelada = tipoNotif === "CANCELACION";
  const confirmada = tipoNotif === "CONFIRMACION" && cita.estadoCita === "CONFIRMADA";

  const title = cancelada
    ? "Su cita fue cancelada"
    : tipoNotif === "MODIFICACION"
    ? "Su cita fue reprogramada"
    : confirmada
    ? "Su cita está confirmada"
    : "Recibimos su solicitud de cita: pendiente de confirmación";
  const etiquetaAsunto = cancelada
    ? "Cita cancelada"
    : tipoNotif === "MODIFICACION"
    ? "Cita reprogramada"
    : confirmada
    ? "Cita confirmada"
    : "Solicitud de cita recibida";
  const subject = `${etiquetaAsunto} · ${company.nombreComercial} · ${fechaCorta(cita.fechaHora)}`;

  const intro = cancelada
    ? "Le informamos que su cita fue cancelada. Estos eran los datos:"
    : tipoNotif === "MODIFICACION"
    ? "Le informamos que su cita fue reprogramada. Estos son los nuevos datos:"
    : confirmada
    ? "Le confirmamos su cita con los siguientes datos:"
    : "Registramos su solicitud. Le avisaremos cuando la cita sea confirmada. Estos son los datos:";

  const fechaTxt = parsed ? fechaLarga(parsed) : cita.fechaHora;
  const horaTxt = parsed ? horaConDuracion(parsed, cita.duracionMinutos) : null;
  const direccion = cancelada ? null : direccionCita(company, cita);
  const mostrarAntes = tipoNotif === "MODIFICACION" && !!fechaAnterior && fechaAnterior !== cita.fechaHora;

  const filas: FilaDetalle[] = [];
  if (mostrarAntes) {
    filas.push({
      etiqueta: "Antes",
      texto: fechaHoraLarga(fechaAnterior!),
      html: `<span style="text-decoration:line-through;color:${COLOR_TENUE};">${escapeHtml(fechaHoraLarga(fechaAnterior!))}</span>`
    });
  }
  filas.push({ etiqueta: mostrarAntes ? "Ahora" : "Fecha", texto: fechaTxt });
  filas.push({ etiqueta: "Hora", texto: horaTxt });
  filas.push({ etiqueta: "Profesional", texto: profesional });
  filas.push({ etiqueta: "Servicio", texto: servicio });
  filas.push({ etiqueta: "Modalidad", texto: modalidadTexto(cita) });
  filas.push({ etiqueta: cita.tipoVisita === "DOMICILIO" ? "Dirección de la visita" : "Dirección", texto: direccion });
  // Privacidad: cita.notas es interna del profesional y nunca se incluye en el correo al paciente.

  const lineaCalendario = cancelada
    ? "Adjuntamos la cancelación para retirarla de su calendario."
    : "Adjuntamos la cita para agregarla a su calendario.";

  const wa = soloDigitos(company.whatsappReservas);
  const contactoHtml = wa
    ? `Escríbanos por WhatsApp al <a href="https://wa.me/${wa}" target="_blank" style="color:#0f172a;font-weight:bold;">+${wa}</a>`
    : company.correoEmisor
    ? `Escríbanos a <a href="mailto:${escapeHtml(company.correoEmisor)}" style="color:#0f172a;font-weight:bold;">${escapeHtml(company.correoEmisor)}</a>`
    : "Comuníquese con la clínica";
  const contactoTexto = wa
    ? `Escríbanos por WhatsApp: https://wa.me/${wa}`
    : company.correoEmisor
    ? `Escríbanos a ${company.correoEmisor}`
    : "Comuníquese con la clínica";
  const tituloCambio = cancelada ? "¿Desea reagendar?" : "¿Necesita cambiar su cita?";
  const textoCambio = cancelada
    ? "Comuníquese con la clínica y con gusto le buscamos un nuevo espacio."
    : "Comuníquese con la clínica con anticipación y con gusto le ayudamos.";

  const bodyHtml = `
    ${parrafo(`Estimado(a) ${escapeHtml(patient.nombreCompleto)},`)}
    ${parrafo(escapeHtml(intro))}
    ${tarjetaDetalles(filas)}
    ${direccion ? boton(company, urlMapas(direccion), "Cómo llegar") : ""}
    ${parrafo(escapeHtml(lineaCalendario), "margin-top:12px;color:" + COLOR_TENUE + ";font-size:14px;")}
    ${seccion(tituloCambio)}
    ${parrafo(`${escapeHtml(textoCambio)} ${contactoHtml}.`)}
    ${parrafo("Gracias por su confianza.")}
    ${firma(company.nombreComercial)}
  `;

  const text = [
    title,
    "",
    `Estimado(a) ${patient.nombreCompleto},`,
    intro,
    "",
    textoDetalles(filas),
    ...(direccion ? ["", `Cómo llegar: ${urlMapas(direccion)}`] : []),
    "",
    lineaCalendario,
    "",
    tituloCambio,
    `${textoCambio} ${contactoTexto}`,
    "",
    "Gracias por su confianza.",
    company.nombreComercial,
    "",
    "Este es un correo automático."
  ].join("\n");

  return { subject, html: emailShell(company, title, bodyHtml, `${fechaTxt}${horaTxt ? `, ${horaTxt}` : ""} · ${company.nombreComercial}`), text };
}

export function renderCitaEmailProfesional(params: {
  company: Company;
  professional: User;
  patient: Patient;
  cita: Cita;
  /** Nombre del servicio del catálogo; si no se pasa, la fila se omite. */
  servicio?: string | null;
  /** URL pública de la agenda; si no es http(s), el botón "Abrir agenda" se omite. */
  agendaUrl?: string | null;
}): RenderedEmail {
  const { company, professional, patient, cita, servicio, agendaUrl } = params;
  const parsed = parseFechaHora(cita.fechaHora);
  const personaSingular = terminoPersona(company.perfilCompania).singular;
  const title = "Nueva cita agendada";
  const subject = `Nueva cita · ${company.nombreComercial} · ${fechaCorta(cita.fechaHora)} · ${patient.nombreCompleto}`;

  const estadoBadge =
    cita.estadoCita === "PROGRAMADA"
      ? { texto: "Pendiente de confirmar", fondo: "#fef3c7", color: "#92400e" }
      : cita.estadoCita === "CONFIRMADA"
      ? { texto: "Confirmada", fondo: "#d1fae5", color: "#065f46" }
      : { texto: cita.estadoCita, fondo: "#e2e8f0", color: "#1e293b" };

  const domicilio = cita.tipoVisita === "DOMICILIO";
  const direccion = direccionCita(company, cita);
  const filas: FilaDetalle[] = [
    { etiqueta: personaSingular, texto: patient.nombreCompleto },
    { etiqueta: "Teléfono", texto: patient.telefono },
    { etiqueta: "Correo", texto: patient.correoElectronico },
    { etiqueta: "Fecha", texto: parsed ? fechaLarga(parsed) : cita.fechaHora },
    { etiqueta: "Hora", texto: parsed ? horaConDuracion(parsed, cita.duracionMinutos) : null },
    { etiqueta: "Servicio", texto: servicio },
    { etiqueta: "Modalidad", texto: modalidadTexto(cita) },
    { etiqueta: "Dirección", texto: direccion },
    { etiqueta: "Tiempo de traslado estimado", texto: domicilio && cita.tiempoTrasladoMinutos != null ? `${cita.tiempoTrasladoMinutos} minutos` : null },
    { etiqueta: `Notas del ${personaSingular.toLowerCase()}`, texto: cita.notas }
  ];

  const urlAgenda = esUrlHttp(agendaUrl) ? agendaUrl.trim() : null;

  const bodyHtml = `
    ${parrafo(`Estimado(a) ${escapeHtml(professional.nombre)},`)}
    ${parrafo("Se registró una nueva cita a través de la página de reservas en línea.", "margin-bottom:12px;")}
    <p style="margin:0 0 16px 0;">${badge(estadoBadge.texto, estadoBadge.fondo, estadoBadge.color)}</p>
    ${tarjetaDetalles(filas)}
    ${urlAgenda ? boton(company, urlAgenda, "Abrir agenda") : ""}
    ${firma(company.nombreComercial)}
  `;

  const text = [
    title,
    `Estado: ${estadoBadge.texto}`,
    "",
    textoDetalles(filas),
    ...(urlAgenda ? ["", `Abrir agenda: ${urlAgenda}`] : []),
    "",
    company.nombreComercial,
    "",
    "Este es un correo automático."
  ].join("\n");

  return { subject, html: emailShell(company, title, bodyHtml, `${patient.nombreCompleto} · ${fechaCorta(cita.fechaHora)} · ${estadoBadge.texto}`), text };
}

// ---------------------------------------------------------------------------
// Consulta
// ---------------------------------------------------------------------------

export function renderConsultaEmail(params: {
  company: Company;
  patient: Patient;
  consultation: Consultation;
}): RenderedEmail {
  const { company, patient, consultation } = params;
  const subject = `Reporte de Consulta - ${company.nombreComercial}`;
  const title = consultation.tipo === "Nutrición" ? "Reporte de Consulta Nutricional" : "Reporte de Sesión de Fisioterapia";

  let sectionHtml = "";
  let sectionText = "";

  if (consultation.tipo === "Nutrición" && consultation.antropometria) {
    const a = consultation.antropometria;
    sectionHtml += `
      ${seccion("Composición Corporal")}
      ${infoCard("Peso Corporal", `${escapeHtml(a.peso)} kg`)}
      ${infoCard("IMC", escapeHtml(a.imc))}
      ${infoCard("Grasa Corporal", `${escapeHtml(a.grasaCorporal)}%`)}
      ${infoCard("Masa Muscular", `${escapeHtml(a.masaMuscular)} kg`)}
    `;
    sectionText += `Composición Corporal\nPeso: ${a.peso} kg | IMC: ${a.imc} | Grasa Corporal: ${a.grasaCorporal}% | Masa Muscular: ${a.masaMuscular} kg\n\n`;

    if (consultation.dieta) {
      const d = consultation.dieta;

      if (d.prescripcionCalorica) {
        const pc = d.prescripcionCalorica;
        const formulaLabel = FORMULA_LABEL[pc.formula] || pc.formula;
        const direccionLabel = DIRECCION_LABEL[pc.direccion] || pc.direccion;
        sectionHtml += `
          ${seccion("Prescripción Calórica")}
          ${infoCard("Fórmula", escapeHtml(formulaLabel))}
          ${infoCard("TMB", `${escapeHtml(pc.tmb)} kcal`)}
          ${infoCard("Objetivo", `${escapeHtml(direccionLabel)} ${escapeHtml(pc.porcentaje)}%`)}
          ${infoCard("Presupuesto Calórico", `${escapeHtml(d.totalCalorias)} kcal`)}
          ${d.macros ? infoCard("Macronutrientes", `Carbohidratos ${escapeHtml(d.macros.carbohidratosPct)}% (${gramosDesdeMacroPct(d.macros.carbohidratosPct, d.totalCalorias, 4)}g) &middot; Proteínas ${escapeHtml(d.macros.proteinasPct)}% (${gramosDesdeMacroPct(d.macros.proteinasPct, d.totalCalorias, 4)}g) &middot; Grasas ${escapeHtml(d.macros.grasasPct)}% (${gramosDesdeMacroPct(d.macros.grasasPct, d.totalCalorias, 9)}g)`) : ""}
        `;
        sectionText += `Prescripción Calórica\nFórmula: ${formulaLabel} | TMB: ${pc.tmb} kcal | Objetivo: ${direccionLabel} ${pc.porcentaje}% | Presupuesto: ${d.totalCalorias} kcal\n${d.macros ? `Macronutrientes: Carbohidratos ${d.macros.carbohidratosPct}% (${gramosDesdeMacroPct(d.macros.carbohidratosPct, d.totalCalorias, 4)}g), Proteínas ${d.macros.proteinasPct}% (${gramosDesdeMacroPct(d.macros.proteinasPct, d.totalCalorias, 4)}g), Grasas ${d.macros.grasasPct}% (${gramosDesdeMacroPct(d.macros.grasasPct, d.totalCalorias, 9)}g)\n` : ""}\n`;
      }

      sectionHtml += `
        ${seccion(`Plan Alimentario Recomendado (${d.totalCalorias} kcal)`)}
        ${infoCard("Desayuno", escapeHtml(d.desayuno))}
        ${d.meriendaManana ? infoCard("Merienda AM", escapeHtml(d.meriendaManana)) : ""}
        ${infoCard("Almuerzo", escapeHtml(d.almuerzo))}
        ${d.meriendaTarde ? infoCard("Merienda PM", escapeHtml(d.meriendaTarde)) : ""}
        ${infoCard("Cena", escapeHtml(d.cena))}
        ${d.indicaciones ? infoCard("Indicaciones", escapeHtml(d.indicaciones)) : ""}
      `;
      sectionText += `Plan Alimentario (${d.totalCalorias} kcal)\nDesayuno: ${d.desayuno}\nAlmuerzo: ${d.almuerzo}\nCena: ${d.cena}\n${d.indicaciones ? `Indicaciones: ${d.indicaciones}\n` : ""}\n`;
    }
  }

  if (consultation.tipo === "Fisioterapia" && consultation.fisioterapia) {
    const f = consultation.fisioterapia;
    sectionHtml += `
      ${seccion("Valoración de Dolor")}
      ${infoCard("Zona de Dolor", escapeHtml(f.zonaDolor))}
      ${infoCard("Escala EVA", `${escapeHtml(f.evaDolor)} de 10`)}
      ${infoCard("Tipo de Dolor", escapeHtml(f.tipoDolor))}
      ${infoCard("Factores Agravantes", escapeHtml(f.factoresAgravantes))}
      ${infoCard("Factores Atenuantes", escapeHtml(f.factoresAtenuantes))}

      ${seccion("Examen Físico")}
      ${infoCard("Postura", escapeHtml(f.posturaObservaciones))}
      ${infoCard("Palpación", escapeHtml(f.palpacionHallazgos))}
      ${infoCard("ROM", escapeHtml(f.romMedido))}
      ${infoCard("Fuerza (Daniels)", escapeHtml(f.fuerzaDaniels))}
      ${infoCard("Pruebas Especiales", escapeHtml(f.pruebasEspeciales))}

      ${seccion(`Prescripción Terapéutica (${f.sesionesSugeridas} sesiones sugeridas)`)}
      ${infoCard("Agentes Físicos", escapeHtml(f.agentesFisicos))}
      ${infoCard("Terapia Manual", escapeHtml(f.terapiaManual))}
      ${infoCard("Ejercicio Terapéutico", escapeHtml(f.ejercicioTerapeutico))}

      ${seccion("Nota SOAP")}
      ${infoCard("Subjetivo", escapeHtml(f.soapSubjetivo))}
      ${infoCard("Objetivo", escapeHtml(f.soapObjetivo))}
      ${infoCard("Análisis", escapeHtml(f.soapAnalisis))}
      ${infoCard("Plan", escapeHtml(f.soapPlan))}
    `;
    sectionText += `Valoración de Dolor\nZona: ${f.zonaDolor} | EVA: ${f.evaDolor}/10 | Tipo: ${f.tipoDolor}\n\nNota SOAP\nS: ${f.soapSubjetivo}\nO: ${f.soapObjetivo}\nA: ${f.soapAnalisis}\nP: ${f.soapPlan}\n`;
  }

  const bodyHtml = `
    ${parrafo(`Estimado(a) ${escapeHtml(patient.nombreCompleto)},`)}
    ${parrafo(`Adjuntamos el reporte de su ${consultation.tipo === "Nutrición" ? "consulta nutricional" : "sesión de fisioterapia"} del ${escapeHtml(consultation.fecha)}.`)}
    ${infoCard("Motivo de la Consulta", escapeHtml(consultation.motivo))}
    ${sectionHtml}
    ${consultation.anotacionesGenerales ? infoCard("Recomendaciones del Profesional", escapeHtml(consultation.anotacionesGenerales)) : ""}
    ${firma(company.nombreComercial)}
  `;

  const text = `${title}\n\nEstimado(a) ${patient.nombreCompleto},\nFecha: ${consultation.fecha}\nMotivo: ${consultation.motivo}\n\n${sectionText}${consultation.anotacionesGenerales ? `Recomendaciones: ${consultation.anotacionesGenerales}\n` : ""}\n${company.nombreComercial}\n\nEste es un correo automático.`;

  return { subject, html: emailShell(company, title, bodyHtml, `Reporte de su consulta del ${consultation.fecha}`), text };
}

// ---------------------------------------------------------------------------
// Factura
// ---------------------------------------------------------------------------

const MEDIO_PAGO_LABEL: Record<string, string> = {
  "01": "Efectivo",
  "02": "Tarjeta",
  "06": "SINPE Móvil"
};

export function renderFacturaEmail(params: {
  company: Company;
  patient: Patient;
  factura: Factura;
}): RenderedEmail {
  const { company, patient, factura } = params;
  const esNotaCredito = factura.tipoDocumento === "03";
  const esNotaDebito = factura.tipoDocumento === "02";
  const title = esNotaCredito ? "Nota de Crédito Electrónica" : esNotaDebito ? "Nota de Débito Electrónica" : "Factura Electrónica";
  const subject = `${title} ${factura.consecutivo} - ${company.nombreComercial}`;
  const colones = (n: number) => `₡${n.toLocaleString("es-CR", { maximumFractionDigits: 2 })}`;
  const celda = "padding:8px;border-bottom:1px solid #e2e8f0;font-size:14px;";

  const filasHtml = factura.lineas
    .map(
      (l) => `
    <tr>
      <td style="${celda}">${escapeHtml(l.detalle)}</td>
      <td style="${celda}text-align:center;">${escapeHtml(l.cantidad)}</td>
      <td style="${celda}text-align:right;">${escapeHtml(colones(l.precioUnitario))}</td>
      <td style="${celda}text-align:right;">${escapeHtml(colones(l.montoTotalLinea))}</td>
    </tr>`
    )
    .join("");

  const th = `padding:8px;font-size:12px;font-weight:bold;color:${COLOR_TENUE};text-transform:uppercase;`;
  const tablaHtml = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;border:1px solid #e2e8f0;font-family:${FUENTE};">
      <thead>
        <tr bgcolor="#f8fafc" style="background-color:#f8fafc;">
          <td style="${th}">Detalle</td>
          <td style="${th}text-align:center;">Cant.</td>
          <td style="${th}text-align:right;">Precio Unit.</td>
          <td style="${th}text-align:right;">Total</td>
        </tr>
      </thead>
      <tbody>${filasHtml}</tbody>
    </table>`;

  const fechaEmision = new Date(factura.fechaEmision).toLocaleString("es-CR");
  const resumenHtml = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f8fafc" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin:0 0 20px 0;">
      <tr>
        <td style="padding:16px;font-family:${FUENTE};">
          <div style="color:${COLOR_TENUE};font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;">Total</div>
          <div style="color:${COLOR_TEXTO};font-size:28px;line-height:1.3;font-weight:bold;">${escapeHtml(colones(factura.total))}</div>
          <div style="color:${COLOR_TENUE};font-size:14px;line-height:1.5;margin-top:8px;">Consecutivo: ${escapeHtml(factura.consecutivo)}</div>
          <div style="color:${COLOR_TENUE};font-size:12px;line-height:1.5;word-break:break-all;">Clave: ${escapeHtml(factura.clave)}</div>
        </td>
      </tr>
    </table>`;

  const detailsHtml =
    infoCard("Clave Numérica", escapeHtml(factura.clave)) +
    infoCard("Consecutivo", escapeHtml(factura.consecutivo)) +
    infoCard("Fecha de Emisión", escapeHtml(fechaEmision)) +
    infoCard("Estado", escapeHtml(factura.estado)) +
    (!esNotaCredito ? infoCard("Medio de Pago", escapeHtml(MEDIO_PAGO_LABEL[factura.medioPago] || factura.medioPago)) : "") +
    ((esNotaCredito || esNotaDebito) && factura.motivoAnulacion ? infoCard("Motivo", escapeHtml(factura.motivoAnulacion)) : "");

  const bodyHtml = `
    ${parrafo(`Estimado(a) ${escapeHtml(patient.nombreCompleto)},`)}
    ${parrafo("Le compartimos el detalle de su comprobante electrónico:")}
    ${resumenHtml}
    ${detailsHtml}
    ${tablaHtml}
    <p style="margin:16px 0 0 0;text-align:right;font-size:14px;line-height:1.8;">
      Subtotal: ${escapeHtml(colones(factura.subtotal))}<br/>
      IVA: ${escapeHtml(colones(factura.totalIva))}<br/>
      <span style="font-weight:bold;font-size:18px;">Total: ${escapeHtml(colones(factura.total))}</span>
    </p>
    ${parrafo("Gracias por su confianza.", "margin-top:16px;")}
    ${firma(company.nombreComercial)}
  `;

  const text = `${title} ${factura.consecutivo}\n\nEstimado(a) ${patient.nombreCompleto},\nConsecutivo: ${factura.consecutivo}\nClave: ${factura.clave}\nFecha de Emisión: ${fechaEmision}\nEstado: ${factura.estado}\nSubtotal: ${colones(factura.subtotal)}\nIVA: ${colones(factura.totalIva)}\nTotal: ${colones(factura.total)}\n\n${company.nombreComercial}\n\nEste es un correo automático.`;

  return { subject, html: emailShell(company, title, bodyHtml, `Total ${colones(factura.total)} · ${factura.consecutivo}`), text };
}

// ---------------------------------------------------------------------------
// Documentos pendientes (Perfil Legal)
// ---------------------------------------------------------------------------

/** Perfil Legal: lista al cliente los documentos que aún debe entregar para su caso. */
export function renderRecordatorioDocumentosEmail(params: {
  company: Company;
  patient: Patient;
  caso: CasoLegal;
  pendientes: DocumentoCaso[];
}): RenderedEmail {
  const { company, patient, caso, pendientes } = params;
  const title = "Documentos pendientes";
  const subject = `${title}: ${caso.titulo} - ${company.nombreComercial}`;
  const limite = (d: DocumentoCaso) => (d.fechaLimite ? ` — entregar antes del ${d.fechaLimite}` : "");

  const listaHtml = pendientes
    .map(d => `<li style="margin-bottom:6px;"><strong>${escapeHtml(d.nombre)}</strong>${escapeHtml(limite(d))}</li>`)
    .join("");

  const bodyHtml = `
    ${parrafo(`Estimado(a) ${escapeHtml(patient.nombreCompleto)},`)}
    ${parrafo("Para continuar con su caso necesitamos que nos haga llegar los siguientes documentos:")}
    ${infoCard("Caso", escapeHtml(caso.titulo))}
    ${caso.numeroExpediente ? infoCard("Expediente", escapeHtml(caso.numeroExpediente)) : ""}
    <ul style="margin:12px 0 16px 0;padding-left:20px;font-size:16px;line-height:1.5;">${listaHtml}</ul>
    ${parrafo("Si ya los entregó, puede ignorar este mensaje. Ante cualquier duda, responda a este correo.")}
    ${firma(company.nombreComercial)}
  `;

  const text = `${title}\n\nEstimado(a) ${patient.nombreCompleto},\nPara continuar con su caso "${caso.titulo}"${caso.numeroExpediente ? ` (expediente ${caso.numeroExpediente})` : ""} necesitamos los siguientes documentos:\n${pendientes.map(d => `- ${d.nombre}${limite(d)}`).join("\n")}\n\nSi ya los entregó, puede ignorar este mensaje.\n\n${company.nombreComercial}\n\nEste es un correo automático.`;

  return { subject, html: emailShell(company, title, bodyHtml, `Caso: ${caso.titulo}`), text };
}

// ---------------------------------------------------------------------------
// Plataforma: estado de cuenta, nueva empresa, SMTP, contraseña
// ---------------------------------------------------------------------------

export function renderAccountStatusEmail(params: {
  platformCompany: Company;
  tenantCompany: Company;
  nuevoEstado: "ACTIVA" | "SUSPENDIDA";
  estadoAnterior: "PENDIENTE" | "ACTIVA" | "SUSPENDIDA";
}): RenderedEmail {
  const { platformCompany, tenantCompany, nuevoEstado, estadoAnterior } = params;

  let title: string;
  let mensaje: string;

  if (nuevoEstado === "ACTIVA" && estadoAnterior === "PENDIENTE") {
    title = "¡Tu empresa fue aprobada!";
    mensaje = "Tu empresa ya fue revisada y aprobada. Ya puedes iniciar sesión en TuanisBooking con las credenciales que registraste.";
  } else if (nuevoEstado === "ACTIVA") {
    title = "Tu cuenta fue reactivada";
    mensaje = "Tu cuenta fue reactivada. Ya puedes iniciar sesión normalmente.";
  } else {
    title = "Tu cuenta ha sido suspendida";
    mensaje = "Tu cuenta ha sido suspendida temporalmente. Contacta al administrador de la plataforma para más información.";
  }

  const subject = `${title} - ${tenantCompany.nombreComercial}`;
  const bodyHtml = `
    ${parrafo(`Estimado(a) equipo de ${escapeHtml(tenantCompany.nombreComercial)},`)}
    ${parrafo(escapeHtml(mensaje))}
    ${firma("TuanisBooking")}
  `;
  const text = `${title}\n\n${mensaje}\n\nTuanisBooking\n\nEste es un correo automático.`;

  return { subject, html: emailShell(platformCompany, title, bodyHtml, mensaje), text };
}

export function renderNuevaEmpresaEmail(params: {
  platformCompany: Company;
  nuevaEmpresa: Company;
}): RenderedEmail {
  const { platformCompany, nuevaEmpresa } = params;
  const title = "Nueva Empresa Registrada — Pendiente de Aprobación";
  const subject = `${title}: ${nuevaEmpresa.nombreComercial}`;

  const detailsHtml =
    infoCard("Nombre Comercial", escapeHtml(nuevaEmpresa.nombreComercial)) +
    infoCard("Razón Social", escapeHtml(nuevaEmpresa.razonSocial)) +
    infoCard("Identificación", escapeHtml(nuevaEmpresa.identificacion)) +
    infoCard("Correo de Contacto", escapeHtml(nuevaEmpresa.correoEmisor)) +
    infoCard("Perfil", escapeHtml(nuevaEmpresa.perfilCompania)) +
    infoCard("Estado", escapeHtml(nuevaEmpresa.estadoSaas));

  const bodyHtml = `
    ${parrafo("Se ha registrado una nueva empresa en la plataforma y está pendiente de aprobación:")}
    ${detailsHtml}
    ${parrafo("Ingresa al panel de administración SaaS para revisarla y activarla.", "margin-top:16px;")}
    ${firma(platformCompany.nombreComercial)}
  `;

  const text = `${title}\n\nNombre Comercial: ${nuevaEmpresa.nombreComercial}\nRazón Social: ${nuevaEmpresa.razonSocial}\nIdentificación: ${nuevaEmpresa.identificacion}\nCorreo de Contacto: ${nuevaEmpresa.correoEmisor}\nPerfil: ${nuevaEmpresa.perfilCompania}\nEstado: ${nuevaEmpresa.estadoSaas}\n\n${platformCompany.nombreComercial}\n\nEste es un correo automático.`;

  return { subject, html: emailShell(platformCompany, title, bodyHtml, `${nuevaEmpresa.nombreComercial} espera su aprobación`), text };
}

// Correo de prueba de la configuración SMTP: no lleva datos clínicos ni de pacientes.
export function renderSmtpTestEmail(params: {
  company: Company;
}): RenderedEmail {
  const { company } = params;
  const title = "Prueba de Correo SMTP";
  const subject = `${title} - ${company.nombreComercial}`;

  const bodyHtml = `
    ${parrafo("Este es un correo de prueba enviado desde la configuración SMTP de su empresa.")}
    ${parrafo("Si usted lo está leyendo, el servidor de correo saliente funciona correctamente. No es necesario responder.")}
    ${firma(company.nombreComercial)}
  `;

  const text = `${title}\n\nEste es un correo de prueba enviado desde la configuración SMTP de su empresa.\nSi usted lo está leyendo, el servidor de correo saliente funciona correctamente. No es necesario responder.\n\n${company.nombreComercial}\n\nEste es un correo automático.`;

  return { subject, html: emailShell(company, title, bodyHtml, "El servidor de correo saliente funciona correctamente"), text };
}

export function renderPasswordResetEmail(params: {
  company: Company;
  user: User;
  nuevaContrasena: string;
}): RenderedEmail {
  const { company, user, nuevaContrasena } = params;
  const title = "Restablecimiento de Contraseña";
  const subject = `${title} - ${company.nombreComercial}`;

  const claveHtml = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;">
      <tr>
        <td align="center" bgcolor="#f1f5f9" style="background-color:#f1f5f9;border:1px dashed #94a3b8;border-radius:8px;padding:20px 12px;">
          <div style="color:${COLOR_TENUE};font-family:${FUENTE};font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Contraseña temporal</div>
          <div style="color:${COLOR_TEXTO};font-family:Consolas,'Courier New',monospace;font-size:28px;line-height:1.3;font-weight:bold;letter-spacing:2px;word-break:break-all;">${escapeHtml(nuevaContrasena)}</div>
        </td>
      </tr>
    </table>`;

  const bodyHtml = `
    ${parrafo(`Estimado(a) ${escapeHtml(user.nombre)},`)}
    ${parrafo("Recibimos una solicitud para restablecer la contraseña de su cuenta.")}
    ${infoCard("Usuario", escapeHtml(user.usuario))}
    ${claveHtml}
    ${parrafo("Use esta contraseña para iniciar sesión y le recomendamos cambiarla de inmediato por una propia.")}
    ${parrafo("Si usted no solicitó este cambio, contacte a su administrador de inmediato.")}
    ${firma(company.nombreComercial)}
  `;

  const text = `${title}\n\nEstimado(a) ${user.nombre},\nUsuario: ${user.usuario}\nContraseña Temporal: ${nuevaContrasena}\n\nUse esta contraseña para iniciar sesión y le recomendamos cambiarla de inmediato.\nSi usted no solicitó este cambio, contacte a su administrador de inmediato.\n\n${company.nombreComercial}\n\nEste es un correo automático.`;

  return { subject, html: emailShell(company, title, bodyHtml, "Su contraseña temporal está lista; cámbiela al iniciar sesión"), text };
}

// ---------------------------------------------------------------------------
// Vistas previas con datos ficticios (revisión visual; no se usa en el envío)
// ---------------------------------------------------------------------------

export function renderEmailPreviews(): Array<{ nombre: string; subject: string; html: string }> {
  const clinica = {
    id: 1,
    nombreComercial: "Clínica Demo",
    razonSocial: "Clínica Demo S.A.",
    identificacion: "3-101-123456",
    correoEmisor: "contacto@clinicademo.example",
    colorPrimario: "#0f766e",
    colorSidebar: "#115e59",
    logoUrl: "",
    perfilCompania: "Ambas",
    estadoSaas: "ACTIVA",
    otrasSenas: "Escazú centro, edificio Torre Médica, tercer piso",
    whatsappReservas: "50688887777"
  } as unknown as Company;
  const plataforma = { ...clinica, nombreComercial: "TuanisBooking", razonSocial: "TuanisBooking", whatsappReservas: null } as unknown as Company;
  const paciente = {
    id: 1,
    nombreCompleto: "María Quesada Brenes",
    telefono: "8899-2233",
    correoElectronico: "maria@example.com"
  } as unknown as Patient;
  const profesional = { id: 1, nombre: "Dra. Ana Mora", usuario: "ana.mora", correo: "ana@clinicademo.example" } as unknown as User;
  const citaBase = {
    id: 1,
    fechaHora: "2026-12-02T09:00",
    duracionMinutos: 45,
    estadoCita: "CONFIRMADA",
    notas: "Prefiere consulta temprano",
    tipoVisita: "CONSULTORIO",
    direccionDomicilio: null,
    tiempoTrasladoMinutos: null
  } as unknown as Cita;
  const citaDomicilio = {
    ...citaBase,
    estadoCita: "PROGRAMADA",
    tipoVisita: "DOMICILIO",
    direccionDomicilio: "San Rafael de Escazú, 200m oeste de la iglesia",
    tiempoTrasladoMinutos: 25
  } as unknown as Cita;
  const datosCita = { servicio: "Consulta nutricional", profesional: profesional.nombre };

  const factura = {
    tipoDocumento: "01",
    consecutivo: "00100001010000000123",
    clave: "50602122600310112345600100001010000000123100000001",
    fechaEmision: "2026-11-25T10:30:00.000Z",
    estado: "ACEPTADA",
    medioPago: "06",
    motivoAnulacion: "",
    subtotal: 25000,
    totalIva: 3250,
    total: 28250,
    lineas: [{ detalle: "Consulta nutricional", cantidad: 1, precioUnitario: 25000, montoTotalLinea: 25000 }]
  } as unknown as Factura;
  const consulta = {
    tipo: "Nutrición",
    fecha: "2026-11-25",
    motivo: "Control de peso",
    anotacionesGenerales: "Aumentar el consumo de agua.",
    antropometria: { peso: 70, imc: 24.2, grasaCorporal: 22, masaMuscular: 30 },
    dieta: {
      totalCalorias: 1800,
      desayuno: "Avena con fruta",
      almuerzo: "Pollo con ensalada",
      cena: "Sopa de verduras",
      indicaciones: "Evitar fritos."
    }
  } as unknown as Consultation;
  const caso = { titulo: "Divorcio", numeroExpediente: "24-000123-0180-FA" } as unknown as CasoLegal;
  const pendientes = [
    { nombre: "Cédula", fechaLimite: "2026-12-10" },
    { nombre: "Certificación de matrimonio", fechaLimite: null }
  ] as unknown as DocumentoCaso[];

  const previews: Array<{ nombre: string; email: RenderedEmail }> = [
    { nombre: "Cita confirmada (paciente)", email: renderCitaEmail({ company: clinica, patient: paciente, cita: citaBase, tipoNotif: "CONFIRMACION", ...datosCita }) },
    { nombre: "Cita pendiente a domicilio (paciente)", email: renderCitaEmail({ company: clinica, patient: paciente, cita: citaDomicilio, tipoNotif: "CONFIRMACION", ...datosCita }) },
    { nombre: "Cita reprogramada (paciente)", email: renderCitaEmail({ company: clinica, patient: paciente, cita: citaBase, tipoNotif: "MODIFICACION", fechaAnterior: "2026-12-01T15:30", ...datosCita }) },
    { nombre: "Cita cancelada (paciente)", email: renderCitaEmail({ company: clinica, patient: paciente, cita: citaBase, tipoNotif: "CANCELACION", ...datosCita }) },
    { nombre: "Nueva cita (profesional)", email: renderCitaEmailProfesional({ company: clinica, professional: profesional, patient: paciente, cita: citaDomicilio, servicio: datosCita.servicio, agendaUrl: "https://app.example.com/agenda" }) },
    { nombre: "Consulta", email: renderConsultaEmail({ company: clinica, patient: paciente, consultation: consulta }) },
    { nombre: "Factura", email: renderFacturaEmail({ company: clinica, patient: paciente, factura }) },
    { nombre: "Documentos pendientes", email: renderRecordatorioDocumentosEmail({ company: clinica, patient: paciente, caso, pendientes }) },
    { nombre: "Cuenta aprobada", email: renderAccountStatusEmail({ platformCompany: plataforma, tenantCompany: clinica, nuevoEstado: "ACTIVA", estadoAnterior: "PENDIENTE" }) },
    { nombre: "Nueva empresa", email: renderNuevaEmpresaEmail({ platformCompany: plataforma, nuevaEmpresa: clinica }) },
    { nombre: "Prueba SMTP", email: renderSmtpTestEmail({ company: clinica }) },
    { nombre: "Contraseña temporal", email: renderPasswordResetEmail({ company: clinica, user: profesional, nuevaContrasena: "Tmp-4x9K2mQ7" }) }
  ];

  return previews.map(({ nombre, email }) => ({ nombre, subject: email.subject, html: email.html }));
}
