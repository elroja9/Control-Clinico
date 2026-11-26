import React, { useState, useEffect } from 'react';
import { Patient, User, Cita, CompaniaSmtpConfig, NotificationLog, CalendarBlock, Servicio, Factura } from '../data/mockData';
import FacturarModal from './FacturarModal';
import { notify, confirmar } from './ui/Feedback';
import { Button, Badge, Card, CardBody, EmptyState, Field, Input, PageHeader, ResponsiveModal, SegmentedControl, Select, Textarea } from './ui';
import { terminoPersona } from '../utils/terminoPersona';
import { servicioCompatible } from '../utils/modalidad';
import { formatearColones, ivaEfectivo, precioConIva } from '../utils/precios';
import {
  Calendar as CalendarIcon,
  Clock,
  User as UserIcon,
  Plus,
  ChevronLeft,
  ChevronRight,
  Check,
  AlertCircle,
  Mail,
  Bell,
  Edit,
  Trash2,
  Settings,
  Sparkles,
  Activity,
  Maximize2,
  Lock,
  Eye,
  ArrowRight,
  UserCheck,
  Search,
  MapPin,
  Navigation,
  Ban,
  Receipt,
  Home,
  Building2
} from 'lucide-react';

function urlUbicacionCita(cita: Cita): string | null {
  if (cita.tipoVisita !== 'DOMICILIO') return null;
  if (cita.pacienteLat != null && cita.pacienteLng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${cita.pacienteLat},${cita.pacienteLng}`;
  }
  if (cita.direccionDomicilio) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cita.direccionDomicilio)}`;
  }
  return null;
}

interface AgendaCalendarProps {
  patients: Patient[];
  users: User[];
  citas: Cita[];
  smtpConfigs: CompaniaSmtpConfig[];
  logs: NotificationLog[];
  activeCompanyId: number;
  currentUser: User;
  // Devuelve la cita guardada (id real del servidor) y una advertencia opcional; rechaza con el
  // mensaje de error del servidor.
  onSaveCita: (cita: Cita) => Promise<Cita & { advertencia?: string }>;
  onTriggerNotification: (log: NotificationLog) => void;
  onStartConsultation: (patient: Patient, citaId: number) => void;
  calendarBlocks: CalendarBlock[];
  onSaveCalendarBlock: (block: CalendarBlock) => void;
  onDeleteCalendarBlock: (id: number) => void;
  servicios: Servicio[];
  facturas: Factura[];
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
  ivaPorDefecto: number;
  plazoCreditoDefecto?: number;
  themeColor: string;
  perfilCompania?: string;
}

