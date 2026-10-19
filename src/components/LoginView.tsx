import React, { useState } from 'react';
import { Company, User, DEFAULT_HORARIO_ATENCION, PerfilCompania } from '../data/mockData';
import { Building, Key, User as UserIcon, Shield, Sparkles, AlertCircle, ArrowRight, ArrowLeft, Clipboard, CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react';

interface LoginViewProps {
  onLoginSuccess: (user: User, company: Company | undefined) => void;
  onRegisterCompany: (company: Company, adminUser: User) => Promise<{ ok: boolean; error?: string }>;
}

export default function LoginView({
  onLoginSuccess,
  onRegisterCompany
}: LoginViewProps) {
  const [view, setView] = useState<'login' | 'register' | 'pendiente' | 'olvide'>('login');

  // Login states
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Forgot-password states
  const [forgotUsuario, setForgotUsuario] = useState('');
  const [forgotMessage, setForgotMessage] = useState('');
  const [forgotOk, setForgotOk] = useState(false);
  const [forgotSubmitting, setForgotSubmitting] = useState(false);

  // Register Company states
  const [compName, setCompName] = useState('');
  const [compRazon, setCompRazon] = useState('');
  const [compIdent, setCompIdent] = useState('');
  const [compCorreo, setCompCorreo] = useState('');
  const [compPerfil, setCompPerfil] = useState<PerfilCompania>('Ambas');
  const [compColor, setCompColor] = useState('#0f766e');

  // Register Admin states
  const [adminNombre, setAdminNombre] = useState('');
  const [adminUser, setAdminUser] = useState('');
  const [adminCorreo, setAdminCorreo] = useState('');
  const [adminPass, setAdminPass] = useState('');
  const [registerError, setRegisterError] = useState('');
  const [registerSubmitting, setRegisterSubmitting] = useState(false);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginSubmitting(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario: username.trim(), password })
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || 'No se pudo iniciar sesión.');
        return;
      }
      onLoginSuccess(data.user, data.company);
    } catch (err: any) {
      setLoginError('No se pudo conectar con el servidor. Intente de nuevo.');
    } finally {
      setLoginSubmitting(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotMessage('');
    if (!forgotUsuario.trim()) return;
    setForgotSubmitting(true);
    try {
      const res = await fetch('/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario: forgotUsuario.trim() })
      });
      const data = await res.json();
      setForgotOk(res.ok);
      setForgotMessage(res.ok ? data.message : (data.error || 'No se pudo procesar la solicitud.'));
    } catch (err: any) {
      setForgotOk(false);
      setForgotMessage('No se pudo conectar con el servidor. Intente de nuevo.');
    } finally {
      setForgotSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError('');

    if (!compName || !compRazon || !compIdent || !compCorreo || !adminNombre || !adminUser || !adminCorreo || !adminPass) {
      setRegisterError('Por favor complete todos los campos obligatorios.');
      return;
    }

    setRegisterSubmitting(true);
    try {
      // id: 0 (falso) le indica al servidor que es un registro nuevo — el id real lo asigna
      // la base de datos al insertar, en vez de adivinarlo aquí sin conocer el resto de
      // empresas ya registradas (que ya no se cargan en esta vista sin haber iniciado sesión).
      const newCompany: Company = {
        id: 0,
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
          : compPerfil === 'Spa'
          ? 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=120'
          : 'https://images.unsplash.com/photo-1505751172876-fa1923c5c528?w=120',
        actividadEconomica: compPerfil === 'Fisioterapia' ? '869001 (Fisioterapia)' : compPerfil === 'Nutrición' ? '851201 (Nutrición)' : compPerfil === 'Spa' ? 'Por definir (Spa/Bienestar)' : compPerfil === 'Legal' ? 'Por definir (Servicios jurídicos)' : '869001 (Fisioterapia y Nutrición)',
        perfilCompania: compPerfil,
        estadoSaas: 'PENDIENTE',
        maxUsuarios: 5,
        montoMensual: null,
        proximoVencimiento: null,
        horarioAtencion: DEFAULT_HORARIO_ATENCION,
        requiereConfirmacionCitas: compPerfil === 'Spa',
        regimenSimplificado: false,
        provincia: '',
        canton: '',
        distrito: '',
        otrasSenas: ''
      };

      const newAdminUser: User = {
        id: 0,
        idCompania: 0, // se reemplaza por el id real de newCompany una vez creada (ver onRegisterCompany)
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

      const result = await onRegisterCompany(newCompany, newAdminUser);
      if (!result.ok) {
        setRegisterError(result.error || 'No se pudo completar el registro. Intente de nuevo.');
        return;
      }
      setView('pendiente');
    } finally {
      setRegisterSubmitting(false);
    }
  };

  const inputBase = 'w-full min-h-11 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder:text-slate-500 hover:border-slate-600 focus:border-teal-400 transition-colors';
  const labelBase = 'block text-slate-300 text-xs font-semibold mb-1.5';
  const primaryBtn = 'w-full min-h-12 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 disabled:opacity-60 text-white font-bold text-sm rounded-xl transition-colors shadow-md flex items-center justify-center gap-2';

  return (
    <div className="surface-dark min-h-screen bg-slate-900 flex flex-col justify-center items-center px-4 py-8 relative overflow-hidden font-sans">

      {/* Decorative gradient background */}
      <div className="absolute top-0 left-0 w-full h-full bg-linear-to-b from-teal-950/20 to-slate-950/90 pointer-events-none z-0" aria-hidden="true" />
      <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-teal-500/10 blur-3xl pointer-events-none" aria-hidden="true" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" aria-hidden="true" />

      {/* Main card */}
      <main className="w-full max-w-xl bg-slate-900/80 backdrop-blur-md rounded-3xl border border-slate-800 shadow-2xl relative z-10 p-6 sm:p-8">

        {/* Logo and header */}
        <div className="text-center mb-6">
          <img src="/logo-tuanis-192.webp" alt="" width={80} height={80} className="w-20 h-20 mx-auto mb-3 drop-shadow-lg" />
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">TuanisBooking</h1>
          <p className="text-sm text-slate-400 mt-1.5 max-w-sm mx-auto leading-relaxed">
            Agenda, expedientes clínicos y facturación electrónica para clínicas y centros de bienestar en Costa Rica.
          </p>
        </div>

        {view === 'pendiente' ? (
          <div className="text-center py-6 space-y-4" role="status">
            <div className="inline-flex p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Clipboard className="w-8 h-8" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Registro recibido</h2>
              <p className="text-sm text-slate-300 mt-2 max-w-sm mx-auto">
                Tu empresa fue registrada correctamente y está pendiente de aprobación.
                Te contactaremos pronto para activar tu cuenta.
              </p>
            </div>
            <button
              type="button"
              onClick={() => { setView('login'); setUsername(''); setPassword(''); }}
              className={primaryBtn}
            >
              Volver al inicio de sesión
            </button>
          </div>
        ) : (
          <>
        {/* View switcher tab buttons */}
        {view !== 'olvide' && (
          <div className="grid grid-cols-2 p-1 bg-slate-950/80 border border-slate-800/80 rounded-xl mb-6" role="group" aria-label="Elegir acción">
            <button
              type="button"
              aria-pressed={view === 'login'}
              onClick={() => { setView('login'); setLoginError(''); }}
              className={`min-h-10 rounded-lg text-sm font-bold transition-colors ${
                view === 'login'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              aria-pressed={view === 'register'}
              onClick={() => { setView('register'); setRegisterError(''); }}
              className={`min-h-10 rounded-lg text-sm font-bold transition-colors ${
                view === 'register'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              Registrar empresa
            </button>
          </div>
        )}

        {/* 1. LOGIN VIEW */}
        {view === 'login' && (
          <form onSubmit={handleLoginSubmit} className="space-y-4" noValidate={false}>
            {loginError && (
              <div role="alert" className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{loginError}</span>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label htmlFor="login-usuario" className={labelBase}>Usuario</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500" aria-hidden="true">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <input
                    id="login-usuario"
                    type="text"
                    required
                    autoFocus
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="ej: admin_escazu"
                    aria-invalid={!!loginError}
                    className={`${inputBase} pl-9 pr-4`}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="login-password" className="block text-slate-300 text-xs font-semibold">Contraseña</label>
                  <button
                    type="button"
                    onClick={() => { setView('olvide'); setForgotMessage(''); setForgotUsuario(username); }}
                    className="text-xs text-teal-300 hover:text-teal-200 hover:underline underline-offset-2 transition-colors"
                  >
                    ¿Olvidó su contraseña?
                  </button>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500" aria-hidden="true">
                    <Key className="w-4 h-4" />
                  </div>
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••"
                    aria-invalid={!!loginError}
                    className={`${inputBase} pl-9 pr-12`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute inset-y-0 right-0 w-11 flex items-center justify-center text-slate-400 hover:text-white rounded-r-xl transition-colors"
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <button type="submit" disabled={loginSubmitting} className={primaryBtn}>
              {loginSubmitting ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : null}
              {loginSubmitting ? 'Ingresando…' : 'Iniciar sesión'}
              {!loginSubmitting && <ArrowRight className="w-4 h-4" aria-hidden="true" />}
            </button>
          </form>
        )}

        {/* 3. FORGOT PASSWORD VIEW */}
        {view === 'olvide' && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => { setView('login'); setForgotMessage(''); }}
              className="min-h-10 -ml-2 px-2 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-slate-800/60 flex items-center gap-1.5 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              Volver al inicio de sesión
            </button>
            <div>
              <h2 className="text-base font-bold text-white">Restablecer contraseña</h2>
              <p className="text-sm text-slate-400 mt-1">
                Indique su usuario o correo. Si la cuenta existe, le enviaremos una contraseña temporal de 8 dígitos.
              </p>
            </div>

            {forgotMessage && (
              <div
                role={forgotOk ? 'status' : 'alert'}
                className={`p-3.5 rounded-xl text-sm flex items-center gap-2.5 border ${forgotOk ? 'bg-teal-500/10 border-teal-500/30 text-teal-200' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'}`}
              >
                {forgotOk ? <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" /> : <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />}
                <span>{forgotMessage}</span>
              </div>
            )}

            <form onSubmit={handleForgotSubmit} className="space-y-4">
              <div>
                <label htmlFor="olvide-usuario" className={labelBase}>Usuario o correo</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500" aria-hidden="true">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <input
                    id="olvide-usuario"
                    type="text"
                    required
                    autoFocus
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={forgotUsuario}
                    onChange={(e) => setForgotUsuario(e.target.value)}
                    placeholder="ej: admin_escazu"
                    className={`${inputBase} pl-9 pr-4`}
                  />
                </div>
              </div>
              <button type="submit" disabled={forgotSubmitting} className={primaryBtn}>
                {forgotSubmitting && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                {forgotSubmitting ? 'Enviando…' : 'Enviar contraseña temporal'}
              </button>
            </form>
          </div>
        )}

        {/* 2. REGISTER NEW COMPANY / SIGNUP VIEW */}
        {view === 'register' && (
          <form onSubmit={handleRegisterSubmit} className="space-y-5">
            <p className="text-xs text-slate-400">Los campos marcados con <span className="text-slate-200 font-semibold">*</span> son obligatorios.</p>

            {/* A. COMPANY DATA */}
            <fieldset className="space-y-3">
              <legend className="flex items-center gap-1.5 text-xs font-bold text-teal-300 uppercase tracking-wider mb-3">
                <Building className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Información de la clínica / empresa</span>
              </legend>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="reg-nombre-comercial" className={labelBase}>Nombre comercial *</label>
                  <input
                    id="reg-nombre-comercial"
                    type="text"
                    required
                    autoComplete="organization"
                    value={compName}
                    onChange={(e) => setCompName(e.target.value)}
                    placeholder="ej: Clínica FisioMas"
                    className={`${inputBase} px-3`}
                  />
                </div>
                <div>
                  <label htmlFor="reg-razon-social" className={labelBase}>Razón social *</label>
                  <input
                    id="reg-razon-social"
                    type="text"
                    required
                    value={compRazon}
                    onChange={(e) => setCompRazon(e.target.value)}
                    placeholder="ej: Rehab S.A."
                    className={`${inputBase} px-3`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="reg-cedula" className={labelBase}>Cédula física o jurídica *</label>
                  <input
                    id="reg-cedula"
                    type="text"
                    required
                    inputMode="numeric"
                    value={compIdent}
                    onChange={(e) => setCompIdent(e.target.value)}
                    placeholder="ej: 3-102-345678"
                    className={`${inputBase} px-3`}
                  />
                </div>
                <div>
                  <label htmlFor="reg-correo-emisor" className={labelBase}>Correo emisor de facturas *</label>
                  <input
                    id="reg-correo-emisor"
                    type="email"
                    required
                    autoComplete="email"
                    value={compCorreo}
                    onChange={(e) => setCompCorreo(e.target.value)}
                    placeholder="ej: facturacion@clinica.com"
                    className={`${inputBase} px-3`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="reg-perfil" className={labelBase}>Tipo de servicios *</label>
                  <select
                    id="reg-perfil"
                    value={compPerfil}
                    onChange={(e) => setCompPerfil(e.target.value as PerfilCompania)}
                    className={`${inputBase} px-3`}
                  >
                    <option value="Ambas">Fisioterapia y nutrición</option>
                    <option value="Fisioterapia">Solo fisioterapia</option>
                    <option value="Nutrición">Solo nutrición</option>
                    <option value="Spa">Spa / bienestar (sauna, cold plunge, masajes…)</option>
                    <option value="Legal">Despacho de abogados</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="reg-color" className={labelBase}>Color de la marca *</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={compColor}
                      onChange={(e) => setCompColor(e.target.value)}
                      aria-label="Elegir un color personalizado"
                      className="w-11 h-11 shrink-0 rounded-xl bg-transparent border border-slate-700 p-1"
                    />
                    <select
                      id="reg-color"
                      value={compColor}
                      onChange={(e) => setCompColor(e.target.value)}
                      className={`${inputBase} px-3 flex-1`}
                    >
                      <option value="#0f766e">Verde azulado</option>
                      <option value="#d97706">Ámbar</option>
                      <option value="#2563eb">Azul clínico</option>
                      <option value="#9333ea">Púrpura</option>
                      {!['#0f766e', '#d97706', '#2563eb', '#9333ea'].includes(compColor) && (
                        <option value={compColor}>Personalizado ({compColor})</option>
                      )}
                    </select>
                  </div>
                </div>
              </div>
            </fieldset>

            {/* B. ADMIN USER DATA */}
            <fieldset className="space-y-3 pt-4 border-t border-slate-800/60">
              <legend className="flex items-center gap-1.5 text-xs font-bold text-amber-300 uppercase tracking-wider mb-3 pt-4">
                <Shield className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Usuario administrador</span>
              </legend>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="reg-admin-nombre" className={labelBase}>Nombre completo *</label>
                  <input
                    id="reg-admin-nombre"
                    type="text"
                    required
                    autoComplete="name"
                    value={adminNombre}
                    onChange={(e) => setAdminNombre(e.target.value)}
                    placeholder="ej: Dra. Sofía Blanco"
                    className={`${inputBase} px-3`}
                  />
                </div>
                <div>
                  <label htmlFor="reg-admin-correo" className={labelBase}>Correo profesional *</label>
                  <input
                    id="reg-admin-correo"
                    type="email"
                    required
                    autoComplete="email"
                    value={adminCorreo}
                    onChange={(e) => setAdminCorreo(e.target.value)}
                    placeholder="ej: s.blanco@clinica.com"
                    className={`${inputBase} px-3`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="reg-admin-usuario" className={labelBase}>Nombre de usuario *</label>
                  <input
                    id="reg-admin-usuario"
                    type="text"
                    required
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={adminUser}
                    onChange={(e) => setAdminUser(e.target.value)}
                    placeholder="ej: s_blanco"
                    className={`${inputBase} px-3`}
                  />
                </div>
                <div>
                  <label htmlFor="reg-admin-password" className={labelBase}>Contraseña *</label>
                  <div className="relative">
                    <input
                      id="reg-admin-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="new-password"
                      value={adminPass}
                      onChange={(e) => setAdminPass(e.target.value)}
                      placeholder="Contraseña segura"
                      className={`${inputBase} pl-3 pr-12`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute inset-y-0 right-0 w-11 flex items-center justify-center text-slate-400 hover:text-white rounded-r-xl transition-colors"
                      aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      aria-pressed={showPassword}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </fieldset>

            {registerError && (
              <div role="alert" className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{registerError}</span>
              </div>
            )}

            <button type="submit" disabled={registerSubmitting} className={primaryBtn}>
              {registerSubmitting ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Sparkles className="w-4 h-4 text-amber-300" aria-hidden="true" />}
              {registerSubmitting ? 'Registrando…' : 'Registrar empresa y cuenta'}
            </button>
          </form>
        )}
          </>
        )}
      </main>
    </div>
  );
}
