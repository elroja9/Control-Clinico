import React, { useEffect, useState } from 'react';
import { Check, FolderSearch, Inbox, PlugZap } from 'lucide-react';
import { CompaniaImapConfig } from '../data/mockData';
import { notify } from './ui/Feedback';

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

const inputBase = 'w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800';

export default function CorreoEntranteSettings({ themeColor }: Props) {
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
    return <p className="mt-5 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-600">Correo entrante: {errorCarga}</p>;
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
    <form onSubmit={guardar} className="mt-5 p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-4 text-xs">
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2.5">
        <Inbox className="w-4 h-4" style={{ color: themeColor }} aria-hidden="true" />
        <div>
          <h4 className="font-bold text-slate-800">Correo entrante (facturas de proveedores)</h4>
          <p className="text-[11px] text-slate-500">
            Cada 5 minutos se revisa este buzón (solo lectura: no marca, mueve ni borra correos) y las facturas XML de sus proveedores
            aparecen en Cuentas por Pagar para importarlas con un clic.
          </p>
        </div>
      </div>

      <label className="flex items-center justify-between bg-white p-3.5 rounded-xl border border-slate-200 cursor-pointer">
        <span>
          <span className="font-bold text-slate-800 block">Lectura automática activa</span>
          <span className="text-[11px] text-slate-500 block">Si se apaga, el buzón solo se revisa con el botón "Revisar correo ahora" de Cuentas por Pagar.</span>
        </span>
        <input type="checkbox" checked={config.activo} onChange={e => set('activo', e.target.checked)} className="w-5 h-5" style={{ accentColor: themeColor }} />
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2">
          <label htmlFor="imap-host" className="block text-slate-600 mb-1 font-semibold">Servidor IMAP</label>
          <input id="imap-host" value={config.imapHost} onChange={e => set('imapHost', e.target.value)} placeholder="ej: imap.gmail.com" className={inputBase} />
        </div>
        <div>
          <label htmlFor="imap-seguridad" className="block text-slate-600 mb-1 font-semibold">Seguridad</label>
          <select
            id="imap-seguridad"
            value={config.imapSeguro ? 'TLS' : 'STARTTLS'}
            onChange={e => {
              const seguro = e.target.value === 'TLS';
              setConfig({ ...config, imapSeguro: seguro, imapPort: seguro ? 993 : 143 });
            }}
            className={inputBase}
          >
            <option value="TLS">TLS directo (puerto 993)</option>
            <option value="STARTTLS">STARTTLS (puerto 143)</option>
          </select>
        </div>
        <div>
          <label htmlFor="imap-puerto" className="block text-slate-600 mb-1 font-semibold">Puerto</label>
          <input id="imap-puerto" type="number" min={1} max={65535} value={config.imapPort} onChange={e => set('imapPort', parseInt(e.target.value) || 0)} className={inputBase} />
        </div>
        <div>
          <label htmlFor="imap-usuario" className="block text-slate-600 mb-1 font-semibold">Usuario</label>
          <input id="imap-usuario" value={config.imapUsuario} onChange={e => set('imapUsuario', e.target.value)} placeholder="facturas@suempresa.com" autoComplete="off" className={inputBase} />
        </div>
        <div>
          <label htmlFor="imap-password" className="block text-slate-600 mb-1 font-semibold">Contraseña</label>
          <input
            id="imap-password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder={config.tieneContrasena ? '•••••• (guardada; escriba para cambiarla)' : 'Contraseña o clave de aplicación'}
            autoComplete="new-password"
            className={inputBase}
          />
          {/gmail/i.test(config.imapHost) && (
            <p className="text-[11px] text-slate-500 mt-1">
              Use una contraseña de aplicación de Google (16 caracteres), no la contraseña normal.{' '}
              <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className="underline font-semibold" style={{ color: themeColor }}>
                Generar contraseña de aplicación
              </a>
            </p>
          )}
        </div>
        <div className="sm:col-span-3">
          <label htmlFor="imap-carpetas" className="block text-slate-600 mb-1 font-semibold">Carpetas a revisar</label>
          <input id="imap-carpetas" value={config.imapCarpeta} onChange={e => set('imapCarpeta', e.target.value)} placeholder="INBOX, Facturas" className={inputBase} aria-describedby="imap-carpetas-ayuda" />
          <p id="imap-carpetas-ayuda" className="text-[11px] text-slate-500 mt-1">Varias separadas por coma. En Gmail use una clave de aplicación; las etiquetas son carpetas (ej. "Facturas").</p>
        </div>
      </div>

      {carpetasDisponibles && (
        <div className="bg-white p-3 rounded-xl border border-slate-200">
          <p className="font-semibold text-slate-700 mb-2">Carpetas del buzón (clic para agregar):</p>
          <div className="flex flex-wrap gap-1.5">
            {carpetasDisponibles.filter(c => c.seleccionable).map(c => (
              <button key={c.ruta} type="button" onClick={() => agregarCarpeta(c.ruta)} className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-mono">
                {c.ruta}
              </button>
            ))}
          </div>
        </div>
      )}

      {config.activo && !config.verificadaEn && (
        <p className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 font-semibold" role="status">
          La revisión automática está en pausa: pruebe la conexión para activarla.
        </p>
      )}

      {errorProbar && (
        <p className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 whitespace-pre-wrap break-words" role="alert">
          {errorProbar}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <span className={`font-semibold ${config.verificadaEn ? 'text-emerald-700' : 'text-slate-500'}`} role="status">
          {config.verificadaEn ? `Conexión verificada el ${new Date(config.verificadaEn).toLocaleString('es-CR')}` : 'Conexión sin verificar'}
        </span>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={verCarpetas} disabled={!!ocupado || !config.tieneContrasena} title={!config.tieneContrasena ? 'Guarde primero la configuración' : undefined} className="px-3 py-2 rounded-xl font-bold bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 flex items-center gap-1.5 disabled:opacity-50">
            <FolderSearch className="w-4 h-4" aria-hidden="true" />{ocupado === 'carpetas' ? 'Cargando…' : 'Ver carpetas'}
          </button>
          <button type="button" onClick={probar} disabled={!!ocupado || !config.tieneContrasena} title={!config.tieneContrasena ? 'Guarde primero la configuración' : undefined} className="px-3 py-2 rounded-xl font-bold bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 flex items-center gap-1.5 disabled:opacity-50">
            <PlugZap className="w-4 h-4" aria-hidden="true" />{ocupado === 'probar' ? 'Probando…' : 'Probar conexión'}
          </button>
          <button type="submit" disabled={!!ocupado} className="text-white px-5 py-2 rounded-xl font-bold flex items-center gap-1.5 shadow-sm disabled:opacity-60" style={{ backgroundColor: themeColor }}>
            <Check className="w-4 h-4" aria-hidden="true" />Guardar correo entrante
          </button>
        </div>
      </div>
    </form>
  );
}