export default function AgendaCalendar({
  patients,
  users,
  citas,
  smtpConfigs,
  logs,
  activeCompanyId,
  currentUser,
  onSaveCita,
  onTriggerNotification,
  onStartConsultation,
  calendarBlocks,
  onSaveCalendarBlock,
  servicios,
  facturas,
  onCrearFactura,
  onVerificarEstadoFactura,
  ivaPorDefecto,
  plazoCreditoDefecto,
  onDeleteCalendarBlock,
  themeColor,
  perfilCompania
}: AgendaCalendarProps) {
  const persona = terminoPersona(perfilCompania);
  const esLegal = perfilCompania === 'Legal';
  // Calendar views: 'day', 'week', 'month'
  const [view, setView] = useState<'day' | 'week' | 'month'>('month');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  
  // Filter by doctor
  const [selectedDoctorId, setSelectedDoctorId] = useState<number>(currentUser.id);
  
  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedCita, setSelectedCita] = useState<Cita | null>(null);
  
  // Form state
  const [formPatientId, setFormPatientId] = useState<string>('');
  const [formPatientSearch, setFormPatientSearch] = useState<string>('');
  const [isPatientDropdownOpen, setIsPatientDropdownOpen] = useState(false);
  const [patientActiveIndex, setPatientActiveIndex] = useState(0);
  const [formDate, setFormDate] = useState<string>('');
  const [formTime, setFormTime] = useState<string>('');
  const [formDuration, setFormDuration] = useState<number>(30);
  const [formServicioId, setFormServicioId] = useState<string>('');
  const [formNotes, setFormNotes] = useState<string>('');
  const [formStatus, setFormStatus] = useState<Cita['estadoCita']>('PROGRAMADA');
  const [formDoctorId, setFormDoctorId] = useState<number>(currentUser.id);
  const [formError, setFormError] = useState<string>('');

  // Calendar block form state
  const [isBlockFormOpen, setIsBlockFormOpen] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<CalendarBlock | null>(null);
  const [blockFechaInicio, setBlockFechaInicio] = useState<string>('');
  const [blockEsVariosDias, setBlockEsVariosDias] = useState(false);
  const [blockFechaFin, setBlockFechaFin] = useState<string>('');
  const [blockEsTodoElDia, setBlockEsTodoElDia] = useState(true);
  const [blockHoraInicio, setBlockHoraInicio] = useState<string>('08:00');
  const [blockHoraFin, setBlockHoraFin] = useState<string>('18:00');
  const [blockMotivo, setBlockMotivo] = useState<string>('');
  const [blockFormError, setBlockFormError] = useState<string>('');

  // Facturar (modal compartido — ver FacturarModal.tsx — para emitir una Factura
  // Electrónica de Hacienda para una cita)
  const [facturaCita, setFacturaCita] = useState<Cita | null>(null);

  // Auto-switch view on resize (Responsive view constraints). Solo cambia al cruzar el
  // breakpoint: antes cualquier resize (incluido abrir el teclado en móvil o ajustar la
  // ventana) devolvía la vista a "Mes" y se perdía la que el usuario había elegido.
  useEffect(() => {
    let esMovil = window.innerWidth < 768;
    setView(esMovil ? 'day' : 'month');
    const handleResize = () => {
      const ahoraMovil = window.innerWidth < 768;
      if (ahoraMovil === esMovil) return;
      esMovil = ahoraMovil;
      setView(ahoraMovil ? 'day' : 'month');
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Filter citas for the current company & selected doctor
  const filteredCitas = citas.filter(c =>
    c.idCompania === activeCompanyId &&
    (selectedDoctorId === 0 || c.idUsuarioNutricionista === selectedDoctorId)
  );

  // Servicios activos de la empresa, para elegir en el formulario de cita y autocompletar duración
  const companyServicios = servicios.filter(s => s.idCompania === activeCompanyId && s.activo);
  // El selector solo ofrece servicios compatibles con el tipo de visita de la cita (las citas nuevas son en consultorio);
  // se conserva el ya elegido para no dejar el campo en blanco al editar una cita antigua.
  const tipoVisitaForm: 'CONSULTORIO' | 'DOMICILIO' = selectedCita?.tipoVisita === 'DOMICILIO' ? 'DOMICILIO' : 'CONSULTORIO';
  const serviciosParaForm = companyServicios.filter(s => servicioCompatible(s.modalidad, tipoVisitaForm) || s.id.toString() === formServicioId);

  // Active SMTP Config
  const activeSmtp = smtpConfigs.find(s => s.idCompania === activeCompanyId) || {
    activo: false,
    proveedor: 'OTRO',
    smtpHost: '',
    smtpPort: 587,
    remitenteNombre: 'Clínica',
    remitenteCorreo: '',
    recordatorioHorasAntes: 24
  };

  // Helper: Date formatters. Fecha LOCAL: toISOString() la pasaba a UTC y en Costa Rica
  // (UTC-6) después de las 6 p. m. la vista Día mostraba las citas de mañana.
  const formatDateString = (date: Date) => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  const todayStr = formatDateString(new Date());

  // Celdas y tarjetas del calendario son <div> clicables: se vuelven operables con Enter/Espacio
  const activarConTeclado = (fn: () => void) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      fn();
    }
  };

  const avisarBloqueo = (block: CalendarBlock, esDia: boolean) => {
    notify.info(`${esDia ? 'Este día está bloqueado' : 'Este horario está bloqueado'}${block.motivo ? `: ${block.motivo}` : '.'} Elija otra fecha u hora.`);
  };

  // Returns the block covering (dateStr, timeStr) for the currently-filtered specialist, or undefined.
  // No block shading applies when "Todos los Especialistas" (id 0) is selected — a block is only
  // meaningful in relation to one specific specialist's calendar.
  const isSlotBlocked = (dateStr: string, timeStr?: string): CalendarBlock | undefined => {
    if (selectedDoctorId === 0) return undefined;
    return calendarBlocks.find(b => {
      if (b.idCompania !== activeCompanyId || b.idUsuarioNutricionista !== selectedDoctorId) return false;
      if (dateStr < b.fechaInicio || dateStr > b.fechaFin) return false;
      if (!b.horaInicio || !b.horaFin) return true;
      if (!timeStr) return false;
      return timeStr >= b.horaInicio && timeStr < b.horaFin;
    });
  };

  // Navigation handlers
  const handlePrev = () => {
    const newDate = new Date(currentDate);
    if (view === 'day') {
      newDate.setDate(currentDate.getDate() - 1);
    } else if (view === 'week') {
      newDate.setDate(currentDate.getDate() - 7);
    } else {
      newDate.setMonth(currentDate.getMonth() - 1);
    }
    setCurrentDate(newDate);
  };

  const handleNext = () => {
    const newDate = new Date(currentDate);
    if (view === 'day') {
      newDate.setDate(currentDate.getDate() + 1);
    } else if (view === 'week') {
      newDate.setDate(currentDate.getDate() + 7);
    } else {
      newDate.setMonth(currentDate.getMonth() + 1);
    }
    setCurrentDate(newDate);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const patientLabel = (p: Patient) => `${p.nombreCompleto} (${p.identificacion})`;

  const filteredPatients = formPatientSearch.trim()
    ? patients.filter(p =>
        p.nombreCompleto.toLowerCase().includes(formPatientSearch.toLowerCase()) ||
        p.identificacion.includes(formPatientSearch)
      )
    : patients;

  const handleSelectPatient = (p: Patient) => {
    setFormPatientId(p.id.toString());
    setFormPatientSearch(patientLabel(p));
    setIsPatientDropdownOpen(false);
  };

  // Open creation form
  const handleOpenNewCita = (date?: string, timeSlot?: string) => {
    setSelectedCita(null);
    const firstPatient = patients[0];
    setFormPatientId(firstPatient?.id.toString() || '');
    setFormPatientSearch(firstPatient ? patientLabel(firstPatient) : '');
    setFormDate(date || formatDateString(currentDate));
    setFormTime(timeSlot || '09:00');
    setFormDuration(30);
    setFormServicioId('');
    setFormNotes('');
    setFormStatus('PROGRAMADA');
    setFormDoctorId(currentUser.id);
    setFormError('');
    setIsFormOpen(true);
  };

  // Open edit form
  const handleOpenEditCita = (cita: Cita, e?: { stopPropagation: () => void }) => {
    e?.stopPropagation();
    setSelectedCita(cita);
    setFormPatientId(cita.idPaciente.toString());
    const citaPatient = patients.find(p => p.id === cita.idPaciente);
    setFormPatientSearch(citaPatient ? patientLabel(citaPatient) : '');

    const [d, t] = cita.fechaHora.split('T');
    setFormDate(d);
    setFormTime(t || '09:00');
    setFormDuration(cita.duracionMinutos);
    setFormServicioId(cita.idServicio != null ? cita.idServicio.toString() : '');
    setFormNotes(cita.notas);
    setFormStatus(cita.estadoCita);
    setFormDoctorId(cita.idUsuarioNutricionista);
    setFormError('');
    setIsFormOpen(true);
  };

  // Calendar block handlers
  const handleOpenNewBlock = () => {
    setSelectedBlock(null);
    setBlockFechaInicio(formatDateString(currentDate));
    setBlockEsVariosDias(false);
    setBlockFechaFin(formatDateString(currentDate));
    setBlockEsTodoElDia(true);
    setBlockHoraInicio('08:00');
    setBlockHoraFin('18:00');
    setBlockMotivo('');
    setBlockFormError('');
    setIsBlockFormOpen(true);
  };

  const handleOpenEditBlock = (block: CalendarBlock) => {
    setSelectedBlock(block);
    setBlockFechaInicio(block.fechaInicio);
    setBlockEsVariosDias(block.fechaFin !== block.fechaInicio);
    setBlockFechaFin(block.fechaFin);
    setBlockEsTodoElDia(!block.horaInicio || !block.horaFin);
    setBlockHoraInicio(block.horaInicio || '08:00');
    setBlockHoraFin(block.horaFin || '18:00');
    setBlockMotivo(block.motivo);
    setBlockFormError('');
    setIsBlockFormOpen(true);
  };

  const handleBlockFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setBlockFormError('');
    const fechaFin = blockEsVariosDias ? blockFechaFin : blockFechaInicio;

    if (blockEsVariosDias && fechaFin < blockFechaInicio) {
      setBlockFormError('La fecha de fin no puede ser anterior a la fecha de inicio.');
      return;
    }
    if (!blockEsVariosDias && !blockEsTodoElDia && blockHoraFin <= blockHoraInicio) {
      setBlockFormError('La hora de fin debe ser posterior a la hora de inicio.');
      return;
    }

    const nextId = selectedBlock ? selectedBlock.id : Math.max(...calendarBlocks.map(b => b.id), 0) + 1;

    const savedBlock: CalendarBlock = {
      id: nextId,
      idCompania: activeCompanyId,
      idUsuarioNutricionista: currentUser.id,
      fechaInicio: blockFechaInicio,
      fechaFin,
      horaInicio: blockEsTodoElDia ? null : blockHoraInicio,
      horaFin: blockEsTodoElDia ? null : blockHoraFin,
      motivo: blockMotivo
    };

    onSaveCalendarBlock(savedBlock);
    setIsBlockFormOpen(false);
    notify.success(selectedBlock ? 'Bloqueo actualizado.' : 'Horario bloqueado.');
  };

  const handleDeleteBlock = async (id: number) => {
    const ok = await confirmar({
      title: '¿Eliminar este bloqueo?',
      message: 'El horario volverá a quedar disponible para agendar citas.',
      confirmText: 'Eliminar bloqueo',
      tone: 'danger'
    });
    if (!ok) return;
    onDeleteCalendarBlock(id);
    setIsBlockFormOpen(false);
    notify.success('Bloqueo eliminado.');
  };

  const myCalendarBlocks = calendarBlocks.filter(b => b.idCompania === activeCompanyId && b.idUsuarioNutricionista === currentUser.id);

  // Save changes. `estado` is a parameter (not read from `formStatus` directly)
  // so handleCancelarCita can force CANCELADA regardless of whatever the
  // status dropdown currently shows.
  const guardarCita = async (estado: Cita['estadoCita']) => {
    setFormError('');

    if (!formPatientId || !formDate || !formTime) {
      setFormError('Por favor complete todos los datos obligatorios.');
      return;
    }

    const patient = patients.find(p => p.id === parseInt(formPatientId));
    if (!patient) return;

    const fullFechaHora = `${formDate}T${formTime}`;

    const slotChanged = !selectedCita || selectedCita.fechaHora !== fullFechaHora || selectedCita.idUsuarioNutricionista !== formDoctorId;
    if (slotChanged) {
      const blockingBlock = calendarBlocks.find(b => {
        if (b.idCompania !== activeCompanyId || b.idUsuarioNutricionista !== formDoctorId) return false;
        if (formDate < b.fechaInicio || formDate > b.fechaFin) return false;
        if (!b.horaInicio || !b.horaFin) return true;
        return formTime >= b.horaInicio && formTime < b.horaFin;
      });
      if (blockingBlock) {
        setFormError(`Este horario está bloqueado${blockingBlock.motivo ? `: ${blockingBlock.motivo}` : '.'} Elige otra fecha/hora.`);
        return;
      }

      const aMinutos = (hhmm: string) => {
        const [h, m] = hhmm.split(':').map(Number);
        return h * 60 + m;
      };
      const nuevoInicio = aMinutos(formTime);
      const nuevoFin = nuevoInicio + formDuration;
      const citaEnConflicto = citas.find(c => {
        if (c.id === selectedCita?.id) return false;
        if (c.idUsuarioNutricionista !== formDoctorId || c.estadoCita === 'CANCELADA') return false;
        const [citaFecha, citaHora] = c.fechaHora.split('T');
        if (citaFecha !== formDate) return false;
        const citaInicio = aMinutos(citaHora);
        const citaFin = citaInicio + c.duracionMinutos;
        return nuevoInicio < citaFin && nuevoFin > citaInicio;
      });
      if (citaEnConflicto) {
        setFormError('Este profesional ya tiene otra cita en ese horario. Elige otra fecha/hora.');
        return;
      }
    }

    // `citas` here is pre-filtered to the active company (see AgendaCalendar caller in
    // App.tsx), but cita IDs are global/auto-increment across all companies in the DB —
    // Math.max() over this filtered subset previously produced IDs that could already
    // belong to another company's appointment, causing the server's upsert-by-id logic
    // (POST /api/citas) to silently overwrite that unrelated appointment instead of
    // inserting a new one. Date.now() avoids colliding with real sequential DB ids,
    // matching the same placeholder-id pattern already used for new consultations.
    const nextId = selectedCita ? selectedCita.id : Date.now();

    const savedCita: Cita = {
      id: nextId,
      idCompania: activeCompanyId,
      idPaciente: patient.id,
      idUsuarioNutricionista: formDoctorId,
      idConsulta: selectedCita ? selectedCita.idConsulta : null,
      idServicio: formServicioId ? parseInt(formServicioId) : null,
      fechaHora: fullFechaHora,
      duracionMinutos: formDuration,
      estadoCita: estado,
      notas: formNotes,
      tipoVisita: selectedCita ? selectedCita.tipoVisita : 'CONSULTORIO',
      direccionDomicilio: selectedCita?.direccionDomicilio,
      pacienteLat: selectedCita?.pacienteLat,
      pacienteLng: selectedCita?.pacienteLng,
      tiempoTrasladoMinutos: selectedCita?.tiempoTrasladoMinutos
    };

    // Se espera el guardado: el servidor valida (solape, fecha pasada, transiciones) y asigna el
    // id real, que la notificación necesita para encontrar la cita.
    let citaGuardada: Cita & { advertencia?: string };
    try {
      citaGuardada = await onSaveCita(savedCita);
    } catch (err: any) {
      setFormError(err?.message || 'No se pudo guardar la cita.');
      notify.error(err?.message || 'No se pudo guardar la cita.');
      return;
    }
    setIsFormOpen(false);
    notify.success(
      !selectedCita ? `Cita creada para ${patient.nombreCompleto}.` : estado === 'CANCELADA' && selectedCita.estadoCita !== 'CANCELADA' ? 'Cita cancelada.' : 'Cita actualizada.'
    );
    if (citaGuardada.advertencia) notify.warning(citaGuardada.advertencia);

    // --- Real SMTP Notification Triggers ---
    if (activeSmtp.activo) {
      let tipoNotif: 'CONFIRMACION' | 'CANCELACION' | 'MODIFICACION';
      if (!selectedCita) {
        tipoNotif = 'CONFIRMACION';
      } else if (selectedCita.estadoCita !== estado && estado === 'CANCELADA') {
        tipoNotif = 'CANCELACION';
      } else if (selectedCita.estadoCita === 'PROGRAMADA' && estado === 'CONFIRMADA') {
        tipoNotif = 'CONFIRMACION';
      } else {
        // Cambio de fecha u hora (y cualquier otra edición): MODIFICACION, como antes.
        tipoNotif = 'MODIFICACION';
      }

      fetch('/api/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'CITA',
          idCompania: activeCompanyId,
          tipoNotif,
          patient,
          cita: citaGuardada,
          estadoCita: citaGuardada.estadoCita
        })
      })
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'No se pudo enviar la notificación.');
          onTriggerNotification(data);
        })
        .catch((err: any) => {
          console.error('Error enviando notificación SMTP:', err);
          notify.warning(`La cita se guardó, pero no se pudo enviar la notificación por correo: ${err.message}`);
        });
    }
  };

  // Una cita COMPLETADA que ya tiene una factura real (no simulada/anulada) asociada es
  // historial fiscal — cambiarle el estado no anula esa factura, así que se advierte antes
  // de dejar seguir, en vez de bloquear (el personal puede necesitar corregir un estado
  // marcado por error).
  const facturaVigenteDeCita = (citaId: number) =>
    facturas.find(f => f.idCita === citaId && (f.estado === 'ACEPTADA' || f.estado === 'ENVIADA'));

  const confirmarCambioEstadoFacturada = async (cita: Cita | null, nuevoEstado: Cita['estadoCita']): Promise<boolean> => {
    if (!cita || cita.estadoCita !== 'COMPLETADA' || cita.estadoCita === nuevoEstado) return true;
    const factura = facturaVigenteDeCita(cita.id);
    if (!factura) return true;
    // El servidor rechaza cancelar una cita facturada: no se ofrece "Cambiar de todos modos".
    if (nuevoEstado === 'CANCELADA') {
      notify.warning(`Esta cita ya fue facturada (factura ${factura.consecutivo}). Para cancelarla primero hay que anular la factura o hacer una nota de crédito.`);
      return false;
    }
    return confirmar({
      title: 'Esta cita ya fue facturada',
      message: `Factura ${factura.consecutivo} (estado ${factura.estado}). Cambiar el estado de la cita NO anula esa factura.`,
      confirmText: 'Cambiar de todos modos',
      tone: 'warning'
    });
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(await confirmarCambioEstadoFacturada(selectedCita, formStatus))) return;
    guardarCita(formStatus);
  };

  // Las citas nunca se eliminan de la agenda — solo cambian a estado
  // CANCELADA (conserva el historial y dispara la notificación de
  // cancelación al paciente, igual que si se cambiara el estado a mano).
  const handleCancelarCita = async () => {
    if (!selectedCita) return;
    if (!(await confirmarCambioEstadoFacturada(selectedCita, 'CANCELADA'))) return;
    const ok = await confirmar({
      title: '¿Cancelar esta cita?',
      message: `La cita no se elimina: queda en el historial con estado CANCELADA y, si los correos están activos, se avisa al ${persona.minuscula}.`,
      confirmText: 'Cancelar cita',
      cancelText: 'Volver',
      tone: 'danger'
    });
    if (ok) guardarCita('CANCELADA');
  };

  const handleAbrirFacturar = (cita: Cita) => {
    setFacturaCita(cita);
  };

  // Helper: Get color classes for appointment status
  const getStatusColor = (status: Cita['estadoCita']) => {
    switch (status) {
      case 'PROGRAMADA': return 'bg-info-soft border-info/25 text-info hover:brightness-95';
      case 'CONFIRMADA': return 'bg-brand-soft border-brand/30 text-brand-ink hover:brightness-95';
      case 'CANCELADA': return 'bg-surface-muted border-border text-fg-subtle line-through opacity-75 hover:opacity-100';
      case 'COMPLETADA': return 'bg-success-soft border-success/25 text-success hover:brightness-95';
      case 'NO_ASISTIO': return 'bg-warning-soft border-warning/30 text-warning hover:brightness-95';
      default: return 'bg-surface-muted border-border text-fg-muted';
    }
  };

  // Rayado suave para horarios bloqueados (usa tokens, no colores fijos)
  const CLASE_BLOQUEO = 'bg-surface-muted bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,var(--color-border)_6px,var(--color-border)_7px)]';
  // Foco visible común para celdas y tarjetas clicables
  const CLASE_FOCO = 'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand';

  // Línea de "hora actual" dentro de la celda de la hora h del día dateStr
  const lineaAhora = (dateStr: string, h: number) => {
    const ahora = new Date();
    if (dateStr !== todayStr || ahora.getHours() !== h) return null;
    return (
      <div
        className="absolute left-0 right-0 h-0.5 bg-brand z-10 pointer-events-none"
        style={{ top: `${(ahora.getMinutes() / 60) * 100}%` }}
        aria-hidden="true"
      >
        <span className="absolute -left-1 -top-[3px] w-2 h-2 rounded-full bg-brand" />
      </div>
    );
  };

  // Icono de modalidad: domicilio (Home) o consultorio (Building2)
  const iconoVisita = (cita: Cita, cls: string) =>
    cita.tipoVisita === 'DOMICILIO'
      ? <Home className={cls} aria-label="Visita a domicilio" role="img" />
      : <Building2 className={cls} aria-label="Consultorio" role="img" />;

  // Helper: Month calculations
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const startDay = new Date(year, month, 1).getDay(); // 0 is Sunday
    const totalDays = new Date(year, month + 1, 0).getDate();
    return { startDay, totalDays };
  };

  // --- RENDERING VIEWS ---

  // 1. MONTH VIEW
  const renderMonthView = () => {
    const { startDay, totalDays } = getDaysInMonth(currentDate);
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const days = [];
    // Previous month empty paddings
    for (let i = 0; i < startDay; i++) {
      days.push(<div key={`prev-${i}`} className="h-28 border-b border-r border-border bg-surface-muted/50 p-1"></div>);
    }

    // Days in current month
    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayCitas = filteredCitas.filter(c => c.fechaHora.startsWith(dateStr));
      const dayBlock = isSlotBlocked(dateStr);

      const isToday = dateStr === todayStr;
      const abrirDia = () => {
        if (dayBlock) { avisarBloqueo(dayBlock, true); return; }
        handleOpenNewCita(dateStr);
      };
      days.push(
        <div
          key={`day-${day}`}
          role="button"
          tabIndex={0}
          aria-label={`${day} de ${currentDate.toLocaleDateString('es-CR', { month: 'long' })}${isToday ? ', hoy' : ''}: ${dayCitas.length} cita${dayCitas.length === 1 ? '' : 's'}${dayBlock ? ', bloqueado' : '. Crear cita'}`}
          onClick={abrirDia}
          onKeyDown={activarConTeclado(abrirDia)}
          className={`h-28 border-b border-r border-border p-1.5 transition-colors cursor-pointer relative flex flex-col justify-between focus-visible:z-10 ${CLASE_FOCO} ${
            dayBlock ? CLASE_BLOQUEO : isToday ? 'bg-brand-soft/60 hover:bg-brand-soft' : 'hover:bg-surface-muted'
          }`}
        >
          <span className="text-xs font-semibold text-fg-muted flex items-center gap-1">
            <span className={isToday ? 'inline-flex items-center justify-center w-6 h-6 rounded-full bg-brand-solid text-brand-fg' : ''}>{day}</span>
            {dayBlock && <Lock className="w-3 h-3 text-fg-subtle" aria-hidden="true" />}
          </span>
          <div className="flex-1 overflow-y-auto space-y-1 mt-1 scrollbar-thin">
            {dayCitas.map(cita => {
              const patient = patients.find(p => p.id === cita.idPaciente);
              const time = cita.fechaHora.split('T')[1] || '00:00';
              const esDomicilio = cita.tipoVisita === 'DOMICILIO';
              return (
                <div
                  key={cita.id}
                  role="button"
                  tabIndex={0}
                  onClick={(e) => handleOpenEditCita(cita, e)}
                  onKeyDown={activarConTeclado(() => handleOpenEditCita(cita))}
                  className={`px-1 py-0.5 rounded-md text-caption font-semibold truncate border flex items-center gap-0.5 transition-colors ${CLASE_FOCO} ${getStatusColor(cita.estadoCita)}`}
                  title={`${time} - ${patient?.nombreCompleto}${esDomicilio ? ` · Domicilio: ${cita.direccionDomicilio || 'sin dirección'}` : ''}`}
                  aria-label={`Cita ${time} con ${patient?.nombreCompleto || persona.minuscula}, ${cita.estadoCita.toLowerCase().replace('_', ' ')}`}
                >
                  {esDomicilio && <Home className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />}
                  <span className="truncate">{time} - {patient?.nombreCompleto || persona.singular}</span>
                </div>
              );
            })}
          </div>
          {dayCitas.length > 0 && (
            <span className="absolute bottom-1 right-1 bg-surface-muted text-fg-muted text-caption font-semibold px-1.5 rounded-full tabular-nums ring-1 ring-inset ring-border" aria-hidden="true">
              {dayCitas.length}
            </span>
          )}
        </div>
      );
    }

    return (
      <div className="bg-surface rounded-card border border-border shadow-xs overflow-hidden">
        <div className="grid grid-cols-7 bg-surface-muted text-center font-semibold text-xs py-2.5 text-fg-muted border-b border-border" aria-hidden="true">
          <div>Dom</div>
          <div>Lun</div>
          <div>Mar</div>
          <div>Mié</div>
          <div>Jue</div>
          <div>Vie</div>
          <div>Sáb</div>
        </div>
        <div className="grid grid-cols-7">
          {days}
        </div>
      </div>
    );
  };

  // 2. WEEK VIEW
  const renderWeekView = () => {
    // Calculate Mon-Sun dates for the selected week
    const startOfWeek = new Date(currentDate);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    startOfWeek.setDate(diff);

    const weekDays = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      weekDays.push(d);
    }

    const hours = Array.from({ length: 11 }, (_, i) => 8 + i); // 8:00 AM to 6:00 PM

    return (
      <div className="bg-surface rounded-card border border-border shadow-xs overflow-hidden">
       {/* Pista visual: en pantallas angostas la semana se desplaza de lado */}
       <p className="md:hidden flex items-center justify-end gap-1 px-3 py-1.5 text-caption font-medium text-fg-muted border-b border-border bg-surface-muted/60">
         Deslice para ver toda la semana <ArrowRight className="w-3 h-3" aria-hidden="true" />
       </p>
       <div className="overflow-x-auto overscroll-x-contain">
        <div className="min-w-[760px]">
        <div className="grid grid-cols-8 bg-surface-muted border-b border-border text-center font-semibold text-xs py-2.5 text-fg-muted">
          <div className="border-r border-border flex items-center justify-center text-caption">Hora</div>
          {weekDays.map((wd, i) => {
            const isToday = formatDateString(wd) === todayStr;
            return (
              <div key={i} className={`flex flex-col py-1 ${isToday ? 'bg-brand-soft text-brand-ink rounded-lg mx-1 font-bold' : ''}`}>
                <span className="text-caption uppercase">{['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'][i]}</span>
                <span className="text-xs">{wd.getDate()}</span>
              </div>
            );
          })}
        </div>

        <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
          {hours.map(h => {
            const timeStr = `${String(h).padStart(2, '0')}:00`;
            return (
              <div key={h} className="grid grid-cols-8 min-h-16">
                <div className="border-r border-border text-caption text-fg-subtle font-medium flex items-center justify-center bg-surface-muted/50 tabular-nums">
                  {timeStr}
                </div>
                {weekDays.map((wd, i) => {
                  const dateStr = formatDateString(wd);
                  const hourCitas = filteredCitas.filter(c => {
                    const [cDate, cTime] = c.fechaHora.split('T');
                    return cDate === dateStr && cTime.startsWith(String(h).padStart(2, '0'));
                  });

                  const slotBlock = isSlotBlocked(dateStr, timeStr);

                  const abrirHora = () => {
                    if (slotBlock) { avisarBloqueo(slotBlock, false); return; }
                    handleOpenNewCita(dateStr, timeStr);
                  };
                  return (
                    <div
                      key={i}
                      role="button"
                      tabIndex={0}
                      aria-label={`${wd.toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric' })} a las ${timeStr}${slotBlock ? ', bloqueado' : hourCitas.length ? `, ${hourCitas.length} cita(s)` : ', disponible'}`}
                      onClick={abrirHora}
                      onKeyDown={activarConTeclado(abrirHora)}
                      className={`border-r border-border p-1 relative cursor-pointer min-h-16 flex flex-col gap-1 transition-colors focus-visible:z-10 ${CLASE_FOCO} ${
                        slotBlock ? CLASE_BLOQUEO : 'hover:bg-surface-muted'
                      }`}
                    >
                      {lineaAhora(dateStr, h)}
                      {slotBlock && hourCitas.length === 0 && (
                        <Lock className="w-3 h-3 text-fg-subtle m-auto" aria-hidden="true" />
                      )}
                      {hourCitas.map(cita => {
                        const patient = patients.find(p => p.id === cita.idPaciente);
                        const esDomicilio = cita.tipoVisita === 'DOMICILIO';
                        return (
                          <div
                            key={cita.id}
                            role="button"
                            tabIndex={0}
                            onClick={(e) => handleOpenEditCita(cita, e)}
                            onKeyDown={activarConTeclado(() => handleOpenEditCita(cita))}
                            aria-label={`Cita ${cita.fechaHora.split('T')[1]} con ${patient?.nombreCompleto || persona.minuscula}, ${cita.estadoCita.toLowerCase().replace('_', ' ')}`}
                            className={`p-1.5 rounded-lg text-caption font-semibold border leading-tight transition-colors ${CLASE_FOCO} ${getStatusColor(cita.estadoCita)}`}
                          >
                            <span className="flex items-center gap-1 font-semibold tabular-nums">
                              {iconoVisita(cita, 'w-3 h-3 shrink-0')}
                              {cita.fechaHora.split('T')[1]} ({cita.duracionMinutos}m)
                            </span>
                            <span className="block truncate">{patient?.nombreCompleto}</span>
                            {esDomicilio && (
                              <span className="flex items-center gap-0.5 opacity-80 font-medium truncate" title={cita.direccionDomicilio || 'Visita a domicilio'}>
                                <MapPin className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
                                <span className="truncate">{cita.direccionDomicilio || 'Domicilio'}</span>
                                {urlUbicacionCita(cita) && (
                                  <a
                                    href={urlUbicacionCita(cita)!}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    title={`Abrir ubicación del ${persona.minuscula}`}
                                    className="shrink-0 text-brand-ink"
                                    aria-label={`Abrir ubicación del ${persona.minuscula}`}
                                  >
                                    <Navigation className="w-2.5 h-2.5" aria-hidden="true" />
                                  </a>
                                )}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        </div>
       </div>
      </div>
    );
  };

  // 3. DAY VIEW (Recommended for Mobile)
  const renderDayView = () => {
    const dateStr = formatDateString(currentDate);
    const hours = Array.from({ length: 11 }, (_, i) => 8 + i); // 8:00 AM to 6:00 PM
    const dayCitas = filteredCitas.filter(c => c.fechaHora.startsWith(dateStr));

    return (
      <div className="space-y-4">
        {/* Quick Day summary cards */}
        <div className="bg-brand-soft border border-brand/20 rounded-card p-4 flex justify-between items-center shadow-xs">
          <div className="min-w-0">
            <span className="text-caption font-semibold text-brand-ink uppercase tracking-wider block">Resumen del día</span>
            <h3 className="text-sm font-semibold text-fg mt-0.5 first-letter:uppercase">
              {currentDate.toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </h3>
          </div>
          <div className="bg-surface border border-brand/20 px-3.5 py-1.5 rounded-control text-center shrink-0">
            <span className="text-caption block font-semibold text-brand-ink uppercase">Citas</span>
            <span className="text-xl font-bold text-fg tabular-nums">{dayCitas.length}</span>
          </div>
        </div>

        {/* Timeline lists */}
        <div className="bg-surface rounded-card border border-border shadow-xs divide-y divide-border overflow-hidden">
          {hours.map(h => {
            const timeStr = `${String(h).padStart(2, '0')}:00`;
            const hourCitas = dayCitas.filter(c => {
              const [, cTime] = c.fechaHora.split('T');
              return cTime.startsWith(String(h).padStart(2, '0'));
            });
            const slotBlock = isSlotBlocked(dateStr, timeStr);
            const abrirHora = () => {
              if (slotBlock) { avisarBloqueo(slotBlock, false); return; }
              handleOpenNewCita(dateStr, timeStr);
            };

            return (
              <div key={h} className="flex min-h-14 sm:min-h-16">
                <div className="w-14 sm:w-20 shrink-0 border-r border-border text-xs text-fg-muted font-semibold flex items-start sm:items-center justify-center pt-3 sm:pt-0 bg-surface-muted/50 tabular-nums">
                  {timeStr}
                </div>
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={`${timeStr}${slotBlock ? ', bloqueado' : hourCitas.length ? `, ${hourCitas.length} cita(s)` : ', disponible. Crear cita'}`}
                  onClick={abrirHora}
                  onKeyDown={activarConTeclado(abrirHora)}
                  className={`flex-1 min-w-0 p-2 transition-colors cursor-pointer flex flex-col gap-1.5 relative ${CLASE_FOCO} ${
                    slotBlock ? CLASE_BLOQUEO : 'hover:bg-surface-muted'
                  }`}
                >
                  {lineaAhora(dateStr, h)}
                  {hourCitas.length === 0 ? (
                    slotBlock ? (
                      <span className="text-xs text-fg-muted font-semibold flex items-center gap-1 my-auto pl-2">
                        <Lock className="w-3 h-3" aria-hidden="true" /> Bloqueado{slotBlock.motivo ? `: ${slotBlock.motivo}` : ''}
                      </span>
                    ) : (
                      <span className="text-xs text-fg-subtle font-medium my-auto pl-2 flex items-center gap-1">
                        <Plus className="w-3 h-3" aria-hidden="true" /> Disponible
                      </span>
                    )
                  ) : (
                    hourCitas.map(cita => {
                      const patient = patients.find(p => p.id === cita.idPaciente);
                      const esDomicilio = cita.tipoVisita === 'DOMICILIO';
                      return (
                        <div
                          key={cita.id}
                          role="button"
                          tabIndex={0}
                          onClick={(e) => handleOpenEditCita(cita, e)}
                          onKeyDown={activarConTeclado(() => handleOpenEditCita(cita))}
                          className={`p-3 rounded-control border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 shadow-xs transition-colors ${CLASE_FOCO} ${getStatusColor(cita.estadoCita)}`}
                        >
                          <div className="space-y-0.5 min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-xs font-bold tabular-nums">{cita.fechaHora.split('T')[1]}</span>
                              <span className="text-caption font-semibold uppercase bg-surface/80 px-1.5 py-0.5 rounded-md border border-border text-fg-muted">{cita.estadoCita.replace('_', ' ')}</span>
                              <span className="text-caption font-semibold uppercase bg-surface/80 text-fg-muted px-1.5 py-0.5 rounded-md border border-border flex items-center gap-0.5">
                                {esDomicilio ? <Home className="w-2.5 h-2.5" aria-hidden="true" /> : <Building2 className="w-2.5 h-2.5" aria-hidden="true" />}
                                {esDomicilio ? 'Domicilio' : 'Consultorio'}
                              </span>
                            </div>
                            <h4 className="text-base sm:text-sm font-semibold text-fg break-words">{patient?.nombreCompleto || persona.singular}</h4>
                            {esDomicilio && (
                              <p className="text-xs text-fg-muted font-medium max-w-sm flex flex-wrap items-center gap-x-1 gap-y-0.5">
                                <MapPin className="w-3 h-3 shrink-0" aria-hidden="true" />
                                <span className="min-w-0 break-words">
                                  {cita.direccionDomicilio || 'Dirección no especificada'}
                                  {cita.tiempoTrasladoMinutos != null && ` · ${cita.tiempoTrasladoMinutos} min de traslado`}
                                </span>
                                {urlUbicacionCita(cita) && (
                                  <a
                                    href={urlUbicacionCita(cita)!}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    title={`Abrir ubicación del ${persona.minuscula}`}
                                    className="shrink-0 flex items-center gap-0.5 text-brand-ink hover:underline font-semibold min-h-6"
                                  >
                                    <Navigation className="w-3 h-3" aria-hidden="true" />
                                    Abrir ubicación
                                  </a>
                                )}
                              </p>
                            )}
                            <p className="text-xs text-fg-muted line-clamp-2 sm:line-clamp-none sm:truncate max-w-sm">{cita.notas || 'Sin notas internas'}</p>
                          </div>

                          <div className="flex items-center gap-2 mt-1 sm:mt-0 [&>button]:w-full sm:[&>button]:w-auto">
                            {cita.idConsulta ? (
                              <Badge tone="success">
                                <Check className="w-3 h-3" aria-hidden="true" />
                                Consulta atendida
                              </Badge>
                            ) : esLegal ? null : (
                              <Button
                                size="sm"
                                onClick={(e: any) => {
                                  e.stopPropagation();
                                  if (patient) onStartConsultation(patient, cita.id);
                                }}
                                icon={<Activity className="w-4 h-4" aria-hidden="true" />}
                              >
                                Iniciar consulta
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    // pb-24 en móvil: el botón flotante "Nueva cita" no tapa el final de la página
    <div className="space-y-6 pb-24 md:pb-0">

      {/* Header toolbar */}
      <div className="-mb-2">
        <PageHeader
          title="Agenda y citas"
          description="Toque un día u horario libre para agendar; toque una cita para gestionarla."
          actions={
            <>
              <Button variant="outline" onClick={handleOpenNewBlock} icon={<Lock className="w-4 h-4" aria-hidden="true" />}>
                Bloquear horario
              </Button>
              {/* En móvil se usa el botón flotante (ver final del componente) */}
              <Button onClick={() => handleOpenNewCita()} icon={<Plus className="w-4 h-4" aria-hidden="true" />} className="max-md:hidden">
                Nueva cita
              </Button>
            </>
          }
        />
      </div>

      {/* Toolbar: navegación, rango, vista y filtro de profesional.
          Móvil: fila 1 = anterior/hoy/siguiente + vista; fila 2 = rango; fila 3 = profesional. */}
      <Card className="p-3 sm:p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          <div className="order-1 flex items-center gap-1.5 shrink-0" role="group" aria-label="Navegación del calendario">
            <Button
              variant="outline"
              onClick={handlePrev}
              aria-label={view === 'month' ? 'Mes anterior' : view === 'week' ? 'Semana anterior' : 'Día anterior'}
              className="w-11 px-0"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </Button>
            <Button variant="outline" onClick={handleToday} className="px-3">Hoy</Button>
            <Button
              variant="outline"
              onClick={handleNext}
              aria-label={view === 'month' ? 'Mes siguiente' : view === 'week' ? 'Semana siguiente' : 'Día siguiente'}
              className="w-11 px-0"
            >
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </Button>
          </div>
          <h3 className="order-3 w-full md:order-2 md:w-auto md:flex-1 min-w-0 text-base font-semibold tracking-tight text-fg first-letter:uppercase truncate" aria-live="polite">
            {view === 'month' && currentDate.toLocaleDateString('es-CR', { month: 'long', year: 'numeric' })}
            {view === 'week' && `Semana del ${currentDate.toLocaleDateString('es-CR', { day: 'numeric', month: 'short' })}`}
            {view === 'day' && currentDate.toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </h3>

          <div className="order-2 w-full sm:w-auto sm:flex-1 min-w-0 md:order-3 md:flex-none md:w-72">
            <SegmentedControl
              ariaLabel="Vista del calendario"
              size="sm"
              value={view}
              onChange={(v) => setView(v)}
              options={[
                { value: 'month', label: 'Mes' },
                { value: 'week', label: 'Semana' },
                { value: 'day', label: 'Día' }
              ]}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
            <label htmlFor="filtro-profesional" className="text-xs font-semibold text-fg-muted shrink-0">Profesional</label>
            <Select
              id="filtro-profesional"
              value={selectedDoctorId}
              onChange={(e: any) => setSelectedDoctorId(parseInt(e.target.value))}
              wrapperClassName="w-full sm:w-64"
              className="min-h-11"
            >
              <option value={0}>Todos los especialistas</option>
              {users.filter(u => u.idCompania === activeCompanyId && u.rol !== 'Contador').map(doc => (
                <option key={doc.id} value={doc.id}>{doc.nombre}</option>
              ))}
            </Select>
          </div>

          <div title="Se configura en Personalizar Clínica › Correo">
            <Badge tone={activeSmtp.activo ? 'success' : 'neutral'} className="py-1">
              <Bell className="w-3.5 h-3.5" aria-hidden="true" />
              Avisos por correo: {activeSmtp.activo ? 'activos' : 'apagados'}
            </Badge>
          </div>
        </div>
      </Card>

      {/* Render selected view */}
      {view === 'month' && renderMonthView()}
      {view === 'week' && renderWeekView()}
      {view === 'day' && renderDayView()}

      {/* Calendar Blocks List Section */}
      <Card>
        <CardBody className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-fg-subtle" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-fg">Bloqueos de agenda</h3>
            </div>
            <Badge>
              {myCalendarBlocks.length} activo{myCalendarBlocks.length !== 1 ? 's' : ''}
            </Badge>
          </div>

          {myCalendarBlocks.length === 0 ? (
            <EmptyState
              className="py-8 rounded-card border border-dashed border-border"
              icon={<Lock />}
              title="Sin horarios bloqueados"
              description='Use "Bloquear horario" para marcar fechas u horas no disponibles.'
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {myCalendarBlocks.map(block => (
                <div key={block.id} className="p-3.5 rounded-control border border-border bg-surface-muted/50 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <span className="font-semibold text-fg block">
                      {block.fechaInicio === block.fechaFin ? block.fechaInicio : `${block.fechaInicio} al ${block.fechaFin}`}
                      {block.horaInicio && block.horaFin ? ` · ${block.horaInicio} - ${block.horaFin}` : ' · Todo el día'}
                    </span>
                    {block.motivo && <span className="text-fg-muted block mt-0.5">{block.motivo}</span>}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenEditBlock(block)}
                    className="text-fg-muted hover:text-fg hover:bg-surface w-10 h-10 flex items-center justify-center rounded-lg shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-brand"
                    title="Editar o eliminar"
                    aria-label={`Editar o eliminar el bloqueo del ${block.fechaInicio}`}
                  >
                    <Edit className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Notification Logs History Section */}
      <Card>
        <CardBody className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-fg-subtle" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-fg">Correos enviados a {persona.minusculaPlural}</h3>
            </div>
            <Badge className="tabular-nums">
              {logs.filter(l => l.idCompania === activeCompanyId).length}
            </Badge>
          </div>

          {logs.filter(l => l.idCompania === activeCompanyId).length === 0 ? (
            <EmptyState
              className="py-8 rounded-card border border-dashed border-border"
              icon={<Mail />}
              title="Aún no se ha enviado ningún correo"
              description="Se registran aquí al agendar, modificar o cancelar citas con los avisos por correo activos."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-80 overflow-y-auto">
              {logs.filter(l => l.idCompania === activeCompanyId).map(log => (
                <div key={log.id} className="p-4 rounded-control border border-border bg-surface-muted/50 space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone={
                      log.tipo === 'CANCELACION' ? 'danger' :
                      log.tipo === 'CONFIRMACION' ? 'success' :
                      log.tipo === 'CONSULTA' ? 'brand' :
                      'info'
                    }>
                      {log.tipo}
                    </Badge>
                    <span className="text-caption text-fg-muted font-medium tabular-nums">
                      {new Date(log.enviadoEn).toLocaleString('es-CR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <span className="font-semibold text-fg block break-words">Destinatario: <span className="font-normal text-fg-muted">{log.destinatario}</span></span>
                    <span className="font-semibold text-fg block break-words">Asunto: <span className="font-normal text-fg-muted">{log.asunto}</span></span>
                  </div>
                  <div className="bg-surface p-2.5 rounded-lg border border-border text-caption font-mono text-fg-muted whitespace-pre-wrap max-h-24 overflow-y-auto">
                    {log.cuerpo}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* SCHEDULING FORM MODAL */}
      <ResponsiveModal
        open={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={selectedCita ? 'Gestionar cita' : 'Nueva cita'}
        icon={<Clock aria-hidden="true" />}
        footer={
          <>
            {/* En móvil Facturar y Cerrar comparten fila; desde sm se integran a la fila de acciones */}
            <div className="flex gap-2 [&>*]:flex-1 sm:contents sm:[&>*]:flex-none">
              {selectedCita && (
                <Button
                  variant="outline"
                  onClick={() => handleAbrirFacturar(selectedCita)}
                  icon={<Receipt className="w-4 h-4" aria-hidden="true" />}
                  className="sm:mr-auto"
                >
                  Facturar
                </Button>
              )}
              <Button variant="secondary" onClick={() => setIsFormOpen(false)}>
                Cerrar
              </Button>
            </div>
            <Button type="submit" form="form-cita-agenda" icon={<Check className="w-4 h-4" aria-hidden="true" />}>
              {selectedCita ? 'Guardar cambios' : 'Crear cita'}
            </Button>
          </>
        }
      >
            <form id="form-cita-agenda" onSubmit={handleFormSubmit} className="space-y-6">
              {formError && (
                <div role="alert" className="p-3 rounded-control bg-danger-soft border border-danger/20 text-danger text-sm flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Sección: paciente */}
              <section aria-labelledby="cita-sec-paciente" className="space-y-3">
              <h4 id="cita-sec-paciente" className="text-caption font-semibold uppercase tracking-wider text-fg-subtle">{persona.singular}</h4>
              <div className="relative">
                <label htmlFor="cita-paciente" className="block text-xs font-semibold text-fg mb-1.5">{persona.singular} <span className="text-danger" aria-hidden="true">*</span></label>
                <div className="relative">
                  <Search className="w-4 h-4 text-fg-subtle absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
                  <input
                    id="cita-paciente"
                    type="text"
                    role="combobox"
                    aria-expanded={isPatientDropdownOpen}
                    aria-controls="cita-paciente-lista"
                    aria-autocomplete="list"
                    aria-activedescendant={isPatientDropdownOpen && filteredPatients[patientActiveIndex] ? `cita-paciente-op-${filteredPatients[patientActiveIndex].id}` : undefined}
                    autoComplete="off"
                    value={formPatientSearch}
                    onChange={(e) => {
                      setFormPatientSearch(e.target.value);
                      setFormPatientId('');
                      setIsPatientDropdownOpen(true);
                      setPatientActiveIndex(0);
                    }}
                    onFocus={() => setIsPatientDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setIsPatientDropdownOpen(false), 150)}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setIsPatientDropdownOpen(true);
                        setPatientActiveIndex(i => Math.min(i + 1, filteredPatients.length - 1));
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setPatientActiveIndex(i => Math.max(i - 1, 0));
                      } else if (e.key === 'Enter' && isPatientDropdownOpen && filteredPatients[patientActiveIndex]) {
                        e.preventDefault();
                        handleSelectPatient(filteredPatients[patientActiveIndex]);
                      } else if (e.key === 'Escape' && isPatientDropdownOpen) {
                        // Cierra solo la lista, no el modal completo
                        e.stopPropagation();
                        setIsPatientDropdownOpen(false);
                      }
                    }}
                    placeholder="Buscar por nombre o cédula…"
                    className={`w-full min-h-11 bg-surface border rounded-control pl-10 pr-3.5 text-body text-fg placeholder:text-fg-subtle hover:border-fg-subtle focus:border-brand transition-colors ${formPatientId ? 'border-success' : 'border-border-strong'}`}
                  />
                </div>
                {isPatientDropdownOpen && (
                  <ul id="cita-paciente-lista" role="listbox" aria-label={persona.plural} className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto bg-surface border border-border rounded-control shadow-lg animate-slide-down">
                    {filteredPatients.length > 0 ? (
                      filteredPatients.map((p, i) => (
                        <li
                          key={p.id}
                          id={`cita-paciente-op-${p.id}`}
                          role="option"
                          aria-selected={formPatientId === p.id.toString()}
                          onMouseDown={() => handleSelectPatient(p)}
                          onMouseEnter={() => setPatientActiveIndex(i)}
                          className={`w-full text-left px-3 py-2.5 text-sm cursor-pointer border-b border-border last:border-b-0 flex items-center justify-between gap-2 ${i === patientActiveIndex ? 'bg-surface-muted' : ''}`}
                        >
                          <span className="min-w-0">
                            <span className="font-semibold text-fg block truncate">{p.nombreCompleto}</span>
                            <span className="text-xs text-fg-muted">{p.identificacion}</span>
                          </span>
                          {formPatientId === p.id.toString() && <Check className="w-4 h-4 text-success shrink-0" aria-hidden="true" />}
                        </li>
                      ))
                    ) : (
                      <li className="px-3 py-3 text-sm text-fg-muted">Ningún {persona.minuscula} coincide con “{formPatientSearch}”. Regístrelo primero en {persona.plural}.</li>
                    )}
                  </ul>
                )}
              </div>
              </section>

              {/* Sección: fecha, hora y duración */}
              <section aria-labelledby="cita-sec-fecha" className="space-y-3">
              <h4 id="cita-sec-fecha" className="text-caption font-semibold uppercase tracking-wider text-fg-subtle">Fecha, hora y duración</h4>
              {/* minmax(0,1fr): las columnas pueden encoger sin que iOS recorte la fecha/hora */}
              <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] sm:grid-cols-[repeat(3,minmax(0,1fr))] gap-3">
                <Field label="Fecha" required className="col-span-2 sm:col-span-1">
                  <Input
                    id="agendacale-fecha"
                    type="date"
                    required
                    className="px-2.5!"
                    value={formDate}
                    onChange={(e: any) => setFormDate(e.target.value)}
                  />
                </Field>
                <Field label="Hora de inicio" required>
                  <Input
                    id="agendacale-hora-inicio"
                    type="time"
                    required
                    className="px-2.5!"
                    value={formTime}
                    onChange={(e: any) => setFormTime(e.target.value)}
                  />
                </Field>
                <Field label="Duración" required>
                  <Select
                    id="agendacale-duracion-min"
                    value={formDuration}
                    onChange={(e: any) => setFormDuration(parseInt(e.target.value))}
                  >
                    <option value={15}>15 minutos</option>
                    <option value={30}>30 minutos</option>
                    <option value={45}>45 minutos</option>
                    <option value={60}>60 minutos</option>
                    <option value={90}>90 minutos</option>
                    <option value={120}>120 minutos</option>
                  </Select>
                </Field>
              </div>
              </section>

              {/* Sección: tipo de visita y servicio */}
              <section aria-labelledby="cita-sec-visita" className="space-y-3">
              <h4 id="cita-sec-visita" className="text-caption font-semibold uppercase tracking-wider text-fg-subtle">Tipo de visita y servicio</h4>
              <p className="text-sm text-fg flex items-center gap-2">
                {tipoVisitaForm === 'DOMICILIO' ? <Home className="w-4 h-4 text-brand-ink" aria-hidden="true" /> : <Building2 className="w-4 h-4 text-brand-ink" aria-hidden="true" />}
                <span className="font-medium">{tipoVisitaForm === 'DOMICILIO' ? 'Visita a domicilio' : 'En consultorio'}</span>
              </p>

              {/* Home-visit location (only for existing DOMICILIO citas — staff can't create these directly) */}
              {selectedCita?.tipoVisita === 'DOMICILIO' && (
                <div className="p-3 rounded-control bg-warning-soft border border-warning/25 text-sm space-y-1.5">
                  <div className="flex items-center gap-1.5 text-warning font-semibold">
                    <MapPin className="w-4 h-4" aria-hidden="true" />
                    Visita a domicilio
                  </div>
                  <p className="text-fg">{selectedCita.direccionDomicilio || 'Dirección no especificada'}</p>
                  {selectedCita.tiempoTrasladoMinutos != null && (
                    <p className="text-fg-muted">Tiempo de traslado estimado: {selectedCita.tiempoTrasladoMinutos} min</p>
                  )}
                  {urlUbicacionCita(selectedCita) && (
                    <a
                      href={urlUbicacionCita(selectedCita)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 min-h-10 text-brand-ink font-semibold hover:underline"
                    >
                      <Navigation className="w-4 h-4" aria-hidden="true" />
                      Abrir ubicación del {persona.minuscula}
                    </a>
                  )}
                </div>
              )}

              {/* Servicio (opcional — autocompleta la duración de la cita) */}
              {companyServicios.length > 0 && (
                <Field label="Servicio">
                  <Select
                    id="agendacale-servicio"
                    value={formServicioId}
                    onChange={(e: any) => {
                      const val = e.target.value;
                      setFormServicioId(val);
                      const servicio = companyServicios.find(s => s.id === parseInt(val));
                      if (servicio) setFormDuration(servicio.duracionMinutos);
                    }}
                  >
                    <option value="">-- Sin servicio específico (duración manual) --</option>
                    {serviciosParaForm.map(s => (
                      <option key={s.id} value={s.id}>{s.nombre} ({s.duracionMinutos} min) · {formatearColones(precioConIva(s.precio, ivaEfectivo(s, ivaPorDefecto)))} IVA incl.</option>
                    ))}
                  </Select>
                </Field>
              )}
              </section>

              {/* Sección: profesional y estado */}
              <section aria-labelledby="cita-sec-estado" className="space-y-3">
              <h4 id="cita-sec-estado" className="text-caption font-semibold uppercase tracking-wider text-fg-subtle">Profesional y estado</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Profesional asignado" required>
                  <Select
                    id="agendacale-profesional-asignado"
                    value={formDoctorId}
                    onChange={(e: any) => setFormDoctorId(parseInt(e.target.value))}
                  >
                    {users.filter(u => u.idCompania === activeCompanyId && u.rol !== 'Contador').map(doc => (
                      <option key={doc.id} value={doc.id}>{doc.nombre}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Estado de la cita" required>
                  <Select
                    id="agendacale-estado-de-la-cita"
                    value={formStatus}
                    onChange={(e: any) => setFormStatus(e.target.value as Cita['estadoCita'])}
                  >
                    <option value="PROGRAMADA">PROGRAMADA (Sin Confirmar)</option>
                    <option value="CONFIRMADA">CONFIRMADA</option>
                    <option value="CANCELADA">CANCELADA</option>
                    <option value="COMPLETADA">COMPLETADA (Atendida)</option>
                    <option value="NO_ASISTIO">NO ASISTIÓ</option>
                  </Select>
                </Field>
              </div>
              </section>

              {/* Sección: notas */}
              <section aria-labelledby="cita-sec-notas" className="space-y-3">
              <h4 id="cita-sec-notas" className="text-caption font-semibold uppercase tracking-wider text-fg-subtle">Notas</h4>
              <Field label={`Notas internas de agenda (no se envían al ${persona.minuscula})`}>
                <Textarea
                  id="agendacale-notas-internas-de-agenda"
                  value={formNotes}
                  onChange={(e: any) => setFormNotes(e.target.value)}
                  placeholder={esLegal ? 'ej: Revisar avance del caso y documentos pendientes.' : 'ej: Paciente reporta dolor irradiado. Solicita enfoque suave.'}
                  rows={2}
                  className="resize-none"
                />
              </Field>
              </section>

              {/* Acción destructiva separada de la barra de guardar */}
              {selectedCita && selectedCita.estadoCita !== 'CANCELADA' && (
                <div className="pt-3 border-t border-dashed border-danger/30 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-fg-muted">La cita no se elimina: queda en el historial como cancelada.</p>
                  <button
                    type="button"
                    onClick={handleCancelarCita}
                    className="min-h-11 px-3 rounded-control text-danger hover:bg-danger-soft text-sm font-semibold flex items-center gap-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-danger"
                  >
                    <Ban className="w-4 h-4" aria-hidden="true" />
                    Cancelar cita
                  </button>
                </div>
              )}
            </form>
      </ResponsiveModal>

      {facturaCita && (
        <FacturarModal
          idCompania={activeCompanyId}
          idPaciente={facturaCita.idPaciente}
          idCita={facturaCita.id}
          nombrePaciente={patients.find(p => p.id === facturaCita.idPaciente)?.nombreCompleto || persona.singular}
          etiquetaPersona={persona.singular}
          servicios={companyServicios}
          ivaPorDefecto={ivaPorDefecto}
          plazoCreditoDefecto={plazoCreditoDefecto}
          cantidadesIniciales={facturaCita.idServicio ? { [facturaCita.idServicio]: 1 } : {}}
          onCrearFactura={onCrearFactura}
          onVerificarEstadoFactura={onVerificarEstadoFactura}
          onClose={() => setFacturaCita(null)}
          themeColor={themeColor}
        />
      )}

      <ResponsiveModal
        open={isBlockFormOpen}
        onClose={() => setIsBlockFormOpen(false)}
        title={selectedBlock ? 'Editar bloqueo de agenda' : 'Bloquear horario'}
        icon={<Lock aria-hidden="true" />}
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsBlockFormOpen(false)}>
              Cerrar
            </Button>
            <Button type="submit" form="form-bloqueo-agenda" icon={<Check className="w-4 h-4" aria-hidden="true" />}>
              {selectedBlock ? 'Guardar cambios' : 'Bloquear'}
            </Button>
          </>
        }
      >
            <form id="form-bloqueo-agenda" onSubmit={handleBlockFormSubmit} className="space-y-4">
              {blockFormError && (
                <div role="alert" className="p-3 rounded-control bg-danger-soft border border-danger/20 text-danger text-sm flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{blockFormError}</span>
                </div>
              )}

              <Field label="Fecha de inicio" required>
                <Input
                  id="agendacale-fecha-de-inicio"
                  type="date"
                  required
                  className="px-2.5!"
                  value={blockFechaInicio}
                  onChange={(e: any) => setBlockFechaInicio(e.target.value)}
                />
              </Field>

              <div className="flex items-center gap-1">
                <input
                  type="checkbox"
                  id="blockEsVariosDias"
                  checked={blockEsVariosDias}
                  onChange={(e) => {
                    setBlockEsVariosDias(e.target.checked);
                    if (e.target.checked) {
                      setBlockEsTodoElDia(true);
                    }
                  }}
                  className="rounded accent-brand-solid w-5 h-5 cursor-pointer shrink-0"
                />
                <label htmlFor="blockEsVariosDias" className="text-sm font-medium text-fg cursor-pointer min-h-10 flex items-center pl-2 flex-1">Bloquear varios días (ej. vacaciones)</label>
              </div>

              {blockEsVariosDias && (
                <Field label="Fecha de fin" required>
                  <Input
                    id="agendacale-fecha-de-fin"
                    type="date"
                    required
                    className="px-2.5!"
                    value={blockFechaFin}
                    onChange={(e: any) => setBlockFechaFin(e.target.value)}
                  />
                </Field>
              )}

              {!blockEsVariosDias && (
                <div className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    id="blockEsTodoElDia"
                    checked={blockEsTodoElDia}
                    onChange={(e) => setBlockEsTodoElDia(e.target.checked)}
                    className="rounded accent-brand-solid w-5 h-5 cursor-pointer shrink-0"
                  />
                  <label htmlFor="blockEsTodoElDia" className="text-sm font-medium text-fg cursor-pointer min-h-10 flex items-center pl-2 flex-1">Todo el día</label>
                </div>
              )}

              {!blockEsVariosDias && !blockEsTodoElDia && (
                <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-3">
                  <Field label="Hora de inicio" required>
                    <Input
                      id="agendacale-hora-inicio-2"
                      type="time"
                      required
                      className="px-2.5!"
                      value={blockHoraInicio}
                      onChange={(e: any) => setBlockHoraInicio(e.target.value)}
                    />
                  </Field>
                  <Field label="Hora de fin" required>
                    <Input
                      id="agendacale-hora-fin"
                      type="time"
                      required
                      className="px-2.5!"
                      value={blockHoraFin}
                      onChange={(e: any) => setBlockHoraFin(e.target.value)}
                    />
                  </Field>
                </div>
              )}

              <Field label="Motivo (opcional)">
                <Input
                  id="agendacale-motivo-opcional"
                  type="text"
                  value={blockMotivo}
                  onChange={(e: any) => setBlockMotivo(e.target.value)}
                  placeholder="ej: Vacaciones, Capacitación, Cita personal"
                />
              </Field>

              {/* Acción destructiva separada de la barra de guardar */}
              {selectedBlock && (
                <div className="pt-3 border-t border-dashed border-danger/30 flex justify-start">
                  <button
                    type="button"
                    onClick={() => handleDeleteBlock(selectedBlock.id)}
                    className="min-h-11 px-3 -ml-3 rounded-control text-danger hover:bg-danger-soft text-sm font-semibold flex items-center gap-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-danger"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                    Eliminar bloqueo
                  </button>
                </div>
              )}
            </form>
      </ResponsiveModal>

      {/* Botón flotante "Nueva cita": solo en móvil (en escritorio queda el del encabezado) */}
      <button
        type="button"
        onClick={() => handleOpenNewCita()}
        className="md:hidden fixed right-4 bottom-safe z-30 inline-flex items-center gap-2 min-h-14 pl-4 pr-5 rounded-full bg-brand-solid text-brand-fg text-sm font-semibold shadow-lg active:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand print:hidden"
      >
        <Plus className="w-5 h-5" aria-hidden="true" />
        Nueva cita
      </button>

    </div>
  );
}
