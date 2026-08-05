import { useState } from 'react';
import { Factura, Patient, Company, NotificationLog } from '../data/mockData';
import { Printer, Mail, RefreshCw, X, FileMinus, Receipt } from 'lucide-react';

interface FacturaDetailViewProps {
  factura: Factura;
  patient: Patient;
  company: Company;
  onClose: () => void;
  onReenviarCorreo: (idFactura: number) => Promise<NotificationLog>;
}

const ESTADO_ESTILO: Record<string, string> = {
  FIRMADA: 'bg-slate-100 text-slate-700',
  ENVIADA: 'bg-amber-100 text-amber-800',
  ACEPTADA: 'bg-emerald-100 text-emerald-800',
  RECHAZADA: 'bg-rose-100 text-rose-800',
  ERROR: 'bg-rose-100 text-rose-800',
  ANULADA: 'bg-slate-200 text-slate-600',
  SIMULADA: 'bg-sky-100 text-sky-700'
};

const MEDIO_PAGO_LABEL: Record<string, string> = {
  '01': 'Efectivo',
  '02': 'Tarjeta',
  '06': 'SINPE Móvil'
};

const CONDICION_VENTA_LABEL: Record<string, string> = {
  '01': 'Contado',
  '02': 'Crédito'
};

function colones(n: number): string {
  return `₡${n.toLocaleString('es-CR', { maximumFractionDigits: 2 })}`;
}

export default function FacturaDetailView({ factura, patient, company, onClose, onReenviarCorreo }: FacturaDetailViewProps) {
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState('');
  const esNotaCredito = factura.tipoDocumento === '03';

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

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-50 p-4 sm:p-6 print:bg-white print:p-0 print:static print:overflow-visible">
      {/* Top action toolbar - hidden in Print */}
      <div className="max-w-3xl mx-auto mb-6 bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-wrap justify-between items-center gap-3 print:hidden">
        <div>
          <h3 className="text-sm font-bold text-slate-800">{esNotaCredito ? 'Nota de Crédito' : 'Factura'} {factura.consecutivo}</h3>
          <p className="text-[11px] text-slate-500">Imprime o reenvía el comprobante al paciente</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs items-center w-full sm:w-auto">
          <button
            onClick={handleReenviar}
            disabled={enviando}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2 px-3 rounded-xl border border-slate-200 transition-all flex items-center gap-1.5 disabled:opacity-60"
          >
            {enviando ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
            {enviando ? 'Enviando...' : enviado ? '¡Correo Enviado!' : 'Enviar a Correo'}
          </button>
          <button
            onClick={triggerPrint}
            className="text-white font-semibold py-2 px-4 rounded-xl shadow-md transition-all flex items-center gap-1.5"
            style={{ backgroundColor: company.colorPrimario }}
          >
            <Printer className="w-4 h-4" />
            Imprimir
          </button>
          <button
            onClick={onClose}
            className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-2 px-4 rounded-xl"
          >
            Cerrar
          </button>
        </div>
      </div>

      {error && (
        <div className="max-w-3xl mx-auto mb-4 p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-xs print:hidden">{error}</div>
      )}

      {/* Printable document */}
      <div className="max-w-3xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-md p-6 sm:p-8 space-y-6 print:border-none print:shadow-none print:p-0">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b-2 pb-6 gap-4" style={{ borderColor: company.colorPrimario }}>
          <div className="flex items-center gap-4">
            <img
              src={company.logoUrl}
              alt={company.nombreComercial}
              className="w-16 h-16 object-cover rounded-xl border border-slate-200 shadow-xs"
              referrerPolicy="no-referrer"
            />
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">{company.nombreComercial}</h2>
              <p className="text-xs text-slate-500 font-mono mt-0.5">{company.razonSocial}</p>
              <p className="text-[10px] text-slate-400 font-mono">ID Hacienda: {company.identificacion} | Cédula Jurídica</p>
            </div>
          </div>
          <div className="text-right font-mono text-xs text-slate-500">
            <span className="block font-bold inline-flex items-center gap-1.5 justify-end" style={{ color: company.colorPrimario }}>
              {esNotaCredito ? <FileMinus className="w-4 h-4" /> : <Receipt className="w-4 h-4" />}
              {esNotaCredito ? 'NOTA DE CRÉDITO ELECTRÓNICA' : 'FACTURA ELECTRÓNICA'}
            </span>
            <span className="block mt-1">Consecutivo: {factura.consecutivo}</span>
            <span className="block break-all">Clave: {factura.clave}</span>
            <span className="block">Fecha: {new Date(factura.fechaEmision).toLocaleString('es-CR')}</span>
            <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 ${ESTADO_ESTILO[factura.estado] || 'bg-slate-100 text-slate-600'}`}>
              {factura.estado}
            </span>
          </div>
        </div>

        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/60 text-xs sm:text-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Receptor</span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <span className="text-slate-500 block text-[11px]">Nombre:</span>
              <span className="font-bold text-slate-800 block">{patient.nombreCompleto}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Identificación:</span>
              <span className="font-semibold text-slate-800 block font-mono">{patient.identificacion}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Correo:</span>
              <span className="font-semibold text-slate-800 block truncate">{patient.correoElectronico || 'No registrado'}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Condición de Venta:</span>
              <span className="font-semibold text-slate-800 block">{CONDICION_VENTA_LABEL[factura.condicionVenta] || factura.condicionVenta}{!esNotaCredito ? ` · ${MEDIO_PAGO_LABEL[factura.medioPago] || factura.medioPago}` : ''}</span>
            </div>
          </div>
        </div>

        {esNotaCredito && factura.motivoAnulacion && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-xs text-rose-700">
            <span className="font-bold block mb-0.5">Motivo de Anulación</span>
            {factura.motivoAnulacion}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-200">
                <th className="py-2 pr-3">Detalle</th>
                <th className="py-2 pr-3 text-center">Cant.</th>
                <th className="py-2 pr-3 text-right">Precio Unit.</th>
                <th className="py-2 pr-3 text-right">IVA</th>
                <th className="py-2 pr-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {factura.lineas.map((l, idx) => (
                <tr key={idx} className="border-b border-slate-50">
                  <td className="py-2 pr-3 font-semibold text-slate-800">{l.detalle}</td>
                  <td className="py-2 pr-3 text-center text-slate-600">{l.cantidad}</td>
                  <td className="py-2 pr-3 text-right text-slate-600">{colones(l.precioUnitario)}</td>
                  <td className="py-2 pr-3 text-right text-slate-600">{colones(l.montoIva)}</td>
                  <td className="py-2 pr-3 text-right font-semibold text-slate-800">{colones(l.montoTotalLinea)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end">
          <div className="w-full sm:w-64 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">Subtotal</span>
              <span className="font-semibold text-slate-700">{colones(factura.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">IVA</span>
              <span className="font-semibold text-slate-700">{colones(factura.totalIva)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1">
              <span className="text-slate-800 font-bold">Total</span>
              <span className="font-bold text-slate-900 text-sm">{colones(factura.total)}</span>
            </div>
            {!esNotaCredito && factura.montoRecibido != null && (
              <div className="flex justify-between text-slate-500">
                <span>Vuelto</span>
                <span>{colones(factura.montoRecibido - factura.total)}</span>
              </div>
            )}
          </div>
        </div>

        {factura.mensajeError && (factura.estado === 'ERROR' || factura.estado === 'RECHAZADA') && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-xs text-rose-700">
            {factura.mensajeError}
          </div>
        )}
      </div>
    </div>
  );
}
