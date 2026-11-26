import React, { useState, useEffect } from 'react';
import PlantillaDietaManager from './PlantillaDietaManager';
import { Company, CompaniaSmtpConfig, SmtpConfigInput, HaciendaConfig, HaciendaConfigInput, User, HorarioAtencion, HorarioDomicilio, DiaSemana, DEFAULT_HORARIO_ATENCION, Servicio, PorcentajeDieta, PlantillaDieta, PerfilCompania } from '../data/mockData';
import CorreoEntranteSettings from './CorreoEntranteSettings';
import { COSTA_RICA_PROVINCIAS } from '../data/costaRicaLocations';
import { Plus, Check, Settings, Sparkles, Building, Mail, ShieldCheck, Upload, AlertCircle, Users as UsersIcon, UserPlus, Power, Clock, Receipt, Edit, X, Palette, CalendarCheck } from 'lucide-react';
import { notify, confirmar } from './ui/Feedback';
import { baseDesdePrecioConIva, formatearColones, ivaEfectivo, precioConIva } from '../utils/precios';
import { Avatar, Badge, Button, Card, CardBody, CardFooter, CardHeader, EmptyState, Field, IconButton, Input, Select, Textarea, cx } from './ui';
import { buttonSizes, buttonVariants } from './ui/Button';

// MySQL devuelve tinyint (0/1) y en memoria boolean; sin dato = reserva automática activa.
const reservaActiva = (v: boolean | number | null | undefined): boolean => (v == null ? true : !!v);

// Contadores de consecutivo que el Administrador puede corregir (ver POST /api/hacienda-config).
const CAMPOS_CONSECUTIVO = [
  { campo: 'ultimoConsecutivo', etiqueta: 'Facturas' },
  { campo: 'ultimoConsecutivoNc', etiqueta: 'Notas de Crédito' },
  { campo: 'ultimoConsecutivoNd', etiqueta: 'Notas de Débito' }
] as const;

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

