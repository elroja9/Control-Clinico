import React, { useEffect, useState } from 'react';
import { Building, User as UserIcon, Calendar, MapPin, Check, ArrowLeft, ArrowRight, Loader2, AlertCircle, ListChecks } from 'lucide-react';
import { loadGoogleMapsScript } from '../utils/loadGoogleMaps';

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
  duracionMinutos: number;
}

// Pasos 1=clínica, 2=profesional, 3=servicio (se salta si la empresa no tiene
// catálogo de servicios activos), 4=tipo de visita + horario, 5=dirección de
// domicilio (solo si aplica), 6=datos del paciente, 7=confirmación.
type Paso = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export default function PublicBooking() {
  const [paso, setPaso] = useState<Paso>(1);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [clinicas, setClinicas] = useState<ClinicaPublica[]>([]);
  const [clinicaId, setClinicaId] = useState<number | null>(null);

  const [profesionales, setProfesionales] = useState<ProfesionalPublico[]>([]);
  const [profesionalId, setProfesionalId] = useState<number | null>(null);

  const [servicios, setServicios] = useState<ServicioPublico[]>([]);
  const [servicioId, setServicioId] = useState<number | null>(null);

  const [tipoVisita, setTipoVisita] = useState<'CONSULTORIO' | 'DOMICILIO'>('CONSULTORIO');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
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
      .catch(() => setError('No se pudieron cargar las clínicas.'));
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
        setPaso(7);
      })
      .catch(err => setError(err.message))
      .finally(() => setSubmitting(false));
  };

  const colorPrimario = clinica?.colorPrimario || '#0d9488';

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-xl bg-white rounded-3xl border border-slate-200 shadow-xl p-6 sm:p-8">
        <div className="text-center mb-6">
          <h1 className="text-xl font-extrabold text-slate-900">Agendar Cita</h1>
          <p className="text-xs text-slate-500 mt-1">Control-Clínico &middot; Reserva en línea</p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {paso === 1 && (
          <div className="space-y-3">
            <h2 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5"><Building className="w-4 h-4" /> Escoja su clínica</h2>
            {clinicas.map(c => (
              <button
                key={c.id}
                onClick={() => { setClinicaId(c.id); setPaso(2); }}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-slate-400 transition-all text-left"
              >
                <img src={c.logoUrl} alt={c.nombreComercial} className="w-10 h-10 rounded-lg object-cover border border-slate-200" referrerPolicy="no-referrer" />
                <div>
                  <span className="font-bold text-sm text-slate-800 block">{c.nombreComercial}</span>
                  <span className="text-[10px] text-slate-500">{c.perfilCompania}</span>
                </div>
              </button>
            ))}
            {clinicas.length === 0 && <p className="text-slate-500 text-xs text-center py-4">Cargando clínicas...</p>}
          </div>
        )}

        {paso === 2 && (
          <div className="space-y-3">
            <button onClick={() => setPaso(1)} className="text-xs text-slate-500 flex items-center gap-1 mb-2"><ArrowLeft className="w-3.5 h-3.5" /> Cambiar clínica</button>
            <h2 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5"><UserIcon className="w-4 h-4" /> Escoja su profesional</h2>
            {profesionales.map(p => (
              <button
                key={p.id}
                onClick={() => { setProfesionalId(p.id); setPaso(servicios.length > 0 ? 3 : 4); }}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:border-slate-400 transition-all text-left"
              >
                <div>
                  <span className="font-bold text-sm text-slate-800 block">{p.nombre}</span>
                  <span className="text-[10px] text-slate-500">{p.rol}</span>
                </div>
                {p.aceptaDomicilio && <span className="text-[9px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">Acepta domicilio</span>}
              </button>
            ))}
            {profesionales.length === 0 && <p className="text-slate-500 text-xs text-center py-4">Este centro no tiene profesionales disponibles.</p>}
          </div>
        )}

        {paso === 3 && (
          <div className="space-y-3">
            <button onClick={() => setPaso(2)} className="text-xs text-slate-500 flex items-center gap-1 mb-2"><ArrowLeft className="w-3.5 h-3.5" /> Cambiar profesional</button>
            <h2 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5"><ListChecks className="w-4 h-4" /> Escoja un servicio</h2>
            {servicios.map(s => (
              <button
                key={s.id}
                onClick={() => { setServicioId(s.id); setPaso(4); }}
                className={`w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all text-left ${servicioId === s.id ? 'border-slate-800 bg-slate-50' : 'border-slate-200 hover:border-slate-400'}`}
              >
                <div>
                  <span className="font-bold text-sm text-slate-800 block">{s.nombre}</span>
                  <span className="text-[10px] text-slate-500">{s.duracionMinutos} min</span>
                </div>
                <span className="text-xs font-bold text-slate-700">₡{s.precio.toLocaleString('es-CR')}</span>
              </button>
            ))}
          </div>
        )}

        {paso === 4 && (
          <div className="space-y-4">
            <button onClick={() => setPaso(servicios.length > 0 ? 3 : 2)} className="text-xs text-slate-500 flex items-center gap-1 mb-2"><ArrowLeft className="w-3.5 h-3.5" /> {servicios.length > 0 ? 'Cambiar servicio' : 'Cambiar profesional'}</button>
            <h2 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5"><Calendar className="w-4 h-4" /> Tipo de visita y horario</h2>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setTipoVisita('CONSULTORIO')}
                className={`p-3 rounded-xl border-2 text-xs font-bold ${tipoVisita === 'CONSULTORIO' ? 'border-slate-800 bg-slate-50' : 'border-slate-200'}`}
              >
                En Consultorio
              </button>
              <button
                onClick={() => setTipoVisita('DOMICILIO')}
                disabled={!profesional?.aceptaDomicilio}
                className={`p-3 rounded-xl border-2 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed ${tipoVisita === 'DOMICILIO' ? 'border-slate-800 bg-slate-50' : 'border-slate-200'}`}
              >
                A Domicilio
              </button>
            </div>

            <div>
              <label className="block text-slate-600 text-xs font-medium mb-1">Fecha</label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
              />
            </div>

            <div>
              <label className="block text-slate-600 text-xs font-medium mb-1">Horarios disponibles</label>
              {cargandoHorarios ? (
                <div className="flex items-center gap-2 text-xs text-slate-500 py-3"><Loader2 className="w-4 h-4 animate-spin" /> Buscando horarios...</div>
              ) : (
                <div className="grid grid-cols-4 gap-1.5">
                  {horariosDisponibles.map(h => (
                    <button
                      key={h}
                      onClick={() => setHoraSeleccionada(h)}
                      className={`py-1.5 rounded-lg text-xs font-semibold ${horaSeleccionada === h ? 'text-white' : 'bg-slate-100 text-slate-700'}`}
                      style={horaSeleccionada === h ? { backgroundColor: colorPrimario } : {}}
                    >
                      {h}
                    </button>
                  ))}
                  {horariosDisponibles.length === 0 && <p className="col-span-4 text-slate-500 text-xs text-center py-2">No hay horarios libres ese día.</p>}
                </div>
              )}
            </div>

            <button
              disabled={!horaSeleccionada}
              onClick={() => setPaso(tipoVisita === 'DOMICILIO' ? 5 : 6)}
              className="w-full text-white font-bold text-xs py-3 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              style={{ backgroundColor: colorPrimario }}
            >
              Continuar <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {paso === 5 && (
          <div className="space-y-4">
            <button onClick={() => setPaso(4)} className="text-xs text-slate-500 flex items-center gap-1 mb-2"><ArrowLeft className="w-3.5 h-3.5" /> Cambiar horario</button>
            <h2 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5"><MapPin className="w-4 h-4" /> Su dirección</h2>
            <input
              id="direccion-domicilio-input"
              type="text"
              value={direccionDomicilio}
              onChange={(e) => setDireccionDomicilio(e.target.value)}
              placeholder="Escriba su dirección exacta"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
            />
            <button onClick={usarUbicacionActual} className="text-xs text-slate-600 flex items-center gap-1.5 underline">
              <MapPin className="w-3.5 h-3.5" /> Usar mi ubicación actual
            </button>
            <p className="text-[10px] text-slate-500">El tiempo de traslado se validará al confirmar la cita en el siguiente paso.</p>
            <button
              disabled={!direccionDomicilio.trim() && (pacienteLat == null)}
              onClick={() => setPaso(6)}
              className="w-full text-white font-bold text-xs py-3 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              style={{ backgroundColor: colorPrimario }}
            >
              Continuar <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {paso === 6 && (
          <div className="space-y-3">
            <button onClick={() => setPaso(tipoVisita === 'DOMICILIO' ? 5 : 4)} className="text-xs text-slate-500 flex items-center gap-1 mb-2"><ArrowLeft className="w-3.5 h-3.5" /> Volver</button>
            <h2 className="text-xs font-bold text-slate-500 uppercase">Sus datos</h2>
            <div>
              <label className="block text-slate-600 text-xs font-medium mb-1">Cédula</label>
              <input
                type="text"
                value={cedula}
                onChange={(e) => setCedula(e.target.value)}
                onBlur={buscarPacientePorCedula}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
              />
              {pacienteEncontrado && <p className="text-[10px] text-emerald-600 mt-1">¡Bienvenido(a) de nuevo! Verifique sus datos.</p>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input type="text" placeholder="Nombre completo" value={nombreCompleto} onChange={(e) => setNombreCompleto(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs" />
              <input type="date" value={fechaNacimiento} onChange={(e) => setFechaNacimiento(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs" />
              <input type="text" placeholder="Teléfono" value={telefono} onChange={(e) => setTelefono(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs" />
              <input type="email" placeholder="Correo" value={correoElectronico} onChange={(e) => setCorreoElectronico(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs" />
            </div>
            <button
              disabled={submitting}
              onClick={confirmarCita}
              className="w-full text-white font-bold text-xs py-3 rounded-xl disabled:opacity-60 flex items-center justify-center gap-1.5"
              style={{ backgroundColor: colorPrimario }}
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Confirmar Cita
            </button>
          </div>
        )}

        {paso === 7 && citaCreada && (
          <div className="text-center py-6 space-y-3">
            <div className="inline-flex p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600">
              <Check className="w-8 h-8" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">
              {citaCreada.estadoCita === 'PROGRAMADA' ? '¡Solicitud recibida!' : '¡Cita confirmada!'}
            </h2>
            <p className="text-xs text-slate-500">
              {fecha} a las {horaSeleccionada} con {profesional?.nombre} en {clinica?.nombreComercial}.
              {tipoVisita === 'DOMICILIO' && citaCreada.tiempoTrasladoMinutos != null && (
                <> Tiempo de traslado estimado: {citaCreada.tiempoTrasladoMinutos} min.</>
              )}
              {citaCreada.estadoCita === 'PROGRAMADA' && (
                <> Tu cita está pendiente de confirmación por parte del negocio.</>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
