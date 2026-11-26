import React, { useEffect, useRef, useState } from 'react';
import { Factura, Patient, Company, Servicio, NotificationLog } from '../data/mockData';
import { Receipt, XCircle, FileMinus, FilePlus, AlertCircle, RefreshCw, Eye, Search, FileText, Clock, RotateCcw, Send, Loader2, Ticket } from 'lucide-react';
import { PageHeader } from './ui/PageHeader';
import { StatCard } from './ui/StatCard';
import { Card } from './ui/Card';
import { Badge, type BadgeTone } from './ui/Badge';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { EmptyState } from './ui/EmptyState';
import FacturaDetailView from './FacturaDetailView';
import AjusteFacturaModal from './AjusteFacturaModal';
import { notify, confirmar } from './ui/Feedback';
import { colones, useCatalogosHacienda, textoMediosPago, nombreComprobante } from '../utils/facturacion';
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
  // Administrador: comprobante RECHAZADO → consecutivo, clave y fecha nuevos (POST /reintentar-clave-nueva).
  onReintentarClaveNueva?: (idFactura: number) => Promise<Factura>;
  // Administrador: comprobante en ERROR → vuelve a la cola con el mismo XML firmado (POST /reintentar-envio).
  onReintentarEnvio?: (idFactura: number) => Promise<Factura>;
  // Recarga la lista (mientras haya comprobantes en cola o en proceso se refresca sola).
  onRecargar?: () => Promise<void>;
}

