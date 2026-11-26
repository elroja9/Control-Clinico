import React, { useMemo, useState } from 'react';
import { ArrowLeft, Archive, Edit, FolderOpen, Mail, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { CasoLegal, DocumentoCaso, NotificationLog, Patient } from '../data/mockData';
import { notify, confirmar } from './ui/Feedback';
import { fechaCR } from '../utils/fechaCR';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { EmptyState } from './ui/EmptyState';
import { IconButton } from './ui/IconButton';
import { controlBase } from './ui/Input';

interface CasosLegalesManagerProps {
  casos: CasoLegal[];
  clientes: Patient[];
  themeColor: string;
  idClienteFiltro: number | null;
  onQuitarFiltroCliente: () => void;
  onCasoGuardado: (caso: CasoLegal) => void;
  onCasoEliminado: (id: number) => void;
  onNotificacion: (log: NotificationLog) => void;
}

type BorradorCaso = Omit<CasoLegal, 'id' | 'idCompania' | 'documentos' | 'ultimoRecordatorioEn' | 'creadoEn'> & { id?: number };
type BorradorDocumento = { id?: number; nombre: string; folio: string; fechaLimite: string; notas: string; estado: DocumentoCaso['estado']; fechaRecibido?: string | null };

const casoVacio = (idPaciente: number): BorradorCaso => ({
  idPaciente, numeroExpediente: '', titulo: '', materia: '', estado: 'ABIERTO', ubicacionFisica: '', recordatorioCadaDias: 7, notas: ''
});
const documentoVacio = (): BorradorDocumento => ({ nombre: '', folio: '', fechaLimite: '', notas: '', estado: 'PENDIENTE' });

async function pedir<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo completar la operación.');
  return data as T;
}

const inputBase = `${controlBase} px-3.5`;
const labelBase = 'block text-xs font-semibold text-fg mb-1.5';

