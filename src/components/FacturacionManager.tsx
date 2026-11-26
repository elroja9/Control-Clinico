import React, { useState } from 'react';
import { Factura, Patient, Company, Servicio, NotificationLog } from '../data/mockData';
import { Receipt, XCircle, FileMinus, FilePlus, AlertCircle, RefreshCw, Eye, Search } from 'lucide-react';
import FacturaDetailView from './FacturaDetailView';
import AjusteFacturaModal from './AjusteFacturaModal';
import { notify } from './ui/Feedback';
import { MEDIO_PAGO_HACIENDA, colones } from '../utils/facturacion';
import { fechaCR } from '../utils/fechaCR';

interface FacturacionManagerProps {
  facturas: Factura[];
  patients: Patient[];
  company: Company;
  servicios: Servicio[];
  puedeAnular: boolean; // Administrador: anular y Notas de Crédito (el servidor también lo exige)
  soloLectura?: boolean; // Contador: solo ver, imprimir y reenviar por correo (sin anular, notas ni verificar)
  onAnularFactura: (idFactura: number, motivo: string) => Promise<{ factura: Factura; notaCredito: Factura | null }>;
  onEmitirNotaCredito: (idFactura: number, payload: { motivo: string; lineas: Array<{ idServicio: number; cantidad: number }> }) => Promise<Factura>;
  onEmitirNotaDebito: (idFactura: number, payload: { motivo: string; lineas: Array<{ idServicio: number; cantidad: number }>; medioPago?: string }) => Promise<Factura>;
  onVerificarEstadoFactura: (idFactura: number) => Promise<Factura>;
  onReenviarCorreo: (idFactura: number) => Promise<NotificationLog>;
}

const ESTADO_ESTILO: Record<string, string> = {
  FIRMADA: 'bg-slate-100 text-slate-700',
  ENVIADA: 'bg-amber-100 text-amber-800',
  ACEPTADA: 'bg-emerald-100 text-emerald-800',
  RECHAZADA: 'bg-rose-100 text-rose-800',
  ERROR: 'bg-rose-100 text-rose-800',
  ANULADA: 'bg-slate-200 text-slate-700',
  SIMULADA: 'bg-sky-100 text-sky-800'
};

const MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const nombreMes = (ym: string) => `${MESES_ES[parseInt(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

// Por qué una anulación no lleva Nota de Crédito, dicho en el estado concreto de la factura.
const MOTIVO_SIN_NOTA_CREDITO: Record<string, string> = {
  SIMULADA: 'es de prueba y nunca se envió a Hacienda',
  RECHAZADA: 'Hacienda la rechazó, así que nunca fue un comprobante válido',
  FIRMADA: 'nunca se envió a Hacienda'
};

// Máximo de <Razon> en el XSD v4.4 (RAZON_MAX en server/haciendaFactura.ts).
const MOTIVO_MAX = 180;

// Espejo de cantidadesAcreditadas() en server.ts: suma por servicio lo acreditado en Notas de Crédito
// que referencian la factura, sin contar las que Hacienda nunca recibió (ERROR) o rechazó. Si esa
// regla cambia en el servidor, tiene que cambiar aquí también.
function cantidadesAcreditadas(facturas: Factura[], idFactura: number): Record<number, number> {
  return facturas
    .filter(n => n.idFacturaReferencia === idFactura && n.tipoDocumento === '03' && n.estado !== 'ERROR' && n.estado !== 'RECHAZADA')
    .flatMap(n => n.lineas)
    .reduce<Record<number, number>>((acc, l) => {
      if (l.idServicio != null) acc[l.idServicio] = (acc[l.idServicio] || 0) + Number(l.cantidad);
      return acc;
    }, {});
}

function quedaPorAcreditar(f: Factura, acreditado: Record<number, number>): boolean {
  const vendido: Record<number, number> = {};
  for (const l of f.lineas) {
    if (l.idServicio == null) return true;
    vendido[l.idServicio] = (vendido[l.idServicio] || 0) + Number(l.cantidad);
  }
  return Object.entries(vendido).some(([id, cantidad]) => cantidad - (acreditado[Number(id)] || 0) > 1e-9);
}

/** "a", "a y b", "a, b y c". */
function unirFrases(partes: string[]): string {
  return partes.length <= 1 ? (partes[0] || '') : `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
}

