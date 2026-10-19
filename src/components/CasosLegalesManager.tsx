import React, { useMemo, useState } from 'react';
import { ArrowLeft, Archive, Edit, FolderOpen, Mail, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { CasoLegal, DocumentoCaso, NotificationLog, Patient } from '../data/mockData';
import { notify, confirmar } from './ui/Feedback';
import { fechaCR } from '../utils/fechaCR';

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

const inputBase = 'w-full min-h-10 bg-slate-50 border border-slate-200 rounded-lg px-2.5 text-sm text-slate-800 focus:bg-white';
const labelBase = 'block text-xs text-slate-600 font-medium mb-1';

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
      <form onSubmit={guardarCaso} className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-clip">
        <div className="p-4 text-white font-bold flex justify-between items-center" style={{ backgroundColor: themeColor }}>
          <h2 className="flex items-center gap-2"><FolderOpen className="w-5 h-5" aria-hidden="true" />{borradorCaso.id ? 'Editar caso' : 'Nuevo caso'}</h2>
          <button type="button" onClick={() => setBorradorCaso(null)} className="hover:bg-black/15 w-9 h-9 -m-1.5 flex items-center justify-center rounded-full" aria-label="Cerrar sin guardar">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            <p id="caso-recordatorio-ayuda" className="text-[11px] text-slate-500 mt-1">0 = no enviar recordatorios automáticos.</p>
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
        <div className="p-4 border-t border-slate-200 flex justify-end gap-2.5">
          <button type="button" onClick={() => setBorradorCaso(null)} className="min-h-11 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold px-4 rounded-xl">Cancelar</button>
          <button type="submit" disabled={ocupado} className="min-h-11 text-white font-semibold px-5 rounded-xl flex items-center gap-1.5 hover:brightness-110 disabled:opacity-60" style={{ backgroundColor: themeColor }}>
            <Save className="w-4 h-4" aria-hidden="true" />Guardar caso
          </button>
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
      <div className="space-y-4">
        <button type="button" onClick={() => { setCasoAbiertoId(null); setBorradorDoc(null); }} className="min-h-10 px-3 -ml-3 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1.5">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />Volver a los casos
        </button>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4" aria-labelledby="caso-detalle-titulo">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="caso-detalle-titulo" className="text-lg font-bold text-slate-900">{casoAbierto.titulo}</h2>
              <p className="text-sm text-slate-600">{cliente?.nombreCompleto || 'Cliente no encontrado'}{casoAbierto.materia ? ` · ${casoAbierto.materia}` : ''}</p>
            </div>
            <span className={`self-start text-xs font-bold px-2.5 py-1 rounded-lg ${casoAbierto.estado === 'ABIERTO' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
              {casoAbierto.estado === 'ABIERTO' ? 'Abierto' : 'Cerrado'}
            </span>
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
              <dt className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Expediente</dt>
              <dd className="font-semibold text-slate-800 font-mono">{casoAbierto.numeroExpediente || '—'}</dd>
            </div>
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
              <dt className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Ubicación física</dt>
              <dd className="font-semibold text-slate-800">{casoAbierto.ubicacionFisica || 'Sin registrar'}</dd>
            </div>
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
              <dt className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Recordatorio</dt>
              <dd className="font-semibold text-slate-800">
                {casoAbierto.recordatorioCadaDias > 0 ? `Cada ${casoAbierto.recordatorioCadaDias} día(s)` : 'Desactivado'}
                <span className="block text-xs font-normal text-slate-600">
                  {casoAbierto.ultimoRecordatorioEn ? `Último: ${new Date(casoAbierto.ultimoRecordatorioEn).toLocaleString('es-CR')}` : 'Aún no se ha enviado'}
                </span>
              </dd>
            </div>
          </dl>
          {casoAbierto.notas && <p className="text-sm text-slate-700 whitespace-pre-line">{casoAbierto.notas}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setBorradorCaso({ ...casoAbierto })} className="min-h-10 px-3.5 rounded-xl text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 inline-flex items-center gap-1.5">
              <Edit className="w-4 h-4" aria-hidden="true" />Editar caso
            </button>
            <button
              type="button"
              disabled={ocupado || !!motivoSinRecordatorio}
              onClick={() => enviarRecordatorio(casoAbierto)}
              title={motivoSinRecordatorio || 'Enviar ahora al cliente la lista de documentos pendientes'}
              className="min-h-10 px-3.5 rounded-xl text-sm font-semibold text-white inline-flex items-center gap-1.5 hover:brightness-110 disabled:opacity-50"
              style={{ backgroundColor: themeColor }}
            >
              <Mail className="w-4 h-4" aria-hidden="true" />Enviar recordatorio ahora
            </button>
            <button type="button" onClick={() => eliminarCaso(casoAbierto)} className="min-h-10 px-3.5 rounded-xl text-sm font-semibold text-rose-700 hover:bg-rose-50 inline-flex items-center gap-1.5 sm:ml-auto">
              <Trash2 className="w-4 h-4" aria-hidden="true" />Eliminar caso
            </button>
          </div>
          {motivoSinRecordatorio && <p className="text-xs text-slate-600" role="note">No se puede enviar recordatorio: {motivoSinRecordatorio}</p>}
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden" aria-labelledby="caso-documentos">
          <div className="px-5 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50/60">
            <h3 id="caso-documentos" className="text-sm font-bold text-slate-900">Documentos ({pendientes.length} pendiente{pendientes.length === 1 ? '' : 's'})</h3>
            {!borradorDoc && (
              <button type="button" onClick={() => setBorradorDoc(documentoVacio())} className="min-h-9 px-3 rounded-lg text-sm font-semibold inline-flex items-center gap-1" style={{ color: themeColor }}>
                <Plus className="w-4 h-4" aria-hidden="true" />Agregar
              </button>
            )}
          </div>

          {borradorDoc && (
            <form onSubmit={enviarDoc} className="p-4 border-b border-slate-100 grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-50/40">
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
                <input id="doc-limite" type="date" value={borradorDoc.fechaLimite} onChange={e => setBorradorDoc({ ...borradorDoc, fechaLimite: e.target.value })} className={inputBase} />
              </div>
              <div className="sm:col-span-3">
                <label htmlFor="doc-notas" className={labelBase}>Notas</label>
                <input id="doc-notas" value={borradorDoc.notas} onChange={e => setBorradorDoc({ ...borradorDoc, notas: e.target.value })} className={inputBase} />
              </div>
              <div className="flex items-end gap-2">
                <button type="button" onClick={() => setBorradorDoc(null)} className="flex-1 min-h-10 bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-semibold rounded-xl">Cancelar</button>
                <button type="submit" disabled={ocupado} className="flex-1 min-h-10 text-white text-sm font-semibold rounded-xl hover:brightness-110 disabled:opacity-60" style={{ backgroundColor: themeColor }}>Guardar</button>
              </div>
            </form>
          )}

          {casoAbierto.documentos.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-600">Aún no hay documentos en este caso.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {casoAbierto.documentos.map(d => {
                const vencido = d.estado === 'PENDIENTE' && !!d.fechaLimite && d.fechaLimite < hoy;
                return (
                  <li key={d.id} className="px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
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
                        <span className={`block text-sm font-semibold ${d.estado === 'RECIBIDO' ? 'text-slate-500 line-through' : 'text-slate-900'}`}>{d.nombre}</span>
                        <span className="block text-xs text-slate-600">
                          {d.folio ? `Folio ${d.folio}` : 'Sin folio'}
                          {d.estado === 'RECIBIDO' && d.fechaRecibido ? ` · Recibido ${d.fechaRecibido}` : ''}
                          {d.estado === 'PENDIENTE' && d.fechaLimite ? ' · ' : ''}
                          {d.estado === 'PENDIENTE' && d.fechaLimite && (
                            <span className={vencido ? 'text-rose-700 font-semibold' : ''}>{vencido ? 'Vencido' : 'Entregar antes del'} {d.fechaLimite}</span>
                          )}
                          {d.notas ? ` · ${d.notas}` : ''}
                        </span>
                      </span>
                    </label>
                    <div className="flex gap-1 self-end sm:self-auto">
                      <button
                        type="button"
                        onClick={() => setBorradorDoc({ id: d.id, nombre: d.nombre, folio: d.folio, fechaLimite: d.fechaLimite || '', notas: d.notas, estado: d.estado, fechaRecibido: d.fechaRecibido })}
                        className="p-2.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl"
                        aria-label={`Editar ${d.nombre}`}
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => eliminarDocumento(casoAbierto, d)} className="p-2.5 text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded-xl" aria-label={`Eliminar ${d.nombre}`}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    );
  }

  // ---------- Lista de casos ----------
  const clienteFiltrado = idClienteFiltro != null ? clientePorId.get(idClienteFiltro) : undefined;
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative flex-1">
          <label htmlFor="buscar-casos" className="sr-only">Buscar casos</label>
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
          <input
            id="buscar-casos"
            type="search"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por cliente, expediente o ubicación…"
            autoComplete="off"
            className="w-full min-h-11 bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-500 focus:bg-white"
          />
        </div>
        <label htmlFor="filtro-estado-casos" className="sr-only">Estado</label>
        <select id="filtro-estado-casos" value={filtroEstado} onChange={e => setFiltroEstado(e.target.value as typeof filtroEstado)} className="min-h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 text-sm text-slate-800">
          <option value="ABIERTO">Abiertos</option>
          <option value="CERRADO">Cerrados</option>
          <option value="TODOS">Todos</option>
        </select>
        <button
          type="button"
          disabled={clientes.length === 0}
          title={clientes.length === 0 ? 'Registre primero un cliente' : undefined}
          onClick={() => setBorradorCaso(casoVacio(idClienteFiltro ?? 0))}
          className="min-h-11 text-white text-sm font-semibold px-4 rounded-xl flex items-center justify-center gap-2 hover:brightness-110 disabled:opacity-50"
          style={{ backgroundColor: themeColor }}
        >
          <Plus className="w-4 h-4" aria-hidden="true" />Nuevo caso
        </button>
      </div>

      {clienteFiltrado && (
        <p className="text-sm text-slate-700 flex items-center gap-2">
          Casos de <strong>{clienteFiltrado.nombreCompleto}</strong>
          <button type="button" onClick={onQuitarFiltroCliente} className="min-h-9 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold inline-flex items-center gap-1">
            <X className="w-3.5 h-3.5" aria-hidden="true" />Ver todos
          </button>
        </p>
      )}

      {casosFiltrados.length === 0 ? (
        <div className="text-center py-12 px-4 bg-white rounded-2xl border border-dashed border-slate-300">
          <Archive className="w-8 h-8 text-slate-400 mx-auto mb-2" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-800">{casos.length === 0 ? 'Aún no hay casos' : 'Ningún caso coincide con el filtro'}</p>
          <p className="text-sm text-slate-600 mt-1">
            {casos.length === 0 ? 'Cree un caso para llevar el control de los documentos del cliente y dónde están archivados.' : 'Pruebe otra búsqueda o cambie el estado.'}
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {casosFiltrados.map(c => {
            const pendientes = pendientesDe(c).length;
            const vencidos = vencidosDe(c).length;
            return (
              <li key={c.id}>
                <button type="button" onClick={() => setCasoAbiertoId(c.id)} className="w-full text-left bg-white rounded-2xl border border-slate-200 p-4 shadow-xs hover:border-slate-300 hover:shadow-sm transition-[border-color,box-shadow] space-y-2">
                  <span className="flex justify-between items-start gap-2">
                    <span className="min-w-0">
                      <span className="block font-bold text-slate-900 text-sm truncate">{c.titulo}</span>
                      <span className="block text-xs text-slate-600 truncate">{clientePorId.get(c.idPaciente)?.nombreCompleto || 'Cliente no encontrado'}</span>
                    </span>
                    {c.estado === 'CERRADO' && <span className="text-[11px] font-bold bg-slate-100 text-slate-700 rounded-md px-2 py-0.5">Cerrado</span>}
                  </span>
                  <span className="block text-xs text-slate-600">
                    {c.numeroExpediente && <span className="font-mono">{c.numeroExpediente} · </span>}
                    <Archive className="w-3.5 h-3.5 inline -mt-0.5" aria-hidden="true" /> {c.ubicacionFisica || 'Ubicación sin registrar'}
                  </span>
                  <span className="flex flex-wrap gap-1.5 text-[11px] font-bold">
                    <span className={`rounded-md px-2 py-0.5 ${pendientes ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                      {pendientes ? `${pendientes} pendiente${pendientes === 1 ? '' : 's'}` : 'Documentos completos'}
                    </span>
                    {vencidos > 0 && <span className="rounded-md px-2 py-0.5 bg-rose-100 text-rose-800">{vencidos} vencido{vencidos === 1 ? '' : 's'}</span>}
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
