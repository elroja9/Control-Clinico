import { describe, it, expect } from 'vitest';
import { renderRecordatorioDocumentosEmail } from './emailTemplates';
import { defaultCompanies, defaultPatients } from '../src/data/mockData';
import type { CasoLegal, DocumentoCaso } from '../src/data/mockData';

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
