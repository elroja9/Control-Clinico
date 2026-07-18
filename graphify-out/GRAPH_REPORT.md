# Graph Report - D:\\Control-Clinico  (2026-07-18)

## Corpus Check
- Corpus is ~29 731 words - fits in a single context window. You may not need a graph.

## Summary
- 123 nodes · 191 edges · 34 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Structure Signals
- Entity graph basis: 110 non-file, non-concept node(s)
- Weakly connected components: 21
- Singleton components: 18
- Isolated nodes: 18
- Largest component: 51 node(s) (46% of the entity graph basis)
- Low-cohesion communities: 1
- Largest low-cohesion community: 15 node(s) (cohesion 0.13)

## Workspace Bridges
1. `app` - connects `Server — API`, `Server — API \(10\)`, `Server — API \(11\)`, `Server — API \(12\)`, `Server — API \(13\)`, `Server — API \(14\)`, `Server — API \(15\)`, `Server — API \(16\)`, `Server — API \(2\)`, `Server — API \(3\)`, `Server — API \(4\)`, `Server — API \(5\)`, `Server — API \(6\)`, `Server — API \(7\)`, `Server — API \(8\)`, `Server — API \(9\)`, `Server — Handles`; home: `Server — Use`; degree 20; score 514.5
  source files: `D:/Control-Clinico/server.ts`
2. `App\(\)` - connects `Components Agenda Calendar`, `Components Company Settings`, `Components Consultation Form`, `Components Login View`, `Components Patient Form`, `Components Report View`; home: `Src App`; degree 20; score 1920.5
  source files: `D:/Control-Clinico/src/App.tsx`, `D:/Control-Clinico/src/components/AgendaCalendar.tsx`, `D:/Control-Clinico/src/components/CompanySettings.tsx`, `D:/Control-Clinico/src/components/ConsultationForm.tsx`, `D:/Control-Clinico/src/components/LoginView.tsx`, `D:/Control-Clinico/src/components/PatientForm.tsx`, `D:/Control-Clinico/src/components/ReportView.tsx`
3. `AgendaCalendar\(\)` - connects `Components Agenda Calendar — Cita`, `Components Agenda Calendar — Month`, `Src App`; home: `Components Agenda Calendar`; degree 15; score 1645.5
  source files: `D:/Control-Clinico/src/App.tsx`, `D:/Control-Clinico/src/components/AgendaCalendar.tsx`
4. `CompanySettings\(\)` - connects `Components Company Settings — Company`, `Src App`; home: `Components Company Settings`; degree 6; score 630
  source files: `D:/Control-Clinico/src/App.tsx`, `D:/Control-Clinico/src/components/CompanySettings.tsx`
5. `ConsultationForm\(\)` - connects `Components Pain Map Selector — Pain`, `Src App`; home: `Components Consultation Form`; degree 3; score 261.8
  source files: `D:/Control-Clinico/src/App.tsx`, `D:/Control-Clinico/src/components/ConsultationForm.tsx`, `D:/Control-Clinico/src/components/PainMapSelector.tsx`
6. `LoginView\(\)` - connects `Src App`; home: `Components Login View`; degree 4; score 386
  source files: `D:/Control-Clinico/src/App.tsx`, `D:/Control-Clinico/src/components/LoginView.tsx`

## God Nodes
1. `App\(\)` - 22 edges
2. `app` - 21 edges
3. `AgendaCalendar\(\)` - 17 edges
4. `CompanySettings\(\)` - 8 edges
5. `LoginView\(\)` - 6 edges
6. `Patient` - 6 edges
7. `ReportView\(\)` - 6 edges
8. `Company` - 5 edges
9. `ConsultationForm\(\)` - 5 edges
10. `PatientForm\(\)` - 5 edges

## Surprising Connections
- `App\(\)` --renders--> `LoginView\(\)`  [EXTRACTED]
  D:/Control-Clinico/src/App.tsx → D:/Control-Clinico/src/components/LoginView.tsx  _bridges separate communities_
