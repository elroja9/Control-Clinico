import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Factura, Patient, Company, NotificationLog } from '../data/mockData';
import { Printer, Mail, RefreshCw, FileMinus, FilePlus, Receipt } from 'lucide-react';
import { MEDIO_PAGO_HACIENDA, colones } from '../utils/facturacion';

interface FacturaDetailViewProps {
  factura: Factura;
  patient: Patient;
  company: Company;
  referencia?: string | null; // consecutivo del comprobante que ajusta una Nota
  onClose: () => void;
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
    <div className="absolute top-0 left-0 right-0 z-50 bg-slate-50 p-4 sm:p-6 print:bg-white print:p-0">
      {/* Top action toolbar - hidden in Print */}
      <div className="max-w-3xl mx-auto mb-6 bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-wrap justify-between items-center gap-3 print:hidden">
        <div>
          <h3 className="text-sm font-bold text-slate-800">{esNotaCredito ? 'Nota de Crédito' : esNotaDebito ? 'Nota de Débito' : 'Factura'} {factura.consecutivo}</h3>
          <p className="text-[11px] text-slate-600">Imprima o reenvíe el comprobante al cliente</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs items-center w-full sm:w-auto">
          <button
            type="button"
            onClick={handleReenviar}
            disabled={enviando}
            className="min-h-10 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-3 rounded-xl border border-slate-200 transition-colors flex items-center gap-1.5 disabled:opacity-60"
          >
            {enviando ? <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Mail className="w-4 h-4" aria-hidden="true" />}
            <span aria-live="polite">{enviando ? 'Enviando…' : enviado ? '¡Correo enviado!' : 'Enviar a correo'}</span>
          </button>
          <button
            type="button"
            onClick={triggerPrint}
            className="min-h-10 text-white font-semibold px-4 rounded-xl shadow-md transition-opacity hover:opacity-90 flex items-center gap-1.5"
            style={{ backgroundColor: company.colorPrimario }}
          >
            <Printer className="w-4 h-4" aria-hidden="true" />
            Imprimir
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold px-4 rounded-xl"
          >
            Cerrar
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="max-w-3xl mx-auto mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs print:hidden">{error}</div>
      )}

      {/* Printable document */}
      <div className="max-w-3xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-md p-6 sm:p-8 space-y-6 print:border-none print:shadow-none print:p-0">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b-2 pb-6 gap-4" style={{ borderColor: company.colorPrimario }}>
          <div className="flex items-center gap-4">
            {company.logoUrl && (
              <img
                src={company.logoUrl}
                alt=""
                className="w-16 h-16 object-cover rounded-xl border border-slate-200 shadow-xs"
                referrerPolicy="no-referrer"
              />
            )}
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">{company.nombreComercial}</h2>
              <p className="text-xs text-slate-600 font-mono mt-0.5">{company.razonSocial}</p>
              <p className="text-[11px] text-slate-600 font-mono">{TIPO_IDENTIFICACION[company.tipoIdentificacion] || 'Identificación'}: {company.identificacion}</p>
              {company.correoEmisor && <p className="text-[11px] text-slate-600 font-mono">{company.correoEmisor}</p>}
            </div>
          </div>
          <div className="sm:text-right font-mono text-xs text-slate-600">
            <span className="font-bold inline-flex items-center gap-1.5 sm:justify-end" style={{ color: company.colorPrimario }}>
              {esNotaCredito ? <FileMinus className="w-4 h-4" aria-hidden="true" /> : esNotaDebito ? <FilePlus className="w-4 h-4" aria-hidden="true" /> : <Receipt className="w-4 h-4" aria-hidden="true" />}
              {esNotaCredito ? 'NOTA DE CRÉDITO ELECTRÓNICA' : esNotaDebito ? 'NOTA DE DÉBITO ELECTRÓNICA' : 'FACTURA ELECTRÓNICA'}
            </span>
            <span className="block mt-1">Consecutivo: {factura.consecutivo}</span>
            <span className="block break-all">Clave: {factura.clave}</span>
            <span className="block">Fecha: {new Date(factura.fechaEmision).toLocaleString('es-CR')}</span>
            {esNota && referencia && <span className="block">Referencia: factura {referencia}</span>}
            <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-full mt-1 ${ESTADO_ESTILO[factura.estado] || 'bg-slate-100 text-slate-700'}`}>
              {factura.estado}
            </span>
          </div>
        </div>

        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/60 text-xs sm:text-sm">
          <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-2">Receptor</span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <span className="text-slate-600 block text-[11px]">Nombre:</span>
              <span className="font-bold text-slate-800 block">{patient.nombreCompleto || factura.receptorNombre || `Receptor #${factura.idPaciente}`}</span>
            </div>
            <div>
              <span className="text-slate-600 block text-[11px]">Identificación:</span>
              <span className="font-semibold text-slate-800 block font-mono">{patient.identificacion || factura.receptorIdentificacion || '—'}</span>
            </div>
            <div>
              <span className="text-slate-600 block text-[11px]">Correo:</span>
              <span className="font-semibold text-slate-800 block truncate">{patient.correoElectronico || 'No registrado'}</span>
            </div>
            <div>
              <span className="text-slate-600 block text-[11px]">Condición de venta:</span>
              <span className="font-semibold text-slate-800 block">{condicion}</span>
            </div>
          </div>
        </div>

        {esNota && factura.motivoAnulacion && (
          <div className={`p-3 rounded-xl border text-xs ${esNotaCredito ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
            <span className="font-bold block mb-0.5">Motivo</span>
            {factura.motivoAnulacion}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-600 uppercase text-[11px] tracking-wider border-b border-slate-200">
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
                <tr key={idx} className="border-b border-slate-100 align-top">
                  <td className="py-2 pr-3">
                    <span className="font-semibold text-slate-800 block">{l.detalle}</span>
                    <span className="text-[11px] text-slate-600 font-mono">CABYS {l.codigoCabys}</span>
                  </td>
                  <td className="py-2 pr-3 text-center text-slate-700 tabular-nums">{l.cantidad}</td>
                  <td className="py-2 pr-3 text-right text-slate-700 tabular-nums">{colones(l.precioUnitario)}</td>
                  <td className="py-2 pr-3 text-right text-slate-700 tabular-nums">{colones(l.subTotal)}</td>
                  <td className="py-2 pr-3 text-right text-slate-700 tabular-nums">
                    {colones(l.montoIva)}
                    <span className="block text-[11px] text-slate-600">{Number(l.porcentajeIva) > 0 ? `${l.porcentajeIva}%` : 'Exento'}</span>
                  </td>
                  <td className="py-2 text-right font-semibold text-slate-800 tabular-nums">{colones(l.montoTotalLinea)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end">
          <dl className="w-full sm:w-64 text-xs space-y-1">
            <div className="flex justify-between">
              <dt className="text-slate-600">Subtotal</dt>
              <dd className="font-semibold text-slate-700 tabular-nums">{colones(factura.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-600">IVA</dt>
              <dd className="font-semibold text-slate-700 tabular-nums">{colones(factura.totalIva)}</dd>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1">
              <dt className="text-slate-800 font-bold">Total</dt>
              <dd className="font-bold text-slate-900 text-sm tabular-nums">{colones(factura.total)}</dd>
            </div>
            {!esNota && factura.montoRecibido != null && (
              <div className="flex justify-between text-slate-600">
                <dt>Vuelto</dt>
                <dd className="tabular-nums">{colones(factura.montoRecibido - factura.total)}</dd>
              </div>
            )}
          </dl>
        </div>

        {factura.mensajeError && (factura.estado === 'ERROR' || factura.estado === 'RECHAZADA') && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
            {factura.mensajeError}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
