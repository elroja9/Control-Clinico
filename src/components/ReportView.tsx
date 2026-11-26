import { Patient, Consultation, Company, NotificationLog, Servicio, Factura } from '../data/mockData';
import { Printer, CheckCircle2, Sliders, Calendar, Heart, Dumbbell, RefreshCw, Receipt, MapPin, ArrowLeft, Mail } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import FacturarModal from './FacturarModal';
import { notify } from './ui/Feedback';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { cx } from './ui/cx';

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

/** Título de sección del documento; usa el color de la clínica (dato, no token fijo). */
function SectionHeading({ icon, color, children }: { icon?: ReactNode; color: string; children: ReactNode }) {
  return (
    <h4 className="text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5 break-after-avoid" style={{ color }}>
      {icon}
      {children}
    </h4>
  );
}

/** Dato destacado: etiqueta pequeña y valor. */
function Metric({ label, value, tone, compact }: { label: string; value: ReactNode; tone?: 'danger' | 'success' | 'brand'; compact?: boolean }) {
  return (
    <div className="min-w-0 rounded-card border border-border bg-surface-muted/60 p-3 text-center break-inside-avoid print:bg-transparent">
      <span className="text-caption text-fg-muted block">{label}</span>
      <span
        className={cx(
          'block font-semibold tabular-nums break-words',
          compact ? 'text-sm text-fg' : 'text-lg tracking-tight',
          !compact && (tone === 'danger' ? 'text-danger' : tone === 'success' ? 'text-success' : tone === 'brand' ? 'text-brand-ink' : 'text-fg')
        )}
      >
        {value}
      </span>
    </div>
  );
}

/** Bloque de texto clínico con encabezado. */
function TextBlock({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx('rounded-card border border-border bg-surface-muted/60 p-3.5 text-xs break-inside-avoid print:bg-transparent', className)}>
      <span className="font-semibold text-fg-muted block mb-1">{label}</span>
      <p className="text-fg leading-relaxed">{children}</p>
    </div>
  );
}

