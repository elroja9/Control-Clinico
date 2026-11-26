import type { Company, Patient, Consultation, Factura } from "../src/data/mockData";
import { textoSobre, tinte, colorMarca } from "./branding";

/**
 * HTML pensado para imprimirse en papel, no para leerse en un cliente de correo.
 *
 * Es una plantilla aparte de emailTemplates.ts a propósito: el correo es un resumen corto que se
 * lee en el teléfono, mientras que estos documentos son el comprobante y el plan que el paciente
 * guarda o imprime. Comparten la identidad visual de la empresa pero no el mismo contenido.
 */

function escapeHtml(value: string | number | null | undefined): string {
  const str = String(value ?? "");
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const colones = (n: number) => `₡${Number(n || 0).toLocaleString("es-CR", { maximumFractionDigits: 2 })}`;

function documentoShell(company: Company, titulo: string, cuerpoHtml: string): string {
  // Los dos colores que la clínica configura en Configuración de Empresa: el de barra lateral
  // encabeza el documento y el primario marca títulos y totales, igual que en la aplicación y en
  // los correos. El color del texto sale de la luminancia del fondo, porque hay clínicas con
  // marcas oscuras y otras claras y un blanco fijo dejaría a estas últimas ilegibles.
  const primario = colorMarca(company.colorPrimario, "#0f766e");
  const barra = colorMarca(company.colorSidebar, primario);
  const textoBarra = textoSobre(barra);
  const textoBarraTenue = textoBarra === "#ffffff" ? "rgba(255,255,255,0.82)" : "rgba(30,41,59,0.72)";

  const logo = company.logoUrl
    ? `<img src="${escapeHtml(company.logoUrl)}" alt="" style="height:46px;width:46px;border-radius:9px;object-fit:cover;display:block;background:#fff;">`
    : "";

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<style>
  @page { size: letter; margin: 12mm 12mm 16mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #1e293b; font-size: 12px; margin: 0; }
  h1 { font-size: 19px; margin: 14px 0 2px 0; color: ${primario}; }
  h2 { font-size: 13px; margin: 18px 0 7px 0; color: ${primario};
       border-bottom: 1.5px solid ${primario}; padding-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; }
  .banda { background: ${barra}; color: ${textoBarra}; padding: 13px 16px; border-radius: 9px;
           display: flex; align-items: center; gap: 12px; }
  .banda .nom { font-size: 16px; font-weight: 700; line-height: 1.2; }
  .banda .raz { font-size: 10.5px; color: ${textoBarraTenue}; }
  .banda .der { margin-left: auto; text-align: right; font-size: 10px; color: ${textoBarraTenue}; line-height: 1.5; }
  .datos td { padding: 3px 0; vertical-align: top; }
  .datos .et { color: #64748b; width: 145px; }
  .lineas th { background: ${tinte(primario, 0.14)}; padding: 6px 8px; text-align: left;
               font-size: 11px; border-bottom: 1.5px solid ${tinte(primario, 0.45)}; }
  .lineas td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; }
  .der { text-align: right; }
  .cen { text-align: center; }
  .tot { font-size: 14px; font-weight: 700; color: ${primario}; }
  .bloque { background: ${tinte(primario, 0.07)}; border-left: 3px solid ${primario};
            padding: 9px 12px; margin: 7px 0; border-radius: 0 4px 4px 0; }
  .bloque .t { font-weight: 600; color: ${primario}; margin-bottom: 3px; font-size: 11.5px; }
  .nota { font-size: 10px; color: #64748b; margin-top: 22px;
          border-top: 1px solid #e2e8f0; padding-top: 8px; }
  .aviso { background: #fef3c7; border: 1px solid #fcd34d; color: #92400e;
           padding: 7px 10px; border-radius: 4px; margin: 10px 0; font-size: 11px; }
  ul { margin: 4px 0 4px 18px; padding: 0; }
  li { margin-bottom: 3px; }
</style></head>
<body>
  <div class="banda">
    ${logo}
    <div>
      <div class="nom">${escapeHtml(company.nombreComercial)}</div>
      <div class="raz">${escapeHtml(company.razonSocial || "")}</div>
    </div>
    <div class="der">
      C&eacute;dula: ${escapeHtml(company.identificacion)}<br>
      ${escapeHtml(company.correoEmisor || "")}
    </div>
  </div>
  <h1>${escapeHtml(titulo)}</h1>
  ${cuerpoHtml}
</body></html>`;
}

/** Comprobante de la factura, para adjuntar al correo del paciente. */
// `patient` es el RECEPTOR del comprobante (el paciente o el tercero a quien se facturó); si es un
// tercero, `factura.pacienteNombre` trae el paciente atendido y se imprime como "Paciente".
export function renderFacturaPdf(params: { company: Company; patient: Patient; factura: Factura & { mediosPagoTexto?: string | null; pacienteNombre?: string | null } }): string {
  const { company, patient, factura } = params;
  const esNotaCredito = factura.tipoDocumento === "03";
  const esNotaDebito = factura.tipoDocumento === "02";
  const titulo = esNotaCredito ? "Nota de Crédito Electrónica" : esNotaDebito ? "Nota de Débito Electrónica" : factura.tipoDocumento === "04" ? "Tiquete Electrónico" : "Factura Electrónica";
  const hayDescuentos = (factura.lineas || []).some(l => Number(l.montoDescuento) > 0);

  const filas = (factura.lineas || []).map(l => `
    <tr>
      <td>${escapeHtml(l.detalle)}</td>
      <td class="cen">${l.cantidad}</td>
      <td class="der">${colones(l.precioUnitario)}</td>
      ${hayDescuentos ? `<td class="der">${Number(l.montoDescuento) > 0 ? colones(Number(l.montoDescuento)) : "—"}</td>` : ""}
      <td class="cen">${l.porcentajeIva}%</td>
      <td class="der">${colones(l.montoTotalLinea)}</td>
    </tr>`).join("");

  // Una factura simulada no es un comprobante fiscal: hay que decirlo en el documento mismo, no
  // solo en el correo, porque el PDF es lo que el paciente archiva.
  const avisoSimulada = factura.estado === "SIMULADA"
    ? `<div class="aviso"><strong>Documento de prueba.</strong> Esta factura no fue enviada a Hacienda y no tiene validez fiscal.</div>`
    : "";

  const cuerpo = `
    ${avisoSimulada}
    <table class="datos">
      <tr><td class="et">Consecutivo</td><td><strong>${escapeHtml(factura.consecutivo)}</strong></td></tr>
      <tr><td class="et">Clave num&eacute;rica</td><td style="font-family:Consolas,monospace;font-size:10px;">${escapeHtml(factura.clave)}</td></tr>
      <tr><td class="et">Fecha de emisi&oacute;n</td><td>${escapeHtml(String(factura.fechaEmision || "").replace("T", " ").slice(0, 16))}</td></tr>
      <tr><td class="et">Estado</td><td>${escapeHtml(factura.estado)}</td></tr>
    </table>

    <h2>Cliente</h2>
    <table class="datos">
      <tr><td class="et">Nombre</td><td>${escapeHtml(patient.nombreCompleto)}</td></tr>
      <tr><td class="et">Identificaci&oacute;n</td><td>${escapeHtml(patient.identificacion)}</td></tr>
      <tr><td class="et">Correo</td><td>${escapeHtml(patient.correoElectronico || "")}</td></tr>
      ${factura.pacienteNombre ? `<tr><td class="et">Paciente</td><td>${escapeHtml(factura.pacienteNombre)}</td></tr>` : ""}
      ${factura.mediosPagoTexto && factura.condicionVenta !== "02" ? `<tr><td class="et">Medio de pago</td><td>${escapeHtml(factura.mediosPagoTexto)}</td></tr>` : ""}
    </table>

    <h2>Detalle</h2>
    <table class="lineas">
      <thead><tr>
        <th>Descripci&oacute;n</th><th class="cen">Cant.</th>
        <th class="der">Precio unit.</th>${hayDescuentos ? `<th class="der">Desc.</th>` : ""}<th class="cen">IVA</th><th class="der">Total</th>
      </tr></thead>
      <tbody>${filas}</tbody>
    </table>

    <table class="datos" style="margin-top:12px;width:270px;margin-left:auto;">
      ${Number(factura.totalDescuentos) > 0 ? `<tr><td class="et">Descuentos</td><td class="der">${colones(Number(factura.totalDescuentos))}</td></tr>` : ""}
      <tr><td class="et">Subtotal</td><td class="der">${colones(factura.subtotal)}</td></tr>
      <tr><td class="et">IVA</td><td class="der">${colones(factura.totalIva)}</td></tr>
      <tr><td class="et tot">TOTAL</td><td class="der tot">${colones(factura.total)}</td></tr>
    </table>

    <div class="nota">
      Comprobante generado electr&oacute;nicamente por ${escapeHtml(company.nombreComercial)}.
      ${(esNotaCredito || esNotaDebito) && factura.motivoAnulacion ? `<br>Motivo: ${escapeHtml(factura.motivoAnulacion)}` : ""}
    </div>`;

  return documentoShell(company, titulo, cuerpo);
}

/**
 * Documento para el paciente al cerrar la consulta.
 *
 * Deliberadamente NO incluye los datos técnicos del expediente (pliegues cutáneos, índices de
 * laboratorio, hallazgos de palpación, SOAP): eso es información para el profesional. Aquí va lo
 * que el paciente necesita para seguir el plan en casa.
 */
export function renderConsultaPacientePdf(params: { company: Company; patient: Patient; consultation: Consultation }): string {
  const { company, patient, consultation } = params;
  const esFisio = consultation.tipo === "Fisioterapia";

  const bloque = (titulo: string, texto: string | null | undefined) =>
    texto && String(texto).trim()
      ? `<div class="bloque"><div class="t">${escapeHtml(titulo)}</div>${escapeHtml(texto)}</div>`
      : "";

  let secciones = "";

  if (!esFisio && consultation.dieta) {
    const d = consultation.dieta;
    const m = d.macros;
    const gramos = (pct: number | null | undefined, kcal: 4 | 9) =>
      pct == null ? null : Math.round((pct / 100) * (d.totalCalorias || 0) / kcal);

    secciones += `<h2>Su plan alimentario</h2>`;
    if (d.totalCalorias) {
      secciones += `<p style="margin:2px 0 8px 0;">Objetivo diario: <strong>${d.totalCalorias} kcal</strong></p>`;
    }
    if (m && (m.carbohidratosPct != null || m.proteinasPct != null || m.grasasPct != null)) {
      secciones += `<table class="lineas" style="margin-bottom:10px;">
        <thead><tr><th>Distribuci&oacute;n</th><th class="cen">%</th><th class="cen">Gramos por d&iacute;a</th></tr></thead>
        <tbody>
          <tr><td>Carbohidratos</td><td class="cen">${m.carbohidratosPct ?? "-"}</td><td class="cen">${gramos(m.carbohidratosPct, 4) ?? "-"} g</td></tr>
          <tr><td>Prote&iacute;nas</td><td class="cen">${m.proteinasPct ?? "-"}</td><td class="cen">${gramos(m.proteinasPct, 4) ?? "-"} g</td></tr>
          <tr><td>Grasas</td><td class="cen">${m.grasasPct ?? "-"}</td><td class="cen">${gramos(m.grasasPct, 9) ?? "-"} g</td></tr>
        </tbody></table>`;
    }
    secciones += bloque("Desayuno", d.desayuno);
    secciones += bloque("Merienda de la mañana", d.meriendaManana);
    secciones += bloque("Almuerzo", d.almuerzo);
    secciones += bloque("Merienda de la tarde", d.meriendaTarde);
    secciones += bloque("Cena", d.cena);
    if (d.indicaciones) {
      secciones += `<h2>Indicaciones</h2><div class="bloque">${escapeHtml(d.indicaciones)}</div>`;
    }
  }

  if (esFisio && consultation.fisioterapia) {
    const f = consultation.fisioterapia;
    secciones += `<h2>Su plan de terapia</h2>`;
    if (f.sesionesSugeridas) {
      secciones += `<p style="margin:2px 0 8px 0;">Sesiones recomendadas: <strong>${f.sesionesSugeridas}</strong></p>`;
    }
    secciones += bloque("Ejercicios para hacer en casa", f.ejercicioTerapeutico);
    secciones += bloque("Qué evitar", f.factoresAgravantes);
    secciones += bloque("Qué le ayuda a mejorar", f.factoresAtenuantes);
    secciones += bloque("Plan de tratamiento", f.soapPlan);
  }

  if (consultation.anotacionesGenerales) {
    secciones += `<h2>Recomendaciones</h2><div class="bloque">${escapeHtml(consultation.anotacionesGenerales)}</div>`;
  }

  const cuerpo = `
    <table class="datos">
      <tr><td class="et">Paciente</td><td><strong>${escapeHtml(patient.nombreCompleto)}</strong></td></tr>
      <tr><td class="et">Fecha de la consulta</td><td>${escapeHtml(consultation.fecha)}</td></tr>
      <tr><td class="et">Tipo</td><td>${escapeHtml(consultation.tipo)}</td></tr>
      <tr><td class="et">Motivo</td><td>${escapeHtml(consultation.motivo)}</td></tr>
    </table>
    ${secciones}
    <div class="nota">
      Documento entregado por ${escapeHtml(company.nombreComercial)}.
      Ante cualquier duda sobre su plan, cont&aacute;ctenos a ${escapeHtml(company.correoEmisor || "")}.
    </div>`;

  return documentoShell(company, esFisio ? "Plan de Terapia" : "Plan Nutricional", cuerpo);
}