const ESTADO_TONO: Record<string, BadgeTone> = {
  PENDIENTE: 'warning',
  FIRMADA: 'neutral',
  ENVIADA: 'warning',
  ACEPTADA: 'success',
  RECHAZADA: 'danger',
  ERROR: 'danger',
  ANULADA: 'neutral',
  SIMULADA: 'info'
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

// Cada cuánto se refresca la lista mientras haya comprobantes en cola o en proceso en Hacienda.
// Es solo de la pantalla (la cola real corre en el servidor con su intervalo de parametros_sistema).
const REFRESCO_PANTALLA_MS = 30_000;

export default function FacturacionManager({ facturas, patients, company, servicios, puedeAnular, soloLectura = false, onAnularFactura, onEmitirNotaCredito, onEmitirNotaDebito, onVerificarEstadoFactura, onReenviarCorreo, onReintentarClaveNueva, onReintentarEnvio, onRecargar }: FacturacionManagerProps) {
  const { catalogos } = useCatalogosHacienda();
  const [reintentandoId, setReintentandoId] = useState<number | null>(null);
  const hayEnProceso = facturas.some(f => f.estado === 'PENDIENTE' || f.estado === 'ENVIADA');
  // Ref: el padre crea la función en cada render y eso reiniciaría el intervalo.
  const recargarRef = useRef(onRecargar);
  recargarRef.current = onRecargar;
  useEffect(() => {
    if (!hayEnProceso) return;
    const t = setInterval(() => { recargarRef.current?.().catch(() => {}); }, REFRESCO_PANTALLA_MS);
    return () => clearInterval(t);
  }, [hayEnProceso]);
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
      else if (actualizada.estado === 'PENDIENTE') notify.info('El comprobante sigue en cola de envío; el sistema lo transmitirá automáticamente.');
      else notify.info('Hacienda todavía está procesando el comprobante. Vuelva a verificar en unos minutos.');
    } catch (err: any) {
      // Antes este error iba al recuadro del panel de anulación, que casi nunca está abierto.
      notify.error(err.message || 'No se pudo verificar el estado con Hacienda.');
    } finally {
      setVerificandoId(null);
    }
  };

  const handleReintentar = async (f: Factura, tipo: 'CLAVE_NUEVA' | 'ENVIO') => {
    const accion = tipo === 'CLAVE_NUEVA' ? onReintentarClaveNueva : onReintentarEnvio;
    if (!accion) return;
    const ok = await confirmar(tipo === 'CLAVE_NUEVA'
      ? {
          title: '¿Reintentar con clave nueva?',
          message: `Se emite de nuevo el ${nombreComprobante(f.tipoDocumento).toLowerCase()} ${f.consecutivo} con un consecutivo, una clave y una fecha nuevos, y se transmite a Hacienda. Úselo solo después de corregir la causa del rechazo. La clave rechazada queda en el historial.`,
          confirmText: 'Reintentar con clave nueva',
          tone: 'warning'
        }
      : {
          title: '¿Reintentar el envío?',
          message: `El ${nombreComprobante(f.tipoDocumento).toLowerCase()} ${f.consecutivo} vuelve a la cola con el mismo comprobante firmado. Si su envío fue incierto, primero se consulta a Hacienda.`,
          confirmText: 'Reintentar envío'
        });
    if (!ok) return;
    setReintentandoId(f.id);
    try {
      const r = await accion(f.id);
      if (r.estado === 'ACEPTADA') notify.success(`Hacienda aceptó el comprobante ${r.consecutivo}.`);
      else if (r.estado === 'RECHAZADA' || r.estado === 'ERROR') notify.error(r.mensajeError || 'Hacienda no aceptó el comprobante.', `Comprobante ${r.estado.toLowerCase()}`);
      else notify.info(`Comprobante ${r.consecutivo}: ${r.estado === 'PENDIENTE' ? 'en cola de envío' : 'Hacienda lo está procesando'}.`);
    } catch (err: any) {
      notify.error(err.message || 'No se pudo reintentar.');
    } finally {
      setReintentandoId(null);
    }
  };

  // Si el paciente no está en la lista cargada (p. ej. el Contador no carga pacientes), se usa el receptor que trae la factura.
  const nombrePaciente = (idPaciente: number, factura?: Factura) => {
    const paciente = patients.find(p => p.id === idPaciente)?.nombreCompleto || factura?.pacienteNombre || null;
    if (factura?.receptorEsTercero) return `${factura.receptorNombre}${paciente ? ` · paciente ${paciente}` : ''}`;
    return paciente || factura?.receptorNombre || `Paciente #${idPaciente}`;
  };
  const referenciaFactura = (idFacturaReferencia: number | null) => {
    if (idFacturaReferencia == null) return null;
    const original = facturas.find(f => f.id === idFacturaReferencia);
    return original ? `${nombreComprobante(original.tipoDocumento).toLowerCase()} ${original.consecutivo}` : `#${idFacturaReferencia}`;
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
    ((f.tipoDocumento === '01' || f.tipoDocumento === '04') && f.estado === 'ANULADA' && facturas.some(nc => nc.idFacturaReferencia === f.id && nc.tipoDocumento === '03'));
  const resumen = delMes.reduce((acc, f) => {
    if (f.ambiente === 'PRODUCCION' && cuentaEnVentas(f)) {
      const signo = f.tipoDocumento === '03' ? -1 : 1;
      acc.ventas += signo * f.subtotal;
      acc.iva += signo * f.totalIva;
    }
    if (f.estado === 'PENDIENTE' || f.estado === 'ENVIADA' || f.estado === 'ERROR' || f.estado === 'FIRMADA') acc.porResolver++;
    if (f.estado === 'RECHAZADA') acc.rechazadas++;
    return acc;
  }, { ventas: 0, iva: 0, porResolver: 0, rechazadas: 0 });

  // Una Nota referencia la factura por su clave: solo tiene sentido sobre una que Hacienda aceptó.
  // soloLectura (rol Contador): nunca se ofrecen ajustes, anulación ni consultas a Hacienda.
  const esVenta = (f: Factura) => f.tipoDocumento === '01' || f.tipoDocumento === '04';
  const puedeAjustar = (f: Factura) => !soloLectura && esVenta(f) && f.estado === 'ACEPTADA';
  // Anular sirve para cualquier factura o tiquete (también rechazados o de prueba), salvo mientras
  // Hacienda lo procesa o está en cola: primero hay que consultar su estado.
  const puedeAnularFactura = (f: Factura) => !soloLectura && puedeAnular && esVenta(f) && f.estado !== 'ANULADA' && f.estado !== 'ENVIADA' && f.estado !== 'PENDIENTE';
  const puedeVerificar = (f: Factura) => !soloLectura && (f.estado === 'ENVIADA' || f.estado === 'ERROR' || f.estado === 'PENDIENTE');
  const puedeReintentarClave = (f: Factura) => !soloLectura && puedeAnular && !!onReintentarClaveNueva && f.estado === 'RECHAZADA';
  const puedeReintentarEnvio = (f: Factura) => !soloLectura && puedeAnular && !!onReintentarEnvio && f.estado === 'ERROR';

  const handleConfirmarAnular = async (id: number) => {
    if (!motivoAnulacion.trim()) {
      setError('Indique el motivo de la anulación.');
      return;
    }
    setAnulando(true);
    setError('');
    try {
      const { factura, notaCredito, aviso } = await onAnularFactura(id, motivoAnulacion.trim()) as { factura: Factura; notaCredito: Factura | null; aviso?: string };
      if (aviso) notify.warning(aviso, 'Nota de Crédito en cola');
      else notify.success(notaCredito
        ? `${nombreComprobante(factura.tipoDocumento)} ${factura.consecutivo} anulado con la Nota de Crédito ${notaCredito.consecutivo} (${notaCredito.estado}).`
        : `${nombreComprobante(factura.tipoDocumento)} ${factura.consecutivo} anulado en el sistema, sin Nota de Crédito.`);
      setAnulandoId(null);
      setMotivoAnulacion('');
    } catch (err: any) {
      setError(err.message || 'No se pudo anular la factura.');
    } finally {
      setAnulando(false);
    }
  };

  const botonIcono = 'w-11 h-11 flex items-center justify-center rounded-control transition-colors disabled:opacity-50';
  // Tarjetas de resumen en móvil: menos relleno y monto que puede bajar de línea
  const STAT_MOVIL = 'min-w-0 max-sm:p-3.5 [&_.text-title]:break-words max-sm:[&_.text-title]:text-heading';

  return (
    <div>
      <PageHeader
        title="Facturación electrónica"
        description="Facturas y notas de crédito y débito transmitidas a Hacienda"
      />

      {/* minmax(0,1fr) + montos que pueden bajar de línea: sin scroll horizontal a 360px */}
      <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] lg:grid-cols-4 gap-3 mb-5">
        <StatCard label="Ventas netas" value={colones(resumen.ventas)} icon={<Receipt />} delta={{ value: 'sin IVA, aceptadas' }} className={STAT_MOVIL} />
        <StatCard label="IVA cobrado" value={colones(resumen.iva)} icon={<FileText />} delta={{ value: 'débito fiscal' }} className={STAT_MOVIL} />
        <StatCard
          label="Por resolver"
          value={resumen.porResolver}
          icon={<Clock />}
          className={`${STAT_MOVIL} ${resumen.porResolver ? 'bg-warning-soft border-warning/30' : ''}`}
          delta={{ value: 'sin respuesta de Hacienda' }}
        />
        <StatCard
          label="Rechazadas"
          value={resumen.rechazadas}
          icon={<AlertCircle />}
          className={`${STAT_MOVIL} ${resumen.rechazadas ? 'bg-danger-soft border-danger/30' : ''}`}
          delta={{ value: 'corregir y reemitir', trend: resumen.rechazadas ? 'down' : 'neutral' }}
        />
      </div>

      <Card>
        <div className="flex flex-col sm:flex-row gap-2 p-4 border-b border-border">
          <div className="sm:w-56">
            <label htmlFor="facturacion-mes" className="sr-only">Mes</label>
            <Select id="facturacion-mes" value={mes} onChange={(e: any) => setMes(e.target.value)} className="capitalize">
              {meses.map(m => <option key={m} value={m}>{nombreMes(m)}{m === mesActual ? ' (actual)' : ''}</option>)}
              <option value="">Todos los meses</option>
            </Select>
          </div>
          <div className="flex-1">
            <label htmlFor="facturacion-buscar" className="sr-only">Buscar por consecutivo o cliente</label>
            <Input id="facturacion-buscar" type="search" leadingIcon={<Search />} value={busqueda} onChange={(e: any) => setBusqueda(e.target.value)} placeholder="Buscar por consecutivo o cliente…" />
          </div>
        </div>

        {ordenadas.length === 0 && (
          <EmptyState
            icon={<Receipt />}
            title={facturas.length === 0 ? 'Todavía no hay facturas' : 'Sin resultados'}
            description={facturas.length === 0 ? 'Todavía no se ha emitido ninguna factura.' : 'No hay comprobantes con este filtro.'}
          />
        )}

        <ul className="divide-y divide-border">
        {ordenadas.map(f => {
          const esNotaCredito = f.tipoDocumento === '03';
          const esNotaDebito = f.tipoDocumento === '02';
          const esNota = esNotaCredito || esNotaDebito;
          const tipoTexto = nombreComprobante(f.tipoDocumento);
          return (
            <li key={f.id} className="p-4 hover:bg-surface-muted/40 transition-colors">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <span className="font-semibold text-fg inline-flex items-center gap-1.5 text-body">
                    {esNotaCredito ? <FileMinus className="w-4 h-4 text-danger" aria-hidden="true" /> : esNotaDebito ? <FilePlus className="w-4 h-4 text-warning" aria-hidden="true" /> : f.tipoDocumento === '04' ? <Ticket className="w-4 h-4 text-fg-subtle" aria-hidden="true" /> : <Receipt className="w-4 h-4 text-fg-subtle" aria-hidden="true" />}
                    {tipoTexto} {f.consecutivo}
                  </span>
                  <span className="text-xs text-fg-muted block break-words sm:truncate">
                    {nombrePaciente(f.idPaciente, f)} &middot; {new Date(f.fechaEmision).toLocaleString('es-CR')}
                    {f.condicionVenta === '02' ? ' · Crédito' : !esNotaCredito ? ` · ${textoMediosPago(f, catalogos)}` : ''}
                    {!esNota && f.montoRecibido != null && ` · Vuelto ${colones(f.montoRecibido - f.total)}`}
                  </span>
                  {esNota && f.idFacturaReferencia != null && (
                    <span className="text-xs text-fg-muted block">{esNotaCredito ? 'Ajusta' : 'Debita'} {referenciaFactura(f.idFacturaReferencia)}{f.motivoAnulacion ? ` — ${f.motivoAnulacion}` : ''}</span>
                  )}
                  {!esNota && f.estado === 'ANULADA' && f.motivoAnulacion && (
                    <span className="text-xs text-fg-muted block truncate" title={f.motivoAnulacion}>Anulada — {f.motivoAnulacion}</span>
                  )}
                  {f.estado === 'PENDIENTE' && (
                    <span className="text-xs block text-warning">
                      En cola de envío · intento {f.haciendaIntentos ?? 0}
                      {f.haciendaProximoIntento ? ` · próximo ${new Date(f.haciendaProximoIntento).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })}` : ''}
                    </span>
                  )}
                  {f.mensajeError && f.estado !== 'SIMULADA' && (
                    <span className={`text-xs block truncate ${f.estado === 'ERROR' || f.estado === 'RECHAZADA' ? 'text-danger' : 'text-warning'}`} title={[f.mensajeError, f.haciendaErrorDetalle].filter(Boolean).join(' — ')}>{f.mensajeError}</span>
                  )}
                  {f.correoError && !f.correoEnviado && (
                    <span className="text-xs block truncate text-fg-muted" title={f.correoError}>Correo: {f.correoError}</span>
                  )}
                </div>
                {/* flex-wrap: en móvil los botones bajan a otra fila en vez de desbordar */}
                <div className="flex flex-wrap items-center lg:justify-end gap-x-3 gap-y-1 lg:shrink-0">
                  <span className={`text-body font-semibold tabular-nums text-right lg:min-w-28 ${esNotaCredito ? 'text-danger' : 'text-fg'}`}>{esNotaCredito ? '−' : ''}{colones(f.total)}</span>
                  <Badge tone={ESTADO_TONO[f.estado] || 'neutral'}>
                    {f.estado === 'PENDIENTE'
                      ? <span className="inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />EN COLA</span>
                      : f.estado}
                  </Badge>
                  <div className="flex items-center gap-0.5 ml-auto lg:ml-0 -mr-2 lg:mr-0">
                  <button
                    type="button"
                    onClick={() => setViewingFactura(f)}
                    title="Ver, imprimir o reenviar"
                    className={`${botonIcono} text-fg-muted hover:bg-surface-muted`}
                    aria-label={`Ver, imprimir o reenviar ${tipoTexto} ${f.consecutivo}`}
                  >
                    <Eye className="w-4 h-4" aria-hidden="true" />
                  </button>
                  {puedeVerificar(f) && (
                    <button
                      type="button"
                      onClick={() => handleVerificarEstado(f.id)}
                      disabled={verificandoId === f.id}
                      title="Consultar estado en Hacienda"
                      className={`${botonIcono} text-warning hover:bg-warning-soft`}
                      aria-label={`Consultar estado en Hacienda de ${tipoTexto} ${f.consecutivo}`}
                    >
                      <RefreshCw className={`w-4 h-4 ${verificandoId === f.id ? 'animate-spin' : ''}`} aria-hidden="true" />
                    </button>
                  )}
                  {puedeReintentarEnvio(f) && (
                    <button
                      type="button"
                      onClick={() => handleReintentar(f, 'ENVIO')}
                      disabled={reintentandoId === f.id}
                      title="Reintentar envío (mismo comprobante firmado)"
                      className={`${botonIcono} text-brand-ink hover:bg-brand-soft`}
                      aria-label={`Reintentar el envío de ${tipoTexto} ${f.consecutivo}`}
                    >
                      <Send className={`w-4 h-4 ${reintentandoId === f.id ? 'animate-pulse' : ''}`} aria-hidden="true" />
                    </button>
                  )}
                  {puedeReintentarClave(f) && (
                    <button
                      type="button"
                      onClick={() => handleReintentar(f, 'CLAVE_NUEVA')}
                      disabled={reintentandoId === f.id}
                      title="Reintentar con clave nueva"
                      className={`${botonIcono} text-warning hover:bg-warning-soft`}
                      aria-label={`Reintentar con clave nueva ${tipoTexto} ${f.consecutivo}`}
                    >
                      <RotateCcw className={`w-4 h-4 ${reintentandoId === f.id ? 'animate-spin' : ''}`} aria-hidden="true" />
                    </button>
                  )}
                  {/* Una Nota de Crédito puede acreditar todo lo vendido (equivale a anular): mismo permiso. */}
                  {puedeAjustar(f) && puedeAnular && (
                    <button
                      type="button"
                      onClick={() => setAjustando({ tipo: 'CREDITO', factura: f })}
                      title="Emitir nota de crédito parcial"
                      className={`${botonIcono} text-brand-ink hover:bg-brand-soft`}
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
                      className={`${botonIcono} text-warning hover:bg-warning-soft`}
                      aria-label={`Emitir nota de débito sobre la factura ${f.consecutivo}`}
                    >
                      <FilePlus className="w-4 h-4" aria-hidden="true" />
                    </button>
                  )}
                  {puedeAnularFactura(f) && (
                    <button
                      type="button"
                      onClick={() => { setAnulandoId(f.id); setMotivoAnulacion(''); setError(''); }}
                      title={`Anular ${tipoTexto.toLowerCase()}`}
                      className={`${botonIcono} text-danger hover:bg-danger-soft`}
                      aria-label={`Anular ${tipoTexto.toLowerCase()} ${f.consecutivo}`}
                    >
                      <XCircle className="w-4 h-4" aria-hidden="true" />
                    </button>
                  )}
                  </div>
                </div>
              </div>

              {anulandoId === f.id && (
                <div className="mt-3 pt-3 border-t border-border space-y-3 animate-slide-down">
                  {error && (
                    <div role="alert" className="p-2.5 rounded-control bg-danger-soft border border-danger/20 text-danger text-xs flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>{error}</span>
                    </div>
                  )}
                  <p className="text-xs text-fg-muted">
                    {explicacionAnulacion(f, cantidadesAcreditadas(facturas, f.id))}
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                    <div className="flex-1">
                      <label htmlFor={`motivo-anulacion-${f.id}`} className="block text-fg font-semibold mb-1.5 text-xs">Motivo de la anulación *</label>
                      <Input
                        id={`motivo-anulacion-${f.id}`}
                        type="text"
                        maxLength={MOTIVO_MAX}
                        value={motivoAnulacion}
                        onChange={(e: any) => setMotivoAnulacion(e.target.value)}
                        placeholder="ej: Error en el monto facturado"
                      />
                    </div>
                    <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
                      <Button variant="ghost" onClick={() => setAnulandoId(null)}>Cancelar</Button>
                      <Button variant="danger" onClick={() => handleConfirmarAnular(f.id)} disabled={anulando}>
                        {anulando ? 'Anulando…' : 'Confirmar anulación'}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </li>
          );
        })}
        </ul>
      </Card>

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
