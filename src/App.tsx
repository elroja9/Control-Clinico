import { useState, useEffect, type CSSProperties } from 'react';
import {
  Users,
  Activity,
  Calendar,
  Building2,
  Search,
  Plus,
  Trash2,
  Edit,
  ClipboardList,
  Dumbbell,
  Apple,
  Printer,
  LogOut,
  Lock,
  Menu,
  X,
  UserCircle,
  Share2,
  Receipt,
  Landmark,
  FileSpreadsheet,
  BarChart3,
  Loader2,
  FolderOpen,
  BookOpen,
  type LucideIcon
} from 'lucide-react';
import { notify, confirmar } from './components/ui/Feedback';
import { Avatar } from './components/ui/Avatar';
import { Badge } from './components/ui/Badge';
import { Skeleton } from './components/ui/Skeleton';
import { Button } from './components/ui/Button';
import { IconButton } from './components/ui/IconButton';
import { Input } from './components/ui/Input';
import { Card } from './components/ui/Card';
import { EmptyState } from './components/ui/EmptyState';
import { StatCard } from './components/ui/StatCard';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
} from 'recharts';

import {
  defaultCompanies,
  defaultPatients,
  defaultConsultations,
  defaultUsers,
  defaultCitas,
  defaultSmtpConfigs,
  defaultNotificationLogs,
  defaultCalendarBlocks,
  defaultPorcentajesDieta,
  defaultPlantillasDieta,
  defaultServicios,
  Company,
  Patient,
  Consultation,
  User,
  Cita,
  CompaniaSmtpConfig,
  NotificationLog,
  SmtpConfigInput,
  CalendarBlock,
  PorcentajeDieta,
  PlantillaDieta,
  CompanyPayment,
  Servicio,
  Factura,
  CuentaCobrar,
  Proveedor,
  CuentaPagar,
  CasoLegal
} from './data/mockData';
import { terminoPersona } from './utils/terminoPersona';
import CompanySettings from './components/CompanySettings';
import PatientForm from './components/PatientForm';
import ConsultationForm from './components/ConsultationForm';
import ReportView from './components/ReportView';
import LoginView from './components/LoginView';
import AgendaCalendar from './components/AgendaCalendar';
import SaasAdminPanel from './components/SaasAdminPanel';
import MyProfile from './components/MyProfile';
import OnlineBookingShare from './components/OnlineBookingShare';
import FacturacionManager from './components/FacturacionManager';
import CxCManager from './components/CxCManager';
import ProveedorManager from './components/ProveedorManager';
import CxPManager from './components/CxPManager';
import ReportesFiscales from './components/ReportesFiscales';
import ReporteriaClinica from './components/ReporteriaClinica';
import CasosLegalesManager from './components/CasosLegalesManager';
import ManualUsuario from './components/ManualUsuario';
import ParametrosRentaManager from './components/ParametrosRentaManager';

// Recharts pinta con atributos SVG, que no resuelven var(--token): estos hex replican los tokens
// de src/index.css (border, border-strong, fg-subtle, fg, surface-muted, success, warning, danger).
const CHART_COLORS = {
  grid: '#e5e7eb',
  axis: '#cbd5e1',
  tick: '#64748b',
  label: '#0f172a',
  cursor: '#f1f3f6',
  success: '#047857',
  warning: '#b45309',
  danger: '#be123c'
} as const;

type TabId = 'dashboard' | 'patients' | 'consultations' | 'agenda' | 'branding' | 'saas-admin' | 'mi-perfil' | 'reservas-online' | 'facturacion' | 'cxp' | 'reportes-fiscales' | 'reporteria' | 'casos' | 'manual';

const TAB_IDS: TabId[] = ['dashboard', 'patients', 'consultations', 'agenda', 'branding', 'saas-admin', 'mi-perfil', 'reservas-online', 'facturacion', 'cxp', 'reportes-fiscales', 'reporteria', 'casos', 'manual'];

// Pestañas permitidas al rol Contador (finanzas + perfil + manual).
const TABS_CONTADOR: TabId[] = ['facturacion', 'cxp', 'reportes-fiscales', 'mi-perfil', 'manual'];

