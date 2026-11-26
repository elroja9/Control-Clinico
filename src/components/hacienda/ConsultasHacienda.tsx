// Pestaña "Consultas Hacienda" (grupo Finanzas): tipo de cambio, buscador CABYS, contribuyentes,
// exoneraciones y, solo para Administrador y Contador, los comprobantes emitidos según Hacienda.
// Todas las consultas pasan por el servidor (/api/hacienda/*), que lee URLs y límites de la BD.
import { useEffect, useState } from 'react';
import {
  AlertCircle, BadgeCheck, Building2, ChevronLeft, ChevronRight, Copy, DollarSign, Euro,
  FileSearch, RefreshCw, Search, ShieldCheck
} from 'lucide-react';
import { PageHeader } from '../ui/PageHeader';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { StatCard } from '../ui/StatCard';
import { Input } from '../ui/Input';
import { Field } from '../ui/Field';
import { Button } from '../ui/Button';
import { Badge, type BadgeTone } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { Skeleton } from '../ui/Skeleton';
import { ChipsSugeridos } from './CabysSelector';
import {
  copiarAlPortapapeles, esAbort, etiquetaIva, formatearColones, formatearFecha, pedirJson,
  useBusquedaCabys, useCabysSugeridos, ErrorApi,
  type AmbienteHacienda, type ComprobanteHacienda, type ComprobantesRespuesta, type ContribuyenteRespuesta,
  type EstadoComprobanteRespuesta, type ExoneracionRespuesta, type TipoCambioRespuesta
} from './haciendaCliente';

type Rol = 'Administrador' | 'Profesional' | 'Contador';

export interface ConsultasHaciendaProps {
  rol: Rol;
}

