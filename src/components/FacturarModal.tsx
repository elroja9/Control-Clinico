import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Servicio, Factura, ReceptorFacturaGuardado } from '../data/mockData';
import { Receipt, AlertCircle, Check, Loader2, Plus, Trash2, Search, Clock } from 'lucide-react';
import { colones, useCatalogosHacienda, identificacionValidaParaFactura, nombreComprobante } from '../utils/facturacion';
import { errorIdentificacion } from '../utils/identificacion';
import { Button } from './ui/Button';
import { ResponsiveModal } from './ui/ResponsiveModal';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { SegmentedControl } from './ui/SegmentedControl';

/** Receptor que va en la solicitud: el paciente o un tercero (nuevo o guardado). */
export type ReceptorSolicitud =
  | { modo: 'PACIENTE' }
  | { modo: 'TERCERO'; idReceptorGuardado?: number; tipoIdentificacion?: string; numero?: string; nombre?: string; correo?: string; telefono?: string; codigoActividad?: string; guardar?: boolean };

export interface PayloadCrearFactura {
  idCompania: number;
  idCita: number | null;
  idConsulta: number | null;
  idPaciente: number;
  condicionVenta: string;
  medioPago: string;
  mediosPago?: Array<{ tipo: string; monto: number }>;
  montoRecibido: number | null;
  plazoCreditoDias: number | null;
  modoPrueba: boolean;
  lineas: Array<{ idServicio: number; cantidad: number; descuento?: number }>;
  codigoDescuento?: string;
  naturalezaDescuento?: string;
  receptor?: ReceptorSolicitud;
  copiaPaciente?: boolean;
}

interface FacturarModalProps {
  idCompania: number;
  idPaciente: number;
  idCita: number | null;
  idConsulta?: number | null;
  nombrePaciente: string;
  // Identificación y correo del paciente: solo para avisar si saldrá Tiquete (el servidor decide).
  paciente?: { tipoIdentificacion?: string | null; identificacion?: string | null; correoElectronico?: string | null } | null;
  servicios: Servicio[];
  ivaPorDefecto: number;
  plazoCreditoDefecto?: number; // Personalizar › Parámetros contables; editable en cada factura
  cantidadesIniciales?: Record<number, number>;
  onCrearFactura: (payload: PayloadCrearFactura) => Promise<Factura>;
  onVerificarEstadoFactura: (idFactura: number) => Promise<Factura>;
  onClose: () => void;
  themeColor: string;
  etiquetaPersona?: string;
}

const TIPOS_ID_TERCERO = [
  { value: '02', label: 'Cédula jurídica' },
  { value: '01', label: 'Cédula física' },
  { value: '03', label: 'DIMEX' },
  { value: '04', label: 'NITE' },
  { value: 'EXT', label: 'Extranjero sin identificación CR (tiquete)' }
];

interface FilaPago { tipo: string; monto: string }

const redondear2 = (n: number) => Math.round(n * 100) / 100;