/** Ancla de una sección del índice lateral. */
function Seccion({ id, children }: { id: SeccionId; children: React.ReactNode }) {
  return <section id={`${SECCION_PREFIJO}${id}`} className="scroll-mt-20">{children}</section>;
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
const leyenda = 'px-1.5 text-xs font-semibold uppercase tracking-wide text-fg-muted';

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
  onDeletePlantillaDieta
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
  const [haciendaConsecutivos, setHaciendaConsecutivos] = useState({ ultimoConsecutivo: 0, ultimoConsecutivoNc: 0, ultimoConsecutivoNd: 0 });
  const [haciendaCorreccion, setHaciendaCorreccion] = useState({ ultimoConsecutivo: '', ultimoConsecutivoNc: '', ultimoConsecutivoNd: '' });
  const [smtpTieneContrasena, setSmtpTieneContrasena] = useState(false);

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
    setHaciendaCorreccion({ ultimoConsecutivo: '', ultimoConsecutivoNc: '', ultimoConsecutivoNd: '' });
    fetch(`/api/hacienda-config/${selectedCompanyId}`)
      .then(res => res.json())
      .then((data: HaciendaConfig) => {
        setHaciendaAmbiente(data.ambiente);
        setHaciendaUsuarioAtv(data.usuarioAtv);
        setHaciendaTienePasswordAtv(data.tienePasswordAtv);
        setHaciendaTieneCertificado(data.tieneCertificado);
        setHaciendaCertificadoNombreArchivo(data.certificadoNombreArchivo);
        setHaciendaCertificadoVenceEn(data.certificadoVenceEn);
        setHaciendaConsecutivos({ ultimoConsecutivo: data.ultimoConsecutivo || 0, ultimoConsecutivoNc: data.ultimoConsecutivoNc || 0, ultimoConsecutivoNd: data.ultimoConsecutivoNd || 0 });
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
        ...Object.fromEntries(CAMPOS_CONSECUTIVO
          .filter(({ campo }) => haciendaCorreccion[campo].trim() !== '')
          .map(({ campo }) => [campo, Number(haciendaCorreccion[campo])]))
      };
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
      setHaciendaTienePasswordAtv(data.tienePasswordAtv);
      setHaciendaTieneCertificado(data.tieneCertificado);
      setHaciendaCertificadoNombreArchivo(data.certificadoNombreArchivo);
      setHaciendaCertificadoVenceEn(data.certificadoVenceEn);
      setHaciendaPasswordAtv('');
      setHaciendaCertificadoBase64('');
      setHaciendaCertificadoNombreNuevo('');
      setHaciendaCertificadoPin('');
      setHaciendaConsecutivos({ ultimoConsecutivo: data.ultimoConsecutivo || 0, ultimoConsecutivoNc: data.ultimoConsecutivoNc || 0, ultimoConsecutivoNd: data.ultimoConsecutivoNd || 0 });
      setHaciendaCorreccion({ ultimoConsecutivo: '', ultimoConsecutivoNc: '', ultimoConsecutivoNd: '' });
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

  const handleProbarCertificado = async () => {
    setHaciendaProbando(true);
    setHaciendaMensaje(null);
    setHaciendaInfoCertificado(null);
    try {
      const res = await fetch('/api/hacienda/verificar-certificado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idCompania: selectedCompanyId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo verificar el certificado.');
      setHaciendaInfoCertificado(data);
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

  const irASeccion = (id: SeccionId) => {
    setSeccionActiva(id);
    const el = document.getElementById(`${SECCION_PREFIJO}${id}`);
    if (!el) return;
    const sinMovimiento = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: sinMovimiento ? 'auto' : 'smooth', block: 'start' });
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
    <div>
      <label htmlFor={idCampo} className="block text-xs font-semibold text-fg mb-1.5">{etiqueta}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${etiqueta} (selector de color)`}
          value={valor}
          onChange={(e) => onCambio(e.target.value)}
          className="w-11 h-11 shrink-0 rounded-control cursor-pointer border border-border-strong bg-surface p-1"
        />
        <Input id={idCampo} type="text" value={valor} onChange={(e) => onCambio(e.target.value)} wrapperClassName="flex-1 min-w-0" className="font-mono" />
      </div>
    </div>
  );

  return (
    <div className="max-w-6xl lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8 lg:items-start">
      {/* Índice lateral (escritorio) */}
      <nav aria-label="Secciones de la configuración" className="hidden lg:block lg:sticky lg:top-4">
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
        {/* Selector de sección (móvil y tablet) */}
        <div className="lg:hidden">
          <label htmlFor="cs-ir-a" className="block text-xs font-semibold text-fg mb-1.5">Ir a la sección</label>
          <Select id="cs-ir-a" value={seccionActiva} onChange={(e) => irASeccion(e.target.value as SeccionId)}>
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
              <Card>
                <CardHeader
                  title={tituloConIcono(<Building />, 'Empresa')}
                  description="Datos fiscales y de facturación de la clínica."
                  actions={
                    <Button variant="outline" size="sm" onClick={() => setIsEditing(true)} icon={<Settings className="w-4 h-4" aria-hidden="true" />}>
                      Editar
                    </Button>
                  }
                />
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
              </Card>
            </Seccion>

            {/* Marca */}
            <Seccion id="marca">
              <Card>
                <CardHeader
                  title={tituloConIcono(<Palette />, 'Marca')}
                  description="Logo y colores que identifican a la clínica en la aplicación."
                  actions={
                    <Button variant="outline" size="sm" onClick={() => setIsEditing(true)} icon={<Settings className="w-4 h-4" aria-hidden="true" />}>
                      Editar marca
                    </Button>
                  }
                />
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
              </Card>
            </Seccion>

            {/* Horarios (solo Administrador) */}
            {esAdmin && (
              <Seccion id="horarios">
                <Card>
                  <CardHeader
                    title={tituloConIcono(<Clock />, 'Horarios')}
                    description="Se usan para calcular los horarios disponibles en la página pública de citas."
                  />
                  <CardBody className="space-y-8">
                    <div className="space-y-3">
                      <div>
                        <h4 className="text-sm font-semibold text-fg">Horario de atención</h4>
                        <p className="text-xs text-fg-muted">Horario general de la clínica.</p>
                      </div>
                      <div className="space-y-2">
                        {(Object.keys(diasLabel) as Array<keyof HorarioAtencion>).map(dia => {
                          const cerrado = horario[dia].abre == null;
                          return (
                            <div key={dia} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3 border border-border rounded-control bg-surface">
                              <span className="w-24 text-sm font-semibold text-fg">{diasLabel[dia]}</span>
                              <label className="inline-flex items-center gap-2 min-h-10 text-sm text-fg-muted">
                                <input type="checkbox" checked={cerrado} onChange={(e) => handleToggleCerrado(dia, e.target.checked)} className={cajaCheck.replace('mt-0.5 ', '')} />
                                Cerrado
                              </label>
                              {!cerrado && (
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="time"
                                    aria-label={`${diasLabel[dia]}: hora de apertura`}
                                    value={horario[dia].abre || ''}
                                    onChange={(e) => handleCambiarDia(dia, 'abre', e.target.value)}
                                    wrapperClassName="w-32"
                                  />
                                  <span className="text-sm text-fg-muted">a</span>
                                  <Input
                                    type="time"
                                    aria-label={`${diasLabel[dia]}: hora de cierre`}
                                    value={horario[dia].cierra || ''}
                                    onChange={(e) => handleCambiarDia(dia, 'cierra', e.target.value)}
                                    wrapperClassName="w-32"
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

                          <div className="space-y-2">
                            {DIAS_ORDEN.map(dia => {
                              const tramos = horarioDom[dia];
                              const error = erroresDomicilio[dia];
                              return (
                                <div
                                  key={dia}
                                  className={cx('p-3 bg-surface border rounded-control space-y-2', error ? 'border-danger' : 'border-border')}
                                >
                                  <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
                                    <span className="sm:w-24 sm:pt-2.5 text-sm font-semibold text-fg">{diasLabel[dia]}</span>
                                    <div className="flex-1 space-y-2">
                                      {tramos.length === 0 && <p className="sm:pt-2.5 text-sm text-fg-muted">Sin atención a domicilio</p>}
                                      {tramos.map((t, i) => (
                                        <div key={i} className="flex items-center gap-2">
                                          <Input
                                            type="time"
                                            value={t.abre}
                                            aria-label={`${diasLabel[dia]} tramo ${i + 1}: abre`}
                                            onChange={(e) => handleCambiarTramo(dia, i, 'abre', e.target.value)}
                                            wrapperClassName="w-32"
                                          />
                                          <span className="text-sm text-fg-muted">a</span>
                                          <Input
                                            type="time"
                                            value={t.cierra}
                                            aria-label={`${diasLabel[dia]} tramo ${i + 1}: cierra`}
                                            onChange={(e) => handleCambiarTramo(dia, i, 'cierra', e.target.value)}
                                            wrapperClassName="w-32"
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
                </Card>
              </Seccion>
            )}

            {/* Servicios (solo Administrador) */}
            {esAdmin && (
              <Seccion id="servicios">
                <Card>
                  <CardHeader
                    title={tituloConIcono(<Receipt />, 'Servicios y tarifas')}
                    description={`Precio e IVA por servicio prestado. Si dejas el IVA en blanco, se usa el ${currentCompany.ivaPorDefecto}% por defecto de la empresa.`}
                    actions={!isServicioFormOpen ? (
                      <div className="flex flex-wrap items-center justify-end gap-2">
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
                  />
                  <CardBody className="space-y-5">
                    {mensajeServiciosDefecto && (
                      <p className="text-sm text-fg-muted bg-surface-muted rounded-control px-3 py-2" role="status">{mensajeServiciosDefecto}</p>
                    )}

                    {isServicioFormOpen && (
                      <form onSubmit={handleSubmitServicio} className="p-4 sm:p-5 bg-surface-muted/50 border border-border rounded-card space-y-5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <button
                            type="button"
                            aria-pressed={servicioTipo === 'SERVICIO'}
                            onClick={() => { setServicioTipo('SERVICIO'); if (servicioUnidadMedida === 'Unid') setServicioUnidadMedida('Sp'); }}
                            className={segmento(servicioTipo === 'SERVICIO')}
                          >
                            Servicio (sesión/cita)
                          </button>
                          <button
                            type="button"
                            aria-pressed={servicioTipo === 'ARTICULO'}
                            onClick={() => { setServicioTipo('ARTICULO'); setServicioUnidadMedida('Unid'); }}
                            className={segmento(servicioTipo === 'ARTICULO')}
                          >
                            Artículo (con existencias)
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                          <Field label={`Nombre ${servicioTipo === 'ARTICULO' ? 'del artículo' : 'del servicio'}`} required className="sm:col-span-2 lg:col-span-4">
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
                          <Field label="Precio con IVA (precio final) (₡)">
                            <Input type="number" min="0" step="any" inputMode="decimal" value={servicioPrecioConIva} onChange={(e) => handlePrecioConIvaChange(e.target.value)} />
                          </Field>
                          <Field label="% IVA (vacío = por defecto)">
                            <Input type="number" min="0" max="100" step="0.01" inputMode="decimal" value={servicioIva} onChange={(e) => handleServicioIvaChange(e.target.value)} placeholder={`${currentCompany.ivaPorDefecto}%`} />
                          </Field>
                          {servicioTipo === 'SERVICIO' && (
                            <Field label="Duración (min)" required>
                              <Input type="number" min="1" step="1" inputMode="numeric" value={servicioDuracion} onChange={(e) => setServicioDuracion(e.target.value)} />
                            </Field>
                          )}
                        </div>

                        {servicioTipo === 'SERVICIO' && (
                          <div role="group" aria-labelledby="companyset-modalidad-label">
                            <span id="companyset-modalidad-label" className="block text-xs font-semibold text-fg mb-1.5">Disponible en</span>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              {([['CONSULTORIO', 'Consultorio'], ['DOMICILIO', 'A domicilio'], ['AMBOS', 'Ambos']] as const).map(([valor, etiqueta]) => (
                                <button
                                  key={valor}
                                  type="button"
                                  onClick={() => setServicioModalidad(valor)}
                                  aria-pressed={servicioModalidad === valor}
                                  className={segmento(servicioModalidad === valor)}
                                >
                                  {etiqueta}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {servicioTipo === 'ARTICULO' && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-5 border-t border-border">
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

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-5 border-t border-border">
                          <Field
                            label="Código CABYS (obligatorio para facturar)"
                            required
                            hint={
                              (servicioCabys && !/^\d{13}$/.test(servicioCabys.trim())) || buscandoCabys ? (
                                <>
                                  {servicioCabys && !/^\d{13}$/.test(servicioCabys.trim()) && (
                                    <span className="block text-warning font-medium">El código CABYS debe tener exactamente 13 dígitos.</span>
                                  )}
                                  {buscandoCabys && <span className="block">Buscando...</span>}
                                </>
                              ) : undefined
                            }
                          >
                            {(p) => (
                              <div className="relative">
                                <Input
                                  {...p}
                                  type="text"
                                  value={servicioCabys}
                                  onChange={(e) => { setServicioCabys(e.target.value); buscarCabys(e.target.value); }}
                                  placeholder="Digite el código de 13 dígitos o busque por nombre..."
                                />
                                {cabysResultados.length > 0 && (
                                  <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto bg-surface border border-border rounded-control shadow-lg">
                                    {cabysResultados.map(r => (
                                      <button
                                        type="button"
                                        key={r.codigo}
                                        onClick={() => { setServicioCabys(r.codigo); setCabysResultados([]); }}
                                        className="w-full min-h-11 text-left px-3.5 py-2 text-sm hover:bg-surface-muted border-b border-border last:border-b-0"
                                      >
                                        <span className="font-mono text-xs text-fg-muted block">{r.codigo}</span>
                                        <span className="text-fg">{r.descripcion}</span>
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

                        <div className="flex gap-2 justify-end">
                          <Button variant="ghost" onClick={() => setIsServicioFormOpen(false)}>
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
                </Card>
              </Seccion>
            )}

            {/* Usuarios (solo Administrador) */}
            {esAdmin && (
              <Seccion id="usuarios">
                <Card>
                  <CardHeader
                    title={tituloConIcono(<UsersIcon />, 'Usuarios y colaboradores')}
                    description={`${activeUserCount} de ${currentCompany.maxUsuarios} usuarios activos permitidos por tu plan.`}
                    actions={!isAddingUser ? (
                      <Button size="sm" onClick={() => setIsAddingUser(true)} disabled={userLimitReached} icon={<UserPlus className="w-4 h-4" aria-hidden="true" />}>
                        Nuevo colaborador
                      </Button>
                    ) : undefined}
                  />
                  <CardBody className="space-y-5">
                    {userLimitReached && !isAddingUser && (
                      <div className="p-3 rounded-control bg-warning-soft border border-warning/25 text-warning text-sm flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                        <span>Alcanzaste el límite de {currentCompany.maxUsuarios} usuarios de tu plan. Contacta al administrador de la plataforma para ampliarlo.</span>
                      </div>
                    )}

                    {isAddingUser && (
                      <form onSubmit={handleCreateUser} className="p-4 sm:p-5 bg-surface-muted/50 border border-border rounded-card space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <Field label="Nombre completo" required>
                            <Input type="text" value={newUserNombre} onChange={(e) => setNewUserNombre(e.target.value)} />
                          </Field>
                          <Field label="Correo" required>
                            <Input type="email" value={newUserCorreo} onChange={(e) => setNewUserCorreo(e.target.value)} />
                          </Field>
                          <Field label="Nombre de usuario" required>
                            <Input type="text" value={newUserUsuario} onChange={(e) => setNewUserUsuario(e.target.value)} />
                          </Field>
                          <Field label="Contraseña" required>
                            <Input type="password" value={newUserContrasena} onChange={(e) => setNewUserContrasena(e.target.value)} />
                          </Field>
                        </div>
                        <Field
                          label="Rol"
                          hint={newUserRol === 'Contador' ? 'Contador: acceso de solo lectura a facturación, CxP y reportes fiscales; sin acceso a expedientes ni citas.' : undefined}
                        >
                          <Select value={newUserRol} onChange={(e) => setNewUserRol(e.target.value as 'Administrador' | 'Profesional' | 'Contador')}>
                            <option value="Profesional">Profesional</option>
                            <option value="Administrador">Administrador</option>
                            <option value="Contador">Contador</option>
                          </Select>
                        </Field>
                        <div className="flex gap-2 justify-end">
                          <Button variant="ghost" onClick={() => setIsAddingUser(false)}>
                            Cancelar
                          </Button>
                          <Button type="submit" disabled={userLimitReached}>
                            Guardar colaborador
                          </Button>
                        </div>
                      </form>
                    )}

                    <ul className="divide-y divide-border border border-border rounded-card overflow-hidden">
                      {companyUsers.map(u => (
                        <li key={u.id} className="flex items-center justify-between gap-3 p-3 sm:p-4 bg-surface">
                          <div className="flex items-center gap-3 min-w-0">
                            <Avatar name={u.nombre} />
                            <div className="min-w-0">
                              <span className="font-semibold text-sm text-fg block truncate">{u.nombre}</span>
                              <span className="text-xs text-fg-muted flex flex-wrap items-center gap-1.5">
                                <span className="truncate">{u.usuario}</span>
                                <Badge tone={u.rol === 'Administrador' ? 'brand' : u.rol === 'Contador' ? 'info' : 'neutral'}>{u.rol}</Badge>
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge tone={u.activo ? 'success' : 'neutral'}>{u.activo ? 'Activo' : 'Inactivo'}</Badge>
                            <IconButton
                              label={u.activo ? 'Desactivar' : 'Activar'}
                              icon={<Power className="w-4 h-4" aria-hidden="true" />}
                              onClick={() => handleToggleUserActivo(u)}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </CardBody>
                </Card>
              </Seccion>
            )}

            {/* Correo SMTP */}
            <Seccion id="smtp">
              <form onSubmit={handleSaveSmtp}>
                <Card>
                  <CardHeader
                    title={tituloConIcono(<Mail />, 'Parámetros SMTP y alertas por correo')}
                    description="Configura las credenciales de correo de la clínica para enviar recordatorios y confirmaciones automáticas de citas."
                    actions={<Badge tone={smtpActivo ? 'success' : 'neutral'}>{smtpActivo ? 'Activo' : 'Apagado'}</Badge>}
                  />
                  <CardBody className="space-y-5">
                    <label className="flex items-center justify-between gap-4 bg-surface-muted/50 p-4 rounded-card border border-border cursor-pointer">
                      <span>
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

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <Field label="Proveedor SMTP" className="sm:col-span-2 lg:col-span-2">
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
                      <Field label="Servidor host SMTP" required className="sm:col-span-2 lg:col-span-2">
                        <Input type="text" required value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="ej: smtp.mailgun.org" />
                      </Field>
                      <Field label="Puerto" required>
                        <Input type="number" required inputMode="numeric" value={smtpPort} onChange={(e) => setSmtpPort(parseInt(e.target.value))} />
                      </Field>
                      <Field label="Seguridad">
                        <Select value={smtpSeguridad} onChange={(e) => setSmtpSeguridad(e.target.value as CompaniaSmtpConfig['smtpSeguridad'])}>
                          <option value="TLS">TLS (Recom.)</option>
                          <option value="SSL">SSL</option>
                          <option value="NINGUNA">Ninguna</option>
                        </Select>
                      </Field>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="Usuario de autenticación SMTP" required>
                        <Input type="text" required value={smtpUsuario} onChange={(e) => setSmtpUsuario(e.target.value)} placeholder="ej: contacto@miempresa.com" />
                      </Field>
                      <Field label="Contraseña SMTP / App Password" required={!smtpTieneContrasena}>
                        <Input
                          type="password"
                          required={!smtpTieneContrasena}
                          value={smtpPassword}
                          onChange={(e) => setSmtpPassword(e.target.value)}
                          placeholder={smtpTieneContrasena ? '•••••••• (dejar en blanco para mantener la actual)' : 'Ingresa la contraseña o App Password'}
                        />
                      </Field>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-5 border-t border-border">
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
                  <CardFooter className="flex-wrap">
                    <Button
                      variant="outline"
                      onClick={handleProbarSmtp}
                      disabled={smtpProbando}
                      loading={smtpProbando}
                      icon={<Mail className="w-4 h-4" aria-hidden="true" />}
                    >
                      Enviar correo de prueba
                    </Button>
                    <Button type="submit" icon={<Check className="w-4 h-4" aria-hidden="true" />}>
                      Guardar configuración SMTP
                    </Button>
                  </CardFooter>
                </Card>
              </form>
            </Seccion>

            {/* Correo entrante */}
            <Seccion id="correo-entrante">
              <CorreoEntranteSettings themeColor={currentCompany.colorPrimario} />
            </Seccion>

            {/* Hacienda — solo Administrador (el servidor también lo exige): credenciales, certificado
                y ambiente deciden qué se declara a Hacienda. */}
            <Seccion id="hacienda">
              {!esAdmin ? (
                <Card>
                  <CardBody>
                    <p className="text-sm text-fg-muted">
                      La configuración de Hacienda (credenciales ATV, firma digital y ambiente) solo la puede ver y cambiar un usuario Administrador.
                    </p>
                  </CardBody>
                </Card>
              ) : (
                <form onSubmit={handleSaveHacienda}>
                  <Card>
                    <CardHeader
                      title={tituloConIcono(<ShieldCheck />, 'Firma digital Hacienda (facturación electrónica)')}
                      description="Certificado criptográfico (.p12) y credenciales ATV para firmar comprobantes electrónicos."
                      actions={<Badge tone={haciendaTieneCertificado ? 'success' : 'warning'}>{haciendaTieneCertificado ? 'Certificado cargado' : 'Sin certificado'}</Badge>}
                    />
                    <CardBody className="space-y-5">
                      {haciendaMensaje && (
                        <div
                          role={haciendaMensaje.tipo === 'error' ? 'alert' : 'status'}
                          className={cx(
                            'p-3 rounded-control border text-sm flex items-center gap-2',
                            haciendaMensaje.tipo === 'ok' ? 'bg-success-soft border-success/20 text-success' : 'bg-danger-soft border-danger/20 text-danger'
                          )}
                        >
                          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                          <span>{haciendaMensaje.texto}</span>
                        </div>
                      )}

                      {haciendaInfoCertificado && (
                        <dl className="p-4 rounded-card border border-border bg-surface-muted/50 text-sm space-y-1">
                          <div><dt className="inline font-semibold text-fg-muted">Sujeto: </dt><dd className="inline text-fg">{haciendaInfoCertificado.sujeto}</dd></div>
                          <div><dt className="inline font-semibold text-fg-muted">Emisor: </dt><dd className="inline text-fg">{haciendaInfoCertificado.emisor}</dd></div>
                          <div><dt className="inline font-semibold text-fg-muted">Vence: </dt><dd className="inline text-fg">{new Date(haciendaInfoCertificado.validoHasta).toLocaleDateString('es-CR')}</dd></div>
                          {haciendaInfoCertificado.expirado && <div className="text-danger font-semibold">Este certificado está VENCIDO.</div>}
                        </dl>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field label="Ambiente">
                          <Select
                            value={haciendaAmbiente}
                            onChange={(e) => setHaciendaAmbiente(e.target.value as 'SANDBOX' | 'PRODUCCION' | 'PRUEBAS_LOCAL')}
                          >
                            <option value="PRUEBAS_LOCAL">Pruebas Locales (no envía a Hacienda)</option>
                            <option value="SANDBOX">Sandbox (Pruebas de Hacienda — envía tráfico real)</option>
                            <option value="PRODUCCION">Producción</option>
                          </Select>
                        </Field>
                        <Field label="Usuario ATV">
                          <Input type="text" value={haciendaUsuarioAtv} onChange={(e) => setHaciendaUsuarioAtv(e.target.value)} placeholder="ej: cpf-01-1234-5678" />
                        </Field>
                        <Field label="Contraseña ATV" className="sm:col-span-2">
                          <Input
                            type="password"
                            value={haciendaPasswordAtv}
                            onChange={(e) => setHaciendaPasswordAtv(e.target.value)}
                            placeholder={haciendaTienePasswordAtv ? '•••••••• (dejar en blanco para mantener la actual)' : 'Ingresa la contraseña ATV'}
                          />
                        </Field>
                        <Field
                          label={<span className="inline-flex items-center gap-1.5"><Upload className="w-3.5 h-3.5" aria-hidden="true" /> Certificado criptográfico (.p12)</span>}
                          hint={haciendaCertificadoNombreNuevo
                            ? `Nuevo archivo seleccionado: ${haciendaCertificadoNombreNuevo}`
                            : haciendaTieneCertificado
                            ? `Archivo actual: ${haciendaCertificadoNombreArchivo || 'certificado.p12'}${haciendaCertificadoVenceEn ? ` · vence ${haciendaCertificadoVenceEn}` : ''}`
                            : 'Ningún certificado configurado todavía.'}
                        >
                          {(p) => (
                            <input
                              id={p.id}
                              aria-describedby={p['aria-describedby']}
                              type="file"
                              accept=".p12,.pfx"
                              onChange={handleCertificadoFileChange}
                              className="w-full min-h-11 bg-surface border border-border-strong rounded-control text-sm text-fg-muted file:mr-3 file:min-h-11 file:px-4 file:border-0 file:border-r file:border-border-strong file:bg-surface-muted file:text-fg file:font-semibold file:cursor-pointer"
                            />
                          )}
                        </Field>
                        <Field label="PIN del certificado">
                          <Input
                            type="password"
                            value={haciendaCertificadoPin}
                            onChange={(e) => setHaciendaCertificadoPin(e.target.value)}
                            placeholder={haciendaTieneCertificado ? '•••••••• (dejar en blanco para mantener el actual)' : 'PIN del certificado .p12'}
                          />
                        </Field>
                      </div>

                      {currentUser.rol === 'Administrador' && (
                        <fieldset className="border border-border rounded-card p-4 space-y-3">
                          <legend className={leyenda}>Corrección de numeración</legend>
                          <p className="text-xs text-fg-muted">
                            Úselo solo si Hacienda rechaza con «el documento ya fue emitido» porque esta empresa ya facturó con otro sistema.
                            Escriba el último número que ya emitió ante Hacienda; el siguiente comprobante usará ese más uno. Solo se puede subir.
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {CAMPOS_CONSECUTIVO.map(({ campo, etiqueta }) => (
                              <Field key={campo} label={`${etiqueta} — último emitido`} hint={`Actual: ${haciendaConsecutivos[campo]}`}>
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
                      )}
                    </CardBody>
                    <CardFooter className="justify-between flex-wrap">
                      <Button
                        variant="outline"
                        onClick={handleProbarCertificado}
                        disabled={haciendaProbando || !haciendaTieneCertificado}
                        loading={haciendaProbando}
                        icon={<ShieldCheck className="w-4 h-4" aria-hidden="true" />}
                      >
                        {haciendaProbando ? 'Probando...' : 'Probar configuración'}
                      </Button>
                      <Button type="submit" loading={haciendaGuardando} icon={<Check className="w-4 h-4" aria-hidden="true" />}>
                        {haciendaGuardando ? 'Guardando...' : 'Guardar configuración Hacienda'}
                      </Button>
                    </CardFooter>
                  </Card>
                </form>
              )}
            </Seccion>

            {/* Reservas en línea (lectura; se edita junto con los datos de la empresa) */}
            <Seccion id="reservas">
              <Card>
                <CardHeader
                  title={tituloConIcono(<CalendarCheck />, 'Reservas en línea')}
                  description="Cómo se confirman las citas que los pacientes reservan desde la página pública."
                  actions={
                    <Button variant="outline" size="sm" onClick={() => setIsEditing(true)} icon={<Settings className="w-4 h-4" aria-hidden="true" />}>
                      Editar
                    </Button>
                  }
                />
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
              </Card>
            </Seccion>

            {/* Dietas (solo Administrador y perfiles con nutrición) */}
            {esAdmin && muestraDietas && (
              <Seccion id="dietas">
                <div className="space-y-6">
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
                              className="w-10! h-10! rounded-full hover:text-danger! hover:bg-danger-soft!"
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Nombre comercial">
                      <Input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} />
                    </Field>
                    <Field label="Razón social jurídica">
                      <Input type="text" value={editRazon} onChange={(e) => setEditRazon(e.target.value)} />
                    </Field>
                    <Field label="Cédula física / jurídica (CR)">
                      <Input type="text" value={editIdent} onChange={(e) => setEditIdent(e.target.value)} placeholder="ej: 3-101-234567" />
                    </Field>
                    <Field label="Email emisor (Hacienda)">
                      <Input type="text" value={editCorreo} onChange={(e) => setEditCorreo(e.target.value)} />
                    </Field>
                    <Field label="Perfil de la clínica / empresa">
                      <Select value={editPerfil} onChange={(e) => setEditPerfil(e.target.value as PerfilCompania)}>
                        <option value="Ambas">Ambas (Fisioterapia y Nutrición)</option>
                        <option value="Fisioterapia">Sólo Fisioterapia</option>
                        <option value="Nutrición">Sólo Nutrición</option>
                        <option value="Spa">Spa / Bienestar (Sauna, Cold Plunge, Masajes...)</option>
                        <option value="Legal">Despacho de Abogados</option>
                      </Select>
                    </Field>
                    <Field label="Código de actividad económica (Hacienda)">
                      <Input type="text" value={editActividad} onChange={(e) => setEditActividad(e.target.value)} placeholder="ej: 869001" />
                    </Field>
                    <Field label="% IVA por defecto">
                      <Input type="number" min="0" max="100" step="0.01" inputMode="decimal" value={editIva} onChange={(e) => setEditIva(parseFloat(e.target.value) || 0)} />
                    </Field>
                  </div>

                  <label className={filaCheck}>
                    <input type="checkbox" checked={editRegimenSimplificado} onChange={(e) => setEditRegimenSimplificado(e.target.checked)} className={cajaCheck} />
                    <span>Empresa inscrita en Régimen de Tributación Simplificada (no declara IVA por D-104 tradicional)</span>
                  </label>

                  <fieldset className="p-4 border border-border rounded-card">
                    <legend className={leyenda}>Parámetros contables</legend>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field
                        label="Plazo de crédito a clientes (días)"
                        hint="Valor sugerido al facturar a crédito; se puede cambiar en cada factura. Va en el XML y define el vencimiento de la cuenta por cobrar."
                      >
                        <Input type="number" min="1" step="1" inputMode="numeric" value={editPlazoClientes} onChange={(e) => setEditPlazoClientes(e.target.value)} />
                      </Field>
                      <Field
                        label="Plazo de pago a proveedores (días)"
                        hint="Valor sugerido al registrar una compra en Cuentas por Pagar, y el que se usa si el XML de crédito del proveedor no trae plazo."
                      >
                        <Input type="number" min="1" step="1" inputMode="numeric" value={editPlazoProveedores} onChange={(e) => setEditPlazoProveedores(e.target.value)} />
                      </Field>
                    </div>
                  </fieldset>

                  <fieldset className="p-4 bg-warning-soft border border-warning/25 rounded-card">
                    <legend className="px-1.5 text-xs font-semibold uppercase tracking-wide text-warning">Ubicación fiscal (requerida para facturar)</legend>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {renderColor('cs-color-primario', 'Color primario clínico', editColorPri, setEditColorPri)}
                    {renderColor('cs-color-sidebar', 'Color controles sidebar', editColorSide, setEditColorSide)}
                  </div>

                  <div>
                    <span className="block text-xs font-semibold text-fg mb-1.5">Logo de la empresa</span>
                    <div className="flex items-center gap-3 mb-3">
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="WhatsApp para solicitudes" hint="Un número de 8 dígitos se toma como de Costa Rica (+506).">
                      <Input type="tel" inputMode="tel" value={editWhatsappReservas} onChange={(e) => setEditWhatsappReservas(e.target.value)} placeholder="8888-8888" />
                    </Field>
                    <Field label="Mensaje predeterminado (opcional)" className="sm:col-span-2">
                      <Textarea
                        rows={3}
                        maxLength={500}
                        value={editMensajeWhatsapp}
                        onChange={(e) => setEditMensajeWhatsapp(e.target.value)}
                        placeholder="Si lo deja vacío se genera un mensaje con el tipo de cita y el servicio elegido."
                      />
                    </Field>
                  </div>

                  {(!editReservaAutoConsultorio || !editReservaAutoDomicilio) && editWhatsappReservas.trim() === '' && (
                    <p role="alert" className="text-sm text-warning bg-warning-soft border border-warning/25 rounded-control p-3 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                      Hay una reserva automática apagada y no hay número de WhatsApp: los pacientes verán solo "Comuníquese con la clínica para agendar".
                    </p>
                  )}
                </CardBody>
                <CardFooter>
                  <Button variant="ghost" onClick={() => { setIsEditing(false); setIsAdding(false); }}>
                    Cancelar
                  </Button>
                  <Button onClick={isAdding ? createCompany : saveEdit} icon={<Check className="w-4 h-4" aria-hidden="true" />}>
                    {isAdding ? 'Registrar' : 'Guardar cambios'}
                  </Button>
                </CardFooter>
              </Card>
            </Seccion>
          </>
        )}
      </div>
    </div>
  );
}
