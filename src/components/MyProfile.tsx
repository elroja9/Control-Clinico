import React, { useState, useEffect } from 'react';
import { User } from '../data/mockData';
import { MapPin, Clock, Save, Check, Copy, RefreshCw, CalendarSync } from 'lucide-react';
import { loadGoogleMapsScript } from '../utils/loadGoogleMaps';

interface MyProfileProps {
  currentUser: User;
  onSaveUser: (user: User) => void;
}

export default function MyProfile({ currentUser, onSaveUser }: MyProfileProps) {
  const [ubicacionDireccion, setUbicacionDireccion] = useState(currentUser.ubicacionDireccion || '');
  const [ubicacionLat, setUbicacionLat] = useState<number | null>(currentUser.ubicacionLat);
  const [ubicacionLng, setUbicacionLng] = useState<number | null>(currentUser.ubicacionLng);
  const [maxTiempoTrasladoMinutos, setMaxTiempoTrasladoMinutos] = useState(currentUser.maxTiempoTrasladoMinutos);
  const [mapsListo, setMapsListo] = useState(false);
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    fetch('/api/public/config')
      .then(res => res.json())
      .then(data => loadGoogleMapsScript(data.googleMapsApiKey))
      .then(() => setMapsListo(true))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!mapsListo) return;
    const input = document.getElementById('mi-perfil-direccion-input') as HTMLInputElement | null;
    if (!input) return;
    const autocomplete = new (window as any).google.maps.places.Autocomplete(input, { fields: ['formatted_address', 'geometry'] });
    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (place.geometry?.location) {
        setUbicacionDireccion(place.formatted_address || input.value);
        setUbicacionLat(place.geometry.location.lat());
        setUbicacionLng(place.geometry.location.lng());
      }
    });
  }, [mapsListo]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveUser({ ...currentUser, ubicacionDireccion, ubicacionLat, ubicacionLng, maxTiempoTrasladoMinutos });
    setGuardado(true);
    setTimeout(() => setGuardado(false), 2500);
  };

  return (
    <div className="space-y-4 max-w-lg">
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 text-xs">
      <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
        <MapPin className="w-5 h-5 text-slate-500" />
        <div>
          <h3 className="text-sm font-bold text-slate-800">Mi Perfil — Visitas a Domicilio</h3>
          <p className="text-[11px] text-slate-500">Configura tu ubicación principal para que los pacientes puedan agendar visitas a domicilio contigo</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-3">
        <div>
          <label className="block text-slate-600 font-medium mb-1">Dirección Principal</label>
          <input
            id="mi-perfil-direccion-input"
            type="text"
            value={ubicacionDireccion}
            onChange={(e) => setUbicacionDireccion(e.target.value)}
            placeholder="Escriba su dirección exacta"
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
          />
        </div>
        <div>
          <label className="block text-slate-600 font-medium mb-1 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Tiempo máximo de traslado aceptado (minutos)</label>
          <input
            type="number"
            min={0}
            value={maxTiempoTrasladoMinutos}
            onChange={(e) => setMaxTiempoTrasladoMinutos(parseInt(e.target.value) || 0)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
          />
        </div>
        <button type="submit" className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-semibold">
          {guardado ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : <Save className="w-3.5 h-3.5" aria-hidden="true" />}
          {guardado ? 'Guardado' : 'Guardar'}
        </button>
      </form>
    </div>
    {currentUser.rol !== 'Contador' && <SincronizarCalendario />}
    </div>
  );
}

interface EstadoCalendario {
  activo: boolean;
  url?: string;
  nombreCompleto: boolean;
}

