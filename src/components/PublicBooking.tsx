import React, { useEffect, useState } from 'react';
import { Building, Building2, Home, User as UserIcon, Calendar, MapPin, Check, ArrowLeft, ArrowRight, Loader2, AlertCircle, ListChecks, Clock, Navigation, MessageCircle, ChevronUp, ReceiptText, PartyPopper } from 'lucide-react';
import { loadGoogleMapsScript } from '../utils/loadGoogleMaps';
import { servicioCompatible } from '../utils/modalidad';
import { enlaceWhatsapp } from '../utils/whatsapp';
import { formatearColones } from '../utils/precios';
import { Avatar } from './ui/Avatar';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Field } from './ui/Field';
import { Input } from './ui/Input';
import { SegmentedControl } from './ui/SegmentedControl';
import { cx } from './ui/cx';

interface ClinicaPublica {
  id: number;
  nombreComercial: string;
  perfilCompania: string;
  logoUrl: string;
  colorPrimario: string;
  colorSidebar: string;
  reservaAutoConsultorio?: boolean;
  reservaAutoDomicilio?: boolean;
  whatsappReservas?: string | null;
  mensajeWhatsappReservas?: string | null;
}

interface ProfesionalPublico {
  id: number;
  nombre: string;
  rol: string;
  aceptaDomicilio: boolean;
}

interface ServicioPublico {
  id: number;
  nombre: string;
  precio: number;
  precioConIva: number;
  duracionMinutos: number;
  modalidad?: 'CONSULTORIO' | 'DOMICILIO' | 'AMBOS';
}

// Pasos 1=clínica, 2=profesional, 3=servicio (se salta si la empresa no tiene
// catálogo de servicios activos), 4=tipo de visita + horario, 5=dirección de
// domicilio (solo si aplica), 6=datos del paciente, 7=confirmación.
type Paso = 1 | 2 | 3 | 4 | 5 | 6 | 7;

// Fecha local YYYY-MM-DD: toISOString() usa UTC y de noche en Costa Rica ya marcaba el día siguiente
const aFechaLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fechaLocalHoy = () => aFechaLocal(new Date());

