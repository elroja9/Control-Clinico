import React, { useEffect, useState } from 'react';
import { Check, FolderSearch, Inbox, PlugZap } from 'lucide-react';
import { CompaniaImapConfig } from '../data/mockData';
import { notify } from './ui/Feedback';
import { Badge, Button, Card, CardBody, CardFooter, CardHeader, Field, Input, Select } from './ui';

// Buzón IMAP donde los proveedores envían sus facturas electrónicas. El servidor lo revisa cada 5
// minutos y deja las compras en la bandeja de Cuentas por Pagar (no crea nada por su cuenta).
// Carga y guarda su propia configuración: no depende del estado global de la app.

interface Props {
  themeColor: string;
}

async function pedir<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo completar la operación.');
  return data as T;
}

// El color de marca de la clínica llega por el token --brand del contenedor raíz, así que
// `themeColor` ya no se usa para pintar; se conserva en las props para no cambiar la interfaz.
export default function CorreoEntranteSettings(_props: Props) {
  const [config, setConfig] = useState<CompaniaImapConfig | null>(null);
  const [errorCarga, setErrorCarga] = useState('');
  const [password, setPassword] = useState('');
  const [carpetasDisponibles, setCarpetasDisponibles] = useState<{ ruta: string; seleccionable: boolean }[] | null>(null);
  const [ocupado, setOcupado] = useState<'' | 'guardar' | 'probar' | 'carpetas'>('');
  const [errorProbar, setErrorProbar] = useState('');

  useEffect(() => {
    pedir<CompaniaImapConfig>('/api/imap-config')
      .then(setConfig)
      .catch(err => setErrorCarga(err.message));
  }, []);

  if (errorCarga) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-fg-muted">Correo entrante: {errorCarga}</p>
        </CardBody>
      </Card>
    );
  }
  if (!config) return null;

  const set = <K extends keyof CompaniaImapConfig>(k: K, v: CompaniaImapConfig[K]) => setConfig({ ...config, [k]: v });

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setOcupado('guardar');
    try {
      const guardada = await pedir<CompaniaImapConfig>('/api/imap-config', 'POST', { ...config, ...(password.trim() ? { imapPassword: password.trim() } : {}) });
      setConfig(guardada);
      setPassword('');
      notify.success('Configuración del correo entrante guardada.');
    } catch (err: any) {
      notify.error(err.message);
    } finally {
      setOcupado('');
    }
  };

  const probar = async () => {
    setOcupado('probar');
    setErrorProbar('');
    try {
      const r = await pedir<{ verificadaEn: string }>('/api/imap-config/probar', 'POST');
      setConfig({ ...config, verificadaEn: r.verificadaEn });
      notify.success('Conexión correcta: el buzón y sus carpetas se pudieron abrir.');
    } catch (err: any) {
      setConfig({ ...config, verificadaEn: null });
      setErrorProbar(err.message);
      notify.error(err.message);
    } finally {
      setOcupado('');
    }
  };

  const verCarpetas = async () => {
    setOcupado('carpetas');
    try {
      setCarpetasDisponibles(await pedir('/api/imap-config/carpetas'));
    } catch (err: any) {
      notify.error(err.message);
    } finally {
      setOcupado('');
    }
  };

  const agregarCarpeta = (ruta: string) => {
    const actuales = config.imapCarpeta.split(',').map(c => c.trim()).filter(Boolean);
    if (!actuales.includes(ruta)) set('imapCarpeta', [...actuales, ruta].join(', '));
  };

  return (
    <form onSubmit={guardar}>
      <Card>
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2">
              <Inbox className="w-5 h-5 text-brand-ink" aria-hidden="true" />
              Correo entrante (facturas de proveedores)
            </span>
          }
          description="Cada 5 minutos se revisa este buzón (solo lectura: no marca, mueve ni borra correos) y las facturas XML de sus proveedores aparecen en Cuentas por Pagar para importarlas con un clic."
          actions={<div className="flex"><Badge tone={config.activo ? 'success' : 'neutral'}>{config.activo ? 'Activo' : 'Apagado'}</Badge></div>}
        />

        <CardBody className="space-y-5">
          <label className="flex items-center justify-between gap-4 bg-surface-muted/60 p-4 rounded-control cursor-pointer">
            <span className="min-w-0">
              <span className="font-semibold text-fg block text-sm">Lectura automática activa</span>
              <span className="text-xs text-fg-muted block mt-0.5">Si se apaga, el buzón solo se revisa con el botón "Revisar correo ahora" de Cuentas por Pagar.</span>
            </span>
            <input type="checkbox" checked={config.activo} onChange={e => set('activo', e.target.checked)} className="w-5 h-5 shrink-0 accent-brand-solid" />
          </label>

          {/* Servidor, usuario, contraseña y carpetas a ancho completo; seguridad y puerto lado a lado en el iPhone. */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
            <Field label="Servidor IMAP" className="col-span-2">
              <Input value={config.imapHost} onChange={e => set('imapHost', e.target.value)} placeholder="ej: imap.gmail.com" autoCapitalize="none" />
            </Field>
            <Field label="Seguridad">
              <Select
                value={config.imapSeguro ? 'TLS' : 'STARTTLS'}
                onChange={e => {
                  const seguro = e.target.value === 'TLS';
                  setConfig({ ...config, imapSeguro: seguro, imapPort: seguro ? 993 : 143 });
                }}
              >
                {/* Sin el puerto en el texto: no cabía en media columna; el campo Puerto lo muestra al lado. */}
                <option value="TLS">TLS directo</option>
                <option value="STARTTLS">STARTTLS</option>
              </Select>
            </Field>
            <Field label="Puerto">
              <Input type="number" min={1} max={65535} inputMode="numeric" value={config.imapPort} onChange={e => set('imapPort', parseInt(e.target.value) || 0)} />
            </Field>
            <Field label="Usuario" className="col-span-2 sm:col-span-1">
              <Input value={config.imapUsuario} onChange={e => set('imapUsuario', e.target.value)} placeholder="facturas@suempresa.com" autoComplete="off" autoCapitalize="none" />
            </Field>
            <Field
              label="Contraseña"
              className="col-span-2 sm:col-span-1"
              hint={
                config.tieneContrasena || /gmail/i.test(config.imapHost) ? (
                  <>
                    {config.tieneContrasena && 'Guardada: escriba solo para cambiarla. '}
                    {/gmail/i.test(config.imapHost) && (
                      <>
                        Use una contraseña de aplicación de Google (16 caracteres), no la contraseña normal.{' '}
                        <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className="underline font-semibold text-brand-ink">
                          Generar contraseña de aplicación
                        </a>
                      </>
                    )}
                  </>
                ) : undefined
              }
            >
              <Input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={config.tieneContrasena ? '••••••••' : 'Contraseña o clave de aplicación'}
                autoComplete="new-password"
              />
            </Field>
            <Field
              label="Carpetas a revisar"
              className="col-span-2 sm:col-span-3"
              hint='Varias separadas por coma. En Gmail use una clave de aplicación; las etiquetas son carpetas (ej. "Facturas").'
            >
              <Input value={config.imapCarpeta} onChange={e => set('imapCarpeta', e.target.value)} placeholder="INBOX, Facturas" autoCapitalize="none" />
            </Field>
          </div>

          {carpetasDisponibles && (
            <div className="bg-surface-muted/60 p-4 rounded-control">
              <p className="text-sm font-semibold text-fg mb-2">Carpetas del buzón (toque para agregar):</p>
              <div className="flex flex-wrap gap-2">
                {carpetasDisponibles.filter(c => c.seleccionable).map(c => (
                  <button
                    key={c.ruta}
                    type="button"
                    onClick={() => agregarCarpeta(c.ruta)}
                    className="min-h-11 max-w-full px-3 rounded-control bg-surface border border-border-strong hover:bg-surface-muted text-fg text-xs font-mono text-left break-all"
                  >
                    {c.ruta}
                  </button>
                ))}
              </div>
            </div>
          )}

          {config.activo && !config.verificadaEn && (
            <p className="p-3 rounded-control bg-warning-soft border border-warning/25 text-warning text-sm font-semibold" role="status">
              La revisión automática está en pausa: pruebe la conexión para activarla.
            </p>
          )}

          {errorProbar && (
            <p className="p-3 rounded-control bg-danger-soft border border-danger/20 text-danger text-sm whitespace-pre-wrap break-words" role="alert">
              {errorProbar}
            </p>
          )}
        </CardBody>

        <CardFooter className="flex-wrap justify-between">
          <span className={`max-sm:basis-full! text-sm font-semibold ${config.verificadaEn ? 'text-success' : 'text-fg-muted'}`} role="status">
            {config.verificadaEn ? `Conexión verificada el ${new Date(config.verificadaEn).toLocaleString('es-CR')}` : 'Conexión sin verificar'}
          </span>
          {/* En móvil: "Ver carpetas" y "Probar" en una fila y Guardar a todo el ancho debajo. */}
          <div className="max-sm:basis-full! grid grid-cols-2 sm:flex sm:flex-wrap gap-2 max-sm:[&>*:last-child]:col-span-2">
            <Button
              variant="outline"
              onClick={verCarpetas}
              disabled={!!ocupado || !config.tieneContrasena}
              loading={ocupado === 'carpetas'}
              title={!config.tieneContrasena ? 'Guarde primero la configuración' : undefined}
              icon={<FolderSearch className="w-4 h-4" aria-hidden="true" />}
            >
              {ocupado === 'carpetas' ? 'Cargando…' : (
                <>
                  <span className="sm:hidden">Carpetas</span>
                  <span className="hidden sm:inline">Ver carpetas</span>
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={probar}
              disabled={!!ocupado || !config.tieneContrasena}
              loading={ocupado === 'probar'}
              title={!config.tieneContrasena ? 'Guarde primero la configuración' : undefined}
              icon={<PlugZap className="w-4 h-4" aria-hidden="true" />}
            >
              {ocupado === 'probar' ? 'Probando…' : (
                <>
                  <span className="sm:hidden">Probar</span>
                  <span className="hidden sm:inline">Probar conexión</span>
                </>
              )}
            </Button>
            <Button type="submit" disabled={!!ocupado} icon={<Check className="w-4 h-4" aria-hidden="true" />}>
              Guardar correo entrante
            </Button>
          </div>
        </CardFooter>
      </Card>
    </form>
  );
}