// La pestaña activa vive en el hash (#/agenda): refrescar la página no la pierde, se puede
// enlazar directo a una sección y el botón "Atrás" del navegador vuelve a la anterior.
const tabFromHash = (): TabId => {
  const h = window.location.hash.replace(/^#\/?/, '');
  return (TAB_IDS as string[]).includes(h) ? (h as TabId) : 'dashboard';
};

// Fecha local YYYY-MM-DD (toISOString() usa UTC y en Costa Rica adelanta el día después de las 6 p. m.)
const hoyLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

interface NavItem {
  id: TabId;
  label: string;
  icon: LucideIcon;
  iconClass?: string;
  badge?: string | number;
  badgeClass?: string;
}

export default function App() {
  // --- Persistent Storage Core (Synced with MySQL Backend) ---
  const [dbStatus, setDbStatus] = useState<{connected: boolean} | null>(null);
  
  const [companies, setCompanies] = useState<Company[]>(() => {
    const local = localStorage.getItem('fisio_companies');
    return local ? JSON.parse(local) : defaultCompanies;
  });

  const [patients, setPatients] = useState<Patient[]>(() => {
    const local = localStorage.getItem('fisio_patients');
    return local ? JSON.parse(local) : defaultPatients;
  });

  const [consultations, setConsultations] = useState<Consultation[]>(() => {
    const local = localStorage.getItem('fisio_consultations');
    return local ? JSON.parse(local) : defaultConsultations;
  });

  const [selectedCompanyId, setSelectedCompanyId] = useState<number>(() => {
    const local = localStorage.getItem('fisio_selected_company_id');
    return local ? parseInt(local) : 1;
  });

  const [users, setUsers] = useState<User[]>(() => {
    const local = localStorage.getItem('fisio_users');
    return local ? JSON.parse(local) : defaultUsers;
  });

  // El usuario actual ya no se restaura desde localStorage: la sesión real vive en una cookie
  // httpOnly firmada por el servidor (ver server/auth.ts) y se recupera vía GET /api/me al
  // montar la app — así un valor de localStorage manipulado no puede simular un login.
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  // Contador: solo finanzas, en solo lectura y sin datos clínicos (el servidor lo hace cumplir).
  const esContador = currentUser?.rol === 'Contador';
  const [authChecked, setAuthChecked] = useState(false);

  const [citas, setCitas] = useState<Cita[]>(() => {
    const local = localStorage.getItem('fisio_citas');
    return local ? JSON.parse(local) : defaultCitas;
  });

  const [smtpConfigs, setSmtpConfigs] = useState<CompaniaSmtpConfig[]>(() => {
    const local = localStorage.getItem('fisio_smtp_configs');
    return local ? JSON.parse(local) : defaultSmtpConfigs;
  });

  const [logs, setLogs] = useState<NotificationLog[]>(() => {
    const local = localStorage.getItem('fisio_notification_logs');
    return local ? JSON.parse(local) : defaultNotificationLogs;
  });

  const [calendarBlocks, setCalendarBlocks] = useState<CalendarBlock[]>(() => {
    const local = localStorage.getItem('fisio_calendar_blocks');
    return local ? JSON.parse(local) : defaultCalendarBlocks;
  });

  const [porcentajesDieta, setPorcentajesDieta] = useState<PorcentajeDieta[]>(() => {
    const local = localStorage.getItem('fisio_porcentajes_dieta');
    return local ? JSON.parse(local) : defaultPorcentajesDieta;
  });

  const [plantillasDieta, setPlantillasDieta] = useState<PlantillaDieta[]>(() => {
    const local = localStorage.getItem('fisio_plantillas_dieta');
    return local ? JSON.parse(local) : defaultPlantillasDieta;
  });

  const [servicios, setServicios] = useState<Servicio[]>(() => {
    const local = localStorage.getItem('fisio_servicios');
    return local ? JSON.parse(local) : defaultServicios;
  });

  const [companyPayments, setCompanyPayments] = useState<CompanyPayment[]>([]);
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [cxc, setCxc] = useState<CuentaCobrar[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [cxp, setCxp] = useState<CuentaPagar[]>([]);
  const [casos, setCasos] = useState<CasoLegal[]>([]);

  // --- Session bootstrap: restores the login from the httpOnly session cookie, if any ---
  useEffect(() => {
    fetch('/api/db-status')
      .then(res => res.json())
      .then(data => setDbStatus(data))
      .catch(err => console.error("Error fetching database status:", err));

    fetch('/api/me')
      .then(res => {
        if (!res.ok) throw new Error("No autenticado");
        return res.json();
      })
      .then(data => {
        setCurrentUser(data.user);
        setSelectedCompanyId(data.user.idCompania);
        if (data.company) {
          setCompanies(prev => prev.some((c: Company) => c.id === data.company.id) ? prev.map((c: Company) => c.id === data.company.id ? data.company : c) : [...prev, data.company]);
        }
      })
      .catch(() => {})
      .finally(() => setAuthChecked(true));
  }, []);

  // --- Tenant data load: only once there's a logged-in session, since every one of these
  // endpoints now requires auth and is scoped server-side to the current user's company ---
  useEffect(() => {
    if (!currentUser) return;

    fetch('/api/companies')
      .then(res => {
        // A 401 here means the session cookie expired (or was revoked) while the app was
        // open — bounce back to the login screen instead of silently running on stale data.
        if (res.status === 401) { setCurrentUser(null); throw new Error("Sesión expirada"); }
        if (!res.ok) throw new Error("API error");
        return res.json();
      })
      .then(data => { if (data && data.length > 0) setCompanies(data); })
      .catch(err => console.log("MySQL offline, using local storage fallback for companies"));

    // El Contador no carga nada clínico ni de configuración (el servidor le respondería 403).
    if (!esContador) {
    fetch('/api/users')
      .then(res => { if (!res.ok) throw new Error("API error"); return res.json(); })
      .then(data => { if (data && data.length > 0) setUsers(data); })
      .catch(err => console.log("MySQL offline, using local fallback for users"));

    fetch('/api/patients')
      .then(res => { if (!res.ok) throw new Error("API error"); return res.json(); })
      .then(data => { if (data && data.length > 0) setPatients(data); })
      .catch(err => console.log("MySQL offline, using local fallback for patients"));

    fetch('/api/consultations')
      .then(res => { if (!res.ok) throw new Error("API error"); return res.json(); })
      .then(data => { if (data && data.length > 0) setConsultations(data); })
      .catch(err => console.log("MySQL offline, using local fallback for consultations"));

    fetch('/api/citas')
      .then(res => { if (!res.ok) throw new Error("API error"); return res.json(); })
      .then(data => { if (data && data.length > 0) setCitas(data); })
      .catch(err => console.log("MySQL offline, using local fallback for citas"));

    fetch('/api/smtp-configs')
      .then(res => { if (!res.ok) throw new Error("API error"); return res.json(); })
      .then(data => { if (data && data.length > 0) setSmtpConfigs(data); })
      .catch(err => console.log("MySQL offline, using local fallback for SMTP configs"));

    fetch('/api/notification-logs')
      .then(res => { if (!res.ok) throw new Error("API error"); return res.json(); })
      .then(data => { if (data && data.length > 0) setLogs(data); })
      .catch(err => console.log("MySQL offline, using local fallback for logs"));

    fetch('/api/calendar-blocks')
      .then(res => { if (!res.ok) throw new Error("API error"); return res.json(); })
      .then(data => { if (data && data.length > 0) setCalendarBlocks(data); })
      .catch(err => console.log("MySQL offline, using local fallback for calendar blocks"));

    fetch('/api/porcentajes-dieta')
      .then(res => { if (!res.ok) throw new Error("API error"); return res.json(); })
      .then(data => { if (Array.isArray(data)) setPorcentajesDieta(data); })
      .catch(err => console.log("MySQL offline, using local fallback for porcentajes de dieta"));

    fetch('/api/plantillas-dieta')
      .then(res => { if (!res.ok) throw new Error("API error"); return res.json(); })
      .then(data => { if (Array.isArray(data)) setPlantillasDieta(data); })
      .catch(err => console.log("MySQL offline, using local fallback for plantillas de dieta"));
    }

    fetch('/api/servicios')
      .then(res => { if (!res.ok) throw new Error("API error"); return res.json(); })
      .then(data => { if (data && data.length > 0) setServicios(data); })
      .catch(err => console.log("MySQL offline, using local fallback for servicios"));

    fetch('/api/facturas')
      .then(res => { if (!res.ok) throw new Error("API error"); return res.json(); })
      .then(data => { if (data) setFacturas(data); })
      .catch(err => console.log("MySQL offline, no factura history available"));

    fetch('/api/cxc')
      .then(res => { if (!res.ok) throw new Error("API error"); return res.json(); })
      .then(data => { if (data) setCxc(data); })
      .catch(err => console.log("MySQL offline, no CxC history available"));

    fetch('/api/proveedores')
      .then(res => { if (!res.ok) throw new Error("API error"); return res.json(); })
      .then(data => { if (data) setProveedores(data); })
      .catch(err => console.log("MySQL offline, no proveedores available"));

    fetch('/api/cxp')
      .then(res => { if (!res.ok) throw new Error("API error"); return res.json(); })
      .then(data => { if (data) setCxp(data); })
      .catch(err => console.log("MySQL offline, no CxP history available"));

    if (!esContador) {
      fetch('/api/casos')
        .then(res => { if (!res.ok) throw new Error("API error"); return res.json(); })
        .then(data => { if (Array.isArray(data)) setCasos(data); })
        .catch(err => console.log("No se pudieron cargar los casos legales"));
    }
  }, [currentUser?.id]);

  // Citas created externally (public online booking, src/components/PublicBooking.tsx —
  // a separate unauthenticated endpoint) land straight in the DB with no way to notify an
  // already-open tab. Refetch on tab refocus (fast path for "I just came back to check")
  // plus a timer as a safety net for a tab that stays continuously visible.
  useEffect(() => {
    if (!currentUser || esContador) return;

    const cargarCitas = () => {
      fetch('/api/citas')
        .then(res => { if (!res.ok) throw new Error("API error"); return res.json(); })
        .then(data => { if (data && data.length > 0) setCitas(data); })
        .catch(err => console.log("No se pudo refrescar citas"));
    };

    const onVisibilityChange = () => { if (document.visibilityState === 'visible') cargarCitas(); };
    document.addEventListener('visibilitychange', onVisibilityChange);
    const intervalId = setInterval(cargarCitas, 30000);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      clearInterval(intervalId);
    };
  }, [currentUser?.id]);

  // Save state updates to LocalStorage as secondary local cache / fallback
  useEffect(() => {
    localStorage.setItem('fisio_companies', JSON.stringify(companies));
  }, [companies]);

  useEffect(() => {
    localStorage.setItem('fisio_patients', JSON.stringify(patients));
  }, [patients]);

  useEffect(() => {
    localStorage.setItem('fisio_consultations', JSON.stringify(consultations));
  }, [consultations]);

  useEffect(() => {
    localStorage.setItem('fisio_citas', JSON.stringify(citas));
  }, [citas]);

  useEffect(() => {
    localStorage.setItem('fisio_calendar_blocks', JSON.stringify(calendarBlocks));
  }, [calendarBlocks]);

  useEffect(() => {
    localStorage.setItem('fisio_porcentajes_dieta', JSON.stringify(porcentajesDieta));
  }, [porcentajesDieta]);

  useEffect(() => {
    localStorage.setItem('fisio_plantillas_dieta', JSON.stringify(plantillasDieta));
  }, [plantillasDieta]);

  useEffect(() => {
    localStorage.setItem('fisio_servicios', JSON.stringify(servicios));
  }, [servicios]);

  useEffect(() => {
    localStorage.setItem('fisio_smtp_configs', JSON.stringify(smtpConfigs));
  }, [smtpConfigs]);

  useEffect(() => {
    localStorage.setItem('fisio_notification_logs', JSON.stringify(logs));
  }, [logs]);

  useEffect(() => {
    localStorage.setItem('fisio_selected_company_id', selectedCompanyId.toString());
  }, [selectedCompanyId]);

  useEffect(() => {
    localStorage.setItem('fisio_users', JSON.stringify(users));
  }, [users]);

  // Sync selectedCompanyId with logged-in user's company to prevent cross-company viewing
  useEffect(() => {
    if (currentUser && selectedCompanyId !== currentUser.idCompania) {
      setSelectedCompanyId(currentUser.idCompania);
    }
  }, [currentUser, selectedCompanyId]);

  // Active Company Context
  const activeCompany = companies.find(c => c.id === selectedCompanyId) || companies[0];

  // App Navigation Tabs (sincronizadas con el hash de la URL, ver tabFromHash)
  const [activeTabState, setActiveTabState] = useState<TabId>(tabFromHash);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // El Contador solo ve estas pestañas: cualquier otra (hash manual, enlace viejo) cae en Facturación.
  // El servidor además le niega los datos clínicos (lista blanca por rol), esto es solo la capa visual.
  const activeTab: TabId = esContador && !TABS_CONTADOR.includes(activeTabState) ? 'facturacion' : activeTabState;
  useEffect(() => {
    if (esContador && activeTab !== activeTabState) window.location.hash = `/${activeTab}`;
  }, [esContador, activeTab, activeTabState]);

  const setActiveTab = (tab: TabId) => {
    setActiveTabState(tab);
    if (tabFromHash() !== tab) window.location.hash = `/${tab}`;
    window.scrollTo({ top: 0 });
  };

  useEffect(() => {
    const onHashChange = () => {
      setActiveTabState(tabFromHash());
      // "Atrás" desde el reporte de una consulta vuelve a la lista (el reporte es de solo lectura)
      setSelectedReportConsultation(null);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // El menú móvil se cierra con Escape
  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsMobileMenuOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isMobileMenuOpen]);

  // --- Login and Company Registration Handlers ---
  const handleLoginSuccess = (user: User, company: Company | undefined) => {
    setCurrentUser(user);
    setSelectedCompanyId(user.idCompania);
    if (company) {
      setCompanies(prev => prev.some(c => c.id === company.id) ? prev.map(c => c.id === company.id ? company : c) : [...prev, company]);
    }
    setActiveTab('dashboard');
  };

  // Registro público de empresa nueva: ninguna de las dos llamadas manda un `id` real (ver
  // LoginView) — el id definitivo lo asigna la base de datos, así que la segunda llamada
  // (crear el admin) usa el id que la primera realmente devolvió, no uno adivinado en el
  // cliente. Ambas respuestas se revisan explícitamente (`res.ok`) porque un 400 (usuario
  // duplicado, etc.) sigue siendo JSON válido y no cae solo en el `catch`.
  const handleRegisterCompany = async (newCompany: Company, newAdminUser: User): Promise<{ ok: boolean; error?: string }> => {
    try {
      const companyRes = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCompany)
      });
      const savedCompany = await companyRes.json();
      if (!companyRes.ok) {
        return { ok: false, error: savedCompany.error || 'No se pudo registrar la empresa.' };
      }
      setCompanies(prev => [...prev, savedCompany]);

      const userRes = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newAdminUser, idCompania: savedCompany.id })
      });
      const savedUser = await userRes.json();
      if (!userRes.ok) {
        return { ok: false, error: savedUser.error || 'No se pudo crear el usuario administrador.' };
      }
      setUsers(prev => [...prev, savedUser]);
      return { ok: true };
    } catch (err: any) {
      console.error("Error registering company to MySQL:", err);
      return { ok: false, error: 'No se pudo conectar con el servidor. Intente de nuevo.' };
    }
  };

  const handleUpdateCompany = (updated: Company) => {
    fetch('/api/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated)
    })
    .then(async res => {
      const data = await res.json();
      // Un 500 (p.ej. logo demasiado grande) sigue devolviendo JSON válido — sin este chequeo,
      // el catch de abajo nunca se dispara y el fallo queda invisible: la empresa se actualiza
      // "de forma optimista" en el estado local pero nunca se guardó de verdad en la base de
      // datos, así que el cambio desaparece en el siguiente refresco.
      if (!res.ok) {
        notify.error(data.error || 'No se pudo guardar la empresa.');
        return;
      }
      setCompanies(prev => prev.map(c => c.id === data.id ? data : c));
      notify.success('Los datos de la clínica se guardaron.');
    })
    .catch(err => {
      console.error("Error updating company in MySQL:", err);
      notify.error('Error de conexión al guardar la empresa.');
    });
  };

  const handleAddCompany = (newComp: Company) => {
    fetch('/api/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newComp)
    })
    .then(async res => {
      const data = await res.json();
      if (!res.ok) {
        notify.error(data.error || 'No se pudo crear la empresa.');
        return;
      }
      setCompanies(prev => [...prev, data]);
      notify.success('Empresa creada.');
    })
    .catch(err => {
      console.error("Error adding company to MySQL:", err);
      notify.error('Error de conexión al crear la empresa.');
    });
  };

  const handleLogout = () => {
    fetch('/api/logout', { method: 'POST' }).catch(() => {});
    setCurrentUser(null);
  };

  // Search & Filtering Queries
  const [patientSearch, setPatientSearch] = useState('');
  const [consultationSearch, setConsultationSearch] = useState('');
  const [casosClienteFiltro, setCasosClienteFiltro] = useState<number | null>(null);

  // Modals and form state
  const [isAddingPatient, setIsAddingPatient] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  
  const [activeConsultationPatient, setActiveConsultationPatient] = useState<Patient | null>(null);
  const [editingConsultation, setEditingConsultation] = useState<Consultation | null>(null);
  const [selectedReportConsultation, setSelectedReportConsultation] = useState<Consultation | null>(null);

  // Filter patients by active company
  const filteredPatientsByCompany = patients.filter(p => p.idCompania === selectedCompanyId);
  const searchedPatients = filteredPatientsByCompany.filter(p =>
    p.nombreCompleto.toLowerCase().includes(patientSearch.toLowerCase()) ||
    p.identificacion.includes(patientSearch)
  );

  // Filter consultations by active company
  const filteredConsultationsByCompany = consultations.filter(c => c.idCompania === selectedCompanyId);
  const searchedConsultations = filteredConsultationsByCompany.filter(c => {
    const pat = patients.find(p => p.id === c.idPaciente);
    const patientName = pat ? pat.nombreCompleto.toLowerCase() : '';
    return patientName.includes(consultationSearch.toLowerCase()) || c.motivo.toLowerCase().includes(consultationSearch.toLowerCase());
  });

  // --- Handlers ---
  const handleSavePatient = (savedPatient: Patient) => {
    fetch('/api/patients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(savedPatient)
    })
    .then(res => res.json())
    .then(data => {
      setPatients(prev => {
        const exists = prev.some(p => p.id === data.id);
        return exists ? prev.map(p => p.id === data.id ? data : p) : [...prev, data];
      });
    })
    .catch(err => {
      console.error("Error saving patient to MySQL:", err);
      const exists = patients.some(p => p.id === savedPatient.id);
      if (exists) {
        setPatients(prev => prev.map(p => p.id === savedPatient.id ? savedPatient : p));
      } else {
        setPatients(prev => [...prev, savedPatient]);
      }
    });
    setIsAddingPatient(false);
    setEditingPatient(null);
  };

  const handleDeletePatient = async (id: number) => {
    const paciente = patients.find(p => p.id === id);
    const ok = await confirmar({
      title: '¿Eliminar este expediente?',
      message: `${paciente ? `Se eliminará el expediente de ${paciente.nombreCompleto}. ` : ''}Sus consultas históricas se conservan.`,
      confirmText: 'Eliminar expediente',
      tone: 'danger'
    });
    if (!ok) return;
    fetch(`/api/patients/${id}`, { method: 'DELETE' })
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data.error || 'No se pudo eliminar el paciente.');
        setPatients(prev => prev.filter(p => p.id !== id));
        notify.success('Expediente eliminado.');
      })
      .catch(err => notify.error(err.message || 'No se pudo eliminar el paciente.'));
  };

  const handleSaveConsultation = (newConsultation: Consultation) => {
    fetch('/api/consultations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newConsultation)
    })
    .then(res => res.json())
    .then(data => {
      setConsultations(prev => {
        const exists = prev.some(c => c.id === data.id);
        return exists ? prev.map(c => c.id === data.id ? data : c) : [data, ...prev];
      });
      setSelectedReportConsultation(data);
    })
    .catch(err => {
      console.error("Error saving consultation to MySQL:", err);
      setConsultations(prev => [newConsultation, ...prev]);
      setSelectedReportConsultation(newConsultation);
    });
    setActiveConsultationPatient(null);
    setEditingConsultation(null);
  };

  const handleConsultationUpdated = (consulta: Consultation) => {
    setConsultations(prev => prev.map(c => c.id === consulta.id ? consulta : c));
    setSelectedReportConsultation(consulta);
  };

  const handleDeleteConsultation = async (id: number) => {
    const ok = await confirmar({
      title: '¿Eliminar este registro de consulta?',
      message: 'Esta acción no se puede deshacer.',
      confirmText: 'Eliminar consulta',
      tone: 'danger'
    });
    if (!ok) return;
    fetch(`/api/consultations/${id}`, { method: 'DELETE' })
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data.error || 'No se pudo eliminar la consulta.');
        setConsultations(prev => prev.filter(c => c.id !== id));
        notify.success('Consulta eliminada.');
      })
      .catch(err => notify.error(err.message || 'No se pudo eliminar la consulta.'));
  };

  // --- Agenda / Citas / SMTP / SOAP Integration Handlers ---
  // Devuelve la cita guardada (con el id real del servidor) y, si el servidor la envía, una
  // `advertencia`. Rechaza con el mensaje de error del servidor para que la agenda lo muestre.
  const handleSaveCita = async (savedCita: Cita): Promise<Cita & { advertencia?: string }> => {
    let res: Response;
    try {
      res = await fetch('/api/citas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(savedCita)
      });
    } catch (err) {
      console.error("Error saving cita to MySQL:", err);
      throw new Error('No se pudo conectar con el servidor para guardar la cita.');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'No se pudo guardar la cita.');
    const { advertencia, ...cita } = data as Cita & { advertencia?: string };
    setCitas(prev => {
      // Una cita nueva se envía con un id provisional (Date.now): el servidor devuelve el real.
      const sinProvisional = cita.id !== savedCita.id ? prev.filter(c => c.id !== savedCita.id) : prev;
      const exists = sinProvisional.some(c => c.id === cita.id);
      return exists ? sinProvisional.map(c => c.id === cita.id ? cita : c) : [...sinProvisional, cita];
    });
    return advertencia ? { ...cita, advertencia } : cita;
  };

  const handleSaveCalendarBlock = (block: CalendarBlock) => {
    fetch('/api/calendar-blocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(block)
    })
    .then(res => res.json())
    .then(data => {
      setCalendarBlocks(prev => {
        const exists = prev.some(b => b.id === data.id);
        return exists ? prev.map(b => b.id === data.id ? data : b) : [...prev, data];
      });
    })
    .catch(err => {
      console.error("Error saving calendar block to MySQL:", err);
      setCalendarBlocks(prev => {
        const exists = prev.some(b => b.id === block.id);
        return exists ? prev.map(b => b.id === block.id ? block : b) : [...prev, block];
      });
    });
  };

  const handleSavePorcentajeDieta = (porcentaje: PorcentajeDieta) => {
    fetch('/api/porcentajes-dieta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(porcentaje)
    })
    .then(res => res.json())
    .then(data => {
      setPorcentajesDieta(prev => {
        const exists = prev.some(p => p.id === data.id);
        return exists ? prev.map(p => p.id === data.id ? data : p) : [...prev, data];
      });
    })
    .catch(err => {
      console.error("Error saving porcentaje dieta to MySQL:", err);
      setPorcentajesDieta(prev => {
        const exists = prev.some(p => p.id === porcentaje.id);
        return exists ? prev.map(p => p.id === porcentaje.id ? porcentaje : p) : [...prev, porcentaje];
      });
    });
  };

  const handleSavePlantillaDieta = (plantilla: PlantillaDieta) => {
    fetch('/api/plantillas-dieta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(plantilla)
    })
    .then(res => res.json())
    .then(data => {
      setPlantillasDieta(prev => {
        const exists = prev.some(p => p.id === data.id);
        return exists ? prev.map(p => p.id === data.id ? data : p) : [...prev, data];
      });
    })
    .catch(err => {
      console.error("Error saving plantilla dieta to MySQL:", err);
      setPlantillasDieta(prev => {
        const exists = prev.some(p => p.id === plantilla.id);
        return exists ? prev.map(p => p.id === plantilla.id ? plantilla : p) : [...prev, plantilla];
      });
    });
  };

  const handleSaveServicio = (servicio: Servicio) => {
    fetch('/api/servicios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(servicio)
    })
    .then(res => res.json())
    .then(data => {
      setServicios(prev => {
        const exists = prev.some(s => s.id === data.id);
        return exists ? prev.map(s => s.id === data.id ? data : s) : [...prev, data];
      });
    })
    .catch(err => {
      console.error("Error saving servicio to MySQL:", err);
      setServicios(prev => {
        const exists = prev.some(s => s.id === servicio.id);
        return exists ? prev.map(s => s.id === servicio.id ? servicio : s) : [...prev, servicio];
      });
    });
  };

  const handleAjustarStock = async (idServicio: number, nuevoStock: number, notas: string): Promise<void> => {
    const res = await fetch(`/api/servicios/${idServicio}/ajustar-stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nuevoStock, notas })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo ajustar la existencia.');
    setServicios(prev => prev.map(s => s.id === idServicio ? { ...s, stock: data.stock } : s));
  };

  // A diferencia de otros handlers, no hay fallback local optimista: una factura
  // fallida debe mostrarse como error real, no simularse como si se hubiera creado.
  const handleCrearFactura = async (payload: {
    idCompania: number;
    idCita: number | null;
    idConsulta: number | null;
    idPaciente: number;
    condicionVenta: string;
    medioPago: string;
    montoRecibido: number | null;
    plazoCreditoDias: number | null;
    modoPrueba: boolean;
    lineas: Array<{ idServicio: number; cantidad: number }>;
  }): Promise<Factura> => {
    const res = await fetch('/api/facturas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo generar la factura.');
    setFacturas(prev => [...prev, data]);
    // Una venta a crédito crea su cuenta por cobrar y un artículo vendido rebaja existencias
    recargarFacturacion().catch(() => {});
    return data;
  };

  // Anular y las Notas mueven a la vez facturas, existencias y CxC, y el servidor decide cuáles
  // (p. ej. una Nota que Hacienda no recibió no aplica nada). En vez de imitar esas reglas aquí, se
  // recarga lo que pudo cambiar — también cuando la operación falla, porque la Nota fallida igual
  // queda registrada.
  const recargarFacturacion = async () => {
    const [resFacturas, resCxc, resServicios] = await Promise.all([fetch('/api/facturas'), fetch('/api/cxc'), fetch('/api/servicios')]);
    if (resFacturas.ok) setFacturas(await resFacturas.json());
    if (resCxc.ok) setCxc(await resCxc.json());
    if (resServicios.ok) {
      const data = await resServicios.json();
      if (data && data.length > 0) setServicios(data);
    }
  };

  const handleAnularFactura = async (idFactura: number, motivo: string): Promise<{ factura: Factura; notaCredito: Factura | null }> => {
    const res = await fetch(`/api/facturas/${idFactura}/anular`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo })
    });
    const data = await res.json();
    await recargarFacturacion().catch(() => {});
    if (!res.ok) throw new Error(data.error || 'No se pudo anular la factura.');
    return { factura: data.factura, notaCredito: data.notaCredito };
  };

  const handleEmitirNotaCredito = async (idFactura: number, payload: { motivo: string; lineas: Array<{ idServicio: number; cantidad: number }> }): Promise<Factura> => {
    const res = await fetch(`/api/facturas/${idFactura}/nota-credito`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    await recargarFacturacion().catch(() => {});
    if (!res.ok) throw new Error(data.error || 'No se pudo emitir la Nota de Crédito.');
    return data;
  };

  const handleEmitirNotaDebito = async (idFactura: number, payload: { motivo: string; lineas: Array<{ idServicio: number; cantidad: number }>; medioPago?: string }): Promise<Factura> => {
    const res = await fetch(`/api/facturas/${idFactura}/nota-debito`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    await recargarFacturacion().catch(() => {});
    if (!res.ok) throw new Error(data.error || 'No se pudo emitir la Nota de Débito.');
    return data;
  };

  const handleVerificarEstadoFactura = async (idFactura: number): Promise<Factura> => {
    const res = await fetch(`/api/facturas/${idFactura}/estado`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo verificar el estado con Hacienda.');
    let facturaActualizada: Factura | undefined;
    setFacturas(prev => prev.map(f => {
      if (f.id !== idFactura) return f;
      facturaActualizada = { ...f, estado: data.estado, mensajeError: data.mensajeError ?? null };
      return facturaActualizada;
    }));
    if (!facturaActualizada) throw new Error('Factura no encontrada en el estado local.');
    return facturaActualizada;
  };

  const handleReenviarFacturaCorreo = async (idFactura: number): Promise<NotificationLog> => {
    const res = await fetch(`/api/facturas/${idFactura}/reenviar-correo`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo reenviar la factura por correo.');
    handleAddNotificationLog(data);
    return data;
  };

  const handleRegistrarPagoCxc = async (idCuentaCobrar: number, monto: number, medioPago: string, referencia: string): Promise<void> => {
    const res = await fetch(`/api/cxc/${idCuentaCobrar}/pagos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monto, medioPago, referencia })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo registrar el abono.');
    setCxc(prev => prev.map(c => c.id === idCuentaCobrar
      ? { ...c, saldoPendiente: data.saldoPendiente, estado: data.estado, pagos: [...c.pagos, data.pago] }
      : c));
  };

  const handleSaveProveedor = async (proveedor: Partial<Proveedor>): Promise<void> => {
    const res = await fetch('/api/proveedores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(proveedor)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo guardar el proveedor.');
    setProveedores(prev => {
      const exists = prev.some(p => p.id === data.id);
      return exists ? prev.map(p => p.id === data.id ? data : p) : [...prev, data];
    });
  };

  const handleCrearCxp = async (payload: {
    idProveedor: number;
    numeroFacturaProveedor: string;
    esServicio: boolean;
    montoTotal?: number;
    plazoDias: number;
    notas: string;
    ivaAcreditable: number;
    lineas?: Array<{ idServicio: number; cantidad: number; costoUnitario: number }>;
  }): Promise<void> => {
    const res = await fetch('/api/cxp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo registrar la cuenta por pagar.');
    setCxp(prev => [data, ...prev]);
    if (!payload.esServicio) {
      const res2 = await fetch('/api/servicios');
      if (res2.ok) {
        const serviciosData = await res2.json();
        if (serviciosData && serviciosData.length > 0) setServicios(serviciosData);
      }
    }
  };

  const handleRegistrarPagoCxp = async (idCuentaPagar: number, monto: number, medioPago: string, referencia: string): Promise<void> => {
    const res = await fetch(`/api/cxp/${idCuentaPagar}/pagos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monto, medioPago, referencia })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo registrar el abono.');
    setCxp(prev => prev.map(c => c.id === idCuentaPagar
      ? { ...c, saldoPendiente: data.saldoPendiente, estado: data.estado, pagos: [...c.pagos, data.pago] }
      : c));
  };

  const handleImportarXmlCxp = async (xmlTexto: string, alimentaInventario: boolean): Promise<{ cxp: CuentaPagar; proveedor: Proveedor; articulosAfectados: number; avisoCreditoFiscal?: string | null }> => {
    const res = await fetch('/api/cxp/importar-xml', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ xmlTexto, alimentaInventario })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo importar el archivo XML.');
    setCxp(prev => [data.cxp, ...prev]);
    setProveedores(prev => {
      const exists = prev.some(p => p.id === data.proveedor.id);
      return exists ? prev.map(p => p.id === data.proveedor.id ? data.proveedor : p) : [...prev, data.proveedor];
    });
    if (alimentaInventario) {
      const res2 = await fetch('/api/servicios');
      if (res2.ok) {
        const serviciosData = await res2.json();
        if (serviciosData && serviciosData.length > 0) setServicios(serviciosData);
      }
    }
    return data;
  };

  const handleCargarServiciosDefecto = async (idCompania: number): Promise<Servicio[]> => {
    const res = await fetch(`/api/companies/${idCompania}/servicios-defecto`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudieron cargar los servicios por defecto.');
    setServicios(prev => [...prev, ...data.agregados]);
    return data.agregados;
  };

  const handleDeleteCalendarBlock = (id: number) => {
    fetch(`/api/calendar-blocks/${id}`, { method: 'DELETE' })
      .then(() => {
        setCalendarBlocks(prev => prev.filter(b => b.id !== id));
      })
      .catch(err => {
        console.error("Error deleting calendar block from MySQL:", err);
        setCalendarBlocks(prev => prev.filter(b => b.id !== id));
      });
  };

  const handleDeletePorcentajeDieta = (id: number) => {
    fetch(`/api/porcentajes-dieta/${id}`, { method: 'DELETE' })
      .then(() => {
        setPorcentajesDieta(prev => prev.filter(p => p.id !== id));
      })
      .catch(err => {
        console.error("Error deleting porcentaje dieta from MySQL:", err);
        setPorcentajesDieta(prev => prev.filter(p => p.id !== id));
      });
  };

  const handleDeletePlantillaDieta = (id: number) => {
    fetch(`/api/plantillas-dieta/${id}`, { method: 'DELETE' })
      .then(() => {
        setPlantillasDieta(prev => prev.filter(p => p.id !== id));
      })
      .catch(err => {
        console.error("Error deleting plantilla dieta from MySQL:", err);
        setPlantillasDieta(prev => prev.filter(p => p.id !== id));
      });
  };

  const handleUpdateSmtpConfig = (updatedSmtp: SmtpConfigInput) => {
    fetch('/api/smtp-configs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedSmtp)
    })
    .then(res => res.json())
    .then(data => {
      setSmtpConfigs(prev => {
        const exists = prev.some(s => s.idCompania === data.idCompania);
        return exists ? prev.map(s => s.idCompania === data.idCompania ? data : s) : [...prev, data];
      });
    })
    .catch(err => {
      console.error("Error saving SMTP config to MySQL:", err);
      setSmtpConfigs(prev => {
        const existing = prev.find(s => s.idCompania === updatedSmtp.idCompania);
        const merged: CompaniaSmtpConfig = {
          id: existing ? existing.id : Math.max(0, ...prev.map(s => s.id)) + 1,
          idCompania: updatedSmtp.idCompania,
          proveedor: updatedSmtp.proveedor,
          smtpHost: updatedSmtp.smtpHost,
          smtpPort: updatedSmtp.smtpPort,
          smtpSeguridad: updatedSmtp.smtpSeguridad,
          smtpUsuario: updatedSmtp.smtpUsuario,
          smtpPasswordCifrado: existing?.smtpPasswordCifrado || '',
          remitenteNombre: updatedSmtp.remitenteNombre,
          remitenteCorreo: updatedSmtp.remitenteCorreo,
          recordatorioHorasAntes: updatedSmtp.recordatorioHorasAntes,
          activo: updatedSmtp.activo,
          tieneContrasena: !!existing?.smtpPasswordCifrado
        };
        const exists = prev.some(s => s.idCompania === updatedSmtp.idCompania);
        return exists ? prev.map(s => s.idCompania === updatedSmtp.idCompania ? merged : s) : [...prev, merged];
      });
    });
  };

  const handleSaveUser = (user: User) => {
    fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user)
    })
    .then(async res => {
      const data = await res.json();
      if (!res.ok) {
        notify.error(data.error || 'No se pudo guardar el colaborador.');
        return;
      }
      setUsers(prev => {
        const exists = prev.some(u => u.id === data.id);
        return exists ? prev.map(u => u.id === data.id ? data : u) : [...prev, data];
      });
      notify.success('Datos del colaborador guardados.');
    })
    .catch(err => {
      console.error("Error saving user to MySQL:", err);
      notify.error('Error de conexión al guardar el colaborador.');
    });
  };

  const handleUpdateEstadoSaas = (companyId: number, estadoSaas: Company['estadoSaas']) => {
    fetch(`/api/companies/${companyId}/estado-saas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estadoSaas })
    })
    .then(res => res.json())
    .then(data => {
      setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, estadoSaas: data.estadoSaas } : c));
    })
    .catch(err => console.error("Error updating company estadoSaas:", err));
  };

  const handleUpdateMaxUsuarios = (companyId: number, maxUsuarios: number) => {
    const target = companies.find(c => c.id === companyId);
    if (!target) return;
    const updated = { ...target, maxUsuarios };
    fetch('/api/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated)
    })
    .then(res => res.json())
    .then(data => {
      setCompanies(prev => prev.map(c => c.id === companyId ? data : c));
    })
    .catch(err => {
      console.error("Error updating maxUsuarios:", err);
      setCompanies(prev => prev.map(c => c.id === companyId ? updated : c));
    });
  };

  const handleLoadPayments = (companyId: number) => {
    fetch(`/api/companies/${companyId}/pagos`)
      .then(res => res.json())
      .then(data => setCompanyPayments(data))
      .catch(err => console.error("Error loading company payments:", err));
  };

  const handleAddPayment = (payment: Omit<CompanyPayment, 'id'> & { montoMensual?: number | null; proximoVencimiento?: string | null }) => {
    fetch(`/api/companies/${payment.idCompania}/pagos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payment)
    })
    .then(res => res.json())
    .then(data => {
      setCompanyPayments(prev => [data, ...prev]);
      if (payment.montoMensual != null || payment.proximoVencimiento != null) {
        setCompanies(prev => prev.map(c => c.id === payment.idCompania
          ? { ...c, ...(payment.montoMensual != null ? { montoMensual: payment.montoMensual } : {}), ...(payment.proximoVencimiento != null ? { proximoVencimiento: payment.proximoVencimiento } : {}) }
          : c));
      }
    })
    .catch(err => console.error("Error adding company payment:", err));
  };

  const handleAddNotificationLog = (log: NotificationLog) => {
    setLogs(prev => [log, ...prev]);
  };

  const handleStartSoapFromCalendar = (idPaciente: number) => {
    const matched = patients.find(p => p.id === idPaciente);
    if (matched) {
      setActiveConsultationPatient(matched);
      setActiveTab('consultations');
    } else {
      notify.error('Paciente no encontrado en el sistema.');
    }
  };

  // --- Dashboard Data Generators ---
  const getWeightHistoryData = () => {
    // Generate simple chart showing previous weights for nutricion patients
    const nutConsultations = filteredConsultationsByCompany
      .filter(c => c.tipo === 'Nutrición' && c.antropometria)
      .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

    return nutConsultations.map(c => ({
      fecha: c.fecha,
      peso: c.antropometria?.peso,
      grasa: c.antropometria?.grasaCorporal
    }));
  };

  const getEvaDistribution = () => {
    // Count EVA occurrences for pain charts
    const count: { [key: number]: number } = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 };
    filteredConsultationsByCompany.forEach(c => {
      if (c.tipo === 'Fisioterapia' && c.fisioterapia) {
        const score = c.fisioterapia.evaDolor;
        if (score >= 1 && score <= 10) {
          count[score] = (count[score] || 0) + 1;
        }
      }
    });
    return Object.keys(count).map(score => ({
      escala: `EVA ${score}`,
      cantidad: count[parseInt(score)],
      score: parseInt(score)
    }));
  };

  if (!currentUser) {
    // Espera a que se resuelva GET /api/me antes de mostrar el login, para no parpadear la
    // pantalla de login un instante y luego saltar al dashboard si ya había una sesión válida.
    if (!authChecked) {
      return (
        <div className="min-h-screen bg-bg flex flex-col items-center justify-center gap-6 px-6" role="status">
          <img src="/logo-tuanis-192.webp" alt="" width={72} height={72} className="w-18 h-18 drop-shadow-sm" />
          <div className="text-center">
            <p className="text-heading font-semibold tracking-tight text-fg">TuanisBooking</p>
            <div className="mt-1.5 flex items-center justify-center gap-2 text-sm font-medium text-fg-muted">
              <Loader2 className="w-4 h-4 animate-spin text-brand" aria-hidden="true" />
              Cargando TuanisBooking…
            </div>
          </div>
          <div className="w-full max-w-xs space-y-2.5" aria-hidden="true">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        </div>
      );
    }
    return (
      <LoginView
        onLoginSuccess={handleLoginSuccess}
        onRegisterCompany={handleRegisterCompany}
      />
    );
  }

  // --- Datos derivados para la vista ---
  const hoy = hoyLocal();
  const citasDeLaCompania = citas.filter(c => c.idCompania === selectedCompanyId);
  const citasProgramadas = citasDeLaCompania.filter(c => c.estadoCita === 'PROGRAMADA').length;
  const citasHoy = citasDeLaCompania.filter(c => c.fechaHora.startsWith(hoy) && c.estadoCita !== 'CANCELADA').length;
  const esSaasAdmin = currentUser.idCompania === 7 && currentUser.rol === 'Administrador';
  // Perfil Legal: los "pacientes" son clientes y en lugar de consultas clínicas hay casos.
  const esLegal = activeCompany.perfilCompania === 'Legal';
  const persona = terminoPersona(activeCompany.perfilCompania);
  const casosDeLaCompania = casos.filter(c => c.idCompania === selectedCompanyId);
  const docsPendientes = casosDeLaCompania.filter(c => c.estado === 'ABIERTO').flatMap(c => c.documentos.filter(d => d.estado === 'PENDIENTE'));
  const docsVencidos = docsPendientes.filter(d => d.fechaLimite && d.fechaLimite < hoy).length;
  const horaActual = new Date().getHours();
  const saludo = horaActual < 12 ? 'Buenos días' : horaActual < 19 ? 'Buenas tardes' : 'Buenas noches';
  // "Dr. Keneth Rojas" → "Dr. Keneth" (con título se conserva el nombre de pila)
  const partesNombre = currentUser.nombre.trim().split(/\s+/);
  const nombreSaludo = /^(dr|dra|lic|licda|msc|ing|mag)\.?$/i.test(partesNombre[0]) ? partesNombre.slice(0, 2).join(' ') : partesNombre[0];
  const muestraNutricion = activeCompany.perfilCompania === 'Nutrición' || activeCompany.perfilCompania === 'Ambas';
  const muestraFisioterapia = activeCompany.perfilCompania === 'Fisioterapia' || activeCompany.perfilCompania === 'Ambas';

  // Consulta más reciente de cada paciente (por fecha, no por el orden en que llegó del servidor)
  const ultimaConsultaPorPaciente = new Map<number, Consultation>();
  filteredConsultationsByCompany.forEach(c => {
    const previa = ultimaConsultaPorPaciente.get(c.idPaciente);
    if (!previa || c.fecha > previa.fecha) ultimaConsultaPorPaciente.set(c.idPaciente, c);
  });
  const pacientesRecientes = [...filteredPatientsByCompany]
    .sort((a, b) => (ultimaConsultaPorPaciente.get(b.id)?.fecha ?? '').localeCompare(ultimaConsultaPorPaciente.get(a.id)?.fecha ?? ''))
    .slice(0, 5);
  const consultasOrdenadas = [...searchedConsultations].sort((a, b) => b.fecha.localeCompare(a.fecha));

  const weightHistoryData = getWeightHistoryData();
  const evaDistribution = getEvaDistribution();
  const hayConsultasFisio = filteredConsultationsByCompany.some(c => c.tipo === 'Fisioterapia');

  const navGroupsTodos: { label: string; items: NavItem[] }[] = [
    {
      label: esLegal ? 'Despacho' : 'Clínica',
      items: [
        { id: 'dashboard', label: esLegal ? 'Resumen' : 'Resumen Clínico', icon: Activity },
        { id: 'patients', label: esLegal ? 'Clientes' : 'Pacientes / Expedientes', icon: Users, badge: filteredPatientsByCompany.length },
        ...(esLegal ? [{ id: 'casos' as TabId, label: 'Casos y Documentos', icon: FolderOpen, badge: docsPendientes.length, badgeClass: 'bg-amber-100 text-amber-800' }] : []),
        { id: 'agenda', label: 'Agenda y Calendario', icon: Calendar, iconClass: 'text-emerald-600', badge: citasProgramadas, badgeClass: 'bg-emerald-100 text-emerald-800' },
        // Las consultas clínicas no aplican a un despacho
        ...(esLegal ? [] : [{ id: 'consultations' as TabId, label: 'Historial de Citas', icon: ClipboardList, badge: filteredConsultationsByCompany.length }])
      ]
    },
    {
      label: 'Finanzas',
      items: [
        { id: 'facturacion', label: 'Facturación', icon: Receipt, badge: facturas.filter(f => f.idCompania === selectedCompanyId).length },
        { id: 'cxp', label: 'Cuentas por Pagar', icon: Landmark, badge: cxp.filter(c => c.idCompania === selectedCompanyId && c.estado === 'PENDIENTE').length },
        { id: 'reportes-fiscales', label: 'Reportes Fiscales', icon: FileSpreadsheet },
        // Reportería cuenta pacientes y sesiones clínicas
        ...(esLegal ? [] : [{ id: 'reporteria' as TabId, label: 'Reportería', icon: BarChart3 }])
      ]
    },
    {
      label: 'Configuración',
      items: [
        { id: 'branding', label: esLegal ? 'Personalizar Despacho' : 'Personalizar Clínica', icon: Building2 },
        { id: 'mi-perfil', label: 'Mi Perfil', icon: UserCircle },
        { id: 'reservas-online', label: 'Reservas en Línea', icon: Share2 },
        { id: 'manual', label: 'Manual de Usuario', icon: BookOpen },
        ...(esSaasAdmin ? [{ id: 'saas-admin' as TabId, label: 'Administración SaaS', icon: Lock, iconClass: 'text-amber-600' }] : [])
      ]
    }
  ];

  // El Contador solo ve Finanzas (Facturación, CxP, Reportes Fiscales) más Mi Perfil y Manual.
  const navGroups = esContador
    ? navGroupsTodos
        .map(g => ({ ...g, items: g.items.filter(i => TABS_CONTADOR.includes(i.id)) }))
        .filter(g => g.items.length > 0)
    : navGroupsTodos;

  const badgeLabel = (id: TabId) =>
    id === 'agenda' ? 'citas sin confirmar' : id === 'cxp' ? 'cuentas pendientes' : id === 'facturacion' ? 'comprobantes' : id === 'casos' ? 'documentos pendientes' : 'registros';

  const hayFormularioAbierto = !!activeConsultationPatient || isAddingPatient || !!editingPatient;

  // Navegar desde el menú también cierra el reporte o el formulario abierto; si hay un
  // formulario a medio llenar se pide confirmación para no perder lo digitado.
  const navigateTo = async (tab: TabId) => {
    setIsMobileMenuOpen(false);
    if (hayFormularioAbierto) {
      const ok = await confirmar({
        title: '¿Salir sin guardar?',
        message: 'Tiene un formulario abierto. Si sale ahora, los cambios que no ha guardado se perderán.',
        confirmText: 'Salir sin guardar',
        cancelText: 'Seguir editando',
        tone: 'warning'
      });
      if (!ok) return;
      setActiveConsultationPatient(null);
      setEditingConsultation(null);
      setIsAddingPatient(false);
      setEditingPatient(null);
    }
    setSelectedReportConsultation(null);
    setActiveTab(tab);
  };

  const vistaSecundariaAbierta = hayFormularioAbierto || !!selectedReportConsultation;

  const renderNav = () => (
    <nav aria-label="Secciones de la aplicación" className="space-y-5">
      {navGroups.map(group => (
        <div key={group.label}>
          <span className="text-caption font-semibold text-fg-subtle uppercase tracking-widest px-3 block mb-1.5">{group.label}</span>
          <ul className="space-y-0.5">
            {group.items.map(item => {
              const active = activeTab === item.id && !vistaSecundariaAbierta;
              const Icon = item.icon;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => navigateTo(item.id)}
                    aria-current={active ? 'page' : undefined}
                    className={`relative w-full min-h-10 flex items-center justify-between gap-2 pl-4 pr-3 py-2 rounded-control text-sm font-medium transition-colors duration-150 ${
                      active ? 'bg-brand/10 text-brand-ink font-semibold' : 'text-fg-muted hover:bg-surface-muted hover:text-fg'
                    }`}
                  >
                    {active && <span className="absolute left-0 top-2 bottom-2 w-1 rounded-full bg-brand" aria-hidden="true" />}
                    <span className="flex items-center gap-2.5 min-w-0">
                      <Icon className={`w-4.5 h-4.5 shrink-0 ${active ? 'text-brand' : item.iconClass ?? 'text-fg-subtle'}`} aria-hidden="true" />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {item.badge !== undefined && (
                      <span className={`shrink-0 text-caption px-2 py-0.5 rounded-full font-semibold tabular-nums ${active ? 'bg-brand/15 text-brand-ink' : item.badgeClass ?? 'bg-surface-muted text-fg-muted'}`}>
                        {item.badge}
                        <span className="sr-only"> {badgeLabel(item.id)}</span>
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const chartTooltipStyle = {
    contentStyle: { borderRadius: 12, border: `1px solid ${CHART_COLORS.grid}`, boxShadow: '0 4px 12px rgba(15,23,42,0.08)', fontSize: 12 },
    labelStyle: { fontWeight: 600, color: CHART_COLORS.label }
  };

  // Título de la sección actual para el encabezado
  const tituloSeccion = selectedReportConsultation
    ? 'Informe clínico'
    : activeConsultationPatient
    ? 'Consulta'
    : isAddingPatient || editingPatient
    ? (editingPatient ? 'Editar expediente' : 'Nuevo expediente')
    : navGroups.flatMap(g => g.items).find(i => i.id === activeTab)?.label ?? activeCompany.nombreComercial;

  // Color de marca de la clínica expuesto como variable CSS (los tonos se derivan con color-mix en index.css)
  const brandStyle = { '--brand': activeCompany.colorPrimario || activeCompany.colorSidebar || '#0f766e' } as CSSProperties;

  // Contenido de la barra lateral (escritorio) y del drawer móvil: marca, navegación y usuario
  const renderSidebarContent = (mobile: boolean) => (
    <>
      <div className="flex items-center gap-3 px-5 h-16 shrink-0 border-b border-border">
        <img
          src={activeCompany.logoUrl}
          alt=""
          width={36}
          height={36}
          className="w-9 h-9 shrink-0 object-cover rounded-control border border-border bg-surface-muted"
          referrerPolicy="no-referrer"
        />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm tracking-tight text-fg truncate">{activeCompany.nombreComercial}</p>
          <p className="text-caption text-fg-subtle truncate">Cédula {activeCompany.identificacion}</p>
        </div>
        {mobile && (
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(false)}
            className="shrink-0 w-10 h-10 -mr-2 rounded-control text-fg-muted hover:bg-surface-muted hover:text-fg flex items-center justify-center transition-colors"
            aria-label="Cerrar menú"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-3 py-5">
        {renderNav()}
      </div>

      <div className="shrink-0 border-t border-border p-3">
        <div className="flex items-center gap-3 px-2 py-2">
          <Avatar name={currentUser.nombre} size="md" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-fg truncate">{currentUser.nombre}</p>
            <p className="text-xs text-fg-muted truncate">{currentUser.rol}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="mt-1 w-full min-h-10 px-3 rounded-control flex items-center gap-2.5 text-sm font-medium text-fg-muted hover:bg-danger-soft hover:text-danger transition-colors"
          aria-label="Cerrar sesión"
        >
          <LogOut className="w-4.5 h-4.5" aria-hidden="true" />
          Cerrar sesión
        </button>
      </div>
    </>
  );

  return (
    <div style={brandStyle} className="min-h-screen bg-bg text-fg font-sans antialiased flex print:bg-white print:p-0">

      <a
        href="#contenido"
        onClick={(e) => { e.preventDefault(); document.getElementById('contenido')?.focus(); }}
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[90] focus:bg-surface focus:text-fg focus:px-4 focus:py-2.5 focus:rounded-control focus:shadow-lg focus:text-sm focus:font-semibold"
      >
        Saltar al contenido
      </a>

      {/* Barra lateral fija (escritorio) */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0 sticky top-0 h-screen bg-surface border-r border-border print:hidden">
        {renderSidebarContent(false)}
      </aside>

      {/* Menú móvil: fondo (tocar fuera lo cierra) y drawer lateral con la misma estética */}
      {isMobileMenuOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 z-40 bg-fg/30 backdrop-blur-xs animate-fade-in print:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <div
            id="menu-movil"
            className="lg:hidden fixed inset-y-0 left-0 z-50 w-80 max-w-[85vw] flex flex-col bg-surface border-r border-border shadow-lg animate-fade-in print:hidden"
          >
            {renderSidebarContent(true)}
          </div>
        </>
      )}

      <div className="flex-1 min-w-0 flex flex-col">

      <header className="sticky top-0 z-30 h-16 px-4 sm:px-6 lg:px-8 bg-surface/80 backdrop-blur-md border-b border-border flex items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3 min-w-0">
          {/* Botón de menú para móvil/tablet */}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="lg:hidden shrink-0 w-11 h-11 -ml-2 rounded-control text-fg hover:bg-surface-muted transition-colors flex items-center justify-center"
            aria-label={isMobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={isMobileMenuOpen}
            aria-controls="menu-movil"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <h1 className="text-heading font-semibold tracking-tight text-fg truncate">{tituloSeccion}</h1>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Resumen rápido (oculto en móvil/tablet) */}
          {!esContador && (
          <div className="hidden xl:flex items-center gap-4 text-xs font-medium text-fg-muted bg-surface-muted px-3.5 py-2 rounded-control">
            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{filteredPatientsByCompany.length} expedientes</span>
            </div>
            <div className="w-px h-3.5 bg-border-strong" aria-hidden="true"></div>
            <div className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{filteredConsultationsByCompany.length} consultas</span>
            </div>
          </div>
          )}

          <Badge tone="brand" className="hidden sm:inline-flex">Hacienda CR</Badge>

          {/* Estado de la conexión con la base de datos */}
          {dbStatus && (
            <div
              className="flex items-center gap-1.5 text-xs font-medium text-fg-muted bg-surface-muted px-2.5 sm:px-3 py-2 rounded-control"
              title={dbStatus.connected ? 'Conectado a la base de datos' : `Sin conexión a la base de datos. Los cambios se guardan solo en este equipo.`}
            >
              <span className={`w-2 h-2 rounded-full ${dbStatus.connected ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">
                {dbStatus.connected ? 'En línea' : 'Modo local'}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Primary Layout Frame */}
      <div id="contenido" tabIndex={-1} className="flex-1 flex flex-col focus:outline-hidden">
      {selectedReportConsultation ? (
        // Open printable Clinical Report view
        <ReportView
          consultation={selectedReportConsultation}
          patient={patients.find(p => p.id === selectedReportConsultation.idPaciente) || patients[0]}
          company={activeCompany}
          servicios={servicios}
          facturas={facturas.filter(f => f.idCompania === selectedCompanyId)}
          onClose={() => setSelectedReportConsultation(null)}
          onNotificationSent={handleAddNotificationLog}
          onConsultationUpdated={handleConsultationUpdated}
          onCrearFactura={handleCrearFactura}
          onVerificarEstadoFactura={handleVerificarEstadoFactura}
        />
      ) : activeConsultationPatient ? (
        // Open Consultation creator form
        <div className="max-w-4xl mx-auto w-full p-4 sm:p-6 print:hidden">
          <ConsultationForm
            patient={activeConsultationPatient}
            editingConsultation={editingConsultation}
            onSave={handleSaveConsultation}
            onCancel={() => { setActiveConsultationPatient(null); setEditingConsultation(null); }}
            themeColor={activeCompany.colorPrimario}
            perfilCompania={activeCompany.perfilCompania || 'Ambas'}
            porcentajesDieta={porcentajesDieta}
            plantillasDieta={plantillasDieta}
          />
        </div>
      ) : isAddingPatient || editingPatient ? (
        // Open Patient directory form
        <div className="max-w-4xl mx-auto w-full p-4 sm:p-6 print:hidden">
          <PatientForm
            companyId={selectedCompanyId}
            patients={patients}
            editingPatient={editingPatient}
            onSavePatient={handleSavePatient}
            onCancel={() => { setIsAddingPatient(false); setEditingPatient(null); }}
            themeColor={activeCompany.colorPrimario}
            perfilCompania={activeCompany.perfilCompania}
          />
        </div>
      ) : activeTab === 'manual' ? (
        // Fuera de la grilla principal (print:hidden) para que se pueda imprimir / guardar en PDF
        <ManualUsuario
          perfil={activeCompany.perfilCompania}
          nombreEmpresa={activeCompany.nombreComercial}
          themeColor={activeCompany.colorPrimario}
          onClose={() => setActiveTab('dashboard')}
        />
      ) : (
        // Main Workspace Dashboard & Tab Controls
        <div className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 sm:px-6 lg:px-8 lg:py-8 print:hidden">

          {/* Core Content Region */}
          <main className="space-y-6 min-w-0">

            {/* ================= 1. CLINICAL DASHBOARD ================= */}
            {activeTab === 'dashboard' && (
              <div className="space-y-6">

                {/* Banner */}
                <Card className="p-5 sm:p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <h2 className="text-heading font-semibold tracking-tight text-fg">{saludo}, {nombreSaludo}</h2>
                    <p className="text-body text-fg-muted mt-0.5">
                      {citasHoy === 0
                        ? 'No tiene citas programadas para hoy.'
                        : `Hoy tiene ${citasHoy} cita${citasHoy === 1 ? '' : 's'} en agenda.`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                    <Button
                      variant="outline"
                      className="flex-1 sm:flex-none"
                      onClick={() => navigateTo('agenda')}
                      icon={<Calendar className="w-4 h-4" aria-hidden="true" />}
                    >
                      Ver agenda
                    </Button>
                    <Button
                      className="flex-1 sm:flex-none"
                      onClick={() => setIsAddingPatient(true)}
                      icon={<Plus className="w-4 h-4" aria-hidden="true" />}
                    >
                      {esLegal ? 'Nuevo cliente' : 'Nuevo expediente'}
                    </Button>
                  </div>
                </Card>

                {/* Dashboard Widgets */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                  {[
                    // En Legal ya el saludo dice las citas de hoy; así caben los 4 indicadores del despacho en una fila
                    { label: 'Citas de hoy', value: citasHoy, icon: <Calendar />, tab: 'agenda' as TabId, show: !esLegal },
                    { label: esLegal ? 'Clientes' : 'Expedientes', value: filteredPatientsByCompany.length, icon: <Users />, tab: 'patients' as TabId, show: true },
                    { label: 'Casos abiertos', value: casosDeLaCompania.filter(c => c.estado === 'ABIERTO').length, icon: <FolderOpen />, tab: 'casos' as TabId, show: esLegal },
                    { label: 'Documentos pendientes', value: docsPendientes.length, icon: <ClipboardList />, tab: 'casos' as TabId, show: esLegal },
                    { label: 'Documentos vencidos', value: docsVencidos, icon: <ClipboardList />, tab: 'casos' as TabId, show: esLegal },
                    { label: 'Consultas de nutrición', value: filteredConsultationsByCompany.filter(c => c.tipo === 'Nutrición').length, icon: <Apple />, tab: 'consultations' as TabId, show: muestraNutricion },
                    { label: 'Consultas de fisioterapia', value: filteredConsultationsByCompany.filter(c => c.tipo === 'Fisioterapia').length, icon: <Dumbbell />, tab: 'consultations' as TabId, show: muestraFisioterapia }
                  ].filter(k => k.show).map(k => (
                    <button
                      key={k.label}
                      type="button"
                      onClick={() => navigateTo(k.tab)}
                      aria-label={`${k.label}: ${k.value}. Abrir`}
                      className="text-left rounded-card hover:[&>div]:border-border-strong hover:[&>div]:shadow-sm"
                    >
                      <StatCard label={k.label} value={k.value} icon={k.icon} className="h-full transition-[border-color,box-shadow]" />
                    </button>
                  ))}
                </div>

                {/* Health trends - weight tracking and pain distribution */}
                <div className={`grid grid-cols-1 ${activeCompany.perfilCompania === 'Ambas' ? 'md:grid-cols-2' : 'md:grid-cols-1'} gap-6`}>

                  {/* Weight history tracking chart */}
                  {muestraNutricion && (
                    <section className="bg-surface rounded-card p-5 border border-border shadow-xs flex flex-col justify-between" aria-labelledby="grafico-peso">
                      <div>
                        <h3 id="grafico-peso" className="text-body font-semibold text-fg">Evolución de peso (kg)</h3>
                        <p className="text-xs text-fg-muted mb-4">Pacientes con plan nutricional activo</p>
                      </div>
                      <div className="h-52 w-full">
                        {weightHistoryData.length === 0 ? (
                          <div className="h-full flex flex-col items-center justify-center gap-1.5 text-sm text-fg-muted bg-surface-muted rounded-control border border-dashed border-border-strong px-4 text-center">
                            <Apple className="w-5 h-5 text-fg-subtle" aria-hidden="true" />
                            Aún no hay consultas de nutrición para graficar.
                          </div>
                        ) : (
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={weightHistoryData}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_COLORS.grid} />
                              <XAxis dataKey="fecha" tick={{ fontSize: 11, fill: CHART_COLORS.tick }} tickLine={false} axisLine={{ stroke: CHART_COLORS.axis }} />
                              <YAxis tick={{ fontSize: 11, fill: CHART_COLORS.tick }} tickLine={false} axisLine={false} domain={['auto', 'auto']} width={36} />
                              <Tooltip {...chartTooltipStyle} formatter={(v) => [`${v} kg`, 'Peso']} />
                              <Line type="monotone" dataKey="peso" stroke={activeCompany.colorPrimario} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 6 }} />
                            </LineChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </section>
                  )}

                  {/* Pain score distribution */}
                  {muestraFisioterapia && (
                    <section className="bg-surface rounded-card p-5 border border-border shadow-xs flex flex-col justify-between" aria-labelledby="grafico-eva">
                      <div>
                        <h3 id="grafico-eva" className="text-body font-semibold text-fg">Distribución del dolor (escala EVA)</h3>
                        <p className="text-xs text-fg-muted mb-3">Niveles registrados en terapia física</p>
                      </div>
                      <div className="h-52 w-full">
                        {!hayConsultasFisio ? (
                          <div className="h-full flex flex-col items-center justify-center gap-1.5 text-sm text-fg-muted bg-surface-muted rounded-control border border-dashed border-border-strong px-4 text-center">
                            <Dumbbell className="w-5 h-5 text-fg-subtle" aria-hidden="true" />
                            Aún no hay registros de dolor EVA para graficar.
                          </div>
                        ) : (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={evaDistribution}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_COLORS.grid} />
                              <XAxis dataKey="score" tick={{ fontSize: 11, fill: CHART_COLORS.tick }} tickLine={false} axisLine={{ stroke: CHART_COLORS.axis }} />
                              <YAxis tick={{ fontSize: 11, fill: CHART_COLORS.tick }} tickLine={false} axisLine={false} allowDecimals={false} width={28} />
                              <Tooltip {...chartTooltipStyle} cursor={{ fill: CHART_COLORS.cursor }} labelFormatter={(l) => `EVA ${l}`} formatter={(v) => [v, 'Consultas']} />
                              <Bar dataKey="cantidad" radius={[6, 6, 0, 0]}>
                                {evaDistribution.map((entry, index) => {
                                  const color = entry.score >= 8 ? CHART_COLORS.danger : entry.score >= 5 ? CHART_COLORS.warning : CHART_COLORS.success;
                                  return <Cell key={`cell-${index}`} fill={color} />;
                                })}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                      {hayConsultasFisio && (
                        <ul className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-fg-muted" aria-label="Leyenda">
                          <li className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-success" aria-hidden="true" />Leve (1–4)</li>
                          <li className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-warning" aria-hidden="true" />Moderado (5–7)</li>
                          <li className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-danger" aria-hidden="true" />Severo (8–10)</li>
                        </ul>
                      )}
                    </section>
                  )}

                </div>

                {/* Patient Overview Summary list (depende de consultas clínicas: no aplica al perfil Legal) */}
                {!esLegal && (
                <section className="bg-surface rounded-card border border-border shadow-xs overflow-hidden" aria-labelledby="ultimos-pacientes">
                  <div className="px-5 py-3.5 border-b border-border flex justify-between items-center gap-3">
                    <h3 id="ultimos-pacientes" className="text-body font-semibold text-fg">Últimos pacientes atendidos</h3>
                    <Button variant="ghost" size="sm" className="-mr-2" onClick={() => navigateTo('patients')}>
                      Ver todos
                    </Button>
                  </div>
                  {pacientesRecientes.length === 0 ? (
                    <EmptyState
                      icon={<Users />}
                      title="Aún no hay expedientes registrados"
                      action={
                        <Button onClick={() => setIsAddingPatient(true)} icon={<Plus className="w-4 h-4" aria-hidden="true" />}>
                          Crear el primer expediente
                        </Button>
                      }
                    />
                  ) : (
                    <ul className="divide-y divide-border">
                      {pacientesRecientes.map((p) => {
                        const latestConsult = ultimaConsultaPorPaciente.get(p.id);
                        return (
                          <li key={p.id} className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-surface-muted/60 transition-colors">
                            <div className="flex items-center gap-3 min-w-0">
                              <Avatar name={p.nombreCompleto} />
                              <div className="min-w-0">
                                <span className="font-semibold text-fg block text-body truncate">{p.nombreCompleto}</span>
                                <span className="text-xs text-fg-muted block">
                                  {latestConsult ? `Última cita: ${latestConsult.fecha} · ${latestConsult.tipo}` : 'Sin consultas registradas'}
                                </span>
                              </div>
                            </div>

                            <Button
                              variant="secondary"
                              size="sm"
                              className="self-start sm:self-auto shrink-0"
                              onClick={() => {
                                if (latestConsult) setSelectedReportConsultation(latestConsult);
                                else setActiveConsultationPatient(p);
                              }}
                            >
                              {latestConsult ? 'Ver ficha' : 'Nueva consulta'}
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
                )}

              </div>
            )}

            {/* ================= 2. PATIENTS DIRECTORY ================= */}
            {activeTab === 'patients' && (
              <div className="space-y-6">

                {/* Search & Actions toolbar */}
                <Card className="p-4 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
                  <div className="w-full sm:max-w-md">
                    <label htmlFor="buscar-pacientes" className="sr-only">Buscar {persona.minusculaPlural}</label>
                    <Input
                      id="buscar-pacientes"
                      type="search"
                      placeholder="Buscar por nombre o cédula…"
                      value={patientSearch}
                      onChange={(e: any) => setPatientSearch(e.target.value)}
                      autoComplete="off"
                      leadingIcon={<Search />}
                      className="[&::-webkit-search-cancel-button]:hidden"
                      trailing={patientSearch ? (
                        <IconButton
                          label="Limpiar búsqueda"
                          icon={<X className="w-4 h-4" aria-hidden="true" />}
                          onClick={() => setPatientSearch('')}
                        />
                      ) : undefined}
                    />
                  </div>

                  <Button
                    className="w-full sm:w-auto"
                    onClick={() => setIsAddingPatient(true)}
                    icon={<Plus className="w-4 h-4" aria-hidden="true" />}
                  >
                    {esLegal ? 'Registrar cliente' : 'Registrar expediente'}
                  </Button>
                </Card>

                {patientSearch && searchedPatients.length > 0 && (
                  <p className="text-xs text-fg-muted -mt-3" role="status">
                    {searchedPatients.length} resultado{searchedPatients.length === 1 ? '' : 's'} para “{patientSearch}”
                  </p>
                )}

                {/* Catalog list */}
                {searchedPatients.length === 0 ? (
                  <Card className="border-dashed border-border-strong shadow-none">
                    {patientSearch ? (
                      <EmptyState
                        icon={<Users />}
                        title={`Ningún ${esLegal ? 'cliente' : 'expediente'} coincide con “${patientSearch}”`}
                        description="Revise la ortografía o busque por número de cédula."
                        action={<Button variant="secondary" onClick={() => setPatientSearch('')}>Limpiar búsqueda</Button>}
                      />
                    ) : (
                      <EmptyState
                        icon={<Users />}
                        title={`Aún no hay ${esLegal ? 'clientes' : 'expedientes'}`}
                        description={esLegal ? 'Registre al primer cliente para abrirle casos y controlar sus documentos.' : 'Registre al primer paciente para empezar a llevar su historial.'}
                        action={
                          <Button onClick={() => setIsAddingPatient(true)} icon={<Plus className="w-4 h-4" aria-hidden="true" />}>
                            {esLegal ? 'Registrar cliente' : 'Registrar expediente'}
                          </Button>
                        }
                      />
                    )}
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {searchedPatients.map((p) => {
                      const ultimaConsulta = ultimaConsultaPorPaciente.get(p.id);
                      return (
                        <article key={p.id} className="bg-surface rounded-card border border-border p-4 sm:p-5 shadow-xs hover:border-border-strong hover:shadow-sm transition-[border-color,box-shadow] flex flex-col justify-between gap-4" aria-labelledby={`paciente-${p.id}`}>
                          <div className="flex justify-between items-start gap-2">
                            <div className="flex gap-3 min-w-0">
                              <Avatar name={p.nombreCompleto} />
                              <div className="min-w-0">
                                <h3 id={`paciente-${p.id}`} className="font-semibold text-fg text-body truncate">{p.nombreCompleto}</h3>
                                <p className="text-xs text-fg-muted">{p.identificacion} ({p.tipoIdentificacion})</p>
                                <p className="text-xs text-fg-muted mt-0.5 truncate">Ocupación: {p.ocupacion || 'No registrada'}</p>
                              </div>
                            </div>

                            <div className="flex -mr-2 -mt-2 shrink-0">
                              <IconButton
                                label={`Editar datos de ${p.nombreCompleto}`}
                                title="Editar datos personales"
                                icon={<Edit className="w-4 h-4" aria-hidden="true" />}
                                onClick={() => setEditingPatient(p)}
                              />
                              <IconButton
                                label={`Eliminar ${esLegal ? 'cliente' : 'expediente de'} ${p.nombreCompleto}`}
                                title={`Eliminar ${persona.minuscula}`}
                                icon={<Trash2 className="w-4 h-4" aria-hidden="true" />}
                                className="hover:bg-danger-soft hover:text-danger"
                                onClick={() => handleDeletePatient(p.id)}
                              />
                            </div>
                          </div>

                          {esLegal ? (
                            <>
                              <dl className="bg-surface-muted rounded-control p-3.5 text-xs grid grid-cols-2 gap-3 text-fg">
                                <div>
                                  <dt className="font-medium text-fg-muted">Teléfono</dt>
                                  <dd className="font-semibold text-fg">{p.telefono || 'No registrado'}</dd>
                                </div>
                                <div>
                                  <dt className="font-medium text-fg-muted">Casos abiertos</dt>
                                  <dd className="font-semibold text-fg tabular-nums">{casosDeLaCompania.filter(c => c.idPaciente === p.id && c.estado === 'ABIERTO').length}</dd>
                                </div>
                                <div className="col-span-2 border-t pt-2 border-border">
                                  <dt className="font-medium text-fg-muted">Correo</dt>
                                  <dd className="text-fg truncate">{p.correoElectronico || 'Sin correo (no recibirá recordatorios)'}</dd>
                                </div>
                              </dl>
                              <Button
                                onClick={() => { setCasosClienteFiltro(p.id); navigateTo('casos'); }}
                                icon={<FolderOpen className="w-4 h-4" aria-hidden="true" />}
                              >
                                Ver casos
                              </Button>
                            </>
                          ) : (
                          <>
                          {/* Quick details & Clinical summary highlights */}
                          <dl className="bg-surface-muted rounded-control p-3.5 text-xs grid grid-cols-2 gap-3 text-fg">
                            <div>
                              <dt className="font-medium text-fg-muted">Gastrointestinal</dt>
                              <dd className="font-semibold text-fg">
                                {p.gastritis ? 'Gastritis/Reflujo (+)' : 'Estómago normal'}
                              </dd>
                            </div>
                            <div>
                              <dt className="font-medium text-fg-muted">Cardio / Diabetes</dt>
                              <dd className="font-semibold text-fg">
                                {p.diabetes ? 'Diabetes (+)' : p.hipertension ? 'Hipertensión (+)' : 'Normal'}
                              </dd>
                            </div>
                            <div className="col-span-2 border-t pt-2 border-border">
                              <dt className="font-medium text-fg-muted">Lesiones previas</dt>
                              <dd className="text-fg truncate" title={p.fracturas || p.esguinces}>
                                {p.fracturas || p.esguinces || 'Ninguna reportada'}
                              </dd>
                            </div>
                          </dl>

                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              className="flex-1"
                              disabled={!ultimaConsulta}
                              onClick={() => {
                                if (ultimaConsulta) { setEditingConsultation(ultimaConsulta); setActiveConsultationPatient(p); }
                              }}
                              title={ultimaConsulta ? `Editar la consulta del ${ultimaConsulta.fecha}` : 'Este paciente aún no tiene consultas registradas'}
                              icon={<Edit className="w-4 h-4" aria-hidden="true" />}
                            >
                              Editar última
                            </Button>
                            <Button
                              className="flex-1"
                              onClick={() => { setEditingConsultation(null); setActiveConsultationPatient(p); }}
                              icon={<Plus className="w-4 h-4" aria-hidden="true" />}
                            >
                              Nueva consulta
                            </Button>
                          </div>
                          </>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}

              </div>
            )}

            {/* ================= 3. CONSULTATIONS TIMELINE ================= */}
            {activeTab === 'consultations' && (
              <div className="space-y-6">

                {/* Search */}
                <Card className="p-4 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
                  <div className="w-full sm:max-w-md">
                    <label htmlFor="buscar-consultas" className="sr-only">Buscar consultas</label>
                    <Input
                      id="buscar-consultas"
                      type="search"
                      placeholder="Buscar por paciente o motivo…"
                      value={consultationSearch}
                      onChange={(e: any) => setConsultationSearch(e.target.value)}
                      autoComplete="off"
                      leadingIcon={<Search />}
                      className="[&::-webkit-search-cancel-button]:hidden"
                      trailing={consultationSearch ? (
                        <IconButton
                          label="Limpiar búsqueda"
                          icon={<X className="w-4 h-4" aria-hidden="true" />}
                          onClick={() => setConsultationSearch('')}
                        />
                      ) : undefined}
                    />
                  </div>
                  <span className="text-xs text-fg-muted font-medium" role="status">
                    {consultasOrdenadas.length} consulta{consultasOrdenadas.length === 1 ? '' : 's'}
                  </span>
                </Card>

                {/* Timeline */}
                <div className="space-y-4">
                  {consultasOrdenadas.length === 0 ? (
                    <Card className="border-dashed border-border-strong shadow-none">
                      {consultationSearch ? (
                        <EmptyState
                          icon={<ClipboardList />}
                          title={`Ninguna consulta coincide con “${consultationSearch}”`}
                          action={<Button variant="secondary" onClick={() => setConsultationSearch('')}>Limpiar búsqueda</Button>}
                        />
                      ) : (
                        <EmptyState
                          icon={<ClipboardList />}
                          title="Aún no hay consultas registradas"
                          description="Inicie una desde la agenda o desde el expediente del paciente."
                        />
                      )}
                    </Card>
                  ) : (
                    consultasOrdenadas.map((c) => {
                      const matchedPatient = patients.find(p => p.id === c.idPaciente);
                      const isNut = c.tipo === 'Nutrición';
                      const TipoIcon = isNut ? Apple : Dumbbell;
                      return (
                        <article key={c.id} className="bg-surface rounded-card border border-border p-4 sm:p-5 shadow-xs hover:border-border-strong hover:shadow-sm transition-[border-color,box-shadow]">
                          <div className="flex flex-wrap justify-between items-start gap-3">
                            <div className="flex gap-3 sm:gap-4 min-w-0">
                              <span className={`w-14 shrink-0 px-1 py-2 rounded-control font-semibold text-center flex flex-col items-center justify-center gap-1 ${
                                isNut ? 'bg-brand-soft text-brand-ink' : 'bg-info-soft text-info'
                              }`}>
                                <TipoIcon className="w-4 h-4" aria-hidden="true" />
                                <span className="text-caption leading-none">{isNut ? 'Nutrición' : 'Fisio'}</span>
                              </span>

                              <div className="min-w-0">
                                <span className="text-xs text-fg-muted block mb-0.5">Folio #{c.id.toString().slice(-6)} · {c.fecha}</span>
                                <h3 className="font-semibold text-fg text-body">
                                  {matchedPatient ? matchedPatient.nombreCompleto : 'Paciente desconocido'}
                                </h3>
                                <p className="text-body text-fg-muted mt-0.5">Motivo: {c.motivo}</p>
                              </div>
                            </div>

                            <div className="flex gap-1.5 w-full sm:w-auto">
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1 sm:flex-none"
                                onClick={() => setSelectedReportConsultation(c)}
                                icon={<Printer className="w-4 h-4" aria-hidden="true" />}
                              >
                                Ver reporte
                              </Button>
                              <IconButton
                                label={`Eliminar consulta de ${matchedPatient?.nombreCompleto ?? 'paciente'} del ${c.fecha}`}
                                title="Eliminar consulta"
                                icon={<Trash2 className="w-4 h-4" aria-hidden="true" />}
                                className="hover:bg-danger-soft hover:text-danger"
                                onClick={() => handleDeleteConsultation(c.id)}
                              />
                            </div>
                          </div>

                          {/* Quick parameters readout */}
                          {isNut && c.antropometria && (
                            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-xs bg-surface-muted p-3.5 rounded-control">
                              <div>
                                <dt className="text-fg-muted font-medium">Peso</dt>
                                <dd className="font-semibold text-fg tabular-nums">{c.antropometria.peso} kg</dd>
                              </div>
                              <div>
                                <dt className="text-fg-muted font-medium">IMC</dt>
                                <dd className="font-semibold text-fg tabular-nums">{c.antropometria.imc}</dd>
                              </div>
                              <div>
                                <dt className="text-fg-muted font-medium">Grasa</dt>
                                <dd className="font-semibold text-fg tabular-nums">{c.antropometria.grasaCorporal}%</dd>
                              </div>
                              <div>
                                <dt className="text-fg-muted font-medium">Masa muscular</dt>
                                <dd className="font-semibold text-fg tabular-nums">{c.antropometria.masaMuscular} kg</dd>
                              </div>
                            </dl>
                          )}

                          {!isNut && c.fisioterapia && (
                            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-xs bg-surface-muted p-3.5 rounded-control">
                              <div>
                                <dt className="text-fg-muted font-medium">Zona de dolor</dt>
                                <dd className="font-semibold text-fg uppercase">{c.fisioterapia.zonaDolor}</dd>
                              </div>
                              <div>
                                <dt className="text-fg-muted font-medium">Intensidad EVA</dt>
                                <dd className="font-semibold text-danger tabular-nums">{c.fisioterapia.evaDolor}/10</dd>
                              </div>
                              <div>
                                <dt className="text-fg-muted font-medium">ROM</dt>
                                <dd className="font-semibold text-fg truncate">{c.fisioterapia.romMedido || 'S/D'}</dd>
                              </div>
                              <div>
                                <dt className="text-fg-muted font-medium">Daniels</dt>
                                <dd className="font-semibold text-fg">{c.fisioterapia.fuerzaDaniels || 'S/D'}</dd>
                              </div>
                            </dl>
                          )}
                        </article>
                      );
                    })
                  )}
                </div>

              </div>
            )}

            {/* ================= FACTURACIÓN ELECTRÓNICA + CXC ================= */}
            {activeTab === 'facturacion' && (
              <div className="space-y-5">
                <FacturacionManager
                  facturas={facturas.filter(f => f.idCompania === selectedCompanyId)}
                  patients={filteredPatientsByCompany}
                  company={activeCompany}
                  servicios={servicios}
                  puedeAnular={currentUser.rol === 'Administrador'}
                  soloLectura={esContador}
                  onAnularFactura={handleAnularFactura}
                  onEmitirNotaCredito={handleEmitirNotaCredito}
                  onEmitirNotaDebito={handleEmitirNotaDebito}
                  onVerificarEstadoFactura={handleVerificarEstadoFactura}
                  onReenviarCorreo={handleReenviarFacturaCorreo}
                />
                <CxCManager
                  cxc={cxc.filter(c => c.idCompania === selectedCompanyId)}
                  patients={filteredPatientsByCompany}
                  onRegistrarPago={handleRegistrarPagoCxc}
                  soloLectura={esContador}
                />
              </div>
            )}

            {/* ================= CUENTAS POR PAGAR (CXP) + PROVEEDORES ================= */}
            {activeTab === 'cxp' && (
              <div className="space-y-5">
                <ProveedorManager
                  proveedores={proveedores.filter(p => p.idCompania === selectedCompanyId)}
                  onSaveProveedor={handleSaveProveedor}
                  soloLectura={esContador}
                />
                <CxPManager
                  cxp={cxp.filter(c => c.idCompania === selectedCompanyId)}
                  proveedores={proveedores.filter(p => p.idCompania === selectedCompanyId)}
                  articulos={servicios.filter(s => s.idCompania === selectedCompanyId && s.tipo === 'ARTICULO')}
                  plazoCreditoDefecto={activeCompany.plazoCreditoProveedoresDias}
                  onCrearCxp={handleCrearCxp}
                  onRegistrarPago={handleRegistrarPagoCxp}
                  onImportarXml={handleImportarXmlCxp}
                  soloLectura={esContador}
                />
              </div>
            )}

            {/* ================= REPORTES FISCALES D-104 / D-101 ================= */}
            {activeTab === 'reportes-fiscales' && (
              <ReportesFiscales company={activeCompany} soloLectura={esContador} />
            )}

            {/* ================= REPORTERÍA DE CLIENTES Y SESIONES ================= */}
            {activeTab === 'reporteria' && (
              <ReporteriaClinica company={activeCompany} />
            )}

            {activeTab === 'casos' && esLegal && (
              <CasosLegalesManager
                casos={casosDeLaCompania}
                clientes={filteredPatientsByCompany}
                themeColor={activeCompany.colorPrimario}
                idClienteFiltro={casosClienteFiltro}
                onQuitarFiltroCliente={() => setCasosClienteFiltro(null)}
                onCasoGuardado={(caso) => setCasos(prev => prev.some(c => c.id === caso.id) ? prev.map(c => c.id === caso.id ? caso : c) : [caso, ...prev])}
                onCasoEliminado={(id) => setCasos(prev => prev.filter(c => c.id !== id))}
                onNotificacion={handleAddNotificationLog}
              />
            )}

            {/* ================= 4. CLINIC BRANDING CUSTOMIZATION ================= */}
            {activeTab === 'branding' && (
              <CompanySettings
                companies={companies.filter(c => c.id === selectedCompanyId)}
                selectedCompanyId={selectedCompanyId}
                onSelectCompany={(id) => setSelectedCompanyId(id)}
                onUpdateCompany={handleUpdateCompany}
                onAddCompany={handleAddCompany}
                smtpConfigs={smtpConfigs}
                onUpdateSmtpConfig={handleUpdateSmtpConfig}
                users={users}
                currentUser={currentUser}
                onSaveUser={handleSaveUser}
                servicios={servicios}
                onSaveServicio={handleSaveServicio}
                onCargarServiciosDefecto={handleCargarServiciosDefecto}
                onAjustarStock={handleAjustarStock}
                porcentajesDieta={porcentajesDieta}
                onSavePorcentajeDieta={handleSavePorcentajeDieta}
                onDeletePorcentajeDieta={handleDeletePorcentajeDieta}
                plantillasDieta={plantillasDieta}
                onSavePlantillaDieta={handleSavePlantillaDieta}
                onDeletePlantillaDieta={handleDeletePlantillaDieta}
              />
            )}

            {activeTab === 'saas-admin' && esSaasAdmin && (
              <SaasAdminPanel
                companies={companies.filter(c => c.id !== 7)}
                users={users}
                payments={companyPayments}
                onUpdateEstadoSaas={handleUpdateEstadoSaas}
                onUpdateMaxUsuarios={handleUpdateMaxUsuarios}
                onLoadPayments={handleLoadPayments}
                onAddPayment={handleAddPayment}
              />
            )}
            {activeTab === 'saas-admin' && esSaasAdmin && <ParametrosRentaManager />}

            {activeTab === 'mi-perfil' && (
              <MyProfile currentUser={currentUser} onSaveUser={handleSaveUser} />
            )}

            {activeTab === 'reservas-online' && (
              <OnlineBookingShare company={activeCompany} />
            )}

            {/* ================= 5. AGENDA Y CALENDARIO DE CITAS ================= */}
            {activeTab === 'agenda' && (
              <AgendaCalendar
                patients={filteredPatientsByCompany}
                users={users.filter(u => u.idCompania === selectedCompanyId)}
                citas={citasDeLaCompania}
                smtpConfigs={smtpConfigs}
                logs={logs}
                activeCompanyId={selectedCompanyId}
                currentUser={currentUser}
                onSaveCita={handleSaveCita}
                onTriggerNotification={handleAddNotificationLog}
                onStartConsultation={(patient) => handleStartSoapFromCalendar(patient.id)}
                calendarBlocks={calendarBlocks}
                onSaveCalendarBlock={handleSaveCalendarBlock}
                onDeleteCalendarBlock={handleDeleteCalendarBlock}
                servicios={servicios}
                facturas={facturas}
                onCrearFactura={handleCrearFactura}
                onVerificarEstadoFactura={handleVerificarEstadoFactura}
                ivaPorDefecto={activeCompany.ivaPorDefecto}
                plazoCreditoDefecto={activeCompany.plazoCreditoClientesDias}
                themeColor={activeCompany.colorPrimario}
                perfilCompania={activeCompany.perfilCompania}
              />
            )}

          </main>
        </div>
      )}
      </div>

      {/* Persistent Page Footer */}
      <footer className="mt-auto py-5 px-4 bg-surface text-fg-subtle text-xs text-center border-t border-border shrink-0 print:hidden">
        <p className="font-semibold text-fg-muted">TuanisBooking © {new Date().getFullYear()}</p>
        <p className="text-xs mt-1">Plataforma clínica para el control integral de pacientes con facturación digital autorizada</p>
      </footer>

      </div>
    </div>
  );
}