export default function PublicBooking() {
  const [paso, setPaso] = useState<Paso>(1);
  const [error, setError] = useState('');
  const [cargandoClinicas, setCargandoClinicas] = useState(true);
  // Hoja inferior con el resumen de la reserva (solo móvil)
  const [resumenAbierto, setResumenAbierto] = useState(false);

  // Cambiar de paso limpia el error del paso anterior y vuelve arriba (en móvil el
  // botón "Continuar" suele quedar al fondo de la pantalla)
  const irAPaso = (p: Paso) => {
    setError('');
    setPaso(p);
    setResumenAbierto(false);
    window.scrollTo({ top: 0 });
  };
  const [submitting, setSubmitting] = useState(false);

  const [clinicas, setClinicas] = useState<ClinicaPublica[]>([]);
  const [clinicaId, setClinicaId] = useState<number | null>(null);

  const [profesionales, setProfesionales] = useState<ProfesionalPublico[]>([]);
  const [profesionalId, setProfesionalId] = useState<number | null>(null);

  const [servicios, setServicios] = useState<ServicioPublico[]>([]);
  const [servicioId, setServicioId] = useState<number | null>(null);

  const [tipoVisita, setTipoVisita] = useState<'CONSULTORIO' | 'DOMICILIO'>('CONSULTORIO');
  const [fecha, setFecha] = useState(fechaLocalHoy);
  const [horariosDisponibles, setHorariosDisponibles] = useState<string[]>([]);
  const [horaSeleccionada, setHoraSeleccionada] = useState('');
  const [cargandoHorarios, setCargandoHorarios] = useState(false);

  const [direccionDomicilio, setDireccionDomicilio] = useState('');
  const [pacienteLat, setPacienteLat] = useState<number | null>(null);
  const [pacienteLng, setPacienteLng] = useState<number | null>(null);
  const [mapsListo, setMapsListo] = useState(false);

  const [cedula, setCedula] = useState('');
  const [tipoIdentificacion, setTipoIdentificacion] = useState<'01' | '02' | '03' | '04' | 'EXT'>('01');
  const [nombreCompleto, setNombreCompleto] = useState('');
  const [fechaNacimiento, setFechaNacimiento] = useState('1995-01-01');
  const [telefono, setTelefono] = useState('');
  const [correoElectronico, setCorreoElectronico] = useState('');
  const [pacienteEncontrado, setPacienteEncontrado] = useState(false);
  const [nombrePacienteExistente, setNombrePacienteExistente] = useState('');

  const [citaCreada, setCitaCreada] = useState<any>(null);

  const clinica = clinicas.find(c => c.id === clinicaId);
  const profesional = profesionales.find(p => p.id === profesionalId);

  useEffect(() => {
    fetch('/api/public/clinicas')
      .then(res => res.json())
      .then((data: ClinicaPublica[]) => {
        setClinicas(data);
        const clinicaParam = new URLSearchParams(window.location.search).get('clinica');
        if (clinicaParam) {
          const preseleccionada = data.find(c => c.id === parseInt(clinicaParam));
          if (preseleccionada) {
            setClinicaId(preseleccionada.id);
            setPaso(2);
          }
        }
      })
      .catch(() => setError('No se pudieron cargar las clínicas.'))
      .finally(() => setCargandoClinicas(false));
  }, []);

  useEffect(() => {
    if (!clinicaId) return;
    setServicioId(null);
    fetch(`/api/public/clinicas/${clinicaId}/profesionales`)
      .then(res => res.json())
      .then(setProfesionales)
      .catch(() => setError('No se pudieron cargar los profesionales.'));
    fetch(`/api/public/clinicas/${clinicaId}/servicios`)
      .then(res => res.json())
      .then(setServicios)
      .catch(() => setServicios([]));
  }, [clinicaId]);

  useEffect(() => {
    if (paso !== 5 || tipoVisita !== 'DOMICILIO') return;
    fetch('/api/public/config')
      .then(res => res.json())
      .then(data => loadGoogleMapsScript(data.googleMapsApiKey))
      .then(() => setMapsListo(true))
      .catch(() => setError('No se pudo cargar Google Maps.'));
  }, [paso, tipoVisita]);

  useEffect(() => {
    if (!mapsListo || tipoVisita !== 'DOMICILIO') return;
    const input = document.getElementById('direccion-domicilio-input') as HTMLInputElement | null;
    if (!input) return;
    const autocomplete = new (window as any).google.maps.places.Autocomplete(input, { fields: ['formatted_address', 'geometry'] });
    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (place.geometry?.location) {
        setDireccionDomicilio(place.formatted_address || input.value);
        setPacienteLat(place.geometry.location.lat());
        setPacienteLng(place.geometry.location.lng());
      }
    });
  }, [mapsListo, tipoVisita]);

  const usarUbicacionActual = () => {
    if (!navigator.geolocation) {
      setError('Tu navegador no soporta geolocalización.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        setPacienteLat(pos.coords.latitude);
        setPacienteLng(pos.coords.longitude);
        setDireccionDomicilio(prev => prev || 'Ubicación actual del dispositivo');
      },
      () => setError('No se pudo obtener tu ubicación. Escribe tu dirección manualmente.')
    );
  };

  const cargarHorarios = () => {
    if (!profesionalId) return;
    // Con reserva automática apagada no hay horarios que consultar (el servidor respondería 403).
    const clinicaActual = clinicas.find(c => c.id === clinicaId);
    const auto = tipoVisita === 'DOMICILIO' ? clinicaActual?.reservaAutoDomicilio !== false : clinicaActual?.reservaAutoConsultorio !== false;
    if (!auto) {
      setHorariosDisponibles([]);
      setHoraSeleccionada('');
      return;
    }
    setCargandoHorarios(true);
    setHoraSeleccionada('');
    const servicioParam = servicioId ? `&idServicio=${servicioId}` : '';
    fetch(`/api/public/disponibilidad?idUsuario=${profesionalId}&fecha=${fecha}&tipoVisita=${tipoVisita}${servicioParam}`)
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudieron cargar los horarios disponibles.');
        return data;
      })
      .then(data => setHorariosDisponibles(data))
      .catch((err) => { setHorariosDisponibles([]); setError(err.message || 'No se pudieron cargar los horarios disponibles.'); })
      .finally(() => setCargandoHorarios(false));
  };

  useEffect(() => {
    if (paso === 4 && profesionalId) cargarHorarios();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso, profesionalId, fecha, tipoVisita, servicioId]);

  const buscarPacientePorCedula = () => {
    if (!cedula.trim() || !clinicaId) return;
    fetch(`/api/public/clinicas/${clinicaId}/pacientes/${encodeURIComponent(cedula.trim())}`)
      .then(res => {
        if (!res.ok) throw new Error('not found');
        return res.json();
      })
      .then(data => {
        // El servidor solo revela el primer nombre: los datos de contacto registrados se usan
        // tal cual y no se piden ni se precargan aquí.
        setNombrePacienteExistente(typeof data.nombre === 'string' ? data.nombre : '');
        setPacienteEncontrado(data.existe === true);
      })
      .catch(() => { setPacienteEncontrado(false); setNombrePacienteExistente(''); });
  };

  const confirmarCita = () => {
    setError('');
    if (!cedula.trim() || (!pacienteEncontrado && (!nombreCompleto.trim() || !telefono.trim() || !correoElectronico.trim()))) {
      setError('Por favor complete todos los campos.');
      return;
    }
    if (tipoVisita === 'DOMICILIO' && (pacienteLat == null || pacienteLng == null)) {
      setError('Por favor indique su dirección o use su ubicación actual.');
      return;
    }
    setSubmitting(true);
    fetch('/api/public/citas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idCompania: clinicaId,
        idUsuarioNutricionista: profesionalId,
        idServicio: servicioId || undefined,
        fechaHora: `${fecha}T${horaSeleccionada}`,
        tipoVisita,
        direccionDomicilio: tipoVisita === 'DOMICILIO' ? direccionDomicilio : undefined,
        pacienteLat: tipoVisita === 'DOMICILIO' ? pacienteLat : undefined,
        pacienteLng: tipoVisita === 'DOMICILIO' ? pacienteLng : undefined,
        paciente: pacienteEncontrado
          ? { identificacion: cedula.trim() }
          : { identificacion: cedula.trim(), tipoIdentificacion, nombreCompleto, telefono, correoElectronico, fechaNacimiento }
      })
    })
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudo agendar la cita.');
        setCitaCreada(data);
        irAPaso(7);
      })
      .catch(err => setError(err.message))
      .finally(() => setSubmitting(false));
  };

  const colorPrimario = clinica?.colorPrimario || '#0d9488';
  const servicio = servicios.find(s => s.id === servicioId);

  // Solo se ofrecen los servicios compatibles con el tipo de visita elegido.
  const serviciosVisibles = servicios.filter(s => servicioCompatible(s.modalidad, tipoVisita));

  // Cambiar el tipo de visita limpia el servicio elegido si ya no es compatible.
  const cambiarTipoVisita = (nuevo: 'CONSULTORIO' | 'DOMICILIO') => {
    setTipoVisita(nuevo);
    const elegido = servicios.find(s => s.id === servicioId);
    if (elegido && !servicioCompatible(elegido.modalidad, nuevo)) setServicioId(null);
  };

  // Reserva automática apagada para este tipo de visita => se pide el espacio por WhatsApp.
  const reservaAutomatica = tipoVisita === 'DOMICILIO' ? clinica?.reservaAutoDomicilio !== false : clinica?.reservaAutoConsultorio !== false;
  const mensajeSolicitud = clinica?.mensajeWhatsappReservas
    || `Hola, quisiera solicitar un espacio para una cita ${tipoVisita === 'DOMICILIO' ? 'a domicilio' : 'en consultorio'}${servicio ? ` de ${servicio.nombre}` : ''}.${nombreCompleto.trim() ? ` Mi nombre es ${nombreCompleto.trim()}.` : ''}`;
  const enlaceSolicitud = enlaceWhatsapp(clinica?.whatsappReservas, mensajeSolicitud);

  // Si la reserva a domicilio es por WhatsApp, no se exige que el profesional tenga ubicación configurada.
  const domicilioDeshabilitado = clinica?.reservaAutoDomicilio !== false && !profesional?.aceptaDomicilio;
  const selectorTipoVisita = (
    <div className="space-y-1.5">
      <SegmentedControl
        ariaLabel="Tipo de visita"
        value={tipoVisita}
        onChange={(v) => cambiarTipoVisita(v)}
        options={[
          { value: 'CONSULTORIO', label: 'En consultorio', icon: <Building2 /> },
          { value: 'DOMICILIO', label: 'A domicilio', icon: <Home />, disabled: domicilioDeshabilitado }
        ]}
        className="[&>button]:min-h-12"
      />
      {domicilioDeshabilitado && <p className="text-xs text-fg-muted">Este profesional no atiende a domicilio.</p>}
    </div>
  );

  // Pasos que realmente ve el paciente (el 3 y el 5 son condicionales), para mostrar "Paso X de Y"
  const pasosVisibles: Paso[] = [1, 2, ...(servicios.length > 0 ? [3 as Paso] : []), 4, ...(tipoVisita === 'DOMICILIO' ? [5 as Paso] : []), 6];
  const indicePaso = pasosVisibles.indexOf(paso);
  const NOMBRE_PASO: Record<Paso, string> = {
    1: 'Clínica', 2: 'Profesional', 3: 'Servicio', 4: 'Fecha y hora', 5: 'Dirección', 6: 'Sus datos', 7: 'Listo'
  };

  const fechaLegible = (f: string) => {
    const [y, m, d] = f.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' });
  };

  // Próximos 14 días como chips táctiles (el selector de fecha nativo cubre el resto)
  const diasRapidos = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return {
      iso: aFechaLocal(d),
      semana: d.toLocaleDateString('es-CR', { weekday: 'short' }).replace('.', ''),
      dia: d.getDate(),
      mes: d.toLocaleDateString('es-CR', { month: 'short' }).replace('.', '')
    };
  });

  const backBtn = 'min-h-11 -ml-2 px-2 rounded-lg text-sm text-fg-muted hover:text-fg hover:bg-surface-muted inline-flex items-center gap-1.5 transition-colors';
  const optionBtn = 'w-full flex items-center gap-3 p-4 rounded-card border-2 transition-colors text-left bg-surface';
  const optionIdle = 'border-border hover:border-brand/50 hover:bg-surface-muted';
  const optionActive = 'border-brand bg-brand-soft';

  const nuevaReserva = () => {
    setCitaCreada(null);
    setHoraSeleccionada('');
    setServicioId(null);
    setProfesionalId(null);
    setTipoVisita('CONSULTORIO');
    setFecha(fechaLocalHoy());
    irAPaso(clinicaId ? 2 : 1);
  };

  const tituloPaso = (icono: React.ReactNode, texto: string, ayuda?: string) => (
    <div className="flex items-start gap-3">
      <span className="w-10 h-10 shrink-0 rounded-control bg-brand-soft text-brand-ink flex items-center justify-center" aria-hidden="true">{icono}</span>
      <div className="min-w-0">
        <h2 id="paso-titulo" className="text-heading font-semibold tracking-tight text-fg">{texto}</h2>
        {ayuda && <p className="text-body text-fg-muted">{ayuda}</p>}
      </div>
    </div>
  );

  const totalConIva = servicio ? formatearColones(servicio.precioConIva ?? servicio.precio) : null;
  const mostrarResumen = !!clinica && paso >= 2 && paso <= 6;

  // Contenido del resumen: columna lateral en escritorio y hoja inferior en móvil
  const resumenContenido = (
    <dl className="space-y-3 text-sm">
      {clinica && (
        <div className="flex items-center gap-3">
          <img src={clinica.logoUrl} alt="" width={36} height={36} className="w-9 h-9 rounded-control object-cover border border-border shrink-0" referrerPolicy="no-referrer" />
          <div className="min-w-0">
            <dt className="sr-only">Clínica</dt>
            <dd className="font-semibold text-fg truncate">{clinica.nombreComercial}</dd>
          </div>
        </div>
      )}
      {profesional && (
        <div className="flex items-center gap-3">
          <Avatar name={profesional.nombre} size="sm" />
          <div className="min-w-0">
            <dt className="text-xs text-fg-subtle">Profesional</dt>
            <dd className="font-semibold text-fg">{profesional.nombre}</dd>
          </div>
        </div>
      )}
      {servicio && (
        <div>
          <dt className="text-xs text-fg-subtle">Servicio</dt>
          <dd className="font-semibold text-fg">{servicio.nombre}</dd>
          <dd className="text-xs text-fg-muted">{servicio.duracionMinutos} min</dd>
        </div>
      )}
      {paso >= 4 && (
        <div>
          <dt className="text-xs text-fg-subtle">Tipo de visita</dt>
          <dd className="font-semibold text-fg">{tipoVisita === 'DOMICILIO' ? 'A domicilio' : 'En consultorio'}</dd>
        </div>
      )}
      {horaSeleccionada && (
        <div>
          <dt className="text-xs text-fg-subtle">Fecha y hora</dt>
          <dd className="font-semibold text-fg first-letter:uppercase">{fechaLegible(fecha)}, {horaSeleccionada}</dd>
        </div>
      )}
      {tipoVisita === 'DOMICILIO' && direccionDomicilio && paso >= 6 && (
        <div>
          <dt className="text-xs text-fg-subtle">Dirección</dt>
          <dd className="font-semibold text-fg">{direccionDomicilio}</dd>
        </div>
      )}
      {totalConIva && (
        <div className="pt-3 border-t border-border flex items-end justify-between gap-2">
          <div>
            <dt className="text-xs text-fg-subtle">Total</dt>
            <dd className="text-xs text-fg-muted">IVA incluido</dd>
          </div>
          <dd className="text-heading font-semibold text-fg tabular-nums">{totalConIva}</dd>
        </div>
      )}
    </dl>
  );

  return (
    // pt-safe/px-safe: en la PWA de iOS el contenido no queda bajo el notch ni la isla dinámica
    <div className="min-h-screen bg-bg font-sans text-fg pt-safe" style={{ '--brand': colorPrimario } as React.CSSProperties}>
      <div className="w-full max-w-5xl mx-auto px-safe py-6 sm:py-10">
        <header className="flex items-center gap-3 mb-6 sm:mb-8">
          {clinica ? (
            <img src={clinica.logoUrl} alt="" width={48} height={48} className="w-12 h-12 rounded-card object-cover border border-border bg-surface" referrerPolicy="no-referrer" />
          ) : (
            <img src="/logo-tuanis-192.webp" alt="" width={48} height={48} className="w-12 h-12" />
          )}
          <div className="min-w-0">
            <h1 className="text-heading font-semibold tracking-tight text-fg truncate">{clinica ? clinica.nombreComercial : 'Agendar cita'}</h1>
            <p className="text-body text-fg-muted">{clinica ? 'Reserve su cita en línea' : 'TuanisBooking · Reserva en línea'}</p>
          </div>
        </header>

        {/* Indicador de pasos */}
        {paso !== 7 && indicePaso >= 0 && (
          <nav aria-label="Progreso de la reserva" className="mb-6">
            <p className="sr-only">Paso {indicePaso + 1} de {pasosVisibles.length}: {NOMBRE_PASO[paso]}</p>
            <ol className="flex items-center gap-2">
              {pasosVisibles.map((p, i) => {
                const hecho = i < indicePaso;
                const actual = i === indicePaso;
                return (
                  <li key={p} className={cx('flex items-center gap-2', i < pasosVisibles.length - 1 && 'flex-1')} aria-current={actual ? 'step' : undefined}>
                    <span
                      className={cx(
                        'w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold transition-colors',
                        hecho && 'bg-brand-solid text-brand-fg',
                        actual && 'bg-brand-soft text-brand-ink ring-2 ring-brand',
                        !hecho && !actual && 'bg-surface-muted text-fg-subtle'
                      )}
                    >
                      {hecho ? <Check className="w-4 h-4" aria-hidden="true" /> : i + 1}
                    </span>
                    <span className={cx('text-xs font-semibold whitespace-nowrap', actual ? 'text-fg' : 'hidden sm:inline text-fg-subtle')}>
                      {NOMBRE_PASO[p]}
                    </span>
                    {i < pasosVisibles.length - 1 && <span className={cx('h-0.5 flex-1 rounded-full', hecho ? 'bg-brand-solid' : 'bg-border')} aria-hidden="true" />}
                  </li>
                );
              })}
            </ol>
          </nav>
        )}

        {error && (
          <div role="alert" className="mb-4 p-3 rounded-control bg-danger-soft border border-danger/20 text-danger text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <div className={cx(mostrarResumen && 'lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-8 lg:items-start')}>
          <main className={cx('min-w-0 bg-surface rounded-panel border border-border shadow-md p-4 min-[400px]:p-5 sm:p-8', !mostrarResumen && 'max-w-xl mx-auto', mostrarResumen && 'pb-6')}>
            {paso === 1 && (
              <section className="space-y-4" aria-labelledby="paso-titulo">
                {tituloPaso(<Building className="w-5 h-5" />, 'Escoja su clínica', 'Seleccione dónde desea ser atendido.')}
                {cargandoClinicas ? (
                  <div className="space-y-3" role="status" aria-label="Cargando clínicas">
                    {[0, 1, 2].map(i => <div key={i} className="h-[4.5rem] rounded-card bg-surface-muted animate-pulse" />)}
                  </div>
                ) : clinicas.length === 0 ? (
                  <p className="text-fg-muted text-sm text-center py-6">No hay clínicas disponibles para reservar en este momento.</p>
                ) : (
                  clinicas.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { setClinicaId(c.id); irAPaso(2); }}
                      className={cx(optionBtn, optionIdle)}
                    >
                      <img src={c.logoUrl} alt="" width={44} height={44} className="w-11 h-11 rounded-control object-cover border border-border shrink-0" referrerPolicy="no-referrer" />
                      <span className="min-w-0 flex-1">
                        <span className="font-semibold text-sm text-fg block truncate">{c.nombreComercial}</span>
                        <span className="text-xs text-fg-muted">{c.perfilCompania}</span>
                      </span>
                      <ArrowRight className="w-4 h-4 text-fg-subtle shrink-0" aria-hidden="true" />
                    </button>
                  ))
                )}
              </section>
            )}

            {paso === 2 && (
              <section className="space-y-4" aria-labelledby="paso-titulo">
                <button type="button" onClick={() => irAPaso(1)} className={backBtn}><ArrowLeft className="w-4 h-4" aria-hidden="true" /> Cambiar clínica</button>
                {tituloPaso(<UserIcon className="w-5 h-5" />, 'Escoja su profesional', 'Quién lo atenderá en su cita.')}
                <div className="grid gap-3 sm:grid-cols-2">
                  {profesionales.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => { setProfesionalId(p.id); irAPaso(servicios.length > 0 ? 3 : 4); }}
                      aria-pressed={profesionalId === p.id}
                      className={cx(optionBtn, 'flex-col items-start sm:min-h-32', profesionalId === p.id ? optionActive : optionIdle)}
                    >
                      <Avatar name={p.nombre} size="lg" />
                      <span className="min-w-0">
                        <span className="font-semibold text-sm text-fg block">{p.nombre}</span>
                        <span className="text-xs text-fg-muted">{p.rol}</span>
                      </span>
                      {p.aceptaDomicilio && <Badge tone="success"><Home className="w-3 h-3" aria-hidden="true" /> Acepta domicilio</Badge>}
                    </button>
                  ))}
                </div>
                {profesionales.length === 0 && <p className="text-fg-muted text-sm text-center py-4">Este centro no tiene profesionales disponibles.</p>}
              </section>
            )}

            {paso === 3 && (
              <section className="space-y-4" aria-labelledby="paso-titulo">
                <button type="button" onClick={() => irAPaso(2)} className={backBtn}><ArrowLeft className="w-4 h-4" aria-hidden="true" /> Cambiar profesional</button>
                {tituloPaso(<ListChecks className="w-5 h-5" />, 'Escoja un servicio', 'Los precios incluyen IVA.')}
                {selectorTipoVisita}
                {serviciosVisibles.length === 0 && (
                  <p className="text-fg-muted text-sm text-center py-4 bg-surface-muted rounded-card border border-dashed border-border-strong">
                    No hay servicios disponibles para este tipo de visita.
                  </p>
                )}
                {serviciosVisibles.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => { setServicioId(s.id); irAPaso(4); }}
                    aria-pressed={servicioId === s.id}
                    className={cx(optionBtn, 'justify-between', servicioId === s.id ? optionActive : optionIdle)}
                  >
                    <span className="min-w-0">
                      <span className="font-semibold text-sm text-fg block">{s.nombre}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
                        <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" aria-hidden="true" />{s.duracionMinutos} min</span>
                        <span className="inline-flex items-center gap-1">
                          {s.modalidad === 'DOMICILIO' ? <Home className="w-3.5 h-3.5" aria-hidden="true" /> : <Building2 className="w-3.5 h-3.5" aria-hidden="true" />}
                          {s.modalidad === 'DOMICILIO' ? 'A domicilio' : s.modalidad === 'AMBOS' ? 'Consultorio o domicilio' : 'En consultorio'}
                        </span>
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="text-heading font-semibold text-brand-ink tabular-nums block">{formatearColones(s.precioConIva ?? s.precio)}</span>
                      <span className="text-xs text-fg-muted block">IVA incluido</span>
                    </span>
                  </button>
                ))}
              </section>
            )}

            {paso === 4 && (
              <section className="space-y-6" aria-labelledby="paso-titulo">
                <button type="button" onClick={() => irAPaso(servicios.length > 0 ? 3 : 2)} className={backBtn}><ArrowLeft className="w-4 h-4" aria-hidden="true" /> {servicios.length > 0 ? 'Cambiar servicio' : 'Cambiar profesional'}</button>
                {tituloPaso(<Calendar className="w-5 h-5" />, 'Tipo de visita y horario', 'Elija cómo y cuándo quiere su cita.')}

                {selectorTipoVisita}

                {servicios.length > 0 && !servicioId && (
                  <p className="text-sm text-warning bg-warning-soft border border-warning/25 rounded-control p-3">
                    No hay un servicio elegido.{' '}
                    <button type="button" onClick={() => irAPaso(3)} className="font-semibold underline min-h-10">Elegir servicio</button>
                  </p>
                )}

                {!reservaAutomatica ? (
                  <div className="rounded-card border border-success/25 bg-success-soft p-5 space-y-3 text-center" role="region" aria-labelledby="whatsapp-titulo">
                    <h3 id="whatsapp-titulo" className="text-sm font-semibold text-success flex items-center justify-center gap-1.5">
                      <MessageCircle className="w-4 h-4" aria-hidden="true" /> Solicite su espacio por WhatsApp
                    </h3>
                    {enlaceSolicitud ? (
                      <>
                        <p className="text-sm text-fg-muted">
                          Para este tipo de cita la clínica coordina el horario por mensaje. Escríbanos y le confirmaremos un espacio.
                        </p>
                        <a
                          href={enlaceSolicitud}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full min-h-12 bg-success hover:brightness-110 text-white font-semibold text-sm rounded-control inline-flex items-center justify-center gap-2 transition-[filter] shadow-xs"
                        >
                          <MessageCircle className="w-4 h-4" aria-hidden="true" /> Solicitar por WhatsApp
                        </a>
                      </>
                    ) : (
                      <p className="text-sm text-fg-muted">Comuníquese con la clínica para agendar</p>
                    )}
                  </div>
                ) : (
                  <>
                    <fieldset>
                      <legend className="block text-sm font-semibold text-fg mb-2">Fecha</legend>
                      <div className="-mx-1 px-1 flex gap-2 overflow-x-auto overscroll-x-contain snap-x snap-mandatory scroll-px-1 pb-2 scrollbar-thin">
                        {diasRapidos.map(d => {
                          const activo = fecha === d.iso;
                          return (
                            <button
                              key={d.iso}
                              type="button"
                              onClick={() => setFecha(d.iso)}
                              aria-pressed={activo}
                              aria-label={fechaLegible(d.iso)}
                              className={cx(
                                'snap-start shrink-0 w-16 min-h-20 rounded-card border-2 flex flex-col items-center justify-center transition-colors',
                                activo ? 'border-brand-solid bg-brand-solid text-brand-fg shadow-sm' : 'border-border bg-surface text-fg hover:border-brand/50 hover:bg-surface-muted'
                              )}
                            >
                              <span className={cx('text-xs font-medium capitalize', activo ? 'text-brand-fg' : 'text-fg-muted')}>{d.semana}</span>
                              <span className="text-heading font-semibold tabular-nums leading-tight">{d.dia}</span>
                              <span className={cx('text-xs capitalize', activo ? 'text-brand-fg' : 'text-fg-subtle')}>{d.mes}</span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="mt-3 w-full sm:max-w-xs">
                        <Field label="Otra fecha">
                          <Input type="date" value={fecha} onChange={(e: any) => setFecha(e.target.value)} min={fechaLocalHoy()} className="px-2.5!" />
                        </Field>
                      </div>
                    </fieldset>

                    <fieldset>
                      <legend className="block text-sm font-semibold text-fg mb-2">Horarios disponibles</legend>
                      {cargandoHorarios ? (
                        <div className="flex items-center gap-2 text-sm text-fg-muted py-3" role="status"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Buscando horarios…</div>
                      ) : (
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                          {horariosDisponibles.map(h => (
                            <button
                              key={h}
                              type="button"
                              onClick={() => setHoraSeleccionada(h)}
                              aria-pressed={horaSeleccionada === h}
                              className={cx(
                                'min-h-12 rounded-control border-2 text-sm font-semibold tabular-nums transition-colors',
                                horaSeleccionada === h ? 'border-brand-solid bg-brand-solid text-brand-fg shadow-sm' : 'border-border bg-surface text-fg hover:border-brand/50 hover:bg-brand-soft'
                              )}
                            >
                              {h}
                            </button>
                          ))}
                          {horariosDisponibles.length === 0 && (
                            <p className="col-span-3 sm:col-span-4 text-fg-muted text-sm text-center py-5 bg-surface-muted rounded-card border border-dashed border-border-strong">
                              No hay horarios libres ese día. Pruebe con otra fecha.
                            </p>
                          )}
                        </div>
                      )}
                    </fieldset>

                    <Button
                      size="lg"
                      fullWidth
                      disabled={!horaSeleccionada}
                      onClick={() => irAPaso(tipoVisita === 'DOMICILIO' ? 5 : 6)}
                    >
                      Continuar <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </Button>
                  </>
                )}
              </section>
            )}

            {paso === 5 && (
              <section className="space-y-5" aria-labelledby="paso-titulo">
                <button type="button" onClick={() => irAPaso(4)} className={backBtn}><ArrowLeft className="w-4 h-4" aria-hidden="true" /> Cambiar horario</button>
                {tituloPaso(<MapPin className="w-5 h-5" />, 'Su dirección', 'Donde lo visitaremos.')}
                <div>
                  {/* El id fijo lo usa el autocompletado de Google Maps, por eso no se envuelve en Field */}
                  <label htmlFor="direccion-domicilio-input" className="block text-xs font-semibold text-fg mb-1.5">Dirección exacta</label>
                  <Input
                    id="direccion-domicilio-input"
                    type="text"
                    autoComplete="street-address"
                    value={direccionDomicilio}
                    onChange={(e: any) => setDireccionDomicilio(e.target.value)}
                    placeholder="Escriba y elija una sugerencia de la lista"
                    aria-describedby="direccion-ayuda"
                    leadingIcon={<MapPin />}
                  />
                  <p id="direccion-ayuda" className="text-xs text-fg-muted mt-1.5">
                    Elija una sugerencia al escribir o use su ubicación actual: se necesita la ubicación exacta para calcular el tiempo de traslado.
                  </p>
                </div>
                <Button variant="outline" onClick={usarUbicacionActual} icon={<Navigation className="w-4 h-4" aria-hidden="true" />} className="w-full sm:w-auto">
                  Usar mi ubicación actual
                </Button>
                {pacienteLat != null && pacienteLng != null && (
                  <p className="text-sm text-success font-medium flex items-center gap-1.5" role="status"><Check className="w-4 h-4" aria-hidden="true" /> Ubicación registrada</p>
                )}
                <Button
                  size="lg"
                  fullWidth
                  disabled={pacienteLat == null || pacienteLng == null}
                  onClick={() => irAPaso(6)}
                >
                  Continuar <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </Button>
              </section>
            )}

            {paso === 6 && (
              <form className="space-y-5" aria-labelledby="paso-titulo" onSubmit={(e) => { e.preventDefault(); confirmarCita(); }}>
                <button type="button" onClick={() => irAPaso(tipoVisita === 'DOMICILIO' ? 5 : 4)} className={backBtn}><ArrowLeft className="w-4 h-4" aria-hidden="true" /> Volver</button>
                {tituloPaso(<UserIcon className="w-5 h-5" />, 'Sus datos', 'Casi listo: revise su reserva y complete sus datos.')}

                <Field
                  label="Cédula"
                  required
                  hint={
                    <span aria-live="polite" className={pacienteEncontrado ? 'text-success font-medium' : undefined}>
                      {pacienteEncontrado
                        ? `Ya está registrado(a) como ${nombrePacienteExistente}. Usaremos los datos de contacto que tenemos registrados.`
                        : 'Si ya es paciente, lo reconoceremos con su cédula.'}
                    </span>
                  }
                >
                  <Input
                    type="text"
                    inputMode="numeric"
                    required
                    value={cedula}
                    onChange={(e: any) => { setCedula(e.target.value); setPacienteEncontrado(false); setNombrePacienteExistente(''); }}
                    onBlur={buscarPacientePorCedula}
                  />
                </Field>
                {!pacienteEncontrado && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Nombre completo" required className="sm:col-span-2">
                      <Input type="text" required autoComplete="name" value={nombreCompleto} onChange={(e: any) => setNombreCompleto(e.target.value)} />
                    </Field>
                    <Field label="Teléfono" required>
                      <Input type="tel" required inputMode="tel" autoComplete="tel" value={telefono} onChange={(e: any) => setTelefono(e.target.value)} placeholder="8888-8888" />
                    </Field>
                    <Field label="Fecha de nacimiento">
                      <Input type="date" autoComplete="bday" max={fechaLocalHoy()} value={fechaNacimiento} onChange={(e: any) => setFechaNacimiento(e.target.value)} className="px-2.5!" />
                    </Field>
                    <Field label="Correo electrónico" required className="sm:col-span-2">
                      <Input type="email" required autoComplete="email" value={correoElectronico} onChange={(e: any) => setCorreoElectronico(e.target.value)} placeholder="nombre@correo.com" />
                    </Field>
                  </div>
                )}
                <Button
                  type="submit"
                  size="lg"
                  fullWidth
                  loading={submitting}
                  icon={submitting ? undefined : <Check className="w-4 h-4" aria-hidden="true" />}
                >
                  {submitting ? 'Agendando…' : 'Confirmar cita'}
                </Button>
              </form>
            )}

            {paso === 7 && citaCreada && (
              <section className="text-center py-4 space-y-5 animate-dialog-in" role="status">
                <div className="relative inline-flex items-center justify-center">
                  <span className="absolute w-28 h-28 rounded-full bg-brand-soft" aria-hidden="true" />
                  <span className="absolute w-20 h-20 rounded-full bg-brand/15" aria-hidden="true" />
                  <span className="relative w-16 h-16 rounded-full bg-brand-solid text-brand-fg flex items-center justify-center shadow-lg">
                    <Check className="w-8 h-8" aria-hidden="true" />
                  </span>
                </div>
                <div className="pt-6">
                  <h2 className="text-title font-semibold tracking-tight text-fg flex items-center justify-center gap-2">
                    {citaCreada.estadoCita === 'PROGRAMADA' ? '¡Solicitud recibida!' : '¡Cita confirmada!'}
                    <PartyPopper className="w-6 h-6 text-brand-ink" aria-hidden="true" />
                  </h2>
                  <p className="mt-1 text-body text-fg-muted">
                    {citaCreada.estadoCita === 'PROGRAMADA' ? 'Estamos revisando su solicitud.' : 'Lo esperamos. Le enviaremos los detalles por correo.'}
                  </p>
                </div>
                <div className="text-left rounded-card border border-border bg-surface-muted p-4 sm:p-5 max-w-sm mx-auto">
                  <p className="text-sm text-fg leading-relaxed">
                    <span className="first-letter:uppercase inline-block font-semibold">{fechaLegible(fecha)}</span> a las <strong>{horaSeleccionada}</strong> con {profesional?.nombre} en {clinica?.nombreComercial}.
                    {tipoVisita === 'DOMICILIO' && citaCreada.tiempoTrasladoMinutos != null && (
                      <> Tiempo de traslado estimado: {citaCreada.tiempoTrasladoMinutos} min.</>
                    )}
                  </p>
                </div>
                {citaCreada.estadoCita === 'PROGRAMADA' && (
                  <p className="text-sm text-warning bg-warning-soft border border-warning/25 rounded-control p-3 max-w-sm mx-auto">
                    Su cita queda pendiente hasta que el negocio la confirme. Le avisaremos por correo.
                  </p>
                )}
                <Button variant="outline" onClick={nuevaReserva} className="w-full sm:w-auto">
                  Agendar otra cita
                </Button>
              </section>
            )}
          </main>

          {/* Resumen lateral (escritorio) */}
          {mostrarResumen && (
            <aside aria-label="Resumen de la reserva" className="hidden lg:block sticky top-6">
              <div className="bg-surface rounded-panel border border-border shadow-sm p-5">
                <h2 className="text-sm font-semibold text-fg flex items-center gap-2 mb-4">
                  <ReceiptText className="w-4 h-4 text-brand-ink" aria-hidden="true" /> Resumen de su reserva
                </h2>
                {resumenContenido}
              </div>
            </aside>
          )}
        </div>
      </div>

      {/* Hoja inferior con el resumen (móvil) */}
      {mostrarResumen && (
        <div className="lg:hidden fixed inset-x-0 bottom-0 z-30" onKeyDown={(e) => { if (e.key === 'Escape') setResumenAbierto(false); }}>
          {resumenAbierto && (
            <button
              type="button"
              aria-label="Cerrar resumen"
              onClick={() => setResumenAbierto(false)}
              className="fixed inset-0 -z-10 bg-fg/30 animate-fade-in cursor-default"
            />
          )}
          {/* pb-safe: la barra queda sobre el indicador de inicio del iPhone */}
          <div className="bg-surface border-t border-border rounded-t-panel shadow-lg pb-safe">
            {resumenAbierto && (
              <div id="resumen-movil" className="px-5 pt-5 pb-2 max-h-[60vh] overflow-y-auto animate-slide-down">
                {resumenContenido}
              </div>
            )}
            <button
              type="button"
              onClick={() => setResumenAbierto(v => !v)}
              aria-expanded={resumenAbierto}
              aria-controls="resumen-movil"
              className="w-full min-h-14 px-5 flex items-center justify-between gap-3 text-left"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-fg">
                <ReceiptText className="w-4 h-4 text-brand-ink" aria-hidden="true" /> Resumen de su reserva
              </span>
              <span className="flex items-center gap-2 text-sm font-semibold text-fg tabular-nums">
                {totalConIva}
                <ChevronUp className={cx('w-4 h-4 text-fg-subtle transition-transform', resumenAbierto && 'rotate-180')} aria-hidden="true" />
              </span>
            </button>
          </div>
        </div>
      )}
      {mostrarResumen && <div className="lg:hidden h-[calc(4rem+env(safe-area-inset-bottom,0px))]" aria-hidden="true" />}
    </div>
  );
}