function SincronizarCalendario() {
  const [estado, setEstado] = useState<EstadoCalendario | null>(null);
  const [cargando, setCargando] = useState(true);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState('');
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    let vigente = true;
    fetch('/api/mi-calendario')
      .then(async res => {
        if (!res.ok) throw new Error();
        return res.json() as Promise<EstadoCalendario>;
      })
      .then(data => { if (vigente) setEstado(data); })
      .catch(() => { if (vigente) setError('No se pudo cargar la configuración del calendario.'); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, []);

  const enviar = async (accion: 'generar' | 'regenerar' | 'desactivar', nombreCompleto?: boolean) => {
    setTrabajando(true);
    setError('');
    try {
      const res = await fetch('/api/mi-calendario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion, ...(nombreCompleto === undefined ? {} : { nombreCompleto }) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo actualizar el calendario.');
      setEstado(data as EstadoCalendario);
    } catch (err: any) {
      setError(err.message || 'No se pudo actualizar el calendario.');
    } finally {
      setTrabajando(false);
    }
  };

  const regenerar = () => {
    if (window.confirm('Se creará un enlace nuevo y el anterior dejará de funcionar. Deberá volver a suscribir su calendario con el enlace nuevo. ¿Continuar?')) {
      void enviar('regenerar');
    }
  };

  const desactivar = () => {
    if (window.confirm('Se desactivará la sincronización y el enlace actual dejará de funcionar. ¿Continuar?')) {
      void enviar('desactivar');
    }
  };

  const copiar = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setError('No se pudo copiar automáticamente. Seleccione el enlace y cópielo manualmente.');
    }
  };

  const url = estado?.url;
  const urlWebcal = url ? url.replace(/^https?:\/\//, 'webcal://') : '';
  const urlGoogle = urlWebcal ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(urlWebcal)}` : '';
  const botonSecundario = 'flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50';

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 text-xs">
      <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
        <CalendarSync className="w-5 h-5 text-slate-500" aria-hidden="true" />
        <div>
          <h3 className="text-sm font-bold text-slate-800">Sincronizar con el calendario del teléfono</h3>
          <p className="text-[11px] text-slate-500">Vea sus citas en Google Calendar (Android) o en el Calendario de iPhone/iPad</p>
        </div>
      </div>

      {error && <p role="alert" className="mb-3 text-rose-600">{error}</p>}

      {cargando ? (
        <p className="text-slate-500">Cargando…</p>
      ) : !estado ? null : !estado.activo ? (
        <button
          type="button"
          disabled={trabajando}
          onClick={() => void enviar('generar')}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg font-semibold"
        >
          Activar sincronización
        </button>
      ) : (
        <div className="space-y-3">
          <div>
            <label htmlFor="mi-calendario-url" className="block text-slate-600 font-medium mb-1">Enlace de suscripción (personal, no lo comparta)</label>
            <div className="flex gap-2">
              <input
                id="mi-calendario-url"
                type="text"
                readOnly
                value={url || ''}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
              />
              <button type="button" onClick={() => url && void copiar(url)} className={botonSecundario}>
                {copiado ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
                {copiado ? 'Copiado' : 'Copiar'}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <a href={urlWebcal} className={botonSecundario}>Abrir en iPhone/iPad</a>
            <a href={urlGoogle} target="_blank" rel="noopener noreferrer" className={botonSecundario}>Agregar a Google Calendar (Android)</a>
          </div>

          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              role="switch"
              checked={estado.nombreCompleto}
              disabled={trabajando}
              onChange={(e) => void enviar('generar', e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="block text-slate-700 font-medium">Mostrar nombre completo del paciente</span>
              <span className="block text-[11px] text-slate-500">
                Por defecto solo se muestran las iniciales. Si lo activa, el nombre y el teléfono del paciente quedarán en el calendario de su teléfono y en el de cualquier servicio (como Google) que lea este enlace. Las notas clínicas nunca se incluyen.
              </span>
            </span>
          </label>

          <p className="text-[11px] text-slate-500 leading-relaxed">
            iPhone: toque “Abrir en iPhone” y confirme “Suscribirse”. Android: use “Agregar a Google Calendar” (requiere estar conectado a Google en el navegador) y active el calendario en la app Google Calendar. La actualización la controla cada calendario: en iPhone suele ser de 15 a 60 minutos; en Google, de algunas horas.
          </p>

          <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
            <button type="button" disabled={trabajando} onClick={regenerar} className={botonSecundario}>
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> Regenerar enlace
            </button>
            <button type="button" disabled={trabajando} onClick={desactivar} className="flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50">
              Desactivar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