export default function ConsultasHacienda({ rol }: ConsultasHaciendaProps) {
  const veComprobantes = rol === 'Administrador' || rol === 'Contador';
  return (
    <div className="space-y-5 min-w-0">
      <PageHeader
        title="Consultas Hacienda"
        description="Información oficial del Ministerio de Hacienda: tipo de cambio, códigos CABYS, contribuyentes y exoneraciones."
      />
      <TipoCambioSeccion />
      <BuscadorCabysSeccion />
      <div className="grid gap-5 lg:grid-cols-2 min-w-0">
        <ContribuyenteSeccion />
        <ExoneracionSeccion />
      </div>
      {veComprobantes && <ComprobantesSeccion />}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Utilidades visuales

function MensajeError({ mensaje, onReintentar }: { mensaje: string; onReintentar?: () => void }) {
  return (
    <div role="alert" className="flex flex-col sm:flex-row sm:items-start gap-3 rounded-control border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
      <div className="flex items-start gap-2 min-w-0 flex-1">
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
        <span className="break-words min-w-0">{mensaje}</span>
      </div>
      {onReintentar && (
        <Button size="sm" variant="outline" onClick={onReintentar} icon={<RefreshCw className="w-4 h-4" aria-hidden="true" />}>
          Reintentar
        </Button>
      )}
    </div>
  );
}

function BotonCopiar({ texto, etiqueta }: { texto: string; etiqueta: string }) {
  return (
    <button
      type="button"
      onClick={() => copiarAlPortapapeles(texto, etiqueta)}
      className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-control text-fg-muted hover:bg-surface-muted hover:text-fg"
      aria-label={`Copiar ${etiqueta.toLowerCase()} ${texto}`}
      title="Copiar"
    >
      <Copy className="w-4 h-4" aria-hidden="true" />
    </button>
  );
}

const valorONada = (v: string | number | null | undefined) => (v == null || v === '' ? '—' : String(v));

// ---------------------------------------------------------------------------------------------
// a) Tipo de cambio

function TipoCambioSeccion() {
  const [datos, setDatos] = useState<TipoCambioRespuesta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setCargando(true);
    setError(null);
    pedirJson<TipoCambioRespuesta>('/api/hacienda/tipo-cambio', ctrl.signal)
      .then(setDatos)
      .catch(err => { if (!esAbort(err)) setError(err.message); })
      .finally(() => { if (!ctrl.signal.aborted) setCargando(false); });
    return () => ctrl.abort();
  }, [intento]);

  const fecha = datos?.dolar.venta.fecha || datos?.dolar.compra.fecha || datos?.euro.fecha;

  return (
    <Card>
      <CardHeader
        title="Tipo de cambio"
        description={datos ? `Referencia del BCCR publicada por Hacienda · ${formatearFecha(fecha)}` : 'Referencia del BCCR publicada por Hacienda'}
      />
      <CardBody>
        {cargando ? (
          <div role="status" aria-label="Cargando tipo de cambio" className="grid gap-3 sm:grid-cols-3">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
        ) : error ? (
          <MensajeError mensaje={error} onReintentar={() => setIntento(i => i + 1)} />
        ) : datos ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Dólar · compra" value={formatearColones(datos.dolar.compra.valor)} icon={<DollarSign />} />
            <StatCard label="Dólar · venta" value={formatearColones(datos.dolar.venta.valor)} icon={<DollarSign />} />
            <StatCard
              label="Euro"
              value={formatearColones(datos.euro.colones)}
              icon={<Euro />}
              delta={datos.euro.dolares != null ? { value: `US$ ${datos.euro.dolares}`, label: 'por euro' } : undefined}
            />
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
// b) Buscador CABYS

function BuscadorCabysSeccion() {
  const [termino, setTermino] = useState('');
  const { resultados, cargando, error, buscado } = useBusquedaCabys(termino);
  const sugeridos = useCabysSugeridos();
  const activo = termino.trim().length >= 3;

  return (
    <Card>
      <CardHeader title="Buscador CABYS" description="Catálogo de Bienes y Servicios de Hacienda. Busque por palabra (p. ej. «masaje», «hidroterapia», «ejercicio») o por código de 13 dígitos." />
      <CardBody className="space-y-4">
        <ChipsSugeridos {...sugeridos} seleccionado={termino.trim()} onSelect={s => setTermino(s.codigo)} />
        <Field label="Buscar en el catálogo">
          <Input
            type="search"
            inputMode="search"
            autoComplete="off"
            value={termino}
            onChange={(e: any) => setTermino(e.target.value)}
            placeholder="Palabra o código CABYS"
            leadingIcon={<Search />}
          />
        </Field>

        <p className="sr-only" role="status" aria-live="polite">
          {activo && !cargando ? (error ? error : `${resultados.length} resultados`) : ''}
        </p>

        {!activo ? (
          <p className="text-sm text-fg-muted">Escriba al menos 3 caracteres para buscar.</p>
        ) : cargando ? (
          <div className="space-y-2" aria-hidden="true">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : error ? (
          <MensajeError mensaje={error} />
        ) : resultados.length === 0 ? (
          <EmptyState
            icon={<Search />}
            title={`Sin resultados para «${buscado}»`}
            description="El catálogo usa términos genéricos: pruebe con «masaje», «hidroterapia», «ejercicio» o «nutrición»."
            className="py-8"
          />
        ) : (
          <ul className="divide-y divide-border rounded-control border border-border">
            {resultados.map(r => (
              <li key={r.codigo} className="flex items-start gap-3 px-3 py-3 min-w-0">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-fg">{r.codigo}</span>
                    <Badge tone="info">{etiquetaIva(r.impuesto)}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-fg-muted break-words">{r.descripcion}</p>
                </div>
                <BotonCopiar texto={r.codigo} etiqueta="Código CABYS" />
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
// c) Contribuyente

function BadgeSituacion({ valor, si, no }: { valor: boolean | null; si: string; no: string }) {
  if (valor == null) return null;
  return <Badge tone={valor ? 'danger' : 'success'}>{valor ? si : no}</Badge>;
}

function ContribuyenteSeccion() {
  const [identificacion, setIdentificacion] = useState('');
  const [resultado, setResultado] = useState<ContribuyenteRespuesta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const consultar = async (e: any) => {
    e.preventDefault();
    const id = identificacion.replace(/[\s-]/g, '');
    if (!/^\d{9,12}$/.test(id)) {
      setError('La identificación debe tener de 9 a 12 dígitos, sin letras.');
      setResultado(null);
      return;
    }
    setCargando(true);
    setError(null);
    setResultado(null);
    try {
      setResultado(await pedirJson<ContribuyenteRespuesta>(`/api/hacienda/contribuyente/${encodeURIComponent(id)}`));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  return (
    <Card className="min-w-0">
      <CardHeader title="Consultar contribuyente" description="Nombre, régimen, situación tributaria y actividades económicas inscritas." />
      <CardBody className="space-y-4">
        <form onSubmit={consultar} className="flex flex-col sm:flex-row sm:items-end gap-3" noValidate>
          <Field label="Identificación" hint="Cédula física, jurídica, DIMEX o NITE (sin guiones)." className="flex-1">
            <Input inputMode="numeric" autoComplete="off" maxLength={14} value={identificacion} onChange={(e: any) => setIdentificacion(e.target.value)} placeholder="Ej. 3101123456" />
          </Field>
          <Button type="submit" loading={cargando} icon={<Building2 className="w-4 h-4" aria-hidden="true" />} className="sm:mb-6">Consultar</Button>
        </form>

        {cargando ? (
          <div role="status" aria-label="Consultando contribuyente" className="space-y-2">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : error ? (
          <MensajeError mensaje={error} />
        ) : resultado ? (
          <div className="space-y-4 min-w-0">
            <div className="min-w-0">
              <p className="text-base font-semibold text-fg break-words">{resultado.nombre}</p>
              <p className="text-sm text-fg-muted">
                {resultado.regimen?.descripcion ? `Régimen: ${resultado.regimen.descripcion}` : 'Régimen no indicado'}
                {resultado.situacion?.administracionTributaria ? ` · ${resultado.situacion.administracionTributaria}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {resultado.situacion?.estado && <Badge tone="neutral">{resultado.situacion.estado}</Badge>}
              <BadgeSituacion valor={resultado.situacion?.moroso ?? null} si="Moroso" no="Sin morosidad" />
              <BadgeSituacion valor={resultado.situacion?.omiso ?? null} si="Omiso" no="Sin omisiones" />
            </div>

            <div className="min-w-0">
              <p className="text-xs font-semibold text-fg-muted mb-2">Actividades económicas</p>
              {resultado.actividades.length === 0 ? (
                <p className="text-sm text-fg-muted">No tiene actividades registradas.</p>
              ) : (
                <>
                  {/* Móvil: tarjetas */}
                  <ul className="md:hidden space-y-2">
                    {resultado.actividades.map((a, i) => (
                      <li key={`${a.codigo}-${i}`} className="rounded-control border border-border px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold">{a.codigo}</span>
                          <BadgeEstadoActividad estado={a.estado} />
                        </div>
                        <p className="mt-1 text-sm text-fg-muted break-words">{a.descripcion}</p>
                      </li>
                    ))}
                  </ul>
                  {/* Escritorio: tabla */}
                  <table className="hidden md:table w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-fg-muted border-b border-border">
                        <th scope="col" className="py-2 pr-3 font-semibold">Código</th>
                        <th scope="col" className="py-2 pr-3 font-semibold">Descripción</th>
                        <th scope="col" className="py-2 font-semibold">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {resultado.actividades.map((a, i) => (
                        <tr key={`${a.codigo}-${i}`}>
                          <td className="py-2 pr-3 font-mono align-top">{a.codigo}</td>
                          <td className="py-2 pr-3 break-words">{a.descripcion}</td>
                          <td className="py-2 align-top"><BadgeEstadoActividad estado={a.estado} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

function BadgeEstadoActividad({ estado }: { estado: string | null }) {
  if (!estado) return <Badge tone="neutral">Sin estado</Badge>;
  const activo = estado.toUpperCase() === 'A';
  return <Badge tone={activo ? 'success' : 'neutral'}>{activo ? 'Activa' : estado.toUpperCase() === 'I' ? 'Inactiva' : estado}</Badge>;
}

// ---------------------------------------------------------------------------------------------
// d) Exoneración

function ExoneracionSeccion() {
  const [autorizacion, setAutorizacion] = useState('');
  const [resultado, setResultado] = useState<ExoneracionRespuesta | null>(null);
  const [noEncontrada, setNoEncontrada] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const consultar = async (e: any) => {
    e.preventDefault();
    const a = autorizacion.trim();
    setResultado(null);
    setNoEncontrada(null);
    if (!a) {
      setError('Indique el número de autorización.');
      return;
    }
    setCargando(true);
    setError(null);
    try {
      setResultado(await pedirJson<ExoneracionRespuesta>(`/api/hacienda/exoneracion/${encodeURIComponent(a)}`));
    } catch (err: any) {
      if (err instanceof ErrorApi && err.status === 404) setNoEncontrada(err.message);
      else setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  const filas: Array<[string, string]> = resultado
    ? [
        ['Número de documento', valorONada(resultado.numeroDocumento)],
        ['Identificación', valorONada(resultado.identificacion)],
        ['Porcentaje exonerado', resultado.porcentajeExoneracion == null ? '—' : `${resultado.porcentajeExoneracion}%`],
        ['Tipo de documento', valorONada(resultado.tipoDocumento)],
        ['Institución', valorONada(resultado.nombreInstitucion)],
        ['Emitida', formatearFecha(resultado.fechaEmision)],
        ['Vence', formatearFecha(resultado.fechaVencimiento)],
        ['CABYS autorizados', resultado.cabys.length ? resultado.cabys.join(', ') : '—']
      ]
    : [];
  // Vencida solo cuando terminó su último día (una fecha sola se toma hasta las 23:59 locales).
  const vencida = resultado?.fechaVencimiento
    ? (/^\d{4}-\d{2}-\d{2}$/.test(resultado.fechaVencimiento)
        ? new Date(resultado.fechaVencimiento + 'T23:59:59').getTime()
        : new Date(resultado.fechaVencimiento).getTime()) < Date.now()
    : false;

  return (
    <Card className="min-w-0">
      <CardHeader title="Validar exoneración" description="Verifique en Hacienda una autorización de exoneración de un cliente." />
      <CardBody className="space-y-4">
        <form onSubmit={consultar} className="flex flex-col sm:flex-row sm:items-end gap-3" noValidate>
          <Field label="Número de autorización" hint="Ej. AL-00020402-24" className="flex-1">
            <Input autoComplete="off" maxLength={40} value={autorizacion} onChange={(e: any) => setAutorizacion(e.target.value)} placeholder="Número de autorización" />
          </Field>
          <Button type="submit" loading={cargando} icon={<ShieldCheck className="w-4 h-4" aria-hidden="true" />} className="sm:mb-6">Validar</Button>
        </form>

        {cargando ? (
          <div role="status" aria-label="Validando exoneración" className="space-y-2">
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : error ? (
          <MensajeError mensaje={error} />
        ) : noEncontrada ? (
          <EmptyState icon={<FileSearch />} title="Exoneración no encontrada" description={`${noEncontrada} Revise el número de autorización.`} className="py-8" />
        ) : resultado ? (
          <div className="space-y-3 min-w-0">
            <div className="flex flex-wrap gap-2">
              <Badge tone="success"><BadgeCheck className="w-3.5 h-3.5" aria-hidden="true" />Registrada en Hacienda</Badge>
              {resultado.fechaVencimiento && <Badge tone={vencida ? 'danger' : 'success'}>{vencida ? 'Vencida' : 'Vigente'}</Badge>}
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {filas.map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="text-xs font-semibold text-fg-muted">{k}</dt>
                  <dd className="text-fg break-words">{v}</dd>
                </div>
              ))}
            </dl>
            <details className="text-sm">
              <summary className="cursor-pointer text-fg-muted min-h-10 flex items-center">Ver respuesta completa de Hacienda</summary>
              <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap break-all rounded-control bg-surface-muted p-3 text-xs">{JSON.stringify(resultado.crudo, null, 2)}</pre>
            </details>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
// e) Comprobantes emitidos (Administrador y Contador)

const NOMBRE_AMBIENTE: Record<AmbienteHacienda, string> = {
  SANDBOX: 'Sandbox (pruebas)',
  PRODUCCION: 'Producción',
  PRUEBAS_LOCAL: 'Pruebas locales'
};

function toneEstado(estado: string | null | undefined): BadgeTone {
  const e = String(estado || '').toLowerCase();
  if (e === 'aceptado') return 'success';
  if (e === 'rechazado' || e === 'error') return 'danger';
  if (e === 'procesando' || e === 'recibido') return 'warning';
  return 'neutral';
}

const ETIQUETA_ESTADO: Record<string, string> = {
  aceptado: 'Aceptado',
  rechazado: 'Rechazado',
  procesando: 'Procesando',
  recibido: 'Recibido',
  no_encontrado: 'No encontrado',
  error: 'Error'
};
const etiquetaEstado = (estado: string | null | undefined) => (estado ? ETIQUETA_ESTADO[estado.toLowerCase()] ?? estado : 'Sin estado');

const claveCorta = (clave: string) => (clave.length > 20 ? `${clave.slice(0, 6)}…${clave.slice(-10)}` : clave);

interface EstadoFila {
  cargando: boolean;
  resultado?: EstadoComprobanteRespuesta;
  error?: string;
}

function ComprobantesSeccion() {
  const [offset, setOffset] = useState(0);
  const [datos, setDatos] = useState<ComprobantesRespuesta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ambiente, setAmbiente] = useState<AmbienteHacienda | null>(null);
  const [cargando, setCargando] = useState(true);
  const [intento, setIntento] = useState(0);
  const [estados, setEstados] = useState<Record<string, EstadoFila>>({});

  useEffect(() => {
    const ctrl = new AbortController();
    setCargando(true);
    setError(null);
    pedirJson<ComprobantesRespuesta>(`/api/hacienda/comprobantes?offset=${offset}`, ctrl.signal)
      .then(r => { setDatos(r); setAmbiente(r.ambiente); })
      .catch(err => {
        if (esAbort(err)) return;
        setDatos(null);
        setError(err.message);
        if (err instanceof ErrorApi && err.datos?.ambiente) setAmbiente(err.datos.ambiente);
      })
      .finally(() => { if (!ctrl.signal.aborted) setCargando(false); });
    return () => ctrl.abort();
  }, [offset, intento]);

  const verEstado = async (clave: string) => {
    setEstados(prev => ({ ...prev, [clave]: { cargando: true } }));
    try {
      const r = await pedirJson<EstadoComprobanteRespuesta>(`/api/hacienda/comprobantes/${encodeURIComponent(clave)}`);
      setEstados(prev => ({ ...prev, [clave]: { cargando: false, resultado: r } }));
    } catch (err: any) {
      setEstados(prev => ({ ...prev, [clave]: { cargando: false, error: err.message } }));
    }
  };

  const limit = datos?.limit ?? 0;
  const items = datos?.items ?? [];
  const hayAnterior = offset > 0;
  const haySiguiente = datos ? (datos.total != null ? offset + limit < datos.total : items.length >= limit && limit > 0) : false;
  const rango = items.length > 0 ? `${offset + 1}–${offset + items.length}${datos?.total != null ? ` de ${datos.total}` : ''}` : '';

  const irA = (nuevo: number) => {
    setEstados({});
    setOffset(Math.max(0, nuevo));
  };

  return (
    <Card className="min-w-0">
      <CardHeader
        title="Comprobantes emitidos (Hacienda)"
        description="Lo que Hacienda tiene registrado a nombre de la empresa, cruzado con las facturas del sistema."
        actions={
          <Button variant="outline" size="sm" onClick={() => setIntento(i => i + 1)} loading={cargando} icon={<RefreshCw className="w-4 h-4" aria-hidden="true" />}>
            Actualizar
          </Button>
        }
      >
        {ambiente && (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
            Ambiente activo:
            <Badge tone={ambiente === 'PRODUCCION' ? 'success' : ambiente === 'SANDBOX' ? 'warning' : 'neutral'}>{NOMBRE_AMBIENTE[ambiente] ?? ambiente}</Badge>
            {ambiente === 'SANDBOX' && <span>Los comprobantes de pruebas no tienen efecto fiscal.</span>}
          </p>
        )}
      </CardHeader>
      <CardBody className="space-y-4">
        {cargando ? (
          <div role="status" aria-label="Consultando comprobantes en Hacienda" className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : error ? (
          <MensajeError mensaje={error} onReintentar={() => setIntento(i => i + 1)} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<FileSearch />}
            title={offset > 0 ? 'No hay más comprobantes' : 'Hacienda no tiene comprobantes de la empresa'}
            description={offset > 0 ? 'Vuelva a la página anterior.' : 'Cuando emita facturas electrónicas en este ambiente, aparecerán aquí.'}
          />
        ) : (
          <>
            {/* Móvil y tableta: tarjetas (6 columnas no caben sin scroll horizontal) */}
            <ul className="lg:hidden space-y-3">
              {items.map(c => (
                <li key={c.clave} className="rounded-control border border-border p-3 space-y-2 min-w-0">
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="font-mono text-sm font-semibold truncate" title={c.clave}>{claveCorta(c.clave)}</span>
                    <BotonCopiar texto={c.clave} etiqueta="Clave" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={toneEstado(c.estado)}>{etiquetaEstado(c.estado)}</Badge>
                    <BadgeEnSistema c={c} />
                  </div>
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <div className="min-w-0">
                      <dt className="text-xs text-fg-muted">Fecha</dt>
                      <dd>{formatearFecha(c.fecha, true)}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-xs text-fg-muted">Receptor</dt>
                      <dd className="break-words">{c.receptor || c.local?.receptorNombre || '—'}</dd>
                    </div>
                  </dl>
                  <AccionVerEstado clave={c.clave} fila={estados[c.clave]} onVer={verEstado} />
                </li>
              ))}
            </ul>

            {/* Escritorio: tabla */}
            <div className="hidden lg:block">
              <table className="w-full text-sm table-fixed">
                <thead>
                  <tr className="text-left text-xs text-fg-muted border-b border-border">
                    <th scope="col" className="py-2 pr-3 font-semibold w-[24%]">Clave</th>
                    <th scope="col" className="py-2 pr-3 font-semibold w-[16%]">Fecha</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">Receptor</th>
                    <th scope="col" className="py-2 pr-3 font-semibold w-[12%]">Estado</th>
                    <th scope="col" className="py-2 pr-3 font-semibold w-[16%]">En el sistema</th>
                    <th scope="col" className="py-2 font-semibold w-[18%]"><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map(c => (
                    <tr key={c.clave} className="align-top">
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="font-mono truncate" title={c.clave}>{claveCorta(c.clave)}</span>
                          <BotonCopiar texto={c.clave} etiqueta="Clave" />
                        </div>
                      </td>
                      <td className="py-2 pr-3">{formatearFecha(c.fecha, true)}</td>
                      <td className="py-2 pr-3 break-words">{c.receptor || c.local?.receptorNombre || '—'}</td>
                      <td className="py-2 pr-3"><Badge tone={toneEstado(c.estado)}>{etiquetaEstado(c.estado)}</Badge></td>
                      <td className="py-2 pr-3"><BadgeEnSistema c={c} /></td>
                      <td className="py-2"><AccionVerEstado clave={c.clave} fila={estados[c.clave]} onVer={verEstado} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {(hayAnterior || haySiguiente) && !error && (
          <nav aria-label="Paginación de comprobantes" className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border">
            <span className="text-xs text-fg-muted">{rango}</span>
            <div className="flex gap-2 flex-1 sm:flex-none">
              <Button variant="outline" size="sm" className="flex-1 sm:flex-none" disabled={!hayAnterior || cargando} onClick={() => irA(offset - limit)} icon={<ChevronLeft className="w-4 h-4" aria-hidden="true" />}>
                Anterior
              </Button>
              <Button variant="outline" size="sm" className="flex-1 sm:flex-none" disabled={!haySiguiente || cargando} onClick={() => irA(offset + limit)}>
                Siguiente
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </Button>
            </div>
          </nav>
        )}
      </CardBody>
    </Card>
  );
}

function BadgeEnSistema({ c }: { c: ComprobanteHacienda }) {
  if (!c.local) return <Badge tone="warning">No registrado</Badge>;
  return (
    <Badge tone="success" title={`Consecutivo ${c.local.consecutivo} · ${formatearColones(c.local.total)} · estado local ${c.local.estado}`}>
      <span className="truncate max-w-[10rem]">{c.local.consecutivo}</span>
    </Badge>
  );
}

function AccionVerEstado({ clave, fila, onVer }: { clave: string; fila?: EstadoFila; onVer: (clave: string) => void }) {
  return (
    <div className="space-y-1 min-w-0">
      <Button variant="ghost" size="sm" loading={fila?.cargando} onClick={() => onVer(clave)} className="w-full lg:w-auto">
        Ver estado
      </Button>
      {fila?.resultado && (
        <div className="text-xs space-y-1" role="status">
          <Badge tone={toneEstado(fila.resultado.estado)}>{etiquetaEstado(fila.resultado.estado)}</Badge>
          {fila.resultado.detalleMensaje && <p className="text-fg-muted break-words">{fila.resultado.detalleMensaje}</p>}
        </div>
      )}
      {fila?.error && <p role="alert" className="text-xs text-danger break-words">{fila.error}</p>}
    </div>
  );
}
