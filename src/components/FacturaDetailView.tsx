import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Factura, Patient, Company, NotificationLog } from '../data/mockData';
import { Printer, Mail, RefreshCw, FileMinus, FilePlus, Receipt } from 'lucide-react';
import { MEDIO_PAGO_HACIENDA, colones } from '../utils/facturacion';
import { Button } from './ui/Button';
import { Badge, type BadgeTone } from './ui/Badge';

interface FacturaDetailViewProps {
  factura: Factura;
  patient: Patient;
  company: Company;
  referencia?: string | null; // consecutivo del comprobante que ajusta una Nota
  onClose: () => void;
  onReenviarCorreo: (idFactura: number) => Promise<NotificationLog>;
}

const ESTADO_TONO: Record<string, BadgeTone> = {
  FIRMADA: 'neutral',
  ENVIADA: 'warning',
  ACEPTADA: 'success',
  RECHAZADA: 'danger',
  ERROR: 'danger',
  ANULADA: 'neutral',
  SIMULADA: 'info'
};

// Catálogo de tipos de identificación de Hacienda.
const TIPO_IDENTIFICACION: Record<string, string> = {
  '01': 'Cédula Física',
  '02': 'Cédula Jurídica',
  '03': 'DIMEX',
  '04': 'NITE'
};

