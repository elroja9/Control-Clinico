import { describe, it, expect } from 'vitest';
import {
  renderRecordatorioDocumentosEmail,
  renderCitaEmail,
  renderCitaEmailProfesional,
  renderPasswordResetEmail,
  renderEmailPreviews
} from './emailTemplates';
import { defaultCompanies, defaultPatients, defaultUsers } from '../src/data/mockData';
import type { CasoLegal, DocumentoCaso, Cita, Company } from '../src/data/mockData';

const doc = (id: number, nombre: string, fechaLimite: string | null): DocumentoCaso =>
  ({ id, idCaso: 1, nombre, estado: 'PENDIENTE', folio: '', fechaLimite, fechaRecibido: null, notas: '' });

const caso: CasoLegal = {
  id: 1, idCompania: 1, idPaciente: 1, numeroExpediente: '24-000123-0180-FA', titulo: 'Divorcio', materia: 'Familia',
  estado: 'ABIERTO', ubicacionFisica: 'Archivador 2', recordatorioCadaDias: 7, ultimoRecordatorioEn: null,
  notas: '', creadoEn: '2026-10-01T00:00:00.000Z', documentos: []
};

describe('renderRecordatorioDocumentosEmail', () => {
  const pendientes = [doc(1, 'Cédula', '2026-10-30'), doc(2, '<script>x</script>', null)];
  const r = renderRecordatorioDocumentosEmail({ company: defaultCompanies[0], patient: defaultPatients[0], caso, pendientes });

  it('el asunto nombra el caso', () => expect(r.subject).toContain('Divorcio'));
  it('lista cada pendiente con su fecha límite', () => {
    expect(r.html).toContain('Cédula');
    expect(r.html).toContain('2026-10-30');
    expect(r.text).toContain('Cédula');
    expect(r.text).toContain('2026-10-30');
    expect(r.html).toContain('24-000123-0180-FA');
  });
  it('escapa el HTML de los nombres', () => {
    expect(r.html).not.toContain('<script>');
    expect(r.html).toContain('&lt;script&gt;');
  });
});

const clinica: Company = { ...defaultCompanies[0], whatsappReservas: '50688887777' };
const cita: Cita = {
  id: 10, idCompania: 1, idPaciente: 1, idUsuarioNutricionista: 1, fechaHora: '2026-12-02T09:00',
  duracionMinutos: 45, estadoCita: 'CONFIRMADA', notas: 'NOTA-INTERNA-SECRETA', tipoVisita: 'CONSULTORIO'
};
const domicilio: Cita = {
  ...cita, estadoCita: 'PROGRAMADA', tipoVisita: 'DOMICILIO',
  direccionDomicilio: 'Calle 5 & Av. 2', tiempoTrasladoMinutos: 20
};

