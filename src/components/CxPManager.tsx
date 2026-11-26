import React, { useState } from 'react';
import { CuentaPagar, Proveedor, Servicio } from '../data/mockData';
import { Landmark, Plus, AlertCircle, DollarSign, Trash2, Upload, X, CheckCircle } from 'lucide-react';
import { notify, confirmar } from './ui/Feedback';
import { fechaCR } from '../utils/fechaCR';
import { MEDIO_PAGO_ABONO, colones, fechaCorta, plazoVencimiento } from '../utils/facturacion';
import BandejaFacturasCorreo from './BandejaFacturasCorreo';
import { StatCard } from './ui/StatCard';
import { Card } from './ui/Card';
import { Badge, type BadgeTone } from './ui/Badge';
import { Button } from './ui/Button';
import { IconButton } from './ui/IconButton';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { EmptyState } from './ui/EmptyState';

interface ImportarXmlResultado {
  cxp: CuentaPagar;
  proveedor: Proveedor;
  articulosAfectados: number;
  avisoCreditoFiscal?: string | null; // por qué la compra no da crédito fiscal (tiquete, otra cédula)
}

interface CxPManagerProps {
  cxp: CuentaPagar[];
  proveedores: Proveedor[];
  articulos: Servicio[];
  plazoCreditoDefecto?: number; // Personalizar › Parámetros contables
  onCrearCxp: (payload: {
    idProveedor: number;
    numeroFacturaProveedor: string;
    esServicio: boolean;
    montoTotal?: number;
    plazoDias: number;
    notas: string;
    ivaAcreditable: number;
    lineas?: Array<{ idServicio: number; cantidad: number; costoUnitario: number }>;
  }) => Promise<void>;
  onRegistrarPago: (idCuentaPagar: number, monto: number, medioPago: string, referencia: string) => Promise<void>;
  onImportarXml: (xmlTexto: string, alimentaInventario: boolean) => Promise<ImportarXmlResultado>;
  soloLectura?: boolean; // Contador: solo consulta (sin crear, importar, pagar ni eliminar)
}

// Con la fecha de hoy en Costa Rica: con la fecha UTC, después de las 6 p.m. una cuenta que vence
// hoy ya aparecía VENCIDA.
function estadoEfectivo(c: CuentaPagar): 'PENDIENTE' | 'VENCIDA' | 'PAGADA' | 'ANULADA' {
  if (c.estado !== 'PENDIENTE') return c.estado;
  return c.fechaVencimiento < fechaCR() ? 'VENCIDA' : 'PENDIENTE';
}

const FILTROS = [['TODAS', 'Todas'], ['PENDIENTE', 'Al día'], ['VENCIDA', 'Vencidas'], ['PAGADA', 'Pagadas']] as const;

const ESTADO_TONO: Record<string, BadgeTone> = {
  PENDIENTE: 'warning',
  VENCIDA: 'danger',
  PAGADA: 'success',
  ANULADA: 'neutral'
};

const labelCls = 'block text-fg font-semibold mb-1.5 text-xs';

interface LineaForm {
  idServicio: string;
  cantidad: string;
  costoUnitario: string;
}

