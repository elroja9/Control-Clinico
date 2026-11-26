import React, { useEffect, useState } from 'react';
import { Building, User as UserIcon, Calendar, MapPin, Check, ArrowLeft, ArrowRight, Loader2, AlertCircle, ListChecks, Clock, Navigation } from 'lucide-react';
import { loadGoogleMapsScript } from '../utils/loadGoogleMaps';
import { formatearColones } from '../utils/precios';

interface ClinicaPublica {
  id: number;
  nombreComercial: string;
  perfilCompania: string;
  logoUrl: string;
  colorPrimario: string;
  colorSidebar: string;
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
}

// Pasos 1=clínica, 2=profesional, 3=servicio (se salta si la empresa no tiene
// catálogo de servicios activos), 4=tipo de visita + horario, 5=dirección de
// domicilio (solo si aplica), 6=datos del paciente, 7=confirmación.
type Paso = 1 | 2 | 3 | 4 | 5 | 6 | 7;

// Fecha local YYYY-MM-DD: toISOString() usa UTC y de noche en Costa Rica ya marcaba el día siguiente
const fechaLocalHoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function PublicBooking() {
  const [paso, setPaso] = useState<Paso>(1);
  const [error, setError] = useState('');
  const [cargandoClinicas, setCargandoClinicas] = useState(true);

  // Cambiar de paso limpia el error del paso anterior y vuelve arriba (en móvil el
  // botón "Continuar" suele quedar al fondo de la pantalla)
  const irAPaso = (p: Paso) => {
    setError('');
    setPaso(p);
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
    setCargandoHorarios(true);
    setHoraSeleccionada('');
    const servicioParam = servicioId ? `&idServicio=${servicioId}` : '';
    fetch(`/api/public/disponibilidad?idUsuario=${profesionalId}&fecha=${fecha}&tipoVisita=${tipoVisita}${servicioParam}`)
      .then(res => res.json())
      .then(data => setHorariosDisponibles(data))
      .catch(() => setError('No se pudieron cargar los horarios disponibles.'))
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
        setNombreCompleto(data.nombreCompleto);
        setTelefono(data.telefono);
        setCorreoElectronico(data.correoElectronico);
        setTipoIdentificacion(data.tipoIdentificacion);
        setFechaNacimiento(data.fechaNacimiento);
        setPacienteEncontrado(true);
      })
      .catch(() => setPacienteEncontrado(false));
  };

  const confirmarCita = () => {
    setError('');
    if (!nombreCompleto.trim() || !telefono.trim() || !correoElectronico.trim() || !cedula.trim()) {
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
        paciente: { identificacion: cedula, tipoIdentificacion, nombreCompleto, telefono, correoElectronico, fechaNacimiento }
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

  const inputClass = 'w-full min-h-11 bg-slate-50 border border-slate-300 rounded-xl px-3 text-sm text-slate-900 placeholder:text-slate-500 focus:bg-white transition-colors';
  const labelClass = 'block text-slate-700 text-sm font-semibold mb-1.5';
  const backBtn = 'min-h-10 -ml-2 px-2 rounded-lg text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 inline-flex items-center gap-1.5 transition-colors';
  const optionBtn = 'w-full min-h-14 flex items-center gap-3 p-3 rounded-xl border-2 transition-colors text-left';
  const primaryBtn = 'w-full min-h-12 text-white font-bold text-sm rounded-xl disabled:opacity-40 flex items-center justify-center gap-2 hover:brightness-110 transition-[filter,opacity] shadow-sm';

  const nuevaReserva = () => {
    setCitaCreada(null);
    setHoraSeleccionada('');
    setServicioId(null);
    setProfesionalId(null);
    setTipoVisita('CONSULTORIO');
    setFecha(fechaLocalHoy());
    irAPaso(clinicaId ? 2 : 1);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-start sm:items-center justify-center px-4 py-6 sm:py-10 font-sans">
      <main className="w-full max-w-xl bg-white rounded-3xl border border-slate-200 shadow-xl p-5 sm:p-8">
        <header className="text-center mb-6">
          {clinica ? (
            <img src={clinica.logoUrl} alt="" width={56} height={56} className="w-14 h-14 mx-auto mb-2 rounded-2xl object-cover border border-slate-200" referrerPolicy="no-referrer" />
          ) : (
            <img src="/logo-tuanis-192.webp" alt="" width={56} height={56} className="w-14 h-14 mx-auto mb-2" />
          )}
          <h1 className="text-xl font-extrabold text-slate-900">{clinica ? clinica.nombreComercial : 'Agendar cita'}</h1>
          <p className="text-sm text-slate-600 mt-1">{clinica ? 'Reserve su cita en línea' : 'TuanisBooking · Reserva en línea'}</p>
        </header>

        {/* Progreso */}
        {paso !== 7 && indicePaso >= 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-600 mb-2">
              <span>Paso {indicePaso + 1} de {pasosVisibles.length}</span>
              <span>{NOMBRE_PASO[paso]}</span>
            </div>
            <div
              className="h-1.5 rounded-full bg-slate-100 overflow-hidden"
              role="progressbar"
              aria-label="Progreso de la reserva"
              aria-valuemin={1}
              aria-valuemax={pasosVisibles.length}
              aria-valuenow={indicePaso + 1}
            >
              <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${((indicePaso + 1) / pasosVisibles.length) * 100}%`, backgroundColor: colorPrimario }} />
            </div>
          </div>
        )}

        {error && (
          <div role="alert" className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {paso === 1 && (
          <section className="space-y-3" aria-labelledby="paso-titulo">
            <h2 id="paso-titulo" className="text-sm font-bold text-slate-800 flex items-center gap-1.5"><Building className="w-4 h-4" aria-hidden="true" /> Escoja su clínica</h2>
            {cargandoClinicas ? (
              <div className="space-y-2" aria-label="Cargando clínicas">
                {[0, 1, 2].map(i => <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />)}
              </div>
            ) : clinicas.length === 0 ? (
              <p className="text-slate-600 text-sm text-center py-6">No hay clínicas disponibles para reservar en este momento.</p>
            ) : (
              clinicas.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { setClinicaId(c.id); irAPaso(2); }}
                  className={`${optionBtn} border-slate-200 hover:border-slate-400 hover:bg-slate-50`}
                >
                  <img src={c.logoUrl} alt="" width={40} height={40} className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0" referrerPolicy="no-referrer" />
                  <span className="min-w-0 flex-1">
                    <span className="font-bold text-sm text-slate-900 block truncate">{c.nombreComercial}</span>
                    <span className="text-xs text-slate-600">{c.perfilCompania}</span>
                  </span>
                  <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
                </button>
              ))
            )}
          </section>
        )}

        {paso === 2 && (
          <section className="space-y-3" aria-labelledby="paso-titulo">
            <button type="button" onClick={() => irAPaso(1)} className={backBtn}><ArrowLeft className="w-4 h-4" aria-hidden="true" /> Cambiar clínica</button>
            <h2 id="paso-titulo" className="text-sm font-bold text-slate-800 flex items-center gap-1.5"><UserIcon className="w-4 h-4" aria-hidden="true" /> Escoja su profesional</h2>
            {profesionales.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => { setProfesionalId(p.id); irAPaso(servicios.length > 0 ? 3 : 4); }}
                className={`${optionBtn} justify-between ${profesionalId === p.id ? 'border-slate-800 bg-slate-50' : 'border-slate-200 hover:border-slate-400 hover:bg-slate-50'}`}
              >
                <span className="min-w-0">
                  <span className="font-bold text-sm text-slate-900 block">{p.nombre}</span>
                  <span className="text-xs text-slate-600">{p.rol}</span>
                </span>
                {p.aceptaDomicilio && <span className="text-[11px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold shrink-0">Acepta domicilio</span>}
              </button>
            ))}
            {profesionales.length === 0 && <p className="text-slate-600 text-sm text-center py-4">Este centro no tiene profesionales disponibles.</p>}
          </section>
        )}

        {paso === 3 && (
          <section className="space-y-3" aria-labelledby="paso-titulo">
            <button type="button" onClick={() => irAPaso(2)} className={backBtn}><ArrowLeft className="w-4 h-4" aria-hidden="true" /> Cambiar profesional</button>
            <h2 id="paso-titulo" className="text-sm font-bold text-slate-800 flex items-center gap-1.5"><ListChecks className="w-4 h-4" aria-hidden="true" /> Escoja un servicio</h2>
            {servicios.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => { setServicioId(s.id); irAPaso(4); }}
                aria-pressed={servicioId === s.id}
                className={`${optionBtn} justify-between ${servicioId === s.id ? 'border-slate-800 bg-slate-50' : 'border-slate-200 hover:border-slate-400 hover:bg-slate-50'}`}
              >
                <span className="min-w-0">
                  <span className="font-bold text-sm text-slate-900 block">{s.nombre}</span>
                  <span className="text-xs text-slate-600 flex items-center gap-1"><Clock className="w-3 h-3" aria-hidden="true" />{s.duracionMinutos} min</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="text-sm font-bold text-slate-800 tabular-nums block">{formatearColones(s.precioConIva ?? s.precio)}</span>
                  <span className="text-xs text-slate-600 block">IVA incluido</span>
                </span>
              </button>
            ))}
          </section>
        )}

        {paso === 4 && (
          <section className="space-y-5" aria-labelledby="paso-titulo">
            <button type="button" onClick={() => irAPaso(servicios.length > 0 ? 3 : 2)} className={backBtn}><ArrowLeft className="w-4 h-4" aria-hidden="true" /> {servicios.length > 0 ? 'Cambiar servicio' : 'Cambiar profesional'}</button>
            <h2 id="paso-titulo" className="text-sm font-bold text-slate-800 flex items-center gap-1.5"><Calendar className="w-4 h-4" aria-hidden="true" /> Tipo de visita y horario</h2>

            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Tipo de visita">
              <button
                type="button"
                onClick={() => setTipoVisita('CONSULTORIO')}
                aria-pressed={tipoVisita === 'CONSULTORIO'}
                className={`min-h-12 p-3 rounded-xl border-2 text-sm font-bold transition-colors ${tipoVisita === 'CONSULTORIO' ? 'border-slate-800 bg-slate-50 text-slate-900' : 'border-slate-200 text-slate-700 hover:border-slate-400'}`}
              >
                En consultorio
              </button>
              <button
                type="button"
                onClick={() => setTipoVisita('DOMICILIO')}
                disabled={!profesional?.aceptaDomicilio}
                aria-pressed={tipoVisita === 'DOMICILIO'}
                title={!profesional?.aceptaDomicilio ? 'Este profesional no atiende a domicilio' : undefined}
                className={`min-h-12 p-3 rounded-xl border-2 text-sm font-bold transition-colors disabled:opacity-40 ${tipoVisita === 'DOMICILIO' ? 'border-slate-800 bg-slate-50 text-slate-900' : 'border-slate-200 text-slate-700 hover:border-slate-400'}`}
              >
                A domicilio
              </button>
            </div>

            <div>
              <label htmlFor="reserva-fecha" className={labelClass}>Fecha</label>
              <input
                id="reserva-fecha"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                min={fechaLocalHoy()}
                className={inputClass}
              />
            </div>

            <fieldset>
              <legend className={labelClass}>Horarios disponibles</legend>
              {cargandoHorarios ? (
                <div className="flex items-center gap-2 text-sm text-slate-600 py-3" role="status"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Buscando horarios…</div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {horariosDisponibles.map(h => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setHoraSeleccionada(h)}
                      aria-pressed={horaSeleccionada === h}
                      className={`min-h-11 rounded-xl text-sm font-semibold tabular-nums transition-colors ${horaSeleccionada === h ? 'text-white shadow-sm' : 'bg-slate-100 text-slate-800 hover:bg-slate-200'}`}
                      style={horaSeleccionada === h ? { backgroundColor: colorPrimario } : {}}
                    >
                      {h}
                    </button>
                  ))}
                  {horariosDisponibles.length === 0 && (
                    <p className="col-span-3 sm:col-span-4 text-slate-600 text-sm text-center py-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      No hay horarios libres ese día. Pruebe con otra fecha.
                    </p>
                  )}
                </div>
              )}
            </fieldset>

            <button
              type="button"
              disabled={!horaSeleccionada}
              onClick={() => irAPaso(tipoVisita === 'DOMICILIO' ? 5 : 6)}
              className={primaryBtn}
              style={{ backgroundColor: colorPrimario }}
            >
              Continuar <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </section>
        )}

        {paso === 5 && (
          <section className="space-y-4" aria-labelledby="paso-titulo">
            <button type="button" onClick={() => irAPaso(4)} className={backBtn}><ArrowLeft className="w-4 h-4" aria-hidden="true" /> Cambiar horario</button>
            <h2 id="paso-titulo" className="text-sm font-bold text-slate-800 flex items-center gap-1.5"><MapPin className="w-4 h-4" aria-hidden="true" /> Su dirección</h2>
            <div>
              <label htmlFor="direccion-domicilio-input" className={labelClass}>Dirección exacta</label>
              <input
                id="direccion-domicilio-input"
                type="text"
                autoComplete="street-address"
                value={direccionDomicilio}
                onChange={(e) => setDireccionDomicilio(e.target.value)}
                placeholder="Escriba y elija una sugerencia de la lista"
                aria-describedby="direccion-ayuda"
                className={inputClass}
              />
              <p id="direccion-ayuda" className="text-xs text-slate-600 mt-1.5">
                Elija una sugerencia al escribir o use su ubicación actual: se necesita la ubicación exacta para calcular el tiempo de traslado.
              </p>
            </div>
            <button type="button" onClick={usarUbicacionActual} className="min-h-10 px-3 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800 hover:bg-slate-50 inline-flex items-center gap-1.5 transition-colors">
              <Navigation className="w-4 h-4" aria-hidden="true" /> Usar mi ubicación actual
            </button>
            {pacienteLat != null && pacienteLng != null && (
              <p className="text-sm text-emerald-700 font-medium flex items-center gap-1.5" role="status"><Check className="w-4 h-4" aria-hidden="true" /> Ubicación registrada</p>
            )}
            <button
              type="button"
              disabled={pacienteLat == null || pacienteLng == null}
              onClick={() => irAPaso(6)}
              className={primaryBtn}
              style={{ backgroundColor: colorPrimario }}
            >
              Continuar <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </section>
        )}

        {paso === 6 && (
          <form className="space-y-4" aria-labelledby="paso-titulo" onSubmit={(e) => { e.preventDefault(); confirmarCita(); }}>
            <button type="button" onClick={() => irAPaso(tipoVisita === 'DOMICILIO' ? 5 : 4)} className={backBtn}><ArrowLeft className="w-4 h-4" aria-hidden="true" /> Volver</button>
            <h2 id="paso-titulo" className="text-sm font-bold text-slate-800">Sus datos</h2>

            {/* Resumen de la reserva */}
            <dl className="rounded-2xl bg-slate-50 border border-slate-200 p-4 text-sm grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
              <dt className="text-slate-600">Profesional</dt><dd className="font-semibold text-slate-900">{profesional?.nombre}</dd>
              {servicio && (<><dt className="text-slate-600">Servicio</dt><dd className="font-semibold text-slate-900">{servicio.nombre}</dd></>)}
              <dt className="text-slate-600">Fecha</dt><dd className="font-semibold text-slate-900 first-letter:uppercase">{fechaLegible(fecha)}, {horaSeleccionada}</dd>
              <dt className="text-slate-600">Lugar</dt><dd className="font-semibold text-slate-900">{tipoVisita === 'DOMICILIO' ? direccionDomicilio || 'A domicilio' : 'En consultorio'}</dd>
            </dl>

            <div>
              <label htmlFor="reserva-cedula" className={labelClass}>Cédula *</label>
              <input
                id="reserva-cedula"
                type="text"
                inputMode="numeric"
                required
                value={cedula}
                onChange={(e) => setCedula(e.target.value)}
                onBlur={buscarPacientePorCedula}
                aria-describedby="reserva-cedula-ayuda"
                className={inputClass}
              />
              <p id="reserva-cedula-ayuda" className={`text-xs mt-1.5 ${pacienteEncontrado ? 'text-emerald-700 font-medium' : 'text-slate-600'}`} aria-live="polite">
                {pacienteEncontrado ? '¡Bienvenido(a) de nuevo! Verifique sus datos.' : 'Si ya es paciente, completaremos sus datos automáticamente.'}
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label htmlFor="reserva-nombre" className={labelClass}>Nombre completo *</label>
                <input id="reserva-nombre" type="text" required autoComplete="name" value={nombreCompleto} onChange={(e) => setNombreCompleto(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label htmlFor="reserva-telefono" className={labelClass}>Teléfono *</label>
                <input id="reserva-telefono" type="tel" required inputMode="tel" autoComplete="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="8888-8888" className={inputClass} />
              </div>
              <div>
                <label htmlFor="reserva-nacimiento" className={labelClass}>Fecha de nacimiento</label>
                <input id="reserva-nacimiento" type="date" autoComplete="bday" max={fechaLocalHoy()} value={fechaNacimiento} onChange={(e) => setFechaNacimiento(e.target.value)} className={inputClass} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="reserva-correo" className={labelClass}>Correo electrónico *</label>
                <input id="reserva-correo" type="email" required autoComplete="email" value={correoElectronico} onChange={(e) => setCorreoElectronico(e.target.value)} placeholder="nombre@correo.com" className={inputClass} />
              </div>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className={primaryBtn}
              style={{ backgroundColor: colorPrimario }}
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Check className="w-4 h-4" aria-hidden="true" />}
              {submitting ? 'Agendando…' : 'Confirmar cita'}
            </button>
          </form>
        )}

        {paso === 7 && citaCreada && (
          <section className="text-center py-4 space-y-4" role="status">
            <div className="inline-flex p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600">
              <Check className="w-8 h-8" aria-hidden="true" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">
              {citaCreada.estadoCita === 'PROGRAMADA' ? '¡Solicitud recibida!' : '¡Cita confirmada!'}
            </h2>
            <p className="text-sm text-slate-700 leading-relaxed">
              <span className="first-letter:uppercase inline-block">{fechaLegible(fecha)}</span> a las <strong>{horaSeleccionada}</strong> con {profesional?.nombre} en {clinica?.nombreComercial}.
              {tipoVisita === 'DOMICILIO' && citaCreada.tiempoTrasladoMinutos != null && (
                <> Tiempo de traslado estimado: {citaCreada.tiempoTrasladoMinutos} min.</>
              )}
            </p>
            {citaCreada.estadoCita === 'PROGRAMADA' && (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
                Su cita queda pendiente hasta que el negocio la confirme. Le avisaremos por correo.
              </p>
            )}
            <button type="button" onClick={nuevaReserva} className="min-h-11 px-4 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800 hover:bg-slate-50 transition-colors">
              Agendar otra cita
            </button>
          </section>
        )}
      </main>
    </div>
  );
}
