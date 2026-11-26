import React, { useState, type CSSProperties, type ReactNode } from 'react';
import { Company, User, DEFAULT_HORARIO_ATENCION, PerfilCompania } from '../data/mockData';
import { Building, Key, User as UserIcon, Shield, Sparkles, AlertCircle, ArrowRight, ArrowLeft, Clipboard, CheckCircle2, Eye, EyeOff, CalendarCheck, FileText, ShieldCheck } from 'lucide-react';
import { Button } from './ui/Button';
import { Card, CardBody } from './ui/Card';
import { Field } from './ui/Field';
import { Input } from './ui/Input';
import { Select } from './ui/Select';

interface LoginViewProps {
  onLoginSuccess: (user: User, company: Company | undefined) => void;
  onRegisterCompany: (company: Company, adminUser: User) => Promise<{ ok: boolean; error?: string }>;
}

const BENEFICIOS: { icon: typeof CalendarCheck; titulo: string; texto: string }[] = [
  { icon: CalendarCheck, titulo: 'Agenda y reservas en línea', texto: 'Citas, bloqueos y recordatorios en un solo calendario.' },
  { icon: FileText, titulo: 'Expedientes y facturación', texto: 'Historia clínica y comprobantes electrónicos de Hacienda.' },
  { icon: ShieldCheck, titulo: 'Seguro y por clínica', texto: 'Cada centro con su marca, su equipo y sus datos separados.' }
];

// Marca visual de la pantalla de acceso: sin clínica activa se usa el teal/esmeralda clínico por defecto
const panelStyle: CSSProperties = {
  backgroundImage:
    'radial-gradient(60% 50% at 85% 0%, color-mix(in oklab, var(--brand) 55%, white) 0%, transparent 70%), linear-gradient(155deg, color-mix(in oklab, var(--brand) 70%, black) 0%, color-mix(in oklab, var(--brand) 88%, black) 100%)'
};

