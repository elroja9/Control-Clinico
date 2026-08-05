import { Patient, Consultation, Company, NotificationLog, Servicio, Factura } from '../data/mockData';
import { Printer, Download, Share2, Mail, CheckCircle2, Sliders, Calendar, User, Info, Heart, Dumbbell, RefreshCw, Receipt } from 'lucide-react';
import { useState } from 'react';
import FacturarModal from './FacturarModal';

interface ReportViewProps {
  consultation: Consultation;
  patient: Patient;
  company: Company;
  servicios: Servicio[];
  facturas: Factura[];
  onClose: () => void;
  onNotificationSent: (log: NotificationLog) => void;
  onConsultationUpdated: (consulta: Consultation) => void;
  onCrearFactura: (payload: {
    idCompania: number;
    idCita: number | null;
    idConsulta: number | null;
    idPaciente: number;
    condicionVenta: string;
    medioPago: string;
    montoRecibido: number | null;
    modoPrueba: boolean;
    lineas: Array<{ idServicio: number; cantidad: number }>;
  }) => Promise<Factura>;
  onVerificarEstadoFactura: (idFactura: number) => Promise<Factura>;
}

const FORMULA_LABEL: Record<string, string> = {
  HARRIS_BENEDICT_OBESOS: 'Harris Benedict (Obesos)',
  MIFFLIN_ST_JEOR: 'Mifflin St Jeor',
  MULLER: 'Müller'
};

const DIRECCION_LABEL: Record<string, string> = {
  DEFICIT: 'Déficit',
  MANTENIMIENTO: 'Mantenimiento',
  SUPERAVIT: 'Superávit'
};

// 4 kcal/g carbohidratos y proteína, 9 kcal/g grasa — misma conversión que antes usaba
// ConsultationForm al aplicar una plantilla (ahora movida aquí, que es el único lugar que
// todavía necesita gramos: el dato guardado es % de la distribución calórica).
function gramosDesdeMacroPct(pct: number | null, totalCalorias: number, kcalPorGramo: 4 | 9): number | null {
  if (pct == null) return null;
  return Math.round((pct / 100) * totalCalorias / kcalPorGramo);
}

