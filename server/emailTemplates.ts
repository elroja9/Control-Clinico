import type { Company, Patient, Cita, Consultation, User } from "../src/data/mockData";

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

function escapeHtml(value: string | number | null | undefined): string {
  const str = String(value ?? "");
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function emailShell(company: Company, title: string, bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
            <tr>
              <td style="background-color:${escapeHtml(company.colorSidebar)};padding:20px 24px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td width="56" style="vertical-align:middle;">
                      <img src="${escapeHtml(company.logoUrl)}" width="48" height="48" alt="${escapeHtml(company.nombreComercial)}" style="border-radius:10px;display:block;object-fit:cover;" />
                    </td>
                    <td style="vertical-align:middle;padding-left:12px;">
                      <span style="color:#ffffff;font-size:16px;font-weight:bold;display:block;">${escapeHtml(company.nombreComercial)}</span>
                      <span style="color:#ffffff;opacity:0.85;font-size:11px;">${escapeHtml(company.razonSocial)}</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 24px 0 24px;">
                <h1 style="color:${escapeHtml(company.colorPrimario)};font-size:18px;margin:16px 0 8px 0;">${escapeHtml(title)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 24px 24px;color:#1e293b;font-size:13px;line-height:1.6;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="background-color:#f8fafc;padding:16px 24px;border-top:1px solid #e2e8f0;">
                <span style="color:#94a3b8;font-size:10px;">${escapeHtml(company.nombreComercial)} &middot; ${escapeHtml(company.correoEmisor)}</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function infoCard(label: string, value: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
    <tr>
      <td style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 14px;">
        <span style="display:block;color:#64748b;font-size:10px;text-transform:uppercase;font-weight:bold;">${escapeHtml(label)}</span>
        <span style="display:block;color:#1e293b;font-size:13px;font-weight:600;">${value}</span>
      </td>
    </tr>
  </table>`;
}

const CITA_TITLES: Record<"CONFIRMACION" | "CANCELACION" | "MODIFICACION", string> = {
  CONFIRMACION: "Confirmación de Cita",
  CANCELACION: "Cita Cancelada",
  MODIFICACION: "Cita Modificada / Reprogramada",
};

export function renderCitaEmail(params: {
  company: Company;
  patient: Patient;
  cita: Cita;
  tipoNotif: "CONFIRMACION" | "CANCELACION" | "MODIFICACION";
}): RenderedEmail {
  const { company, patient, cita, tipoNotif } = params;
  const [fecha, hora] = cita.fechaHora.split("T");
  const title = CITA_TITLES[tipoNotif];
  const subject = `${title} - ${company.nombreComercial}`;

  const detailsHtml =
    infoCard("Fecha", escapeHtml(fecha)) +
    infoCard("Hora", escapeHtml(hora || "")) +
    infoCard("Duración", `${cita.duracionMinutos} minutos`) +
    infoCard("Estado", escapeHtml(cita.estadoCita)) +
    (cita.notas ? infoCard("Notas del Profesional", escapeHtml(cita.notas)) : "");

  const intro =
    tipoNotif === "CONFIRMACION"
      ? "Le confirmamos que su cita ha sido programada con éxito:"
      : tipoNotif === "CANCELACION"
      ? "Le informamos que su cita ha sido CANCELADA:"
      : "Le informamos que su cita ha sido modificada. Estos son los nuevos detalles:";

  const bodyHtml = `
    <p>Estimado(a) ${escapeHtml(patient.nombreCompleto)},</p>
    <p>${intro}</p>
    ${detailsHtml}
    <p style="margin-top:16px;">Gracias por su confianza. Ante cualquier consulta, contáctenos con anticipación.</p>
    <p style="margin-top:16px;font-weight:bold;">${escapeHtml(company.nombreComercial)}</p>
  `;

  const text = `${title}\n\nEstimado(a) ${patient.nombreCompleto},\n${intro}\nFecha: ${fecha}\nHora: ${hora || ""}\nDuración: ${cita.duracionMinutos} minutos\nEstado: ${cita.estadoCita}\n${cita.notas ? `Notas: ${cita.notas}\n` : ""}\n${company.nombreComercial}`;

  return { subject, html: emailShell(company, title, bodyHtml), text };
}

export function renderCitaEmailProfesional(params: {
  company: Company;
  professional: User;
  patient: Patient;
  cita: Cita;
}): RenderedEmail {
  const { company, professional, patient, cita } = params;
  const [fecha, hora] = cita.fechaHora.split("T");
  const title = "Nueva Cita Agendada";
  const subject = `${title} - ${company.nombreComercial}`;

  const detailsHtml =
    infoCard("Paciente", escapeHtml(patient.nombreCompleto)) +
    infoCard("Teléfono", escapeHtml(patient.telefono)) +
    infoCard("Correo", escapeHtml(patient.correoElectronico)) +
    infoCard("Fecha", escapeHtml(fecha)) +
    infoCard("Hora", escapeHtml(hora || "")) +
    infoCard("Duración", `${cita.duracionMinutos} minutos`) +
    infoCard("Tipo de Visita", cita.tipoVisita === "DOMICILIO" ? "A Domicilio" : "En Consultorio") +
    (cita.tipoVisita === "DOMICILIO" && cita.direccionDomicilio ? infoCard("Dirección", escapeHtml(cita.direccionDomicilio)) : "") +
    (cita.tipoVisita === "DOMICILIO" && cita.tiempoTrasladoMinutos != null ? infoCard("Tiempo de Traslado Estimado", `${cita.tiempoTrasladoMinutos} minutos`) : "");

  const bodyHtml = `
    <p>Estimado(a) ${escapeHtml(professional.nombre)},</p>
    <p>Un cliente ha agendado una nueva cita a través de la página de reservas en línea:</p>
    ${detailsHtml}
    <p style="margin-top:16px;font-weight:bold;">${escapeHtml(company.nombreComercial)}</p>
  `;

  const text = `${title}\n\nPaciente: ${patient.nombreCompleto}\nTeléfono: ${patient.telefono}\nCorreo: ${patient.correoElectronico}\nFecha: ${fecha}\nHora: ${hora || ""}\nDuración: ${cita.duracionMinutos} minutos\nTipo de Visita: ${cita.tipoVisita}\n${cita.tipoVisita === "DOMICILIO" && cita.direccionDomicilio ? `Dirección: ${cita.direccionDomicilio}\n` : ""}${cita.tipoVisita === "DOMICILIO" && cita.tiempoTrasladoMinutos != null ? `Tiempo de Traslado: ${cita.tiempoTrasladoMinutos} min\n` : ""}\n${company.nombreComercial}`;

  return { subject, html: emailShell(company, title, bodyHtml), text };
}

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
      <h2 style="color:${escapeHtml(company.colorPrimario)};font-size:13px;text-transform:uppercase;margin-top:20px;">Composición Corporal</h2>
      ${infoCard("Peso Corporal", `${a.peso} kg`)}
      ${infoCard("IMC", `${a.imc}`)}
      ${infoCard("Grasa Corporal", `${a.grasaCorporal}%`)}
      ${infoCard("Masa Muscular", `${a.masaMuscular} kg`)}
    `;
    sectionText += `Composición Corporal\nPeso: ${a.peso} kg | IMC: ${a.imc} | Grasa Corporal: ${a.grasaCorporal}% | Masa Muscular: ${a.masaMuscular} kg\n\n`;

    if (consultation.dieta) {
      const d = consultation.dieta;

      if (d.prescripcionCalorica) {
        const pc = d.prescripcionCalorica;
        const formulaLabel = FORMULA_LABEL[pc.formula] || pc.formula;
        const direccionLabel = DIRECCION_LABEL[pc.direccion] || pc.direccion;
        sectionHtml += `
          <h2 style="color:${escapeHtml(company.colorPrimario)};font-size:13px;text-transform:uppercase;margin-top:20px;">Prescripción Calórica</h2>
          ${infoCard("Fórmula", escapeHtml(formulaLabel))}
          ${infoCard("TMB", `${pc.tmb} kcal`)}
          ${infoCard("Objetivo", `${escapeHtml(direccionLabel)} ${pc.porcentaje}%`)}
          ${infoCard("Presupuesto Calórico", `${d.totalCalorias} kcal`)}
          ${d.macros ? infoCard("Macronutrientes", `Carbohidratos ${d.macros.carbohidratosG}g &middot; Proteínas ${d.macros.proteinasG}g &middot; Grasas ${d.macros.grasasG}g`) : ""}
        `;
        sectionText += `Prescripción Calórica\nFórmula: ${formulaLabel} | TMB: ${pc.tmb} kcal | Objetivo: ${direccionLabel} ${pc.porcentaje}% | Presupuesto: ${d.totalCalorias} kcal\n${d.macros ? `Macronutrientes: Carbohidratos ${d.macros.carbohidratosG}g, Proteínas ${d.macros.proteinasG}g, Grasas ${d.macros.grasasG}g\n` : ""}\n`;
      }

      sectionHtml += `
        <h2 style="color:${escapeHtml(company.colorPrimario)};font-size:13px;text-transform:uppercase;margin-top:20px;">Plan Alimentario Recomendado (${d.totalCalorias} kcal)</h2>
        ${infoCard("Desayuno", escapeHtml(d.desayuno))}
        ${d.meriendaManana ? infoCard("Colación AM", escapeHtml(d.meriendaManana)) : ""}
        ${infoCard("Almuerzo", escapeHtml(d.almuerzo))}
        ${d.meriendaTarde ? infoCard("Colación PM", escapeHtml(d.meriendaTarde)) : ""}
        ${infoCard("Cena", escapeHtml(d.cena))}
        ${d.indicaciones ? infoCard("Indicaciones", escapeHtml(d.indicaciones)) : ""}
      `;
      sectionText += `Plan Alimentario (${d.totalCalorias} kcal)\nDesayuno: ${d.desayuno}\nAlmuerzo: ${d.almuerzo}\nCena: ${d.cena}\n${d.indicaciones ? `Indicaciones: ${d.indicaciones}\n` : ""}\n`;
    }
  }

  if (consultation.tipo === "Fisioterapia" && consultation.fisioterapia) {
    const f = consultation.fisioterapia;
    sectionHtml += `
      <h2 style="color:${escapeHtml(company.colorPrimario)};font-size:13px;text-transform:uppercase;margin-top:20px;">Valoración de Dolor</h2>
      ${infoCard("Zona de Dolor", escapeHtml(f.zonaDolor))}
      ${infoCard("Escala EVA", `${f.evaDolor} de 10`)}
      ${infoCard("Tipo de Dolor", escapeHtml(f.tipoDolor))}
      ${infoCard("Factores Agravantes", escapeHtml(f.factoresAgravantes))}
      ${infoCard("Factores Atenuantes", escapeHtml(f.factoresAtenuantes))}

      <h2 style="color:${escapeHtml(company.colorPrimario)};font-size:13px;text-transform:uppercase;margin-top:20px;">Examen Físico</h2>
      ${infoCard("Postura", escapeHtml(f.posturaObservaciones))}
      ${infoCard("Palpación", escapeHtml(f.palpacionHallazgos))}
      ${infoCard("ROM", escapeHtml(f.romMedido))}
      ${infoCard("Fuerza (Daniels)", escapeHtml(f.fuerzaDaniels))}
      ${infoCard("Pruebas Especiales", escapeHtml(f.pruebasEspeciales))}

      <h2 style="color:${escapeHtml(company.colorPrimario)};font-size:13px;text-transform:uppercase;margin-top:20px;">Prescripción Terapéutica (${f.sesionesSugeridas} sesiones sugeridas)</h2>
      ${infoCard("Agentes Físicos", escapeHtml(f.agentesFisicos))}
      ${infoCard("Terapia Manual", escapeHtml(f.terapiaManual))}
      ${infoCard("Ejercicio Terapéutico", escapeHtml(f.ejercicioTerapeutico))}

      <h2 style="color:${escapeHtml(company.colorPrimario)};font-size:13px;text-transform:uppercase;margin-top:20px;">Nota SOAP</h2>
      ${infoCard("Subjetivo", escapeHtml(f.soapSubjetivo))}
      ${infoCard("Objetivo", escapeHtml(f.soapObjetivo))}
      ${infoCard("Análisis", escapeHtml(f.soapAnalisis))}
      ${infoCard("Plan", escapeHtml(f.soapPlan))}
    `;
    sectionText += `Valoración de Dolor\nZona: ${f.zonaDolor} | EVA: ${f.evaDolor}/10 | Tipo: ${f.tipoDolor}\n\nNota SOAP\nS: ${f.soapSubjetivo}\nO: ${f.soapObjetivo}\nA: ${f.soapAnalisis}\nP: ${f.soapPlan}\n`;
  }

  const bodyHtml = `
    <p>Estimado(a) ${escapeHtml(patient.nombreCompleto)},</p>
    <p>Adjuntamos el reporte de su ${consultation.tipo === "Nutrición" ? "consulta nutricional" : "sesión de fisioterapia"} del ${escapeHtml(consultation.fecha)}.</p>
    ${infoCard("Motivo de la Consulta", escapeHtml(consultation.motivo))}
    ${sectionHtml}
    ${consultation.anotacionesGenerales ? infoCard("Recomendaciones del Profesional", escapeHtml(consultation.anotacionesGenerales)) : ""}
    <p style="margin-top:16px;font-weight:bold;">${escapeHtml(company.nombreComercial)}</p>
  `;

  const text = `${title}\n\nEstimado(a) ${patient.nombreCompleto},\nFecha: ${consultation.fecha}\nMotivo: ${consultation.motivo}\n\n${sectionText}${consultation.anotacionesGenerales ? `Recomendaciones: ${consultation.anotacionesGenerales}\n` : ""}\n${company.nombreComercial}`;

  return { subject, html: emailShell(company, title, bodyHtml), text };
}

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
    <p>Estimado(a) equipo de ${escapeHtml(tenantCompany.nombreComercial)},</p>
    <p>${escapeHtml(mensaje)}</p>
    <p style="margin-top:16px;font-weight:bold;">TuanisBooking</p>
  `;
  const text = `${title}\n\n${mensaje}\n\nTuanisBooking`;

  return { subject, html: emailShell(platformCompany, title, bodyHtml), text };
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
    <p>Se ha registrado una nueva empresa en la plataforma y está pendiente de aprobación:</p>
    ${detailsHtml}
    <p style="margin-top:16px;">Ingresa al panel de administración SaaS para revisarla y activarla.</p>
    <p style="margin-top:16px;font-weight:bold;">${escapeHtml(platformCompany.nombreComercial)}</p>
  `;

  const text = `${title}\n\nNombre Comercial: ${nuevaEmpresa.nombreComercial}\nRazón Social: ${nuevaEmpresa.razonSocial}\nIdentificación: ${nuevaEmpresa.identificacion}\nCorreo de Contacto: ${nuevaEmpresa.correoEmisor}\nPerfil: ${nuevaEmpresa.perfilCompania}\nEstado: ${nuevaEmpresa.estadoSaas}\n\n${platformCompany.nombreComercial}`;

  return { subject, html: emailShell(platformCompany, title, bodyHtml), text };
}

export function renderPasswordResetEmail(params: {
  company: Company;
  user: User;
  nuevaContrasena: string;
}): RenderedEmail {
  const { company, user, nuevaContrasena } = params;
  const title = "Restablecimiento de Contraseña";
  const subject = `${title} - ${company.nombreComercial}`;

  const bodyHtml = `
    <p>Estimado(a) ${escapeHtml(user.nombre)},</p>
    <p>Recibimos una solicitud para restablecer la contraseña de su cuenta.</p>
    ${infoCard("Usuario", escapeHtml(user.usuario))}
    ${infoCard("Contraseña Temporal", escapeHtml(nuevaContrasena))}
    <p style="margin-top:16px;">Use esta contraseña para iniciar sesión. Si usted no solicitó este cambio, contacte a su administrador de inmediato.</p>
    <p style="margin-top:16px;font-weight:bold;">${escapeHtml(company.nombreComercial)}</p>
  `;

  const text = `${title}\n\nUsuario: ${user.usuario}\nContraseña Temporal: ${nuevaContrasena}\n\nSi usted no solicitó este cambio, contacte a su administrador de inmediato.\n\n${company.nombreComercial}`;

  return { subject, html: emailShell(company, title, bodyHtml), text };
}