- `App\(\)` --renders--> `ReportView\(\)`  [EXTRACTED]
  D:/Control-Clinico/src/App.tsx → D:/Control-Clinico/src/components/ReportView.tsx  _bridges separate communities_
- `App\(\)` --renders--> `ConsultationForm\(\)`  [EXTRACTED]
  D:/Control-Clinico/src/App.tsx → D:/Control-Clinico/src/components/ConsultationForm.tsx  _bridges separate communities_
- `App\(\)` --renders--> `PatientForm\(\)`  [EXTRACTED]
  D:/Control-Clinico/src/App.tsx → D:/Control-Clinico/src/components/PatientForm.tsx  _bridges separate communities_
- `App\(\)` --renders--> `CompanySettings\(\)`  [EXTRACTED]
  D:/Control-Clinico/src/App.tsx → D:/Control-Clinico/src/components/CompanySettings.tsx  _bridges separate communities_

## Semantic Anomalies
- **[HIGH] Bridge node** - App\(\) bridges Src App and Components Mock Data, Components Login View, Components Report View, Components Consultation Form, Components Patient Form, Components Company Settings, Components Agenda Calendar.
  _High betweenness centrality \(1840.500\) across 8 communities makes this node a likely dependency chokepoint._
- **[HIGH] Bridge node** - AgendaCalendar\(\) bridges Components Agenda Calendar and Src App, Components Mock Data, Components Agenda Calendar — Cita, Components Agenda Calendar — Month.
  _High betweenness centrality \(1600.500\) across 5 communities makes this node a likely dependency chokepoint._
- **[HIGH] Bridge node** - app bridges Server — Use and Server, Server — API \(5\), Server — API \(3\), Server — API \(11\), Server — API \(9\), Server — API \(16\), Server — API \(7\), Server — API \(14\), Server — API \(4\), Server — API \(12\), Server — API \(2\), Server — API \(10\), Server — API, Server — API \(8\), Server — API \(15\), Server — API \(6\), Server — API \(13\), Server — Handles.
  _High betweenness centrality \(324.500\) across 19 communities makes this node a likely dependency chokepoint._
- **[HIGH] Cross-boundary edge** - App\(\) → AgendaCalendar\(\) crosses graph boundaries in an unexpected way.
  _bridges separate communities_
- **[HIGH] Cross-boundary edge** - App\(\) → CompanySettings\(\) crosses graph boundaries in an unexpected way.
  _bridges separate communities_

## Communities

### Community 0 - "Components Mock Data"
Cohesion (entity basis within full-graph community): 0
Nodes (13): AgendaCalendarProps, CompanySettingsProps, ConsultationFormProps, LoginViewProps, Cita, CompaniaSmtpConfig, Company, Consultation (+5 more)

### Community 1 - "Src App"
Cohesion (entity basis within full-graph community): 0.13
Nodes (15): App\(\), getEvaDistribution\(\), getWeightHistoryData\(\), handleAddNotificationLog\(\), handleDeleteCita\(\), handleDeleteConsultation\(\), handleDeletePatient\(\), handleLogin\(\) (+7 more)

### Community 2 - "Components Agenda Calendar"
Cohesion (entity basis within full-graph community): 0.2
Nodes (10): AgendaCalendar\(\), getStatusColor\(\), handleDelete\(\), handleFormSubmit\(\), handleNext\(\), handleOpenEditCita\(\), handlePrev\(\), handleResize\(\) (+2 more)

### Community 3 - "Server"
Cohesion (entity basis within full-graph community): 0.2
Nodes (5): createTables\(\), normalizeRow\(\), seedDefaultData\(\), setupDatabase\(\), startServer\(\)

### Community 4 - "Components Company Settings"
Cohesion (entity basis within full-graph community): 0.5
Nodes (4): CompanySettings\(\), handleSaveSmtp\(\), openAddForm\(\), saveEdit\(\)