// Lo que va a pasar al anular, dicho antes de confirmar — tiene que coincidir con lo que hace
// POST /api/facturas/:id/anular, porque la acción no se puede deshacer.
function explicacionAnulacion(f: Factura, acreditado: Record<number, number>): string {
  const pendiente = quedaPorAcreditar(f, acreditado);
  let inicio: string;
  if (f.estado === 'ACEPTADA') {
    inicio = pendiente
      ? 'Se emite y transmite a Hacienda una Nota de Crédito que anula esta factura'
      : 'No se emite otra Nota de Crédito: las anteriores ya acreditaron la factura completa. Se anula en el sistema';
  } else if (f.estado === 'ERROR') {
    inicio = 'Primero se consulta a Hacienda: si la tiene aceptada, se emite una Nota de Crédito; si nunca le llegó, se anula solo en el sistema';
  } else {
    inicio = `No se emite Nota de Crédito porque esta factura ${MOTIVO_SIN_NOTA_CREDITO[f.estado] || `no fue aceptada por Hacienda (estado ${f.estado})`}; se anula solo en el sistema`;
  }
  const efectos: string[] = [];
  if (pendiente && f.lineas.some(l => l.tipo === 'ARTICULO')) efectos.push('se reponen las existencias de los artículos facturados');
  if (f.condicionVenta === '02') efectos.push('se anula el saldo pendiente de cobro');
  if (f.idConsulta != null) efectos.push('se libera la consulta para volver a facturarla');
  return `${inicio}.${efectos.length ? ` Además, ${unirFrases(efectos)}.` : ''} No se puede deshacer.`;
}

