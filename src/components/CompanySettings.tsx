import React, { useState, useEffect } from 'react';
import PlantillaDietaManager from './PlantillaDietaManager';
import { Company, CompaniaSmtpConfig, SmtpConfigInput, HaciendaConfig, HaciendaConfigInput, User, HorarioAtencion, DEFAULT_HORARIO_ATENCION, Servicio, PorcentajeDieta, PlantillaDieta, PerfilCompania } from '../data/mockData';
import { COSTA_RICA_PROVINCIAS } from '../data/costaRicaLocations';
import { Plus, Check, Settings, Image as ImageIcon, Sparkles, Building, Mail, ShieldCheck, Upload, AlertCircle, Users as UsersIcon, UserPlus, Power, Clock, Receipt, Edit, X } from 'lucide-react';
import { notify, confirmar } from './ui/Feedback';

// Contadores de consecutivo que el Administrador puede corregir (ver POST /api/hacienda-config).
const CAMPOS_CONSECUTIVO = [
  { campo: 'ultimoConsecutivo', etiqueta: 'Facturas' },
  { campo: 'ultimoConsecutivoNc', etiqueta: 'Notas de Crédito' },
  { campo: 'ultimoConsecutivoNd', etiqueta: 'Notas de Débito' }
] as const;

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
  const [newUserRol, setNewUserRol] = useState<'Administrador' | 'Profesional'>('Profesional');

  const [horario, setHorario] = useState<HorarioAtencion>(currentCompany.horarioAtencion || DEFAULT_HORARIO_ATENCION);
  const [horarioGuardado, setHorarioGuardado] = useState(false);

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
  const [servicioIva, setServicioIva] = useState('');
  const [servicioDuracion, setServicioDuracion] = useState('30');
  const [servicioCabys, setServicioCabys] = useState('');
  const [servicioUnidadMedida, setServicioUnidadMedida] = useState<'Sp' | 'Spe' | 'St' | 'Os' | 'h' | 'Unid'>('Sp');
  const [servicioStock, setServicioStock] = useState('0');
  const [servicioStockMinimo, setServicioStockMinimo] = useState('');
  const [servicioCostoUnitario, setServicioCostoUnitario] = useState('');
  const [servicioCodigoBarras, setServicioCodigoBarras] = useState('');
  const [cabysResultados, setCabysResultados] = useState<Array<{ codigo: string; descripcion: string }>>([]);
  const [buscandoCabys, setBuscandoCabys] = useState(false);
  const [cargandoServiciosDefecto, setCargandoServiciosDefecto] = useState(false);
  const [mensajeServiciosDefecto, setMensajeServiciosDefecto] = useState('');
  const [ajustandoStockId, setAjustandoStockId] = useState<number | null>(null);
  const [ajusteStockValor, setAjusteStockValor] = useState('');
  const [ajusteStockNotas, setAjusteStockNotas] = useState('');
  const [ajusteStockGuardando, setAjusteStockGuardando] = useState(false);

  useEffect(() => {
    setIsAddingUser(false);
    setNewUserNombre('');
    setNewUserUsuario('');
    setNewUserCorreo('');
    setNewUserContrasena('');
    setNewUserRol('Profesional');
    setHorario(currentCompany.horarioAtencion || DEFAULT_HORARIO_ATENCION);
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
    onUpdateCompany({
      ...currentCompany,
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

  const openNewServicioForm = () => {
    setServicioEditId(null);
    setServicioTipo('SERVICIO');
    setServicioNombre('');
    setServicioPrecio('');
    setServicioIva('');
    setServicioDuracion('30');
    setServicioCabys('');
    setServicioUnidadMedida('Sp');
    setServicioStock('0');
    setServicioStockMinimo('');
    setServicioCostoUnitario('');
    setServicioCodigoBarras('');
    setCabysResultados([]);
    setIsServicioFormOpen(true);
  };

  const openEditServicioForm = (s: Servicio) => {
    setServicioEditId(s.id);
    setServicioTipo(s.tipo || 'SERVICIO');
    setServicioNombre(s.nombre);
    setServicioPrecio(s.precio.toString());
    setServicioIva(s.porcentajeIva != null ? s.porcentajeIva.toString() : '');
    setServicioDuracion(s.duracionMinutos.toString());
    setServicioCabys(s.codigoCabys || '');
    setServicioUnidadMedida(s.unidadMedida || 'Sp');
    setServicioStock(s.stock != null ? s.stock.toString() : '0');
    setServicioStockMinimo(s.stockMinimo != null ? s.stockMinimo.toString() : '');
    setServicioCostoUnitario(s.costoUnitario != null ? s.costoUnitario.toString() : '');
    setServicioCodigoBarras(s.codigoBarras || '');
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

  const handleGuardarHorario = () => {
    onUpdateCompany({ ...currentCompany, horarioAtencion: horario });
    setHorarioGuardado(true);
    setTimeout(() => setHorarioGuardado(false), 2500);
  };

  const handleCambiarDia = (dia: keyof HorarioAtencion, campo: 'abre' | 'cierra', valor: string) => {
    setHorario(prev => ({ ...prev, [dia]: { ...prev[dia], [campo]: valor || null } }));
  };

  const handleToggleCerrado = (dia: keyof HorarioAtencion, cerrado: boolean) => {
    setHorario(prev => ({ ...prev, [dia]: cerrado ? { abre: null, cierra: null } : { abre: '08:00', cierra: '18:00' } }));
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
      <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <Building className="w-5 h-5 text-slate-500" style={{ color: currentCompany.colorPrimario }} />
          <div>
            <h3 className="text-sm font-bold text-slate-800">Clínica / Empresa Activa</h3>
            <p className="text-[11px] text-slate-500">Configuración de identidad visual costarricense</p>
          </div>
        </div>
        {companies.length > 1 && (
          <button
            onClick={openAddForm}
            className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            Nueva
          </button>
        )}
      </div>

      {/* Select Company Grid */}
      {companies.length > 1 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-4">
          {companies.map((c) => {
            const isSelected = c.id === selectedCompanyId;
            return (
              <div
                key={c.id}
                onClick={() => handleSelect(c.id)}
                className={`p-3 rounded-xl border-2 cursor-pointer transition-all flex items-center justify-between ${
                  isSelected
                    ? 'border-slate-800 bg-slate-50/50 shadow-sm'
                    : 'border-slate-100 hover:border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <img
                    src={c.logoUrl}
                    alt={c.nombreComercial}
                    className="w-10 h-10 object-cover rounded-lg border border-slate-200"
                    referrerPolicy="no-referrer"
                  />
                  <div>
                    <span className="font-bold text-xs text-slate-800 block">{c.nombreComercial}</span>
                    <span className="text-[11px] text-slate-500 block truncate max-w-[120px]">{c.identificacion}</span>
                  </div>
                </div>
                {isSelected && (
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[11px]" style={{ backgroundColor: c.colorPrimario }}>
                    <Check className="w-3 h-3" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* View Details / Customize Panel */}
      {!isEditing && !isAdding && (
        <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Identidad de Marca</span>
            <button
              onClick={() => setIsEditing(true)}
              className="text-[11px] font-bold text-teal-700 hover:underline flex items-center gap-1"
              style={{ color: currentCompany.colorPrimario }}
            >
              <Settings className="w-3 h-3" />
              Editar Marca
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-slate-500 block">Razón Social:</span>
              <span className="font-medium text-slate-800 block truncate">{currentCompany.razonSocial}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Correo Facturas:</span>
              <span className="font-medium text-slate-800 block truncate">{currentCompany.correoEmisor}</span>
            </div>
            <div>
              <span className="text-slate-500 block">IVA por Defecto:</span>
              <span className="font-semibold text-slate-800 block">
                {currentCompany.ivaPorDefecto}%
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Actividad Económica:</span>
              <span className="font-medium text-slate-800 block truncate">
                {currentCompany.actividadEconomica || 'No configurada'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Perfil de Clínica:</span>
              <span className="font-extrabold text-slate-800 bg-slate-100 border border-slate-200 rounded-md px-1.5 py-0.5 inline-block mt-0.5 text-[11px]">
                {currentCompany.perfilCompania || 'Ambas'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Colores Marca:</span>
              <div className="flex gap-1.5 mt-0.5">
                <span className="w-4 h-4 rounded-sm border border-slate-300 inline-block" style={{ backgroundColor: currentCompany.colorPrimario }} title="Primario"></span>
                <span className="w-4 h-4 rounded-sm border border-slate-300 inline-block" style={{ backgroundColor: currentCompany.colorSidebar }} title="Sidebar"></span>
              </div>
            </div>
            <div>
              <span className="text-slate-500 block">Citas en Línea:</span>
              <span className="font-medium text-slate-800 block">
                {currentCompany.requiereConfirmacionCitas ? 'Requieren confirmación manual' : 'Se auto-confirman'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* SMTP/Notifications configuration per company */}
      {!isEditing && !isAdding && (
        <form onSubmit={handleSaveSmtp} className="mt-5 p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-4 text-xs">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2.5">
            <Mail className="w-4 h-4 text-slate-600" style={{ color: currentCompany.colorPrimario }} />
            <div>
              <h4 className="font-bold text-slate-800">Parámetros SMTP y Alertas por Correo</h4>
              <p className="text-[11px] text-slate-500">Configura las credenciales de correo de la clínica para enviar recordatorios y confirmaciones automáticas de citas</p>
            </div>
          </div>

          {/* Toggle Activo */}
          <div className="flex items-center justify-between bg-white p-3.5 rounded-xl border border-slate-200">
            <div>
              <span className="font-bold text-slate-800 block">Notificaciones de Agenda Activas</span>
              <span className="text-[11px] text-slate-500 block">Si se apaga, las citas no enviarán correos automáticos de confirmación, modificación o cancelación</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={smtpActivo}
                onChange={(e) => setSmtpActivo(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-focus:ring-2 peer-focus:ring-teal-300 dark:peer-focus:ring-teal-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600"></div>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-600 mb-1 font-semibold">Proveedor SMTP</label>
              <select
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
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
              >
                <option value="GMAIL">Google (Gmail)</option>
                <option value="OUTLOOK">Microsoft (Outlook / Office 365)</option>
                <option value="OTRO">Servidor SMTP Privado (Otro)</option>
              </select>
            </div>

            <div>
              <label htmlFor="companyset-servidor-host-smtp" className="block text-slate-600 mb-1 font-semibold">Servidor Host SMTP</label>
              <input id="companyset-servidor-host-smtp"
                type="text"
                required
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                placeholder="ej: smtp.mailgun.org"
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="companyset-puerto" className="block text-slate-600 mb-1 font-semibold">Puerto</label>
                <input id="companyset-puerto"
                  type="number"
                  required
                  value={smtpPort}
                  onChange={(e) => setSmtpPort(parseInt(e.target.value))}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
                />
              </div>
              <div>
                <label htmlFor="companyset-seguridad" className="block text-slate-600 mb-1 font-semibold">Seguridad</label>
                <select id="companyset-seguridad"
                  value={smtpSeguridad}
                  onChange={(e) => setSmtpSeguridad(e.target.value as CompaniaSmtpConfig['smtpSeguridad'])}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
                >
                  <option value="TLS">TLS (Recom.)</option>
                  <option value="SSL">SSL</option>
                  <option value="NINGUNA">Ninguna</option>
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="companyset-usuario-de-autenticacion-smtp" className="block text-slate-600 mb-1 font-semibold">Usuario de Autenticación SMTP</label>
              <input id="companyset-usuario-de-autenticacion-smtp"
                type="text"
                required
                value={smtpUsuario}
                onChange={(e) => setSmtpUsuario(e.target.value)}
                placeholder="ej: contacto@miempresa.com"
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
              />
            </div>
            <div>
              <label htmlFor="companyset-contrasena-smtp-app-password" className="block text-slate-600 mb-1 font-semibold">Contraseña SMTP / App Password</label>
              <input id="companyset-contrasena-smtp-app-password"
                type="password"
                required={!smtpTieneContrasena}
                value={smtpPassword}
                onChange={(e) => setSmtpPassword(e.target.value)}
                placeholder={smtpTieneContrasena ? '•••••••• (dejar en blanco para mantener la actual)' : 'Ingresa la contraseña o App Password'}
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 border-t border-slate-200/60">
            <div>
              <label htmlFor="companyset-nombre-de-remitente" className="block text-slate-600 mb-1 font-semibold">Nombre de Remitente</label>
              <input id="companyset-nombre-de-remitente"
                type="text"
                required
                value={smtpRemitenteNombre}
                onChange={(e) => setSmtpRemitenteNombre(e.target.value)}
                placeholder="ej: Clínica FisioNutri"
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
              />
            </div>
            <div>
              <label htmlFor="companyset-correo-de-remitente" className="block text-slate-600 mb-1 font-semibold">Correo de Remitente</label>
              <input id="companyset-correo-de-remitente"
                type="email"
                required
                value={smtpRemitenteCorreo}
                onChange={(e) => setSmtpRemitenteCorreo(e.target.value)}
                placeholder="ej: citas@miempresa.com"
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
              />
            </div>
            <div>
              <label htmlFor="companyset-recordatorio-automatico" className="block text-slate-600 mb-1 font-semibold">Recordatorio Automático</label>
              <select id="companyset-recordatorio-automatico"
                value={smtpRecordatorioHoras}
                onChange={(e) => setSmtpRecordatorioHoras(parseInt(e.target.value))}
                className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
              >
                <option value={12}>12 horas antes de la cita</option>
                <option value={24}>24 horas antes de la cita</option>
                <option value={48}>48 horas antes de la cita</option>
                <option value={72}>72 horas antes de la cita</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              className="text-white px-5 py-2 rounded-xl font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
              style={{ backgroundColor: currentCompany.colorPrimario }}
            >
              <Check className="w-4 h-4" />
              Guardar Configuración SMTP
            </button>
          </div>
        </form>
      )}

      {/* Hacienda Digital Signature configuration per company — solo Administrador (el servidor
          también lo exige): credenciales, certificado y ambiente deciden qué se declara a Hacienda. */}
      {!isEditing && !isAdding && currentUser.rol !== 'Administrador' && (
        <p className="mt-5 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-600">
          La configuración de Hacienda (credenciales ATV, firma digital y ambiente) solo la puede ver y cambiar un usuario Administrador.
        </p>
      )}
      {!isEditing && !isAdding && currentUser.rol === 'Administrador' && (
        <form onSubmit={handleSaveHacienda} className="mt-5 p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-4 text-xs">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2.5">
            <ShieldCheck className="w-4 h-4 text-slate-600" style={{ color: currentCompany.colorPrimario }} />
            <div>
              <h4 className="font-bold text-slate-800">Firma Digital Hacienda (Facturación Electrónica)</h4>
              <p className="text-[11px] text-slate-500">Certificado criptográfico (.p12) y credenciales ATV para firmar comprobantes electrónicos</p>
            </div>
          </div>

          {haciendaMensaje && (
            <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${haciendaMensaje.tipo === 'ok' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-600'}`}>
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{haciendaMensaje.texto}</span>
            </div>
          )}

          {haciendaInfoCertificado && (
            <div className="p-3 rounded-xl border border-slate-200 bg-white text-[11px] space-y-1">
              <div><span className="font-bold text-slate-600">Sujeto: </span>{haciendaInfoCertificado.sujeto}</div>
              <div><span className="font-bold text-slate-600">Emisor: </span>{haciendaInfoCertificado.emisor}</div>
              <div><span className="font-bold text-slate-600">Vence: </span>{new Date(haciendaInfoCertificado.validoHasta).toLocaleDateString('es-CR')}</div>
              {haciendaInfoCertificado.expirado && <div className="text-rose-600 font-bold">Este certificado está VENCIDO.</div>}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="companyset-ambiente" className="block text-slate-600 mb-1 font-semibold">Ambiente</label>
              <select id="companyset-ambiente"
                value={haciendaAmbiente}
                onChange={(e) => setHaciendaAmbiente(e.target.value as 'SANDBOX' | 'PRODUCCION' | 'PRUEBAS_LOCAL')}
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
              >
                <option value="PRUEBAS_LOCAL">Pruebas Locales (no envía a Hacienda)</option>
                <option value="SANDBOX">Sandbox (Pruebas de Hacienda — envía tráfico real)</option>
                <option value="PRODUCCION">Producción</option>
              </select>
            </div>
            <div>
              <label htmlFor="companyset-usuario-atv" className="block text-slate-600 mb-1 font-semibold">Usuario ATV</label>
              <input id="companyset-usuario-atv"
                type="text"
                value={haciendaUsuarioAtv}
                onChange={(e) => setHaciendaUsuarioAtv(e.target.value)}
                placeholder="ej: cpf-01-1234-5678"
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
              />
            </div>
          </div>

          <div>
            <label htmlFor="companyset-contrasena-atv" className="block text-slate-600 mb-1 font-semibold">Contraseña ATV</label>
            <input id="companyset-contrasena-atv"
              type="password"
              value={haciendaPasswordAtv}
              onChange={(e) => setHaciendaPasswordAtv(e.target.value)}
              placeholder={haciendaTienePasswordAtv ? '•••••••• (dejar en blanco para mantener la actual)' : 'Ingresa la contraseña ATV'}
              className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="companyset-certificado-criptografico-p12" className="block text-slate-600 mb-1 font-semibold flex items-center gap-1">
                <Upload className="w-3 h-3" /> Certificado Criptográfico (.p12)
              </label>
              <input id="companyset-certificado-criptografico-p12"
                type="file"
                accept=".p12,.pfx"
                onChange={handleCertificadoFileChange}
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
              />
              <span className="text-[11px] text-slate-500 block mt-1">
                {haciendaCertificadoNombreNuevo
                  ? `Nuevo archivo seleccionado: ${haciendaCertificadoNombreNuevo}`
                  : haciendaTieneCertificado
                  ? `Archivo actual: ${haciendaCertificadoNombreArchivo || 'certificado.p12'}${haciendaCertificadoVenceEn ? ` · vence ${haciendaCertificadoVenceEn}` : ''}`
                  : 'Ningún certificado configurado todavía.'}
              </span>
            </div>
            <div>
              <label htmlFor="companyset-pin-del-certificado" className="block text-slate-600 mb-1 font-semibold">PIN del Certificado</label>
              <input id="companyset-pin-del-certificado"
                type="password"
                value={haciendaCertificadoPin}
                onChange={(e) => setHaciendaCertificadoPin(e.target.value)}
                placeholder={haciendaTieneCertificado ? '•••••••• (dejar en blanco para mantener el actual)' : 'PIN del certificado .p12'}
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
              />
            </div>
          </div>

          {currentUser.rol === 'Administrador' && (
            <fieldset className="border border-slate-200 rounded-xl p-3 space-y-2">
              <legend className="px-1 font-semibold text-slate-600">Corrección de numeración</legend>
              <p className="text-[11px] text-slate-500">
                Úselo solo si Hacienda rechaza con «el documento ya fue emitido» porque esta empresa ya facturó con otro sistema.
                Escriba el último número que ya emitió ante Hacienda; el siguiente comprobante usará ese más uno. Solo se puede subir.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {CAMPOS_CONSECUTIVO.map(({ campo, etiqueta }) => (
                  <div key={campo}>
                    <label htmlFor={`companyset-consecutivo-${campo}`} className="block text-slate-600 mb-1 font-semibold">{etiqueta} — último emitido</label>
                    <input id={`companyset-consecutivo-${campo}`}
                      type="number" min={haciendaConsecutivos[campo]} step="1" inputMode="numeric"
                      value={haciendaCorreccion[campo]}
                      onChange={(e) => setHaciendaCorreccion(prev => ({ ...prev, [campo]: e.target.value }))}
                      placeholder="Sin cambio"
                      aria-describedby={`companyset-consecutivo-${campo}-actual`}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
                    />
                    <span id={`companyset-consecutivo-${campo}-actual`} className="block text-[11px] text-slate-500 mt-0.5">Actual: {haciendaConsecutivos[campo]}</span>
                  </div>
                ))}
              </div>
            </fieldset>
          )}

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={handleProbarCertificado}
              disabled={haciendaProbando || !haciendaTieneCertificado}
              className="bg-slate-200 hover:bg-slate-300 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 px-4 py-2 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              {haciendaProbando ? 'Probando...' : 'Probar Configuración'}
            </button>

            <button
              type="submit"
              disabled={haciendaGuardando}
              className="text-white px-5 py-2 rounded-xl font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-60"
              style={{ backgroundColor: currentCompany.colorPrimario }}
            >
              <Check className="w-4 h-4" />
              {haciendaGuardando ? 'Guardando...' : 'Guardar Configuración Hacienda'}
            </button>
          </div>
        </form>
      )}

      {!isEditing && !isAdding && currentUser.rol === 'Administrador' && (
        <div className="mt-5 p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-4 text-xs">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
            <div className="flex items-center gap-2">
              <UsersIcon className="w-4 h-4 text-slate-600" style={{ color: currentCompany.colorPrimario }} />
              <div>
                <h4 className="font-bold text-slate-800">Usuarios y Colaboradores</h4>
                <p className="text-[11px] text-slate-500">
                  {activeUserCount} de {currentCompany.maxUsuarios} usuarios activos permitidos por tu plan
                </p>
              </div>
            </div>
            {!isAddingUser && (
              <button
                onClick={() => setIsAddingUser(true)}
                disabled={userLimitReached}
                className="flex items-center gap-1 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Nuevo Colaborador
              </button>
            )}
          </div>

          {userLimitReached && !isAddingUser && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Alcanzaste el límite de {currentCompany.maxUsuarios} usuarios de tu plan. Contacta al administrador de la plataforma para ampliarlo.</span>
            </div>
          )}

          {isAddingUser && (
            <form onSubmit={handleCreateUser} className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="companyset-nombre-completo" className="block text-slate-600 font-medium mb-1">Nombre Completo *</label>
                  <input id="companyset-nombre-completo"
                    type="text"
                    value={newUserNombre}
                    onChange={(e) => setNewUserNombre(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label htmlFor="companyset-correo" className="block text-slate-600 font-medium mb-1">Correo *</label>
                  <input id="companyset-correo"
                    type="email"
                    value={newUserCorreo}
                    onChange={(e) => setNewUserCorreo(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="companyset-nombre-de-usuario" className="block text-slate-600 font-medium mb-1">Nombre de Usuario *</label>
                  <input id="companyset-nombre-de-usuario"
                    type="text"
                    value={newUserUsuario}
                    onChange={(e) => setNewUserUsuario(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label htmlFor="companyset-contrasena" className="block text-slate-600 font-medium mb-1">Contraseña *</label>
                  <input id="companyset-contrasena"
                    type="password"
                    value={newUserContrasena}
                    onChange={(e) => setNewUserContrasena(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="companyset-rol" className="block text-slate-600 font-medium mb-1">Rol</label>
                <select id="companyset-rol"
                  value={newUserRol}
                  onChange={(e) => setNewUserRol(e.target.value as 'Administrador' | 'Profesional')}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                >
                  <option value="Profesional">Profesional</option>
                  <option value="Administrador">Administrador</option>
                </select>
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setIsAddingUser(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={userLimitReached}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
                >
                  Guardar Colaborador
                </button>
              </div>
            </form>
          )}

          <div className="space-y-1.5">
            {companyUsers.map(u => (
              <div key={u.id} className="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-lg">
                <div>
                  <span className="font-semibold text-slate-800 block">{u.nombre}</span>
                  <span className="text-[11px] text-slate-500">{u.usuario} &middot; {u.rol}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${u.activo ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                    {u.activo ? 'Activo' : 'Inactivo'}
                  </span>
                  <button
                    onClick={() => handleToggleUserActivo(u)}
                    title={u.activo ? 'Desactivar' : 'Activar'}
                    className="p-2.5 rounded-lg text-slate-500 hover:bg-slate-100"
                    aria-label={u.activo ? 'Desactivar' : 'Activar'}
                  >
                    <Power className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isEditing && !isAdding && currentUser.rol === 'Administrador' && (
        <div className="mt-5 p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-4 text-xs">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-slate-600" style={{ color: currentCompany.colorPrimario }} />
              <div>
                <h4 className="font-bold text-slate-800">Servicios y Tarifas</h4>
                <p className="text-[11px] text-slate-500">
                  Precio e IVA por servicio prestado. Si dejas el IVA en blanco, se usa el {currentCompany.ivaPorDefecto}% por defecto de la empresa.
                </p>
              </div>
            </div>
            {!isServicioFormOpen && (
              <div className="flex items-center gap-2">
                {currentCompany.perfilCompania !== 'Spa' && currentCompany.perfilCompania !== 'Legal' && (
                  <button
                    onClick={handleCargarServiciosDefecto}
                    disabled={cargandoServiciosDefecto}
                    className="flex items-center gap-1 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-60"
                  >
                    {cargandoServiciosDefecto ? 'Cargando...' : 'Cargar Servicios por Defecto'}
                  </button>
                )}
                <button
                  onClick={openNewServicioForm}
                  className="flex items-center gap-1 bg-slate-800 hover:bg-slate-900 text-white px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Nuevo Servicio o Artículo
                </button>
              </div>
            )}
          </div>

          {mensajeServiciosDefecto && (
            <p className="text-[11px] text-slate-500">{mensajeServiciosDefecto}</p>
          )}

          {isServicioFormOpen && (
            <form onSubmit={handleSubmitServicio} className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => { setServicioTipo('SERVICIO'); if (servicioUnidadMedida === 'Unid') setServicioUnidadMedida('Sp'); }}
                  className={`py-1.5 rounded-lg text-xs font-bold border-2 ${servicioTipo === 'SERVICIO' ? 'border-slate-800 bg-slate-50' : 'border-slate-200 text-slate-500'}`}
                >
                  Servicio (sesión/cita)
                </button>
                <button
                  type="button"
                  onClick={() => { setServicioTipo('ARTICULO'); setServicioUnidadMedida('Unid'); }}
                  className={`py-1.5 rounded-lg text-xs font-bold border-2 ${servicioTipo === 'ARTICULO' ? 'border-slate-800 bg-slate-50' : 'border-slate-200 text-slate-500'}`}
                >
                  Artículo (con existencias)
                </button>
              </div>
              <div className={`grid grid-cols-1 sm:grid-cols-4 gap-3`}>
                <div>
                  <label htmlFor="companyset-nombre" className="block text-slate-600 font-medium mb-1">Nombre {servicioTipo === 'ARTICULO' ? 'del Artículo' : 'del Servicio'} *</label>
                  <input id="companyset-nombre"
                    type="text"
                    value={servicioNombre}
                    onChange={(e) => setServicioNombre(e.target.value)}
                    placeholder={servicioTipo === 'ARTICULO' ? 'ej: Crema Post-Sesión 250ml' : 'ej: Sesión de Sauna'}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label htmlFor="companyset-precio" className="block text-slate-600 font-medium mb-1">Precio (₡) *</label>
                  <input id="companyset-precio"
                    type="number"
                    min="0"
                    step="0.01"
                    value={servicioPrecio}
                    onChange={(e) => setServicioPrecio(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                  />
                </div>
                {servicioTipo === 'SERVICIO' && (
                  <div>
                    <label htmlFor="companyset-duracion-min" className="block text-slate-600 font-medium mb-1">Duración (min) *</label>
                    <input id="companyset-duracion-min"
                      type="number"
                      min="1"
                      step="1"
                      value={servicioDuracion}
                      onChange={(e) => setServicioDuracion(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                    />
                  </div>
                )}
                <div>
                  <label htmlFor="companyset-iva-vacio-por-defecto" className="block text-slate-600 font-medium mb-1">% IVA (vacío = por defecto)</label>
                  <input id="companyset-iva-vacio-por-defecto"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={servicioIva}
                    onChange={(e) => setServicioIva(e.target.value)}
                    placeholder={`${currentCompany.ivaPorDefecto}%`}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                  />
                </div>
              </div>
              {servicioTipo === 'ARTICULO' && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 border-t border-slate-100">
                  <div>
                    <label htmlFor="companyset-campo" className="block text-slate-600 font-medium mb-1">{servicioEditId != null ? 'Existencia Actual' : 'Existencia Inicial'}</label>
                    <input id="companyset-campo"
                      type="number"
                      min="0"
                      step="1"
                      value={servicioStock}
                      onChange={(e) => setServicioStock(e.target.value)}
                      disabled={servicioEditId != null}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 disabled:opacity-60"
                    />
                    {servicioEditId != null && <p className="text-[11px] text-slate-500 mt-1">Use "Ajustar Stock" en la lista para cambiarla.</p>}
                  </div>
                  <div>
                    <label htmlFor="companyset-stock-minimo" className="block text-slate-600 font-medium mb-1">Stock Mínimo</label>
                    <input id="companyset-stock-minimo"
                      type="number"
                      min="0"
                      step="1"
                      value={servicioStockMinimo}
                      onChange={(e) => setServicioStockMinimo(e.target.value)}
                      placeholder="Alerta de faltante"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                    />
                  </div>
                  <div>
                    <label htmlFor="companyset-costo-unitario" className="block text-slate-600 font-medium mb-1">Costo Unitario (₡)</label>
                    <input id="companyset-costo-unitario"
                      type="number"
                      min="0"
                      step="0.01"
                      value={servicioCostoUnitario}
                      onChange={(e) => setServicioCostoUnitario(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                    />
                  </div>
                  <div>
                    <label htmlFor="companyset-codigo-de-barras" className="block text-slate-600 font-medium mb-1">Código de Barras</label>
                    <input id="companyset-codigo-de-barras"
                      type="text"
                      value={servicioCodigoBarras}
                      onChange={(e) => setServicioCodigoBarras(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                    />
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-100">
                <div className="relative">
                  <label htmlFor="companyset-codigo-cabys-obligatorio-para" className="block text-slate-600 font-medium mb-1">Código CABYS * (obligatorio para facturar)</label>
                  <input id="companyset-codigo-cabys-obligatorio-para"
                    type="text"
                    value={servicioCabys}
                    onChange={(e) => { setServicioCabys(e.target.value); buscarCabys(e.target.value); }}
                    placeholder="Digite el código de 13 dígitos o busque por nombre..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                  />
                  {servicioCabys && !/^\d{13}$/.test(servicioCabys.trim()) && (
                    <p className="text-[11px] text-amber-600 mt-1">El código CABYS debe tener exactamente 13 dígitos.</p>
                  )}
                  {buscandoCabys && <p className="text-[11px] text-slate-500 mt-1">Buscando...</p>}
                  {cabysResultados.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg">
                      {cabysResultados.map(r => (
                        <button
                          type="button"
                          key={r.codigo}
                          onClick={() => { setServicioCabys(r.codigo); setCabysResultados([]); }}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                        >
                          <span className="font-mono text-[11px] text-slate-500 block">{r.codigo}</span>
                          <span className="text-slate-800">{r.descripcion}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label htmlFor="companyset-unidad-de-medida-hacienda" className="block text-slate-600 font-medium mb-1">Unidad de Medida (Hacienda)</label>
                  <select id="companyset-unidad-de-medida-hacienda"
                    value={servicioUnidadMedida}
                    onChange={(e) => setServicioUnidadMedida(e.target.value as 'Sp' | 'Spe' | 'St' | 'Os' | 'h' | 'Unid')}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
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
                  </select>
                </div>
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setIsServicioFormOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700"
                >
                  {servicioEditId != null ? 'Guardar Cambios' : 'Guardar Servicio'}
                </button>
              </div>
            </form>
          )}

          <div className="space-y-1.5">
            {companyServicios.length === 0 && !isServicioFormOpen && (
              <p className="text-slate-500 text-center py-3">Todavía no has registrado ningún servicio.</p>
            )}
            {companyServicios.map(s => {
              const esArticulo = s.tipo === 'ARTICULO';
              const faltante = esArticulo && s.stockMinimo != null && (s.stock || 0) <= s.stockMinimo;
              return (
                <div key={s.id} className="p-2.5 bg-white border border-slate-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-slate-800 inline-flex items-center gap-1.5">
                        {s.nombre}
                        <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${esArticulo ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-600'}`}>
                          {esArticulo ? 'Artículo' : 'Servicio'}
                        </span>
                      </span>
                      <span className="text-[11px] text-slate-500 block">
                        ₡{s.precio.toLocaleString('es-CR')}
                        {esArticulo ? ` · Existencia: ${s.stock ?? 0}` : ` · ${s.duracionMinutos} min`}
                        {' · IVA '}{s.porcentajeIva != null ? `${s.porcentajeIva}%` : `${currentCompany.ivaPorDefecto}% (por defecto)`}
                      </span>
                      <div className="flex items-center gap-1.5 mt-1">
                        {!s.codigoCabys && (
                          <span className="text-[11px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full inline-block">Sin código CABYS — no se puede facturar</span>
                        )}
                        {faltante && (
                          <span className="text-[11px] font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded-full inline-block">Faltante (mín: {s.stockMinimo})</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${s.activo ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                        {s.activo ? 'Activo' : 'Inactivo'}
                      </span>
                      {esArticulo && (
                        <button
                          onClick={() => openAjustarStock(s)}
                          className="text-[11px] font-semibold text-indigo-700 hover:underline"
                        >
                          Ajustar Stock
                        </button>
                      )}
                      <button
                        onClick={() => openEditServicioForm(s)}
                        title="Editar"
                        className="p-2.5 rounded-lg text-slate-500 hover:bg-slate-100"
                        aria-label="Editar"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleToggleServicioActivo(s)}
                        title={s.activo ? 'Desactivar' : 'Activar'}
                        className="p-2.5 rounded-lg text-slate-500 hover:bg-slate-100"
                        aria-label={s.activo ? 'Desactivar' : 'Activar'}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {ajustandoStockId === s.id && (
                    <form onSubmit={handleGuardarAjusteStock} className="mt-2.5 pt-2.5 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
                      <div>
                        <label className="block text-slate-600 font-medium mb-1">Nueva Existencia</label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={ajusteStockValor}
                          onChange={(e) => setAjusteStockValor(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-slate-600 font-medium mb-1">Motivo (opcional)</label>
                        <input
                          type="text"
                          value={ajusteStockNotas}
                          onChange={(e) => setAjusteStockNotas(e.target.value)}
                          placeholder="ej: Conteo físico, merma, compra"
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setAjustandoStockId(null)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          disabled={ajusteStockGuardando}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60"
                        >
                          {ajusteStockGuardando ? 'Guardando…' : 'Guardar'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!isEditing && !isAdding && currentUser.rol === 'Administrador' && (
        <div className="mt-5 p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 text-xs">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2.5">
            <Clock className="w-4 h-4 text-slate-600" style={{ color: currentCompany.colorPrimario }} />
            <div>
              <h4 className="font-bold text-slate-800">Horario de Atención</h4>
              <p className="text-[11px] text-slate-500">Usado para calcular los horarios disponibles en la página pública de citas</p>
            </div>
          </div>

          <div className="space-y-1.5">
            {(Object.keys(diasLabel) as Array<keyof HorarioAtencion>).map(dia => {
              const cerrado = horario[dia].abre == null;
              return (
                <div key={dia} className="flex items-center gap-2.5 p-2 bg-white border border-slate-200 rounded-lg">
                  <span className="w-20 font-semibold text-slate-700">{diasLabel[dia]}</span>
                  <label className="flex items-center gap-1.5 text-slate-500">
                    <input type="checkbox" checked={cerrado} onChange={(e) => handleToggleCerrado(dia, e.target.checked)} />
                    Cerrado
                  </label>
                  {!cerrado && (
                    <>
                      <input
                        type="time"
                        value={horario[dia].abre || ''}
                        onChange={(e) => handleCambiarDia(dia, 'abre', e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1"
                      />
                      <span className="text-slate-500">a</span>
                      <input
                        type="time"
                        value={horario[dia].cierra || ''}
                        onChange={(e) => handleCambiarDia(dia, 'cierra', e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1"
                      />
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleGuardarHorario}
              className="text-white px-3 py-1.5 rounded-lg font-semibold"
              style={{ backgroundColor: currentCompany.colorPrimario }}
            >
              Guardar Horario
            </button>
            {horarioGuardado && (
              <span className="text-emerald-600 font-semibold flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Horario guardado
              </span>
            )}
          </div>
        </div>
      )}

      {!isEditing && !isAdding && currentUser.rol === 'Administrador' && (
        <div className="mt-5 p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 text-xs">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2.5">
            <Sparkles className="w-4 h-4 text-slate-600" style={{ color: currentCompany.colorPrimario }} />
            <div>
              <h4 className="font-bold text-slate-800">Porcentajes de Déficit/Superávit para Dietas</h4>
              <p className="text-[11px] text-slate-500">Los nutricionistas de esta empresa eligen entre estos porcentajes al calcular la prescripción calórica de una dieta. Puede incluir 0% (mantenimiento).</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {porcentajesDeEstaEmpresa.length === 0 && (
              <span className="text-slate-500">Sin porcentajes configurados — se usará el respaldo 10% / 15% / 20%.</span>
            )}
            {porcentajesDeEstaEmpresa.map(p => (
              <span key={p.id} className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-full pl-3 pr-1.5 py-1">
                {Number(p.porcentaje)}%
                <button
                  type="button"
                  onClick={() => onDeletePorcentajeDieta(p.id)}
                  className="text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-full p-2"
                  title="Eliminar"
                  aria-label="Eliminar"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              step="0.5"
              value={nuevoPorcentaje}
              onChange={(e) => setNuevoPorcentaje(e.target.value)}
              placeholder="ej: 25"
              className="w-28 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5"
            />
            <button
              type="button"
              onClick={handleAgregarPorcentaje}
              className="text-white px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1"
              style={{ backgroundColor: currentCompany.colorPrimario }}
            >
              <Plus className="w-3.5 h-3.5" /> Agregar
            </button>
          </div>
        </div>
      )}

      {!isEditing && !isAdding && currentUser.rol === 'Administrador' && (
        <PlantillaDietaManager
          idCompania={currentCompany.id}
          plantillasDieta={plantillasDieta}
          onSavePlantillaDieta={onSavePlantillaDieta}
          onDeletePlantillaDieta={onDeletePlantillaDieta}
          themeColor={currentCompany.colorPrimario}
        />
      )}

      {/* Editing / Creating Form */}
      {(isEditing || isAdding) && (
        <div className="mt-4 bg-slate-50 p-4 rounded-xl border border-slate-200/60 space-y-3 text-xs">
          <div className="font-bold text-slate-700 uppercase tracking-wide">
            {isAdding ? 'Registrar Nueva Sucursal / Clínica' : 'Personalizar Colores y Logos'}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-600 mb-1">Nombre Comercial</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
              />
            </div>
            <div>
              <label htmlFor="companyset-razon-social-juridica" className="block text-slate-600 mb-1">Razón Social Jurídica</label>
              <input id="companyset-razon-social-juridica"
                type="text"
                value={editRazon}
                onChange={(e) => setEditRazon(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-teal-500"
              />
            </div>
            <div>
              <label htmlFor="companyset-cedula-fisica-juridica-cr" className="block text-slate-600 mb-1">Cédula Física / Jurídica (CR)</label>
              <input id="companyset-cedula-fisica-juridica-cr"
                type="text"
                value={editIdent}
                onChange={(e) => setEditIdent(e.target.value)}
                placeholder="ej: 3-101-234567"
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-teal-500"
              />
            </div>
            <div>
              <label htmlFor="companyset-email-emisor-hacienda" className="block text-slate-600 mb-1">Email Emisor (Hacienda)</label>
              <input id="companyset-email-emisor-hacienda"
                type="text"
                value={editCorreo}
                onChange={(e) => setEditCorreo(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-teal-500"
              />
            </div>
            <div>
              <label htmlFor="companyset-perfil-de-la-clinica" className="block text-slate-600 mb-1">Perfil de la Clínica / Empresa</label>
              <select id="companyset-perfil-de-la-clinica"
                value={editPerfil}
                onChange={(e) => setEditPerfil(e.target.value as PerfilCompania)}
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
              >
                <option value="Ambas">Ambas (Fisioterapia y Nutrición)</option>
                <option value="Fisioterapia">Sólo Fisioterapia</option>
                <option value="Nutrición">Sólo Nutrición</option>
                <option value="Spa">Spa / Bienestar (Sauna, Cold Plunge, Masajes...)</option>
                <option value="Legal">Despacho de Abogados</option>
              </select>
            </div>
            <div>
              <label htmlFor="companyset-codigo-de-actividad-economica" className="block text-slate-600 mb-1">Código de Actividad Económica (Hacienda)</label>
              <input id="companyset-codigo-de-actividad-economica"
                type="text"
                value={editActividad}
                onChange={(e) => setEditActividad(e.target.value)}
                placeholder="ej: 869001"
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-teal-500"
              />
            </div>
            <div>
              <label htmlFor="companyset-iva-por-defecto" className="block text-slate-600 mb-1">% IVA por Defecto</label>
              <input id="companyset-iva-por-defecto"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={editIva}
                onChange={(e) => setEditIva(parseFloat(e.target.value) || 0)}
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-teal-500"
              />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <label className="flex items-center gap-2 text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editRequiereConfirmacion}
                  onChange={(e) => setEditRequiereConfirmacion(e.target.checked)}
                  className="w-3.5 h-3.5"
                />
                Las citas en línea requieren confirmación manual (no se auto-confirman)
              </label>
            </div>
            <div className="flex items-center gap-2 pt-1 sm:col-span-2">
              <label className="flex items-center gap-2 text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editRegimenSimplificado}
                  onChange={(e) => setEditRegimenSimplificado(e.target.checked)}
                  className="w-3.5 h-3.5"
                />
                Empresa inscrita en Régimen de Tributación Simplificada (no declara IVA por D-104 tradicional)
              </label>
            </div>
          </div>

          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="text-[11px] font-bold text-amber-800 uppercase mb-2">Ubicación Fiscal (requerida para Facturar)</p>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-slate-600 mb-1">Provincia</label>
                <select
                  value={editProvincia}
                  onChange={(e) => handleCambiarProvinciaFiscal(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-teal-500"
                >
                  <option value="">Seleccione...</option>
                  {COSTA_RICA_PROVINCIAS.map(p => (
                    <option key={p.codigo} value={p.codigo}>{p.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="companyset-canton" className="block text-slate-600 mb-1">Cantón</label>
                <select id="companyset-canton"
                  value={editCanton}
                  onChange={(e) => handleCambiarCantonFiscal(e.target.value)}
                  disabled={!editProvincia}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-teal-500 disabled:opacity-60"
                >
                  <option value="">Seleccione...</option>
                  {cantonesDisponiblesCompania.map(c => (
                    <option key={c.codigo} value={c.codigo}>{c.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="companyset-distrito" className="block text-slate-600 mb-1">Distrito</label>
                <select id="companyset-distrito"
                  value={editDistrito}
                  onChange={(e) => setEditDistrito(e.target.value)}
                  disabled={!editCanton}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-teal-500 disabled:opacity-60"
                >
                  <option value="">Seleccione...</option>
                  {distritosDisponiblesCompania.map(d => (
                    <option key={d.codigo} value={d.codigo}>{d.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="companyset-otras-senas-direccion-exacta" className="block text-slate-600 mb-1">Otras Señas (dirección exacta)</label>
                <input id="companyset-otras-senas-direccion-exacta"
                  type="text"
                  value={editOtrasSenas}
                  onChange={(e) => setEditOtrasSenas(e.target.value)}
                  placeholder="ej: 200m norte del parque central"
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-teal-500"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-600 mb-1">Color Primario Clínico</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={editColorPri}
                  onChange={(e) => setEditColorPri(e.target.value)}
                  className="w-8 h-8 rounded-md cursor-pointer border border-slate-200 p-0"
                />
                <input
                  type="text"
                  value={editColorPri}
                  onChange={(e) => setEditColorPri(e.target.value)}
                  className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs"
                />
              </div>
            </div>
            <div>
              <label className="block text-slate-600 mb-1">Color Controles Sidebar</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={editColorSide}
                  onChange={(e) => setEditColorSide(e.target.value)}
                  className="w-8 h-8 rounded-md cursor-pointer border border-slate-200 p-0"
                />
                <input
                  type="text"
                  value={editColorSide}
                  onChange={(e) => setEditColorSide(e.target.value)}
                  className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-slate-600 mb-1">Logo de la Empresa</label>
            <div className="flex items-center gap-3 mb-2">
              {editLogo && (
                <img src={editLogo} alt="Logo actual" className="w-14 h-14 rounded-xl object-cover border border-slate-200" />
              )}
              <label className="cursor-pointer bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold px-3 py-2 rounded-lg flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5" />
                {editLogo ? 'Cambiar imagen' : 'Subir imagen'}
                <input type="file" accept="image/*" onChange={handleLogoFileChange} className="hidden" />
              </label>
            </div>
            {logoError && <p className="text-[11px] text-rose-600 mb-2">{logoError}</p>}
            <span className="text-[11px] text-slate-500 block mb-1">O elija un logo predeterminado:</span>
            <div className="flex flex-wrap gap-2">
              {presetLogos.map((pl, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setEditLogo(pl.url)}
                  className="bg-white hover:bg-slate-100 border border-slate-200 text-[11px] text-slate-600 px-2 py-1 rounded-md"
                >
                  {pl.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => { setIsEditing(false); setIsAdding(false); }}
              className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-1.5 rounded-lg font-semibold"
            >
              Cancelar
            </button>
            <button
              onClick={isAdding ? createCompany : saveEdit}
              className="text-white px-4 py-1.5 rounded-lg font-semibold flex items-center gap-1.5"
              style={{ backgroundColor: editColorPri }}
            >
              <Check className="w-3.5 h-3.5" />
              {isAdding ? 'Registrar' : 'Guardar Cambios'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