### Community 5 - "Server — Use"
Cohesion (entity basis within full-graph community): 0.5
Nodes (4): app, USE /, USE /, USE /

### Community 6 - "Components Login View"
Cohesion (entity basis within full-graph community): 0.5
Nodes (4): LoginView\(\), handleDemoLogin\(\), handleLoginSubmit\(\), handleRegisterSubmit\(\)

### Community 7 - "Components Report View"
Cohesion (entity basis within full-graph community): 0.5
Nodes (4): ReportView\(\), getEvaLabel\(\), sendClientEmail\(\), triggerPrint\(\)

### Community 8 - "Components Agenda Calendar — Cita"
Cohesion (entity basis within full-graph community): 0.67
Nodes (3): formatDateString\(\), handleOpenNewCita\(\), renderDayView\(\)

### Community 9 - "Components Patient Form"
Cohesion (entity basis within full-graph community): 0.67
Nodes (3): PatientForm\(\), handleBirthdateChange\(\), handleSave\(\)

### Community 10 - "Data Schema"
Cohesion (entity basis within full-graph community): 0
Nodes (2): ColumnInfo, TableInfo

### Community 11 - "Components Agenda Calendar — Month"
Cohesion (entity basis within full-graph community): 1
Nodes (2): getDaysInMonth\(\), renderMonthView\(\)

### Community 12 - "Components Company Settings — Company"
Cohesion (entity basis within full-graph community): 1
Nodes (2): createCompany\(\), handleSelect\(\)

### Community 13 - "Components Consultation Form"
Cohesion (entity basis within full-graph community): 1
Nodes (2): ConsultationForm\(\), handleFormSubmit\(\)

### Community 14 - "Server — API"
Cohesion (entity basis within full-graph community): 1
Nodes (2): DELETE /api/citas/:id, inline handles\_route DELETE /api/citas/:id

### Community 15 - "Server — Handles"
Cohesion (entity basis within full-graph community): 1
Nodes (2): GET /\*, inline handles\_route GET /\*

### Community 16 - "Server — API \(2\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): GET /api/citas, inline handles\_route GET /api/citas

### Community 17 - "Server — API \(3\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): GET /api/companies, inline handles\_route GET /api/companies

### Community 18 - "Server — API \(4\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): GET /api/consultations, inline handles\_route GET /api/consultations

### Community 19 - "Server — API \(5\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): GET /api/db-status, inline handles\_route GET /api/db-status

### Community 20 - "Server — API \(6\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): GET /api/notification-logs, inline handles\_route GET /api/notification-logs

### Community 21 - "Server — API \(7\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): GET /api/patients, inline handles\_route GET /api/patients

### Community 22 - "Server — API \(8\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): GET /api/smtp-configs, inline handles\_route GET /api/smtp-configs

### Community 23 - "Server — API \(9\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): GET /api/users, inline handles\_route GET /api/users

### Community 24 - "Server — API \(10\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): POST /api/citas, inline handles\_route POST /api/citas

### Community 25 - "Server — API \(11\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): POST /api/companies, inline handles\_route POST /api/companies

### Community 26 - "Server — API \(12\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): POST /api/consultations, inline handles\_route POST /api/consultations

### Community 27 - "Server — API \(13\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): POST /api/notification-logs, inline handles\_route POST /api/notification-logs

### Community 28 - "Server — API \(14\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): POST /api/patients, inline handles\_route POST /api/patients

### Community 29 - "Server — API \(15\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): POST /api/smtp-configs, inline handles\_route POST /api/smtp-configs

### Community 30 - "Server — API \(16\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): POST /api/users, inline handles\_route POST /api/users

### Community 31 - "Components Pain Map Selector"
Cohesion (entity basis within full-graph community): 1
Nodes (1): PainMapProps

### Community 32 - "Components Pain Map Selector — Pain"
Cohesion (entity basis within full-graph community): 1
Nodes (2): PainMapSelector\(\), getPainColor\(\)