export default function FacturacionManager({ facturas, patients, company, servicios, puedeAnular, soloLectura = false, onAnularFactura, onEmitirNotaCredito, onEmitirNotaDebito, onVerificarEstadoFactura, onReenviarCorreo }: FacturacionManagerProps) {
  const [anulandoId, setAnulandoId] = useState<number | null>(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState('');
  const [anulando, setAnulando] = useState(false);
  const [error, setError] = useState('');
  const [verificandoId, setVerificandoId] = useState<number | null>(null);
  const [viewingFactura, setViewingFactura] = useState<Factura | null>(null);
  const [ajustando, setAjustando] = useState<{ tipo: 'CREDITO' | 'DEBITO'; factura: Factura } | null>(null);
  const mesActual = fechaCR().slice(0, 7);
  const [mes, setMes] = useState(mesActual); // '' = todos los meses
  const [busqueda, setBusqueda] = useState('');

  const handleVerificarEstado = async (id: number) => {
    setVerificandoId(id);
    try {
      const actualizada = await onVerificarEstadoFactura(id);
      // El mensaje va primero: una Nota ACEPTADA puede traer el aviso de que su ajuste de inventario
      // o cuenta por cobrar hay que hacerlo a mano, y un "aceptado" verde lo escondería.
      if (actualizada.estado === 'RECHAZADA') notify.error(actualizada.mensajeError || 'Hacienda rechazó el comprobante.', 'Comprobante rechazado');
      else if (actualizada.mensajeError) notify.warning(actualizada.mensajeError, actualizada.estado === 'ACEPTADA' ? 'Aceptado — requiere ajuste manual' : undefined);
      else if (actualizada.estado === 'ACEPTADA') notify.success(`Hacienda aceptó el comprobante ${actualizada.consecutivo}.`);
      else notify.info('Hacienda todavía está procesando el comprobante. Vuelva a verificar en unos minutos.');
    } catch (err: any) {
      // Antes este error iba al recuadro del panel de anulación, que casi nunca está abierto.
      notify.error(err.message || 'No se pudo verificar el estado con Hacienda.');
    } finally {
      setVerificandoId(null);
    }
  };

  // Si el paciente no está en la lista cargada (p. ej. el Contador no carga pacientes), se usa el receptor que trae la factura.
  const nombrePaciente = (idPaciente: number, factura?: Factura) =>
    patients.find(p => p.id === idPaciente)?.nombreCompleto || factura?.receptorNombre || `Paciente #${idPaciente}`;
  const referenciaFactura = (idFacturaReferencia: number | null) => {
    if (idFacturaReferencia == null) return null;
    return facturas.find(f => f.id === idFacturaReferencia)?.consecutivo || `#${idFacturaReferencia}`;
  };

  const meses = Array.from(new Set([mesActual, ...facturas.map(f => f.fechaEmision.slice(0, 7))])).sort().reverse();
  const texto = busqueda.trim().toLowerCase();
  const delMes = facturas.filter(f => !mes || f.fechaEmision.startsWith(mes));
  const ordenadas = delMes
    .filter(f => !texto || f.consecutivo.includes(texto) || nombrePaciente(f.idPaciente, f).toLowerCase().includes(texto))
    .sort((a, b) => b.creadaEn.localeCompare(a.creadaEn));

  // Mismo criterio que el D-104 (SQL_FACTURA_DECLARABLE en server.ts): una factura anulada con Nota de
  // Crédito sigue contando en su mes y la Nota resta en el suyo; sin eso, la anulación restaría dos veces.
  const cuentaEnVentas = (f: Factura) =>
    f.estado === 'ACEPTADA' ||
    (f.tipoDocumento === '01' && f.estado === 'ANULADA' && facturas.some(nc => nc.idFacturaReferencia === f.id && nc.tipoDocumento === '03'));
  const resumen = delMes.reduce((acc, f) => {
    if (f.ambiente === 'PRODUCCION' && cuentaEnVentas(f)) {
      const signo = f.tipoDocumento === '03' ? -1 : 1;
      acc.ventas += signo * f.subtotal;
      acc.iva += signo * f.totalIva;
    }
    if (f.estado === 'ENVIADA' || f.estado === 'ERROR' || f.estado === 'FIRMADA') acc.porResolver++;
    if (f.estado === 'RECHAZADA') acc.rechazadas++;
    return acc;
  }, { ventas: 0, iva: 0, porResolver: 0, rechazadas: 0 });

  // Una Nota referencia la factura por su clave: solo tiene sentido sobre una que Hacienda aceptó.
  // soloLectura (rol Contador): nunca se ofrecen ajustes, anulación ni consultas a Hacienda.
  const puedeAjustar = (f: Factura) => !soloLectura && f.tipoDocumento === '01' && f.estado === 'ACEPTADA';
  // Anular sirve para cualquier factura (también rechazadas o de prueba, que antes no tenían forma
  // de reversarse), salvo mientras Hacienda la procesa: primero hay que verificar su estado.
  const puedeAnularFactura = (f: Factura) => !soloLectura && puedeAnular && f.tipoDocumento === '01' && f.estado !== 'ANULADA' && f.estado !== 'ENVIADA';
  const puedeVerificar = (f: Factura) => !soloLectura && (f.estado === 'ENVIADA' || f.estado === 'ERROR');

  const handleConfirmarAnular = async (id: number) => {
    if (!motivoAnulacion.trim()) {
      setError('Indique el motivo de la anulación.');
      return;
    }
    setAnulando(true);
    setError('');
    try {
      const { factura, notaCredito } = await onAnularFactura(id, motivoAnulacion.trim());
      notify.success(notaCredito
        ? `Factura ${factura.consecutivo} anulada con la Nota de Crédito ${notaCredito.consecutivo} (${notaCredito.estado}).`
        : `Factura ${factura.consecutivo} anulada en el sistema, sin Nota de Crédito.`);
      setAnulandoId(null);
      setMotivoAnulacion('');
    } catch (err: any) {
      setError(err.message || 'No se pudo anular la factura.');
    } finally {
      setAnulando(false);
    }
  };

  const botonIcono = 'w-10 h-10 flex items-center justify-center rounded-lg transition-colors disabled:opacity-50';

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
      <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
        <Receipt className="w-5 h-5 text-slate-500" aria-hidden="true" />
        <div>
          <h3 className="text-sm font-bold text-slate-800">Facturación Electrónica</h3>
          <p className="text-[11px] text-slate-600">Facturas y notas de crédito y débito transmitidas a Hacienda</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <div>
          <label htmlFor="facturacion-mes" className="sr-only">Mes</label>
          <select id="facturacion-mes" value={mes} onChange={(e) => setMes(e.target.value)} className="w-full sm:w-auto min-h-10 bg-slate-50 border border-slate-200 rounded-lg px-2.5 text-xs text-slate-800 capitalize">
            {meses.map(m => <option key={m} value={m}>{nombreMes(m)}{m === mesActual ? ' (actual)' : ''}</option>)}
            <option value="">Todos los meses</option>
          </select>
        </div>
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <label htmlFor="facturacion-buscar" className="sr-only">Buscar por consecutivo o cliente</label>
          <input id="facturacion-buscar" type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por consecutivo o cliente…" className="w-full min-h-10 bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-2.5 text-xs text-slate-800" />
        </div>
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
          <dt className="text-[11px] font-bold text-slate-600 uppercase">Ventas netas</dt>
          <dd className="text-sm font-bold text-slate-900 tabular-nums">{colones(resumen.ventas)}</dd>
          <dd className="text-[11px] text-slate-600">sin IVA, aceptadas</dd>
        </div>
        <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
          <dt className="text-[11px] font-bold text-slate-600 uppercase">IVA cobrado</dt>
          <dd className="text-sm font-bold text-slate-900 tabular-nums">{colones(resumen.iva)}</dd>
          <dd className="text-[11px] text-slate-600">débito fiscal</dd>
        </div>
        <div className={`p-2.5 rounded-xl border ${resumen.porResolver ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
          <dt className="text-[11px] font-bold text-slate-600 uppercase">Por resolver</dt>
          <dd className="text-sm font-bold text-slate-900 tabular-nums">{resumen.porResolver}</dd>
          <dd className="text-[11px] text-slate-600">sin respuesta de Hacienda</dd>
        </div>
        <div className={`p-2.5 rounded-xl border ${resumen.rechazadas ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'}`}>
          <dt className="text-[11px] font-bold text-slate-600 uppercase">Rechazadas</dt>
          <dd className="text-sm font-bold text-slate-900 tabular-nums">{resumen.rechazadas}</dd>
          <dd className="text-[11px] text-slate-600">corregir y reemitir</dd>
        </div>
      </dl>

      {ordenadas.length === 0 && (
        <p className="text-slate-600 text-xs text-center py-6">
          {facturas.length === 0 ? 'Todavía no se ha emitido ninguna factura.' : 'No hay comprobantes con este filtro.'}
        </p>
      )}

      <ul className="space-y-1.5">
        {ordenadas.map(f => {
          const esNotaCredito = f.tipoDocumento === '03';
          const esNotaDebito = f.tipoDocumento === '02';
          const esNota = esNotaCredito || esNotaDebito;
          const tipoTexto = esNotaCredito ? 'Nota de Crédito' : esNotaDebito ? 'Nota de Débito' : 'Factura';
          return (
            <li key={f.id} className="p-2.5 bg-white border border-slate-200 rounded-lg">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-semibold text-slate-800 inline-flex items-center gap-1.5 text-xs">
                    {esNotaCredito ? <FileMinus className="w-3.5 h-3.5 text-rose-600" aria-hidden="true" /> : esNotaDebito ? <FilePlus className="w-3.5 h-3.5 text-amber-700" aria-hidden="true" /> : <Receipt className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />}
                    {tipoTexto} {f.consecutivo}
                  </span>
                  <span className="text-[11px] text-slate-600 block truncate">
                    {nombrePaciente(f.idPaciente, f)} &middot; {new Date(f.fechaEmision).toLocaleString('es-CR')} &middot;{' '}
                    <span className={`font-semibold tabular-nums ${esNotaCredito ? 'text-rose-700' : 'text-slate-800'}`}>{esNotaCredito ? '−' : ''}{colones(f.total)}</span>
                    {f.condicionVenta === '02' ? ' · Crédito' : !esNotaCredito ? ` · ${MEDIO_PAGO_HACIENDA[f.medioPago] || f.medioPago}` : ''}
                    {!esNota && f.montoRecibido != null && ` · Vuelto ${colones(f.montoRecibido - f.total)}`}
                  </span>
                  {esNota && f.idFacturaReferencia != null && (
                    <span className="text-[11px] text-slate-600 block">{esNotaCredito ? 'Ajusta' : 'Debita'} factura {referenciaFactura(f.idFacturaReferencia)}{f.motivoAnulacion ? ` — ${f.motivoAnulacion}` : ''}</span>
                  )}
                  {!esNota && f.estado === 'ANULADA' && f.motivoAnulacion && (
                    <span className="text-[11px] text-slate-600 block truncate" title={f.motivoAnulacion}>Anulada — {f.motivoAnulacion}</span>
                  )}
                  {f.mensajeError && f.estado !== 'SIMULADA' && (
                    <span className={`text-[11px] block truncate ${f.estado === 'ERROR' || f.estado === 'RECHAZADA' ? 'text-rose-700' : 'text-amber-800'}`} title={f.mensajeError}>{f.mensajeError}</span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full mr-1 ${ESTADO_ESTILO[f.estado] || 'bg-slate-100 text-slate-700'}`}>
                    {f.estado}
                  </span>
                  <button
                    type="button"
                    onClick={() => setViewingFactura(f)}
                    title="Ver, imprimir o reenviar"
                    className={`${botonIcono} text-slate-600 hover:bg-slate-100`}
                    aria-label={`Ver, imprimir o reenviar ${tipoTexto} ${f.consecutivo}`}
                  >
                    <Eye className="w-4 h-4" aria-hidden="true" />
                  </button>
                  {puedeVerificar(f) && (
                    <button
                      type="button"
                      onClick={() => handleVerificarEstado(f.id)}
                      disabled={verificandoId === f.id}
                      title="Verificar estado con Hacienda"
                      className={`${botonIcono} text-amber-700 hover:bg-amber-50`}
                      aria-label={`Verificar estado con Hacienda de ${tipoTexto} ${f.consecutivo}`}
                    >
                      <RefreshCw className={`w-4 h-4 ${verificandoId === f.id ? 'animate-spin' : ''}`} aria-hidden="true" />
                    </button>
                  )}
                  {/* Una Nota de Crédito puede acreditar todo lo vendido (equivale a anular): mismo permiso. */}
                  {puedeAjustar(f) && puedeAnular && (
                    <button
                      type="button"
                      onClick={() => setAjustando({ tipo: 'CREDITO', factura: f })}
                      title="Emitir nota de crédito parcial"
                      className={`${botonIcono} text-indigo-600 hover:bg-indigo-50`}
                      aria-label={`Emitir nota de crédito parcial sobre la factura ${f.consecutivo}`}
                    >
                      <FileMinus className="w-4 h-4" aria-hidden="true" />
                    </button>
                  )}
                  {puedeAjustar(f) && (
                    <button
                      type="button"
                      onClick={() => setAjustando({ tipo: 'DEBITO', factura: f })}
                      title="Emitir nota de débito"
                      className={`${botonIcono} text-amber-700 hover:bg-amber-50`}
                      aria-label={`Emitir nota de débito sobre la factura ${f.consecutivo}`}
                    >
                      <FilePlus className="w-4 h-4" aria-hidden="true" />
                    </button>
                  )}
                  {puedeAnularFactura(f) && (
                    <button
                      type="button"
                      onClick={() => { setAnulandoId(f.id); setMotivoAnulacion(''); setError(''); }}
                      title="Anular factura"
                      className={`${botonIcono} text-rose-600 hover:bg-rose-50`}
                      aria-label={`Anular la factura ${f.consecutivo}`}
                    >
                      <XCircle className="w-4 h-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>

              {anulandoId === f.id && (
                <div className="mt-2.5 pt-2.5 border-t border-slate-100 space-y-2">
                  {error && (
                    <div role="alert" className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[11px] flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>{error}</span>
                    </div>
                  )}
                  <p className="text-[11px] text-slate-600">
                    {explicacionAnulacion(f, cantidadesAcreditadas(facturas, f.id))}
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                    <div className="flex-1">
                      <label htmlFor={`motivo-anulacion-${f.id}`} className="block text-slate-600 font-medium mb-1 text-[11px]">Motivo de la anulación *</label>
                      <input
                        id={`motivo-anulacion-${f.id}`}
                        type="text"
                        maxLength={MOTIVO_MAX}
                        value={motivoAnulacion}
                        onChange={(e) => setMotivoAnulacion(e.target.value)}
                        placeholder="ej: Error en el monto facturado"
                        className="w-full min-h-10 bg-slate-50 border border-slate-200 rounded-lg px-2.5 text-xs text-slate-800"
                      />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => setAnulandoId(null)}
                        className="min-h-10 px-3 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleConfirmarAnular(f.id)}
                        disabled={anulando}
                        className="min-h-10 px-3 rounded-lg text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-60"
                      >
                        {anulando ? 'Anulando…' : 'Confirmar anulación'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {viewingFactura && (() => {
        // El Contador no carga pacientes (datos clínicos): se muestra un receptor genérico, sin datos personales.
        const pacienteFactura = patients.find(p => p.id === viewingFactura.idPaciente)
          ?? (soloLectura ? ({ id: viewingFactura.idPaciente, nombreCompleto: viewingFactura.receptorNombre || `Receptor #${viewingFactura.idPaciente}`, identificacion: viewingFactura.receptorIdentificacion || '—', tipoIdentificacion: viewingFactura.receptorTipoIdentificacion || '', correoElectronico: '' } as Patient) : undefined);
        if (!pacienteFactura) return null;
        return (
          <FacturaDetailView
            factura={viewingFactura}
            patient={pacienteFactura}
            company={company}
            referencia={referenciaFactura(viewingFactura.idFacturaReferencia)}
            onClose={() => setViewingFactura(null)}
            onReenviarCorreo={onReenviarCorreo}
          />
        );
      })()}

      {ajustando && (
        <AjusteFacturaModal
          tipo={ajustando.tipo}
          factura={ajustando.factura}
          servicios={servicios}
          ivaPorDefecto={company.ivaPorDefecto}
          yaAcreditado={cantidadesAcreditadas(facturas, ajustando.factura.id)}
          motivoMax={MOTIVO_MAX}
          onEmitir={ajustando.tipo === 'CREDITO' ? onEmitirNotaCredito : onEmitirNotaDebito}
          onClose={() => setAjustando(null)}
          themeColor={company.colorPrimario}
        />
      )}
    </div>
  );
}