describe('renderCitaEmail (paciente)', () => {
  it('confirmada: título, fecha larga, hora con duración y asunto con clínica', () => {
    const r = renderCitaEmail({ company: clinica, patient: defaultPatients[0], cita, tipoNotif: 'CONFIRMACION', servicio: 'Consulta', profesional: 'Dra. Mora' });
    expect(r.html).toContain('Su cita está confirmada');
    expect(r.html).toContain('miércoles 2 de diciembre de 2026');
    expect(r.html).toContain('9:00 a. m. a 9:45 a. m. (45 min)');
    expect(r.subject).toBe(`Cita confirmada · ${clinica.nombreComercial} · mié 2 dic, 9:00 a. m.`);
    expect(r.text).toContain('Servicio: Consulta');
    expect(r.html).toContain('Adjuntamos la cita para agregarla a su calendario');
    expect(r.html).toContain('¿Necesita cambiar su cita?');
    expect(r.html).toContain('https://wa.me/50688887777');
  });

  it('pendiente, reprogramada y cancelada usan su propio título', () => {
    const p = renderCitaEmail({ company: clinica, patient: defaultPatients[0], cita: domicilio, tipoNotif: 'CONFIRMACION' });
    expect(p.html).toContain('pendiente de confirmación');
    const m = renderCitaEmail({ company: clinica, patient: defaultPatients[0], cita, tipoNotif: 'MODIFICACION' });
    expect(m.html).toContain('Su cita fue reprogramada');
    const c = renderCitaEmail({ company: clinica, patient: defaultPatients[0], cita, tipoNotif: 'CANCELACION' });
    expect(c.html).toContain('Su cita fue cancelada');
    expect(c.html).toContain('Adjuntamos la cancelación');
  });

  it('no incluye las notas internas de la cita', () => {
    for (const tipoNotif of ['CONFIRMACION', 'MODIFICACION', 'CANCELACION'] as const) {
      const r = renderCitaEmail({ company: clinica, patient: defaultPatients[0], cita, tipoNotif });
      expect(r.html).not.toContain('NOTA-INTERNA-SECRETA');
      expect(r.text).not.toContain('NOTA-INTERNA-SECRETA');
      expect(r.html).not.toContain('Notas del Profesional');
    }
  });

  it('Antes / Ahora solo aparece si se recibe la fecha anterior', () => {
    const con = renderCitaEmail({ company: clinica, patient: defaultPatients[0], cita, tipoNotif: 'MODIFICACION', fechaAnterior: '2026-12-01T15:30' });
    expect(con.html).toContain('Antes');
    expect(con.html).toContain('Ahora');
    expect(con.html).toContain('martes 1 de diciembre de 2026, 3:30 p. m.');
    const sin = renderCitaEmail({ company: clinica, patient: defaultPatients[0], cita, tipoNotif: 'MODIFICACION' });
    expect(sin.html).not.toContain('Antes');
  });

  it('a domicilio muestra la dirección del paciente y el botón Cómo llegar escapado', () => {
    const r = renderCitaEmail({ company: clinica, patient: defaultPatients[0], cita: domicilio, tipoNotif: 'CONFIRMACION' });
    expect(r.html).toContain('Cómo llegar');
    expect(r.html).toContain('Calle 5 &amp; Av. 2');
    expect(r.html).toContain('query=Calle%205%20%26%20Av.%202');
    expect(r.html).toContain('A domicilio');
  });

  it('escapa el HTML del nombre del paciente', () => {
    const paciente = { ...defaultPatients[0], nombreCompleto: '<img src=x onerror=alert(1)>' };
    const r = renderCitaEmail({ company: clinica, patient: paciente, cita, tipoNotif: 'CONFIRMACION' });
    expect(r.html).not.toContain('<img src=x');
    expect(r.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});

describe('renderCitaEmailProfesional', () => {
  it('muestra badge, datos de contacto del paciente y notas del paciente', () => {
    const r = renderCitaEmailProfesional({ company: clinica, professional: defaultUsers[0], patient: defaultPatients[0], cita: domicilio, servicio: 'Consulta' });
    expect(r.html).toContain('Pendiente de confirmar');
    expect(r.html).toContain(defaultPatients[0].telefono);
    expect(r.html).toContain(defaultPatients[0].correoElectronico);
    expect(r.html).toContain('20 minutos');
    expect(r.html).toContain('NOTA-INTERNA-SECRETA');
    expect(r.text).toContain('Teléfono:');
  });

  it('Abrir agenda solo con URL http(s)', () => {
    const base = { company: clinica, professional: defaultUsers[0], patient: defaultPatients[0], cita };
    expect(renderCitaEmailProfesional({ ...base, agendaUrl: 'https://app.example.com/agenda' }).html).toContain('Abrir agenda');
    expect(renderCitaEmailProfesional(base).html).not.toContain('Abrir agenda');
    expect(renderCitaEmailProfesional({ ...base, agendaUrl: 'javascript:alert(1)' }).html).not.toContain('Abrir agenda');
  });
});

describe('emailShell (vía plantillas)', () => {
  it('sobre un color de marca claro el texto del encabezado es oscuro', () => {
    const clara = { ...clinica, colorPrimario: '#fde68a', logoUrl: '' };
    const r = renderCitaEmail({ company: clara, patient: defaultPatients[0], cita, tipoNotif: 'CONFIRMACION' });
    expect(r.html).toMatch(/data-marca="nombre" style="color:#1e293b/);
  });

  it('sobre un color de marca oscuro el texto del encabezado es blanco', () => {
    const oscura = { ...clinica, colorPrimario: '#0f172a', logoUrl: '' };
    const r = renderCitaEmail({ company: oscura, patient: defaultPatients[0], cita, tipoNotif: 'CONFIRMACION' });
    expect(r.html).toMatch(/data-marca="nombre" style="color:#ffffff/);
  });

  it('un logo data: no se incrusta y se usa el nombre', () => {
    const conData = { ...clinica, logoUrl: 'data:image/png;base64,AAAA' };
    const r = renderCitaEmail({ company: conData, patient: defaultPatients[0], cita, tipoNotif: 'CONFIRMACION' });
    expect(r.html).not.toContain('data:image');
    expect(r.html).not.toContain('<img');
    expect(r.html).toContain(clinica.nombreComercial);
  });

  it('un logo http(s) público sí se usa', () => {
    const r = renderCitaEmail({ company: { ...clinica, logoUrl: 'https://cdn.example.com/logo.png' }, patient: defaultPatients[0], cita, tipoNotif: 'CONFIRMACION' });
    expect(r.html).toContain('<img src="https://cdn.example.com/logo.png"');
  });

  it('incluye preheader oculto, pie con datos de la clínica y nota de correo automático', () => {
    const r = renderCitaEmail({ company: clinica, patient: defaultPatients[0], cita, tipoNotif: 'CONFIRMACION' });
    expect(r.html).toContain('display:none');
    expect(r.html).toContain(clinica.identificacion);
    expect(r.html).toContain('Este es un correo automático');
    expect(r.text).toContain('Este es un correo automático');
  });
});

describe('renderPasswordResetEmail', () => {
  it('destaca la clave en bloque monoespaciado, la escapa y recomienda cambiarla', () => {
    const r = renderPasswordResetEmail({ company: clinica, user: defaultUsers[0], nuevaContrasena: 'a<b>"c' });
    expect(r.html).toContain('Consolas');
    expect(r.html).toContain('a&lt;b&gt;&quot;c');
    expect(r.html).toContain('cambiarla');
    expect(r.text).toContain('Contraseña Temporal: a<b>"c');
  });
});

describe('renderEmailPreviews', () => {
  it('devuelve una vista previa por plantilla con html completo', () => {
    const previews = renderEmailPreviews();
    expect(previews.length).toBeGreaterThanOrEqual(10);
    for (const p of previews) {
      expect(p.nombre).toBeTruthy();
      expect(p.subject).toBeTruthy();
      expect(p.html).toContain('<!doctype html>');
    }
  });
});
