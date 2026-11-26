import React, { useState, useEffect } from 'react';
import { User } from '../data/mockData';
import { MapPin, Clock, Save, Check, Copy, RefreshCw, CalendarSync } from 'lucide-react';
import { loadGoogleMapsScript } from '../utils/loadGoogleMaps';
import { Badge, Button, Card, CardBody, CardFooter, CardHeader, Field, Input, cx } from './ui';
import { buttonSizes, buttonVariants } from './ui/Button';

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
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start max-w-5xl">
      <form onSubmit={handleSave}>
        <Card>
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <MapPin className="w-5 h-5 text-brand-ink" aria-hidden="true" />
                Visitas a domicilio
              </span>
            }
            description="Configura tu ubicación principal para que los pacientes puedan agendar visitas a domicilio contigo."
          />
          <CardBody className="space-y-4">
            <div>
              <label htmlFor="mi-perfil-direccion-input" className="block text-xs font-semibold text-fg mb-1.5">Dirección principal</label>
              <Input
                id="mi-perfil-direccion-input"
                type="text"
                value={ubicacionDireccion}
                onChange={(e) => setUbicacionDireccion(e.target.value)}
                placeholder="Escriba su dirección exacta"
                leadingIcon={<MapPin />}
              />
            </div>
            <Field label="Tiempo máximo de traslado aceptado (minutos)">
              <Input
                type="number"
                min={0}
                inputMode="numeric"
                value={maxTiempoTrasladoMinutos}
                onChange={(e) => setMaxTiempoTrasladoMinutos(parseInt(e.target.value) || 0)}
                leadingIcon={<Clock />}
              />
            </Field>
          </CardBody>
          <CardFooter>
            <span role="status" className="sr-only">{guardado ? 'Perfil guardado' : ''}</span>
            <Button
              type="submit"
              icon={guardado ? <Check className="w-4 h-4" aria-hidden="true" /> : <Save className="w-4 h-4" aria-hidden="true" />}
            >
              {guardado ? 'Guardado' : 'Guardar'}
            </Button>
          </CardFooter>
        </Card>
      </form>
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
  // Enlaces con aspecto de botón (webcal / Google Calendar)
  const enlaceBoton = cx(
    'inline-flex items-center justify-center rounded-control font-semibold transition-colors text-center',
    buttonVariants.outline,
    buttonSizes.sm
  );

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <CalendarSync className="w-5 h-5 text-brand-ink" aria-hidden="true" />
            Sincronizar con el calendario del teléfono
          </span>
        }
        description="Vea sus citas en Google Calendar (Android) o en el Calendario de iPhone/iPad."
        actions={estado ? <Badge tone={estado.activo ? 'success' : 'neutral'}>{estado.activo ? 'Activa' : 'Inactiva'}</Badge> : undefined}
      />

      <CardBody className="space-y-4">
        {error && (
          <p role="alert" className="text-sm font-medium text-danger bg-danger-soft border border-danger/20 rounded-control px-3 py-2">
            {error}
          </p>
        )}

        {cargando ? (
          <p className="text-sm text-fg-muted" role="status">Cargando…</p>
        ) : !estado ? null : !estado.activo ? (
          <Button disabled={trabajando} loading={trabajando} onClick={() => void enviar('generar')}>
            Activar sincronización
          </Button>
        ) : (
          <>
            <div>
              <label htmlFor="mi-calendario-url" className="block text-xs font-semibold text-fg mb-1.5">
                Enlace de suscripción (personal, no lo comparta)
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  id="mi-calendario-url"
                  type="text"
                  readOnly
                  value={url || ''}
                  onFocus={(e) => e.currentTarget.select()}
                  wrapperClassName="flex-1 min-w-0"
                  className="font-mono text-xs"
                />
                <Button
                  variant="outline"
                  onClick={() => url && void copiar(url)}
                  icon={copiado ? <Check className="w-4 h-4" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
                >
                  {copiado ? 'Copiado' : 'Copiar'}
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <a href={urlWebcal} className={enlaceBoton}>Abrir en iPhone/iPad</a>
              <a href={urlGoogle} target="_blank" rel="noopener noreferrer" className={enlaceBoton}>Agregar a Google Calendar (Android)</a>
            </div>

            <label className="flex items-start gap-3 rounded-control border border-border bg-surface-muted/50 p-3.5 cursor-pointer">
              <input
                type="checkbox"
                role="switch"
                checked={estado.nombreCompleto}
                disabled={trabajando}
                onChange={(e) => void enviar('generar', e.target.checked)}
                className="mt-0.5 w-5 h-5 shrink-0 accent-brand-solid"
              />
              <span>
                <span className="block text-sm font-semibold text-fg">Mostrar nombre completo del paciente</span>
                <span className="block text-xs text-fg-muted mt-0.5">
                  Por defecto solo se muestran las iniciales. Si lo activa, el nombre y el teléfono del paciente quedarán en el calendario de su teléfono y en el de cualquier servicio (como Google) que lea este enlace. Las notas clínicas nunca se incluyen.
                </span>
              </span>
            </label>

            <p className="text-xs text-fg-muted leading-relaxed">
              iPhone: toque “Abrir en iPhone” y confirme “Suscribirse”. Android: use “Agregar a Google Calendar” (requiere estar conectado a Google en el navegador) y active el calendario en la app Google Calendar. La actualización la controla cada calendario: en iPhone suele ser de 15 a 60 minutos; en Google, de algunas horas.
            </p>
          </>
        )}
      </CardBody>

      {estado?.activo && (
        <CardFooter className="justify-between flex-wrap">
          <Button variant="outline" size="sm" disabled={trabajando} onClick={regenerar} icon={<RefreshCw className="w-4 h-4" aria-hidden="true" />}>
            Regenerar enlace
          </Button>
          <Button variant="danger" size="sm" disabled={trabajando} onClick={desactivar}>
            Desactivar
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
