import React, { useState, useEffect } from 'react';
import PlantillaDietaManager from './PlantillaDietaManager';
import { Company, CompaniaSmtpConfig, SmtpConfigInput, HaciendaConfig, HaciendaConfigInput, User, HorarioAtencion, HorarioDomicilio, DiaSemana, DEFAULT_HORARIO_ATENCION, Servicio, PorcentajeDieta, PlantillaDieta, PerfilCompania } from '../data/mockData';
import CorreoEntranteSettings from './CorreoEntranteSettings';
import { COSTA_RICA_PROVINCIAS } from '../data/costaRicaLocations';
import { Plus, Check, Settings, Sparkles, Building, Mail, ShieldCheck, Upload, AlertCircle, Users as UsersIcon, UserPlus, Power, Clock, Receipt, Edit, X, Palette, CalendarCheck } from 'lucide-react';
import { notify, confirmar } from './ui/Feedback';
import { baseDesdePrecioConIva, formatearColones, ivaEfectivo, precioConIva } from '../utils/precios';
import { Avatar, Badge, Button, Card, CardBody, CardFooter, CardHeader, CollapsibleSection, EmptyState, Field, IconButton, Input, SegmentedControl, Select, Textarea, cx } from './ui';
import { buttonSizes, buttonVariants } from './ui/Button';

// MySQL devuelve tinyint (0/1) y en memoria boolean; sin dato = reserva automática activa.
const reservaActiva = (v: boolean | number | null | undefined): boolean => (v == null ? true : !!v);

// Contadores de consecutivo que el Administrador puede corregir (ver POST /api/hacienda-config).
const CAMPOS_CONSECUTIVO = [
  { campo: 'ultimoConsecutivo', etiqueta: 'Facturas' },
  { campo: 'ultimoConsecutivoNc', etiqueta: 'Notas de Crédito' },
  { campo: 'ultimoConsecutivoNd', etiqueta: 'Notas de Débito' },
  { campo: 'ultimoConsecutivoTe', etiqueta: 'Tiquetes' }
] as const;

// Numeración mínima por tipo de documento (empresa que viene de otro sistema).
const CAMPOS_NUMERACION_MINIMA = [
  { campo: 'numeracionMinimaFe', etiqueta: 'Facturas' },
  { campo: 'numeracionMinimaNc', etiqueta: 'Notas de Crédito' },
  { campo: 'numeracionMinimaNd', etiqueta: 'Notas de Débito' },
  { campo: 'numeracionMinimaTe', etiqueta: 'Tiquetes' }
] as const;
type CampoMinimo = typeof CAMPOS_NUMERACION_MINIMA[number]['campo'];
const MINIMOS_VACIOS: Record<CampoMinimo, string> = { numeracionMinimaFe: '', numeracionMinimaNc: '', numeracionMinimaNd: '', numeracionMinimaTe: '' };

interface ResultadoPruebaHacienda {
  ok: boolean;
  problemas: string[];
  avisos: string[];
  certificado: { sujeto: string; emisor: string; validoHasta: string; expirado: boolean } | null;
  idp: { ok: boolean; omitido?: boolean; ambiente: string; mensaje?: string; expiraEnSeg?: number | null } | null;
  verificadaEn: string | null;
}

const MAX_TRAMOS_DOMICILIO = 4;
const DIAS_HORARIO: DiaSemana[] = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

function horarioDomicilioVacio(): HorarioDomicilio {
  return { lunes: [], martes: [], miercoles: [], jueves: [], viernes: [], sabado: [], domingo: [] };
}

// Normaliza lo que llega de la empresa (puede ser null o venir incompleto).
function horarioDomicilioDesdeEmpresa(h: HorarioDomicilio | null | undefined): HorarioDomicilio {
  const base = horarioDomicilioVacio();
  if (!h) return base;
  for (const dia of DIAS_HORARIO) base[dia] = (h[dia] || []).map(t => ({ abre: t.abre, cierra: t.cierra }));
  return base;
}

function tramosDesdeHorarioAtencion(horario: HorarioAtencion): HorarioDomicilio {
  const resultado = horarioDomicilioVacio();
  for (const dia of DIAS_HORARIO) {
    const { abre, cierra } = horario[dia];
    if (abre && cierra) resultado[dia] = [{ abre, cierra }];
  }
  return resultado;
}

// Devuelve un mensaje de error por día con tramos inválidos (abre < cierra, sin solapes).
function validarHorarioDomicilio(h: HorarioDomicilio): Partial<Record<DiaSemana, string>> {
  const errores: Partial<Record<DiaSemana, string>> = {};
  for (const dia of DIAS_HORARIO) {
    const tramos = h[dia];
    if (tramos.some(t => !t.abre || !t.cierra)) { errores[dia] = 'Complete la hora de apertura y de cierre de cada tramo.'; continue; }
    if (tramos.some(t => t.abre >= t.cierra)) { errores[dia] = 'La hora de apertura debe ser menor que la de cierre.'; continue; }
    const ordenados = [...tramos].sort((a, b) => (a.abre < b.abre ? -1 : a.abre > b.abre ? 1 : 0));
    for (let i = 1; i < ordenados.length; i++) {
      if (ordenados[i].abre < ordenados[i - 1].cierra) { errores[dia] = 'Los tramos no pueden solaparse.'; break; }
    }
  }
  return errores;
}

// --- Piezas visuales compartidas (solo presentación) ---

type SeccionId = 'empresa' | 'marca' | 'horarios' | 'servicios' | 'usuarios' | 'smtp' | 'correo-entrante' | 'hacienda' | 'reservas' | 'dietas';

const SECCION_PREFIJO = 'cs-';

/** Ancla de una sección del índice lateral. En móvil el título queda bajo el header de la app
 *  (4rem + zona segura superior) y bajo el selector sticky "Ir a la sección" (~3.75rem). */
function Seccion({ id, children }: { id: SeccionId; children: React.ReactNode }) {
  return (
    <section id={`${SECCION_PREFIJO}${id}`} className="scroll-mt-[calc(8.5rem+env(safe-area-inset-top,0px))] lg:scroll-mt-24">
      {children}
    </section>
  );
}

/** Texto corto en móvil y completo desde sm (para que dos botones quepan en una fila a 360px). */
const textoAdaptable = (corto: string, largo: string) => (
  <>
    <span className="sm:hidden">{corto}</span>
    <span className="hidden sm:inline">{largo}</span>
  </>
);

/** Pie de tarjeta de un formulario: en móvil queda fijo abajo, sobre la barra de inicio de iOS
 *  (mismo patrón que el formulario de servicio); desde sm vuelve a ser el pie normal. */
const pieFijoMovil = 'max-sm:sticky max-sm:bottom-0 max-sm:z-10 max-sm:bg-surface-muted! max-sm:pb-[calc(1rem+env(safe-area-inset-bottom,0px))]!';

// --- Secciones plegables: cuáles están abiertas se recuerda por empresa en este navegador ---
const claveSeccionesAbiertas = (idCompania: number) => `cc_config_secciones_abiertas_${idCompania}`;

