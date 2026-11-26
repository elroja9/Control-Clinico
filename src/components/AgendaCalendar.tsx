import React, { useState, useEffect } from 'react';
import { Patient, User, Cita, CompaniaSmtpConfig, NotificationLog, CalendarBlock, Servicio, Factura } from '../data/mockData';
import FacturarModal from './FacturarModal';
import { notify, confirmar } from './ui/Feedback';
import { useDialog } from '../hooks/useDialog';
import { terminoPersona } from '../utils/terminoPersona';
import { formatearColones, ivaEfectivo, precioConIva } from '../utils/precios';
import {
  Calendar as CalendarIcon,
  Clock,
  User as UserIcon,
  Plus,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
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
  Receipt
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
  onSaveCita: (cita: Cita) => void;
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
  const guardarCita = (estado: Cita['estadoCita']) => {
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

    onSaveCita(savedCita);
    setIsFormOpen(false);
    notify.success(
      !selectedCita ? `Cita creada para ${patient.nombreCompleto}.` : estado === 'CANCELADA' && selectedCita.estadoCita !== 'CANCELADA' ? 'Cita cancelada.' : 'Cita actualizada.'
    );

    // --- Real SMTP Notification Triggers ---
    if (activeSmtp.activo) {
      let tipoNotif: 'CONFIRMACION' | 'CANCELACION' | 'MODIFICACION' = 'CONFIRMACION';
      if (!selectedCita) {
        tipoNotif = 'CONFIRMACION';
      } else if (selectedCita.estadoCita !== estado && estado === 'CANCELADA') {
        tipoNotif = 'CANCELACION';
      } else {
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
          cita: savedCita
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

  const citaFormRef = useDialog<HTMLDivElement>(isFormOpen, () => setIsFormOpen(false));
  const blockFormRef = useDialog<HTMLDivElement>(isBlockFormOpen, () => setIsBlockFormOpen(false));

  const handleAbrirFacturar = (cita: Cita) => {
    setFacturaCita(cita);
  };

  // Helper: Get color classes for appointment status
  const getStatusColor = (status: Cita['estadoCita']) => {
    switch (status) {
      case 'PROGRAMADA': return 'bg-sky-50 border-sky-200 text-sky-700 hover:bg-sky-100';
      case 'CONFIRMADA': return 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100';
      case 'CANCELADA': return 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100 line-through';
      case 'COMPLETADA': return 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100';
      case 'NO_ASISTIO': return 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100';
      default: return 'bg-slate-50 border-slate-200 text-slate-700';
    }
  };

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
      days.push(<div key={`prev-${i}`} className="h-28 border border-slate-100 bg-slate-50/50 p-1"></div>);
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
          className={`h-28 border border-slate-100 p-1.5 transition-colors cursor-pointer relative flex flex-col justify-between focus-visible:z-10 ${
            dayBlock ? 'bg-slate-100/70 bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,rgba(100,116,139,0.08)_6px,rgba(100,116,139,0.08)_12px)]' : isToday ? 'bg-teal-50/60 hover:bg-teal-50' : 'hover:bg-slate-50'
          }`}
        >
          <span className="text-xs font-bold text-slate-600 flex items-center gap-1">
            <span className={isToday ? 'inline-flex items-center justify-center w-6 h-6 rounded-full text-white' : ''} style={isToday ? { backgroundColor: themeColor } : undefined}>{day}</span>
            {dayBlock && <Lock className="w-3 h-3 text-slate-500" aria-hidden="true" />}
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
                  className={`px-1 py-0.5 rounded-md text-[11px] font-bold truncate border flex items-center gap-0.5 ${getStatusColor(cita.estadoCita)}`}
                  title={`${time} - ${patient?.nombreCompleto}${esDomicilio ? ` · Domicilio: ${cita.direccionDomicilio || 'sin dirección'}` : ''}`}
                  aria-label={`Cita ${time} con ${patient?.nombreCompleto || persona.minuscula}, ${cita.estadoCita.toLowerCase().replace('_', ' ')}`}
                >
                  {esDomicilio && <MapPin className="w-2.5 h-2.5 shrink-0" />}
                  <span className="truncate">{time} - {patient?.nombreCompleto || persona.singular}</span>
                </div>
              );
            })}
          </div>
          {dayCitas.length > 0 && (
            <span className="absolute bottom-1 right-1 bg-slate-200 text-slate-800 text-[11px] font-bold px-1.5 rounded-full tabular-nums" aria-hidden="true">
              {dayCitas.length}
            </span>
          )}
        </div>
      );
    }

    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="grid grid-cols-7 bg-slate-100 text-center font-bold text-xs py-2.5 text-slate-600 border-b border-slate-200" aria-hidden="true">
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
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="grid grid-cols-8 bg-slate-100 border-b border-slate-200 text-center font-bold text-xs py-2.5 text-slate-500">
          <div className="border-r border-slate-200 flex items-center justify-center text-[11px]">Hora</div>
          {weekDays.map((wd, i) => {
            const isToday = formatDateString(wd) === todayStr;
            return (
              <div key={i} className={`flex flex-col py-1 ${isToday ? 'bg-teal-50 text-teal-800 rounded-lg mx-1 font-extrabold' : ''}`}>
                <span className="text-[11px] uppercase">{['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'][i]}</span>
                <span className="text-xs">{wd.getDate()}</span>
              </div>
            );
          })}
        </div>

        <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
          {hours.map(h => {
            const timeStr = `${String(h).padStart(2, '0')}:00`;
            return (
              <div key={h} className="grid grid-cols-8 min-h-16">
                <div className="border-r border-slate-100 text-[11px] text-slate-500 font-bold flex items-center justify-center bg-slate-50/50">
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
                      className={`border-r border-slate-100 p-1 relative cursor-pointer min-h-16 flex flex-col gap-1 transition-colors focus-visible:z-10 ${
                        slotBlock ? 'bg-slate-100/70 bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,rgba(100,116,139,0.08)_6px,rgba(100,116,139,0.08)_12px)]' : 'hover:bg-slate-50'
                      }`}
                    >
                      {slotBlock && hourCitas.length === 0 && (
                        <Lock className="w-3 h-3 text-slate-500 m-auto" />
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
                            className={`p-1.5 rounded-lg text-[11px] font-bold border leading-tight ${getStatusColor(cita.estadoCita)}`}
                          >
                            <span className="block font-bold">{cita.fechaHora.split('T')[1]} ({cita.duracionMinutos}m)</span>
                            <span className="block text-slate-800 truncate">{patient?.nombreCompleto}</span>
                            {esDomicilio && (
                              <span className="flex items-center gap-0.5 text-slate-500 font-semibold truncate" title={cita.direccionDomicilio || 'Visita a domicilio'}>
                                <MapPin className="w-2.5 h-2.5 shrink-0" />
                                <span className="truncate">{cita.direccionDomicilio || 'Domicilio'}</span>
                                {urlUbicacionCita(cita) && (
                                  <a
                                    href={urlUbicacionCita(cita)!}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    title={`Abrir ubicación del ${persona.minuscula}`}
                                    className="shrink-0 text-teal-700"
                                  >
                                    <Navigation className="w-2.5 h-2.5" />
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
        <div className="bg-slate-900 text-white rounded-2xl p-4 flex justify-between items-center shadow-xs">
          <div>
            <span className="text-[11px] font-extrabold text-teal-400 uppercase tracking-widest block">Resumen del Día</span>
            <h3 className="text-sm font-bold mt-0.5">
              {currentDate.toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </h3>
          </div>
          <div className="bg-teal-500/10 border border-teal-500/20 px-3.5 py-1.5 rounded-xl text-center">
            <span className="text-[11px] block font-extrabold text-teal-300">CITAS HOY</span>
            <span className="text-xl font-black text-white">{dayCitas.length}</span>
          </div>
        </div>

        {/* Timeline lists */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs divide-y divide-slate-100 overflow-hidden">
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
              <div key={h} className="flex min-h-16">
                <div className="w-16 sm:w-20 shrink-0 border-r border-slate-100 text-xs text-slate-600 font-bold flex items-center justify-center bg-slate-50/50 tabular-nums">
                  {timeStr}
                </div>
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={`${timeStr}${slotBlock ? ', bloqueado' : hourCitas.length ? `, ${hourCitas.length} cita(s)` : ', disponible. Crear cita'}`}
                  onClick={abrirHora}
                  onKeyDown={activarConTeclado(abrirHora)}
                  className={`flex-1 min-w-0 p-2 transition-colors cursor-pointer flex flex-col gap-1.5 ${
                    slotBlock ? 'bg-slate-100/70 bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,rgba(100,116,139,0.08)_6px,rgba(100,116,139,0.08)_12px)]' : 'hover:bg-slate-50'
                  }`}
                >
                  {hourCitas.length === 0 ? (
                    slotBlock ? (
                      <span className="text-xs text-slate-600 font-semibold flex items-center gap-1 my-auto pl-2">
                        <Lock className="w-3 h-3" aria-hidden="true" /> Bloqueado{slotBlock.motivo ? `: ${slotBlock.motivo}` : ''}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500 font-medium my-auto pl-2 flex items-center gap-1">
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
                          className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 shadow-xs transition-colors ${getStatusColor(cita.estadoCita)}`}
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-black">{cita.fechaHora.split('T')[1]}</span>
                              <span className="text-[11px] font-bold uppercase bg-white/70 px-1.5 py-0.5 rounded-md border border-slate-300/40">{cita.estadoCita.replace('_', ' ')}</span>
                              {esDomicilio && (
                                <span className="text-[11px] font-black uppercase bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-md border border-amber-200 flex items-center gap-0.5">
                                  <MapPin className="w-2.5 h-2.5" /> Domicilio
                                </span>
                              )}
                            </div>
                            <h4 className="text-xs font-bold text-slate-800">{patient?.nombreCompleto || persona.singular}</h4>
                            {esDomicilio && (
                              <p className="text-[11px] text-amber-700 font-semibold truncate max-w-sm flex items-center gap-1">
                                <MapPin className="w-3 h-3 shrink-0" />
                                <span className="truncate">
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
                                    className="shrink-0 flex items-center gap-0.5 text-teal-700 hover:underline font-bold"
                                  >
                                    <Navigation className="w-3 h-3" />
                                    Abrir ubicación
                                  </a>
                                )}
                              </p>
                            )}
                            <p className="text-xs text-slate-600 truncate max-w-sm">{cita.notas || 'Sin notas internas'}</p>
                          </div>

                          <div className="flex items-center gap-2 mt-1 sm:mt-0">
                            {cita.idConsulta ? (
                              <span className="text-[11px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-md px-2 py-0.5 flex items-center gap-1">
                                <Check className="w-3 h-3" aria-hidden="true" />
                                Consulta atendida
                              </span>
                            ) : esLegal ? null : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (patient) onStartConsultation(patient, cita.id);
                                }}
                                className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold min-h-9 px-3 rounded-xl flex items-center gap-1.5 shadow-xs transition-colors shrink-0"
                              >
                                <Activity className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                                Iniciar consulta
                              </button>
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
    <div className="space-y-6">
      
      {/* Header toolbar */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-slate-950 text-white" style={{ backgroundColor: themeColor }}>
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Agenda y citas</h2>
            <p className="text-xs text-slate-600 mt-0.5">Toque un día u horario libre para agendar; toque una cita para gestionarla.</p>
          </div>
        </div>

        {/* Filters and View selectors */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          {/* Doctor filter dropdown */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <label htmlFor="filtro-profesional" className="text-xs font-semibold text-slate-600 shrink-0">Profesional</label>
            <select
              id="filtro-profesional"
              value={selectedDoctorId}
              onChange={(e) => setSelectedDoctorId(parseInt(e.target.value))}
              className="flex-1 sm:flex-none min-h-10 bg-slate-50 border border-slate-200 rounded-xl px-2.5 text-xs text-slate-800 font-semibold"
            >
              <option value={0}>Todos los especialistas</option>
              {users.filter(u => u.idCompania === activeCompanyId).map(doc => (
                <option key={doc.id} value={doc.id}>{doc.nombre}</option>
              ))}
            </select>
          </div>

          {/* View Toggles (Hidden/Disabled on Mobile since it forces 'day' view) */}
          <div className="hidden md:flex bg-slate-100 p-1 rounded-xl border border-slate-200" role="group" aria-label="Vista del calendario">
            {([['month', 'Mes'], ['week', 'Semana'], ['day', 'Día']] as const).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={`min-h-8 px-3 rounded-lg text-xs font-bold transition-colors ${
                  view === v ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleOpenNewBlock}
            className="flex-1 sm:flex-none min-h-10 bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 text-xs font-bold px-4 rounded-xl flex items-center justify-center gap-1.5 shadow-xs transition-colors md:ml-0"
          >
            <Lock className="w-4 h-4" aria-hidden="true" />
            Bloquear horario
          </button>

          <button
            type="button"
            onClick={() => handleOpenNewCita()}
            className="flex-1 sm:flex-none min-h-10 text-white text-xs font-bold px-4 rounded-xl flex items-center justify-center gap-1.5 shadow-sm hover:brightness-110 transition-[filter]"
            style={{ backgroundColor: themeColor }}
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Nueva cita
          </button>
        </div>
      </div>

      {/* Navigation Controller */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={handlePrev} aria-label={view === 'month' ? 'Mes anterior' : view === 'week' ? 'Semana anterior' : 'Día anterior'} className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 w-10 h-10 flex items-center justify-center rounded-xl transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button type="button" onClick={handleToday} className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 text-xs font-bold px-3.5 h-10 rounded-xl transition-colors">
            Hoy
          </button>
          <button type="button" onClick={handleNext} aria-label={view === 'month' ? 'Mes siguiente' : view === 'week' ? 'Semana siguiente' : 'Día siguiente'} className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 w-10 h-10 flex items-center justify-center rounded-xl transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <h3 className="text-sm font-extrabold text-slate-900 first-letter:uppercase order-first sm:order-none w-full sm:w-auto" aria-live="polite">
          {view === 'month' && currentDate.toLocaleDateString('es-CR', { month: 'long', year: 'numeric' })}
          {view === 'week' && `Semana del ${currentDate.toLocaleDateString('es-CR', { day: 'numeric', month: 'short' })}`}
          {view === 'day' && currentDate.toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </h3>

        <div
          className={`flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-1.5 font-semibold border ${activeSmtp.activo ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-slate-100 border-slate-200 text-slate-600'}`}
          title="Se configura en Personalizar Clínica › Correo"
        >
          <Bell className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Avisos por correo: {activeSmtp.activo ? 'activos' : 'apagados'}</span>
        </div>
      </div>

      {/* Render selected view */}
      {view === 'month' && renderMonthView()}
      {view === 'week' && renderWeekView()}
      {view === 'day' && renderDayView()}

      {/* Calendar Blocks List Section */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-slate-500" />
            <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider">Bloqueos de Agenda</h3>
          </div>
          <span className="text-[11px] bg-slate-100 text-slate-600 font-bold border border-slate-200 px-2.5 py-0.5 rounded-full uppercase">
            {myCalendarBlocks.length} activo{myCalendarBlocks.length !== 1 ? 's' : ''}
          </span>
        </div>

        {myCalendarBlocks.length === 0 ? (
          <div className="text-center py-6 text-xs text-slate-500 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
            No tienes horarios bloqueados. Usa "Bloquear Horario" para marcar fechas u horas no disponibles.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {myCalendarBlocks.map(block => (
              <div key={block.id} className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-all flex items-center justify-between gap-2 text-xs">
                <div>
                  <span className="font-bold text-slate-700 block">
                    {block.fechaInicio === block.fechaFin ? block.fechaInicio : `${block.fechaInicio} al ${block.fechaFin}`}
                    {block.horaInicio && block.horaFin ? ` · ${block.horaInicio} - ${block.horaFin}` : ' · Todo el día'}
                  </span>
                  {block.motivo && <span className="text-slate-500 block mt-0.5">{block.motivo}</span>}
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenEditBlock(block)}
                  className="text-slate-500 hover:text-slate-900 hover:bg-white p-2 -m-1 rounded-lg shrink-0 transition-colors"
                  title="Editar o eliminar"
                  aria-label={`Editar o eliminar el bloqueo del ${block.fechaInicio}`}
                >
                  <Edit className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Notification Logs History Section */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-slate-500" />
            <h3 className="text-xs font-bold uppercase text-slate-700 tracking-wider">Correos enviados a {persona.minusculaPlural}</h3>
          </div>
          <span className="text-[11px] bg-slate-100 text-slate-700 font-bold border border-slate-200 px-2.5 py-0.5 rounded-full tabular-nums">
            {logs.filter(l => l.idCompania === activeCompanyId).length}
          </span>
        </div>

        {logs.filter(l => l.idCompania === activeCompanyId).length === 0 ? (
          <div className="text-center py-6 px-4 text-xs text-slate-600 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
            Todavía no se ha enviado ningún correo. Se registran aquí al agendar, modificar o cancelar citas con los avisos por correo activos.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-80 overflow-y-auto">
            {logs.filter(l => l.idCompania === activeCompanyId).map(log => (
              <div key={log.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-all space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className={`text-[11px] font-black px-2 py-0.5 rounded-full ${
                    log.tipo === 'CANCELACION' ? 'bg-rose-100 text-rose-700 border border-rose-200' :
                    log.tipo === 'CONFIRMACION' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                    log.tipo === 'CONSULTA' ? 'bg-violet-100 text-violet-700 border border-violet-200' :
                    'bg-sky-100 text-sky-700 border border-sky-200'
                  }`}>
                    {log.tipo}
                  </span>
                  <span className="text-[11px] text-slate-600 font-semibold tabular-nums">
                    {new Date(log.enviadoEn).toLocaleString('es-CR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div>
                  <span className="font-bold text-slate-700 block">Destinatario: <span className="font-medium text-slate-500">{log.destinatario}</span></span>
                  <span className="font-bold text-slate-700 block">Asunto: <span className="font-medium text-slate-500">{log.asunto}</span></span>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-slate-200/60 text-[11px] font-mono text-slate-600 whitespace-pre-wrap max-h-24 overflow-y-auto">
                  {log.cuerpo}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SCHEDULING FORM MODAL */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4 z-50 animate-fade-in font-sans">
          <div
            ref={citaFormRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-form-cita"
            tabIndex={-1}
            className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-lg shadow-2xl border border-slate-200 max-h-[92dvh] sm:max-h-[85vh] overflow-y-auto overscroll-contain animate-dialog-in focus:outline-hidden"
          >
            <div className="surface-dark sticky top-0 z-10 p-5 bg-slate-950 text-white flex justify-between items-center" style={{ backgroundColor: themeColor }}>
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-white/80" aria-hidden="true" />
                <h3 id="titulo-form-cita" className="text-sm font-bold">{selectedCita ? 'Gestionar cita' : 'Nueva cita'}</h3>
              </div>
              <button type="button" onClick={() => setIsFormOpen(false)} className="text-white hover:bg-white/15 w-9 h-9 -m-1.5 flex items-center justify-center rounded-lg transition-colors" aria-label="Cerrar">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="p-5 space-y-4">
              {formError && (
                <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Patient Selection */}
              <div className="relative">
                <label htmlFor="cita-paciente" className="block text-slate-700 text-xs font-bold mb-1.5">{persona.singular} *</label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
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
                    className={`w-full min-h-10 bg-slate-50 border rounded-xl pl-8 pr-3 text-xs ${formPatientId ? 'border-emerald-300' : 'border-slate-200'}`}
                  />
                </div>
                {isPatientDropdownOpen && (
                  <ul id="cita-paciente-lista" role="listbox" aria-label={persona.plural} className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg animate-slide-down">
                    {filteredPatients.length > 0 ? (
                      filteredPatients.map((p, i) => (
                        <li
                          key={p.id}
                          id={`cita-paciente-op-${p.id}`}
                          role="option"
                          aria-selected={formPatientId === p.id.toString()}
                          onMouseDown={() => handleSelectPatient(p)}
                          onMouseEnter={() => setPatientActiveIndex(i)}
                          className={`w-full text-left px-3 py-2.5 text-xs cursor-pointer border-b border-slate-100 last:border-b-0 flex items-center justify-between gap-2 ${i === patientActiveIndex ? 'bg-slate-100' : ''}`}
                        >
                          <span className="min-w-0">
                            <span className="font-semibold text-slate-900 block truncate">{p.nombreCompleto}</span>
                            <span className="text-slate-600">{p.identificacion}</span>
                          </span>
                          {formPatientId === p.id.toString() && <Check className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />}
                        </li>
                      ))
                    ) : (
                      <li className="px-3 py-3 text-xs text-slate-600">Ningún {persona.minuscula} coincide con “{formPatientSearch}”. Regístrelo primero en {persona.plural}.</li>
                    )}
                  </ul>
                )}
              </div>

              {/* Servicio (opcional — autocompleta la duración de la cita) */}
              {companyServicios.length > 0 && (
                <div>
                  <label htmlFor="agendacale-servicio" className="block text-slate-600 text-xs font-bold mb-1.5">Servicio</label>
                  <select id="agendacale-servicio"
                    value={formServicioId}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormServicioId(val);
                      const servicio = companyServicios.find(s => s.id === parseInt(val));
                      if (servicio) setFormDuration(servicio.duracionMinutos);
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
                  >
                    <option value="">-- Sin servicio específico (duración manual) --</option>
                    {companyServicios.map(s => (
                      <option key={s.id} value={s.id}>{s.nombre} ({s.duracionMinutos} min) · {formatearColones(precioConIva(s.precio, ivaEfectivo(s, ivaPorDefecto)))} IVA incl.</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Date, Time, Duration */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="agendacale-fecha" className="block text-slate-600 text-xs font-bold mb-1.5">Fecha *</label>
                  <input id="agendacale-fecha"
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label htmlFor="agendacale-hora-inicio" className="block text-slate-600 text-xs font-bold mb-1.5">Hora Inicio *</label>
                  <input id="agendacale-hora-inicio"
                    type="time"
                    required
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label htmlFor="agendacale-duracion-min" className="block text-slate-600 text-xs font-bold mb-1.5">Duración (Min) *</label>
                  <select id="agendacale-duracion-min"
                    value={formDuration}
                    onChange={(e) => setFormDuration(parseInt(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
                  >
                    <option value={15}>15 minutos</option>
                    <option value={30}>30 minutos</option>
                    <option value={45}>45 minutos</option>
                    <option value={60}>60 minutos</option>
                    <option value={90}>90 minutos</option>
                    <option value={120}>120 minutos</option>
                  </select>
                </div>
              </div>

              {/* Specialist & Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="agendacale-profesional-asignado" className="block text-slate-600 text-xs font-bold mb-1.5">Profesional Asignado *</label>
                  <select id="agendacale-profesional-asignado"
                    value={formDoctorId}
                    onChange={(e) => setFormDoctorId(parseInt(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
                  >
                    {users.filter(u => u.idCompania === activeCompanyId).map(doc => (
                      <option key={doc.id} value={doc.id}>{doc.nombre}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="agendacale-estado-de-la-cita" className="block text-slate-600 text-xs font-bold mb-1.5">Estado de la Cita *</label>
                  <select id="agendacale-estado-de-la-cita"
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as Cita['estadoCita'])}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
                  >
                    <option value="PROGRAMADA">PROGRAMADA (Sin Confirmar)</option>
                    <option value="CONFIRMADA">CONFIRMADA</option>
                    <option value="CANCELADA">CANCELADA</option>
                    <option value="COMPLETADA">COMPLETADA (Atendida)</option>
                    <option value="NO_ASISTIO">NO ASISTIÓ</option>
                  </select>
                </div>
              </div>

              {/* Home-visit location (only for existing DOMICILIO citas — staff can't create these directly) */}
              {selectedCita?.tipoVisita === 'DOMICILIO' && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs space-y-1.5">
                  <div className="flex items-center gap-1.5 text-amber-800 font-bold">
                    <MapPin className="w-3.5 h-3.5" />
                    Visita a Domicilio
                  </div>
                  <p className="text-slate-700">{selectedCita.direccionDomicilio || 'Dirección no especificada'}</p>
                  {selectedCita.tiempoTrasladoMinutos != null && (
                    <p className="text-slate-500">Tiempo de traslado estimado: {selectedCita.tiempoTrasladoMinutos} min</p>
                  )}
                  {urlUbicacionCita(selectedCita) && (
                    <a
                      href={urlUbicacionCita(selectedCita)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-teal-700 font-bold hover:underline"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      Abrir ubicación del {persona.minuscula}
                    </a>
                  )}
                </div>
              )}

              {/* Notes */}
              <div>
                <label htmlFor="agendacale-notas-internas-de-agenda" className="block text-slate-600 text-xs font-bold mb-1.5">Notas Internas de Agenda (No se envían al paciente)</label>
                <textarea id="agendacale-notas-internas-de-agenda"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder={esLegal ? 'ej: Revisar avance del caso y documentos pendientes.' : 'ej: Paciente reporta dolor irradiado. Solicita enfoque suave.'}
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs focus:ring-1 focus:ring-teal-500 focus:outline-hidden resize-none"
                />
              </div>

              {/* Actions Footer */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
                {selectedCita ? (
                  <div className="flex items-center gap-1 -ml-2">
                    {selectedCita.estadoCita !== 'CANCELADA' && (
                      <button
                        type="button"
                        onClick={handleCancelarCita}
                        className="min-h-10 px-2 rounded-lg text-rose-700 hover:bg-rose-50 text-xs font-bold flex items-center gap-1.5 transition-colors"
                      >
                        <Ban className="w-4 h-4" aria-hidden="true" />
                        Cancelar cita
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleAbrirFacturar(selectedCita)}
                      className="min-h-10 px-2 rounded-lg text-emerald-800 hover:bg-emerald-50 text-xs font-bold flex items-center gap-1.5 transition-colors"
                    >
                      <Receipt className="w-4 h-4" aria-hidden="true" />
                      Facturar
                    </button>
                  </div>
                ) : (
                  <div></div>
                )}

                <div className="flex gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="min-h-10 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold px-4 rounded-xl transition-colors"
                  >
                    Cerrar
                  </button>
                  <button
                    type="submit"
                    className="min-h-10 text-white text-xs font-bold px-4 rounded-xl shadow-xs flex items-center gap-1.5 hover:brightness-110 transition-[filter]"
                    style={{ backgroundColor: themeColor }}
                  >
                    <Check className="w-4 h-4" aria-hidden="true" />
                    {selectedCita ? 'Guardar cambios' : 'Crear cita'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

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

      {isBlockFormOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4 z-50 animate-fade-in font-sans">
          <div
            ref={blockFormRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-form-bloqueo"
            tabIndex={-1}
            className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-lg shadow-2xl border border-slate-200 max-h-[92dvh] sm:max-h-[85vh] overflow-y-auto overscroll-contain animate-dialog-in focus:outline-hidden"
          >
            <div className="surface-dark sticky top-0 z-10 p-5 bg-slate-950 text-white flex justify-between items-center" style={{ backgroundColor: themeColor }}>
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-white/80" aria-hidden="true" />
                <h3 id="titulo-form-bloqueo" className="text-sm font-bold">{selectedBlock ? 'Editar bloqueo de agenda' : 'Bloquear horario'}</h3>
              </div>
              <button type="button" onClick={() => setIsBlockFormOpen(false)} className="text-white hover:bg-white/15 w-9 h-9 -m-1.5 flex items-center justify-center rounded-lg transition-colors" aria-label="Cerrar">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleBlockFormSubmit} className="p-5 space-y-4">
              {blockFormError && (
                <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{blockFormError}</span>
                </div>
              )}

              <div>
                <label htmlFor="agendacale-fecha-de-inicio" className="block text-slate-600 text-xs font-bold mb-1.5">Fecha de Inicio *</label>
                <input id="agendacale-fecha-de-inicio"
                  type="date"
                  required
                  value={blockFechaInicio}
                  onChange={(e) => setBlockFechaInicio(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
                />
              </div>

              <div className="flex items-center gap-2">
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
                  className="rounded text-teal-600 w-4 h-4 cursor-pointer"
                />
                <label htmlFor="blockEsVariosDias" className="text-xs font-bold text-slate-700 cursor-pointer">Bloquear varios días (ej. vacaciones)</label>
              </div>

              {blockEsVariosDias && (
                <div>
                  <label htmlFor="agendacale-fecha-de-fin" className="block text-slate-600 text-xs font-bold mb-1.5">Fecha de Fin *</label>
                  <input id="agendacale-fecha-de-fin"
                    type="date"
                    required
                    value={blockFechaFin}
                    onChange={(e) => setBlockFechaFin(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
                  />
                </div>
              )}

              {!blockEsVariosDias && (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="blockEsTodoElDia"
                    checked={blockEsTodoElDia}
                    onChange={(e) => setBlockEsTodoElDia(e.target.checked)}
                    className="rounded text-teal-600 w-4 h-4 cursor-pointer"
                  />
                  <label htmlFor="blockEsTodoElDia" className="text-xs font-bold text-slate-700 cursor-pointer">Todo el día</label>
                </div>
              )}

              {!blockEsVariosDias && !blockEsTodoElDia && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="agendacale-hora-inicio-2" className="block text-slate-600 text-xs font-bold mb-1.5">Hora Inicio *</label>
                    <input id="agendacale-hora-inicio-2"
                      type="time"
                      required
                      value={blockHoraInicio}
                      onChange={(e) => setBlockHoraInicio(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label htmlFor="agendacale-hora-fin" className="block text-slate-600 text-xs font-bold mb-1.5">Hora Fin *</label>
                    <input id="agendacale-hora-fin"
                      type="time"
                      required
                      value={blockHoraFin}
                      onChange={(e) => setBlockHoraFin(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
                    />
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="agendacale-motivo-opcional" className="block text-slate-600 text-xs font-bold mb-1.5">Motivo (opcional)</label>
                <input id="agendacale-motivo-opcional"
                  type="text"
                  value={blockMotivo}
                  onChange={(e) => setBlockMotivo(e.target.value)}
                  placeholder="ej: Vacaciones, Capacitación, Cita personal"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
                {selectedBlock ? (
                  <button
                    type="button"
                    onClick={() => handleDeleteBlock(selectedBlock.id)}
                    className="min-h-10 px-2 -ml-2 rounded-lg text-rose-700 hover:bg-rose-50 text-xs font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                    Eliminar bloqueo
                  </button>
                ) : (
                  <div></div>
                )}

                <div className="flex gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={() => setIsBlockFormOpen(false)}
                    className="min-h-10 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold px-4 rounded-xl transition-colors"
                  >
                    Cerrar
                  </button>
                  <button
                    type="submit"
                    className="min-h-10 text-white text-xs font-bold px-4 rounded-xl shadow-xs flex items-center gap-1.5 hover:brightness-110 transition-[filter]"
                    style={{ backgroundColor: themeColor }}
                  >
                    <Check className="w-4 h-4" aria-hidden="true" />
                    {selectedBlock ? 'Guardar cambios' : 'Bloquear'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
