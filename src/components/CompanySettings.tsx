import React, { useState, useEffect } from 'react';
import { Company, CompaniaSmtpConfig, SmtpConfigInput, HaciendaConfig, HaciendaConfigInput } from '../data/mockData';
import { Plus, Check, Settings, Image as ImageIcon, Sparkles, Building, Database, Copy, Mail, Server, ShieldCheck, Upload, AlertCircle } from 'lucide-react';

interface CompanySettingsProps {
  companies: Company[];
  selectedCompanyId: number;
  onSelectCompany: (id: number) => void;
  onUpdateCompany: (company: Company) => void;
  onAddCompany: (company: Company) => void;
  smtpConfigs: CompaniaSmtpConfig[];
  onUpdateSmtpConfig: (config: SmtpConfigInput) => void;
}

export default function CompanySettings({
  companies,
  selectedCompanyId,
  onSelectCompany,
  onUpdateCompany,
  onAddCompany,
  smtpConfigs,
  onUpdateSmtpConfig
}: CompanySettingsProps) {
  const currentCompany = companies.find(c => c.id === selectedCompanyId) || companies[0];

  // Forms for editing/creating
  const [isEditing, setIsEditing] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  // Edit fields
  const [editName, setEditName] = useState(currentCompany.nombreComercial);
  const [editRazon, setEditRazon] = useState(currentCompany.razonSocial);
  const [editIdent, setEditIdent] = useState(currentCompany.identificacion);
  const [editCorreo, setEditCorreo] = useState(currentCompany.correoEmisor);
  const [editIva, setEditIva] = useState(currentCompany.ivaPorDefecto);
  const [editColorPri, setEditColorPri] = useState(currentCompany.colorPrimario);
  const [editColorSide, setEditColorSide] = useState(currentCompany.colorSidebar);
  const [editLogo, setEditLogo] = useState(currentCompany.logoUrl);
  const [editPerfil, setEditPerfil] = useState<'Fisioterapia' | 'Nutrición' | 'Ambas'>(currentCompany.perfilCompania || 'Ambas');

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
  const [haciendaAmbiente, setHaciendaAmbiente] = useState<'SANDBOX' | 'PRODUCCION'>('SANDBOX');
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
    fetch(`/api/hacienda-config/${selectedCompanyId}`)
      .then(res => res.json())
      .then((data: HaciendaConfig) => {
        setHaciendaAmbiente(data.ambiente);
        setHaciendaUsuarioAtv(data.usuarioAtv);
        setHaciendaPasswordAtv('');
        setHaciendaTienePasswordAtv(data.tienePasswordAtv);
        setHaciendaTieneCertificado(data.tieneCertificado);
        setHaciendaCertificadoNombreArchivo(data.certificadoNombreArchivo);
        setHaciendaCertificadoVenceEn(data.certificadoVenceEn);
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
    alert('¡Configuración SMTP y notificaciones guardadas con éxito!');
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
        ...(haciendaCertificadoPin.trim() ? { certificadoPin: haciendaCertificadoPin.trim() } : {})
      };
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
      setEditColorPri(comp.colorPrimario);
      setEditColorSide(comp.colorSidebar);
      setEditLogo(comp.logoUrl);
      setEditPerfil(comp.perfilCompania || 'Ambas');
    }
    setIsEditing(false);
    setIsAdding(false);
  };

  const saveEdit = () => {
    onUpdateCompany({
      ...currentCompany,
      nombreComercial: editName,
      razonSocial: editRazon,
      identificacion: editIdent,
      correoEmisor: editCorreo,
      ivaPorDefecto: parseFloat(editIva.toString()),
      colorPrimario: editColorPri,
      colorSidebar: editColorSide,
      logoUrl: editLogo,
      perfilCompania: editPerfil
    });
    setIsEditing(false);
  };

  const createCompany = () => {
    const newId = Math.max(...companies.map(c => c.id)) + 1;
    const newComp: Company = {
      id: newId,
      nombreComercial: editName || `Nueva Clínica ${newId}`,
      razonSocial: editRazon || "Clínica de Rehabilitación S.A.",
      tipoIdentificacion: "02",
      identificacion: editIdent || "3-101-000000",
      correoEmisor: editCorreo || "info@nuevaclinica.com",
      ivaPorDefecto: 4.0,
      colorPrimario: editColorPri || "#0d9488",
      colorSidebar: editColorSide || "#0f766e",
      logoUrl: editLogo || "https://images.unsplash.com/photo-1516549655169-df83a0774514?w=120&auto=format&fit=crop&q=60",
      actividadEconomica: "869001",
      perfilCompania: editPerfil
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
                    <span className="text-[10px] text-slate-500 block truncate max-w-[120px]">{c.identificacion}</span>
                  </div>
                </div>
                {isSelected && (
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px]" style={{ backgroundColor: c.colorPrimario }}>
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
            <span className="text-[11px] font-bold text-slate-400 uppercase">Identidad de Marca</span>
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
              <span className="text-slate-500 block">Impuesto IVA:</span>
              <span className="font-semibold text-slate-800 block">
                {currentCompany.ivaPorDefecto}% (Tasa Salud CR)
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Perfil de Clínica:</span>
              <span className="font-extrabold text-slate-800 bg-slate-100 border border-slate-200 rounded-md px-1.5 py-0.5 inline-block mt-0.5 text-[10px]">
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
              <p className="text-[10px] text-slate-500">Configura las credenciales de correo de la clínica para enviar recordatorios y confirmaciones automáticas de citas</p>
            </div>
          </div>

          {/* Toggle Activo */}
          <div className="flex items-center justify-between bg-white p-3.5 rounded-xl border border-slate-200">
            <div>
              <span className="font-bold text-slate-800 block">Notificaciones de Agenda Activas</span>
              <span className="text-[10px] text-slate-400 block">Si se apaga, las citas no enviarán correos automáticos de confirmación, modificación o cancelación</span>
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
              <label className="block text-slate-600 mb-1 font-semibold">Servidor Host SMTP</label>
              <input
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
                <label className="block text-slate-600 mb-1 font-semibold">Puerto</label>
                <input
                  type="number"
                  required
                  value={smtpPort}
                  onChange={(e) => setSmtpPort(parseInt(e.target.value))}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
                />
              </div>
              <div>
                <label className="block text-slate-600 mb-1 font-semibold">Seguridad</label>
                <select
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
              <label className="block text-slate-600 mb-1 font-semibold">Usuario de Autenticación SMTP</label>
              <input
                type="text"
                required
                value={smtpUsuario}
                onChange={(e) => setSmtpUsuario(e.target.value)}
                placeholder="ej: contacto@miempresa.com"
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block text-slate-600 mb-1 font-semibold">Contraseña SMTP / App Password</label>
              <input
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
              <label className="block text-slate-600 mb-1 font-semibold">Nombre de Remitente</label>
              <input
                type="text"
                required
                value={smtpRemitenteNombre}
                onChange={(e) => setSmtpRemitenteNombre(e.target.value)}
                placeholder="ej: Clínica FisioNutri"
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block text-slate-600 mb-1 font-semibold">Correo de Remitente</label>
              <input
                type="email"
                required
                value={smtpRemitenteCorreo}
                onChange={(e) => setSmtpRemitenteCorreo(e.target.value)}
                placeholder="ej: citas@miempresa.com"
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block text-slate-600 mb-1 font-semibold">Recordatorio Automático</label>
              <select
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

      {/* Hacienda Digital Signature configuration per company */}
      {!isEditing && !isAdding && (
        <form onSubmit={handleSaveHacienda} className="mt-5 p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-4 text-xs">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2.5">
            <ShieldCheck className="w-4 h-4 text-slate-600" style={{ color: currentCompany.colorPrimario }} />
            <div>
              <h4 className="font-bold text-slate-800">Firma Digital Hacienda (Facturación Electrónica)</h4>
              <p className="text-[10px] text-slate-500">Certificado criptográfico (.p12) y credenciales ATV para firmar comprobantes electrónicos</p>
            </div>
          </div>

          {haciendaMensaje && (
            <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${haciendaMensaje.tipo === 'ok' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-600'}`}>
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{haciendaMensaje.texto}</span>
            </div>
          )}

          {haciendaInfoCertificado && (
            <div className="p-3 rounded-xl border border-slate-200 bg-white text-[10.5px] space-y-1">
              <div><span className="font-bold text-slate-600">Sujeto: </span>{haciendaInfoCertificado.sujeto}</div>
              <div><span className="font-bold text-slate-600">Emisor: </span>{haciendaInfoCertificado.emisor}</div>
              <div><span className="font-bold text-slate-600">Vence: </span>{new Date(haciendaInfoCertificado.validoHasta).toLocaleDateString('es-CR')}</div>
              {haciendaInfoCertificado.expirado && <div className="text-rose-600 font-bold">Este certificado está VENCIDO.</div>}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-600 mb-1 font-semibold">Ambiente</label>
              <select
                value={haciendaAmbiente}
                onChange={(e) => setHaciendaAmbiente(e.target.value as 'SANDBOX' | 'PRODUCCION')}
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
              >
                <option value="SANDBOX">Sandbox (Pruebas)</option>
                <option value="PRODUCCION">Producción</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-600 mb-1 font-semibold">Usuario ATV</label>
              <input
                type="text"
                value={haciendaUsuarioAtv}
                onChange={(e) => setHaciendaUsuarioAtv(e.target.value)}
                placeholder="ej: cpf-01-1234-5678"
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-600 mb-1 font-semibold">Contraseña ATV</label>
            <input
              type="password"
              value={haciendaPasswordAtv}
              onChange={(e) => setHaciendaPasswordAtv(e.target.value)}
              placeholder={haciendaTienePasswordAtv ? '•••••••• (dejar en blanco para mantener la actual)' : 'Ingresa la contraseña ATV'}
              className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-600 mb-1 font-semibold flex items-center gap-1">
                <Upload className="w-3 h-3" /> Certificado Criptográfico (.p12)
              </label>
              <input
                type="file"
                accept=".p12,.pfx"
                onChange={handleCertificadoFileChange}
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
              />
              <span className="text-[10px] text-slate-400 block mt-1">
                {haciendaCertificadoNombreNuevo
                  ? `Nuevo archivo seleccionado: ${haciendaCertificadoNombreNuevo}`
                  : haciendaTieneCertificado
                  ? `Archivo actual: ${haciendaCertificadoNombreArchivo || 'certificado.p12'}${haciendaCertificadoVenceEn ? ` · vence ${haciendaCertificadoVenceEn}` : ''}`
                  : 'Ningún certificado configurado todavía.'}
              </span>
            </div>
            <div>
              <label className="block text-slate-600 mb-1 font-semibold">PIN del Certificado</label>
              <input
                type="password"
                value={haciendaCertificadoPin}
                onChange={(e) => setHaciendaCertificadoPin(e.target.value)}
                placeholder={haciendaTieneCertificado ? '•••••••• (dejar en blanco para mantener el actual)' : 'PIN del certificado .p12'}
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
              />
            </div>
          </div>

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
              <label className="block text-slate-600 mb-1">Razón Social Jurídica</label>
              <input
                type="text"
                value={editRazon}
                onChange={(e) => setEditRazon(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-slate-600 mb-1">Cédula Física / Jurídica (CR)</label>
              <input
                type="text"
                value={editIdent}
                onChange={(e) => setEditIdent(e.target.value)}
                placeholder="ej: 3-101-234567"
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-slate-600 mb-1">Email Emisor (Hacienda)</label>
              <input
                type="text"
                value={editCorreo}
                onChange={(e) => setEditCorreo(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-slate-600 mb-1">Perfil de la Clínica / Empresa</label>
              <select
                value={editPerfil}
                onChange={(e) => setEditPerfil(e.target.value as 'Fisioterapia' | 'Nutrición' | 'Ambas')}
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
              >
                <option value="Ambas">Ambas (Fisioterapia y Nutrición)</option>
                <option value="Fisioterapia">Sólo Fisioterapia</option>
                <option value="Nutrición">Sólo Nutrición</option>
              </select>
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
            <label className="block text-slate-600 mb-1">URL de Logo de la Empresa</label>
            <input
              type="text"
              value={editLogo}
              onChange={(e) => setEditLogo(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 mb-2"
            />
            <span className="text-[10px] text-slate-400 block mb-1">Preset Logos Rápidos:</span>
            <div className="flex gap-2">
              {presetLogos.map((pl, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setEditLogo(pl.url)}
                  className="bg-white hover:bg-slate-100 border border-slate-200 text-[10px] text-slate-600 px-2 py-1 rounded-md"
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

      {/* MySQL Integration Documentation Schema Panel */}
      <div className="mt-6 border-t border-slate-200 pt-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-slate-600" style={{ color: currentCompany.colorPrimario }} />
            <h4 className="text-xs font-bold text-slate-700 uppercase">Esquema MySQL / MariaDB (Usuarios y Empresas)</h4>
          </div>
          <span className="text-[9px] bg-slate-100 text-slate-600 border border-slate-200 font-mono font-bold px-2 py-0.5 rounded-full uppercase">
            phpMyAdmin CR
          </span>
        </div>
        
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Para implementar la seguridad con la tabla de usuarios y configurar empresas en tu servidor MySQL, ejecuta la siguiente estructura de datos en tu base de datos:
        </p>

        <div className="bg-slate-950 text-slate-300 p-3.5 rounded-xl border border-slate-900 text-[10px] font-mono relative max-h-72 overflow-y-auto">
          <button
            onClick={() => {
              navigator.clipboard.writeText(mysqlScript);
              alert("¡Script SQL copiado con éxito! Puedes pegarlo en phpMyAdmin u otra consola MySQL.");
            }}
            className="absolute right-3 top-3 bg-slate-800 hover:bg-slate-700 text-white p-1.5 rounded-md border border-slate-700/50 flex items-center gap-1.5 transition-all text-[9px] font-sans"
            title="Copiar Código SQL"
          >
            <Copy className="w-3 h-3 text-teal-400" />
            Copiar SQL
          </button>
          <pre className="whitespace-pre-wrap leading-relaxed select-all font-mono text-slate-400">
            {mysqlScript}
          </pre>
        </div>
      </div>
    </div>
  );
}

const mysqlScript = `-- ========================================================
-- FisioNutri CR - Esquema de Base de Datos para MySQL / MariaDB
-- Soporta Calendario, Citas, Seguridad y SMTP Configurable
-- ========================================================

-- 1. Estructura de tabla para 'companias'
CREATE TABLE IF NOT EXISTS \`companias\` (
  \`id_compania\` int(11) NOT NULL AUTO_INCREMENT,
  \`nombre_comercial\` varchar(150) NOT NULL,
  \`razon_social\` varchar(150) NOT NULL,
  \`tipo_identificacion\` enum('01','02','03','04') NOT NULL COMMENT '01: Física, 02: Jurídica, etc.',
  \`identificacion\` varchar(50) NOT NULL,
  \`correo_emisor\` varchar(100) NOT NULL,
  \`iva_por_defecto\` decimal(5,2) NOT NULL DEFAULT 4.00 COMMENT 'Tasa IVA Salud (4%)',
  \`color_primario\` varchar(20) DEFAULT '#0f766e',
  \`color_sidebar\` varchar(20) DEFAULT '#115e59',
  \`logo_url\` text DEFAULT NULL,
  \`perfil_compania\` enum('Fisioterapia', 'Nutrición', 'Ambas') NOT NULL DEFAULT 'Ambas' COMMENT 'Perfil clínico',
  \`actividad_economica\` varchar(150) DEFAULT '869001',
  \`estado\` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (\`id_compania\`),
  UNIQUE KEY \`idx_companias_identificacion\` (\`identificacion\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 2. Estructura de tabla para 'usuarios'
CREATE TABLE IF NOT EXISTS \`usuarios\` (
  \`id_usuario\` int(11) NOT NULL AUTO_INCREMENT,
  \`id_compania\` int(11) NOT NULL,
  \`nombre\` varchar(150) NOT NULL,
  \`usuario\` varchar(50) NOT NULL,
  \`correo\` varchar(100) NOT NULL,
  \`contrasena\` varchar(255) NOT NULL COMMENT 'Hash de contraseña',
  \`rol\` enum('Administrador','Profesional') NOT NULL DEFAULT 'Profesional',
  \`estado\` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (\`id_usuario\`),
  UNIQUE KEY \`idx_usuarios_username\` (\`usuario\`),
  CONSTRAINT \`fk_usuarios_compania\` FOREIGN KEY (\`id_compania\`) REFERENCES \`companias\` (\`id_compania\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 3. Estructura de tabla para 'citas'
CREATE TABLE IF NOT EXISTS \`citas\` (
  \`id_cita\` INT AUTO_INCREMENT PRIMARY KEY,
  \`id_compania\` INT NOT NULL,
  \`id_paciente\` INT NOT NULL,
  \`id_usuario_nutricionista\` INT NOT NULL,
  \`id_consulta\` INT NULL COMMENT 'Se llena cuando se usa Iniciar consulta',
  \`fecha_hora\` DATETIME NOT NULL,
  \`duracion_minutos\` INT NOT NULL DEFAULT 30,
  \`estado_cita\` ENUM('PROGRAMADA', 'CONFIRMADA', 'CANCELADA', 'COMPLETADA', 'NO_ASISTIO') NOT NULL DEFAULT 'PROGRAMADA',
  \`notas\` TEXT COMMENT 'Nota interna, no se incluye en los correos al paciente',
  \`confirmacion_enviada_en\` TIMESTAMP NULL,
  \`recordatorio_enviado_en\` TIMESTAMP NULL,
  \`cancelacion_enviada_en\` TIMESTAMP NULL,
  \`estado\` TINYINT(1) NOT NULL DEFAULT 1,
  \`creado_por\` INT,
  \`creado_en\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  \`actualizado_por\` INT,
  \`actualizado_en\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT \`chk_citas_duracion\` CHECK (\`duracion_minutos\` > 0 AND \`duracion_minutos\` <= 480),
  CONSTRAINT \`fk_citas_compania\` FOREIGN KEY (\`id_compania\`) REFERENCES \`companias\` (\`id_compania\`),
  CONSTRAINT \`fk_citas_paciente\` FOREIGN KEY (\`id_paciente\`) REFERENCES \`pacientes\` (\`id_paciente\`) ON DELETE CASCADE,
  CONSTRAINT \`fk_citas_nutricionista\` FOREIGN KEY (\`id_usuario_nutricionista\`) REFERENCES \`usuarios\` (\`id_usuario\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 4. Estructura de tabla para 'compania_smtp_config'
CREATE TABLE IF NOT EXISTS \`compania_smtp_config\` (
  \`id_config\` INT AUTO_INCREMENT PRIMARY KEY,
  \`id_compania\` INT NOT NULL,
  \`proveedor\` ENUM('GMAIL', 'OUTLOOK', 'OTRO') NOT NULL DEFAULT 'OTRO',
  \`smtp_host\` VARCHAR(255) NOT NULL,
  \`smtp_port\` INT NOT NULL DEFAULT 587,
  \`smtp_seguridad\` ENUM('TLS', 'SSL', 'NINGUNA') NOT NULL DEFAULT 'TLS',
  \`smtp_usuario\` VARCHAR(255) NOT NULL,
  \`smtp_password_cifrado\` VARBINARY(512) NOT NULL COMMENT 'AES-256-GCM',
  \`remitente_nombre\` VARCHAR(150),
  \`remitente_correo\` VARCHAR(150),
  \`recordatorio_horas_antes\` INT NOT NULL DEFAULT 24,
  \`activo\` TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Apaga el envío automático sin borrar la config',
  \`creado_en\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  \`actualizado_en\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY \`uq_compania_smtp_config\` (\`id_compania\`),
  CONSTRAINT \`fk_smtp_compania\` FOREIGN KEY (\`id_compania\`) REFERENCES \`companias\` (\`id_compania\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 5. Inyección de Registros de Prueba Iniciales
INSERT INTO \`companias\` (\`id_compania\`, \`nombre_comercial\`, \`razon_social\`, \`tipo_identificacion\`, \`identificacion\`, \`correo_emisor\`, \`iva_por_defecto\`, \`color_primario\`, \`color_sidebar\`, \`logo_url\`, \`perfil_compania\`) VALUES
(1, 'FisioNutri Escazú', 'Clínicas de Salud Integral S.A.', '02', '3-101-445566', 'contacto@fisionutriescazu.com', 4.00, '#0f766e', '#115e59', 'https://images.unsplash.com/photo-1505751172876-fa1923c5c528?w=120', 'Ambas'),
(2, 'Clínica Elronutri Alajuela', 'Eliecer Rojas Nutrición y Terapia', '01', '5-0392-0984', 'eliecer.rojas9@gmail.com', 4.00, '#d97706', '#92400e', 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=120', 'Nutrición');

INSERT INTO \`usuarios\` (\`id_usuario\`, \`id_compania\`, \`nombre\`, \`usuario\`, \`correo\`, \`contrasena\`, \`rol\`) VALUES
(1, 1, 'Dr. Keneth Rojas', 'admin_escazu', 'contacto@fisionutriescazu.com', '123456', 'Administrador'),
(2, 2, 'Dr. Eliecer Rojas', 'eliecer_alajuela', 'eliecer.rojas9@gmail.com', '123456', 'Administrador');
`;