function leerSeccionesAbiertas(idCompania: number): SeccionId[] {
  try {
    const valor = JSON.parse(localStorage.getItem(claveSeccionesAbiertas(idCompania)) || '[]');
    return Array.isArray(valor) ? valor.filter((s): s is SeccionId => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

// Horas comparables aunque una venga como "08:00:00" y la otra como "08:00".
const hhmm = (h: string | null | undefined) => (h ? h.slice(0, 5) : null);

function mismoHorarioAtencion(a: HorarioAtencion, b: HorarioAtencion): boolean {
  return DIAS_HORARIO.every(d => hhmm(a[d]?.abre) === hhmm(b[d]?.abre) && hhmm(a[d]?.cierra) === hhmm(b[d]?.cierra));
}

function mismoHorarioDomicilio(a: HorarioDomicilio, b: HorarioDomicilio): boolean {
  return DIAS_HORARIO.every(d => a[d].length === b[d].length
    && a[d].every((t, i) => hhmm(t.abre) === hhmm(b[d][i].abre) && hhmm(t.cierra) === hhmm(b[d][i].cierra)));
}

const tituloConIcono = (icono: React.ReactNode, texto: string) => (
  <span className="inline-flex items-center gap-2">
    <span className="text-brand-ink [&_svg]:w-5 [&_svg]:h-5" aria-hidden="true">{icono}</span>
    {texto}
  </span>
);

// Segmentado (opción única) para tipo de servicio y modalidad.
const segmento = (activo: boolean) => cx(
  'min-h-11 px-3 rounded-control border-2 text-sm font-semibold transition-colors',
  activo ? 'border-brand bg-brand-soft text-brand-ink' : 'border-border text-fg-muted hover:bg-surface-muted'
);

const filaCheck = 'flex items-start gap-3 min-h-10 py-1 cursor-pointer text-sm text-fg';
const cajaCheck = 'mt-0.5 w-5 h-5 shrink-0 accent-brand-solid';
interface CompanySettingsProps {
  companies: Company[];
  selectedCompanyId: number;
  onSelectCompany: (id: number) => void;
  onUpdateCompany: (company: Company) => void;
  onAddCompany: (company: Company) => void;
  smtpConfigs: CompaniaSmtpConfig[];
  onUpdateSmtpConfig: (config: SmtpConfigInput) => void;
  users: User[];
  currentUser: User;
  onSaveUser: (user: User) => void;
  servicios: Servicio[];
  onSaveServicio: (servicio: Servicio) => void;
  onCargarServiciosDefecto: (idCompania: number) => Promise<Servicio[]>;
  onAjustarStock: (idServicio: number, nuevoStock: number, notas: string) => Promise<void>;
  porcentajesDieta: PorcentajeDieta[];
  onSavePorcentajeDieta: (porcentaje: PorcentajeDieta) => void;
  onDeletePorcentajeDieta: (id: number) => void;
  plantillasDieta: PlantillaDieta[];
  onSavePlantillaDieta: (plantilla: PlantillaDieta) => void;
  onDeletePlantillaDieta: (id: number) => void;
  /** Empresa de plataforma (lo decide el servidor): no emite comprobantes electrónicos. */
  esCompaniaPlataforma?: boolean;
}

export default function CompanySettings({
  companies,
  selectedCompanyId,
  onSelectCompany,
  onUpdateCompany,
  onAddCompany,
  smtpConfigs,
  onUpdateSmtpConfig,
  users,
  currentUser,
  onSaveUser,
  servicios,
  onSaveServicio,
  onCargarServiciosDefecto,
  onAjustarStock,
  porcentajesDieta,
  onSavePorcentajeDieta,
  onDeletePorcentajeDieta,
  plantillasDieta,
  onSavePlantillaDieta,
  onDeletePlantillaDieta,
  esCompaniaPlataforma = false
}: CompanySettingsProps) {
  const currentCompany = companies.find(c => c.id === selectedCompanyId) || companies[0];

  // Forms for editing/creating
  const [isEditing, setIsEditing] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  // New collaborator ("Usuarios" section) form
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [newUserNombre, setNewUserNombre] = useState('');
  const [newUserUsuario, setNewUserUsuario] = useState('');
  const [newUserCorreo, setNewUserCorreo] = useState('');
  const [newUserContrasena, setNewUserContrasena] = useState('');
  const [newUserRol, setNewUserRol] = useState<'Administrador' | 'Profesional' | 'Contador'>('Profesional');

  const [horario, setHorario] = useState<HorarioAtencion>(currentCompany.horarioAtencion || DEFAULT_HORARIO_ATENCION);
  const [horarioGuardado, setHorarioGuardado] = useState(false);
  const [domicilioActivo, setDomicilioActivo] = useState<boolean>(
    DIAS_HORARIO.some(d => (currentCompany.horarioDomicilio?.[d]?.length ?? 0) > 0)
  );
  const [horarioDom, setHorarioDom] = useState<HorarioDomicilio>(horarioDomicilioDesdeEmpresa(currentCompany.horarioDomicilio));

  // Porcentajes de Déficit/Superávit para Dietas
  const [nuevoPorcentaje, setNuevoPorcentaje] = useState('');
  const porcentajesDeEstaEmpresa = porcentajesDieta.filter(p => p.idCompania === currentCompany.id);

  const handleAgregarPorcentaje = () => {
    const valor = parseFloat(nuevoPorcentaje);
    if (isNaN(valor) || valor < 0 || valor > 100) {
      notify.warning('Ingrese un porcentaje entre 0 y 100.');
      return;
    }
    if (porcentajesDeEstaEmpresa.some(p => Number(p.porcentaje) === valor)) {
      notify.warning('Ese porcentaje ya está en la lista.');
      return;
    }
    onSavePorcentajeDieta({ id: 0, idCompania: currentCompany.id, porcentaje: valor });
    setNuevoPorcentaje('');
  };

  // Servicios / Artículos section (catálogo único — ver tipo TipoServicio en mockData.ts)
  const [isServicioFormOpen, setIsServicioFormOpen] = useState(false);
  const [servicioEditId, setServicioEditId] = useState<number | null>(null);
  const [servicioTipo, setServicioTipo] = useState<'SERVICIO' | 'ARTICULO'>('SERVICIO');
  const [servicioNombre, setServicioNombre] = useState('');
  const [servicioPrecio, setServicioPrecio] = useState('');
  const [servicioPrecioConIva, setServicioPrecioConIva] = useState('');
  const [servicioPrecioEditado, setServicioPrecioEditado] = useState<'base' | 'total'>('base');
  const [servicioIva, setServicioIva] = useState('');
  const [servicioDuracion, setServicioDuracion] = useState('30');
  const [servicioCabys, setServicioCabys] = useState('');
  const [servicioUnidadMedida, setServicioUnidadMedida] = useState<'Sp' | 'Spe' | 'St' | 'Os' | 'h' | 'Unid'>('Sp');
  const [servicioStock, setServicioStock] = useState('0');
  const [servicioStockMinimo, setServicioStockMinimo] = useState('');
  const [servicioCostoUnitario, setServicioCostoUnitario] = useState('');
  const [servicioCodigoBarras, setServicioCodigoBarras] = useState('');
  const [servicioModalidad, setServicioModalidad] = useState<'CONSULTORIO' | 'DOMICILIO' | 'AMBOS'>('AMBOS');
  const [cabysResultados, setCabysResultados] = useState<Array<{ codigo: string; descripcion: string }>>([]);
  const [buscandoCabys, setBuscandoCabys] = useState(false);
  const [cargandoServiciosDefecto, setCargandoServiciosDefecto] = useState(false);
  const [mensajeServiciosDefecto, setMensajeServiciosDefecto] = useState('');
  const [ajustandoStockId, setAjustandoStockId] = useState<number | null>(null);
  const [ajusteStockValor, setAjusteStockValor] = useState('');
  const [ajusteStockNotas, setAjusteStockNotas] = useState('');
  const [ajusteStockGuardando, setAjusteStockGuardando] = useState(false);

  // Índice de secciones: sección resaltada en el índice (solo navegación, no afecta datos).
  const [seccionActiva, setSeccionActiva] = useState<SeccionId>('empresa');
  // Secciones abiertas (todas empiezan cerradas); se recuerdan por empresa en localStorage.
  const [seccionesAbiertas, setSeccionesAbiertas] = useState<SeccionId[]>(() => leerSeccionesAbiertas(selectedCompanyId));
  useEffect(() => {
    setSeccionesAbiertas(leerSeccionesAbiertas(selectedCompanyId));
  }, [selectedCompanyId]);

  useEffect(() => {
    setIsAddingUser(false);
    setNewUserNombre('');
    setNewUserUsuario('');
    setNewUserCorreo('');
    setNewUserContrasena('');
    setNewUserRol('Profesional');
    setHorario(currentCompany.horarioAtencion || DEFAULT_HORARIO_ATENCION);
    setDomicilioActivo(DIAS_HORARIO.some(d => (currentCompany.horarioDomicilio?.[d]?.length ?? 0) > 0));
    setHorarioDom(horarioDomicilioDesdeEmpresa(currentCompany.horarioDomicilio));
    setIsServicioFormOpen(false);
    setMensajeServiciosDefecto('');
  }, [selectedCompanyId]);

  // Edit fields
  const [editName, setEditName] = useState(currentCompany.nombreComercial);
  const [editRazon, setEditRazon] = useState(currentCompany.razonSocial);
  const [editIdent, setEditIdent] = useState(currentCompany.identificacion);
  const [editCorreo, setEditCorreo] = useState(currentCompany.correoEmisor);
  const [editIva, setEditIva] = useState(currentCompany.ivaPorDefecto);
  const [editActividad, setEditActividad] = useState(currentCompany.actividadEconomica || '');
  const [editColorPri, setEditColorPri] = useState(currentCompany.colorPrimario);
  const [editColorSide, setEditColorSide] = useState(currentCompany.colorSidebar);
  const [editLogo, setEditLogo] = useState(currentCompany.logoUrl);
  const [logoError, setLogoError] = useState('');
  const [editPerfil, setEditPerfil] = useState<PerfilCompania>(currentCompany.perfilCompania || 'Ambas');
  const [editRequiereConfirmacion, setEditRequiereConfirmacion] = useState(currentCompany.requiereConfirmacionCitas || false);
  const [editRegimenSimplificado, setEditRegimenSimplificado] = useState(currentCompany.regimenSimplificado || false);
  // MySQL devuelve tinyint (0/1): sin dato = reserva automática activa.
  const [editReservaAutoConsultorio, setEditReservaAutoConsultorio] = useState(reservaActiva(currentCompany.reservaAutoConsultorio));
  const [editReservaAutoDomicilio, setEditReservaAutoDomicilio] = useState(reservaActiva(currentCompany.reservaAutoDomicilio));
  const [editWhatsappReservas, setEditWhatsappReservas] = useState(currentCompany.whatsappReservas || '');
  const [editMensajeWhatsapp, setEditMensajeWhatsapp] = useState(currentCompany.mensajeWhatsappReservas || '');
  const [editPlazoClientes, setEditPlazoClientes] = useState(String(currentCompany.plazoCreditoClientesDias ?? ''));
  const [editPlazoProveedores, setEditPlazoProveedores] = useState(String(currentCompany.plazoCreditoProveedoresDias ?? ''));
  const [editProvincia, setEditProvincia] = useState(currentCompany.provincia || '');
  const [editCanton, setEditCanton] = useState(currentCompany.canton || '');
  const [editDistrito, setEditDistrito] = useState(currentCompany.distrito || '');
  const [editOtrasSenas, setEditOtrasSenas] = useState(currentCompany.otrasSenas || '');

  // Ubicación fiscal: selects en cascada sobre el catálogo oficial DTA (src/data/costaRicaLocations.ts)
  // — Company usa códigos string tal cual (a diferencia de Patient, que codifica IDs numéricos).
  const provinciaSeleccionada = COSTA_RICA_PROVINCIAS.find(p => p.codigo === editProvincia);
  const cantonesDisponiblesCompania = provinciaSeleccionada?.cantones || [];
  const cantonSeleccionado = cantonesDisponiblesCompania.find(c => c.codigo === editCanton);
  const distritosDisponiblesCompania = cantonSeleccionado?.distritos || [];

  const handleCambiarProvinciaFiscal = (codigo: string) => {
    setEditProvincia(codigo);
    setEditCanton('');
    setEditDistrito('');
  };

  const handleCambiarCantonFiscal = (codigo: string) => {
    setEditCanton(codigo);
    setEditDistrito('');
  };

  // --- SMTP Configuration State ---
  const [smtpProveedor, setSmtpProveedor] = useState<CompaniaSmtpConfig['proveedor']>('OTRO');
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpSeguridad, setSmtpSeguridad] = useState<CompaniaSmtpConfig['smtpSeguridad']>('TLS');
  const [smtpUsuario, setSmtpUsuario] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpRemitenteNombre, setSmtpRemitenteNombre] = useState('');
  const [smtpRemitenteCorreo, setSmtpRemitenteCorreo] = useState('');
  const [smtpRecordatorioHoras, setSmtpRecordatorioHoras] = useState(24);
  const [smtpActivo, setSmtpActivo] = useState(false);
  const [smtpProbando, setSmtpProbando] = useState(false);

  // --- Hacienda Digital Signature State ---
  const [haciendaAmbiente, setHaciendaAmbiente] = useState<'SANDBOX' | 'PRODUCCION' | 'PRUEBAS_LOCAL'>('SANDBOX');
  const [haciendaUsuarioAtv, setHaciendaUsuarioAtv] = useState('');
  const [haciendaPasswordAtv, setHaciendaPasswordAtv] = useState('');
  const [haciendaTienePasswordAtv, setHaciendaTienePasswordAtv] = useState(false);
  const [haciendaCertificadoBase64, setHaciendaCertificadoBase64] = useState('');
  const [haciendaCertificadoNombreNuevo, setHaciendaCertificadoNombreNuevo] = useState('');
  const [haciendaCertificadoPin, setHaciendaCertificadoPin] = useState('');
  const [haciendaTieneCertificado, setHaciendaTieneCertificado] = useState(false);
  const [haciendaCertificadoNombreArchivo, setHaciendaCertificadoNombreArchivo] = useState<string | null>(null);
  const [haciendaCertificadoVenceEn, setHaciendaCertificadoVenceEn] = useState<string | null>(null);
  const [haciendaGuardando, setHaciendaGuardando] = useState(false);
  const [haciendaMensaje, setHaciendaMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [haciendaProbando, setHaciendaProbando] = useState(false);
  const [haciendaInfoCertificado, setHaciendaInfoCertificado] = useState<{ sujeto: string; emisor: string; validoHasta: string; expirado: boolean } | null>(null);
  // Último consecutivo ya emitido por tipo, tal como está en el servidor, y lo que el
  // Administrador escriba para corregirlo (vacío = no tocar).
  const [haciendaConsecutivos, setHaciendaConsecutivos] = useState({ ultimoConsecutivo: 0, ultimoConsecutivoNc: 0, ultimoConsecutivoNd: 0, ultimoConsecutivoTe: 0 });
  const [haciendaCorreccion, setHaciendaCorreccion] = useState({ ultimoConsecutivo: '', ultimoConsecutivoNc: '', ultimoConsecutivoNd: '', ultimoConsecutivoTe: '' });
  // Sucursal/terminal del consecutivo, numeración mínima, correo automático y verificación.
  const [haciendaSucursal, setHaciendaSucursal] = useState('');
  const [haciendaTerminal, setHaciendaTerminal] = useState('');
  const [haciendaMinimos, setHaciendaMinimos] = useState<Record<CampoMinimo, string>>(MINIMOS_VACIOS);
  const [haciendaCorreoAutomatico, setHaciendaCorreoAutomatico] = useState(true);
  const [haciendaVerificada, setHaciendaVerificada] = useState<{ ok: boolean; en: string | null }>({ ok: false, en: null });
  const [haciendaPrueba, setHaciendaPrueba] = useState<ResultadoPruebaHacienda | null>(null);
  const [haciendaTextoAjuste, setHaciendaTextoAjuste] = useState('');
  const [haciendaAjustando, setHaciendaAjustando] = useState(false);
  const [smtpTieneContrasena, setSmtpTieneContrasena] = useState(false);
  // Ambiente y usuario ATV tal como están guardados (para detectar cambios sin guardar).
  const [haciendaGuardada, setHaciendaGuardada] = useState<{ ambiente: string; usuarioAtv: string } | null>(null);

  // Sync SMTP fields when company changes
  useEffect(() => {
    const matched = smtpConfigs.find(s => s.idCompania === selectedCompanyId) || {
      id: 0,
      idCompania: selectedCompanyId,
      proveedor: 'OTRO',
      smtpHost: '',
      smtpPort: 587,
      smtpSeguridad: 'TLS',
      smtpUsuario: '',
      smtpPasswordCifrado: '',
      remitenteNombre: '',
      remitenteCorreo: '',
      recordatorioHorasAntes: 24,
      activo: false
    };
    setSmtpProveedor(matched.proveedor);
    setSmtpHost(matched.smtpHost);
    setSmtpPort(matched.smtpPort);
    setSmtpSeguridad(matched.smtpSeguridad);
    setSmtpUsuario(matched.smtpUsuario);
    setSmtpPassword('');
    setSmtpTieneContrasena(!!(matched as CompaniaSmtpConfig).tieneContrasena);
    setSmtpRemitenteNombre(matched.remitenteNombre);
    setSmtpRemitenteCorreo(matched.remitenteCorreo);
    setSmtpRecordatorioHoras(matched.recordatorioHorasAntes);
    setSmtpActivo(matched.activo);
  }, [selectedCompanyId, smtpConfigs]);

  // Sync Hacienda config when company changes
  useEffect(() => {
    setHaciendaMensaje(null);
    setHaciendaInfoCertificado(null);
    setHaciendaCertificadoBase64('');
    setHaciendaCertificadoNombreNuevo('');
    setHaciendaCertificadoPin('');
    setHaciendaPasswordAtv('');
    setHaciendaCorreccion({ ultimoConsecutivo: '', ultimoConsecutivoNc: '', ultimoConsecutivoNd: '', ultimoConsecutivoTe: '' });
    setHaciendaPrueba(null);
    setHaciendaTextoAjuste('');
    fetch(`/api/hacienda-config/${selectedCompanyId}`)
      .then(res => res.json())
      .then((data: HaciendaConfig) => {
        setHaciendaAmbiente(data.ambiente);
        setHaciendaUsuarioAtv(data.usuarioAtv);
        setHaciendaGuardada({ ambiente: data.ambiente, usuarioAtv: data.usuarioAtv });
        setHaciendaTienePasswordAtv(data.tienePasswordAtv);
        setHaciendaTieneCertificado(data.tieneCertificado);
        setHaciendaCertificadoNombreArchivo(data.certificadoNombreArchivo);
        setHaciendaCertificadoVenceEn(data.certificadoVenceEn);
        aplicarConfigHacienda(data);
      })
      .catch(err => console.error('Error cargando configuración de Hacienda:', err));
  }, [selectedCompanyId]);

  const handleSaveSmtp = (e: React.FormEvent) => {
    e.preventDefault();
    const matched = smtpConfigs.find(s => s.idCompania === selectedCompanyId);
    const updatedSmtp: SmtpConfigInput = {
      id: matched ? matched.id : Math.max(...smtpConfigs.map(s => s.id), 0) + 1,
      idCompania: selectedCompanyId,
      proveedor: smtpProveedor,
      smtpHost: smtpHost,
      smtpPort: smtpPort,
      smtpSeguridad: smtpSeguridad,
      smtpUsuario: smtpUsuario,
      ...(smtpPassword.trim() ? { smtpPassword: smtpPassword.trim() } : {}),
      remitenteNombre: smtpRemitenteNombre,
      remitenteCorreo: smtpRemitenteCorreo,
      recordatorioHorasAntes: smtpRecordatorioHoras,
      activo: smtpActivo
    };
    onUpdateSmtpConfig(updatedSmtp);
    notify.success('Configuración de correo y notificaciones guardada.');
  };

  const handleCertificadoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as ArrayBuffer;
      const base64 = btoa(new Uint8Array(result).reduce((data, byte) => data + String.fromCharCode(byte), ''));
      setHaciendaCertificadoBase64(base64);
      setHaciendaCertificadoNombreNuevo(file.name);
    };
    reader.readAsArrayBuffer(file);
  };

  // Numeración, sucursal/terminal, correo automático y verificación tal como los devuelve el servidor.
  const aplicarConfigHacienda = (data: HaciendaConfig) => {
    setHaciendaConsecutivos({ ultimoConsecutivo: data.ultimoConsecutivo || 0, ultimoConsecutivoNc: data.ultimoConsecutivoNc || 0, ultimoConsecutivoNd: data.ultimoConsecutivoNd || 0, ultimoConsecutivoTe: data.ultimoConsecutivoTe || 0 });
    setHaciendaSucursal(data.sucursal || '');
    setHaciendaTerminal(data.terminal || '');
    setHaciendaMinimos({
      numeracionMinimaFe: String(data.numeracionMinimaFe || 0), numeracionMinimaNc: String(data.numeracionMinimaNc || 0),
      numeracionMinimaNd: String(data.numeracionMinimaNd || 0), numeracionMinimaTe: String(data.numeracionMinimaTe || 0)
    });
    setHaciendaCorreoAutomatico(data.correoAutomatico !== false);
    setHaciendaVerificada({ ok: !!data.configVerificada, en: data.configVerificadaEn ?? null });
  };

  // Sube la numeración desde una clave o consecutivo pegado de otro sistema (solo sube).
  const handleAjustarNumeracion = async () => {
    const texto = haciendaTextoAjuste.replace(/[\s-]/g, '');
    if (!/^\d{20}$|^\d{50}$/.test(texto)) {
      notify.error('Pegue una clave de 50 dígitos o un consecutivo de 20 dígitos.');
      return;
    }
    const ok = await confirmar({
      title: '¿Subir la numeración desde este número?',
      message: 'El contador de ese tipo de comprobante queda, como mínimo, en el número pegado; el siguiente comprobante usará ese más uno. No se puede volver a bajar.',
      confirmText: 'Subir numeración',
      tone: 'warning'
    });
    if (!ok) return;
    setHaciendaAjustando(true);
    try {
      const res = await fetch('/api/hacienda-config/ajustar-numeracion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo ajustar la numeración.');
      aplicarConfigHacienda(data.config);
      setHaciendaTextoAjuste('');
      notify.success(`Numeración de ${data.nombre} ajustada: el siguiente será, como mínimo, el ${data.secuencialPegado + 1}.`);
    } catch (err: any) {
      notify.error(err.message);
    } finally {
      setHaciendaAjustando(false);
    }
  };

  const handleSaveHacienda = async (e: React.FormEvent) => {
    e.preventDefault();
    setHaciendaGuardando(true);
    setHaciendaMensaje(null);
    try {
      const payload: HaciendaConfigInput = {
        idCompania: selectedCompanyId,
        ambiente: haciendaAmbiente,
        usuarioAtv: haciendaUsuarioAtv,
        ...(haciendaPasswordAtv.trim() ? { passwordAtv: haciendaPasswordAtv.trim() } : {}),
        ...(haciendaCertificadoBase64 ? { certificadoP12Base64: haciendaCertificadoBase64, certificadoNombreArchivo: haciendaCertificadoNombreNuevo } : {}),
        ...(haciendaCertificadoPin.trim() ? { certificadoPin: haciendaCertificadoPin.trim() } : {}),
        ...(haciendaSucursal.trim() ? { sucursal: haciendaSucursal.trim() } : {}),
        ...(haciendaTerminal.trim() ? { terminal: haciendaTerminal.trim() } : {}),
        correoAutomatico: haciendaCorreoAutomatico,
        ...Object.fromEntries(CAMPOS_NUMERACION_MINIMA
          .filter(({ campo }) => haciendaMinimos[campo].trim() !== '')
          .map(({ campo }) => [campo, Number(haciendaMinimos[campo])])),
        ...Object.fromEntries(CAMPOS_CONSECUTIVO
          .filter(({ campo }) => haciendaCorreccion[campo].trim() !== '')
          .map(({ campo }) => [campo, Number(haciendaCorreccion[campo])]))
      };
      if (haciendaSucursal.trim() && !/^\d{3}$/.test(haciendaSucursal.trim())) throw new Error('La sucursal debe tener exactamente 3 dígitos (ej. 001).');
      if (haciendaTerminal.trim() && !/^\d{5}$/.test(haciendaTerminal.trim())) throw new Error('La terminal debe tener exactamente 5 dígitos (ej. 00001).');
      const correcciones = CAMPOS_CONSECUTIVO.filter(({ campo }) => haciendaCorreccion[campo].trim() !== '');
      if (correcciones.some(({ campo }) => Number(haciendaCorreccion[campo]) < haciendaConsecutivos[campo])) {
        throw new Error('El último consecutivo solo se puede subir: bajarlo volvería a emitir números que Hacienda ya tiene.');
      }
      // Subir la numeración no se puede deshacer: un error de dedo salta números para siempre.
      if (correcciones.length > 0) {
        const ok = await confirmar({
          title: '¿Subir la numeración ante Hacienda?',
          message: `${correcciones.map(({ campo, etiqueta }) => `${etiqueta}: ${haciendaConsecutivos[campo]} → ${Number(haciendaCorreccion[campo])}`).join(' · ')}. El siguiente comprobante usará ese número más uno. No se puede volver a bajar.`,
          confirmText: 'Subir numeración',
          tone: 'warning'
        });
        if (!ok) return;
      }
      const res = await fetch('/api/hacienda-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar la configuración.');
      setHaciendaGuardada({ ambiente: payload.ambiente, usuarioAtv: payload.usuarioAtv });
      setHaciendaTienePasswordAtv(data.tienePasswordAtv);
      setHaciendaTieneCertificado(data.tieneCertificado);
      setHaciendaCertificadoNombreArchivo(data.certificadoNombreArchivo);
      setHaciendaCertificadoVenceEn(data.certificadoVenceEn);
      setHaciendaPasswordAtv('');
      setHaciendaCertificadoBase64('');
      setHaciendaCertificadoNombreNuevo('');
      setHaciendaCertificadoPin('');
      aplicarConfigHacienda(data);
      setHaciendaCorreccion({ ultimoConsecutivo: '', ultimoConsecutivoNc: '', ultimoConsecutivoNd: '', ultimoConsecutivoTe: '' });
      setHaciendaMensaje({ tipo: 'ok', texto: 'Configuración de Hacienda guardada con éxito.' });
    } catch (err: any) {
      setHaciendaMensaje({ tipo: 'error', texto: err.message });
    } finally {
      setHaciendaGuardando(false);
    }
  };

  // Prueba el SMTP guardado: el servidor envía el correo solo al correo del usuario en sesión.
  const handleProbarSmtp = async () => {
    setSmtpProbando(true);
    try {
      const res = await fetch('/api/smtp-configs/probar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idCompania: selectedCompanyId })
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        const destino = Array.isArray(data.accepted) && data.accepted.length > 0 ? data.accepted.join(', ') : 'su correo';
        notify.success(`Correo de prueba enviado a ${destino}.`);
      } else {
        notify.error(data.error || 'No se pudo enviar el correo de prueba.');
      }
    } catch (err: any) {
      notify.error(err.message || 'No se pudo enviar el correo de prueba.');
    } finally {
      setSmtpProbando(false);
    }
  };

  // «Probar configuración»: .p12 + PIN localmente y un inicio de sesión REAL en el IdP de Hacienda
  // con el usuario ATV guardado (no envía comprobantes). Prueba lo GUARDADO, no lo escrito sin guardar.
  const handleProbarCertificado = async () => {
    setHaciendaProbando(true);
    setHaciendaMensaje(null);
    setHaciendaInfoCertificado(null);
    setHaciendaPrueba(null);
    try {
      const res = await fetch('/api/hacienda/probar-configuracion', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo probar la configuración.');
      setHaciendaPrueba(data);
      if (data.certificado) setHaciendaInfoCertificado(data.certificado);
      setHaciendaVerificada({ ok: !!data.ok, en: data.verificadaEn ?? null });
      if (data.ok) notify.success('La configuración de Hacienda funciona: certificado vigente e inicio de sesión correcto.');
    } catch (err: any) {
      setHaciendaMensaje({ tipo: 'error', texto: err.message });
    } finally {
      setHaciendaProbando(false);
    }
  };

  // Trigger state updates when company changes
  const handleSelect = (id: number) => {
    onSelectCompany(id);
    const comp = companies.find(c => c.id === id);
    if (comp) {
      setEditName(comp.nombreComercial);
      setEditRazon(comp.razonSocial);
      setEditIdent(comp.identificacion);
      setEditCorreo(comp.correoEmisor);
      setEditIva(comp.ivaPorDefecto);
      setEditActividad(comp.actividadEconomica || '');
      setEditColorPri(comp.colorPrimario);
      setEditColorSide(comp.colorSidebar);
      setEditLogo(comp.logoUrl);
      setEditPerfil(comp.perfilCompania || 'Ambas');
      setEditRequiereConfirmacion(comp.requiereConfirmacionCitas || false);
      setEditRegimenSimplificado(comp.regimenSimplificado || false);
      setEditReservaAutoConsultorio(reservaActiva(comp.reservaAutoConsultorio));
      setEditReservaAutoDomicilio(reservaActiva(comp.reservaAutoDomicilio));
      setEditWhatsappReservas(comp.whatsappReservas || '');
      setEditMensajeWhatsapp(comp.mensajeWhatsappReservas || '');
      setEditPlazoClientes(String(comp.plazoCreditoClientesDias ?? ''));
      setEditPlazoProveedores(String(comp.plazoCreditoProveedoresDias ?? ''));
      setEditProvincia(comp.provincia || '');
      setEditCanton(comp.canton || '');
      setEditDistrito(comp.distrito || '');
      setEditOtrasSenas(comp.otrasSenas || '');
    }
    setIsEditing(false);
    setIsAdding(false);
  };

  const MAX_LOGO_FILE_BYTES = 2 * 1024 * 1024; // 2MB — el archivo se guarda como data URL en la BD (columna LONGTEXT)

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoError('');
    if (!file.type.startsWith('image/')) {
      setLogoError('Seleccione un archivo de imagen (PNG, JPG, etc.).');
      e.target.value = '';
      return;
    }
    if (file.size > MAX_LOGO_FILE_BYTES) {
      setLogoError('La imagen no puede superar 2MB.');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setEditLogo(reader.result);
    };
    reader.onerror = () => setLogoError('No se pudo leer el archivo.');
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const saveEdit = () => {
    const plazoClientes = Number(editPlazoClientes);
    const plazoProveedores = Number(editPlazoProveedores);
    if (![plazoClientes, plazoProveedores].every(v => Number.isInteger(v) && v > 0)) {
      notify.error('Los plazos de crédito deben ser un número entero de días mayor que cero.');
      return;
    }
    const whatsappLimpio = editWhatsappReservas.replace(/\D/g, '');
    if (whatsappLimpio !== '' && (whatsappLimpio.length < 8 || whatsappLimpio.length > 15)) {
      notify.error('El número de WhatsApp debe tener entre 8 y 15 dígitos.');
      return;
    }
    onUpdateCompany({
      ...currentCompany,
      reservaAutoConsultorio: editReservaAutoConsultorio,
      reservaAutoDomicilio: editReservaAutoDomicilio,
      whatsappReservas: editWhatsappReservas.trim() === '' ? null : editWhatsappReservas.trim(),
      mensajeWhatsappReservas: editMensajeWhatsapp.trim() === '' ? null : editMensajeWhatsapp.trim(),
      nombreComercial: editName,
      razonSocial: editRazon,
      identificacion: editIdent,
      correoEmisor: editCorreo,
      ivaPorDefecto: parseFloat(editIva.toString()),
      actividadEconomica: editActividad,
      colorPrimario: editColorPri,
      colorSidebar: editColorSide,
      logoUrl: editLogo,
      perfilCompania: editPerfil,
      requiereConfirmacionCitas: editRequiereConfirmacion,
      regimenSimplificado: editRegimenSimplificado,
      plazoCreditoClientesDias: plazoClientes,
      plazoCreditoProveedoresDias: plazoProveedores,
      provincia: editProvincia,
      canton: editCanton,
      distrito: editDistrito,
      otrasSenas: editOtrasSenas
    });
    setIsEditing(false);
  };

  const createCompany = () => {
    // `companies` here is pre-filtered to the single active company (see CompanySettings
    // caller in App.tsx), so Math.max() over it previously always produced
    // selectedCompanyId + 1 — an id that routinely already belongs to a different,
    // unrelated company. The server's upsert-by-id logic (POST /api/companies) would then
    // silently overwrite that other company's entire profile instead of inserting a new
    // branch. Date.now() avoids colliding with real sequential DB ids, matching the same
    // placeholder-id pattern already used for new consultations.
    const newId = Date.now();
    const newComp: Company = {
      id: newId,
      nombreComercial: editName || `Nueva Clínica ${newId}`,
      razonSocial: editRazon || "Clínica de Rehabilitación S.A.",
      tipoIdentificacion: "02",
      identificacion: editIdent || "3-101-000000",
      correoEmisor: editCorreo || "info@nuevaclinica.com",
      ivaPorDefecto: parseFloat(editIva.toString()),
      colorPrimario: editColorPri || "#0d9488",
      colorSidebar: editColorSide || "#0f766e",
      logoUrl: editLogo || "https://images.unsplash.com/photo-1516549655169-df83a0774514?w=120&auto=format&fit=crop&q=60",
      actividadEconomica: editActividad || "869001",
      perfilCompania: editPerfil,
      estadoSaas: "PENDIENTE",
      maxUsuarios: 5,
      montoMensual: null,
      proximoVencimiento: null,
      horarioAtencion: DEFAULT_HORARIO_ATENCION,
      requiereConfirmacionCitas: editRequiereConfirmacion,
      regimenSimplificado: editRegimenSimplificado,
      provincia: editProvincia,
      canton: editCanton,
      distrito: editDistrito,
      otrasSenas: editOtrasSenas
    };
    onAddCompany(newComp);
    setIsAdding(false);
    handleSelect(newId);
  };

  const openAddForm = () => {
    setEditName('');
    setEditRazon('');
    setEditIdent('');
    setEditCorreo('');
    setEditIva(4.0);
    setEditActividad('869001');
    setEditRequiereConfirmacion(false);
    setEditProvincia('');
    setEditCanton('');
    setEditDistrito('');
    setEditOtrasSenas('');
    setEditColorPri('#2563eb');
    setEditColorSide('#1e3a8a');
    setEditLogo('https://images.unsplash.com/photo-1516549655169-df83a0774514?w=120&auto=format&fit=crop&q=60');
    setEditPerfil('Ambas');
    setIsAdding(true);
    setIsEditing(false);
  };

  const presetLogos = [
    { name: 'Medicina General', url: 'https://images.unsplash.com/photo-1505751172876-fa1923c5c528?w=120&auto=format&fit=crop&q=60' },
    { name: 'Fisioterapia', url: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=120&auto=format&fit=crop&q=60' },
    { name: 'Cardiología', url: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=120&auto=format&fit=crop&q=60' },
    { name: 'Nutrición Organismo', url: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=120&auto=format&fit=crop&q=60' }
  ];

  const companyUsers = users.filter(u => u.idCompania === currentCompany.id);
  const activeUserCount = companyUsers.filter(u => u.activo).length;
  const userLimitReached = activeUserCount >= currentCompany.maxUsuarios;

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserNombre.trim() || !newUserUsuario.trim() || !newUserCorreo.trim() || !newUserContrasena.trim()) {
      notify.warning('Complete todos los campos del nuevo colaborador.');
      return;
    }
    if (userLimitReached) {
      notify.warning(`Alcanzaste el límite de ${currentCompany.maxUsuarios} usuarios de tu plan. Contacta al administrador de la plataforma para ampliarlo.`);
      return;
    }
    const newUser: User = {
      id: Math.max(0, ...users.map(u => u.id)) + 1,
      idCompania: currentCompany.id,
      nombre: newUserNombre,
      usuario: newUserUsuario,
      correo: newUserCorreo,
      contrasena: newUserContrasena,
      rol: newUserRol,
      activo: true,
      ubicacionDireccion: null,
      ubicacionLat: null,
      ubicacionLng: null,
      maxTiempoTrasladoMinutos: 45
    };
    onSaveUser(newUser);
    setIsAddingUser(false);
    setNewUserNombre('');
    setNewUserUsuario('');
    setNewUserCorreo('');
    setNewUserContrasena('');
    setNewUserRol('Profesional');
  };

  const handleToggleUserActivo = (user: User) => {
    onSaveUser({ ...user, activo: !user.activo });
  };

  const companyServicios = servicios.filter(s => s.idCompania === currentCompany.id);

  // Precio sin IVA y precio con IVA van sincronizados: se recalcula el campo que NO se editó
  // por última vez. `precio` se guarda como la base (hasta 5 decimales).
  const ivaDelFormulario = (ivaTexto: string): number => {
    const parsed = ivaTexto.trim() === '' ? NaN : parseFloat(ivaTexto);
    return ivaEfectivo({ porcentajeIva: Number.isFinite(parsed) ? parsed : null }, currentCompany.ivaPorDefecto);
  };

  const handlePrecioBaseChange = (valor: string) => {
    setServicioPrecio(valor);
    setServicioPrecioEditado('base');
    const base = parseFloat(valor);
    setServicioPrecioConIva(Number.isFinite(base) ? String(precioConIva(base, ivaDelFormulario(servicioIva))) : '');
  };

  const handlePrecioConIvaChange = (valor: string) => {
    setServicioPrecioConIva(valor);
    setServicioPrecioEditado('total');
    const total = parseFloat(valor);
    setServicioPrecio(Number.isFinite(total) ? String(baseDesdePrecioConIva(total, ivaDelFormulario(servicioIva))) : '');
  };

  const handleServicioIvaChange = (valor: string) => {
    setServicioIva(valor);
    const iva = ivaDelFormulario(valor);
    if (servicioPrecioEditado === 'total') {
      const total = parseFloat(servicioPrecioConIva);
      if (Number.isFinite(total)) setServicioPrecio(String(baseDesdePrecioConIva(total, iva)));
    } else {
      const base = parseFloat(servicioPrecio);
      if (Number.isFinite(base)) setServicioPrecioConIva(String(precioConIva(base, iva)));
    }
  };

  const openNewServicioForm = () => {
    setServicioEditId(null);
    setServicioTipo('SERVICIO');
    setServicioNombre('');
    setServicioPrecio('');
    setServicioPrecioConIva('');
    setServicioPrecioEditado('base');
    setServicioIva('');
    setServicioDuracion('30');
    setServicioCabys('');
    setServicioUnidadMedida('Sp');
    setServicioStock('0');
    setServicioStockMinimo('');
    setServicioCostoUnitario('');
    setServicioCodigoBarras('');
    setServicioModalidad('AMBOS');
    setCabysResultados([]);
    setIsServicioFormOpen(true);
  };

  const openEditServicioForm = (s: Servicio) => {
    setServicioEditId(s.id);
    setServicioTipo(s.tipo || 'SERVICIO');
    setServicioNombre(s.nombre);
    setServicioPrecio(String(Number(s.precio)));
    setServicioPrecioConIva(String(precioConIva(s.precio, ivaEfectivo(s, currentCompany.ivaPorDefecto))));
    setServicioPrecioEditado('base');
    setServicioIva(s.porcentajeIva != null ? s.porcentajeIva.toString() : '');
    setServicioDuracion(s.duracionMinutos.toString());
    setServicioCabys(s.codigoCabys || '');
    setServicioUnidadMedida(s.unidadMedida || 'Sp');
    setServicioStock(s.stock != null ? s.stock.toString() : '0');
    setServicioStockMinimo(s.stockMinimo != null ? s.stockMinimo.toString() : '');
    setServicioCostoUnitario(s.costoUnitario != null ? s.costoUnitario.toString() : '');
    setServicioCodigoBarras(s.codigoBarras || '');
    setServicioModalidad(s.modalidad || 'AMBOS');
    setCabysResultados([]);
    setIsServicioFormOpen(true);
  };

  const buscarCabys = (q: string) => {
    if (q.trim().length < 3) {
      setCabysResultados([]);
      return;
    }
    setBuscandoCabys(true);
    fetch(`/api/cabys?q=${encodeURIComponent(q.trim())}`)
      .then(res => res.json())
      .then(data => {
        const lista = Array.isArray(data) ? data : (data?.cabys || []);
        setCabysResultados(lista.slice(0, 8).map((item: any) => ({
          codigo: item.codigo || item.code || '',
          descripcion: item.descripcion || item.description || ''
        })));
      })
      .catch(() => setCabysResultados([]))
      .finally(() => setBuscandoCabys(false));
  };

  const handleSubmitServicio = (e: React.FormEvent) => {
    e.preventDefault();
    const esArticulo = servicioTipo === 'ARTICULO';
    if (!servicioNombre.trim() || !servicioPrecio.trim() || (!esArticulo && !servicioDuracion.trim())) {
      notify.warning(`Complete el nombre, el precio${esArticulo ? '' : ' y la duración'} del ${esArticulo ? 'artículo' : 'servicio'}.`);
      return;
    }
    const precioParsed = parseFloat(servicioPrecio);
    const ivaParsed = servicioIva.trim() === '' ? null : parseFloat(servicioIva);
    const duracionParsed = esArticulo ? 0 : parseInt(servicioDuracion);
    const stockParsed = esArticulo ? parseInt(servicioStock || '0') : null;
    const stockMinimoParsed = esArticulo && servicioStockMinimo.trim() !== '' ? parseInt(servicioStockMinimo) : null;
    const costoParsed = esArticulo && servicioCostoUnitario.trim() !== '' ? parseFloat(servicioCostoUnitario) : null;
    if (
      !Number.isFinite(precioParsed) || (ivaParsed != null && !Number.isFinite(ivaParsed)) || !Number.isFinite(duracionParsed) ||
      (esArticulo && (!Number.isFinite(stockParsed) || (stockParsed as number) < 0)) ||
      (stockMinimoParsed != null && !Number.isFinite(stockMinimoParsed)) ||
      (costoParsed != null && !Number.isFinite(costoParsed))
    ) {
      notify.warning('El precio, el IVA, la duración y los campos de inventario deben ser valores numéricos válidos.');
      return;
    }
    const servicioExistente = servicioEditId != null ? servicios.find(s => s.id === servicioEditId) : undefined;
    const servicio: Servicio = {
      id: servicioEditId ?? Math.max(0, ...servicios.map(s => s.id)) + 1,
      idCompania: currentCompany.id,
      tipo: servicioTipo,
      nombre: servicioNombre.trim(),
      precio: precioParsed,
      porcentajeIva: ivaParsed,
      duracionMinutos: duracionParsed,
      codigoCabys: servicioCabys.trim() || null,
      unidadMedida: servicioUnidadMedida,
      activo: servicioExistente ? servicioExistente.activo : true,
      modalidad: esArticulo ? 'AMBOS' : servicioModalidad,
      // El servidor ignora `stock` al editar un artículo ya existente (solo Ajustar Stock puede
      // cambiarlo) — se manda de todas formas para que la creación de uno nuevo tenga su
      // existencia inicial.
      stock: stockParsed,
      stockMinimo: stockMinimoParsed,
      costoUnitario: costoParsed,
      codigoBarras: esArticulo ? (servicioCodigoBarras.trim() || null) : null
    };
    onSaveServicio(servicio);
    setIsServicioFormOpen(false);
  };

  const handleToggleServicioActivo = (s: Servicio) => {
    onSaveServicio({ ...s, activo: !s.activo });
  };

  const openAjustarStock = (s: Servicio) => {
    setAjustandoStockId(s.id);
    setAjusteStockValor(s.stock != null ? s.stock.toString() : '0');
    setAjusteStockNotas('');
  };

  const handleGuardarAjusteStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (ajustandoStockId == null) return;
    const nuevoStock = parseInt(ajusteStockValor);
    if (!Number.isFinite(nuevoStock) || nuevoStock < 0) {
      notify.warning('La nueva existencia debe ser un número entero mayor o igual a cero.');
      return;
    }
    setAjusteStockGuardando(true);
    try {
      await onAjustarStock(ajustandoStockId, nuevoStock, ajusteStockNotas.trim());
      setAjustandoStockId(null);
    } catch (err: any) {
      notify.error(err.message || 'No se pudo ajustar la existencia.');
    } finally {
      setAjusteStockGuardando(false);
    }
  };

  const handleCargarServiciosDefecto = async () => {
    setCargandoServiciosDefecto(true);
    setMensajeServiciosDefecto('');
    try {
      const agregados = await onCargarServiciosDefecto(currentCompany.id);
      setMensajeServiciosDefecto(
        agregados.length > 0
          ? `Se agregaron ${agregados.length} servicio(s) por defecto.`
          : 'Esta empresa ya tiene todos los servicios por defecto de su colegio profesional.'
      );
    } catch (err: any) {
      setMensajeServiciosDefecto(err.message || 'No se pudieron cargar los servicios por defecto.');
    } finally {
      setCargandoServiciosDefecto(false);
    }
  };

  const diasLabel: Record<keyof HorarioAtencion, string> = {
    lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves',
    viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo'
  };

  // --- Horario de citas a domicilio (tramos fraccionados por día) ---
  const DIAS_ORDEN = Object.keys(diasLabel) as DiaSemana[];

  const handleToggleDomicilio = (activo: boolean) => {
    setDomicilioActivo(activo);
    // Al activarlo por primera vez se precarga con el horario de atención.
    if (activo && DIAS_ORDEN.every(d => horarioDom[d].length === 0)) setHorarioDom(tramosDesdeHorarioAtencion(horario));
  };

  const handleCopiarHorarioAtencion = () => setHorarioDom(tramosDesdeHorarioAtencion(horario));

  const handleAgregarTramo = (dia: DiaSemana) => {
    setHorarioDom(prev => prev[dia].length >= MAX_TRAMOS_DOMICILIO
      ? prev
      : { ...prev, [dia]: [...prev[dia], { abre: '08:00', cierra: '12:00' }] });
  };

  const handleQuitarTramo = (dia: DiaSemana, indice: number) => {
    setHorarioDom(prev => ({ ...prev, [dia]: prev[dia].filter((_, i) => i !== indice) }));
  };

  const handleCambiarTramo = (dia: DiaSemana, indice: number, campo: 'abre' | 'cierra', valor: string) => {
    setHorarioDom(prev => ({ ...prev, [dia]: prev[dia].map((t, i) => i === indice ? { ...t, [campo]: valor } : t) }));
  };

  const erroresDomicilio = domicilioActivo ? validarHorarioDomicilio(horarioDom) : {};
  const hayErroresDomicilio = Object.keys(erroresDomicilio).length > 0;

  const handleGuardarHorario = () => {
    if (hayErroresDomicilio) return;
    const hayTramos = DIAS_ORDEN.some(d => horarioDom[d].length > 0);
    onUpdateCompany({
      ...currentCompany,
      horarioAtencion: horario,
      // Apagado (o sin ningún tramo) = null: se usa el horario de atención.
      horarioDomicilio: domicilioActivo && hayTramos ? horarioDom : null
    });
    setHorarioGuardado(true);
    setTimeout(() => setHorarioGuardado(false), 2500);
  };

  const handleCambiarDia = (dia: keyof HorarioAtencion, campo: 'abre' | 'cierra', valor: string) => {
    setHorario(prev => ({ ...prev, [dia]: { ...prev[dia], [campo]: valor || null } }));
  };

  const handleToggleCerrado = (dia: keyof HorarioAtencion, cerrado: boolean) => {
    setHorario(prev => ({ ...prev, [dia]: cerrado ? { abre: null, cierra: null } : { abre: '08:00', cierra: '18:00' } }));
  };

  // --- Índice de secciones (solo navegación) ---
  const esAdmin = currentUser.rol === 'Administrador';
  // Porcentajes y plantillas de dieta son de nutrición: no aplican a clínicas solo de
  // Fisioterapia, Spa o Legal (mismo criterio que muestraNutricion en App.tsx).
  const muestraDietas = (currentCompany.perfilCompania || 'Ambas') === 'Nutrición' || (currentCompany.perfilCompania || 'Ambas') === 'Ambas';
  const enVista = !isEditing && !isAdding;

  const seccionesNav: Array<{ id: SeccionId; label: string }> = enVista
    ? [
        { id: 'empresa', label: 'Empresa' },
        { id: 'marca', label: 'Marca' },
        ...(esAdmin ? [
          { id: 'horarios' as SeccionId, label: 'Horarios' },
          { id: 'servicios' as SeccionId, label: 'Servicios' },
          { id: 'usuarios' as SeccionId, label: 'Usuarios' }
        ] : []),
        { id: 'smtp', label: 'Correo SMTP' },
        { id: 'correo-entrante', label: 'Correo entrante' },
        { id: 'hacienda', label: 'Hacienda' },
        { id: 'reservas', label: 'Reservas en línea' },
        ...(esAdmin && muestraDietas ? [{ id: 'dietas' as SeccionId, label: 'Dietas' }] : [])
      ]
    : [
        { id: 'empresa', label: 'Empresa' },
        { id: 'marca', label: 'Marca' },
        { id: 'reservas', label: 'Reservas en línea' }
      ];

  // --- Secciones plegables ---
  const cambiarSeccionAbierta = (id: SeccionId, abierta: boolean) => {
    const siguientes = abierta
      ? (seccionesAbiertas.includes(id) ? seccionesAbiertas : [...seccionesAbiertas, id])
      : seccionesAbiertas.filter(s => s !== id);
    setSeccionesAbiertas(siguientes);
    try {
      localStorage.setItem(claveSeccionesAbiertas(selectedCompanyId), JSON.stringify(siguientes));
    } catch {
      // Sin almacenamiento (modo privado lleno, etc.): solo no se recuerda tras recargar.
    }
  };

  // Secciones que no se pueden plegar: edición en curso, cambios sin guardar o un error a la vista.
  const smtpGuardado = smtpConfigs.find(s => s.idCompania === selectedCompanyId);
  const smtpSinGuardar = smtpPassword.trim() !== '' || (smtpGuardado
    ? smtpProveedor !== smtpGuardado.proveedor || smtpHost !== smtpGuardado.smtpHost || String(smtpPort) !== String(smtpGuardado.smtpPort)
      || smtpSeguridad !== smtpGuardado.smtpSeguridad || smtpUsuario !== smtpGuardado.smtpUsuario
      || smtpRemitenteNombre !== smtpGuardado.remitenteNombre || smtpRemitenteCorreo !== smtpGuardado.remitenteCorreo
      || String(smtpRecordatorioHoras) !== String(smtpGuardado.recordatorioHorasAntes) || smtpActivo !== !!smtpGuardado.activo
    : smtpHost !== '' || smtpUsuario !== '' || smtpRemitenteNombre !== '' || smtpRemitenteCorreo !== '' || smtpActivo);
  const horarioDomEfectivo = domicilioActivo && DIAS_ORDEN.some(d => horarioDom[d].length > 0) ? horarioDom : horarioDomicilioVacio();
  const horariosSinGuardar = !mismoHorarioAtencion(horario, currentCompany.horarioAtencion || DEFAULT_HORARIO_ATENCION)
    || !mismoHorarioDomicilio(horarioDomEfectivo, horarioDomicilioDesdeEmpresa(currentCompany.horarioDomicilio));
  const haciendaSinGuardar = haciendaPasswordAtv.trim() !== '' || haciendaCertificadoBase64 !== '' || haciendaCertificadoPin.trim() !== ''
    || CAMPOS_CONSECUTIVO.some(({ campo }) => haciendaCorreccion[campo].trim() !== '')
    || (haciendaGuardada !== null && (haciendaAmbiente !== haciendaGuardada.ambiente || haciendaUsuarioAtv !== haciendaGuardada.usuarioAtv));
  const seccionBloqueada: Partial<Record<SeccionId, boolean>> = {
    horarios: hayErroresDomicilio || horariosSinGuardar,
    servicios: isServicioFormOpen || ajustandoStockId !== null,
    usuarios: isAddingUser,
    smtp: smtpSinGuardar,
    hacienda: haciendaSinGuardar || haciendaGuardando || haciendaMensaje?.tipo === 'error',
    dietas: nuevoPorcentaje.trim() !== ''
  };

  // La empresa de plataforma ve la sección como cualquier otra, pero el servidor le rechaza emitir.
  const avisoPlataformaSinComprobantes = esCompaniaPlataforma ? (
    <p className="p-3 rounded-control bg-info-soft border border-info/20 text-info text-sm flex items-start gap-2" role="note">
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
      <span className="min-w-0">Esta es la empresa de plataforma: es para administración SaaS y demostración, y no emite comprobantes electrónicos ante Hacienda.</span>
    </p>
  ) : null;

  const avisarSeccionBloqueada = () => {
    notify.warning('Guarde o cancele los cambios de esta sección antes de cerrarla.');
  };

  /** Props comunes de una sección plegable de la vista de lectura. */
  const plegable = (id: SeccionId) => ({
    id: `${SECCION_PREFIJO}${id}-plegable`,
    open: seccionesAbiertas.includes(id),
    onOpenChange: (abierta: boolean) => cambiarSeccionAbierta(id, abierta),
    locked: !!seccionBloqueada[id],
    onLockedToggle: avisarSeccionBloqueada
  });

  // El índice abre la sección (si estaba cerrada) y la lleva a la vista.
  const irASeccion = (id: SeccionId) => {
    setSeccionActiva(id);
    if (enVista && !seccionesAbiertas.includes(id)) cambiarSeccionAbierta(id, true);
    requestAnimationFrame(() => {
      const el = document.getElementById(`${SECCION_PREFIJO}${id}`);
      if (!el) return;
      const sinMovimiento = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ behavior: sinMovimiento ? 'auto' : 'smooth', block: 'start' });
    });
  };

  // Resalta en el índice la sección que está a la vista mientras se hace scroll.
  const claveNav = seccionesNav.map(s => s.id).join(',');
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const elementos = claveNav
      .split(',')
      .map(id => document.getElementById(`${SECCION_PREFIJO}${id}`))
      .filter((el): el is HTMLElement => el !== null);
    if (elementos.length === 0) return;
    const observer = new IntersectionObserver(entries => {
      const visible = entries
        .filter(e => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible) setSeccionActiva(visible.target.id.slice(SECCION_PREFIJO.length) as SeccionId);
    }, { rootMargin: '-10% 0px -70% 0px' });
    elementos.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [claveNav, selectedCompanyId]);

  const renderDato = (etiqueta: string, valor: React.ReactNode) => (
    <div className="min-w-0">
      <dt className="text-xs text-fg-muted">{etiqueta}</dt>
      <dd className="text-sm font-medium text-fg break-words">{valor}</dd>
    </div>
  );

  // Selector de color de marca: el valor elegido se sigue mostrando en el propio selector.
  const renderColor = (idCampo: string, etiqueta: string, valor: string, onCambio: (v: string) => void) => (
    <div className="min-w-0">
      <label htmlFor={idCampo} className="block text-xs font-semibold text-fg mb-1.5">{etiqueta}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${etiqueta} (selector de color)`}
          value={valor}
          onChange={(e) => onCambio(e.target.value)}
          className="w-11 h-11 shrink-0 rounded-control cursor-pointer border border-border-strong bg-surface p-1"
        />
        <Input id={idCampo} type="text" value={valor} onChange={(e) => onCambio(e.target.value)} wrapperClassName="flex-1 min-w-0" className="font-mono px-2.5!" />
      </div>
    </div>
  );

  return (
    <div className="max-w-6xl lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8 lg:items-start">
      {/* Índice lateral (escritorio) */}
      <nav aria-label="Secciones de la configuración" className="hidden lg:block lg:sticky lg:top-20">
        <ul className="space-y-0.5">
          {seccionesNav.map(s => {
            const activa = s.id === seccionActiva;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => irASeccion(s.id)}
                  aria-current={activa ? 'true' : undefined}
                  className={cx(
                    'w-full min-h-10 px-3 rounded-control text-left text-sm font-semibold transition-colors',
                    activa ? 'bg-brand-soft text-brand-ink' : 'text-fg-muted hover:bg-surface-muted hover:text-fg'
                  )}
                >
                  {s.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="space-y-6 min-w-0">
        {/* Selector de sección (móvil y tablet): fijo bajo el header de la app al hacer scroll.
            El header mide 4rem + zona segura superior; las anclas compensan con scroll-mt. */}
        <div className="lg:hidden sticky top-[calc(4rem+env(safe-area-inset-top,0px))] z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2 bg-bg/85 backdrop-blur-md border-b border-border flex items-center gap-3 print:hidden">
          <label htmlFor="cs-ir-a" className="shrink-0 text-xs font-semibold text-fg-muted">Ir a la sección</label>
          <Select id="cs-ir-a" value={seccionActiva} onChange={(e) => irASeccion(e.target.value as SeccionId)} wrapperClassName="flex-1 min-w-0">
            {seccionesNav.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </Select>
        </div>

        {/* Empresa activa */}
        <Card>
          <CardBody className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {currentCompany.logoUrl ? (
                  <img
                    src={currentCompany.logoUrl}
                    alt=""
                    className="w-12 h-12 shrink-0 object-cover rounded-control border border-border"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="w-12 h-12 shrink-0 rounded-control bg-brand-soft text-brand-ink flex items-center justify-center" aria-hidden="true">
                    <Building className="w-6 h-6" />
                  </span>
                )}
                <div className="min-w-0">
                  <h3 className="text-heading font-semibold text-fg tracking-tight truncate">{currentCompany.nombreComercial}</h3>
                  <p className="text-sm text-fg-muted truncate">Clínica / empresa activa · {currentCompany.identificacion}</p>
                </div>
              </div>
              {companies.length > 1 && (
                <Button variant="secondary" size="sm" onClick={openAddForm} icon={<Plus className="w-4 h-4" aria-hidden="true" />}>
                  Nueva
                </Button>
              )}
            </div>

            {companies.length > 1 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {companies.map((c) => {
                  const isSelected = c.id === selectedCompanyId;
                  return (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => handleSelect(c.id)}
                      aria-pressed={isSelected}
                      className={cx(
                        'min-h-14 p-3 rounded-card border-2 text-left transition-colors flex items-center justify-between gap-3',
                        isSelected ? 'border-brand bg-brand-soft' : 'border-border hover:border-border-strong bg-surface'
                      )}
                    >
                      <span className="flex items-center gap-3 min-w-0">
                        <img
                          src={c.logoUrl}
                          alt=""
                          className="w-10 h-10 object-cover rounded-control border border-border"
                          referrerPolicy="no-referrer"
                        />
                        <span className="min-w-0">
                          <span className="font-semibold text-sm text-fg block truncate">{c.nombreComercial}</span>
                          <span className="text-xs text-fg-muted block truncate">{c.identificacion}</span>
                        </span>
                      </span>
                      {isSelected && (
                        <span className="w-6 h-6 shrink-0 rounded-full bg-brand-solid text-brand-fg flex items-center justify-center" aria-hidden="true">
                          <Check className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>

        {/* ============ VISTA DE LECTURA + SECCIONES ============ */}
        {enVista && (
          <>
            {/* Empresa */}
            <Seccion id="empresa">
              <CollapsibleSection
                {...plegable('empresa')}
                icon={<Building />}
                title="Empresa"
                description="Datos fiscales y de facturación de la clínica."
                actions={
                  <Button variant="outline" size="sm" onClick={() => setIsEditing(true)} icon={<Settings className="w-4 h-4" aria-hidden="true" />}>
                    Editar
                  </Button>
                }
              >
                <CardBody>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                    {renderDato('Razón social', currentCompany.razonSocial)}
                    {renderDato('Correo de facturas', currentCompany.correoEmisor)}
                    {renderDato('IVA por defecto', `${currentCompany.ivaPorDefecto}%`)}
                    {renderDato('Actividad económica', currentCompany.actividadEconomica || 'No configurada')}
                    {renderDato('Perfil de la clínica', <Badge tone="brand">{currentCompany.perfilCompania || 'Ambas'}</Badge>)}
                    {renderDato('Plazos de crédito', `Clientes ${currentCompany.plazoCreditoClientesDias ?? '—'} días · Proveedores ${currentCompany.plazoCreditoProveedoresDias ?? '—'} días`)}
                  </dl>
                </CardBody>
              </CollapsibleSection>
            </Seccion>

            {/* Marca */}
            <Seccion id="marca">
              <CollapsibleSection
                {...plegable('marca')}
                icon={<Palette />}
                title="Marca"
                description="Logo y colores que identifican a la clínica en la aplicación."
                actions={
                  <Button variant="outline" size="sm" onClick={() => setIsEditing(true)} icon={<Settings className="w-4 h-4" aria-hidden="true" />}>
                    Editar marca
                  </Button>
                }
              >
                <CardBody>
                  <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-4">
                    {renderDato('Logo', currentCompany.logoUrl
                      ? <img src={currentCompany.logoUrl} alt={`Logo de ${currentCompany.nombreComercial}`} className="w-14 h-14 rounded-control object-cover border border-border mt-1" referrerPolicy="no-referrer" />
                      : 'Sin logo')}
                    {renderDato('Color primario', (
                      <span className="inline-flex items-center gap-2">
                        <span className="w-6 h-6 rounded-md border border-border-strong inline-block" style={{ backgroundColor: currentCompany.colorPrimario }} aria-hidden="true" />
                        <span className="font-mono text-xs">{currentCompany.colorPrimario}</span>
                      </span>
                    ))}
                    {renderDato('Color del menú lateral', (
                      <span className="inline-flex items-center gap-2">
                        <span className="w-6 h-6 rounded-md border border-border-strong inline-block" style={{ backgroundColor: currentCompany.colorSidebar }} aria-hidden="true" />
                        <span className="font-mono text-xs">{currentCompany.colorSidebar}</span>
                      </span>
                    ))}
                  </dl>
                </CardBody>
              </CollapsibleSection>
            </Seccion>

            {/* Horarios (solo Administrador) */}
            {esAdmin && (
              <Seccion id="horarios">
                <CollapsibleSection
                  {...plegable('horarios')}
                  icon={<Clock />}
                  title="Horarios"
                  description="Atención y citas a domicilio; se usan para las horas disponibles en la página pública de citas."
                >
                  <CardBody className="space-y-8">
                    <div className="space-y-3">
                      <div>
                        <h4 className="text-sm font-semibold text-fg">Horario de atención</h4>
                        <p className="text-xs text-fg-muted">Horario general de la clínica.</p>
                      </div>
                      {/* Una lista con divisores (no una tarjeta por día) y las horas en una grilla
                          de 2 columnas flexibles: en el iPhone las horas ya no se cortan ("08:00 a."). */}
                      <div className="divide-y divide-border border border-border rounded-control bg-surface">
                        {(Object.keys(diasLabel) as Array<keyof HorarioAtencion>).map(dia => {
                          const cerrado = horario[dia].abre == null;
                          return (
                            <div key={dia} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5">
                              <span className="flex-1 sm:flex-none sm:w-24 text-sm font-semibold text-fg">{diasLabel[dia]}</span>
                              <label className="inline-flex items-center gap-2 min-h-11 text-sm text-fg-muted sm:order-last">
                                <input type="checkbox" checked={cerrado} onChange={(e) => handleToggleCerrado(dia, e.target.checked)} className={cajaCheck.replace('mt-0.5 ', '')} />
                                Cerrado
                              </label>
                              {!cerrado && (
                                <div className="w-full sm:w-auto grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:grid-cols-[8.5rem_auto_8.5rem] items-center gap-2">
                                  <Input
                                    type="time"
                                    aria-label={`${diasLabel[dia]}: hora de apertura`}
                                    value={horario[dia].abre || ''}
                                    onChange={(e) => handleCambiarDia(dia, 'abre', e.target.value)}
                                    className="px-2.5!"
                                  />
                                  <span className="text-sm text-fg-muted" aria-hidden="true">–</span>
                                  <Input
                                    type="time"
                                    aria-label={`${diasLabel[dia]}: hora de cierre`}
                                    value={horario[dia].cierra || ''}
                                    onChange={(e) => handleCambiarDia(dia, 'cierra', e.target.value)}
                                    className="px-2.5!"
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-3 pt-6 border-t border-border">
                      <div>
                        <h4 className="text-sm font-semibold text-fg">Horario de citas a domicilio</h4>
                        <p className="text-xs text-fg-muted">Ej.: 08:00–12:00 y 14:00–18:00. Se usa para las horas disponibles de citas a domicilio en la página pública.</p>
                      </div>

                      <label className={filaCheck}>
                        <input type="checkbox" checked={domicilioActivo} onChange={(e) => handleToggleDomicilio(e.target.checked)} className={cajaCheck} />
                        <span className="font-semibold">Usar un horario distinto para citas a domicilio</span>
                      </label>

                      {domicilioActivo && (
                        <>
                          <div>
                            <Button variant="outline" size="sm" onClick={handleCopiarHorarioAtencion}>
                              Copiar horario de atención
                            </Button>
                          </div>

                          <div className="divide-y divide-border border border-border rounded-control bg-surface">
                            {DIAS_ORDEN.map(dia => {
                              const tramos = horarioDom[dia];
                              const error = erroresDomicilio[dia];
                              return (
                                <div
                                  key={dia}
                                  className={cx('px-3 py-2.5 space-y-2', error && 'bg-danger-soft/40')}
                                >
                                  <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
                                    <span className="sm:w-24 sm:pt-2.5 text-sm font-semibold text-fg">{diasLabel[dia]}</span>
                                    <div className="flex-1 space-y-2">
                                      {tramos.length === 0 && <p className="sm:pt-2.5 text-sm text-fg-muted">Sin atención a domicilio</p>}
                                      {tramos.map((t, i) => (
                                        <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] sm:grid-cols-[8.5rem_auto_8.5rem_auto] items-center gap-2">
                                          <Input
                                            type="time"
                                            value={t.abre}
                                            aria-label={`${diasLabel[dia]} tramo ${i + 1}: abre`}
                                            onChange={(e) => handleCambiarTramo(dia, i, 'abre', e.target.value)}
                                            className="px-2.5!"
                                          />
                                          <span className="text-sm text-fg-muted" aria-hidden="true">–</span>
                                          <Input
                                            type="time"
                                            value={t.cierra}
                                            aria-label={`${diasLabel[dia]} tramo ${i + 1}: cierra`}
                                            onChange={(e) => handleCambiarTramo(dia, i, 'cierra', e.target.value)}
                                            className="px-2.5!"
                                          />
                                          <IconButton
                                            label={`Quitar tramo ${i + 1} de ${diasLabel[dia]}`}
                                            icon={<X className="w-4 h-4" aria-hidden="true" />}
                                            onClick={() => handleQuitarTramo(dia, i)}
                                            className="hover:text-danger! hover:bg-danger-soft!"
                                          />
                                        </div>
                                      ))}
                                      {tramos.length < MAX_TRAMOS_DOMICILIO && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="text-brand-ink!"
                                          onClick={() => handleAgregarTramo(dia)}
                                          icon={<Plus className="w-4 h-4" aria-hidden="true" />}
                                        >
                                          Agregar tramo
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                  {error && <p className="text-sm text-danger font-semibold" role="alert">{error}</p>}
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  </CardBody>
                  <CardFooter>
                    {horarioGuardado && (
                      <span className="mr-auto text-sm text-success font-semibold flex items-center gap-1" role="status">
                        <Check className="w-4 h-4" aria-hidden="true" /> Horario guardado
                      </span>
                    )}
                    {hayErroresDomicilio && <span className="mr-auto text-sm text-danger font-semibold">Corrija los tramos marcados para guardar.</span>}
                    <Button onClick={handleGuardarHorario} disabled={hayErroresDomicilio}>
                      Guardar horarios
                    </Button>
                  </CardFooter>
                </CollapsibleSection>
              </Seccion>
            )}

            {/* Servicios (solo Administrador) */}
            {esAdmin && (
              <Seccion id="servicios">
                <CollapsibleSection
                  {...plegable('servicios')}
                  icon={<Receipt />}
                  title="Servicios y tarifas"
                  description={`Precio e IVA por servicio prestado. Si dejas el IVA en blanco, se usa el ${currentCompany.ivaPorDefecto}% por defecto de la empresa.`}
                  actions={!isServicioFormOpen ? (
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2 w-full [&>*]:w-full sm:[&>*]:w-auto">
                        {currentCompany.perfilCompania !== 'Spa' && currentCompany.perfilCompania !== 'Legal' && (
                          <Button variant="outline" size="sm" onClick={handleCargarServiciosDefecto} loading={cargandoServiciosDefecto}>
                            {cargandoServiciosDefecto ? 'Cargando...' : 'Cargar servicios por defecto'}
                          </Button>
                        )}
                        <Button size="sm" onClick={openNewServicioForm} icon={<Plus className="w-4 h-4" aria-hidden="true" />}>
                          Nuevo servicio o artículo
                        </Button>
                      </div>
                    ) : undefined}
                >
                  <CardBody className="space-y-5">
                    {mensajeServiciosDefecto && (
                      <p className="text-sm text-fg-muted bg-surface-muted rounded-control px-3 py-2" role="status">{mensajeServiciosDefecto}</p>
                    )}

                    {isServicioFormOpen && (
                      <form onSubmit={handleSubmitServicio} className="-mx-4 sm:mx-0 px-4 py-5 sm:p-5 bg-surface-muted/50 border-y sm:border border-border sm:rounded-card space-y-5">
                        <SegmentedControl
                          ariaLabel="Tipo"
                          value={servicioTipo}
                          onChange={(v: 'SERVICIO' | 'ARTICULO') => {
                            // Mismos efectos que los botones anteriores: la unidad acompaña al tipo.
                            setServicioTipo(v);
                            if (v === 'ARTICULO') setServicioUnidadMedida('Unid');
                            else if (servicioUnidadMedida === 'Unid') setServicioUnidadMedida('Sp');
                          }}
                          options={[
                            { value: 'SERVICIO', label: 'Servicio (sesión/cita)' },
                            { value: 'ARTICULO', label: 'Artículo (con existencias)' }
                          ]}
                        />

                        {/* 2 columnas también en el iPhone: precios, IVA y duración caben lado a lado. */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                          <Field label={`Nombre ${servicioTipo === 'ARTICULO' ? 'del artículo' : 'del servicio'}`} required className="col-span-2 lg:col-span-4">
                            <Input
                              type="text"
                              value={servicioNombre}
                              onChange={(e) => setServicioNombre(e.target.value)}
                              placeholder={servicioTipo === 'ARTICULO' ? 'ej: Crema Post-Sesión 250ml' : 'ej: Sesión de Sauna'}
                            />
                          </Field>
                          <Field label="Precio sin IVA (₡)" required>
                            <Input type="number" min="0" step="any" inputMode="decimal" value={servicioPrecio} onChange={(e) => handlePrecioBaseChange(e.target.value)} />
                          </Field>
                          <Field label="Precio con IVA (₡)" hint="Precio final al cliente">
                            <Input type="number" min="0" step="any" inputMode="decimal" value={servicioPrecioConIva} onChange={(e) => handlePrecioConIvaChange(e.target.value)} />
                          </Field>
                          <Field label="% IVA" hint="Vacío = el de la empresa">
                            <Input type="number" min="0" max="100" step="0.01" inputMode="decimal" value={servicioIva} onChange={(e) => handleServicioIvaChange(e.target.value)} placeholder={`${currentCompany.ivaPorDefecto}%`} />
                          </Field>
                          {servicioTipo === 'SERVICIO' && (
                            <Field label="Duración (min)" required>
                              <Input type="number" min="1" step="1" inputMode="numeric" value={servicioDuracion} onChange={(e) => setServicioDuracion(e.target.value)} />
                            </Field>
                          )}
                        </div>

                        {servicioTipo === 'SERVICIO' && (
                          <div>
                            <span id="companyset-modalidad-label" className="block text-xs font-semibold text-fg mb-1.5">Disponible en</span>
                            <SegmentedControl
                              ariaLabelledBy="companyset-modalidad-label"
                              value={servicioModalidad}
                              onChange={(v: 'CONSULTORIO' | 'DOMICILIO' | 'AMBOS') => setServicioModalidad(v)}
                              options={[
                                { value: 'CONSULTORIO', label: 'Consultorio' },
                                { value: 'DOMICILIO', label: 'A domicilio' },
                                { value: 'AMBOS', label: 'Ambos' }
                              ]}
                            />
                          </div>
                        )}

                        {servicioTipo === 'ARTICULO' && (
                          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 pt-5 border-t border-border">
                            <Field
                              label={servicioEditId != null ? 'Existencia actual' : 'Existencia inicial'}
                              hint={servicioEditId != null ? 'Use "Ajustar Stock" en la lista para cambiarla.' : undefined}
                            >
                              <Input type="number" min="0" step="1" inputMode="numeric" value={servicioStock} onChange={(e) => setServicioStock(e.target.value)} disabled={servicioEditId != null} />
                            </Field>
                            <Field label="Stock mínimo">
                              <Input type="number" min="0" step="1" inputMode="numeric" value={servicioStockMinimo} onChange={(e) => setServicioStockMinimo(e.target.value)} placeholder="Alerta de faltante" />
                            </Field>
                            <Field label="Costo unitario (₡)">
                              <Input type="number" min="0" step="0.01" inputMode="decimal" value={servicioCostoUnitario} onChange={(e) => setServicioCostoUnitario(e.target.value)} />
                            </Field>
                            <Field label="Código de barras">
                              <Input type="text" value={servicioCodigoBarras} onChange={(e) => setServicioCodigoBarras(e.target.value)} />
                            </Field>
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 pt-5 border-t border-border">
                          <Field
                            label="Código CABYS"
                            required
                            hint={
                              (servicioCabys && !/^\d{13}$/.test(servicioCabys.trim())) || buscandoCabys ? (
                                <>
                                  {servicioCabys && !/^\d{13}$/.test(servicioCabys.trim()) && (
                                    <span className="block text-warning font-medium">El código CABYS debe tener exactamente 13 dígitos.</span>
                                  )}
                                  {buscandoCabys && <span className="block">Buscando...</span>}
                                </>
                              ) : 'Obligatorio para facturar: 13 dígitos, o busque por nombre.'
                            }
                          >
                            {(p) => (
                              <div className="relative">
                                <Input
                                  {...p}
                                  type="text"
                                  value={servicioCabys}
                                  onChange={(e) => { setServicioCabys(e.target.value); buscarCabys(e.target.value); }}
                                  placeholder="Código o nombre del servicio"
                                />
                                {cabysResultados.length > 0 && (
                                  <div className="absolute z-20 mt-1 w-full max-h-[min(18rem,50vh)] overflow-y-auto overscroll-contain bg-surface border border-border rounded-control shadow-lg">
                                    {cabysResultados.map((r: any) => (
                                      <button
                                        type="button"
                                        key={r.codigo}
                                        onClick={() => { setServicioCabys(r.codigo); setCabysResultados([]); }}
                                        className="w-full min-h-12 text-left px-3.5 py-2.5 text-sm hover:bg-surface-muted border-b border-border last:border-b-0"
                                      >
                                        <span className="flex items-center gap-2 mb-0.5">
                                          <span className="font-mono text-xs text-fg-muted">{r.codigo}</span>
                                          {r.impuesto != null && <Badge tone="neutral">IVA {r.impuesto}%</Badge>}
                                        </span>
                                        <span className="block text-fg break-words">{r.descripcion}</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </Field>
                          <Field label="Unidad de medida (Hacienda)">
                            <Select
                              value={servicioUnidadMedida}
                              onChange={(e) => setServicioUnidadMedida(e.target.value as 'Sp' | 'Spe' | 'St' | 'Os' | 'h' | 'Unid')}
                            >
                              {servicioTipo === 'ARTICULO' ? (
                                <option value="Unid">Unidad</option>
                              ) : (
                                <>
                                  <option value="Sp">Servicios Profesionales</option>
                                  <option value="Spe">Servicios Personales</option>
                                  <option value="St">Servicios Técnicos</option>
                                  <option value="Os">Otros Servicios</option>
                                  <option value="h">Horas</option>
                                </>
                              )}
                            </Select>
                          </Field>
                        </div>

                        {/* En móvil las acciones quedan fijas abajo (sobre la barra de inicio de iOS)
                            para no tener que bajar hasta el final del formulario. */}
                        <div className="sticky bottom-0 z-10 -mx-4 sm:mx-0 px-4 sm:px-0 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:pb-0 bg-surface-muted/95 sm:bg-transparent backdrop-blur-sm sm:backdrop-blur-none border-t border-border sm:border-0 flex gap-2 sm:justify-end [&>*]:flex-1 sm:[&>*]:flex-none">
                          <Button variant="outline" onClick={() => setIsServicioFormOpen(false)}>
                            Cancelar
                          </Button>
                          <Button type="submit">
                            {servicioEditId != null ? 'Guardar cambios' : 'Guardar servicio'}
                          </Button>
                        </div>
                      </form>
                    )}

                    {companyServicios.length === 0 && !isServicioFormOpen && (
                      <EmptyState
                        icon={<Receipt />}
                        title="Todavía no has registrado ningún servicio"
                        description="Agrega los servicios o artículos que facturas para poder usarlos en citas y facturas."
                        className="py-8"
                      />
                    )}

                    {companyServicios.length > 0 && (
                      <ul className="divide-y divide-border border border-border rounded-card overflow-hidden">
                        {companyServicios.map(s => {
                          const esArticulo = s.tipo === 'ARTICULO';
                          const faltante = esArticulo && s.stockMinimo != null && (s.stock || 0) <= s.stockMinimo;
                          return (
                            <li key={s.id} className="p-4 bg-surface">
                              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                                <div className="min-w-0 space-y-1.5">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-semibold text-fg">{s.nombre}</span>
                                    <Badge tone={esArticulo ? 'info' : 'neutral'}>{esArticulo ? 'Artículo' : 'Servicio'}</Badge>
                                    <Badge tone={s.activo ? 'success' : 'neutral'}>{s.activo ? 'Activo' : 'Inactivo'}</Badge>
                                  </div>
                                  <p className="text-sm text-fg-muted">
                                    <span className="font-semibold text-fg">{formatearColones(precioConIva(s.precio, ivaEfectivo(s, currentCompany.ivaPorDefecto)))}</span>
                                    {esArticulo ? ` · Existencia: ${s.stock ?? 0}` : ` · ${s.duracionMinutos} min`}
                                  </p>
                                  <p className="text-xs text-fg-muted">
                                    sin IVA {formatearColones(Number(s.precio))} · IVA {ivaEfectivo(s, currentCompany.ivaPorDefecto)}%{s.porcentajeIva == null ? ' (por defecto)' : ''}
                                  </p>
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {!esArticulo && s.modalidad && s.modalidad !== 'AMBOS' ? (
                                      <Badge tone="info">{s.modalidad === 'DOMICILIO' ? 'A domicilio' : 'Consultorio'}</Badge>
                                    ) : !esArticulo && (
                                      <Badge tone="neutral">Consultorio y domicilio</Badge>
                                    )}
                                    {!s.codigoCabys && (
                                      <Badge tone="warning">Sin código CABYS — no se puede facturar</Badge>
                                    )}
                                    {faltante && (
                                      <Badge tone="danger">Faltante (mín: {s.stockMinimo})</Badge>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  {esArticulo && (
                                    <Button variant="ghost" size="sm" className="text-brand-ink!" onClick={() => openAjustarStock(s)}>
                                      Ajustar stock
                                    </Button>
                                  )}
                                  <IconButton label="Editar" icon={<Edit className="w-4 h-4" aria-hidden="true" />} onClick={() => openEditServicioForm(s)} />
                                  <IconButton
                                    label={s.activo ? 'Desactivar' : 'Activar'}
                                    icon={<Power className="w-4 h-4" aria-hidden="true" />}
                                    onClick={() => handleToggleServicioActivo(s)}
                                  />
                                </div>
                              </div>
                              {ajustandoStockId === s.id && (
                                <form onSubmit={handleGuardarAjusteStock} className="mt-4 pt-4 border-t border-border grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                                  <Field label="Nueva existencia">
                                    <Input type="number" min="0" step="1" inputMode="numeric" value={ajusteStockValor} onChange={(e) => setAjusteStockValor(e.target.value)} />
                                  </Field>
                                  <Field label="Motivo (opcional)" className="sm:col-span-2">
                                    <Input type="text" value={ajusteStockNotas} onChange={(e) => setAjusteStockNotas(e.target.value)} placeholder="ej: Conteo físico, merma, compra" />
                                  </Field>
                                  <div className="flex gap-2">
                                    <Button variant="ghost" onClick={() => setAjustandoStockId(null)}>
                                      Cancelar
                                    </Button>
                                    <Button type="submit" loading={ajusteStockGuardando}>
                                      {ajusteStockGuardando ? 'Guardando…' : 'Guardar'}
                                    </Button>
                                  </div>
                                </form>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </CardBody>
                </CollapsibleSection>
              </Seccion>
            )}

            {/* Usuarios (solo Administrador) */}
            {esAdmin && (
              <Seccion id="usuarios">
                <CollapsibleSection
                  {...plegable('usuarios')}
                  icon={<UsersIcon />}
                  title="Usuarios y colaboradores"
                  description={`${activeUserCount} de ${currentCompany.maxUsuarios} usuarios activos permitidos por tu plan.`}
                  actions={!isAddingUser ? (
                    <Button size="sm" onClick={() => setIsAddingUser(true)} disabled={userLimitReached} icon={<UserPlus className="w-4 h-4" aria-hidden="true" />}>
                      Nuevo colaborador
                    </Button>
                  ) : undefined}
                >
                  <CardBody className="space-y-5">
                    {userLimitReached && !isAddingUser && (
                      <div className="p-3 rounded-control bg-warning-soft border border-warning/25 text-warning text-sm flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                        <span>Alcanzaste el límite de {currentCompany.maxUsuarios} usuarios de tu plan. Contacta al administrador de la plataforma para ampliarlo.</span>
                      </div>
                    )}

                    {isAddingUser && (
                      // En móvil el formulario ocupa el ancho de la tarjeta con divisores (sin tarjeta dentro de tarjeta).
                      <form onSubmit={handleCreateUser} className="-mx-4 sm:mx-0 px-4 py-5 sm:p-5 bg-surface-muted/50 border-y sm:border border-border sm:rounded-card space-y-5">
                        {/* Nombre y correo son largos (ancho completo); usuario y contraseña caben lado a lado. */}
                        <div className="grid grid-cols-2 gap-3 sm:gap-4">
                          <Field label="Nombre completo" required className="col-span-2 sm:col-span-1">
                            <Input type="text" autoComplete="off" value={newUserNombre} onChange={(e) => setNewUserNombre(e.target.value)} />
                          </Field>
                          <Field label="Correo" required className="col-span-2 sm:col-span-1">
                            <Input type="email" inputMode="email" autoComplete="off" value={newUserCorreo} onChange={(e) => setNewUserCorreo(e.target.value)} />
                          </Field>
                          <Field label="Usuario" required>
                            <Input type="text" autoComplete="off" autoCapitalize="none" value={newUserUsuario} onChange={(e) => setNewUserUsuario(e.target.value)} />
                          </Field>
                          <Field label="Contraseña" required>
                            <Input type="password" autoComplete="new-password" value={newUserContrasena} onChange={(e) => setNewUserContrasena(e.target.value)} />
                          </Field>
                        </div>
                        <div>
                          <span id="cs-nuevo-rol-label" className="block text-xs font-semibold text-fg mb-1.5">Rol</span>
                          {/* size sm y "Admin" en móvil: a 360px cada opción mide ~90px y "Administrador" se partía. */}
                          <SegmentedControl
                            ariaLabelledBy="cs-nuevo-rol-label"
                            size="sm"
                            value={newUserRol}
                            onChange={(v: 'Administrador' | 'Profesional' | 'Contador') => setNewUserRol(v)}
                            options={[
                              { value: 'Profesional', label: 'Profesional' },
                              { value: 'Administrador', label: textoAdaptable('Admin', 'Administrador') },
                              { value: 'Contador', label: 'Contador' }
                            ]}
                          />
                          {newUserRol === 'Contador' && (
                            <p className="mt-1.5 text-xs text-fg-muted">Solo lectura en facturación, CxP y reportes fiscales; sin acceso a expedientes ni citas.</p>
                          )}
                        </div>
                        {/* Acciones fijas abajo en móvil (sobre la barra de inicio de iOS), como el formulario de servicio. */}
                        <div className="sticky bottom-0 z-10 -mx-4 sm:mx-0 px-4 sm:px-0 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:pb-0 bg-surface-muted/95 sm:bg-transparent backdrop-blur-sm sm:backdrop-blur-none border-t border-border sm:border-0 flex gap-2 sm:justify-end [&>*]:flex-1 sm:[&>*]:flex-none">
                          <Button variant="outline" onClick={() => setIsAddingUser(false)}>
                            Cancelar
                          </Button>
                          <Button type="submit" disabled={userLimitReached}>
                            {textoAdaptable('Guardar', 'Guardar colaborador')}
                          </Button>
                        </div>
                      </form>
                    )}

                    <ul className="divide-y divide-border border border-border rounded-card overflow-hidden">
                      {companyUsers.map(u => (
                        <li key={u.id} className="flex items-center gap-3 px-3 py-2.5 sm:px-4 sm:py-3 bg-surface">
                          <Avatar name={u.nombre} />
                          <div className="flex-1 min-w-0">
                            <span className="font-semibold text-sm text-fg block truncate" title={u.nombre}>{u.nombre}</span>
                            <span className="text-xs text-fg-muted block truncate" title={u.usuario}>{u.usuario}</span>
                            <span className="mt-1 flex flex-wrap items-center gap-1.5">
                              <Badge tone={u.rol === 'Administrador' ? 'brand' : u.rol === 'Contador' ? 'info' : 'neutral'}>{u.rol}</Badge>
                              <Badge tone={u.activo ? 'success' : 'neutral'}>{u.activo ? 'Activo' : 'Inactivo'}</Badge>
                            </span>
                          </div>
                          <IconButton
                            label={`${u.activo ? 'Desactivar' : 'Activar'} a ${u.nombre}`}
                            icon={<Power className="w-4 h-4" aria-hidden="true" />}
                            onClick={() => handleToggleUserActivo(u)}
                          />
                        </li>
                      ))}
                    </ul>
                  </CardBody>
                </CollapsibleSection>
              </Seccion>
            )}

            {/* Correo SMTP */}
            <Seccion id="smtp">
              <form onSubmit={handleSaveSmtp}>
                <CollapsibleSection
                  {...plegable('smtp')}
                  icon={<Mail />}
                  title="Parámetros SMTP y alertas por correo"
                  description="Configura las credenciales de correo de la clínica para enviar recordatorios y confirmaciones automáticas de citas."
                  badge={<Badge tone={smtpActivo ? 'success' : 'neutral'}>{smtpActivo ? 'Activo' : 'Apagado'}</Badge>}
                >
                  <CardBody className="space-y-5">
                    <label className="flex items-center justify-between gap-4 bg-surface-muted/60 p-4 rounded-control cursor-pointer">
                      <span className="min-w-0">
                        <span className="font-semibold text-sm text-fg block">Notificaciones de agenda activas</span>
                        <span className="text-xs text-fg-muted block mt-0.5">Si se apaga, las citas no enviarán correos automáticos de confirmación, modificación o cancelación.</span>
                      </span>
                      <span className="relative inline-flex shrink-0">
                        <input
                          type="checkbox"
                          role="switch"
                          checked={smtpActivo}
                          onChange={(e) => setSmtpActivo(e.target.checked)}
                          className="sr-only peer"
                        />
                        <span
                          aria-hidden="true"
                          className="w-11 h-6 rounded-full bg-border-strong transition-colors peer-checked:bg-brand-solid peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-(--focus-ring) after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:shadow-xs after:transition-transform peer-checked:after:translate-x-5"
                        />
                      </span>
                    </label>

                    {/* Proveedor y host a ancho completo; puerto y seguridad (cortos) lado a lado también en el iPhone. */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                      <Field label="Proveedor SMTP" className="col-span-2">
                        <Select
                          value={smtpProveedor}
                          onChange={(e) => {
                            const val = e.target.value as CompaniaSmtpConfig['proveedor'];
                            setSmtpProveedor(val);
                            if (val === 'GMAIL') {
                              setSmtpHost('smtp.gmail.com');
                              setSmtpPort(587);
                              setSmtpSeguridad('TLS');
                            } else if (val === 'OUTLOOK') {
                              setSmtpHost('smtp.office365.com');
                              setSmtpPort(587);
                              setSmtpSeguridad('TLS');
                            }
                          }}
                        >
                          <option value="GMAIL">Google (Gmail)</option>
                          <option value="OUTLOOK">Microsoft (Outlook / Office 365)</option>
                          <option value="OTRO">Servidor SMTP Privado (Otro)</option>
                        </Select>
                      </Field>
                      <Field label="Servidor SMTP (host)" required className="col-span-2">
                        <Input type="text" required value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="ej: smtp.mailgun.org" />
                      </Field>
                      <Field label="Puerto" required>
                        <Input type="number" required inputMode="numeric" value={smtpPort} onChange={(e) => setSmtpPort(parseInt(e.target.value))} />
                      </Field>
                      <Field label="Seguridad" hint="Recomendado: TLS">
                        <Select value={smtpSeguridad} onChange={(e) => setSmtpSeguridad(e.target.value as CompaniaSmtpConfig['smtpSeguridad'])}>
                          <option value="TLS">TLS</option>
                          <option value="SSL">SSL</option>
                          <option value="NINGUNA">Ninguna</option>
                        </Select>
                      </Field>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                      <Field label="Usuario SMTP" required>
                        <Input type="text" required autoCapitalize="none" value={smtpUsuario} onChange={(e) => setSmtpUsuario(e.target.value)} placeholder="ej: contacto@miempresa.com" />
                      </Field>
                      <Field
                        label="Contraseña o App Password"
                        required={!smtpTieneContrasena}
                        hint={smtpTieneContrasena ? 'Déjela en blanco para mantener la actual.' : undefined}
                      >
                        <Input
                          type="password"
                          required={!smtpTieneContrasena}
                          value={smtpPassword}
                          onChange={(e) => setSmtpPassword(e.target.value)}
                          placeholder={smtpTieneContrasena ? '••••••••' : 'Contraseña o App Password'}
                        />
                      </Field>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 pt-5 border-t border-border">
                      <Field label="Nombre de remitente" required>
                        <Input type="text" required value={smtpRemitenteNombre} onChange={(e) => setSmtpRemitenteNombre(e.target.value)} placeholder="ej: Clínica FisioNutri" />
                      </Field>
                      <Field label="Correo de remitente" required>
                        <Input type="email" required value={smtpRemitenteCorreo} onChange={(e) => setSmtpRemitenteCorreo(e.target.value)} placeholder="ej: citas@miempresa.com" />
                      </Field>
                      <Field label="Recordatorio automático">
                        <Select value={smtpRecordatorioHoras} onChange={(e) => setSmtpRecordatorioHoras(parseInt(e.target.value))}>
                          <option value={12}>12 horas antes de la cita</option>
                          <option value={24}>24 horas antes de la cita</option>
                          <option value={48}>48 horas antes de la cita</option>
                          <option value={72}>72 horas antes de la cita</option>
                        </Select>
                      </Field>
                    </div>
                  </CardBody>
                  <CardFooter className={pieFijoMovil}>
                    <Button
                      variant="outline"
                      onClick={handleProbarSmtp}
                      disabled={smtpProbando}
                      loading={smtpProbando}
                      icon={<Mail className="w-4 h-4" aria-hidden="true" />}
                    >
                      {textoAdaptable('Enviar prueba', 'Enviar correo de prueba')}
                    </Button>
                    <Button type="submit" icon={<Check className="w-4 h-4" aria-hidden="true" />}>
                      {textoAdaptable('Guardar', 'Guardar configuración SMTP')}
                    </Button>
                  </CardFooter>
                </CollapsibleSection>
              </form>
            </Seccion>

            {/* Correo entrante (la sección decide sola si tiene cambios sin guardar) */}
            <Seccion id="correo-entrante">
              <CorreoEntranteSettings
                themeColor={currentCompany.colorPrimario}
                plegable={{
                  id: `${SECCION_PREFIJO}correo-entrante-plegable`,
                  open: seccionesAbiertas.includes('correo-entrante'),
                  onOpenChange: (abierta: boolean) => cambiarSeccionAbierta('correo-entrante', abierta),
                  onLockedToggle: avisarSeccionBloqueada
                }}
              />
            </Seccion>

            {/* Hacienda — solo Administrador (el servidor también lo exige): credenciales, certificado
                y ambiente deciden qué se declara a Hacienda. */}
            <Seccion id="hacienda">
              {!esAdmin ? (
                <CollapsibleSection
                  {...plegable('hacienda')}
                  icon={<ShieldCheck />}
                  title="Firma digital Hacienda (facturación electrónica)"
                  description="Solo un usuario Administrador puede ver y cambiar esta configuración."
                >
                  <CardBody className="space-y-4">
                    {avisoPlataformaSinComprobantes}
                    <p className="text-sm text-fg-muted">
                      La configuración de Hacienda (credenciales ATV, firma digital y ambiente) solo la puede ver y cambiar un usuario Administrador.
                    </p>
                  </CardBody>
                </CollapsibleSection>
              ) : (
                <form onSubmit={handleSaveHacienda}>
                  <CollapsibleSection
                    {...plegable('hacienda')}
                    icon={<ShieldCheck />}
                    title="Firma digital Hacienda (facturación electrónica)"
                    description="Certificado criptográfico (.p12) y credenciales ATV para firmar comprobantes electrónicos."
                    badge={haciendaVerificada.ok
                      ? <Badge tone="success">Configuración verificada</Badge>
                      : <Badge tone={haciendaTieneCertificado ? 'neutral' : 'warning'}>{haciendaTieneCertificado ? 'Sin verificar' : 'Sin certificado'}</Badge>}
                  >
                    <CardBody className="space-y-5">
                      {avisoPlataformaSinComprobantes}
                      {haciendaMensaje && (
                        <div
                          role={haciendaMensaje.tipo === 'error' ? 'alert' : 'status'}
                          className={cx(
                            'p-3 rounded-control border text-sm flex items-start gap-2',
                            haciendaMensaje.tipo === 'ok' ? 'bg-success-soft border-success/20 text-success' : 'bg-danger-soft border-danger/20 text-danger'
                          )}
                        >
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                          <span className="min-w-0 break-words">{haciendaMensaje.texto}</span>
                        </div>
                      )}

                      {haciendaInfoCertificado && (
                        // Sujeto y emisor son nombres X.500 largos sin espacios útiles: se parten donde haga falta.
                        <dl className="p-4 rounded-control bg-surface-muted/60 text-sm space-y-1 [overflow-wrap:anywhere]">
                          <div><dt className="inline font-semibold text-fg-muted">Sujeto: </dt><dd className="inline text-fg">{haciendaInfoCertificado.sujeto}</dd></div>
                          <div><dt className="inline font-semibold text-fg-muted">Emisor: </dt><dd className="inline text-fg">{haciendaInfoCertificado.emisor}</dd></div>
                          <div><dt className="inline font-semibold text-fg-muted">Vence: </dt><dd className="inline text-fg">{new Date(haciendaInfoCertificado.validoHasta).toLocaleDateString('es-CR')}</dd></div>
                          {haciendaInfoCertificado.expirado && <div className="text-danger font-semibold">Este certificado está VENCIDO.</div>}
                        </dl>
                      )}

                      {haciendaPrueba && (
                        <div
                          role={haciendaPrueba.ok ? 'status' : 'alert'}
                          className={cx('p-3 rounded-control border text-sm space-y-1 [overflow-wrap:anywhere]',
                            haciendaPrueba.ok ? 'bg-success-soft border-success/20 text-success' : 'bg-danger-soft border-danger/20 text-danger')}
                        >
                          <p className="font-semibold">{haciendaPrueba.ok ? 'Configuración verificada' : 'La configuración tiene problemas'}</p>
                          {haciendaPrueba.idp && (
                            <p>
                              Inicio de sesión en Hacienda ({haciendaPrueba.idp.ambiente}): {haciendaPrueba.idp.omitido ? haciendaPrueba.idp.mensaje : haciendaPrueba.idp.ok ? 'correcto' : `falló — ${haciendaPrueba.idp.mensaje}`}
                            </p>
                          )}
                          {haciendaPrueba.problemas.length > 0 && (
                            <ul className="list-disc pl-5 space-y-0.5">{haciendaPrueba.problemas.map((p, i) => <li key={i}>{p}</li>)}</ul>
                          )}
                          {haciendaPrueba.avisos.length > 0 && (
                            <ul className="list-disc pl-5 space-y-0.5 text-warning">{haciendaPrueba.avisos.map((p, i) => <li key={i}>{p}</li>)}</ul>
                          )}
                        </div>
                      )}
                      {!haciendaPrueba && haciendaVerificada.ok && haciendaVerificada.en && (
                        <p className="text-xs text-success">Verificada el {new Date(haciendaVerificada.en).toLocaleString('es-CR')}.</p>
                      )}

                      <div>
                        <span id="cs-hacienda-ambiente-label" className="block text-xs font-semibold text-fg mb-1.5">Ambiente</span>
                        {/* size sm: a 360px cada opción mide ~90px y "Producción" no cabía en text-sm. */}
                        <SegmentedControl
                          ariaLabelledBy="cs-hacienda-ambiente-label"
                          size="sm"
                          value={haciendaAmbiente}
                          onChange={(v: 'SANDBOX' | 'PRODUCCION' | 'PRUEBAS_LOCAL') => setHaciendaAmbiente(v)}
                          options={[
                            { value: 'PRUEBAS_LOCAL', label: 'Pruebas locales' },
                            { value: 'SANDBOX', label: 'Sandbox' },
                            { value: 'PRODUCCION', label: 'Producción' }
                          ]}
                        />
                        <p className="mt-1.5 text-xs text-fg-muted" aria-live="polite">
                          {haciendaAmbiente === 'PRUEBAS_LOCAL'
                            ? 'No envía nada a Hacienda.'
                            : haciendaAmbiente === 'SANDBOX'
                            ? 'Pruebas de Hacienda: envía tráfico real al ambiente de pruebas.'
                            : 'Envía los comprobantes reales a Hacienda.'}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                        <Field label="Usuario ATV">
                          <Input type="text" autoCapitalize="none" value={haciendaUsuarioAtv} onChange={(e) => setHaciendaUsuarioAtv(e.target.value)} placeholder="ej: cpf-01-1234-5678" />
                        </Field>
                        <Field label="Contraseña ATV" hint={haciendaTienePasswordAtv ? 'Déjela en blanco para mantener la actual.' : undefined}>
                          <Input
                            type="password"
                            value={haciendaPasswordAtv}
                            onChange={(e) => setHaciendaPasswordAtv(e.target.value)}
                            placeholder={haciendaTienePasswordAtv ? '••••••••' : 'Contraseña ATV'}
                          />
                        </Field>
                        <Field
                          label={<span className="inline-flex items-center gap-1.5"><Upload className="w-3.5 h-3.5" aria-hidden="true" /> Certificado (.p12)</span>}
                          hint={
                            <span className="[overflow-wrap:anywhere]">
                              {haciendaCertificadoNombreNuevo
                                ? `Nuevo archivo seleccionado: ${haciendaCertificadoNombreNuevo}`
                                : haciendaTieneCertificado
                                ? `Archivo actual: ${haciendaCertificadoNombreArchivo || 'certificado.p12'}${haciendaCertificadoVenceEn ? ` · vence ${haciendaCertificadoVenceEn}` : ''}`
                                : 'Ningún certificado configurado todavía.'}
                            </span>
                          }
                        >
                          {(p) => (
                            <input
                              id={p.id}
                              aria-describedby={p['aria-describedby']}
                              type="file"
                              accept=".p12,.pfx"
                              onChange={handleCertificadoFileChange}
                              className="w-full max-w-full min-w-0 min-h-11 bg-surface border border-border-strong rounded-control text-sm text-fg-muted file:mr-3 file:min-h-11 file:px-4 file:border-0 file:border-r file:border-border-strong file:bg-surface-muted file:text-fg file:font-semibold file:cursor-pointer"
                            />
                          )}
                        </Field>
                        <Field label="PIN del certificado" hint={haciendaTieneCertificado ? 'Déjelo en blanco para mantener el actual.' : undefined}>
                          <Input
                            type="password"
                            value={haciendaCertificadoPin}
                            onChange={(e) => setHaciendaCertificadoPin(e.target.value)}
                            placeholder={haciendaTieneCertificado ? '••••••••' : 'PIN del .p12'}
                          />
                        </Field>
                      </div>

                      {/* Divisor en lugar de un recuadro: evita una tarjeta dentro de la tarjeta en móvil. */}
                      <div className="pt-5 border-t border-border space-y-4">
                        <fieldset className="min-w-0 space-y-3">
                          <legend className="text-sm font-semibold text-fg">Numeración y envío</legend>
                          <div className="grid grid-cols-2 gap-3 sm:gap-4">
                            <Field label="Sucursal" hint="3 dígitos (ej. 001)">
                              <Input inputMode="numeric" maxLength={3} value={haciendaSucursal} placeholder="001" onChange={(e) => setHaciendaSucursal(e.target.value.replace(/\D/g, ''))} />
                            </Field>
                            <Field label="Terminal" hint="5 dígitos (ej. 00001)">
                              <Input inputMode="numeric" maxLength={5} value={haciendaTerminal} placeholder="00001" onChange={(e) => setHaciendaTerminal(e.target.value.replace(/\D/g, ''))} />
                            </Field>
                          </div>
                          <label className="flex items-start gap-3 min-h-11 cursor-pointer text-sm text-fg">
                            <input type="checkbox" className="mt-0.5 w-4 h-4" checked={haciendaCorreoAutomatico} onChange={(e) => setHaciendaCorreoAutomatico(e.target.checked)} />
                            <span>
                              Enviar el comprobante por correo automáticamente cuando Hacienda lo acepte
                              <span className="block text-xs text-fg-muted">Va al receptor (el paciente o el tercero facturado) con el PDF, el XML firmado y la respuesta de Hacienda. Requiere el correo SMTP activo.</span>
                            </span>
                          </label>
                        </fieldset>

                        <fieldset className="min-w-0 space-y-3">
                          <legend className="text-sm font-semibold text-fg">Numeración mínima</legend>
                          <p className="text-xs text-fg-muted">
                            Si la clínica viene de otro sistema con la misma sucursal y terminal, indique el último número que ya usó allá: el siguiente comprobante de ese tipo usará ese más uno.
                          </p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                            {CAMPOS_NUMERACION_MINIMA.map(({ campo, etiqueta }) => (
                              <Field key={campo} label={etiqueta}>
                                <Input type="number" min="0" step="1" inputMode="numeric" value={haciendaMinimos[campo]}
                                  onChange={(e) => setHaciendaMinimos(prev => ({ ...prev, [campo]: e.target.value }))} />
                              </Field>
                            ))}
                          </div>
                          <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                            <Field label="Ajustar desde una clave o consecutivo de otro sistema" hint="Pegue la clave de 50 dígitos o el consecutivo de 20 del último comprobante emitido allá. Solo sube la numeración." className="flex-1">
                              <Input inputMode="numeric" value={haciendaTextoAjuste} onChange={(e) => setHaciendaTextoAjuste(e.target.value)} placeholder="506…" />
                            </Field>
                            <Button variant="outline" onClick={handleAjustarNumeracion} loading={haciendaAjustando} disabled={haciendaAjustando || !haciendaTextoAjuste.trim()}>
                              Ajustar
                            </Button>
                          </div>
                        </fieldset>
                      </div>

                      {currentUser.rol === 'Administrador' && (
                        // Divisor en lugar de un recuadro: evita una tarjeta dentro de la tarjeta en móvil.
                        <div className="pt-5 border-t border-border">
                          <fieldset className="min-w-0 space-y-3">
                            <legend className="text-sm font-semibold text-fg">Corrección de numeración</legend>
                            <p className="text-xs text-fg-muted">
                              Úselo solo si Hacienda rechaza con «el documento ya fue emitido» porque esta empresa ya facturó con otro sistema.
                              Escriba el último número que ya emitió ante Hacienda; el siguiente comprobante usará ese más uno. Solo se puede subir.
                            </p>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                              {CAMPOS_CONSECUTIVO.map(({ campo, etiqueta }) => (
                                <Field key={campo} label={etiqueta} hint={`Último emitido: ${haciendaConsecutivos[campo]}`}>
                                  <Input
                                    type="number" min={haciendaConsecutivos[campo]} step="1" inputMode="numeric"
                                    value={haciendaCorreccion[campo]}
                                    onChange={(e) => setHaciendaCorreccion(prev => ({ ...prev, [campo]: e.target.value }))}
                                    placeholder="Sin cambio"
                                  />
                                </Field>
                              ))}
                            </div>
                          </fieldset>
                        </div>
                      )}
                    </CardBody>
                    <CardFooter className={cx('justify-between', pieFijoMovil)}>
                      <Button
                        variant="outline"
                        onClick={handleProbarCertificado}
                        disabled={haciendaProbando}
                        loading={haciendaProbando}
                        icon={<ShieldCheck className="w-4 h-4" aria-hidden="true" />}
                      >
                        {haciendaProbando ? 'Probando...' : textoAdaptable('Probar', 'Probar configuración')}
                      </Button>
                      <Button type="submit" loading={haciendaGuardando} icon={<Check className="w-4 h-4" aria-hidden="true" />}>
                        {haciendaGuardando ? 'Guardando...' : textoAdaptable('Guardar', 'Guardar configuración Hacienda')}
                      </Button>
                    </CardFooter>
                  </CollapsibleSection>
                </form>
              )}
            </Seccion>

            {/* Reservas en línea (lectura; se edita junto con los datos de la empresa) */}
            <Seccion id="reservas">
              <CollapsibleSection
                {...plegable('reservas')}
                icon={<CalendarCheck />}
                title="Reservas en línea"
                description="Cómo se confirman las citas que los pacientes reservan desde la página pública."
                actions={
                  <Button variant="outline" size="sm" onClick={() => setIsEditing(true)} icon={<Settings className="w-4 h-4" aria-hidden="true" />}>
                    Editar
                  </Button>
                }
              >
                <CardBody>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                    {renderDato('Citas en línea', currentCompany.requiereConfirmacionCitas ? 'Requieren confirmación manual' : 'Se auto-confirman')}
                    {renderDato('Reserva automática en consultorio', (
                      <Badge tone={reservaActiva(currentCompany.reservaAutoConsultorio) ? 'success' : 'neutral'}>
                        {reservaActiva(currentCompany.reservaAutoConsultorio) ? 'Activa' : 'Apagada'}
                      </Badge>
                    ))}
                    {renderDato('Reserva automática a domicilio', (
                      <Badge tone={reservaActiva(currentCompany.reservaAutoDomicilio) ? 'success' : 'neutral'}>
                        {reservaActiva(currentCompany.reservaAutoDomicilio) ? 'Activa' : 'Apagada'}
                      </Badge>
                    ))}
                    {renderDato('WhatsApp para solicitudes', currentCompany.whatsappReservas || 'No configurado')}
                  </dl>
                </CardBody>
              </CollapsibleSection>
            </Seccion>

            {/* Dietas (solo Administrador y perfiles con nutrición) */}
            {esAdmin && muestraDietas && (
              <Seccion id="dietas">
                <CollapsibleSection
                  {...plegable('dietas')}
                  icon={<Sparkles />}
                  title="Dietas"
                  description="Porcentajes de déficit/superávit y plantillas de dieta de los nutricionistas."
                >
                {/* Dos bloques propios (porcentajes y plantillas) sobre fondo atenuado dentro de la sección. */}
                <div className="p-3 sm:p-6 space-y-6 bg-surface-muted/40 rounded-b-card">
                  <Card>
                    <CardHeader
                      title={tituloConIcono(<Sparkles />, 'Porcentajes de déficit/superávit para dietas')}
                      description="Los nutricionistas de esta empresa eligen entre estos porcentajes al calcular la prescripción calórica de una dieta. Puede incluir 0% (mantenimiento)."
                    />
                    <CardBody className="space-y-4">
                      <ul className="flex flex-wrap gap-2">
                        {porcentajesDeEstaEmpresa.length === 0 && (
                          <li className="text-sm text-fg-muted">Sin porcentajes configurados — se usará el respaldo 10% / 15% / 20%.</li>
                        )}
                        {porcentajesDeEstaEmpresa.map(p => (
                          <li key={p.id} className="flex items-center gap-1 bg-surface-muted border border-border rounded-full pl-4 pr-1 text-sm font-semibold text-fg">
                            {Number(p.porcentaje)}%
                            <IconButton
                              label={`Eliminar ${Number(p.porcentaje)}%`}
                              icon={<X className="w-3.5 h-3.5" aria-hidden="true" />}
                              onClick={() => onDeletePorcentajeDieta(p.id)}
                              className="rounded-full hover:text-danger! hover:bg-danger-soft!"
                            />
                          </li>
                        ))}
                      </ul>

                      <div className="flex flex-wrap items-end gap-2">
                        <Field label="Nuevo porcentaje" className="w-36">
                          <Input
                            type="number"
                            min={0}
                            step="0.5"
                            inputMode="decimal"
                            value={nuevoPorcentaje}
                            onChange={(e) => setNuevoPorcentaje(e.target.value)}
                            placeholder="ej: 25"
                          />
                        </Field>
                        <Button onClick={handleAgregarPorcentaje} icon={<Plus className="w-4 h-4" aria-hidden="true" />}>
                          Agregar
                        </Button>
                      </div>
                    </CardBody>
                  </Card>

                  <PlantillaDietaManager
                    idCompania={currentCompany.id}
                    plantillasDieta={plantillasDieta}
                    onSavePlantillaDieta={onSavePlantillaDieta}
                    onDeletePlantillaDieta={onDeletePlantillaDieta}
                    themeColor={currentCompany.colorPrimario}
                  />
                </div>
                </CollapsibleSection>
              </Seccion>
            )}
          </>
        )}

        {/* ============ FORMULARIO DE EDICIÓN / ALTA ============ */}
        {!enVista && (
          <>
            <Seccion id="empresa">
              <Card>
                <CardHeader
                  title={tituloConIcono(<Building />, isAdding ? 'Registrar nueva sucursal / clínica' : 'Datos de la empresa')}
                  description="Los cambios de empresa, marca y reservas en línea se guardan juntos con el botón del final."
                />
                <CardBody className="space-y-5">
                  {/* Textos largos a ancho completo; actividad económica e IVA (cortos) lado a lado en el iPhone. */}
                  <div className="grid grid-cols-2 gap-3 sm:gap-4">
                    <Field label="Nombre comercial" className="col-span-2 sm:col-span-1">
                      <Input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} />
                    </Field>
                    <Field label="Razón social" className="col-span-2 sm:col-span-1">
                      <Input type="text" value={editRazon} onChange={(e) => setEditRazon(e.target.value)} />
                    </Field>
                    <Field label="Cédula física o jurídica" className="col-span-2 sm:col-span-1">
                      <Input type="text" value={editIdent} onChange={(e) => setEditIdent(e.target.value)} placeholder="ej: 3-101-234567" />
                    </Field>
                    <Field label="Correo emisor" hint="El que figura ante Hacienda." className="col-span-2 sm:col-span-1">
                      <Input type="text" inputMode="email" autoCapitalize="none" value={editCorreo} onChange={(e) => setEditCorreo(e.target.value)} />
                    </Field>
                    <Field label="Perfil de la clínica" className="col-span-2 sm:col-span-1">
                      <Select value={editPerfil} onChange={(e) => setEditPerfil(e.target.value as PerfilCompania)}>
                        <option value="Ambas">Ambas (Fisioterapia y Nutrición)</option>
                        <option value="Fisioterapia">Sólo Fisioterapia</option>
                        <option value="Nutrición">Sólo Nutrición</option>
                        <option value="Spa">Spa / Bienestar (Sauna, Cold Plunge, Masajes...)</option>
                        <option value="Legal">Despacho de Abogados</option>
                      </Select>
                    </Field>
                    <Field label="Actividad económica" hint="Código de Hacienda">
                      <Input type="text" inputMode="numeric" value={editActividad} onChange={(e) => setEditActividad(e.target.value)} placeholder="ej: 869001" />
                    </Field>
                    <Field label="IVA por defecto (%)">
                      <Input type="number" min="0" max="100" step="0.01" inputMode="decimal" value={editIva} onChange={(e) => setEditIva(parseFloat(e.target.value) || 0)} />
                    </Field>
                  </div>

                  <label className={filaCheck}>
                    <input type="checkbox" checked={editRegimenSimplificado} onChange={(e) => setEditRegimenSimplificado(e.target.checked)} className={cajaCheck} />
                    <span className="min-w-0">
                      <span className="block font-semibold">Régimen de Tributación Simplificada</span>
                      <span className="block text-xs text-fg-muted">La empresa no declara IVA por el D-104 tradicional.</span>
                    </span>
                  </label>

                  {/* Divisor en lugar de un recuadro: evita una tarjeta dentro de la tarjeta en móvil. */}
                  <div className="pt-5 border-t border-border">
                    <fieldset className="min-w-0">
                      <legend className="text-sm font-semibold text-fg mb-3">Plazos de crédito</legend>
                      <div className="grid grid-cols-2 gap-3 sm:gap-4">
                        <Field
                          label="Clientes (días)"
                          hint="Sugerido al facturar a crédito; editable en cada factura. Va en el XML y define el vencimiento de la cuenta por cobrar."
                        >
                          <Input type="number" min="1" step="1" inputMode="numeric" value={editPlazoClientes} onChange={(e) => setEditPlazoClientes(e.target.value)} />
                        </Field>
                        <Field
                          label="Proveedores (días)"
                          hint="Sugerido al registrar una compra en Cuentas por Pagar; se usa si el XML del proveedor no trae plazo."
                        >
                          <Input type="number" min="1" step="1" inputMode="numeric" value={editPlazoProveedores} onChange={(e) => setEditPlazoProveedores(e.target.value)} />
                        </Field>
                      </div>
                    </fieldset>
                  </div>

                  {/* En móvil, franja a todo el ancho de la tarjeta (sin recuadro anidado), como el formulario de servicio. */}
                  <fieldset className="min-w-0 -mx-4 sm:mx-0 px-4 py-4 sm:p-4 bg-warning-soft border-y sm:border border-warning/25 sm:rounded-card">
                    <legend className="px-1.5 text-xs font-semibold uppercase tracking-wide text-warning">Ubicación fiscal (requerida para facturar)</legend>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                      <Field label="Provincia">
                        <Select value={editProvincia} onChange={(e) => handleCambiarProvinciaFiscal(e.target.value)}>
                          <option value="">Seleccione...</option>
                          {COSTA_RICA_PROVINCIAS.map(p => (
                            <option key={p.codigo} value={p.codigo}>{p.nombre}</option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Cantón">
                        <Select value={editCanton} onChange={(e) => handleCambiarCantonFiscal(e.target.value)} disabled={!editProvincia}>
                          <option value="">Seleccione...</option>
                          {cantonesDisponiblesCompania.map(c => (
                            <option key={c.codigo} value={c.codigo}>{c.nombre}</option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Distrito">
                        <Select value={editDistrito} onChange={(e) => setEditDistrito(e.target.value)} disabled={!editCanton}>
                          <option value="">Seleccione...</option>
                          {distritosDisponiblesCompania.map(d => (
                            <option key={d.codigo} value={d.codigo}>{d.nombre}</option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Otras señas (dirección exacta)">
                        <Input type="text" value={editOtrasSenas} onChange={(e) => setEditOtrasSenas(e.target.value)} placeholder="ej: 200m norte del parque central" />
                      </Field>
                    </div>
                  </fieldset>
                </CardBody>
              </Card>
            </Seccion>

            <Seccion id="marca">
              <Card>
                <CardHeader
                  title={tituloConIcono(<Palette />, 'Marca')}
                  description="Colores y logo de la clínica."
                />
                <CardBody className="space-y-5">
                  {/* Los dos colores caben lado a lado en el iPhone (muestra de 44px + código hex). */}
                  <div className="grid grid-cols-2 gap-3 sm:gap-4">
                    {renderColor('cs-color-primario', 'Color primario', editColorPri, setEditColorPri)}
                    {renderColor('cs-color-sidebar', 'Color del menú', editColorSide, setEditColorSide)}
                  </div>

                  <div>
                    <span className="block text-xs font-semibold text-fg mb-1.5">Logo de la empresa</span>
                    <div className="flex flex-wrap items-center gap-3 mb-3">
                      {editLogo && (
                        <img src={editLogo} alt="Logo actual" className="w-16 h-16 rounded-control object-cover border border-border" />
                      )}
                      <label className="relative inline-flex cursor-pointer">
                        <input type="file" accept="image/*" onChange={handleLogoFileChange} className="peer sr-only" />
                        <span
                          className={cx(
                            'inline-flex items-center justify-center rounded-control font-semibold whitespace-nowrap transition-colors',
                            buttonVariants.outline,
                            buttonSizes.md,
                            'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-(--focus-ring)'
                          )}
                        >
                          <Upload className="w-4 h-4" aria-hidden="true" />
                          {editLogo ? 'Cambiar imagen' : 'Subir imagen'}
                        </span>
                      </label>
                    </div>
                    {logoError && <p className="text-xs font-medium text-danger mb-2" role="alert">{logoError}</p>}
                    <span className="text-xs text-fg-muted block mb-2">O elija un logo predeterminado:</span>
                    <div className="flex flex-wrap gap-2">
                      {presetLogos.map((pl, idx) => (
                        <Button key={idx} variant="outline" size="sm" onClick={() => setEditLogo(pl.url)} aria-pressed={editLogo === pl.url}>
                          {pl.name}
                        </Button>
                      ))}
                    </div>
                  </div>
                </CardBody>
              </Card>
            </Seccion>

            <Seccion id="reservas">
              <Card>
                <CardHeader
                  title={tituloConIcono(<CalendarCheck />, 'Reservas en línea por tipo de visita')}
                  description="Define si las citas reservadas por los pacientes se confirman solas o por WhatsApp."
                />
                <CardBody className="space-y-5">
                  <label className={filaCheck}>
                    <input type="checkbox" checked={editRequiereConfirmacion} onChange={(e) => setEditRequiereConfirmacion(e.target.checked)} className={cajaCheck} />
                    <span>Las citas en línea requieren confirmación manual (no se auto-confirman)</span>
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className={filaCheck}>
                      <input
                        type="checkbox"
                        role="switch"
                        checked={editReservaAutoConsultorio}
                        onChange={(e) => setEditReservaAutoConsultorio(e.target.checked)}
                        className={cajaCheck}
                      />
                      <span>Reserva automática en consultorio</span>
                    </label>
                    <label className={filaCheck}>
                      <input
                        type="checkbox"
                        role="switch"
                        checked={editReservaAutoDomicilio}
                        onChange={(e) => setEditReservaAutoDomicilio(e.target.checked)}
                        className={cajaCheck}
                      />
                      <span>Reserva automática a domicilio</span>
                    </label>
                  </div>
                  <p className="text-xs text-fg-muted">Si lo apaga, la página pública mostrará un botón de WhatsApp para solicitar espacio en lugar de agendar automáticamente.</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <Field label="WhatsApp para solicitudes" hint="8 dígitos = número de Costa Rica (+506).">
                      <Input type="tel" inputMode="tel" value={editWhatsappReservas} onChange={(e) => setEditWhatsappReservas(e.target.value)} placeholder="8888-8888" />
                    </Field>
                    <Field
                      label="Mensaje predeterminado (opcional)"
                      hint="Si lo deja vacío se genera con el tipo de cita y el servicio elegido."
                      className="sm:col-span-2"
                    >
                      <Textarea
                        rows={3}
                        maxLength={500}
                        value={editMensajeWhatsapp}
                        onChange={(e) => setEditMensajeWhatsapp(e.target.value)}
                        placeholder="ej: Hola, quisiera solicitar una cita…"
                      />
                    </Field>
                  </div>

                  {(!editReservaAutoConsultorio || !editReservaAutoDomicilio) && editWhatsappReservas.trim() === '' && (
                    <p role="alert" className="text-sm text-warning bg-warning-soft border border-warning/25 rounded-control p-3 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                      <span className="min-w-0">Hay una reserva automática apagada y no hay número de WhatsApp: los pacientes verán solo "Comuníquese con la clínica para agendar".</span>
                    </p>
                  )}
                </CardBody>
              </Card>
            </Seccion>

            {/* Acciones del formulario (empresa, marca y reservas se guardan juntas). En móvil quedan fijas
                abajo, sobre la barra de inicio de iOS, durante todo el formulario; desde sm, al final. */}
            <div className="sticky bottom-0 z-20 -mx-4 sm:mx-0 px-4 sm:px-0 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:static sm:p-0 bg-bg/90 sm:bg-transparent backdrop-blur-md sm:backdrop-blur-none border-t border-border sm:border-0 flex gap-2 sm:justify-end [&>*]:flex-1 sm:[&>*]:flex-none print:hidden">
              <Button variant="outline" onClick={() => { setIsEditing(false); setIsAdding(false); }}>
                Cancelar
              </Button>
              <Button onClick={isAdding ? createCompany : saveEdit} icon={<Check className="w-4 h-4" aria-hidden="true" />}>
                {isAdding ? 'Registrar' : 'Guardar cambios'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
