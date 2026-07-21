import React, { useState } from 'react';
import bcrypt from 'bcryptjs';
import { Company, User, defaultUsers, DEFAULT_HORARIO_ATENCION } from '../data/mockData';
import { Building, Key, User as UserIcon, Mail, Briefcase, Palette, Shield, Sparkles, AlertCircle, ArrowRight, Clipboard } from 'lucide-react';

const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$/;

function passwordMatches(stored: string, input: string): boolean {
  if (BCRYPT_HASH_PATTERN.test(stored)) {
    return bcrypt.compareSync(input, stored);
  }
  return stored === input;
}

interface LoginViewProps {
  companies: Company[];
  users: User[];
  onLogin: (user: User, companyId: number) => void;
  onRegisterCompany: (company: Company, adminUser: User) => void;
}

export default function LoginView({
  companies,
  users,
  onLogin,
  onRegisterCompany
}: LoginViewProps) {
  const [view, setView] = useState<'login' | 'register' | 'pendiente'>('login');
  
  // Login states
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Register Company states
  const [compName, setCompName] = useState('');
  const [compRazon, setCompRazon] = useState('');
  const [compIdent, setCompIdent] = useState('');
  const [compCorreo, setCompCorreo] = useState('');
  const [compPerfil, setCompPerfil] = useState<'Fisioterapia' | 'Nutrición' | 'Ambas'>('Ambas');
  const [compColor, setCompColor] = useState('#0f766e');
  
  // Register Admin states
  const [adminNombre, setAdminNombre] = useState('');
  const [adminUser, setAdminUser] = useState('');
  const [adminCorreo, setAdminCorreo] = useState('');
  const [adminPass, setAdminPass] = useState('');
  const [registerError, setRegisterError] = useState('');

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    const foundUser = users.find(u => u.usuario.trim().toLowerCase() === username.trim().toLowerCase());
    
    if (!foundUser) {
      setLoginError('Usuario no encontrado en la base de datos.');
      return;
    }

    if (!passwordMatches(foundUser.contrasena, password)) {
      setLoginError('Contraseña incorrecta. Intente de nuevo.');
      return;
    }

    const company = companies.find(c => c.id === foundUser.idCompania);
    if (company?.estadoSaas === 'PENDIENTE') {
      setLoginError('Esta cuenta está pendiente de aprobación. Un administrador se pondrá en contacto pronto.');
      return;
    }
    if (company?.estadoSaas === 'SUSPENDIDA') {
      setLoginError('Esta cuenta se encuentra suspendida. Contacte al administrador de la plataforma.');
      return;
    }

    // Success! Log in
    onLogin(foundUser, foundUser.idCompania);
  };

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError('');

    if (!compName || !compRazon || !compIdent || !compCorreo || !adminNombre || !adminUser || !adminCorreo || !adminPass) {
      setRegisterError('Por favor complete todos los campos obligatorios.');
      return;
    }

    // Check if user already exists
    const userExists = users.some(u => u.usuario.trim().toLowerCase() === adminUser.trim().toLowerCase());
    if (userExists) {
      setRegisterError('El nombre de usuario ya se encuentra registrado.');
      return;
    }

    // Create Company
    const nextCompanyId = Math.max(...companies.map(c => c.id)) + 1;
    const newCompany: Company = {
      id: nextCompanyId,
      nombreComercial: compName,
      razonSocial: compRazon,
      tipoIdentificacion: '02',
      identificacion: compIdent,
      correoEmisor: compCorreo,
      ivaPorDefecto: 4.0,
      colorPrimario: compColor,
      colorSidebar: compColor === '#0f766e' ? '#115e59' : compColor,
      logoUrl: compPerfil === 'Fisioterapia' 
        ? 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=120' 
        : compPerfil === 'Nutrición'
        ? 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=120'
        : 'https://images.unsplash.com/photo-1505751172876-fa1923c5c528?w=120',
      actividadEconomica: compPerfil === 'Fisioterapia' ? '869001 (Fisioterapia)' : '851201 (Nutrición)',
      perfilCompania: compPerfil,
      estadoSaas: 'PENDIENTE',
      maxUsuarios: 5,
      montoMensual: null,
      proximoVencimiento: null,
      horarioAtencion: DEFAULT_HORARIO_ATENCION
    };

    // Create User
    const nextUserId = Math.max(...users.map(u => u.id)) + 1;
    const newAdminUser: User = {
      id: nextUserId,
      idCompania: nextCompanyId,
      nombre: adminNombre,
      usuario: adminUser,
      correo: adminCorreo,
      contrasena: adminPass,
      rol: 'Administrador',
      activo: true,
      ubicacionDireccion: null,
      ubicacionLat: null,
      ubicacionLng: null,
      maxTiempoTrasladoMinutos: 45
    };

    onRegisterCompany(newCompany, newAdminUser);
    setView('pendiente');
  };

  const handleDemoLogin = (demoUser: string, demoPass: string) => {
    setUsername(demoUser);
    setPassword(demoPass);
    // Find and auto-login
    const found = users.find(u => u.usuario === demoUser);
    if (found) {
      onLogin(found, found.idCompania);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4 relative overflow-hidden font-sans">
      
      {/* Decorative gradient background */}
      <div className="absolute top-0 left-0 w-full h-full bg-linear-to-b from-teal-950/20 to-slate-950/90 pointer-events-none z-0" />
      <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-teal-500/10 blur-3xl" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-amber-500/10 blur-3xl" />

      {/* Main card */}
      <div className="w-full max-w-xl bg-slate-900/80 backdrop-blur-md rounded-3xl border border-slate-800 shadow-2xl relative z-10 p-6 sm:p-8">
        
        {/* Logo and header */}
        <div className="text-center mb-6">
          <div className="inline-flex p-3.5 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-400 mb-3">
            <Briefcase className="w-8 h-8" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">FisioNutri CR</h2>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            Plataforma costarricense multiempresa para clínicas de Terapia Física y Nutrición
          </p>
        </div>

        {view === 'pendiente' ? (
          <div className="text-center py-6 space-y-4">
            <div className="inline-flex p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Clipboard className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Registro recibido</h3>
              <p className="text-xs text-slate-400 mt-2 max-w-sm mx-auto">
                Tu empresa fue registrada correctamente y está pendiente de aprobación.
                Te contactaremos pronto para activar tu cuenta.
              </p>
            </div>
            <button
              onClick={() => { setView('login'); setUsername(''); setPassword(''); }}
              className="w-full bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-md"
            >
              Volver al inicio de sesión
            </button>
          </div>
        ) : (
          <>
        {/* View switcher tab buttons */}
        <div className="grid grid-cols-2 p-1 bg-slate-950/80 border border-slate-800/80 rounded-xl mb-6">
          <button
            onClick={() => { setView('login'); setLoginError(''); }}
            className={`py-2 rounded-lg text-xs font-bold transition-all ${
              view === 'login'
                ? 'bg-slate-800 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Ingreso al Sistema
          </button>
          <button
            onClick={() => { setView('register'); setRegisterError(''); }}
            className={`py-2 rounded-lg text-xs font-bold transition-all ${
              view === 'register'
                ? 'bg-slate-800 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Registrar Empresa (MySQL)
          </button>
        </div>

        {/* 1. LOGIN VIEW */}
        {view === 'login' && (
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            {loginError && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <div className="space-y-3.5">
              <div>
                <label className="block text-slate-400 text-xs font-semibold mb-1.5">Usuario de Acceso</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="ej: admin_escazu"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-hidden focus:border-teal-500 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 text-xs font-semibold mb-1.5">Contraseña de Seguridad</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    <Key className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-hidden focus:border-teal-500 transition-colors"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
            >
              Iniciar Sesión
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            {/* Quick-select Demo Users */}
            <div className="border-t border-slate-800 pt-5 mt-5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2.5">
                Acceso Rápido a Empresas Registradas (Demostración)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {companies.map((comp) => {
                  const compUsers = users.filter(u => u.idCompania === comp.id);
                  const representative = compUsers[0] || { usuario: 'admin', nombre: 'Admin' };
                  
                  return (
                    <button
                      key={comp.id}
                      type="button"
                      onClick={() => handleDemoLogin(representative.usuario, '123456')}
                      className="text-left p-3 rounded-xl bg-slate-950 hover:bg-slate-850 border border-slate-850 hover:border-slate-800 transition-all flex items-center justify-between group"
                    >
                      <div className="truncate pr-2">
                        <span className="text-[11px] font-bold text-white block group-hover:text-teal-400 transition-colors">
                          {comp.nombreComercial}
                        </span>
                        <span className="text-[9px] text-slate-500 block truncate">
                          Perfil: {comp.perfilCompania || 'Ambas'} ({representative.nombre})
                        </span>
                      </div>
                      <span className="text-[9px] font-bold text-teal-500/80 bg-teal-500/10 px-1.5 py-0.5 rounded-md shrink-0">
                        Ingresar
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </form>
        )}

        {/* 2. REGISTER NEW COMPANY / SIGNUP VIEW */}
        {view === 'register' && (
          <form onSubmit={handleRegisterSubmit} className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
            {registerError && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4" />
                <span>{registerError}</span>
              </div>
            )}

            {/* A. COMPANY DATA */}
            <div className="space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-teal-400 uppercase tracking-wider">
                <Building className="w-3.5 h-3.5" />
                <span>Información de la Clínica / Empresa</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 text-[10px] font-bold mb-1">Nombre Comercial *</label>
                  <input
                    type="text"
                    required
                    value={compName}
                    onChange={(e) => setCompName(e.target.value)}
                    placeholder="ej: Clínica FisioMas"
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2 text-xs text-white placeholder-slate-700 focus:outline-hidden focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-[10px] font-bold mb-1">Razón Social Jurídica *</label>
                  <input
                    type="text"
                    required
                    value={compRazon}
                    onChange={(e) => setCompRazon(e.target.value)}
                    placeholder="ej: Rehab S.A."
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2 text-xs text-white placeholder-slate-700 focus:outline-hidden focus:border-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 text-[10px] font-bold mb-1">Cédula Física o Jurídica *</label>
                  <input
                    type="text"
                    required
                    value={compIdent}
                    onChange={(e) => setCompIdent(e.target.value)}
                    placeholder="ej: 3-102-345678"
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2 text-xs text-white placeholder-slate-700 focus:outline-hidden focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-[10px] font-bold mb-1">Email Emisor (Factura Hacienda) *</label>
                  <input
                    type="email"
                    required
                    value={compCorreo}
                    onChange={(e) => setCompCorreo(e.target.value)}
                    placeholder="ej: facturacion@clinca.com"
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2 text-xs text-white placeholder-slate-700 focus:outline-hidden focus:border-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 text-[10px] font-bold mb-1">Perfil Compañía (Servicios) *</label>
                  <select
                    value={compPerfil}
                    onChange={(e) => setCompPerfil(e.target.value as 'Fisioterapia' | 'Nutrición' | 'Ambas')}
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2 text-xs text-white focus:outline-hidden focus:border-teal-500"
                  >
                    <option value="Ambas">Ambas (Fisio y Nutrición)</option>
                    <option value="Fisioterapia">Sólo Fisioterapia</option>
                    <option value="Nutrición">Sólo Nutrición</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 text-[10px] font-bold mb-1">Color Identitario Primario *</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={compColor}
                      onChange={(e) => setCompColor(e.target.value)}
                      className="w-8 h-8 rounded-md bg-transparent cursor-pointer border border-slate-800 p-0"
                    />
                    <select
                      value={compColor}
                      onChange={(e) => setCompColor(e.target.value)}
                      className="flex-1 bg-slate-950 border border-slate-850 rounded-lg px-2 text-xs text-white"
                    >
                      <option value="#0f766e">Teal Verde (#0f766e)</option>
                      <option value="#d97706">Amber Naranja (#d97706)</option>
                      <option value="#2563eb">Azul Clínico (#2563eb)</option>
                      <option value="#9333ea">Púrpura (#9333ea)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* B. ADMIN USER DATA */}
            <div className="space-y-3 pt-3 border-t border-slate-800/60">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400 uppercase tracking-wider">
                <Shield className="w-3.5 h-3.5" />
                <span>Usuario Administrador (Credenciales de Acceso)</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 text-[10px] font-bold mb-1">Nombre Completo del Profesional *</label>
                  <input
                    type="text"
                    required
                    value={adminNombre}
                    onChange={(e) => setAdminNombre(e.target.value)}
                    placeholder="ej: Dra. Sofía Blanco"
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2 text-xs text-white placeholder-slate-700 focus:outline-hidden focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-[10px] font-bold mb-1">Email Profesional *</label>
                  <input
                    type="email"
                    required
                    value={adminCorreo}
                    onChange={(e) => setAdminCorreo(e.target.value)}
                    placeholder="ej: s.blanco@clinica.com"
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2 text-xs text-white placeholder-slate-700 focus:outline-hidden focus:border-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 text-[10px] font-bold mb-1">Nombre de Usuario *</label>
                  <input
                    type="text"
                    required
                    value={adminUser}
                    onChange={(e) => setAdminUser(e.target.value)}
                    placeholder="ej: s_blanco"
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2 text-xs text-white placeholder-slate-700 focus:outline-hidden focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-[10px] font-bold mb-1">Contraseña de Acceso *</label>
                  <input
                    type="password"
                    required
                    value={adminPass}
                    onChange={(e) => setAdminPass(e.target.value)}
                    placeholder="Contraseña segura"
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2 text-xs text-white placeholder-slate-700 focus:outline-hidden focus:border-teal-500"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-md mt-2 flex items-center justify-center gap-1.5"
            >
              Registrar Empresa y Cuenta Admin
              <Sparkles className="w-4 h-4 text-amber-300" />
            </button>
          </form>
        )}
          </>
        )}
      </div>
    </div>
  );
}