export default function ReportView({ consultation, patient, company, servicios, facturas, onClose, onNotificationSent, onConsultationUpdated, onCrearFactura, onVerificarEstadoFactura }: ReportViewProps) {
  const [emailSent, setEmailSent] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [facturando, setFacturando] = useState(false);
  const [estadoActual, setEstadoActual] = useState<'ABIERTA' | 'CERRADA'>(consultation.estado ?? 'ABIERTA');
  const [cambiandoEstado, setCambiandoEstado] = useState(false);

  const companyServicios = servicios.filter(s => s.idCompania === company.id && s.activo);
  // Una consulta solo puede tener una Factura (no Nota de Crédito) para siempre — ver el
  // UNIQUE en facturas.id_consulta (reutilizado tal cual desde ConsultorioDB_schema.sql), que
  // no distingue por estado ni se libera al anular. Corregir una factura ya emitida es una Nota
  // de Crédito contra la original (ver FacturacionManager), no una refacturación desde acá — el
  // botón se deshabilita apenas existe cualquier factura para esta consulta, anulada o no, para
  // que el estado del botón coincida siempre con lo que el servidor realmente va a aceptar.
  const facturaExistente = facturas.find(f => f.idConsulta === consultation.id && f.tipoDocumento === '01');

  const handleToggleEstado = async () => {
    const nuevoEstado = estadoActual === 'CERRADA' ? 'ABIERTA' : 'CERRADA';
    setCambiandoEstado(true);
    try {
      const res = await fetch(`/api/consultations/${consultation.id}/estado`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: nuevoEstado })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo actualizar el estado de la consulta.');
      setEstadoActual(nuevoEstado);
      onConsultationUpdated(data);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo actualizar el estado de la consulta.');
    } finally {
      setCambiandoEstado(false);
    }
  };

  const triggerPrint = () => {
    window.print();
  };

  const sendClientEmail = async () => {
    setIsSending(true);
    try {
      const res = await fetch('/api/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'CONSULTA',
          idCompania: company.id,
          patient,
          consultation
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo enviar el reporte.');
      onNotificationSent(data);
      setEmailSent(true);
      setTimeout(() => setEmailSent(false), 3000);
    } catch (err: any) {
      alert(`No se pudo enviar el reporte por correo: ${err.message}`);
    } finally {
      setIsSending(false);
    }
  };

  const getEvaLabel = (score: number) => {
    if (score >= 8) return 'Severo (Urgente)';
    if (score >= 5) return 'Moderado';
    return 'Leve / Tolerable';
  };

  return (
    <div className="bg-slate-50 min-h-screen p-4 sm:p-6 print:bg-white print:p-0">
      
      {/* Top action toolbar - hidden in Print */}
      <div className="max-w-4xl mx-auto mb-6 bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-wrap justify-between items-center gap-3 print:hidden">
        <div>
          <h3 className="text-sm font-bold text-slate-800">Visualizador de Reportes Clínicos</h3>
          <p className="text-[11px] text-slate-500">Imprime, descarga o envía la ficha del paciente</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs items-center w-full sm:w-auto">
          <span className={`font-bold px-2.5 py-1.5 rounded-xl border ${
            estadoActual === 'CERRADA'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-amber-50 border-amber-200 text-amber-700'
          }`}>
            {estadoActual}
          </span>
          <button
            onClick={handleToggleEstado}
            disabled={cambiandoEstado}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2 px-3 rounded-xl border border-slate-200 transition-all flex items-center gap-1.5 disabled:opacity-60"
          >
            <CheckCircle2 className="w-4 h-4" />
            {cambiandoEstado ? 'Guardando...' : estadoActual === 'CERRADA' ? 'Reabrir Consulta' : 'Cerrar Consulta'}
          </button>
          <button
            onClick={sendClientEmail}
            disabled={isSending}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2 px-3 rounded-xl border border-slate-200 transition-all flex items-center gap-1.5 disabled:opacity-60"
          >
            {isSending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
            {isSending ? 'Enviando...' : emailSent ? '¡Correo Enviado!' : 'Enviar a Correo'}
          </button>
          <button
            onClick={() => setFacturando(true)}
            disabled={!!facturaExistente}
            title={facturaExistente ? `Ya facturada (${facturaExistente.consecutivo})` : undefined}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2 px-3 rounded-xl border border-slate-200 transition-all flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Receipt className="w-4 h-4" />
            {facturaExistente ? `Facturada (${facturaExistente.consecutivo})` : 'Facturar'}
          </button>
          <button
            onClick={triggerPrint}
            className="text-white font-semibold py-2 px-4 rounded-xl shadow-md transition-all flex items-center gap-1.5"
            style={{ backgroundColor: company.colorPrimario }}
          >
            <Printer className="w-4 h-4" />
            Imprimir Reporte (PDF)
          </button>
          <button
            onClick={onClose}
            className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-2 px-4 rounded-xl"
          >
            Cerrar
          </button>
        </div>
      </div>

      {/* Main clinical document */}
      <div className="max-w-4xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-md p-6 sm:p-8 space-y-6 print:border-none print:shadow-none print:p-0">
        
        {/* Header containing custom Company values */}
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

          <div className="text-right sm:text-right font-mono text-xs text-slate-500">
            <span className="block font-bold" style={{ color: company.colorPrimario }}>REPORTE CLÍNICO INTEGRADO</span>
            <span className="block mt-1">Fecha: {consultation.fecha}</span>
            <span className="block">Folio Consulta: #{consultation.id.toString().slice(-6)}</span>
            <span className="block text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md mt-1 inline-block">
              {consultation.tipo === 'Nutrición' ? 'Especialidad: Nutrición Humana' : 'Especialidad: Fisioterapia y Kinesiología'}
            </span>
          </div>
        </div>

        {/* Patient credentials info card */}
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/60 text-xs sm:text-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Datos del Paciente</span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <span className="text-slate-500 block text-[11px]">Paciente:</span>
              <span className="font-bold text-slate-800 block">{patient.nombreCompleto}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Identificación:</span>
              <span className="font-semibold text-slate-800 block font-mono">{patient.identificacion}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Edad / Contacto:</span>
              <span className="font-semibold text-slate-800 block">{patient.edad} años | Tel: {patient.telefono}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Dirección:</span>
              <span className="font-medium text-slate-700 block truncate" title={patient.otrasSenas}>{patient.otrasSenas}</span>
            </div>
          </div>
        </div>

        {/* Core clinical report section */}
        <div className="space-y-6">
          
          {/* Motivo */}
          <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-150">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Motivo Principal del Encuentro</h4>
            <p className="text-sm font-semibold text-slate-800">{consultation.motivo}</p>
          </div>

          {/* ================= REPORT FOR NUTRICION ================= */}
          {consultation.tipo === 'Nutrición' && consultation.antropometria && (
            <div className="space-y-6">
              
              {/* Antropometria chart / metrics */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5" style={{ color: company.colorPrimario }}>
                  <Heart className="w-4 h-4" />
                  Composición Corporal y Antropometría
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60 text-center">
                    <span className="text-[10px] text-slate-500 block">Peso Corporal</span>
                    <span className="text-lg font-bold text-slate-900 block">{consultation.antropometria.peso} kg</span>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60 text-center">
                    <span className="text-[10px] text-slate-500 block">IMC</span>
                    <span className="text-lg font-bold text-slate-900 block">{consultation.antropometria.imc}</span>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60 text-center">
                    <span className="text-[10px] text-slate-500 block">Grasa Corporal</span>
                    <span className="text-lg font-bold text-rose-600 block">{consultation.antropometria.grasaCorporal}%</span>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60 text-center">
                    <span className="text-[10px] text-slate-500 block">Masa Muscular</span>
                    <span className="text-lg font-bold text-emerald-600 block">{consultation.antropometria.masaMuscular} kg</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-150 text-center">
                    <span className="text-[9.5px] text-slate-500 block">Grasa Visceral</span>
                    <span className="text-sm font-semibold text-slate-800 block">Nivel {consultation.antropometria.grasaVisceral}</span>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-150 text-center">
                    <span className="text-[9.5px] text-slate-500 block">Masa Ósea</span>
                    <span className="text-sm font-semibold text-slate-800 block">{consultation.antropometria.masaOsea} kg</span>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-150 text-center">
                    <span className="text-[9.5px] text-slate-500 block">Circunferencia Cintura</span>
                    <span className="text-sm font-semibold text-slate-800 block">{consultation.antropometria.cintura} cm</span>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-150 text-center">
                    <span className="text-[9.5px] text-slate-500 block">Perímetro Abdominal</span>
                    <span className="text-sm font-semibold text-slate-800 block">{consultation.antropometria.abdominal} cm</span>
                  </div>
                </div>
              </div>

              {/* Prescripción Calórica */}
              {consultation.dieta?.prescripcionCalorica && (
                <div className="border-t border-slate-150 pt-5">
                  <h4 className="text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5" style={{ color: company.colorPrimario }}>
                    <Sliders className="w-4 h-4" />
                    Prescripción Calórica
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60 text-center">
                      <span className="text-[10px] text-slate-500 block">Fórmula</span>
                      <span className="text-sm font-bold text-slate-900 block">{FORMULA_LABEL[consultation.dieta.prescripcionCalorica.formula] || consultation.dieta.prescripcionCalorica.formula}</span>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60 text-center">
                      <span className="text-[10px] text-slate-500 block">TMB</span>
                      <span className="text-lg font-bold text-slate-900 block">{consultation.dieta.prescripcionCalorica.tmb} kcal</span>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60 text-center">
                      <span className="text-[10px] text-slate-500 block">Objetivo</span>
                      <span className="text-sm font-bold text-slate-900 block">{DIRECCION_LABEL[consultation.dieta.prescripcionCalorica.direccion] || consultation.dieta.prescripcionCalorica.direccion} {consultation.dieta.prescripcionCalorica.porcentaje}%</span>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60 text-center">
                      <span className="text-[10px] text-slate-500 block">Presupuesto Calórico</span>
                      <span className="text-lg font-bold text-teal-600 block">{consultation.dieta.totalCalorias} kcal</span>
                    </div>
                  </div>
                  {consultation.dieta.macros && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                      <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-150 text-center">
                        <span className="text-[9.5px] text-slate-500 block">Carbohidratos</span>
                        <span className="text-sm font-semibold text-slate-800 block">
                          {consultation.dieta.macros.carbohidratosPct != null ? `${consultation.dieta.macros.carbohidratosPct}%` : '—'}
                          {consultation.dieta.macros.carbohidratosPct != null && ` (${gramosDesdeMacroPct(consultation.dieta.macros.carbohidratosPct, consultation.dieta.totalCalorias, 4)} g)`}
                        </span>
                      </div>
                      <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-150 text-center">
                        <span className="text-[9.5px] text-slate-500 block">Proteínas</span>
                        <span className="text-sm font-semibold text-slate-800 block">
                          {consultation.dieta.macros.proteinasPct != null ? `${consultation.dieta.macros.proteinasPct}%` : '—'}
                          {consultation.dieta.macros.proteinasPct != null && ` (${gramosDesdeMacroPct(consultation.dieta.macros.proteinasPct, consultation.dieta.totalCalorias, 4)} g)`}
                        </span>
                      </div>
                      <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-150 text-center">
                        <span className="text-[9.5px] text-slate-500 block">Grasas</span>
                        <span className="text-sm font-semibold text-slate-800 block">
                          {consultation.dieta.macros.grasasPct != null ? `${consultation.dieta.macros.grasasPct}%` : '—'}
                          {consultation.dieta.macros.grasasPct != null && ` (${gramosDesdeMacroPct(consultation.dieta.macros.grasasPct, consultation.dieta.totalCalorias, 9)} g)`}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Diet Plan Schedule */}
              {consultation.dieta && (
                <div className="border-t border-slate-150 pt-5">
                  <h4 className="text-xs font-bold uppercase tracking-wider mb-4 flex items-center gap-1.5" style={{ color: company.colorPrimario }}>
                    <Calendar className="w-4 h-4" />
                    Plan Alimentario Recomendado ({consultation.dieta.totalCalorias} kcal)
                  </h4>
                  <div className="space-y-3">
                    <div className="bg-slate-50 rounded-xl p-3 border-l-4 border-l-orange-500 flex items-start gap-4 text-xs">
                      <div className="font-bold text-slate-700 w-24 shrink-0">Desayuno:</div>
                      <div className="text-slate-800">{consultation.dieta.desayuno}</div>
                    </div>
                    {(consultation.dieta.meriendaManana || consultation.dieta.meriendaTarde) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {consultation.dieta.meriendaManana && (
                          <div className="bg-slate-50 rounded-xl p-3 border-l-4 border-l-teal-500 flex items-start gap-3 text-xs">
                            <div className="font-bold text-slate-700 w-16 shrink-0">Merienda AM:</div>
                            <div className="text-slate-800">{consultation.dieta.meriendaManana}</div>
                          </div>
                        )}
                        {consultation.dieta.meriendaTarde && (
                          <div className="bg-slate-50 rounded-xl p-3 border-l-4 border-l-teal-500 flex items-start gap-3 text-xs">
                            <div className="font-bold text-slate-700 w-16 shrink-0">Merienda PM:</div>
                            <div className="text-slate-800">{consultation.dieta.meriendaTarde}</div>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="bg-slate-50 rounded-xl p-3 border-l-4 border-l-teal-600 flex items-start gap-4 text-xs">
                      <div className="font-bold text-slate-700 w-24 shrink-0">Almuerzo:</div>
                      <div className="text-slate-800">{consultation.dieta.almuerzo}</div>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3 border-l-4 border-l-indigo-500 flex items-start gap-4 text-xs">
                      <div className="font-bold text-slate-700 w-24 shrink-0">Cena:</div>
                      <div className="text-slate-800">{consultation.dieta.cena}</div>
                    </div>
                    {consultation.dieta.indicaciones && (
                      <div className="bg-orange-50/50 rounded-xl p-4 border border-orange-100 text-xs">
                        <span className="font-bold text-orange-900 block mb-1">Recomendaciones Nutricionales del Profesional</span>
                        <p className="text-orange-850 leading-relaxed">{consultation.dieta.indicaciones}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================= REPORT FOR FISIOTERAPIA ================= */}
          {consultation.tipo === 'Fisioterapia' && consultation.fisioterapia && (
            <div className="space-y-6">
              
              {/* Pain Map & EVA report details */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-slate-150 pt-5 text-xs">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60 text-center">
                  <span className="text-[10px] text-slate-500 block uppercase font-bold mb-1">Foco de Dolor</span>
                  <span className="text-sm font-extrabold text-slate-800 uppercase block">📍 {consultation.fisioterapia.zonaDolor}</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60 text-center">
                  <span className="text-[10px] text-slate-500 block uppercase font-bold mb-1">Escala de Dolor EVA</span>
                  <span className="text-lg font-extrabold text-rose-600 block">{consultation.fisioterapia.evaDolor} de 10</span>
                  <span className="text-[9px] font-bold text-slate-400 uppercase">{getEvaLabel(consultation.fisioterapia.evaDolor)}</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60 text-center">
                  <span className="text-[10px] text-slate-500 block uppercase font-bold mb-1">Tipo de Dolor</span>
                  <span className="text-sm font-semibold text-slate-800 block">{consultation.fisioterapia.tipoDolor}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-150">
                  <span className="font-bold text-slate-500 block mb-1">Factores que empeoran (Agravantes):</span>
                  <p className="text-slate-800">{consultation.fisioterapia.factoresAgravantes}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-150">
                  <span className="font-bold text-slate-500 block mb-1">Factores que alivian (Atenuantes):</span>
                  <p className="text-slate-800">{consultation.fisioterapia.factoresAtenuantes}</p>
                </div>
              </div>

              {/* Physical examination summary */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5" style={{ color: company.colorPrimario }}>
                  <Dumbbell className="w-4 h-4" />
                  Valoración de Examen Físico Funcional
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-150">
                    <span className="font-bold text-slate-600 block mb-1">Inspección de Postura</span>
                    <p className="text-slate-800 leading-relaxed">{consultation.fisioterapia.posturaObservaciones}</p>
                  </div>
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-150">
                    <span className="font-bold text-slate-600 block mb-1">Hallazgos a la Palpación</span>
                    <p className="text-slate-800 leading-relaxed">{consultation.fisioterapia.palpacionHallazgos}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 text-xs">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-150">
                    <span className="font-bold text-slate-500 block mb-0.5">Rangos Movilidad (ROM)</span>
                    <p className="text-slate-800 font-medium">{consultation.fisioterapia.romMedido}</p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-150">
                    <span className="font-bold text-slate-500 block mb-0.5">Fuerza Daniels</span>
                    <p className="text-slate-800 font-medium">{consultation.fisioterapia.fuerzaDaniels}</p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-150">
                    <span className="font-bold text-slate-500 block mb-0.5">Pruebas Especiales</span>
                    <p className="text-slate-800 font-medium">{consultation.fisioterapia.pruebasEspeciales}</p>
                  </div>
                </div>
              </div>

              {/* Prescription */}
              <div className="border-t border-slate-150 pt-5">
                <h4 className="text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5" style={{ color: company.colorPrimario }}>
                  <Calendar className="w-4 h-4" />
                  Prescripción Terapéutica e Intervenciones
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-xs">
                  <div className="bg-teal-50/20 p-3 rounded-xl border border-teal-100">
                    <span className="font-bold text-teal-900 block mb-1">Agentes Físicos</span>
                    <p className="text-teal-950">{consultation.fisioterapia.agentesFisicos}</p>
                  </div>
                  <div className="bg-teal-50/20 p-3 rounded-xl border border-teal-100">
                    <span className="font-bold text-teal-900 block mb-1">Terapia Manual</span>
                    <p className="text-teal-950">{consultation.fisioterapia.terapiaManual}</p>
                  </div>
                  <div className="bg-teal-50/20 p-3 rounded-xl border border-teal-100">
                    <span className="font-bold text-teal-900 block mb-1">Ejercicio Terapéutico</span>
                    <p className="text-teal-950">{consultation.fisioterapia.ejercicioTerapeutico}</p>
                  </div>
                </div>
              </div>

              {/* SOAP Evolution */}
              <div className="bg-slate-900 text-white p-5 rounded-2xl space-y-4">
                <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span className="text-[10px] font-bold text-teal-400 uppercase tracking-wider">Nota SOAP Oficial de Terapia Física</span>
                  <span className="text-[9px] text-slate-500 font-mono">Ciclo Sugerido: {consultation.fisioterapia.sesionesSugeridas} Sesiones</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/60">
                    <span className="text-rose-400 font-extrabold block mb-1">S (Subjetivo)</span>
                    <p className="text-slate-300 leading-relaxed">{consultation.fisioterapia.soapSubjetivo}</p>
                  </div>
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/60">
                    <span className="text-amber-400 font-extrabold block mb-1">O (Objetivo)</span>
                    <p className="text-slate-300 leading-relaxed">{consultation.fisioterapia.soapObjetivo}</p>
                  </div>
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/60">
                    <span className="text-emerald-400 font-extrabold block mb-1">A (Análisis)</span>
                    <p className="text-slate-300 leading-relaxed">{consultation.fisioterapia.soapAnalisis}</p>
                  </div>
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/60">
                    <span className="text-blue-400 font-extrabold block mb-1">P (Plan)</span>
                    <p className="text-slate-300 leading-relaxed">{consultation.fisioterapia.soapPlan}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Clinician's recommendations */}
          {consultation.anotacionesGenerales && (
            <div className="border-t border-slate-150 pt-5 text-xs">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Recomendaciones y Observaciones del Profesional</h4>
              <p className="bg-slate-50 p-4 rounded-xl border border-slate-150 leading-relaxed text-slate-800 font-medium">
                {consultation.anotacionesGenerales}
              </p>
            </div>
          )}
        </div>

        {/* Footer info containing CR electronic receipt signature indicator */}
        <div className="border-t pt-6 flex flex-col sm:flex-row justify-between items-center text-[10px] text-slate-400 font-mono gap-3">
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
            <span>Firmado Digitalmente conforme a Resolución Hacienda Costa Rica GT-R-48</span>
          </div>
          <div>
            <span>TuanisBooking | Eliecer Rojas Informática Médica</span>
          </div>
        </div>
      </div>

      {facturando && (
        <FacturarModal
          idCompania={company.id}
          idPaciente={patient.id}
          idCita={null}
          idConsulta={consultation.id}
          nombrePaciente={patient.nombreCompleto}
          servicios={companyServicios}
          ivaPorDefecto={company.ivaPorDefecto}
          onCrearFactura={onCrearFactura}
          onVerificarEstadoFactura={onVerificarEstadoFactura}
          onClose={() => setFacturando(false)}
          themeColor={company.colorPrimario}
        />
      )}
    </div>
  );
}