export default function CasosLegalesManager({
  casos, clientes, themeColor, idClienteFiltro, onQuitarFiltroCliente, onCasoGuardado, onCasoEliminado, onNotificacion
}: CasosLegalesManagerProps) {
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'ABIERTO' | 'CERRADO' | 'TODOS'>('ABIERTO');
  const [casoAbiertoId, setCasoAbiertoId] = useState<number | null>(null);
  const [borradorCaso, setBorradorCaso] = useState<BorradorCaso | null>(null);
  const [borradorDoc, setBorradorDoc] = useState<BorradorDocumento | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const hoy = fechaCR();
  const clientePorId = useMemo(() => new Map(clientes.map(c => [c.id, c])), [clientes]);
  const pendientesDe = (c: CasoLegal) => c.documentos.filter(d => d.estado === 'PENDIENTE');
  const vencidosDe = (c: CasoLegal) => pendientesDe(c).filter(d => d.fechaLimite && d.fechaLimite < hoy);

  const casosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return casos.filter(c => {
      if (filtroEstado !== 'TODOS' && c.estado !== filtroEstado) return false;
      if (idClienteFiltro != null && c.idPaciente !== idClienteFiltro) return false;
      if (!q) return true;
      const cliente = clientePorId.get(c.idPaciente)?.nombreCompleto || '';
      return [cliente, c.titulo, c.numeroExpediente, c.materia, c.ubicacionFisica].some(v => v.toLowerCase().includes(q));
    });
  }, [casos, busqueda, filtroEstado, idClienteFiltro, clientePorId]);

  const casoAbierto = casos.find(c => c.id === casoAbiertoId) || null;

  const guardarCaso = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!borradorCaso) return;
    setOcupado(true);
    try {
      const guardado = await pedir<CasoLegal>('/api/casos', 'POST', borradorCaso);
      onCasoGuardado(guardado);
      setBorradorCaso(null);
      setCasoAbiertoId(guardado.id);
      notify.success('Caso guardado.');
    } catch (err: any) {
      notify.error(err.message);
    } finally {
      setOcupado(false);
    }
  };

  const eliminarCaso = async (caso: CasoLegal) => {
    const ok = await confirmar({
      title: '¿Eliminar este caso?',
      message: `Se borrarán "${caso.titulo}" y sus ${caso.documentos.length} documento(s) registrados. No se puede deshacer.`,
      confirmText: 'Eliminar caso',
      tone: 'danger'
    });
    if (!ok) return;
    try {
      await pedir('/api/casos/' + caso.id, 'DELETE');
      onCasoEliminado(caso.id);
      setCasoAbiertoId(null);
      notify.success('Caso eliminado.');
    } catch (err: any) {
      notify.error(err.message);
    }
  };

  const guardarDocumento = async (caso: CasoLegal, doc: BorradorDocumento | DocumentoCaso) => {
    setOcupado(true);
    try {
      onCasoGuardado(await pedir<CasoLegal>(`/api/casos/${caso.id}/documentos`, 'POST', doc));
      return true;
    } catch (err: any) {
      notify.error(err.message);
      return false;
    } finally {
      setOcupado(false);
    }
  };

  const eliminarDocumento = async (caso: CasoLegal, doc: DocumentoCaso) => {
    const ok = await confirmar({ title: '¿Eliminar este documento?', message: `"${doc.nombre}" se quitará de la lista del caso.`, confirmText: 'Eliminar', tone: 'danger' });
    if (!ok) return;
    try {
      await pedir('/api/documentos-caso/' + doc.id, 'DELETE');
      onCasoGuardado({ ...caso, documentos: caso.documentos.filter(d => d.id !== doc.id) });
    } catch (err: any) {
      notify.error(err.message);
    }
  };

  const enviarRecordatorio = async (caso: CasoLegal) => {
    setOcupado(true);
    try {
      const r = await pedir<{ log: NotificationLog; caso: CasoLegal }>(`/api/casos/${caso.id}/recordatorio`, 'POST');
      onCasoGuardado(r.caso);
      onNotificacion(r.log);
      notify.success(`Recordatorio enviado a ${r.log.destinatario}.`);
    } catch (err: any) {
      notify.error(err.message);
    } finally {
      setOcupado(false);
    }
  };

  // ---------- Formulario de caso ----------
  if (borradorCaso) {
    const set = <K extends keyof BorradorCaso>(k: K, v: BorradorCaso[K]) => setBorradorCaso({ ...borradorCaso, [k]: v });
    return (
      <form onSubmit={guardarCaso} className="bg-surface rounded-card border border-border shadow-xs overflow-clip" style={{ '--brand': themeColor } as React.CSSProperties}>
        <div className="px-5 sm:px-6 py-4 border-b border-border flex justify-between items-center gap-3">
          <h2 className="flex items-center gap-3 text-heading font-semibold tracking-tight text-fg">
            <span className="w-10 h-10 rounded-control bg-brand-soft text-brand-ink flex items-center justify-center" aria-hidden="true"><FolderOpen className="w-5 h-5" /></span>
            {borradorCaso.id ? 'Editar caso' : 'Nuevo caso'}
          </h2>
          <IconButton label="Cerrar sin guardar" icon={<X className="w-5 h-5" aria-hidden="true" />} onClick={() => setBorradorCaso(null)} />
        </div>
        <div className="p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label htmlFor="caso-cliente" className={labelBase}>Cliente *</label>
            <select id="caso-cliente" required value={borradorCaso.idPaciente || ''} onChange={e => set('idPaciente', parseInt(e.target.value))} className={inputBase}>
              <option value="" disabled>Seleccione un cliente</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nombreCompleto} ({c.identificacion})</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="caso-titulo" className={labelBase}>Título del caso *</label>
            <input id="caso-titulo" required maxLength={150} value={borradorCaso.titulo} onChange={e => set('titulo', e.target.value)} placeholder="ej: Divorcio, Sucesión, Cobro judicial" className={inputBase} />
          </div>
          <div>
            <label htmlFor="caso-expediente" className={labelBase}>Número de expediente</label>
            <input id="caso-expediente" maxLength={60} value={borradorCaso.numeroExpediente} onChange={e => set('numeroExpediente', e.target.value)} placeholder="ej: 24-000123-0180-FA" className={inputBase} />
          </div>
          <div>
            <label htmlFor="caso-materia" className={labelBase}>Materia</label>
            <input id="caso-materia" maxLength={100} value={borradorCaso.materia} onChange={e => set('materia', e.target.value)} placeholder="ej: Familia, Civil, Laboral" className={inputBase} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="caso-ubicacion" className={labelBase}>Ubicación física de la carpeta</label>
            <input id="caso-ubicacion" maxLength={150} value={borradorCaso.ubicacionFisica} onChange={e => set('ubicacionFisica', e.target.value)} placeholder="ej: Archivador 2 · Gaveta B" className={inputBase} />
          </div>
          <div>
            <label htmlFor="caso-recordatorio" className={labelBase}>Recordar documentos pendientes cada (días)</label>
            <input id="caso-recordatorio" type="number" min={0} max={365} value={borradorCaso.recordatorioCadaDias} onChange={e => set('recordatorioCadaDias', parseInt(e.target.value) || 0)} className={inputBase} aria-describedby="caso-recordatorio-ayuda" />
            <p id="caso-recordatorio-ayuda" className="text-xs text-fg-muted mt-1.5">0 = no enviar recordatorios automáticos.</p>
          </div>
          <div>
            <label htmlFor="caso-estado" className={labelBase}>Estado</label>
            <select id="caso-estado" value={borradorCaso.estado} onChange={e => set('estado', e.target.value as CasoLegal['estado'])} className={inputBase}>
              <option value="ABIERTO">Abierto</option>
              <option value="CERRADO">Cerrado</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="caso-notas" className={labelBase}>Notas</label>
            <textarea id="caso-notas" rows={3} value={borradorCaso.notas} onChange={e => set('notas', e.target.value)} className={`${inputBase} py-2`} />
          </div>
        </div>
        {/* Barra de guardar fija abajo en móvil, sobre la barra de inicio de iOS */}
        <div className="sticky bottom-0 z-10 sm:static px-4 sm:px-6 pt-3 sm:py-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-border bg-surface sm:bg-surface-muted/60 flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5">
          <Button variant="secondary" onClick={() => setBorradorCaso(null)}>Cancelar</Button>
          <Button type="submit" loading={ocupado} icon={ocupado ? undefined : <Save className="w-4 h-4" aria-hidden="true" />}>Guardar caso</Button>
        </div>
      </form>
    );
  }

  // ---------- Detalle del caso ----------
  if (casoAbierto) {
    const cliente = clientePorId.get(casoAbierto.idPaciente);
    const pendientes = pendientesDe(casoAbierto);
    const motivoSinRecordatorio = !cliente?.correoElectronico
      ? 'El cliente no tiene correo registrado.'
      : pendientes.length === 0 ? 'No hay documentos pendientes.' : '';

    const enviarDoc = async (e: React.FormEvent) => {
      e.preventDefault();
      if (borradorDoc && await guardarDocumento(casoAbierto, borradorDoc)) setBorradorDoc(null);
    };

    return (
      <div className="space-y-5" style={{ '--brand': themeColor } as React.CSSProperties}>
        <button type="button" onClick={() => { setCasoAbiertoId(null); setBorradorDoc(null); }} className="min-h-10 px-3 -ml-3 rounded-control text-sm font-semibold text-fg-muted hover:text-fg hover:bg-surface-muted inline-flex items-center gap-1.5 transition-colors">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />Volver a los casos
        </button>

        <Card className="p-5 sm:p-6 space-y-5" aria-labelledby="caso-detalle-titulo" role="region">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="caso-detalle-titulo" className="text-title font-semibold tracking-tight text-fg">{casoAbierto.titulo}</h2>
              <p className="text-body text-fg-muted">{cliente?.nombreCompleto || 'Cliente no encontrado'}{casoAbierto.materia ? ` · ${casoAbierto.materia}` : ''}</p>
            </div>
            <Badge tone={casoAbierto.estado === 'ABIERTO' ? 'success' : 'neutral'} className="self-start">
              {casoAbierto.estado === 'ABIERTO' ? 'Abierto' : 'Cerrado'}
            </Badge>
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div className="bg-surface-muted rounded-card p-4 border border-border">
              <dt className="text-xs font-semibold text-fg-muted">Expediente</dt>
              <dd className="mt-1 font-semibold text-fg font-mono">{casoAbierto.numeroExpediente || '—'}</dd>
            </div>
            <div className="bg-surface-muted rounded-card p-4 border border-border">
              <dt className="text-xs font-semibold text-fg-muted">Ubicación física</dt>
              <dd className="mt-1 font-semibold text-fg">{casoAbierto.ubicacionFisica || 'Sin registrar'}</dd>
            </div>
            <div className="bg-surface-muted rounded-card p-4 border border-border">
              <dt className="text-xs font-semibold text-fg-muted">Recordatorio</dt>
              <dd className="mt-1 font-semibold text-fg">
                {casoAbierto.recordatorioCadaDias > 0 ? `Cada ${casoAbierto.recordatorioCadaDias} día(s)` : 'Desactivado'}
                <span className="block text-xs font-normal text-fg-muted">
                  {casoAbierto.ultimoRecordatorioEn ? `Último: ${new Date(casoAbierto.ultimoRecordatorioEn).toLocaleString('es-CR')}` : 'Aún no se ha enviado'}
                </span>
              </dd>
            </div>
          </dl>
          {casoAbierto.notas && <p className="text-sm text-fg-muted whitespace-pre-line">{casoAbierto.notas}</p>}
          <div className="flex flex-wrap gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
            <Button variant="secondary" size="sm" onClick={() => setBorradorCaso({ ...casoAbierto })} icon={<Edit className="w-4 h-4" aria-hidden="true" />}>
              Editar caso
            </Button>
            <Button
              size="sm"
              disabled={ocupado || !!motivoSinRecordatorio}
              onClick={() => enviarRecordatorio(casoAbierto)}
              title={motivoSinRecordatorio || 'Enviar ahora al cliente la lista de documentos pendientes'}
              icon={<Mail className="w-4 h-4" aria-hidden="true" />}
            >
              Enviar recordatorio ahora
            </Button>
            <Button variant="ghost" size="sm" onClick={() => eliminarCaso(casoAbierto)} icon={<Trash2 className="w-4 h-4" aria-hidden="true" />} className="text-danger hover:bg-danger-soft hover:text-danger sm:ml-auto">
              Eliminar caso
            </Button>
          </div>
          {motivoSinRecordatorio && <p className="text-xs text-fg-muted" role="note">No se puede enviar recordatorio: {motivoSinRecordatorio}</p>}
        </Card>

        <Card className="overflow-hidden" aria-labelledby="caso-documentos" role="region">
          <div className="px-5 sm:px-6 py-3 border-b border-border flex justify-between items-center gap-3 bg-surface-muted/60">
            <h3 id="caso-documentos" className="text-body font-semibold text-fg">Documentos ({pendientes.length} pendiente{pendientes.length === 1 ? '' : 's'})</h3>
            {!borradorDoc && (
              <Button variant="ghost" size="sm" onClick={() => setBorradorDoc(documentoVacio())} icon={<Plus className="w-4 h-4" aria-hidden="true" />} className="text-brand-ink">
                Agregar
              </Button>
            )}
          </div>

          {borradorDoc && (
            <form onSubmit={enviarDoc} className="p-4 sm:p-5 border-b border-border grid grid-cols-1 sm:grid-cols-4 gap-4 bg-surface-muted/40">
              <div className="sm:col-span-2">
                <label htmlFor="doc-nombre" className={labelBase}>Documento *</label>
                <input id="doc-nombre" required autoFocus maxLength={150} value={borradorDoc.nombre} onChange={e => setBorradorDoc({ ...borradorDoc, nombre: e.target.value })} placeholder="ej: Cédula, Certificación de nacimiento" className={inputBase} />
              </div>
              <div>
                <label htmlFor="doc-folio" className={labelBase}>Folio</label>
                <input id="doc-folio" maxLength={60} value={borradorDoc.folio} onChange={e => setBorradorDoc({ ...borradorDoc, folio: e.target.value })} placeholder="ej: f. 12-15" className={inputBase} />
              </div>
              <div>
                <label htmlFor="doc-limite" className={labelBase}>Fecha límite</label>
                <input id="doc-limite" type="date" value={borradorDoc.fechaLimite} onChange={e => setBorradorDoc({ ...borradorDoc, fechaLimite: e.target.value })} className={`${inputBase} px-2.5!`} />
              </div>
              <div className="sm:col-span-3">
                <label htmlFor="doc-notas" className={labelBase}>Notas</label>
                <input id="doc-notas" value={borradorDoc.notas} onChange={e => setBorradorDoc({ ...borradorDoc, notas: e.target.value })} className={inputBase} />
              </div>
              <div className="flex items-end gap-2">
                <Button variant="secondary" size="sm" className="flex-1" onClick={() => setBorradorDoc(null)}>Cancelar</Button>
                <Button type="submit" size="sm" className="flex-1" loading={ocupado}>Guardar</Button>
              </div>
            </form>
          )}

          {casoAbierto.documentos.length === 0 ? (
            <EmptyState
              icon={<FolderOpen />}
              title="Aún no hay documentos en este caso"
              description="Agregue los documentos que el cliente debe entregar para llevar su control."
            />
          ) : (
            <ul className="divide-y divide-border">
              {casoAbierto.documentos.map(d => {
                const vencido = d.estado === 'PENDIENTE' && !!d.fechaLimite && d.fechaLimite < hoy;
                return (
                  <li key={d.id} className="px-5 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                    <label className="flex items-start gap-3 flex-1 min-w-0 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={d.estado === 'RECIBIDO'}
                        disabled={ocupado}
                        onChange={e => guardarDocumento(casoAbierto, { ...d, estado: e.target.checked ? 'RECIBIDO' : 'PENDIENTE', fechaRecibido: null })}
                        className="mt-0.5 w-5 h-5 shrink-0"
                        style={{ accentColor: themeColor }}
                        aria-label={`Marcar "${d.nombre}" como recibido`}
                      />
                      <span className="min-w-0">
                        <span className={`block text-sm font-semibold ${d.estado === 'RECIBIDO' ? 'text-fg-subtle line-through' : 'text-fg'}`}>{d.nombre}</span>
                        <span className="block text-xs text-fg-muted">
                          {d.folio ? `Folio ${d.folio}` : 'Sin folio'}
                          {d.estado === 'RECIBIDO' && d.fechaRecibido ? ` · Recibido ${d.fechaRecibido}` : ''}
                          {d.estado === 'PENDIENTE' && d.fechaLimite ? ' · ' : ''}
                          {d.estado === 'PENDIENTE' && d.fechaLimite && (
                            <span className={vencido ? 'text-danger font-semibold' : ''}>{vencido ? 'Vencido' : 'Entregar antes del'} {d.fechaLimite}</span>
                          )}
                          {d.notas ? ` · ${d.notas}` : ''}
                        </span>
                      </span>
                    </label>
                    <div className="flex gap-1 self-end sm:self-auto">
                      <IconButton
                        label={`Editar ${d.nombre}`}
                        icon={<Edit className="w-4 h-4" aria-hidden="true" />}
                        onClick={() => setBorradorDoc({ id: d.id, nombre: d.nombre, folio: d.folio, fechaLimite: d.fechaLimite || '', notas: d.notas, estado: d.estado, fechaRecibido: d.fechaRecibido })}
                      />
                      <IconButton
                        label={`Eliminar ${d.nombre}`}
                        icon={<Trash2 className="w-4 h-4" aria-hidden="true" />}
                        className="hover:text-danger hover:bg-danger-soft"
                        onClick={() => eliminarDocumento(casoAbierto, d)}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    );
  }

  // ---------- Lista de casos ----------
  const clienteFiltrado = idClienteFiltro != null ? clientePorId.get(idClienteFiltro) : undefined;
  return (
    <div className="space-y-5" style={{ '--brand': themeColor } as React.CSSProperties}>
      <Card className="p-4 flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative flex-1">
          <label htmlFor="buscar-casos" className="sr-only">Buscar casos</label>
          <Search className="w-4 h-4 text-fg-subtle absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
          <input
            id="buscar-casos"
            type="search"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por cliente, expediente o ubicación…"
            autoComplete="off"
            className={`${controlBase} pl-10 pr-3.5`}
          />
        </div>
        <label htmlFor="filtro-estado-casos" className="sr-only">Estado</label>
        <select id="filtro-estado-casos" value={filtroEstado} onChange={e => setFiltroEstado(e.target.value as typeof filtroEstado)} className={`${controlBase} px-3.5 sm:w-auto`}>
          <option value="ABIERTO">Abiertos</option>
          <option value="CERRADO">Cerrados</option>
          <option value="TODOS">Todos</option>
        </select>
        <Button
          disabled={clientes.length === 0}
          title={clientes.length === 0 ? 'Registre primero un cliente' : undefined}
          onClick={() => setBorradorCaso(casoVacio(idClienteFiltro ?? 0))}
          icon={<Plus className="w-4 h-4" aria-hidden="true" />}
        >
          Nuevo caso
        </Button>
      </Card>

      {clienteFiltrado && (
        <p className="text-sm text-fg-muted flex items-center gap-2">
          Casos de <strong className="text-fg">{clienteFiltrado.nombreCompleto}</strong>
          <Button variant="secondary" size="sm" onClick={onQuitarFiltroCliente} icon={<X className="w-3.5 h-3.5" aria-hidden="true" />}>
            Ver todos
          </Button>
        </p>
      )}

      {casosFiltrados.length === 0 ? (
        <Card className="border-dashed border-border-strong">
          <EmptyState
            icon={<Archive />}
            title={casos.length === 0 ? 'Aún no hay casos' : 'Ningún caso coincide con el filtro'}
            description={casos.length === 0 ? 'Cree un caso para llevar el control de los documentos del cliente y dónde están archivados.' : 'Pruebe otra búsqueda o cambie el estado.'}
          />
        </Card>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {casosFiltrados.map(c => {
            const pendientes = pendientesDe(c).length;
            const vencidos = vencidosDe(c).length;
            return (
              <li key={c.id}>
                <button type="button" onClick={() => setCasoAbiertoId(c.id)} className="w-full h-full text-left bg-surface rounded-card border border-border p-5 shadow-xs hover:border-brand/40 hover:shadow-md transition-[border-color,box-shadow] space-y-3">
                  <span className="flex justify-between items-start gap-2">
                    <span className="min-w-0">
                      <span className="block font-semibold text-fg text-body truncate">{c.titulo}</span>
                      <span className="block text-xs text-fg-muted truncate">{clientePorId.get(c.idPaciente)?.nombreCompleto || 'Cliente no encontrado'}</span>
                    </span>
                    {c.estado === 'CERRADO' && <Badge>Cerrado</Badge>}
                  </span>
                  <span className="block text-xs text-fg-muted">
                    {c.numeroExpediente && <span className="font-mono">{c.numeroExpediente} · </span>}
                    <Archive className="w-3.5 h-3.5 inline -mt-0.5" aria-hidden="true" /> {c.ubicacionFisica || 'Ubicación sin registrar'}
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    <Badge tone={pendientes ? 'warning' : 'success'}>
                      {pendientes ? `${pendientes} pendiente${pendientes === 1 ? '' : 's'}` : 'Documentos completos'}
                    </Badge>
                    {vencidos > 0 && <Badge tone="danger">{vencidos} vencido{vencidos === 1 ? '' : 's'}</Badge>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