### Community 33 - "Vite Config TypeScript"
Cohesion (entity basis within full-graph community): n/a
Nodes (0): 

## Knowledge Gaps
- **76 weakly connected node(s):** `createTables\(\)`, `seedDefaultData\(\)`, `normalizeRow\(\)`, `startServer\(\)`, `USE /` (+71 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Components Agenda Calendar — Month`** (2 nodes): `getDaysInMonth\(\)`, `renderMonthView\(\)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Components Company Settings — Company`** (2 nodes): `createCompany\(\)`, `handleSelect\(\)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Components Consultation Form`** (2 nodes): `ConsultationForm\(\)`, `handleFormSubmit\(\)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API`** (2 nodes): `DELETE /api/citas/:id`, `inline handles\_route DELETE /api/citas/:id`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — Handles`** (2 nodes): `GET /\*`, `inline handles\_route GET /\*`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(2\)`** (2 nodes): `GET /api/citas`, `inline handles\_route GET /api/citas`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(3\)`** (2 nodes): `GET /api/companies`, `inline handles\_route GET /api/companies`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(4\)`** (2 nodes): `GET /api/consultations`, `inline handles\_route GET /api/consultations`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(5\)`** (2 nodes): `GET /api/db-status`, `inline handles\_route GET /api/db-status`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(6\)`** (2 nodes): `GET /api/notification-logs`, `inline handles\_route GET /api/notification-logs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(7\)`** (2 nodes): `GET /api/patients`, `inline handles\_route GET /api/patients`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(8\)`** (2 nodes): `GET /api/smtp-configs`, `inline handles\_route GET /api/smtp-configs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(9\)`** (2 nodes): `GET /api/users`, `inline handles\_route GET /api/users`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(10\)`** (2 nodes): `POST /api/citas`, `inline handles\_route POST /api/citas`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(11\)`** (2 nodes): `POST /api/companies`, `inline handles\_route POST /api/companies`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(12\)`** (2 nodes): `POST /api/consultations`, `inline handles\_route POST /api/consultations`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(13\)`** (2 nodes): `POST /api/notification-logs`, `inline handles\_route POST /api/notification-logs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(14\)`** (2 nodes): `POST /api/patients`, `inline handles\_route POST /api/patients`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(15\)`** (2 nodes): `POST /api/smtp-configs`, `inline handles\_route POST /api/smtp-configs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(16\)`** (2 nodes): `POST /api/users`, `inline handles\_route POST /api/users`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Components Pain Map Selector`** (2 nodes): `PainMapSelector.tsx`, `PainMapProps`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Components Pain Map Selector — Pain`** (2 nodes): `PainMapSelector\(\)`, `getPainColor\(\)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Vite Config TypeScript`** (1 nodes): `vite.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does \`App\(\)\` connect \`Src App\` to \`Components Mock Data\`, \`Components Login View\`, \`Components Report View\`, \`Components Consultation Form\`, \`Components Patient Form\`, \`Components Company Settings\`, \`Components Agenda Calendar\`?**
  _High betweenness centrality \(1840.500\) - this node is a cross-community bridge._
- **Why does \`AgendaCalendar\(\)\` connect \`Components Agenda Calendar\` to \`Src App\`, \`Components Mock Data\`, \`Components Agenda Calendar — Cita\`, \`Components Agenda Calendar — Month\`?**
  _High betweenness centrality \(1600.500\) - this node is a cross-community bridge._
- **Why does \`CompanySettings\(\)\` connect \`Components Company Settings\` to \`Src App\`, \`Components Mock Data\`, \`Components Company Settings — Company\`?**
  _High betweenness centrality \(604.000\) - this node is a cross-community bridge._
- **What connects \`createTables\(\)\`, \`seedDefaultData\(\)\`, \`normalizeRow\(\)\` to the rest of the system?**
  _76 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should \`Src App\` be split into smaller, more focused modules?**
  _Cohesion score 0.13 across 15 entity nodes - this community may mix unrelated responsibilities._