export default function FacturaDetailView({ factura, patient, company, referencia, onClose, onReenviarCorreo }: FacturaDetailViewProps) {
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState('');
  const esNotaCredito = factura.tipoDocumento === '03';
  const esNotaDebito = factura.tipoDocumento === '02';
  const esNota = esNotaCredito || esNotaDebito;
  const esCredito = factura.condicionVenta === '02';

  const triggerPrint = () => window.print();

  const handleReenviar = async () => {
    setEnviando(true);
    setError('');
    try {
      await onReenviarCorreo(factura.id);
      setEnviado(true);
      setTimeout(() => setEnviado(false), 3000);
    } catch (err: any) {
      setError(err.message || 'No se pudo reenviar la factura por correo.');
    } finally {
      setEnviando(false);
    }
  };

  const condicion = esCredito
    ? `Crédito${factura.plazoCredito ? ` a ${factura.plazoCredito} días` : ''}`
    : `Contado${!esNotaCredito ? ` · ${MEDIO_PAGO_HACIENDA[factura.medioPago] || factura.medioPago}` : ''}`;

  // Portal a document.body: FacturaDetailView se monta anidado dentro de FacturacionManager
  // (a diferencia de ReportView, que reemplaza toda la pantalla desde App.tsx), así que sin el
  // portal quedaría atrapado dentro del padding/bordes de esa tarjeta. Usa `absolute` con alto
  // automático (no `fixed`, y sin fijar `bottom`) para superponerse en pantalla — la mayoría de
  // navegadores paginan mal o directamente no imprimen contenido `position: fixed` (queda
  // recortado al alto de un solo viewport, o la página sale en blanco); un alto fijo/forzado
  // tiene el mismo problema. Con alto automático, la página crece y pagina con normalidad.
  return createPortal(
    // Zonas seguras de iOS en móvil (notch arriba, barra de inicio abajo); en impresión sin relleno.
    <div className="absolute top-0 left-0 right-0 z-50 bg-bg px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6 print:bg-white print:p-0">
      {/* Top action toolbar - hidden in Print. En móvil queda fija arriba al desplazarse. */}
      <div className="sticky top-[env(safe-area-inset-top,0px)] z-10 sm:static max-w-3xl mx-auto mb-5 bg-surface rounded-card border border-border shadow-sm p-3 sm:p-4 flex flex-wrap justify-between items-center gap-3 print:hidden">
        <div className="min-w-0">
          <h3 className="text-heading font-semibold text-fg break-words">{esNotaCredito ? 'Nota de Crédito' : esNotaDebito ? 'Nota de Débito' : 'Factura'} {factura.consecutivo}</h3>
          <p className="text-xs text-fg-muted">Imprima o reenvíe el comprobante al cliente</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center w-full sm:w-auto [&>*]:flex-1 sm:[&>*]:flex-none">
          <Button
            variant="outline"
            onClick={handleReenviar}
            disabled={enviando}
            icon={enviando ? <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Mail className="w-4 h-4" aria-hidden="true" />}
          >
            <span aria-live="polite">{enviando ? 'Enviando…' : enviado ? '¡Correo enviado!' : 'Enviar a correo'}</span>
          </Button>
          <Button onClick={triggerPrint} icon={<Printer className="w-4 h-4" aria-hidden="true" />}>
            Imprimir
          </Button>
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
        </div>
      </div>

      {error && (
        <div role="alert" className="max-w-3xl mx-auto mb-4 p-3 rounded-control bg-danger-soft border border-danger/20 text-danger text-xs print:hidden">{error}</div>
      )}

      {/* Printable document: comprobante. El color de la clínica se aplica en línea para que se imprima igual. */}
      <div className="max-w-3xl mx-auto bg-surface rounded-panel border border-border shadow-md overflow-hidden print:rounded-none print:border-none print:shadow-none">
        <div className="h-1.5 print:h-1" style={{ backgroundColor: company.colorPrimario, printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }} aria-hidden="true" />
        <div className="p-6 sm:p-8 space-y-6 print:p-4">
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pb-6 border-b border-border">
          <div className="flex items-center gap-4">
            {company.logoUrl && (
              <img
                src={company.logoUrl}
                alt=""
                className="w-16 h-16 object-cover rounded-control border border-border"
                referrerPolicy="no-referrer"
              />
            )}
            <div>
              <h2 className="text-title font-semibold tracking-tight text-fg">{company.nombreComercial}</h2>
              <p className="text-xs text-fg-muted mt-0.5">{company.razonSocial}</p>
              <p className="text-xs text-fg-muted tabular-nums">{TIPO_IDENTIFICACION[company.tipoIdentificacion] || 'Identificación'}: {company.identificacion}</p>
              {company.correoEmisor && <p className="text-xs text-fg-muted">{company.correoEmisor}</p>}
            </div>
          </div>
          <div className="sm:text-right text-xs text-fg-muted">
            <span className="font-semibold text-body inline-flex items-center gap-1.5 sm:justify-end" style={{ color: company.colorPrimario }}>
              {esNotaCredito ? <FileMinus className="w-4 h-4" aria-hidden="true" /> : esNotaDebito ? <FilePlus className="w-4 h-4" aria-hidden="true" /> : <Receipt className="w-4 h-4" aria-hidden="true" />}
              {esNotaCredito ? 'NOTA DE CRÉDITO ELECTRÓNICA' : esNotaDebito ? 'NOTA DE DÉBITO ELECTRÓNICA' : 'FACTURA ELECTRÓNICA'}
            </span>
            <span className="block mt-1 tabular-nums">Consecutivo: {factura.consecutivo}</span>
            <span className="block break-all sm:max-w-xs">Clave: {factura.clave}</span>
            <span className="block">Fecha: {new Date(factura.fechaEmision).toLocaleString('es-CR')}</span>
            {esNota && referencia && <span className="block">Referencia: factura {referencia}</span>}
            <Badge tone={ESTADO_TONO[factura.estado] || 'neutral'} className="mt-1.5">{factura.estado}</Badge>
          </div>
        </div>

        <div className="bg-surface-muted rounded-card p-4 text-sm print:bg-white print:border print:border-border">
          <span className="text-caption font-semibold text-fg-muted uppercase tracking-wider block mb-2">Receptor</span>
          <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] sm:grid-cols-[repeat(4,minmax(0,1fr))] gap-4">
            <div>
              <span className="text-fg-muted block text-xs">Nombre</span>
              <span className="font-semibold text-fg block break-words">{patient.nombreCompleto || factura.receptorNombre || `Receptor #${factura.idPaciente}`}</span>
            </div>
            <div>
              <span className="text-fg-muted block text-xs">Identificación</span>
              <span className="font-medium text-fg block tabular-nums">{patient.identificacion || factura.receptorIdentificacion || '—'}</span>
            </div>
            <div>
              <span className="text-fg-muted block text-xs">Correo</span>
              <span className="font-medium text-fg block break-all">{patient.correoElectronico || 'No registrado'}</span>
            </div>
            <div>
              <span className="text-fg-muted block text-xs">Condición de venta</span>
              <span className="font-medium text-fg block">{condicion}</span>
            </div>
          </div>
        </div>

        {esNota && factura.motivoAnulacion && (
          <div className={`p-3 rounded-control border text-xs ${esNotaCredito ? 'bg-danger-soft border-danger/20 text-danger' : 'bg-warning-soft border-warning/25 text-warning'}`}>
            <span className="font-semibold block mb-0.5">Motivo</span>
            {factura.motivoAnulacion}
          </div>
        )}

        {/* Móvil: líneas como tarjetas apiladas (sin scroll horizontal). En impresión siempre la tabla. */}
        <ul className="sm:hidden print:hidden space-y-2" aria-label="Líneas del comprobante">
          {factura.lineas.map((l, idx) => (
            <li key={idx} className="p-3 rounded-control border border-border bg-surface-muted/50 text-xs">
              <span className="font-semibold text-fg block text-sm break-words">{l.detalle}</span>
              <span className="text-caption text-fg-muted tabular-nums">CABYS {l.codigoCabys}</span>
              <dl className="mt-2 grid grid-cols-[repeat(2,minmax(0,1fr))] gap-x-3 gap-y-1">
                <dt className="text-fg-muted">Cantidad</dt>
                <dd className="text-right text-fg tabular-nums">{l.cantidad}</dd>
                <dt className="text-fg-muted">Precio unit.</dt>
                <dd className="text-right text-fg tabular-nums">{colones(l.precioUnitario)}</dd>
                <dt className="text-fg-muted">Subtotal</dt>
                <dd className="text-right text-fg tabular-nums">{colones(l.subTotal)}</dd>
                <dt className="text-fg-muted">IVA ({Number(l.porcentajeIva) > 0 ? `${l.porcentajeIva}%` : 'Exento'})</dt>
                <dd className="text-right text-fg tabular-nums">{colones(l.montoIva)}</dd>
                <dt className="font-semibold text-fg border-t border-border pt-1">Total</dt>
                <dd className="text-right font-semibold text-fg tabular-nums border-t border-border pt-1">{colones(l.montoTotalLinea)}</dd>
              </dl>
            </li>
          ))}
        </ul>

        <div className="hidden sm:block print:block overflow-x-auto">
          <table className="w-full text-xs min-w-[34rem]">
            <thead>
              <tr className="text-left text-fg-muted uppercase text-caption tracking-wider border-b border-border-strong">
                <th scope="col" className="py-2 pr-3">Detalle</th>
                <th scope="col" className="py-2 pr-3 text-center">Cant.</th>
                <th scope="col" className="py-2 pr-3 text-right">Precio unit.</th>
                <th scope="col" className="py-2 pr-3 text-right">Subtotal</th>
                <th scope="col" className="py-2 pr-3 text-right">IVA</th>
                <th scope="col" className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {factura.lineas.map((l, idx) => (
                <tr key={idx} className="border-b border-border align-top">
                  <td className="py-2.5 pr-3">
                    <span className="font-semibold text-fg block">{l.detalle}</span>
                    <span className="text-caption text-fg-muted tabular-nums">CABYS {l.codigoCabys}</span>
                  </td>
                  <td className="py-2.5 pr-3 text-center text-fg-muted tabular-nums">{l.cantidad}</td>
                  <td className="py-2.5 pr-3 text-right text-fg-muted tabular-nums">{colones(l.precioUnitario)}</td>
                  <td className="py-2.5 pr-3 text-right text-fg-muted tabular-nums">{colones(l.subTotal)}</td>
                  <td className="py-2.5 pr-3 text-right text-fg-muted tabular-nums">
                    {colones(l.montoIva)}
                    <span className="block text-caption text-fg-subtle">{Number(l.porcentajeIva) > 0 ? `${l.porcentajeIva}%` : 'Exento'}</span>
                  </td>
                  <td className="py-2.5 text-right font-semibold text-fg tabular-nums">{colones(l.montoTotalLinea)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end">
          <dl className="w-full sm:w-72 text-sm space-y-1.5">
            <div className="flex justify-between">
              <dt className="text-fg-muted">Subtotal</dt>
              <dd className="font-medium text-fg tabular-nums">{colones(factura.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-fg-muted">IVA</dt>
              <dd className="font-medium text-fg tabular-nums">{colones(factura.totalIva)}</dd>
            </div>
            <div className="flex justify-between items-baseline border-t-2 border-fg pt-2 mt-1">
              <dt className="text-fg font-semibold">Total</dt>
              <dd className="font-bold text-fg text-heading tabular-nums">{colones(factura.total)}</dd>
            </div>
            {!esNota && factura.montoRecibido != null && (
              <div className="flex justify-between text-fg-muted text-xs">
                <dt>Vuelto</dt>
                <dd className="tabular-nums">{colones(factura.montoRecibido - factura.total)}</dd>
              </div>
            )}
          </dl>
        </div>

        {factura.mensajeError && (factura.estado === 'ERROR' || factura.estado === 'RECHAZADA') && (
          <div className="p-3 rounded-control bg-danger-soft border border-danger/20 text-xs text-danger">
            {factura.mensajeError}
          </div>
        )}
        </div>
      </div>
    </div>,
    document.body
  );
}
