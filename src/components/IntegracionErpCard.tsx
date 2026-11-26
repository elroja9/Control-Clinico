import React, { useEffect, useState } from 'react';
import { PlugZap, Save, KeyRound, ShieldCheck } from 'lucide-react';
import { Badge, Button, Card, CardBody, CardHeader, Field, Input, SegmentedControl, Textarea, notify, confirmar } from './ui';

/** Lo que devuelve GET /api/saas/integracion-erp (la clave nunca viaja: solo si está configurada). */
export interface ConfigIntegracionErp {
  dbConectada: boolean;
  url: string;
  rutaApi: string;
  syncActivo: boolean;
  syncIntervaloMin: number;
  timeoutMs: number;
  moraDiasSuspension: number;
  moraDiasAviso: number;
  adelantadoMesesMax: number;
  faltantes: string[];
  apiKeyConfigurada: boolean;
  apiKeyPista: string | null;
  caConfigurada: boolean;
  ca: { sujeto: string; venceEn: string } | null;
}

/** fetch JSON con el mensaje de error del servidor. */
export async function apiJson<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...(init?.headers || {}) } : init?.headers
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* respuesta sin JSON */
  }
  if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
  return data as T;
}

interface Props {
  config: ConfigIntegracionErp | null;
  cargando: boolean;
  onGuardada: (config: ConfigIntegracionErp) => void;
}

const enteroDe = (v: string) => (v.trim() === '' ? NaN : Number(v));

