import { useState, useEffect } from 'react';
import {
  Users,
  Activity,
  Calendar,
  Building2,
  Search,
  Plus,
  TrendingDown,
  Trash2,
  Edit,
  ClipboardList,
  Heart,
  Dumbbell,
  CheckCircle,
  Clock,
  Printer,
  ChevronRight,
  LogOut,
  Lock,
  Menu,
  X,
  MapPin,
  Share2,
  Receipt,
  Landmark,
  FileSpreadsheet,
  BarChart3
} from 'lucide-react';
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
  CuentaPagar
} from './data/mockData';

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

export default function App() {
  // --- Persistent Storage Core (Synced with MySQL Backend) ---
  const [dbStatus, setDbStatus] = useState<{connected: boolean; error: string | null; server?: string; port?: string; database?: string} | null>(null);
  
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

  // App Navigation Tabs
  const [activeTab, setActiveTab] = useState<'dashboard' | 'patients' | 'consultations' | 'agenda' | 'branding' | 'saas-admin' | 'mi-perfil' | 'reservas-online' | 'facturacion' | 'cxp' | 'reportes-fiscales' | 'reporteria'>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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
        alert(data.error || 'No se pudo guardar la empresa.');
        return;
      }
      setCompanies(prev => prev.map(c => c.id === data.id ? data : c));
    })
    .catch(err => {
      console.error("Error updating company in MySQL:", err);
      alert('Error de conexión al guardar la empresa.');
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
        alert(data.error || 'No se pudo crear la empresa.');
        return;
      }
      setCompanies(prev => [...prev, data]);
    })
    .catch(err => {
      console.error("Error adding company to MySQL:", err);
      alert('Error de conexión al crear la empresa.');
    });
  };

  const handleLogout = () => {
    fetch('/api/logout', { method: 'POST' }).catch(() => {});
    setCurrentUser(null);
  };

  // Search & Filtering Queries
  const [patientSearch, setPatientSearch] = useState('');
  const [consultationSearch, setConsultationSearch] = useState('');

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

  const handleDeletePatient = (id: number) => {
    if (confirm("¿Está seguro de eliminar el expediente de este paciente? Esto no borrará sus consultas históricas.")) {
      setPatients(prev => prev.filter(p => p.id !== id));
    }
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

  const handleDeleteConsultation = (id: number) => {
    if (confirm("¿Eliminar este registro de consulta?")) {
      setConsultations(prev => prev.filter(c => c.id !== id));
    }
  };

  // --- Agenda / Citas / SMTP / SOAP Integration Handlers ---
  const handleSaveCita = (savedCita: Cita) => {
    fetch('/api/citas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(savedCita)
    })
    .then(res => res.json())
    .then(data => {
      setCitas(prev => {
        const exists = prev.some(c => c.id === data.id);
        return exists ? prev.map(c => c.id === data.id ? data : c) : [...prev, data];
      });
    })
    .catch(err => {
      console.error("Error saving cita to MySQL:", err);
      const exists = citas.some(c => c.id === savedCita.id);
      if (exists) {
        setCitas(prev => prev.map(c => c.id === savedCita.id ? savedCita : c));
      } else {
        setCitas(prev => [...prev, savedCita]);
      }
    });
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
    idPaciente: number;
    condicionVenta: string;
    medioPago: string;
    montoRecibido: number | null;
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
    return data;
  };

  const handleAnularFactura = async (idFactura: number, motivo: string): Promise<Factura> => {
    const res = await fetch(`/api/facturas/${idFactura}/anular`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo anular la factura.');
    setFacturas(prev => [...prev.map(f => f.id === idFactura ? { ...f, estado: 'ANULADA' as const } : f), data]);
    setCxc(prev => prev.map(c => c.idFactura === idFactura && c.estado === 'PENDIENTE' ? { ...c, estado: 'ANULADA' as const } : c));
    return data;
  };

  const handleVerificarEstadoFactura = async (idFactura: number): Promise<Factura> => {
    const res = await fetch(`/api/facturas/${idFactura}/estado`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo verificar el estado con Hacienda.');
    let facturaActualizada: Factura | undefined;
    setFacturas(prev => prev.map(f => {
      if (f.id !== idFactura) return f;
      facturaActualizada = { ...f, estado: data.estado };
      return facturaActualizada;
    }));
    if (!facturaActualizada) throw new Error('Factura no encontrada en el estado local.');
    return facturaActualizada;
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

  const handleImportarXmlCxp = async (xmlTexto: string, alimentaInventario: boolean): Promise<{ cxp: CuentaPagar; proveedor: Proveedor; articulosAfectados: number }> => {
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
        alert(data.error || 'No se pudo guardar el colaborador.');
        return;
      }
      setUsers(prev => {
        const exists = prev.some(u => u.id === data.id);
        return exists ? prev.map(u => u.id === data.id ? data : u) : [...prev, data];
      });
    })
    .catch(err => {
      console.error("Error saving user to MySQL:", err);
      alert('Error de conexión al guardar el colaborador.');
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
      alert('Paciente no encontrado en el sistema.');
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
    if (!authChecked) return null;
    return (
      <LoginView
        onLoginSuccess={handleLoginSuccess}
        onRegisterCompany={handleRegisterCompany}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans antialiased flex flex-col print:bg-white print:p-0">
      
      {/* Top Brand Stripe */}
      <header className="text-white py-3 px-4 shadow-sm transition-all duration-500 print:hidden" style={{ backgroundColor: activeCompany.colorSidebar }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* Burger menu button for mobile/tablet */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="lg:hidden bg-white/10 hover:bg-white/20 text-white p-2 rounded-xl border border-white/10 transition-all cursor-pointer flex items-center justify-center"
              aria-label="Abrir menú"
            >
              {isMobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>

            <img
              src={activeCompany.logoUrl}
              alt={activeCompany.nombreComercial}
              className="w-10 h-10 object-cover rounded-xl border border-white/20 shadow-xs"
              referrerPolicy="no-referrer"
            />
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="font-extrabold text-sm tracking-tight">{activeCompany.nombreComercial}</h1>
                <span className="bg-white/25 text-[9px] px-1.5 py-0.5 rounded-full font-mono uppercase tracking-widest font-semibold text-white/90">
                  Hacienda CR
                </span>
              </div>
              <p className="text-[10px] text-white/80">Cédula: {activeCompany.identificacion} | IVA Salud: {activeCompany.ivaPorDefecto}%</p>
            </div>
          </div>

          <div className="flex items-center gap-3.5">
            {/* Quick Stats Toolbar (hidden on mobile/tablet) */}
            <div className="hidden md:flex items-center gap-4 text-xs font-semibold text-white/90 bg-black/10 px-3.5 py-1.5 rounded-xl border border-white/10">
              <div className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-teal-300" />
                <span>{filteredPatientsByCompany.length} Expedientes</span>
              </div>
              <div className="w-px h-3.5 bg-white/20"></div>
              <div className="flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-orange-300" />
                <span>{filteredConsultationsByCompany.length} Consultas</span>
              </div>
            </div>

            {/* Database connection status badge */}
            {dbStatus && (
              <div className="flex items-center gap-1.5 text-xs font-semibold text-white/90 bg-black/10 px-3 py-1.5 rounded-xl border border-white/10" title={dbStatus.connected ? `Conectado a MySQL en ${dbStatus.server}:${dbStatus.port}` : `Error: ${dbStatus.error || 'No se pudo establecer conexión con MySQL'}`}>
                <span className={`w-2 h-2 rounded-full ${dbStatus.connected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400 animate-pulse'}`} />
                <span className="text-[10px] uppercase font-bold tracking-wider">
                  {dbStatus.connected ? 'MySQL' : 'Local Fallback'}
                </span>
              </div>
            )}

            {/* User Badge & Logout */}
            <div className="flex items-center gap-3 border-l border-white/15 pl-3.5">
              <div className="text-right hidden sm:block">
                <span className="text-[11px] font-extrabold text-white block">{currentUser.nombre}</span>
                <span className="text-[9px] text-white/70 block uppercase tracking-wider font-semibold">{currentUser.rol}</span>
              </div>
              <button
                onClick={handleLogout}
                className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-xl border border-white/10 transition-all cursor-pointer flex items-center gap-1 text-[11px] font-bold"
                title="Cerrar Sesión"
              >
                <LogOut className="w-3.5 h-3.5 text-rose-300" />
                <span className="hidden md:inline">Salir</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Menu Drawer */}
      {isMobileMenuOpen && (
        <div className="lg:hidden bg-white border-b border-slate-200 p-4 shadow-md space-y-3 transition-all animate-in slide-in-from-top duration-200">
          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest px-2 block">Panel de Control</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              onClick={() => { setActiveTab('dashboard'); setIsMobileMenuOpen(false); }}
              className={`flex items-center justify-between py-2.5 px-3.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'dashboard'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 bg-slate-50 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4" />
                <span>Resumen Clínico</span>
              </div>
            </button>

            <button
              onClick={() => { setActiveTab('patients'); setIsMobileMenuOpen(false); }}
              className={`flex items-center justify-between py-2.5 px-3.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'patients'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 bg-slate-50 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                <span>Pacientes / Expedientes</span>
              </div>
              <span className="bg-slate-200 text-slate-700 text-[10px] px-2 py-0.5 rounded-full font-bold">
                {filteredPatientsByCompany.length}
              </span>
            </button>

            <button
              onClick={() => { setActiveTab('agenda'); setIsMobileMenuOpen(false); }}
              className={`flex items-center justify-between py-2.5 px-3.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'agenda'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 bg-slate-50 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-500" />
                <span>Agenda y Calendario</span>
              </div>
              <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded-full font-bold">
                {citas.filter(c => c.idCompania === selectedCompanyId && c.estadoCita === 'PROGRAMADA').length} act
              </span>
            </button>

            <button
              onClick={() => { setActiveTab('consultations'); setIsMobileMenuOpen(false); }}
              className={`flex items-center justify-between py-2.5 px-3.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'consultations'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 bg-slate-50 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2">
                <ClipboardList className="w-4 h-4" />
                <span>Historial de Citas</span>
              </div>
              <span className="bg-slate-200 text-slate-700 text-[10px] px-2 py-0.5 rounded-full font-bold">
                {filteredConsultationsByCompany.length}
              </span>
            </button>

            <button
              onClick={() => { setActiveTab('facturacion'); setIsMobileMenuOpen(false); }}
              className={`flex items-center justify-between py-2.5 px-3.5 rounded-xl text-xs font-semibold transition-all sm:col-span-2 ${
                activeTab === 'facturacion'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 bg-slate-50 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4" />
                <span>Facturación</span>
              </div>
              <span className="bg-slate-200 text-slate-700 text-[10px] px-2 py-0.5 rounded-full font-bold">
                {facturas.filter(f => f.idCompania === selectedCompanyId).length}
              </span>
            </button>

            <button
              onClick={() => { setActiveTab('cxp'); setIsMobileMenuOpen(false); }}
              className={`flex items-center justify-between py-2.5 px-3.5 rounded-xl text-xs font-semibold transition-all sm:col-span-2 ${
                activeTab === 'cxp'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 bg-slate-50 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2">
                <Landmark className="w-4 h-4" />
                <span>Cuentas por Pagar</span>
              </div>
              <span className="bg-slate-200 text-slate-700 text-[10px] px-2 py-0.5 rounded-full font-bold">
                {cxp.filter(c => c.idCompania === selectedCompanyId && c.estado === 'PENDIENTE').length}
              </span>
            </button>

            <button
              onClick={() => { setActiveTab('reportes-fiscales'); setIsMobileMenuOpen(false); }}
              className={`flex items-center justify-between py-2.5 px-3.5 rounded-xl text-xs font-semibold transition-all sm:col-span-2 ${
                activeTab === 'reportes-fiscales'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 bg-slate-50 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4" />
                <span>Reportes Fiscales</span>
              </div>
            </button>

            <button
              onClick={() => { setActiveTab('reporteria'); setIsMobileMenuOpen(false); }}
              className={`flex items-center justify-between py-2.5 px-3.5 rounded-xl text-xs font-semibold transition-all sm:col-span-2 ${
                activeTab === 'reporteria'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 bg-slate-50 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                <span>Reportería</span>
              </div>
            </button>

            <button
              onClick={() => { setActiveTab('branding'); setIsMobileMenuOpen(false); }}
              className={`flex items-center justify-between py-2.5 px-3.5 rounded-xl text-xs font-semibold transition-all sm:col-span-2 ${
                activeTab === 'branding'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 bg-slate-50 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                <span>Personalizar Clínica</span>
              </div>
            </button>

            <button
              onClick={() => { setActiveTab('mi-perfil'); setIsMobileMenuOpen(false); }}
              className={`flex items-center justify-between py-2.5 px-3.5 rounded-xl text-xs font-semibold transition-all sm:col-span-2 ${
                activeTab === 'mi-perfil'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 bg-slate-50 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                <span>Mi Perfil</span>
              </div>
            </button>

            <button
              onClick={() => { setActiveTab('reservas-online'); setIsMobileMenuOpen(false); }}
              className={`flex items-center justify-between py-2.5 px-3.5 rounded-xl text-xs font-semibold transition-all sm:col-span-2 ${
                activeTab === 'reservas-online'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 bg-slate-50 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2">
                <Share2 className="w-4 h-4" />
                <span>Reservas en Línea</span>
              </div>
            </button>

            {currentUser?.idCompania === 7 && currentUser?.rol === 'Administrador' && (
              <button
                onClick={() => { setActiveTab('saas-admin'); setIsMobileMenuOpen(false); }}
                className={`flex items-center justify-between py-2.5 px-3.5 rounded-xl text-xs font-semibold transition-all sm:col-span-2 ${
                  activeTab === 'saas-admin'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 bg-slate-50 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-amber-500" />
                  <span>Administración SaaS</span>
                </div>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Primary Layout Frame */}
      {selectedReportConsultation ? (
        // Open printable Clinical Report view
        <ReportView
          consultation={selectedReportConsultation}
          patient={patients.find(p => p.id === selectedReportConsultation.idPaciente) || patients[0]}
          company={activeCompany}
          servicios={servicios}
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
          />
        </div>
      ) : (
        // Main Workspace Dashboard & Tab Controls
        <div className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-6 print:hidden">
          
          {/* Navigation Controls Sidebar (Left Column) - Hidden on Mobile/Tablet */}
          <aside className="hidden lg:block lg:col-span-3 space-y-4">
            
            {/* Nav Menu */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-3.5 space-y-1">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest px-2 block mb-2">Panel de Control</span>
              
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`w-full flex items-center justify-between py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'dashboard'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  <span>Resumen Clínico</span>
                </div>
              </button>

              <button
                onClick={() => setActiveTab('patients')}
                className={`w-full flex items-center justify-between py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'patients'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  <span>Pacientes / Expedientes</span>
                </div>
                <span className="bg-slate-100 text-slate-700 text-[10px] px-2 py-0.5 rounded-full font-bold">
                  {filteredPatientsByCompany.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('agenda')}
                className={`w-full flex items-center justify-between py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'agenda'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-emerald-500" />
                  <span>Agenda y Calendario</span>
                </div>
                <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded-full font-bold">
                  {citas.filter(c => c.idCompania === selectedCompanyId && c.estadoCita === 'PROGRAMADA').length} act
                </span>
              </button>

              <button
                onClick={() => setActiveTab('consultations')}
                className={`w-full flex items-center justify-between py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'consultations'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-4 h-4" />
                  <span>Historial de Citas</span>
                </div>
                <span className="bg-slate-100 text-slate-700 text-[10px] px-2 py-0.5 rounded-full font-bold">
                  {filteredConsultationsByCompany.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('facturacion')}
                className={`w-full flex items-center justify-between py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'facturacion'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Receipt className="w-4 h-4" />
                  <span>Facturación</span>
                </div>
                <span className="bg-slate-100 text-slate-700 text-[10px] px-2 py-0.5 rounded-full font-bold">
                  {facturas.filter(f => f.idCompania === selectedCompanyId).length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('cxp')}
                className={`w-full flex items-center justify-between py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'cxp'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Landmark className="w-4 h-4" />
                  <span>Cuentas por Pagar</span>
                </div>
                <span className="bg-slate-100 text-slate-700 text-[10px] px-2 py-0.5 rounded-full font-bold">
                  {cxp.filter(c => c.idCompania === selectedCompanyId && c.estado === 'PENDIENTE').length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('reportes-fiscales')}
                className={`w-full flex items-center justify-between py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'reportes-fiscales'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Reportes Fiscales</span>
                </div>
              </button>

              <button
                onClick={() => setActiveTab('reporteria')}
                className={`w-full flex items-center justify-between py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'reporteria'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" />
                  <span>Reportería</span>
                </div>
              </button>

              <button
                onClick={() => setActiveTab('branding')}
                className={`w-full flex items-center justify-between py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'branding'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  <span>Personalizar Clínica</span>
                </div>
              </button>

              <button
                onClick={() => setActiveTab('mi-perfil')}
                className={`w-full flex items-center justify-between py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'mi-perfil'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  <span>Mi Perfil</span>
                </div>
              </button>

              <button
                onClick={() => setActiveTab('reservas-online')}
                className={`w-full flex items-center justify-between py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'reservas-online'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Share2 className="w-4 h-4" />
                  <span>Reservas en Línea</span>
                </div>
              </button>

              {currentUser?.idCompania === 7 && currentUser?.rol === 'Administrador' && (
                <button
                  onClick={() => setActiveTab('saas-admin')}
                  className={`w-full flex items-center justify-between py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
                    activeTab === 'saas-admin'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-amber-500" />
                    <span>Administración SaaS</span>
                  </div>
                </button>
              )}
            </div>
          </aside>

          {/* Core Content Region */}
          <main className="col-span-12 lg:col-span-9 space-y-6">

            {/* ================= 1. CLINICAL DASHBOARD ================= */}
            {activeTab === 'dashboard' && (
              <div className="space-y-6">
                
                {/* Banner */}
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Resumen y Desempeño Clínico</h2>
                    <p className="text-xs text-slate-500 mt-1">
                      Control unificado para el profesional en nutrición humana y fisioterapeuta kinesiología
                    </p>
                  </div>
                  <button
                    onClick={() => setIsAddingPatient(true)}
                    className="text-white text-xs font-semibold py-2 px-4 rounded-xl shadow-md transition-all flex items-center gap-1.5"
                    style={{ backgroundColor: activeCompany.colorPrimario }}
                  >
                    <Plus className="w-4 h-4" />
                    Nuevo Expediente
                  </button>
                </div>

                {/* Dashboard Widgets */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs text-center">
                    <span className="text-[10px] text-slate-500 font-extrabold uppercase">Expedientes Totales</span>
                    <span className="text-2xl font-black text-slate-800 block mt-1">{filteredPatientsByCompany.length}</span>
                  </div>
                  {(activeCompany.perfilCompania === 'Nutrición' || activeCompany.perfilCompania === 'Ambas') && (
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs text-center">
                      <span className="text-[10px] text-slate-500 font-extrabold uppercase">Citas Nutrición</span>
                      <span className="text-2xl font-black text-rose-600 block mt-1">
                        {filteredConsultationsByCompany.filter(c => c.tipo === 'Nutrición').length}
                      </span>
                    </div>
                  )}
                  {(activeCompany.perfilCompania === 'Fisioterapia' || activeCompany.perfilCompania === 'Ambas') && (
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs text-center">
                      <span className="text-[10px] text-slate-500 font-extrabold uppercase">Citas Fisioterapia</span>
                      <span className="text-2xl font-black text-emerald-600 block mt-1">
                        {filteredConsultationsByCompany.filter(c => c.tipo === 'Fisioterapia').length}
                      </span>
                    </div>
                  )}
                  <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs text-center">
                    <span className="text-[10px] text-slate-500 font-extrabold uppercase">Tasa Promedio IVA</span>
                    <span className="text-2xl font-black text-slate-800 block mt-1">{activeCompany.ivaPorDefecto}%</span>
                  </div>
                </div>

                {/* Health trends - weight tracking and pain distribution */}
                <div className={`grid grid-cols-1 ${activeCompany.perfilCompania === 'Ambas' ? 'md:grid-cols-2' : 'md:grid-cols-1'} gap-6`}>
                  
                  {/* Weight history tracking chart */}
                  {(activeCompany.perfilCompania === 'Nutrición' || activeCompany.perfilCompania === 'Ambas') && (
                    <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col justify-between">
                      <div>
                        <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wider">Evolución de Peso (kg) - Nutrición</h3>
                        <p className="text-[11px] text-slate-500 mb-4">Pacientes bajo plan nutricional activo</p>
                      </div>
                      <div className="h-48 w-full">
                        {getWeightHistoryData().length === 0 ? (
                          <div className="h-full flex items-center justify-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                            No hay consultas de Nutrición aún para graficar
                          </div>
                        ) : (
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={getWeightHistoryData()}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} />
                              <XAxis dataKey="fecha" tick={{ fontSize: 10 }} />
                              <YAxis tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
                              <Tooltip />
                              <Line type="monotone" dataKey="peso" stroke={activeCompany.colorPrimario} strokeWidth={2} activeDot={{ r: 8 }} />
                            </LineChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Pain score distribution */}
                  {(activeCompany.perfilCompania === 'Fisioterapia' || activeCompany.perfilCompania === 'Ambas') && (
                    <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col justify-between">
                      <div>
                        <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wider">Distribución Escala Dolor (EVA) - Fisioterapia</h3>
                        <p className="text-[11px] text-slate-500 mb-4">Niveles registrados en terapia física</p>
                      </div>
                      <div className="h-48 w-full">
                        {filteredConsultationsByCompany.filter(c => c.tipo === 'Fisioterapia').length === 0 ? (
                          <div className="h-full flex items-center justify-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                            No hay registros de dolor EVA aún para graficar
                          </div>
                        ) : (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={getEvaDistribution()}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} />
                              <XAxis dataKey="escala" tick={{ fontSize: 9 }} />
                              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                              <Tooltip />
                              <Bar dataKey="cantidad" fill="#0f766e">
                                {getEvaDistribution().map((entry, index) => {
                                  const color = entry.score >= 8 ? '#f43f5e' : entry.score >= 5 ? '#f59e0b' : '#10b981';
                                  return <Cell key={`cell-${index}`} fill={color} />;
                                })}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </div>
                  )}

                </div>

                {/* Patient Overview Summary list */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                  <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <span className="text-xs font-bold uppercase text-slate-500">Últimos Pacientes Atendidos</span>
                    <button
                      onClick={() => setActiveTab('patients')}
                      className="text-xs font-bold hover:underline"
                      style={{ color: activeCompany.colorPrimario }}
                    >
                      Ver todos
                    </button>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {filteredPatientsByCompany.slice(0, 3).map((p) => {
                      const latestConsult = filteredConsultationsByCompany.find(c => c.idPaciente === p.id);
                      return (
                        <div key={p.id} className="p-4 flex items-center justify-between hover:bg-slate-50/30 transition-all text-xs">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-700 uppercase">
                              {p.nombreCompleto.charAt(0)}
                            </div>
                            <div>
                              <span className="font-bold text-slate-800 block text-xs">{p.nombreCompleto}</span>
                              <span className="text-[10px] text-slate-500 block font-mono">ID: {p.identificacion}</span>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-4">
                            <span className="text-slate-500 font-medium">
                              {latestConsult ? `Última cita: ${latestConsult.fecha} (${latestConsult.tipo})` : 'Sin consultas registradas'}
                            </span>
                            <button
                              onClick={() => {
                                const matched = filteredConsultationsByCompany.find(c => c.idPaciente === p.id);
                                if (matched) setSelectedReportConsultation(matched);
                                else setActiveConsultationPatient(p);
                              }}
                              className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1 rounded-md text-[10px] font-semibold"
                            >
                              {latestConsult ? 'Ver Ficha' : 'Nueva Consulta'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            )}

            {/* ================= 2. PATIENTS DIRECTORY ================= */}
            {activeTab === 'patients' && (
              <div className="space-y-6">
                
                {/* Search & Actions toolbar */}
                <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-center gap-3">
                  <div className="relative w-full sm:max-w-md">
                    <input
                      type="text"
                      placeholder="Buscar por nombre o número de cédula..."
                      value={patientSearch}
                      onChange={(e) => setPatientSearch(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-1.5 pl-9 pr-4 text-xs sm:text-sm text-slate-800 focus:outline-hidden"
                    />
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  </div>

                  <button
                    onClick={() => setIsAddingPatient(true)}
                    className="w-full sm:w-auto text-white text-xs font-semibold py-2 px-4 rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5"
                    style={{ backgroundColor: activeCompany.colorPrimario }}
                  >
                    <Plus className="w-4 h-4" />
                    Registrar Expediente
                  </button>
                </div>

                {/* Catalog list */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {searchedPatients.length === 0 ? (
                    <div className="col-span-2 text-center py-12 text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200">
                      No se encontraron expedientes para "{patientSearch}"
                    </div>
                  ) : (
                    searchedPatients.map((p) => {
                      return (
                        <div key={p.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col justify-between gap-4">
                          <div className="flex justify-between items-start">
                            <div className="flex gap-3">
                              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-black text-slate-600 uppercase text-sm">
                                {p.nombreCompleto.charAt(0)}
                              </div>
                              <div>
                                <h3 className="font-bold text-slate-800 text-sm">{p.nombreCompleto}</h3>
                                <p className="text-[10px] text-slate-400 font-mono">ID: {p.identificacion} ({p.tipoIdentificacion})</p>
                                <p className="text-[10px] text-slate-500 mt-1">Ocupación: {p.ocupacion || 'Ninguna registrada'}</p>
                              </div>
                            </div>

                            <div className="flex gap-1">
                              <button
                                onClick={() => setEditingPatient(p)}
                                className="p-1 text-slate-500 hover:text-teal-600 hover:bg-slate-50 rounded-lg"
                                title="Editar datos personales"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeletePatient(p.id)}
                                className="p-1 text-slate-500 hover:text-rose-600 hover:bg-slate-50 rounded-lg"
                                title="Eliminar paciente"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {/* Quick details & Clinical summary highlights */}
                          <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-150 text-[11px] grid grid-cols-2 gap-2 text-slate-600">
                            <div>
                              <span className="font-semibold block text-slate-400 uppercase text-[9px]">Gastrointestinal</span>
                              <p className="font-semibold text-slate-700">
                                {p.gastritis ? 'Gastritis/Reflujo (+)' : 'Estómago Normal'}
                              </p>
                            </div>
                            <div>
                              <span className="font-semibold block text-slate-400 uppercase text-[9px]">Cardio / Diabetes</span>
                              <p className="font-semibold text-slate-700">
                                {p.diabetes ? 'Diabetes (+)' : p.hipertension ? 'Hipertensión (+)' : 'Normal'}
                              </p>
                            </div>
                            <div className="col-span-2 border-t pt-1 border-slate-200">
                              <span className="font-semibold block text-slate-400 uppercase text-[9px]">Lesiones Previas</span>
                              <p className="text-slate-700 truncate" title={p.fracturas || p.esguinces}>
                                {p.fracturas || p.esguinces || 'Ninguna reportada'}
                              </p>
                            </div>
                          </div>

                          <div className="flex gap-2 text-xs">
                            <button
                              onClick={() => {
                                const matched = filteredConsultationsByCompany.find(c => c.idPaciente === p.id);
                                if (matched) { setEditingConsultation(matched); setActiveConsultationPatient(p); }
                                else alert("Este paciente aún no registra citas. Cree una primero.");
                              }}
                              className="flex-1 py-2 rounded-xl font-bold transition-all border flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200"
                            >
                              <Edit className="w-3.5 h-3.5" />
                              Editar Cita
                            </button>
                            <button
                              onClick={() => { setEditingConsultation(null); setActiveConsultationPatient(p); }}
                              className="flex-1 text-white py-2 rounded-xl font-bold transition-all shadow-xs flex items-center justify-center gap-1.5"
                              style={{ backgroundColor: activeCompany.colorPrimario }}
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Registrar Cita
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

              </div>
            )}

            {/* ================= 3. CONSULTATIONS TIMELINE ================= */}
            {activeTab === 'consultations' && (
              <div className="space-y-6">
                
                {/* Search */}
                <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-center gap-3">
                  <div className="relative w-full sm:max-w-md">
                    <input
                      type="text"
                      placeholder="Filtrar citas por motivo o diagnóstico..."
                      value={consultationSearch}
                      onChange={(e) => setConsultationSearch(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-1.5 pl-9 pr-4 text-xs sm:text-sm text-slate-800 focus:outline-hidden"
                    />
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  </div>
                </div>

                {/* Timeline */}
                <div className="space-y-4">
                  {searchedConsultations.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200">
                      No se encontraron registros de citas para "{consultationSearch}"
                    </div>
                  ) : (
                    searchedConsultations.map((c) => {
                      const matchedPatient = patients.find(p => p.id === c.idPaciente);
                      const isNut = c.tipo === 'Nutrición';
                      return (
                        <div key={c.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:border-slate-300 transition-all">
                          <div className="flex flex-wrap justify-between items-start gap-4">
                            <div className="flex gap-4 min-w-0">
                              <span className={`px-2.5 py-1.5 rounded-xl font-bold text-xs uppercase tracking-wider shrink-0 text-center flex flex-col justify-center ${
                                isNut ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                              }`}>
                                <span>{isNut ? '🍎' : '💪'}</span>
                                <span className="text-[9px] font-extrabold mt-0.5">{c.tipo}</span>
                              </span>

                              <div>
                                <span className="text-[10px] text-slate-400 font-mono block mb-1">Folio: #{c.id.toString().slice(-6)} | Cita: {c.fecha}</span>
                                <h4 className="font-bold text-slate-800 text-sm">
                                  {matchedPatient ? matchedPatient.nombreCompleto : 'Paciente Desconocido'}
                                </h4>
                                <p className="text-xs text-slate-600 mt-1 font-semibold">Motivo: {c.motivo}</p>
                              </div>
                            </div>

                            <div className="flex gap-1.5">
                              <button
                                onClick={() => setSelectedReportConsultation(c)}
                                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs py-1.5 px-3.5 rounded-lg flex items-center gap-1.5 border border-slate-200"
                              >
                                <Printer className="w-3.5 h-3.5" />
                                Reporte de Cita
                              </button>
                              <button
                                onClick={() => handleDeleteConsultation(c.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-50 rounded-lg"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {/* Quick parameters readout */}
                          {isNut && c.antropometria && (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 text-[11px] bg-slate-50 p-2.5 rounded-xl border border-slate-150">
                              <div>
                                <span className="text-slate-400 block font-bold">Peso:</span>
                                <span className="font-bold text-slate-700">{c.antropometria.peso} kg</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block font-bold">IMC:</span>
                                <span className="font-bold text-slate-700">{c.antropometria.imc}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block font-bold">Grasa:</span>
                                <span className="font-bold text-slate-700">{c.antropometria.grasaCorporal}%</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block font-bold">Masa Musc:</span>
                                <span className="font-bold text-slate-700">{c.antropometria.masaMuscular} kg</span>
                              </div>
                            </div>
                          )}

                          {!isNut && c.fisioterapia && (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 text-[11px] bg-slate-50 p-2.5 rounded-xl border border-slate-150">
                              <div>
                                <span className="text-slate-400 block font-bold">Zona Dolor:</span>
                                <span className="font-bold text-slate-700 uppercase">{c.fisioterapia.zonaDolor}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block font-bold">Intensidad EVA:</span>
                                <span className="font-extrabold text-rose-600">{c.fisioterapia.evaDolor}/10</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block font-bold">ROM:</span>
                                <span className="font-bold text-slate-700 truncate">{c.fisioterapia.romMedido || 'S/D'}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block font-bold">Daniels:</span>
                                <span className="font-bold text-slate-700">{c.fisioterapia.fuerzaDaniels || 'S/D'}</span>
                              </div>
                            </div>
                          )}
                        </div>
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
                  onAnularFactura={handleAnularFactura}
                  onVerificarEstadoFactura={handleVerificarEstadoFactura}
                />
                <CxCManager
                  cxc={cxc.filter(c => c.idCompania === selectedCompanyId)}
                  patients={filteredPatientsByCompany}
                  onRegistrarPago={handleRegistrarPagoCxc}
                />
              </div>
            )}

            {/* ================= CUENTAS POR PAGAR (CXP) + PROVEEDORES ================= */}
            {activeTab === 'cxp' && (
              <div className="space-y-5">
                <ProveedorManager
                  proveedores={proveedores.filter(p => p.idCompania === selectedCompanyId)}
                  onSaveProveedor={handleSaveProveedor}
                />
                <CxPManager
                  cxp={cxp.filter(c => c.idCompania === selectedCompanyId)}
                  proveedores={proveedores.filter(p => p.idCompania === selectedCompanyId)}
                  articulos={servicios.filter(s => s.idCompania === selectedCompanyId && s.tipo === 'ARTICULO')}
                  onCrearCxp={handleCrearCxp}
                  onRegistrarPago={handleRegistrarPagoCxp}
                  onImportarXml={handleImportarXmlCxp}
                />
              </div>
            )}

            {/* ================= REPORTES FISCALES D-104 / D-101 ================= */}
            {activeTab === 'reportes-fiscales' && (
              <ReportesFiscales company={activeCompany} />
            )}

            {/* ================= REPORTERÍA DE CLIENTES Y SESIONES ================= */}
            {activeTab === 'reporteria' && (
              <ReporteriaClinica company={activeCompany} />
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
                currentUser={currentUser!}
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

            {activeTab === 'saas-admin' && currentUser?.idCompania === 7 && currentUser?.rol === 'Administrador' && (
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

            {activeTab === 'mi-perfil' && currentUser && (
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
                citas={citas.filter(c => c.idCompania === selectedCompanyId)}
                smtpConfigs={smtpConfigs}
                logs={logs}
                activeCompanyId={selectedCompanyId}
                currentUser={currentUser || users.filter(u => u.idCompania === selectedCompanyId)[0]}
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
                themeColor={activeCompany.colorPrimario}
              />
            )}

          </main>
        </div>
      )}

      {/* Persistent Page Footer */}
      <footer className="mt-auto py-5 bg-slate-900 text-slate-400 text-xs text-center border-t border-slate-950 shrink-0 print:hidden">
        <p className="font-semibold text-slate-300">TuanisBooking © {new Date().getFullYear()}</p>
        <p className="text-[10px] text-slate-500 mt-1">Plataforma clínica para el control integral de pacientes con facturación digital autorizada</p>
      </footer>

    </div>
  );
}