export default function CxPManager({ cxp, proveedores, articulos, plazoCreditoDefecto, onCrearCxp, onRegistrarPago, onImportarXml, soloLectura = false }: CxPManagerProps) {
  const [filtro, setFiltro] = useState<'TODAS' | 'PENDIENTE' | 'VENCIDA' | 'PAGADA'>('TODAS');

  // idFacturaCorreo: el XML vino de la bandeja de correo; tras importarlo se marca allí como IMPORTADA.
  const [xmlPendiente, setXmlPendiente] = useState<{ nombreArchivo: string; xmlTexto: string; idFacturaCorreo?: number } | null>(null);
  const [bandejaVersion, setBandejaVersion] = useState(0);
  const [xmlAlimentaInventario, setXmlAlimentaInventario] = useState(true);
  const [xmlError, setXmlError] = useState('');
  const [xmlImportando, setXmlImportando] = useState(false);
  const [xmlResultado, setXmlResultado] = useState<ImportarXmlResultado | null>(null);

  const [formAbierto, setFormAbierto] = useState(false);
  const [idProveedor, setIdProveedor] = useState('');
  const [numeroFactura, setNumeroFactura] = useState('');
  const [modo, setModo] = useState<'GASTO' | 'ARTICULOS'>('GASTO');
  const [montoTotal, setMontoTotal] = useState('');
  const plazoInicial = plazoCreditoDefecto != null ? String(plazoCreditoDefecto) : '';
  const [plazoDias, setPlazoDias] = useState(plazoInicial);
  const [notas, setNotas] = useState('');
  const [ivaAcreditable, setIvaAcreditable] = useState('');
  const [lineas, setLineas] = useState<LineaForm[]>([{ idServicio: '', cantidad: '1', costoUnitario: '' }]);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const [abonandoId, setAbonandoId] = useState<number | null>(null);
  const [montoAbono, setMontoAbono] = useState('');
  const [medioPagoAbono, setMedioPagoAbono] = useState('03');
  const [referenciaAbono, setReferenciaAbono] = useState('');
  const [abonoError, setAbonoError] = useState('');
  const [abonando, setAbonando] = useState(false);

  const nombreProveedor = (idProveedor: number) => proveedores.find(p => p.id === idProveedor)?.nombre || `Proveedor #${idProveedor}`;

  // Las vencidas primero (por fecha de vencimiento): es lo que tesorería tiene que pagar ya.
  const ordenadas = [...cxp].sort((a, b) =>
    Number(estadoEfectivo(b) === 'VENCIDA') - Number(estadoEfectivo(a) === 'VENCIDA') || a.fechaVencimiento.localeCompare(b.fechaVencimiento));
  const visibles = ordenadas.filter(c => filtro === 'TODAS' || estadoEfectivo(c) === filtro);

  const totalPendiente = cxp.filter(c => c.estado === 'PENDIENTE').reduce((s, c) => s + c.saldoPendiente, 0);
  const totalVencido = cxp.filter(c => estadoEfectivo(c) === 'VENCIDA').reduce((s, c) => s + c.saldoPendiente, 0);
  const totalPagado = cxp.reduce((s, c) => s + c.pagos.reduce((sp, p) => sp + p.monto, 0), 0);

  const abrirForm = () => {
    setIdProveedor('');
    setNumeroFactura('');
    setModo('GASTO');
    setMontoTotal('');
    setPlazoDias(plazoInicial);
    setNotas('');
    setIvaAcreditable('');
    setLineas([{ idServicio: '', cantidad: '1', costoUnitario: '' }]);
    setError('');
    setFormAbierto(true);
  };

  const handleXmlFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setXmlError('');
    setXmlResultado(null);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      setXmlPendiente({ nombreArchivo: file.name, xmlTexto: reader.result });
      setXmlAlimentaInventario(true);
      setFormAbierto(false);
    };
    reader.onerror = () => setXmlError('No se pudo leer el archivo.');
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleConfirmarImportacionXml = async () => {
    if (!xmlPendiente) return;
    const ok = await confirmar({
      title: '¿Importar esta factura de proveedor?',
      message: `Se registrará "${xmlPendiente.nombreArchivo}" como cuenta por pagar${xmlAlimentaInventario ? ' y se incrementará el inventario' : ''}. Esta acción no se puede deshacer.`,
      confirmText: 'Importar',
      tone: 'warning'
    });
    if (!ok) return;
    setXmlImportando(true);
    setXmlError('');
    try {
      const resultado = await onImportarXml(xmlPendiente.xmlTexto, xmlAlimentaInventario);
      setXmlResultado(resultado);
      setXmlPendiente(null);
      if (xmlPendiente.idFacturaCorreo) {
        const res = await fetch(`/api/facturas-correo/${xmlPendiente.idFacturaCorreo}/estado`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ estado: 'IMPORTADA', idCuentaPagar: resultado.cxp.id })
        });
        // La CxP ya quedó creada: si solo falla el marcado, se avisa en vez de tratarlo como error de importación.
        if (!res.ok) notify.warning('La factura se importó, pero no se pudo marcar como importada en la bandeja de correo.');
        setBandejaVersion(v => v + 1);
      }
    } catch (err: any) {
      setXmlError(err.message || 'No se pudo importar el archivo XML.');
    } finally {
      setXmlImportando(false);
    }
  };

  const actualizarLinea = (idx: number, campo: keyof LineaForm, valor: string) => {
    setLineas(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      const actualizada = { ...l, [campo]: valor };
      if (campo === 'idServicio') {
        const art = articulos.find(a => a.id === parseInt(valor));
        if (art && art.costoUnitario != null) actualizada.costoUnitario = art.costoUnitario.toString();
      }
      return actualizada;
    }));
  };

  const totalLineas = lineas.reduce((s, l) => s + (parseFloat(l.cantidad) || 0) * (parseFloat(l.costoUnitario) || 0), 0);
  const ivaFormulario = parseFloat(ivaAcreditable) || 0;

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idProveedor) {
      setError('Seleccione un proveedor.');
      return;
    }
    setGuardando(true);
    setError('');
    const plazo = Number(plazoDias);
    if (plazoDias.trim() === '' || !Number.isInteger(plazo) || plazo < 0) {
      setError('Indique el plazo de crédito en días (0 si es de contado).');
      setGuardando(false);
      return;
    }
    const ivaAcreditableNum = ivaAcreditable.trim() ? parseFloat(ivaAcreditable) : 0;
    if (!Number.isFinite(ivaAcreditableNum) || ivaAcreditableNum < 0) {
      setError('El IVA acreditable debe ser un monto válido (0 o mayor).');
      setGuardando(false);
      return;
    }
    try {
      if (modo === 'GASTO') {
        const monto = parseFloat(montoTotal);
        if (!Number.isFinite(monto) || monto <= 0) {
          setError('Indique un monto total válido.');
          setGuardando(false);
          return;
        }
        await onCrearCxp({
          idProveedor: parseInt(idProveedor),
          numeroFacturaProveedor: numeroFactura.trim(),
          esServicio: true,
          montoTotal: monto,
          plazoDias: plazo,
          notas: notas.trim(),
          ivaAcreditable: ivaAcreditableNum
        });
      } else {
        const lineasValidas = lineas.filter(l => l.idServicio && parseFloat(l.cantidad) > 0);
        if (lineasValidas.length === 0) {
          setError('Agregue al menos un artículo con cantidad mayor a cero.');
          setGuardando(false);
          return;
        }
        await onCrearCxp({
          idProveedor: parseInt(idProveedor),
          numeroFacturaProveedor: numeroFactura.trim(),
          esServicio: false,
          plazoDias: plazo,
          notas: notas.trim(),
          ivaAcreditable: ivaAcreditableNum,
          lineas: lineasValidas.map(l => ({
            idServicio: parseInt(l.idServicio),
            cantidad: parseFloat(l.cantidad),
            costoUnitario: parseFloat(l.costoUnitario) || 0
          }))
        });
      }
      setFormAbierto(false);
    } catch (err: any) {
      setError(err.message || 'No se pudo registrar la cuenta por pagar.');
    } finally {
      setGuardando(false);
    }
  };

  const abrirAbono = (c: CuentaPagar) => {
    setAbonandoId(c.id);
    setMontoAbono(c.saldoPendiente.toString());
    setMedioPagoAbono('03');
    setReferenciaAbono('');
    setAbonoError('');
  };

  const confirmarAbono = async (c: CuentaPagar) => {
    const monto = parseFloat(montoAbono);
    if (!Number.isFinite(monto) || monto <= 0) {
      setAbonoError('Indique un monto válido.');
      return;
    }
    if (monto > c.saldoPendiente) {
      setAbonoError(`El abono no puede superar el saldo pendiente (${colones(c.saldoPendiente)}).`);
      return;
    }
    setAbonando(true);
    setAbonoError('');
    try {
      await onRegistrarPago(c.id, monto, medioPagoAbono, referenciaAbono.trim());
      setAbonandoId(null);
    } catch (err: any) {
      setAbonoError(err.message || 'No se pudo registrar el abono.');
    } finally {
      setAbonando(false);
    }
  };

  return (
    <section aria-labelledby="cxp-titulo">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h3 id="cxp-titulo" className="text-heading font-semibold text-fg tracking-tight">Cuentas por Pagar</h3>
          <p className="text-body text-fg-muted">Facturas de proveedores y sus abonos</p>
        </div>
        {/* Contador (soloLectura): sin crear, importar ni pagar */}
        {!soloLectura && (
        <div className="flex flex-wrap items-center gap-2">
          {!formAbierto && (
            <Button onClick={abrirForm} icon={<Plus className="w-4 h-4" aria-hidden="true" />}>
              Registrar Compra
            </Button>
          )}
          <label
            className="cursor-pointer inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-control border border-border-strong bg-surface text-fg text-sm font-semibold shadow-xs hover:bg-surface-muted transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-(--focus-ring)"
            title="Importar la compra directamente desde el XML de Factura/Tiquete Electrónico del proveedor"
          >
            <Upload className="w-4 h-4" aria-hidden="true" />
            Cargar Factura XML
            <input type="file" accept=".xml" onChange={handleXmlFileChange} className="sr-only" />
          </label>
        </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <StatCard label="Saldo por pagar" value={colones(totalPendiente)} icon={<Landmark />} className="bg-warning-soft border-warning/25" />
        <StatCard label="De eso, vencido" value={colones(totalVencido)} icon={<AlertCircle />} className={totalVencido > 0 ? 'bg-danger-soft border-danger/25' : undefined} />
        <StatCard label="Pagado (abonos)" value={colones(totalPagado)} icon={<DollarSign />} className="bg-success-soft border-success/25" />
      </div>

      <BandejaFacturasCorreo
        version={bandejaVersion}
        soloLectura={soloLectura}
        onImportar={(f, xml) => {
          setXmlError('');
          setXmlResultado(null);
          setXmlPendiente({ nombreArchivo: `${f.emisorNombre} · ${f.numeroConsecutivo} (correo)`, xmlTexto: xml, idFacturaCorreo: f.id });
          setXmlAlimentaInventario(true);
          setFormAbierto(false);
        }}
      />

      {xmlError && (
        <div role="alert" className="p-3 mb-4 rounded-control bg-danger-soft border border-danger/20 text-danger text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{xmlError}</span>
        </div>
      )}

      {xmlResultado && (
        <div className="p-4 mb-4 rounded-card bg-success-soft border border-success/20 text-success text-xs flex items-start gap-2">
          <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="font-semibold">Factura importada correctamente.</p>
            <p className="tabular-nums">Proveedor: {xmlResultado.proveedor.nombre} &middot; Total {colones(xmlResultado.cxp.montoTotal)} &middot; IVA acreditable {colones(xmlResultado.cxp.ivaAcreditable)} &middot; {xmlResultado.articulosAfectados} artículo(s) afectado(s) en inventario.</p>
            {xmlResultado.avisoCreditoFiscal && <p className="mt-1 font-semibold text-warning">{xmlResultado.avisoCreditoFiscal}</p>}
          </div>
          <button type="button" onClick={() => setXmlResultado(null)} className="ml-auto shrink-0 w-10 h-10 -m-2 flex items-center justify-center rounded-control text-success hover:bg-success/10 transition-colors" aria-label="Cerrar aviso"><X className="w-4 h-4" aria-hidden="true" /></button>
        </div>
      )}

      {xmlPendiente && (
        <Card className="p-4 mb-4 space-y-3 border-brand/30">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-brand-ink flex items-center gap-1.5 min-w-0">
              <Upload className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span className="truncate">Archivo: {xmlPendiente.nombreArchivo}</span>
            </span>
            <IconButton label="Descartar archivo" icon={<X className="w-4 h-4" aria-hidden="true" />} onClick={() => setXmlPendiente(null)} />
          </div>
          <label className="flex items-start gap-3 p-3 bg-surface-muted rounded-control border border-border cursor-pointer min-h-11">
            <input
              type="checkbox"
              checked={xmlAlimentaInventario}
              onChange={(e) => setXmlAlimentaInventario(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span>
              <span className="block text-xs font-semibold text-fg">Esta compra alimenta el inventario</span>
              <span className="block text-xs text-fg-muted mt-0.5">
                Desactive si es una factura de <b>servicios</b> (alquiler, honorarios, servicios públicos, etc.) — se registrará la cuenta por pagar sin crear ni actualizar artículos.
              </span>
            </span>
          </label>
          <Button
            fullWidth
            onClick={handleConfirmarImportacionXml}
            disabled={xmlImportando}
            icon={<CheckCircle className="w-4 h-4" aria-hidden="true" />}
          >
            {xmlImportando ? 'Importando...' : 'Confirmar e Importar'}
          </Button>
        </Card>
      )}

      {formAbierto && (
        <Card className="mb-4 animate-slide-down">
        <form onSubmit={handleGuardar} className="p-5 space-y-4">
          <h4 className="text-base font-semibold text-fg">Registrar compra</h4>
          {error && (
            <div role="alert" className="p-2.5 rounded-control bg-danger-soft border border-danger/20 text-danger text-xs flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="cxpmanager-proveedor" className={labelCls}>Proveedor *</label>
              <Select id="cxpmanager-proveedor" value={idProveedor} onChange={(e: any) => setIdProveedor(e.target.value)}>
                <option value="">Seleccione...</option>
                {proveedores.filter(p => p.activo).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </Select>
            </div>
            <div>
              <label htmlFor="cxpmanager-factura-del-proveedor" className={labelCls}># Factura del Proveedor</label>
              <Input id="cxpmanager-factura-del-proveedor" type="text" value={numeroFactura} onChange={(e: any) => setNumeroFactura(e.target.value)} />
            </div>
            <div>
              <label htmlFor="cxpmanager-plazo-de-credito-dias" className={labelCls}>Plazo de crédito (días, 0 = contado)</label>
              <Input id="cxpmanager-plazo-de-credito-dias" type="number" min="0" value={plazoDias} onChange={(e: any) => setPlazoDias(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setModo('GASTO')} aria-pressed={modo === 'GASTO'} className={`min-h-11 rounded-control text-xs font-semibold border-2 transition-colors ${modo === 'GASTO' ? 'border-brand bg-brand-soft text-brand-ink' : 'border-border text-fg-muted hover:bg-surface-muted'}`}>
              Gasto (sin inventario)
            </button>
            <button type="button" onClick={() => setModo('ARTICULOS')} aria-pressed={modo === 'ARTICULOS'} className={`min-h-11 rounded-control text-xs font-semibold border-2 transition-colors ${modo === 'ARTICULOS' ? 'border-brand bg-brand-soft text-brand-ink' : 'border-border text-fg-muted hover:bg-surface-muted'}`}>
              Compra de Artículos
            </button>
          </div>

          {modo === 'GASTO' ? (
            <div>
              <label htmlFor="cxpmanager-monto-total" className={labelCls}>Monto Total con IVA (₡) *</label>
              <Input id="cxpmanager-monto-total" type="number" min="0" step="0.01" value={montoTotal} onChange={(e: any) => setMontoTotal(e.target.value)} placeholder="ej: alquiler, servicios, honorarios" className="tabular-nums" />
            </div>
          ) : (
            <div className="space-y-3">
              {lineas.map((l, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end p-3 rounded-control bg-surface-muted border border-border">
                  <div className="col-span-12 sm:col-span-5">
                    <label htmlFor={`cxp-linea-art-${idx}`} className={labelCls}>Artículo</label>
                    <Select id={`cxp-linea-art-${idx}`} value={l.idServicio} onChange={(e: any) => actualizarLinea(idx, 'idServicio', e.target.value)}>
                      <option value="">Seleccione...</option>
                      {articulos.map(a => <option key={a.id} value={a.id}>{a.nombre} (stock: {a.stock ?? 0})</option>)}
                    </Select>
                  </div>
                  <div className="col-span-5 sm:col-span-2">
                    <label htmlFor={`cxp-linea-cant-${idx}`} className={labelCls}>Cantidad</label>
                    <Input id={`cxp-linea-cant-${idx}`} type="number" min="0" step="1" value={l.cantidad} onChange={(e: any) => actualizarLinea(idx, 'cantidad', e.target.value)} className="tabular-nums" />
                  </div>
                  <div className="col-span-5 sm:col-span-4">
                    <label htmlFor={`cxp-linea-costo-${idx}`} className={labelCls}>Costo unit. sin IVA (₡)</label>
                    <Input id={`cxp-linea-costo-${idx}`} type="number" min="0" step="0.01" value={l.costoUnitario} onChange={(e: any) => actualizarLinea(idx, 'costoUnitario', e.target.value)} className="tabular-nums" />
                  </div>
                  <div className="col-span-2 sm:col-span-1 flex justify-end">
                    {lineas.length > 1 && (
                      <IconButton label={`Quitar línea ${idx + 1}`} icon={<Trash2 className="w-4 h-4" aria-hidden="true" />} onClick={() => setLineas(prev => prev.filter((_, i) => i !== idx))} className="text-danger hover:bg-danger-soft" title="Quitar línea" />
                    )}
                  </div>
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={() => setLineas(prev => [...prev, { idServicio: '', cantidad: '1', costoUnitario: '' }])} icon={<Plus className="w-4 h-4" aria-hidden="true" />}>
                Agregar artículo
              </Button>
              {/* La deuda con el proveedor incluye el IVA de su factura (igual que una compra importada desde XML). */}
              <dl className="p-4 bg-surface-muted border border-border rounded-card text-sm space-y-1.5">
                <div className="flex justify-between"><dt className="text-fg-muted">Base (subtotal)</dt><dd className="font-medium text-fg tabular-nums">{colones(totalLineas)}</dd></div>
                <div className="flex justify-between"><dt className="text-fg-muted">IVA</dt><dd className="font-medium text-fg tabular-nums">{colones(ivaFormulario)}</dd></div>
                <div className="flex justify-between items-baseline border-t border-border-strong pt-2"><dt className="font-semibold text-fg">Total a pagar</dt><dd className="font-bold text-fg text-heading tabular-nums">{colones(totalLineas + ivaFormulario)}</dd></div>
              </dl>
              <p className="text-xs text-fg-muted">Esto incrementa las existencias del artículo y actualiza su costo unitario al costo de esta compra.</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="cxpmanager-notas" className={labelCls}>Notas</label>
              <Input id="cxpmanager-notas" type="text" value={notas} onChange={(e: any) => setNotas(e.target.value)} />
            </div>
            <div>
              <label htmlFor="cxpmanager-iva-acreditable" className={labelCls}>IVA de la factura del proveedor (₡)</label>
              <Input id="cxpmanager-iva-acreditable" type="number" min="0" step="0.01" value={ivaAcreditable} onChange={(e: any) => setIvaAcreditable(e.target.value)} placeholder="Según la factura de compra recibida" className="tabular-nums" />
              <p className="text-xs text-fg-muted mt-1.5">Tómelo del desglose de IVA de la factura. Es crédito fiscal en el D-104 y, en una compra de artículos, se suma al total a pagar.</p>
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            <Button variant="ghost" onClick={() => setFormAbierto(false)}>Cancelar</Button>
            <Button type="submit" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Registrar'}
            </Button>
          </div>
        </form>
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap gap-1.5 p-4 border-b border-border" role="group" aria-label="Filtrar cuentas por pagar">
          {FILTROS.map(([f, etiqueta]) => (
            <button key={f} type="button" onClick={() => setFiltro(f)} aria-pressed={filtro === f} className={`min-h-10 px-4 rounded-control text-xs font-semibold transition-colors ${filtro === f ? 'bg-brand-solid text-brand-fg shadow-xs' : 'bg-surface-muted text-fg-muted hover:bg-border hover:text-fg'}`}>
              {etiqueta}
            </button>
          ))}
        </div>

        {visibles.length === 0 && (
          <EmptyState icon={<Landmark />} title="Sin cuentas por pagar" description="No hay cuentas por pagar en este filtro." />
        )}

        <div className="divide-y divide-border">
        {visibles.map(c => {
          const estado = estadoEfectivo(c);
          const plazo = c.estado === 'PENDIENTE' ? plazoVencimiento(c.fechaVencimiento) : null;
          return (
            <div key={c.id} className="p-4 hover:bg-surface-muted/40 transition-colors">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <span className="font-semibold text-fg text-body block">
                    {nombreProveedor(c.idProveedor)}{c.numeroFacturaProveedor ? ` · ${c.numeroFacturaProveedor}` : ''}
                  </span>
                  <span className="text-xs text-fg-muted block">
                    {c.esServicio ? 'Gasto' : `${c.lineas.length} artículo(s)`} &middot; Registrada {fechaCorta(c.fechaRegistro)} &middot; Vence {fechaCorta(c.fechaVencimiento)}
                    {plazo && <span className={`font-semibold ${plazo.vencida ? 'text-danger' : 'text-fg'}`}> ({plazo.texto})</span>}
                  </span>
                  {c.ivaAcreditable > 0 && <span className="text-xs text-fg-muted block tabular-nums">IVA acreditable {colones(c.ivaAcreditable)}</span>}
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                  <div className="text-right tabular-nums">
                    <span className="block text-body font-semibold text-fg">{colones(c.saldoPendiente)}</span>
                    <span className="block text-caption text-fg-subtle">de {colones(c.montoTotal)}</span>
                  </div>
                  <Badge tone={ESTADO_TONO[estado]}>{estado}</Badge>
                  {!soloLectura && c.estado === 'PENDIENTE' && (
                    <button type="button" onClick={() => abrirAbono(c)} title="Registrar abono" className="w-10 h-10 flex items-center justify-center rounded-control text-success hover:bg-success-soft" aria-label={`Registrar abono a ${nombreProveedor(c.idProveedor)}${c.numeroFacturaProveedor ? `, factura ${c.numeroFacturaProveedor}` : ''}`}>
                      <DollarSign className="w-4 h-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>

              {c.pagos.length > 0 && (
                <div className="mt-2 pl-3 border-l-2 border-border space-y-0.5">
                  {c.pagos.map(p => (
                    <p key={p.id} className="text-xs text-fg-muted tabular-nums">
                      {fechaCorta(p.fecha)} &middot; {colones(p.monto)} &middot; {MEDIO_PAGO_ABONO[p.medioPago] || p.medioPago}{p.referencia ? ` (${p.referencia})` : ''}
                    </p>
                  ))}
                </div>
              )}

              {abonandoId === c.id && (
                <div className="mt-3 pt-3 border-t border-border space-y-3 animate-slide-down">
                  {abonoError && (
                    <div role="alert" className="p-2.5 rounded-control bg-danger-soft border border-danger/20 text-danger text-xs flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>{abonoError}</span>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label htmlFor={`cxp-monto-${c.id}`} className={labelCls}>Monto (₡)</label>
                      <Input id={`cxp-monto-${c.id}`} type="number" min="0" step="0.01" inputMode="decimal" value={montoAbono} onChange={(e: any) => setMontoAbono(e.target.value)} className="tabular-nums" />
                    </div>
                    <div>
                      <label htmlFor={`cxp-medio-${c.id}`} className={labelCls}>Medio de pago</label>
                      <Select id={`cxp-medio-${c.id}`} value={medioPagoAbono} onChange={(e: any) => setMedioPagoAbono(e.target.value)}>
                        {Object.entries(MEDIO_PAGO_ABONO).map(([codigo, nombre]) => <option key={codigo} value={codigo}>{nombre}</option>)}
                      </Select>
                    </div>
                    <div>
                      <label htmlFor={`cxp-ref-${c.id}`} className={labelCls}>Referencia</label>
                      <Input id={`cxp-ref-${c.id}`} type="text" value={referenciaAbono} onChange={(e: any) => setReferenciaAbono(e.target.value)} placeholder="ej: # comprobante" />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="ghost" onClick={() => setAbonandoId(null)}>Cancelar</Button>
                    <Button onClick={() => confirmarAbono(c)} disabled={abonando}>
                      {abonando ? 'Guardando…' : 'Registrar Abono'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        </div>
      </Card>
    </section>
  );
}