function MealRow({ label, accent, children }: { label: string; accent: string; children: ReactNode }) {
  return (
    <div className={cx('rounded-card bg-surface-muted/60 p-3 border border-border border-l-4 flex items-start gap-3 text-xs break-inside-avoid print:bg-transparent', accent)}>
      <div className="font-semibold text-fg-muted w-20 sm:w-24 shrink-0">{label}</div>
      <div className="text-fg min-w-0 break-words">{children}</div>
    </div>
  );
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
      notify.error(err instanceof Error ? err.message : 'No se pudo actualizar el estado de la consulta.');
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
      notify.error(`No se pudo enviar el reporte por correo: ${err.message}`);
    } finally {
      setIsSending(false);
    }
  };

  const getEvaLabel = (score: number) => {
    if (score >= 8) return 'Severo (Urgente)';
    if (score >= 5) return 'Moderado';
    return 'Leve / Tolerable';
  };

  const color = company.colorPrimario;

  return (
    // El notch lo cubre el header de la app; abajo se respeta la barra de inicio de iOS. En impresión sin relleno.
    <div className="bg-bg min-h-screen p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6 print:bg-white print:p-0 print:min-h-0">

      {/* Barra de acciones: oculta al imprimir */}
      <div className="max-w-4xl mx-auto mb-6 bg-surface rounded-card border border-border shadow-xs p-3 sm:p-4 flex flex-wrap justify-between items-center gap-3 print:hidden">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="outline" size="sm" onClick={onClose} aria-label="Volver a la lista" icon={<ArrowLeft className="w-4 h-4" aria-hidden="true" />}>
            <span className="hidden sm:inline">Volver</span>
          </Button>
          <div className="min-w-0">
            <h2 className="text-body font-semibold text-fg">Reporte de la consulta</h2>
            <p className="text-xs text-fg-muted">Imprima, envíe por correo o facture esta consulta</p>
          </div>
        </div>
        {/* Móvil: los botones se reparten el ancho e "Imprimir / PDF" ocupa su propia fila */}
        <div className="flex flex-wrap gap-2 items-center w-full sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none">
          <Badge tone={estadoActual === 'CERRADA' ? 'success' : 'warning'} className="px-2.5 py-1 text-xs">
            {estadoActual}
          </Badge>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleToggleEstado}
            disabled={cambiandoEstado}
            icon={<CheckCircle2 className="w-4 h-4" aria-hidden="true" />}
          >
            {cambiandoEstado ? 'Guardando…' : estadoActual === 'CERRADA' ? 'Reabrir consulta' : 'Marcar como cerrada'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={sendClientEmail}
            disabled={isSending}
            icon={isSending ? <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" /> : emailSent ? <CheckCircle2 className="w-4 h-4 text-success" aria-hidden="true" /> : <Mail className="w-4 h-4" aria-hidden="true" />}
          >
            <span aria-live="polite">{isSending ? 'Enviando…' : emailSent ? 'Correo enviado' : 'Enviar por correo'}</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setFacturando(true)}
            disabled={!!facturaExistente}
            title={facturaExistente ? `Ya facturada (${facturaExistente.consecutivo})` : undefined}
            icon={<Receipt className="w-4 h-4" aria-hidden="true" />}
          >
            {facturaExistente ? `Facturada (${facturaExistente.consecutivo})` : 'Facturar'}
          </Button>
          <Button size="sm" onClick={triggerPrint} icon={<Printer className="w-4 h-4" aria-hidden="true" />} className="basis-full sm:basis-auto">
            Imprimir / PDF
          </Button>
        </div>
      </div>

      {/* Documento clínico */}
      <div className="max-w-4xl mx-auto bg-surface rounded-panel border border-border shadow-sm p-4 min-[400px]:p-6 sm:p-10 space-y-6 print:max-w-none print:rounded-none print:border-none print:shadow-none print:p-0 print:space-y-5 print:text-black [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">

        {/* Encabezado con datos de la clínica */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b-2 pb-6 gap-4 break-inside-avoid" style={{ borderColor: color }}>
          <div className="flex items-center gap-4">
            <img
              src={company.logoUrl}
              alt={company.nombreComercial}
              className="w-16 h-16 object-cover rounded-card border border-border"
              referrerPolicy="no-referrer"
            />
            <div>
              <h2 className="text-title font-semibold tracking-tight text-fg">{company.nombreComercial}</h2>
              <p className="text-xs text-fg-muted mt-0.5">{company.razonSocial}</p>
              <p className="text-caption text-fg-muted">ID Hacienda: {company.identificacion} | Cédula Jurídica</p>
            </div>
          </div>

          <div className="sm:text-right text-xs text-fg-muted">
            <span className="block font-bold tracking-wide" style={{ color }}>REPORTE CLÍNICO INTEGRADO</span>
            <span className="block mt-1">Fecha: {consultation.fecha}</span>
            <span className="block">Folio Consulta: #{consultation.id.toString().slice(-6)}</span>
            <span className="inline-block text-caption bg-surface-muted text-fg-muted border border-border px-2 py-0.5 rounded-md mt-1.5 print:bg-transparent">
              {consultation.tipo === 'Nutrición' ? 'Especialidad: Nutrición Humana' : 'Especialidad: Fisioterapia y Kinesiología'}
            </span>
          </div>
        </div>

        {/* Datos del paciente */}
        <div className="bg-surface-muted/60 rounded-card p-4 border border-border text-xs sm:text-sm break-inside-avoid print:bg-transparent">
          <span className="text-caption font-bold text-fg-muted uppercase tracking-wider block mb-2">Datos del Paciente</span>
          <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] sm:grid-cols-[repeat(4,minmax(0,1fr))] gap-4">
            <div>
              <span className="text-fg-muted block text-caption">Paciente:</span>
              <span className="font-semibold text-fg block break-words">{patient.nombreCompleto}</span>
            </div>
            <div>
              <span className="text-fg-muted block text-caption">Identificación:</span>
              <span className="font-semibold text-fg block">{patient.identificacion}</span>
            </div>
            <div>
              <span className="text-fg-muted block text-caption">Edad / Contacto:</span>
              <span className="font-semibold text-fg block">{patient.edad} años | Tel: {patient.telefono}</span>
            </div>
            <div>
              <span className="text-fg-muted block text-caption">Dirección:</span>
              <span className="font-medium text-fg block break-words" title={patient.otrasSenas}>{patient.otrasSenas}</span>
            </div>
          </div>
        </div>

        {/* Cuerpo clínico */}
        <div className="space-y-6 print:space-y-5">

          {/* Motivo */}
          <div className="bg-surface-muted/60 p-4 rounded-card border border-border break-inside-avoid print:bg-transparent">
            <h4 className="text-xs font-bold text-fg-muted uppercase tracking-wider mb-1">Motivo Principal del Encuentro</h4>
            <p className="text-sm font-semibold text-fg">{consultation.motivo}</p>
          </div>

          {/* ================= NUTRICIÓN ================= */}
          {consultation.tipo === 'Nutrición' && consultation.antropometria && (
            <div className="space-y-6 print:space-y-5">

              <div>
                <SectionHeading color={color} icon={<Heart className="w-4 h-4" aria-hidden="true" />}>
                  Composición Corporal y Antropometría
                </SectionHeading>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Metric label="Peso Corporal" value={`${consultation.antropometria.peso} kg`} />
                  <Metric label="IMC" value={consultation.antropometria.imc} />
                  <Metric label="Grasa Corporal" value={`${consultation.antropometria.grasaCorporal}%`} tone="danger" />
                  <Metric label="Masa Muscular" value={`${consultation.antropometria.masaMuscular} kg`} tone="success" />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                  <Metric compact label="Grasa Visceral" value={`Nivel ${consultation.antropometria.grasaVisceral}`} />
                  <Metric compact label="Masa Ósea" value={`${consultation.antropometria.masaOsea} kg`} />
                  <Metric compact label="Circunferencia Cintura" value={`${consultation.antropometria.cintura} cm`} />
                  <Metric compact label="Perímetro Abdominal" value={`${consultation.antropometria.abdominal} cm`} />
                </div>
              </div>

              {/* Prescripción calórica */}
              {consultation.dieta?.prescripcionCalorica && (
                <div className="border-t border-border pt-5 break-inside-avoid">
                  <SectionHeading color={color} icon={<Sliders className="w-4 h-4" aria-hidden="true" />}>
                    Prescripción Calórica
                  </SectionHeading>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Metric compact label="Fórmula" value={FORMULA_LABEL[consultation.dieta.prescripcionCalorica.formula] || consultation.dieta.prescripcionCalorica.formula} />
                    <Metric label="TMB" value={`${consultation.dieta.prescripcionCalorica.tmb} kcal`} />
                    <Metric compact label="Objetivo" value={`${DIRECCION_LABEL[consultation.dieta.prescripcionCalorica.direccion] || consultation.dieta.prescripcionCalorica.direccion} ${consultation.dieta.prescripcionCalorica.porcentaje}%`} />
                    <Metric label="Presupuesto Calórico" value={`${consultation.dieta.totalCalorias} kcal`} tone="brand" />
                  </div>
                  {consultation.dieta.macros && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                      <Metric
                        compact
                        label="Carbohidratos"
                        value={<>
                          {consultation.dieta.macros.carbohidratosPct != null ? `${consultation.dieta.macros.carbohidratosPct}%` : '—'}
                          {consultation.dieta.macros.carbohidratosPct != null && ` (${gramosDesdeMacroPct(consultation.dieta.macros.carbohidratosPct, consultation.dieta.totalCalorias, 4)} g)`}
                        </>}
                      />
                      <Metric
                        compact
                        label="Proteínas"
                        value={<>
                          {consultation.dieta.macros.proteinasPct != null ? `${consultation.dieta.macros.proteinasPct}%` : '—'}
                          {consultation.dieta.macros.proteinasPct != null && ` (${gramosDesdeMacroPct(consultation.dieta.macros.proteinasPct, consultation.dieta.totalCalorias, 4)} g)`}
                        </>}
                      />
                      <Metric
                        compact
                        label="Grasas"
                        value={<>
                          {consultation.dieta.macros.grasasPct != null ? `${consultation.dieta.macros.grasasPct}%` : '—'}
                          {consultation.dieta.macros.grasasPct != null && ` (${gramosDesdeMacroPct(consultation.dieta.macros.grasasPct, consultation.dieta.totalCalorias, 9)} g)`}
                        </>}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Plan alimentario */}
              {consultation.dieta && (
                <div className="border-t border-border pt-5">
                  <SectionHeading color={color} icon={<Calendar className="w-4 h-4" aria-hidden="true" />}>
                    Plan Alimentario Recomendado ({consultation.dieta.totalCalorias} kcal)
                  </SectionHeading>
                  <div className="space-y-3">
                    <MealRow label="Desayuno:" accent="border-l-warning">{consultation.dieta.desayuno}</MealRow>
                    {(consultation.dieta.meriendaManana || consultation.dieta.meriendaTarde) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {consultation.dieta.meriendaManana && (
                          <MealRow label="Merienda AM:" accent="border-l-brand">{consultation.dieta.meriendaManana}</MealRow>
                        )}
                        {consultation.dieta.meriendaTarde && (
                          <MealRow label="Merienda PM:" accent="border-l-brand">{consultation.dieta.meriendaTarde}</MealRow>
                        )}
                      </div>
                    )}
                    <MealRow label="Almuerzo:" accent="border-l-brand-solid">{consultation.dieta.almuerzo}</MealRow>
                    <MealRow label="Cena:" accent="border-l-info">{consultation.dieta.cena}</MealRow>
                    {consultation.dieta.indicaciones && (
                      <div className="bg-warning-soft rounded-card p-4 border border-warning/20 text-xs break-inside-avoid">
                        <span className="font-semibold text-warning block mb-1">Recomendaciones Nutricionales del Profesional</span>
                        <p className="text-fg leading-relaxed">{consultation.dieta.indicaciones}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================= FISIOTERAPIA ================= */}
          {consultation.tipo === 'Fisioterapia' && consultation.fisioterapia && (
            <div className="space-y-6 print:space-y-5">

              {/* Mapa de dolor y EVA */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-border pt-5 text-xs">
                <div className="bg-surface-muted/60 p-3 rounded-card border border-border text-center break-inside-avoid print:bg-transparent">
                  <span className="text-caption text-fg-muted block uppercase font-bold mb-1">Foco de Dolor</span>
                  <span className="text-sm font-bold text-fg uppercase flex items-center justify-center gap-1"><MapPin className="w-4 h-4 text-danger" aria-hidden="true" />{consultation.fisioterapia.zonaDolor}</span>
                </div>
                <div className="bg-surface-muted/60 p-3 rounded-card border border-border text-center break-inside-avoid print:bg-transparent">
                  <span className="text-caption text-fg-muted block uppercase font-bold mb-1">Escala de Dolor EVA</span>
                  <span className="text-lg font-bold text-danger block">{consultation.fisioterapia.evaDolor} de 10</span>
                  <span className="text-caption font-bold text-fg-muted uppercase">{getEvaLabel(consultation.fisioterapia.evaDolor)}</span>
                </div>
                <div className="bg-surface-muted/60 p-3 rounded-card border border-border text-center break-inside-avoid print:bg-transparent">
                  <span className="text-caption text-fg-muted block uppercase font-bold mb-1">Tipo de Dolor</span>
                  <span className="text-sm font-semibold text-fg block">{consultation.fisioterapia.tipoDolor}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TextBlock label="Factores que empeoran (Agravantes):">{consultation.fisioterapia.factoresAgravantes}</TextBlock>
                <TextBlock label="Factores que alivian (Atenuantes):">{consultation.fisioterapia.factoresAtenuantes}</TextBlock>
              </div>

              {/* Examen físico */}
              <div>
                <SectionHeading color={color} icon={<Dumbbell className="w-4 h-4" aria-hidden="true" />}>
                  Valoración de Examen Físico Funcional
                </SectionHeading>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <TextBlock label="Inspección de Postura">{consultation.fisioterapia.posturaObservaciones}</TextBlock>
                  <TextBlock label="Hallazgos a la Palpación">{consultation.fisioterapia.palpacionHallazgos}</TextBlock>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                  <TextBlock label="Rangos Movilidad (ROM)">{consultation.fisioterapia.romMedido}</TextBlock>
                  <TextBlock label="Fuerza Daniels">{consultation.fisioterapia.fuerzaDaniels}</TextBlock>
                  <TextBlock label="Pruebas Especiales">{consultation.fisioterapia.pruebasEspeciales}</TextBlock>
                </div>
              </div>

              {/* Prescripción */}
              <div className="border-t border-border pt-5">
                <SectionHeading color={color} icon={<Calendar className="w-4 h-4" aria-hidden="true" />}>
                  Prescripción Terapéutica e Intervenciones
                </SectionHeading>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <TextBlock label="Agentes Físicos" className="bg-brand-soft border-brand/20">{consultation.fisioterapia.agentesFisicos}</TextBlock>
                  <TextBlock label="Terapia Manual" className="bg-brand-soft border-brand/20">{consultation.fisioterapia.terapiaManual}</TextBlock>
                  <TextBlock label="Ejercicio Terapéutico" className="bg-brand-soft border-brand/20">{consultation.fisioterapia.ejercicioTerapeutico}</TextBlock>
                </div>
              </div>

              {/* Evolución SOAP (tema claro: se imprime bien y mantiene contraste) */}
              <div className="bg-surface-muted/60 border border-border p-5 rounded-card space-y-4 break-inside-avoid print:bg-transparent">
                <div className="flex flex-wrap justify-between items-center gap-1 border-b border-border pb-2">
                  <span className="text-caption font-bold text-brand-ink uppercase tracking-wider">Nota SOAP Oficial de Terapia Física</span>
                  <span className="text-caption text-fg-muted">Ciclo Sugerido: {consultation.fisioterapia.sesionesSugeridas} Sesiones</span>
                </div>
                <div className="grid grid-cols-1 min-[480px]:grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="bg-surface p-3 rounded-control border border-border">
                    <span className="text-danger font-bold block mb-1">S (Subjetivo)</span>
                    <p className="text-fg leading-relaxed">{consultation.fisioterapia.soapSubjetivo}</p>
                  </div>
                  <div className="bg-surface p-3 rounded-control border border-border">
                    <span className="text-warning font-bold block mb-1">O (Objetivo)</span>
                    <p className="text-fg leading-relaxed">{consultation.fisioterapia.soapObjetivo}</p>
                  </div>
                  <div className="bg-surface p-3 rounded-control border border-border">
                    <span className="text-success font-bold block mb-1">A (Análisis)</span>
                    <p className="text-fg leading-relaxed">{consultation.fisioterapia.soapAnalisis}</p>
                  </div>
                  <div className="bg-surface p-3 rounded-control border border-border">
                    <span className="text-info font-bold block mb-1">P (Plan)</span>
                    <p className="text-fg leading-relaxed">{consultation.fisioterapia.soapPlan}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Recomendaciones del profesional */}
          {consultation.anotacionesGenerales && (
            <div className="border-t border-border pt-5 text-xs break-inside-avoid">
              <h4 className="text-xs font-bold text-fg-muted uppercase tracking-wider mb-2">Recomendaciones y Observaciones del Profesional</h4>
              <p className="bg-surface-muted/60 p-4 rounded-card border border-border leading-relaxed text-fg font-medium print:bg-transparent">
                {consultation.anotacionesGenerales}
              </p>
            </div>
          )}
        </div>

        {/* Pie con indicador de firma electrónica */}
        <div className="border-t border-border pt-6 flex flex-col sm:flex-row justify-between items-center text-caption text-fg-muted gap-3 break-inside-avoid">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-success inline-block" aria-hidden="true"></span>
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
          paciente={patient}
          servicios={companyServicios}
          ivaPorDefecto={company.ivaPorDefecto}
          plazoCreditoDefecto={company.plazoCreditoClientesDias}
          onCrearFactura={onCrearFactura}
          onVerificarEstadoFactura={onVerificarEstadoFactura}
          onClose={() => setFacturando(false)}
          themeColor={company.colorPrimario}
        />
      )}
    </div>
  );
}