export default function FacturarModal({
  idCompania,
  idPaciente,
  idCita,
  idConsulta,
  nombrePaciente,
  paciente,
  servicios,
  ivaPorDefecto,
  plazoCreditoDefecto,
  cantidadesIniciales,
  onCrearFactura,
  onVerificarEstadoFactura,
  onClose,
  themeColor,
  etiquetaPersona = 'Paciente'
}: FacturarModalProps) {
  const { catalogos, error: errorCatalogos } = useCatalogosHacienda();
  const [cantidades, setCantidades] = useState<Record<number, number>>(cantidadesIniciales || {});
  const [descuentos, setDescuentos] = useState<Record<number, string>>({});
  const [codigoDescuento, setCodigoDescuento] = useState('');
  // Con el código 99 ("otros") Hacienda exige describir la naturaleza del descuento (máx. 80).
  const [naturalezaDescuento, setNaturalezaDescuento] = useState('');
  const [condicion, setCondicion] = useState('01');
  const [plazo, setPlazo] = useState(plazoCreditoDefecto != null ? String(plazoCreditoDefecto) : '');
  const [pagos, setPagos] = useState<FilaPago[]>([{ tipo: '01', monto: '' }]);
  const [montoRecibido, setMontoRecibido] = useState('');
  const [modoPrueba, setModoPrueba] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState<Factura | null>(null);

  // --- Receptor ---
  const [modoReceptor, setModoReceptor] = useState<'PACIENTE' | 'TERCERO'>('PACIENTE');
  const [guardados, setGuardados] = useState<ReceptorFacturaGuardado[]>([]);
  const [idGuardado, setIdGuardado] = useState<string>(''); // '' = tercero nuevo
  const [tercero, setTercero] = useState({ tipoIdentificacion: '02', numero: '', nombre: '', correo: '', telefono: '', codigoActividad: '' });
  const [guardarTercero, setGuardarTercero] = useState(true);
  const [copiaPaciente, setCopiaPaciente] = useState(false);
  const [actividades, setActividades] = useState<Array<{ codigo: string; descripcion: string }>>([]);
  const [buscandoContribuyente, setBuscandoContribuyente] = useState(false);
  const [avisoContribuyente, setAvisoContribuyente] = useState('');
  const ultimaBusqueda = useRef('');

  const cerrarSiSePuede = () => { if (!enviando) onClose(); };

  useEffect(() => {
    if (catalogos && !codigoDescuento) setCodigoDescuento(catalogos.codigoDescuentoDefecto);
  }, [catalogos, codigoDescuento]);

  // Terceros guardados del paciente (se cargan al elegir "Tercero").
  useEffect(() => {
    if (modoReceptor !== 'TERCERO') return;
    let vigente = true;
    fetch(`/api/pacientes/${idPaciente}/receptores-factura`)
      .then(r => (r.ok ? r.json() : []))
      .then((lista: ReceptorFacturaGuardado[]) => { if (vigente) setGuardados(Array.isArray(lista) ? lista : []); })
      .catch(() => {});
    return () => { vigente = false; };
  }, [modoReceptor, idPaciente]);

  // Al escribir una cédula válida se consulta Hacienda para sugerir el nombre y las actividades.
  useEffect(() => {
    if (modoReceptor !== 'TERCERO' || idGuardado) return;
    const numero = tercero.numero.replace(/\D/g, '');
    if (!identificacionValidaParaFactura(tercero.tipoIdentificacion, tercero.numero) || ultimaBusqueda.current === numero) return;
    const t = setTimeout(() => {
      ultimaBusqueda.current = numero;
      setBuscandoContribuyente(true);
      setAvisoContribuyente('');
      fetch(`/api/hacienda/contribuyente/${numero}`)
        .then(async r => {
          const data = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(data.error || 'No se encontró en Hacienda.');
          return data;
        })
        .then((c: { nombre: string; actividades: Array<{ codigo: string; descripcion: string; estado: string | null }> }) => {
          setTercero(prev => ({ ...prev, nombre: prev.nombre.trim() ? prev.nombre : c.nombre }));
          const activas = (c.actividades || []).filter(a => /^\d{6}$/.test(a.codigo) && (!a.estado || a.estado === 'A'));
          setActividades(activas);
          if (activas.length === 1) setTercero(prev => ({ ...prev, codigoActividad: prev.codigoActividad || activas[0].codigo }));
        })
        .catch((err: any) => setAvisoContribuyente(err.message))
        .finally(() => setBuscandoContribuyente(false));
    }, 500);
    return () => clearTimeout(t);
  }, [modoReceptor, idGuardado, tercero.tipoIdentificacion, tercero.numero]);

  const receptorGuardado = idGuardado ? guardados.find(g => String(g.id) === idGuardado) : undefined;
  const receptorEfectivo = modoReceptor === 'PACIENTE'
    ? { tipo: paciente?.tipoIdentificacion ?? null, numero: paciente?.identificacion ?? null, correo: paciente?.correoElectronico ?? null }
    : receptorGuardado
    ? { tipo: receptorGuardado.tipoIdentificacion, numero: receptorGuardado.numero, correo: receptorGuardado.correo }
    : { tipo: tercero.tipoIdentificacion, numero: tercero.numero, correo: tercero.correo };
  // Si no se conoce la identificación del paciente no se adivina: el servidor decide.
  const conocerReceptor = modoReceptor === 'TERCERO' || paciente != null;
  const saleTiquete = conocerReceptor && !identificacionValidaParaFactura(receptorEfectivo.tipo, receptorEfectivo.numero);
  const exigeReceptor = (catalogos?.condicionesExigenReceptor ?? ['02']).includes(condicion);
  const tipoComprobante = saleTiquete ? 'Tiquete' : 'Factura';

  // --- Totales (vista previa; el servidor recalcula) ---
  const lineasActivas = useMemo(() => (Object.entries(cantidades) as [string, number][])
    .filter(([, c]) => c > 0)
    .map(([id, cantidad]) => {
      const s = servicios.find(x => x.id === parseInt(id));
      if (!s) return null;
      const bruto = s.precio * cantidad;
      const desc = Math.min(Math.max(0, parseFloat(descuentos[s.id] || '0') || 0), bruto);
      const pct = s.porcentajeIva != null ? s.porcentajeIva : ivaPorDefecto;
      const base = bruto - desc;
      return { servicio: s, cantidad, bruto, desc, iva: base * (pct / 100) };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null), [cantidades, descuentos, servicios, ivaPorDefecto]);
  const totales = lineasActivas.reduce((acc, l) => ({
    bruto: acc.bruto + l.bruto, descuentos: acc.descuentos + l.desc, iva: acc.iva + l.iva, total: acc.total + l.bruto - l.desc + l.iva
  }), { bruto: 0, descuentos: 0, iva: 0, total: 0 });
  const hayDescuentos = totales.descuentos > 0;
  const total2 = redondear2(totales.total);

  // Con un solo medio de pago su monto es el total (no se escribe).
  const pagosEfectivos = pagos.length === 1 ? [{ tipo: pagos[0].tipo, monto: total2 }] : pagos.map(p => ({ tipo: p.tipo, monto: parseFloat(p.monto) || 0 }));
  const sumaPagos = redondear2(pagosEfectivos.reduce((s, p) => s + p.monto, 0));
  const restante = redondear2(total2 - sumaPagos);
  const montoEfectivo = pagosEfectivos.filter(p => p.tipo === '01').reduce((s, p) => s + p.monto, 0);
  const pideMontoRecibido = condicion !== '02' && montoEfectivo > 0;
  const montoRecibidoNum = pideMontoRecibido && montoRecibido.trim() !== '' ? parseFloat(montoRecibido) : null;
  const vuelto = montoRecibidoNum != null && !isNaN(montoRecibidoNum) ? montoRecibidoNum - montoEfectivo : null;
  const maxPagos = catalogos?.mediosPagoMax ?? 4;

  const asignarRestante = (idx: number) => setPagos(prev => prev.map((p, i) => i === idx ? { ...p, monto: String(redondear2((parseFloat(p.monto) || 0) + restante)) } : p));

  const validar = (): string | null => {
    if (lineasActivas.length === 0) return 'Agregue al menos un servicio con cantidad mayor a 0.';
    if (condicion === '02') {
      if (plazo.trim() !== '' && !(Number.isInteger(Number(plazo)) && Number(plazo) > 0)) return 'El plazo de crédito debe ser un número entero de días mayor que cero.';
    } else if (pagos.length > 1) {
      if (pagosEfectivos.some(p => !(p.monto > 0))) return 'Cada medio de pago debe tener un monto mayor que cero.';
      if (Math.abs(restante) > (catalogos?.toleranciaMedioPago ?? 0.01)) return restante > 0 ? `Falta asignar ${colones(restante)} a los medios de pago.` : `Los medios de pago superan el total en ${colones(-restante)}.`;
    }
    if (hayDescuentos && codigoDescuento === '99' && naturalezaDescuento.trim().length < 3) return 'Con el tipo de descuento «Otros» describa la naturaleza del descuento (3 a 80 caracteres).';
    if (saleTiquete && exigeReceptor) return 'Una venta a crédito necesita una Factura con receptor identificado (cédula física, jurídica, DIMEX o NITE).';
    if (modoReceptor === 'TERCERO' && !receptorGuardado) {
      if (tercero.nombre.trim().length < 3) return 'Indique el nombre o razón social del tercero.';
      if (tercero.tipoIdentificacion !== 'EXT') {
        const e = errorIdentificacion(tercero.tipoIdentificacion, tercero.numero);
        if (e) return `Identificación del tercero: ${e}`;
      } else if (guardarTercero && !tercero.numero.trim()) {
        return 'Para guardar un tercero extranjero indique su pasaporte (o desmarque «Guardar este tercero»).';
      }
      if (tercero.telefono.trim() && !/^\+?\d{8,19}$/.test(tercero.telefono.replace(/[\s-]/g, ''))) return 'El teléfono del tercero debe tener entre 8 y 19 dígitos (con + opcional).';
    }
    return null;
  };

  const handleEmitir = async () => {
    const problema = validar();
    if (problema) { setError(problema); return; }
    const lineas = lineasActivas.map(l => ({ idServicio: l.servicio.id, cantidad: l.cantidad, ...(l.desc > 0 ? { descuento: redondear2(l.desc) } : {}) }));
    const receptor: ReceptorSolicitud = modoReceptor === 'PACIENTE'
      ? { modo: 'PACIENTE' }
      : receptorGuardado
      ? { modo: 'TERCERO', idReceptorGuardado: receptorGuardado.id }
      : { modo: 'TERCERO', ...tercero, guardar: guardarTercero };

    setEnviando(true);
    setError('');
    try {
      const factura = await onCrearFactura({
        idCompania,
        idCita,
        idConsulta: idConsulta ?? null,
        idPaciente,
        condicionVenta: condicion,
        medioPago: pagosEfectivos[0]?.tipo || '01',
        ...(condicion !== '02' && pagos.length > 1 ? { mediosPago: pagosEfectivos } : {}),
        montoRecibido: montoRecibidoNum,
        plazoCreditoDias: condicion === '02' && plazo.trim() !== '' ? Number(plazo) : null,
        modoPrueba,
        lineas,
        ...(hayDescuentos ? { codigoDescuento, ...(codigoDescuento === '99' ? { naturalezaDescuento: naturalezaDescuento.trim() } : {}) } : {}),
        receptor,
        copiaPaciente: modoReceptor === 'TERCERO' && copiaPaciente
      });
      setResultado(factura);
      // Hacienda a veces tarda unos segundos en resolver: se consulta una vez automáticamente (la
      // cola en segundo plano sigue intentando si queda pendiente).
      if (factura.estado === 'ENVIADA' || factura.estado === 'PENDIENTE') {
        setTimeout(() => {
          onVerificarEstadoFactura(factura.id)
            .then(actualizada => setResultado(prev => (prev && prev.id === actualizada.id ? actualizada : prev)))
            .catch(() => {});
        }, 8000);
      }
    } catch (err: any) {
      setError(err.message || 'No se pudo generar el comprobante.');
    } finally {
      setEnviando(false);
    }
  };

  const etiqueta = 'block text-fg text-xs font-semibold mb-1.5';

  return (
    <ResponsiveModal
      open
      onClose={cerrarSiSePuede}
      title={`Facturar · ${nombrePaciente}`}
      icon={<Receipt aria-hidden="true" />}
      accentColor={themeColor}
      closeDisabled={enviando}
      size="lg"
      footer={resultado ? (
        <Button variant="secondary" fullWidth onClick={onClose}>Cerrar</Button>
      ) : (
        <>
          <Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
          <Button
            disabled={enviando}
            onClick={handleEmitir}
            icon={enviando ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Check className="w-4 h-4" aria-hidden="true" />}
          >
            {enviando ? 'Emitiendo…' : `Emitir ${tipoComprobante.toLowerCase()}${condicion === '02' ? ' a crédito' : ''} · ${colones(total2)}`}
          </Button>
        </>
      )}
    >
      <div className="space-y-4">
        {error && (
          <div role="alert" className="p-3 rounded-control bg-danger-soft border border-danger/20 text-danger text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 break-words">{error}</span>
          </div>
        )}
        {errorCatalogos && !resultado && (
          <div role="alert" className="p-3 rounded-control bg-warning-soft border border-warning/25 text-warning text-xs">{errorCatalogos}</div>
        )}

        {resultado ? (
          <div role="status" className={`p-4 rounded-card border text-sm space-y-1 ${
            resultado.estado === 'RECHAZADA' || resultado.estado === 'ERROR'
              ? 'bg-danger-soft border-danger/20 text-danger'
              : resultado.estado === 'ACEPTADA'
              ? 'bg-success-soft border-success/20 text-success'
              : 'bg-warning-soft border-warning/25 text-warning'
          }`}>
            <p className="font-semibold uppercase flex items-center gap-1.5">
              {resultado.estado === 'PENDIENTE' && <Clock className="w-4 h-4" aria-hidden="true" />}
              {nombreComprobante(resultado.tipoDocumento)} · {resultado.estado === 'PENDIENTE' ? 'En cola de envío' : resultado.estado}
            </p>
            <p className="tabular-nums">Consecutivo: {resultado.consecutivo}</p>
            <p className="break-all text-xs">Clave: {resultado.clave}</p>
            <p className="tabular-nums">Total: <span className="font-semibold">{colones(resultado.total)}</span>{resultado.condicionVenta === '02' ? ` · Crédito a ${resultado.plazoCredito} días (queda en Cuentas por Cobrar)` : ''}</p>
            {resultado.receptorEsTercero && <p>Facturado a: {resultado.receptorNombre}</p>}
            {resultado.estado === 'PENDIENTE' && <p className="text-xs">El comprobante quedó guardado y firmado; el sistema lo seguirá enviando a Hacienda automáticamente.</p>}
            {resultado.mensajeError && <p className="mt-1 break-words">{resultado.mensajeError}</p>}
          </div>
        ) : (
          <>
            <p className="text-sm text-fg-muted">
              {etiquetaPersona}: <span className="font-semibold text-fg">{nombrePaciente}</span>
            </p>

            {/* Receptor del comprobante */}
            <div className="space-y-3">
              <span id="facturarmo-receptor-label" className={etiqueta}>Facturar a</span>
              <SegmentedControl
                ariaLabelledBy="facturarmo-receptor-label"
                size="sm"
                value={modoReceptor}
                onChange={(v: 'PACIENTE' | 'TERCERO') => setModoReceptor(v)}
                options={[{ value: 'PACIENTE', label: etiquetaPersona }, { value: 'TERCERO', label: 'Un tercero (empresa u otra persona)' }]}
              />
              {modoReceptor === 'TERCERO' && (
                <div className="space-y-3 p-3 rounded-control border border-border bg-surface-muted/50">
                  {guardados.length > 0 && (
                    <div>
                      <label htmlFor="facturarmo-guardado" className={etiqueta}>Tercero</label>
                      <Select id="facturarmo-guardado" value={idGuardado} onChange={(e: any) => setIdGuardado(e.target.value)}>
                        <option value="">Nuevo tercero…</option>
                        {guardados.map(g => <option key={g.id} value={g.id}>{g.nombre}{g.numero ? ` · ${g.numero}` : ''}</option>)}
                      </Select>
                    </div>
                  )}
                  {receptorGuardado ? (
                    <p className="text-xs text-fg-muted break-words">
                      {receptorGuardado.nombre} · {receptorGuardado.numero || 'sin identificación'}{receptorGuardado.correo ? ` · ${receptorGuardado.correo}` : ' · sin correo'}
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="facturarmo-t-tipo" className={etiqueta}>Tipo de identificación</label>
                        <Select id="facturarmo-t-tipo" value={tercero.tipoIdentificacion} onChange={(e: any) => { setTercero(prev => ({ ...prev, tipoIdentificacion: e.target.value })); setActividades([]); ultimaBusqueda.current = ''; }}>
                          {TIPOS_ID_TERCERO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </Select>
                      </div>
                      <div>
                        <label htmlFor="facturarmo-t-numero" className={etiqueta}>{tercero.tipoIdentificacion === 'EXT' ? (guardarTercero ? 'Pasaporte' : 'Pasaporte (opcional)') : 'Número'}</label>
                        <Input id="facturarmo-t-numero" inputMode={tercero.tipoIdentificacion === 'EXT' ? 'text' : 'numeric'} maxLength={20} value={tercero.numero}
                          onChange={(e: any) => setTercero(prev => ({ ...prev, numero: e.target.value }))}
                          leadingIcon={buscandoContribuyente ? <Loader2 className="animate-spin" /> : <Search />}
                          placeholder={tercero.tipoIdentificacion === '02' ? 'ej: 3-101-123456' : ''} />
                      </div>
                      <div className="sm:col-span-2">
                        <label htmlFor="facturarmo-t-nombre" className={etiqueta}>Nombre o razón social</label>
                        <Input id="facturarmo-t-nombre" value={tercero.nombre} maxLength={100} onChange={(e: any) => setTercero(prev => ({ ...prev, nombre: e.target.value }))} />
                        {avisoContribuyente && <p className="text-xs text-fg-muted mt-1">{avisoContribuyente}</p>}
                      </div>
                      <div>
                        <label htmlFor="facturarmo-t-correo" className={etiqueta}>Correo (recibe el comprobante)</label>
                        <Input id="facturarmo-t-correo" type="email" autoCapitalize="none" maxLength={160} value={tercero.correo} onChange={(e: any) => setTercero(prev => ({ ...prev, correo: e.target.value }))} />
                      </div>
                      <div>
                        <label htmlFor="facturarmo-t-tel" className={etiqueta}>Teléfono (opcional)</label>
                        <Input id="facturarmo-t-tel" type="tel" inputMode="tel" maxLength={20} value={tercero.telefono} onChange={(e: any) => setTercero(prev => ({ ...prev, telefono: e.target.value }))} />
                      </div>
                      {tercero.tipoIdentificacion !== 'EXT' && (
                        <div className="sm:col-span-2">
                          <label htmlFor="facturarmo-t-actividad" className={etiqueta}>Actividad económica del receptor (opcional)</label>
                          {actividades.length > 0 ? (
                            <Select id="facturarmo-t-actividad" value={tercero.codigoActividad} onChange={(e: any) => setTercero(prev => ({ ...prev, codigoActividad: e.target.value }))}>
                              <option value="">Sin indicar</option>
                              {actividades.map(a => <option key={a.codigo} value={a.codigo}>{a.codigo} · {a.descripcion}</option>)}
                            </Select>
                          ) : (
                            <Input id="facturarmo-t-actividad" inputMode="numeric" maxLength={6} value={tercero.codigoActividad} placeholder="6 dígitos" onChange={(e: any) => setTercero(prev => ({ ...prev, codigoActividad: e.target.value.replace(/\D/g, '') }))} />
                          )}
                        </div>
                      )}
                      <label className="sm:col-span-2 flex items-center gap-2 text-xs text-fg min-h-11 cursor-pointer">
                        <input type="checkbox" className="w-4 h-4" checked={guardarTercero} onChange={(e) => setGuardarTercero(e.target.checked)} />
                        Guardar este tercero para próximas facturas de este {etiquetaPersona.toLowerCase()}
                      </label>
                    </div>
                  )}
                  <label className="flex items-center gap-2 text-xs text-fg min-h-11 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4" checked={copiaPaciente} onChange={(e) => setCopiaPaciente(e.target.checked)} disabled={!paciente?.correoElectronico && paciente != null} />
                    Enviar copia del comprobante al {etiquetaPersona.toLowerCase()}{paciente && !paciente.correoElectronico ? ' (no tiene correo registrado)' : ''}
                  </label>
                </div>
              )}
              {saleTiquete && (
                <p className={`text-xs ${exigeReceptor ? 'text-danger' : 'text-info'}`} aria-live="polite">
                  {exigeReceptor
                    ? 'Sin identificación costarricense válida no se puede vender a crédito: corrija la identificación o facture a un tercero.'
                    : 'Sin identificación costarricense válida se emitirá un Tiquete Electrónico (sin receptor identificado).'}
                </p>
              )}
            </div>

            {servicios.length === 0 ? (
              <p className="text-sm text-fg-muted">Esta empresa no tiene servicios configurados. Agréguelos primero en Configuración de Empresa.</p>
            ) : (
              // En móvil el modal ya tiene scroll propio: sin scroll anidado en la lista
              <div className="space-y-2 sm:max-h-72 sm:overflow-y-auto">
                {servicios.map(s => {
                  const cantidad = cantidades[s.id] || 0;
                  return (
                    <div key={s.id} className="p-3 bg-surface-muted border border-border rounded-control space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <span className="text-sm font-semibold text-fg block truncate">{s.nombre}</span>
                          <span id={`facturar-detalle-${s.id}`} className="text-xs text-fg-muted tabular-nums">
                            {colones(s.precio)} + IVA {s.porcentajeIva ?? ivaPorDefecto}% {!s.codigoCabys && <span className="text-warning font-semibold">(sin CABYS: no se puede facturar)</span>}
                          </span>
                        </div>
                        <Input
                          type="number" min="0" step="1" inputMode="numeric"
                          value={cantidad}
                          onChange={(e: any) => setCantidades(prev => ({ ...prev, [s.id]: Math.max(0, parseInt(e.target.value) || 0) }))}
                          disabled={!s.codigoCabys}
                          aria-label={`Cantidad de ${s.nombre}`}
                          aria-describedby={`facturar-detalle-${s.id}`}
                          wrapperClassName="w-20 shrink-0"
                          className="text-center tabular-nums"
                        />
                      </div>
                      {cantidad > 0 && (
                        <div className="flex items-center justify-end gap-2">
                          <label htmlFor={`facturar-desc-${s.id}`} className="text-xs text-fg-muted">Descuento (₡)</label>
                          <Input id={`facturar-desc-${s.id}`} type="number" min="0" step="0.01" inputMode="decimal"
                            value={descuentos[s.id] || ''} placeholder="0"
                            onChange={(e: any) => setDescuentos(prev => ({ ...prev, [s.id]: e.target.value }))}
                            wrapperClassName="w-28 shrink-0" className="text-right tabular-nums" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {hayDescuentos && catalogos && (
              <div>
                <label htmlFor="facturarmo-cod-desc" className={etiqueta}>Tipo de descuento</label>
                <Select id="facturarmo-cod-desc" value={codigoDescuento} onChange={(e: any) => setCodigoDescuento(e.target.value)}>
                  {catalogos.codigosDescuento.map(c => <option key={c.codigo} value={c.codigo}>{c.descripcion}</option>)}
                </Select>
                {codigoDescuento === '99' && (
                  <div className="mt-3">
                    <label htmlFor="facturarmo-naturaleza-desc" className={etiqueta}>Naturaleza del descuento</label>
                    <Input id="facturarmo-naturaleza-desc" maxLength={80} value={naturalezaDescuento} placeholder="ej: Cortesía por convenio"
                      onChange={(e: any) => setNaturalezaDescuento(e.target.value)} />
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="facturarmo-condicion" className={etiqueta}>Condición de venta</label>
                <Select id="facturarmo-condicion" value={condicion} onChange={(e: any) => setCondicion(e.target.value)}>
                  {(catalogos?.condicionesVenta ?? [{ codigo: '01', descripcion: 'Contado' }]).map(c => <option key={c.codigo} value={c.codigo}>{c.descripcion}</option>)}
                </Select>
              </div>
              {/* En una venta a crédito el XML omite <MedioPago>: todavía no se ha pagado. */}
              {condicion === '02' && (
                <div>
                  <label htmlFor="facturarmo-plazo" className={etiqueta}>Plazo (días)</label>
                  <Input id="facturarmo-plazo" type="number" min="1" step="1" inputMode="numeric" value={plazo} onChange={(e: any) => setPlazo(e.target.value)} />
                </div>
              )}
            </div>
            {condicion === '02' && (
              <p className="text-xs text-fg-muted -mt-2">
                Se crea una cuenta por cobrar por el total, con vencimiento según el plazo. Los abonos se registran en Facturación › Cuentas por Cobrar.
              </p>
            )}

            {condicion !== '02' && (
              <fieldset className="min-w-0 space-y-2">
                <legend className={etiqueta}>Medios de pago</legend>
                {pagos.map((p, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Select aria-label={`Medio de pago ${idx + 1}`} value={p.tipo} onChange={(e: any) => setPagos(prev => prev.map((x, i) => i === idx ? { ...x, tipo: e.target.value } : x))} wrapperClassName="flex-1 min-w-0">
                      {(catalogos?.mediosPago ?? [{ codigo: '01', descripcion: 'Efectivo' }]).map(m => <option key={m.codigo} value={m.codigo}>{m.descripcion}</option>)}
                    </Select>
                    {pagos.length > 1 ? (
                      <>
                        <Input aria-label={`Monto del medio de pago ${idx + 1}`} type="number" min="0" step="0.01" inputMode="decimal" value={p.monto}
                          onChange={(e: any) => setPagos(prev => prev.map((x, i) => i === idx ? { ...x, monto: e.target.value } : x))}
                          wrapperClassName="w-28 shrink-0" className="text-right tabular-nums" />
                        <button type="button" onClick={() => setPagos(prev => prev.filter((_, i) => i !== idx))} className="w-11 h-11 shrink-0 flex items-center justify-center rounded-control text-danger hover:bg-danger-soft" aria-label={`Quitar medio de pago ${idx + 1}`}>
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </>
                    ) : (
                      <span className="text-sm font-semibold tabular-nums text-fg shrink-0">{colones(total2)}</span>
                    )}
                  </div>
                ))}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {pagos.length < maxPagos && (
                    <Button variant="ghost" size="sm" icon={<Plus className="w-4 h-4" aria-hidden="true" />}
                      onClick={() => setPagos(prev => prev.length === 1 ? [{ ...prev[0], monto: String(total2) }, { tipo: '02', monto: '0' }] : [...prev, { tipo: '02', monto: restante > 0 ? String(restante) : '' }])}>
                      Dividir el pago
                    </Button>
                  )}
                  {pagos.length > 1 && (
                    <span aria-live="polite" className={`text-xs font-semibold tabular-nums ${Math.abs(restante) < 0.01 ? 'text-success' : 'text-danger'}`}>
                      {Math.abs(restante) < 0.01 ? 'Cuadra con el total' : restante > 0 ? `Falta ${colones(restante)}` : `Sobra ${colones(-restante)}`}
                      {restante > 0.009 && <button type="button" className="ml-2 underline" onClick={() => asignarRestante(pagos.length - 1)}>asignar al último</button>}
                    </span>
                  )}
                </div>
              </fieldset>
            )}

            <dl className="p-4 bg-surface-muted border border-border rounded-card text-sm space-y-1.5">
              {hayDescuentos && (
                <>
                  <div className="flex items-center justify-between">
                    <dt className="text-fg-muted">Venta bruta</dt>
                    <dd className="font-medium text-fg tabular-nums">{colones(totales.bruto)}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-fg-muted">Descuentos</dt>
                    <dd className="font-medium text-fg tabular-nums">−{colones(totales.descuentos)}</dd>
                  </div>
                </>
              )}
              <div className="flex items-center justify-between">
                <dt className="text-fg-muted">Base (subtotal)</dt>
                <dd className="font-medium text-fg tabular-nums">{colones(totales.bruto - totales.descuentos)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-fg-muted">IVA</dt>
                <dd className="font-medium text-fg tabular-nums">{colones(totales.iva)}</dd>
              </div>
              <div className="flex items-baseline justify-between border-t border-border-strong pt-2 mt-1">
                <dt className="text-fg font-semibold">Total</dt>
                <dd className="font-bold text-fg text-title tabular-nums">{colones(totales.total)}</dd>
              </div>
            </dl>

            {pideMontoRecibido && (
              <div>
                <label htmlFor="facturarmo-monto-recibido" className={etiqueta}>Efectivo recibido (opcional, para calcular el vuelto)</label>
                <Input id="facturarmo-monto-recibido" type="number" min="0" step="0.01" inputMode="decimal"
                  value={montoRecibido} onChange={(e: any) => setMontoRecibido(e.target.value)}
                  placeholder={`ej: ${Math.ceil(montoEfectivo)}`} />
                {vuelto != null && (
                  <p aria-live="polite" className={`text-xs mt-1.5 font-semibold tabular-nums ${vuelto < 0 ? 'text-danger' : 'text-success'}`}>
                    {vuelto < 0 ? `Falta ${colones(Math.abs(vuelto))}` : `Vuelto: ${colones(vuelto)}`}
                  </p>
                )}
              </div>
            )}

            <label className="flex items-start gap-3 p-3 bg-info-soft border border-info/20 rounded-control cursor-pointer min-h-11">
              <input type="checkbox" checked={modoPrueba} onChange={(e) => setModoPrueba(e.target.checked)} className="mt-0.5 w-4 h-4" />
              <span className="text-xs text-info">
                <span className="font-semibold block">Modo prueba (no enviar a Hacienda)</span>
                El comprobante se numera y guarda igual que siempre, pero no se envía a Hacienda — queda marcado como SIMULADA.
              </span>
            </label>
          </>
        )}
      </div>
    </ResponsiveModal>
  );
}