function Alert({ tone, children }: { tone: 'error' | 'success'; children: ReactNode }) {
  const error = tone === 'error';
  return (
    <div
      role={error ? 'alert' : 'status'}
      className={`p-3.5 rounded-control border text-sm flex items-start gap-2.5 ${error ? 'bg-danger-soft border-danger/25 text-danger' : 'bg-success-soft border-success/25 text-success'}`}
    >
      {error ? <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />}
      <span>{children}</span>
    </div>
  );
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

  const passwordToggle = (
    <button
      type="button"
      onClick={() => setShowPassword(v => !v)}
      className="w-11 h-11 flex items-center justify-center text-fg-subtle hover:text-fg rounded-r-control transition-colors"
      aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
      aria-pressed={showPassword}
    >
      {showPassword ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
    </button>
  );

  const tabClass = (activa: boolean) =>
    `min-h-10 rounded-lg text-sm font-semibold transition-colors ${activa ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg'}`;

  return (
    <div className="min-h-screen bg-bg font-sans text-fg lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">

      {/* Panel de marca (solo lg+) */}
      <aside className="hidden lg:flex relative overflow-hidden flex-col justify-between p-12 xl:p-16 text-white" style={panelStyle}>
        <div className="flex items-center gap-3">
          <img src="/logo-tuanis-192.webp" alt="" width={48} height={48} className="w-12 h-12 rounded-card bg-white/10 p-1" />
          <span className="text-xl font-semibold tracking-tight">TuanisBooking</span>
        </div>

        <div className="max-w-md">
          <h2 className="text-display font-semibold tracking-tight">Toda su clínica, en un solo lugar.</h2>
          <p className="mt-3 text-base text-white/85">
            Agenda, expedientes clínicos y facturación electrónica para clínicas y centros de bienestar en Costa Rica.
          </p>
          <ul className="mt-10 space-y-5">
            {BENEFICIOS.map(({ icon: Icon, titulo, texto }) => (
              <li key={titulo} className="flex items-start gap-3.5">
                <span className="w-10 h-10 shrink-0 rounded-control bg-white/15 flex items-center justify-center" aria-hidden="true">
                  <Icon className="w-5 h-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold">{titulo}</p>
                  <p className="text-sm text-white/80">{texto}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-white/75">TuanisBooking © {new Date().getFullYear()}</p>
      </aside>

      {/* Formulario */}
      <main className="flex flex-col justify-center items-center px-4 py-8 sm:px-8">
        <div className="w-full max-w-xl">

          {/* Marca compacta en móvil */}
          <div className="lg:hidden text-center mb-6">
            <img src="/logo-tuanis-192.webp" alt="" width={64} height={64} className="w-16 h-16 mx-auto mb-3" />
            <h1 className="text-title font-semibold tracking-tight">TuanisBooking</h1>
            <p className="text-sm text-fg-muted mt-1.5 max-w-sm mx-auto">
              Agenda, expedientes clínicos y facturación electrónica para clínicas y centros de bienestar en Costa Rica.
            </p>
          </div>

          <Card className="shadow-md">
            <CardBody className="sm:p-8">
              {/* En lg+ el h1 vive aquí; en móvil lo lleva la marca compacta */}
              <h1 className="sr-only lg:not-sr-only lg:text-title lg:font-semibold lg:tracking-tight lg:mb-1">
                {view === 'register' ? 'Registre su clínica' : view === 'olvide' ? 'Restablecer contraseña' : view === 'pendiente' ? 'Registro recibido' : 'Bienvenido de nuevo'}
              </h1>
              <p className="hidden lg:block text-sm text-fg-muted mb-6">
                {view === 'register'
                  ? 'Cree la cuenta de su empresa y su usuario administrador.'
                  : view === 'login'
                  ? 'Ingrese sus credenciales para continuar.'
                  : ''}
              </p>

              {view === 'pendiente' ? (
                <div className="text-center py-6 space-y-4" role="status">
                  <div className="inline-flex p-3.5 rounded-card bg-warning-soft border border-warning/20 text-warning">
                    <Clipboard className="w-8 h-8" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="text-heading font-semibold">Registro recibido</h2>
                    <p className="text-sm text-fg-muted mt-2 max-w-sm mx-auto">
                      Tu empresa fue registrada correctamente y está pendiente de aprobación.
                      Te contactaremos pronto para activar tu cuenta.
                    </p>
                  </div>
                  <Button
                    size="lg"
                    fullWidth
                    onClick={() => { setView('login'); setUsername(''); setPassword(''); }}
                  >
                    Volver al inicio de sesión
                  </Button>
                </div>
              ) : (
                <>
                  {/* Cambio entre iniciar sesión y registrar */}
                  {view !== 'olvide' && (
                    <div className="grid grid-cols-2 p-1 bg-surface-muted rounded-control mb-6" role="group" aria-label="Elegir acción">
                      <button
                        type="button"
                        aria-pressed={view === 'login'}
                        onClick={() => { setView('login'); setLoginError(''); }}
                        className={tabClass(view === 'login')}
                      >
                        Iniciar sesión
                      </button>
                      <button
                        type="button"
                        aria-pressed={view === 'register'}
                        onClick={() => { setView('register'); setRegisterError(''); }}
                        className={tabClass(view === 'register')}
                      >
                        Registrar empresa
                      </button>
                    </div>
                  )}

                  {/* 1. LOGIN */}
                  {view === 'login' && (
                    <form onSubmit={handleLoginSubmit} className="space-y-4" noValidate={false}>
                      {loginError && <Alert tone="error">{loginError}</Alert>}

                      <Field label="Usuario">
                        {(p) => (
                          <Input
                            {...p}
                            type="text"
                            required
                            autoFocus
                            autoComplete="username"
                            autoCapitalize="none"
                            spellCheck={false}
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="ej: admin_escazu"
                            leadingIcon={<UserIcon />}
                            invalid={!!loginError}
                            aria-invalid={!!loginError}
                          />
                        )}
                      </Field>

                      <Field
                        label="Contraseña"
                        labelAction={
                          <button
                            type="button"
                            onClick={() => { setView('olvide'); setForgotMessage(''); setForgotUsuario(username); }}
                            className="min-h-10 -my-2.5 px-1 text-xs font-medium text-brand-ink hover:underline underline-offset-2"
                          >
                            ¿Olvidó su contraseña?
                          </button>
                        }
                      >
                        {(p) => (
                          <Input
                            {...p}
                            type={showPassword ? 'text' : 'password'}
                            required
                            autoComplete="current-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••"
                            leadingIcon={<Key />}
                            trailing={passwordToggle}
                            invalid={!!loginError}
                            aria-invalid={!!loginError}
                          />
                        )}
                      </Field>

                      <Button
                        type="submit"
                        size="lg"
                        fullWidth
                        loading={loginSubmitting}
                        disabled={loginSubmitting}
                      >
                        {loginSubmitting ? 'Ingresando…' : 'Iniciar sesión'}
                        {!loginSubmitting && <ArrowRight className="w-4 h-4" aria-hidden="true" />}
                      </Button>
                    </form>
                  )}

                  {/* 3. OLVIDÉ MI CONTRASEÑA */}
                  {view === 'olvide' && (
                    <div className="space-y-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-2"
                        icon={<ArrowLeft className="w-4 h-4" aria-hidden="true" />}
                        onClick={() => { setView('login'); setForgotMessage(''); }}
                      >
                        Volver al inicio de sesión
                      </Button>
                      <div>
                        <h2 className="text-heading font-semibold">Restablecer contraseña</h2>
                        <p className="text-sm text-fg-muted mt-1.5">
                          Indique su usuario o correo. Si la cuenta existe, enviaremos una contraseña temporal de 8 dígitos al correo registrado.
                        </p>
                        <p className="text-sm text-fg-muted mt-1.5">
                          Si no la ve en unos minutos, revise también las carpetas de Spam y Promociones.
                        </p>
                      </div>

                      {forgotMessage && <Alert tone={forgotOk ? 'success' : 'error'}>{forgotMessage}</Alert>}

                      <form onSubmit={handleForgotSubmit} className="space-y-4">
                        <Field label="Usuario o correo">
                          {(p) => (
                            <Input
                              {...p}
                              type="text"
                              required
                              autoFocus
                              autoComplete="username"
                              autoCapitalize="none"
                              spellCheck={false}
                              value={forgotUsuario}
                              onChange={(e) => setForgotUsuario(e.target.value)}
                              placeholder="ej: admin_escazu"
                              leadingIcon={<UserIcon />}
                            />
                          )}
                        </Field>
                        <Button type="submit" size="lg" fullWidth loading={forgotSubmitting}>
                          {forgotSubmitting ? 'Enviando…' : 'Enviar contraseña temporal'}
                        </Button>
                      </form>
                    </div>
                  )}

                  {/* 2. REGISTRO DE EMPRESA */}
                  {view === 'register' && (
                    <form onSubmit={handleRegisterSubmit} className="space-y-6">
                      <p className="text-xs text-fg-muted">Los campos marcados con <span className="text-danger font-semibold">*</span> son obligatorios.</p>

                      {/* A. Datos de la empresa */}
                      <fieldset className="space-y-4">
                        <legend className="flex items-center gap-1.5 text-xs font-semibold text-brand-ink uppercase tracking-widest mb-4">
                          <Building className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Información de la clínica / empresa</span>
                        </legend>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <Field label="Nombre comercial" required>
                            {(p) => <Input {...p} type="text" required autoComplete="organization" value={compName} onChange={(e) => setCompName(e.target.value)} placeholder="ej: Clínica FisioMas" />}
                          </Field>
                          <Field label="Razón social" required>
                            {(p) => <Input {...p} type="text" required value={compRazon} onChange={(e) => setCompRazon(e.target.value)} placeholder="ej: Rehab S.A." />}
                          </Field>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <Field label="Cédula física o jurídica" required>
                            {(p) => <Input {...p} type="text" required inputMode="numeric" value={compIdent} onChange={(e) => setCompIdent(e.target.value)} placeholder="ej: 3-102-345678" />}
                          </Field>
                          <Field label="Correo emisor de facturas" required>
                            {(p) => <Input {...p} type="email" required autoComplete="email" value={compCorreo} onChange={(e) => setCompCorreo(e.target.value)} placeholder="ej: facturacion@clinica.com" />}
                          </Field>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <Field label="Tipo de servicios" required>
                            {(p) => (
                              <Select {...p} value={compPerfil} onChange={(e) => setCompPerfil(e.target.value as PerfilCompania)}>
                                <option value="Ambas">Fisioterapia y nutrición</option>
                                <option value="Fisioterapia">Solo fisioterapia</option>
                                <option value="Nutrición">Solo nutrición</option>
                                <option value="Spa">Spa / bienestar (sauna, cold plunge, masajes…)</option>
                                <option value="Legal">Despacho de abogados</option>
                              </Select>
                            )}
                          </Field>
                          <Field label="Color de la marca" required>
                            {(p) => (
                              <div className="flex gap-2">
                                <input
                                  type="color"
                                  value={compColor}
                                  onChange={(e) => setCompColor(e.target.value)}
                                  aria-label="Elegir un color personalizado"
                                  className="w-11 h-11 shrink-0 rounded-control bg-surface border border-border-strong p-1"
                                />
                                <Select {...p} value={compColor} onChange={(e) => setCompColor(e.target.value)} wrapperClassName="flex-1 min-w-0">
                                  <option value="#0f766e">Verde azulado</option>
                                  <option value="#d97706">Ámbar</option>
                                  <option value="#2563eb">Azul clínico</option>
                                  <option value="#9333ea">Púrpura</option>
                                  {!['#0f766e', '#d97706', '#2563eb', '#9333ea'].includes(compColor) && (
                                    <option value={compColor}>Personalizado ({compColor})</option>
                                  )}
                                </Select>
                              </div>
                            )}
                          </Field>
                        </div>
                      </fieldset>

                      {/* B. Usuario administrador */}
                      <fieldset className="space-y-4 pt-6 border-t border-border">
                        <legend className="flex items-center gap-1.5 text-xs font-semibold text-brand-ink uppercase tracking-widest mb-4 pt-6">
                          <Shield className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Usuario administrador</span>
                        </legend>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <Field label="Nombre completo" required>
                            {(p) => <Input {...p} type="text" required autoComplete="name" value={adminNombre} onChange={(e) => setAdminNombre(e.target.value)} placeholder="ej: Dra. Sofía Blanco" />}
                          </Field>
                          <Field label="Correo profesional" required>
                            {(p) => <Input {...p} type="email" required autoComplete="email" value={adminCorreo} onChange={(e) => setAdminCorreo(e.target.value)} placeholder="ej: s.blanco@clinica.com" />}
                          </Field>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <Field label="Nombre de usuario" required>
                            {(p) => (
                              <Input
                                {...p}
                                type="text"
                                required
                                autoComplete="username"
                                autoCapitalize="none"
                                spellCheck={false}
                                value={adminUser}
                                onChange={(e) => setAdminUser(e.target.value)}
                                placeholder="ej: s_blanco"
                              />
                            )}
                          </Field>
                          <Field label="Contraseña" required>
                            {(p) => (
                              <Input
                                {...p}
                                type={showPassword ? 'text' : 'password'}
                                required
                                autoComplete="new-password"
                                value={adminPass}
                                onChange={(e) => setAdminPass(e.target.value)}
                                placeholder="Contraseña segura"
                                trailing={passwordToggle}
                              />
                            )}
                          </Field>
                        </div>
                      </fieldset>

                      {registerError && <Alert tone="error">{registerError}</Alert>}

                      <Button
                        type="submit"
                        size="lg"
                        fullWidth
                        loading={registerSubmitting}
                        icon={!registerSubmitting ? <Sparkles className="w-4 h-4" aria-hidden="true" /> : undefined}
                      >
                        {registerSubmitting ? 'Registrando…' : 'Registrar empresa y cuenta'}
                      </Button>
                    </form>
                  )}
                </>
              )}
            </CardBody>
          </Card>
        </div>
      </main>
    </div>
  );
}