/** Tarjeta «Integración con ERP» del panel SaaS: URL, clave (solo escritura), sincronización y mora. */
export default function IntegracionErpCard({ config, cargando, onGuardada }: Props) {
  const [url, setUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [syncActivo, setSyncActivo] = useState<'si' | 'no'>('no');
  const [intervalo, setIntervalo] = useState('');
  const [timeoutMs, setTimeoutMs] = useState('');
  const [diasMora, setDiasMora] = useState('');
  const [diasAviso, setDiasAviso] = useState('');
  const [caPem, setCaPem] = useState('');
  const [quitarCa, setQuitarCa] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState(false);

  useEffect(() => {
    if (!config) return;
    setUrl(config.url);
    setApiKey('');
    setSyncActivo(config.syncActivo ? 'si' : 'no');
    setIntervalo(String(config.syncIntervaloMin || ''));
    setTimeoutMs(String(config.timeoutMs || ''));
    setDiasMora(String(config.moraDiasSuspension));
    setDiasAviso(String(config.moraDiasAviso));
    setCaPem('');
    setQuitarCa(false);
  }, [config]);

  const guardar = async (extra: Record<string, unknown> = {}) => {
    setGuardando(true);
    try {
      const body: Record<string, unknown> = {
        url: url.trim(),
        syncActivo: syncActivo === 'si',
        syncIntervaloMin: enteroDe(intervalo),
        timeoutMs: enteroDe(timeoutMs),
        moraDiasSuspension: enteroDe(diasMora),
        moraDiasAviso: enteroDe(diasAviso),
        ...extra
      };
      if (apiKey.trim()) body.apiKey = apiKey.trim();
      if (quitarCa) body.caPem = null;
      else if (caPem.trim()) body.caPem = caPem.trim();
      const nueva = await apiJson<ConfigIntegracionErp>('/api/saas/integracion-erp', { method: 'PUT', body: JSON.stringify(body) });
      onGuardada(nueva);
      notify.success('Configuración de la integración guardada.');
    } catch (err: any) {
      notify.error(err.message || 'No se pudo guardar la configuración.');
    } finally {
      setGuardando(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    guardar();
  };

  const borrarClave = async () => {
    const ok = await confirmar({
      title: 'Quitar la clave de integración',
      message: 'Sin clave, Control Clínico deja de sincronizar con el ERP hasta que configure otra.',
      confirmText: 'Quitar clave',
      tone: 'danger'
    });
    if (ok) guardar({ borrarApiKey: true });
  };

  const probar = async () => {
    setProbando(true);
    try {
      const r = await apiJson<{ ok: boolean; origen: string | null; empresa: string | null }>('/api/saas/integracion-erp/probar', { method: 'POST' });
      notify.success(`Conexión correcta${r.empresa ? ` con «${r.empresa}»` : ''}${r.origen ? ` (origen ${r.origen})` : ''}.`, 'ERP');
    } catch (err: any) {
      notify.error(err.message || 'No se pudo conectar con el ERP.', 'ERP');
    } finally {
      setProbando(false);
    }
  };

  const configurada = !!config && !!config.url && config.apiKeyConfigurada && config.faltantes.length === 0;

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <PlugZap className="w-5 h-5 text-brand-ink" aria-hidden="true" />
            Integración con ERP
          </span>
        }
        description="Las facturas de las suscripciones las emite el ERP ELROTECH. Aquí se configura la conexión, la sincronización y la suspensión por mora."
        actions={
          config && (
            <Badge tone={configurada ? (config.syncActivo ? 'success' : 'info') : 'warning'}>
              {configurada ? (config.syncActivo ? 'Sincronización activa' : 'Configurada, sincronización pausada') : 'Sin configurar'}
            </Badge>
          )
        }
      />
      <CardBody>
        {cargando && !config ? (
          <p className="text-sm text-fg-muted">Cargando configuración…</p>
        ) : !config ? (
          <p className="text-sm text-danger">No se pudo cargar la configuración de la integración.</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {!config.dbConectada && (
              <p className="text-sm text-danger">La integración requiere la base de datos y el servidor está sin conexión a MySQL.</p>
            )}
            {config.faltantes.length > 0 && (
              <p className="text-sm text-warning">
                Faltan parámetros en la base de datos ({config.faltantes.join(', ')}). Aplique docs/sql/2026-11-27-integracion-erp.sql.
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="URL del ERP" hint={`https://… (la API está en ${config.rutaApi || '—'})`}>
                {(p) => <Input {...p} type="url" inputMode="url" autoCapitalize="none" spellCheck={false} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://erp.ejemplo.com" />}
              </Field>
              <Field
                label="Clave de integración"
                hint={config.apiKeyConfigurada ? 'Guardada cifrada. Escriba una nueva solo para reemplazarla.' : 'La emite el ERP (Administración SaaS → Integraciones).'}
                labelAction={
                  config.apiKeyConfigurada
                    ? <Badge tone="success"><KeyRound className="w-3 h-3" aria-hidden="true" />Configurada{config.apiKeyPista ? ` ···${config.apiKeyPista}` : ''}</Badge>
                    : <Badge tone="warning">Sin clave</Badge>
                }
              >
                {(p) => <Input {...p} type="password" autoComplete="new-password" spellCheck={false} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={config.apiKeyConfigurada ? '•••••••• (sin cambios)' : 'Pegue la clave'} />}
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Sincronización automática">
                {() => (
                  <SegmentedControl
                    ariaLabel="Sincronización automática"
                    value={syncActivo}
                    onChange={setSyncActivo}
                    options={[{ value: 'si', label: 'Activa' }, { value: 'no', label: 'Pausada' }]}
                  />
                )}
              </Field>
              <Field label="Intervalo (minutos)">
                {(p) => <Input {...p} type="number" inputMode="numeric" min={1} max={1440} value={intervalo} onChange={(e) => setIntervalo(e.target.value)} />}
              </Field>
              <Field label="Tiempo límite por petición (ms)">
                {(p) => <Input {...p} type="number" inputMode="numeric" min={1000} max={120000} step={500} value={timeoutMs} onChange={(e) => setTimeoutMs(e.target.value)} />}
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Días de mora para suspender" hint="0 = suspensión automática desactivada. Nunca aplica a la empresa de plataforma.">
                {(p) => <Input {...p} type="number" inputMode="numeric" min={0} max={365} value={diasMora} onChange={(e) => setDiasMora(e.target.value)} />}
              </Field>
              <Field label="Días de aviso previo" hint="El correo de aviso sale una sola vez, esta cantidad de días antes de suspender.">
                {(p) => <Input {...p} type="number" inputMode="numeric" min={0} max={60} value={diasAviso} onChange={(e) => setDiasAviso(e.target.value)} />}
              </Field>
            </div>

            <Field
              label="CA del certificado del ERP (opcional)"
              hint={config.caConfigurada
                ? `Configurada: ${config.ca?.sujeto ?? 'certificado'}${config.ca ? ` · vence ${config.ca.venceEn.slice(0, 10)}` : ''}. Pegue otra para reemplazarla.`
                : 'Solo si el ERP usa un certificado propio. La verificación TLS sigue siempre activa.'}
              labelAction={config.caConfigurada ? <Badge tone="info"><ShieldCheck className="w-3 h-3" aria-hidden="true" />CA propia</Badge> : undefined}
            >
              {(p) => <Textarea {...p} rows={3} spellCheck={false} className="font-mono text-xs" value={caPem} disabled={quitarCa} onChange={(e) => setCaPem(e.target.value)} placeholder="-----BEGIN CERTIFICATE-----" />}
            </Field>
            {config.caConfigurada && (
              <label className="flex items-center gap-2 text-sm text-fg min-h-11">
                <input type="checkbox" className="w-4 h-4" checked={quitarCa} onChange={(e) => setQuitarCa(e.target.checked)} />
                Quitar la CA propia (usar solo las autoridades públicas)
              </label>
            )}

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              {config.apiKeyConfigurada && (
                <Button variant="ghost" onClick={borrarClave} disabled={guardando}>Quitar clave</Button>
              )}
              <Button variant="outline" onClick={probar} loading={probando} disabled={!configurada || guardando} icon={<PlugZap className="w-4 h-4" aria-hidden="true" />}>
                Probar conexión
              </Button>
              <Button type="submit" loading={guardando} disabled={!config.dbConectada} icon={<Save className="w-4 h-4" aria-hidden="true" />}>
                Guardar
              </Button>
            </div>
            {!configurada && config.url && (
              <p className="text-xs text-fg-muted sm:text-right">Guarde la URL y la clave para poder probar la conexión.</p>
            )}
          </form>
        )}
      </CardBody>
    </Card>
  );
}
