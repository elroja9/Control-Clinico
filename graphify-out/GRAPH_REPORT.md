# Graph Report - D:\\Control-Clinico  (2026-10-01)

## Corpus Check
- 88 files · ~189,911 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 712 nodes · 1381 edges · 182 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Structure Signals
- Entity graph basis: 656 non-file, non-concept node(s)
- Weakly connected components: 120
- Singleton components: 96
- Isolated nodes: 96
- Largest component: 301 node(s) (46% of the entity graph basis)
- Low-cohesion communities: 3
- Largest low-cohesion community: 37 node(s) (cohesion 0.05)

## Workspace Bridges
1. `app` - connects `Server — Ajustar`, `Server — Anular`, `Server — API`, `Server — API \(10\)`, `Server — API \(11\)`, `Server — API \(12\)`, `Server — API \(13\)`, `Server — API \(14\)`, `Server — API \(15\)`, `Server — API \(16\)`, `Server — API \(17\)`, `Server — API \(18\)`, `Server — API \(19\)`, `Server — API \(2\)`, `Server — API \(20\)`, `Server — API \(21\)`, `Server — API \(22\)`, `Server — API \(23\)`, `Server — API \(24\)`, `Server — API \(25\)`, `Server — API \(26\)`, `Server — API \(27\)`, `Server — API \(28\)`, `Server — API \(29\)`, `Server — API \(3\)`, `Server — API \(30\)`, `Server — API \(31\)`, `Server — API \(32\)`, `Server — API \(33\)`, `Server — API \(34\)`, `Server — API \(35\)`, `Server — API \(36\)`, `Server — API \(37\)`, `Server — API \(38\)`, `Server — API \(39\)`, `Server — API \(4\)`, `Server — API \(40\)`, `Server — API \(41\)`, `Server — API \(42\)`, `Server — API \(43\)`, `Server — API \(44\)`, `Server — API \(45\)`, `Server — API \(46\)`, `Server — API \(47\)`, `Server — API \(48\)`, `Server — API \(49\)`, `Server — API \(5\)`, `Server — API \(50\)`, `Server — API \(51\)`, `Server — API \(52\)`, `Server — API \(53\)`, `Server — API \(54\)`, `Server — API \(55\)`, `Server — API \(56\)`, `Server — API \(57\)`, `Server — API \(58\)`, `Server — API \(59\)`, `Server — API \(6\)`, `Server — API \(60\)`, `Server — API \(61\)`, `Server — API \(62\)`, `Server — API \(63\)`, `Server — API \(64\)`, `Server — API \(65\)`, `Server — API \(66\)`, `Server — API \(67\)`, `Server — API \(68\)`, `Server — API \(69\)`, `Server — API \(7\)`, `Server — API \(70\)`, `Server — API \(71\)`, `Server — API \(8\)`, `Server — API \(9\)`, `Server — Handles`, `Server — Saas`; home: `Server — Use`; degree 78; score 5480.74
  source files: `D:/Control-Clinico/server.ts`
2. `requireAuth\(\)` - connects `Server`, `Server — Ajustar`, `Server — Anular`, `Server — API \(10\)`, `Server — API \(11\)`, `Server — API \(12\)`, `Server — API \(13\)`, `Server — API \(15\)`, `Server — API \(16\)`, `Server — API \(18\)`, `Server — API \(19\)`, `Server — API \(2\)`, `Server — API \(20\)`, `Server — API \(21\)`, `Server — API \(22\)`, `Server — API \(23\)`, `Server — API \(3\)`, `Server — API \(30\)`, `Server — API \(31\)`, `Server — API \(32\)`, `Server — API \(33\)`, `Server — API \(34\)`, `Server — API \(35\)`, `Server — API \(36\)`, `Server — API \(37\)`, `Server — API \(38\)`, `Server — API \(4\)`, `Server — API \(40\)`, `Server — API \(41\)`, `Server — API \(42\)`, `Server — API \(43\)`, `Server — API \(44\)`, `Server — API \(45\)`, `Server — API \(46\)`, `Server — API \(47\)`, `Server — API \(48\)`, `Server — API \(49\)`, `Server — API \(5\)`, `Server — API \(50\)`, `Server — API \(51\)`, `Server — API \(52\)`, `Server — API \(54\)`, `Server — API \(55\)`, `Server — API \(56\)`, `Server — API \(59\)`, `Server — API \(6\)`, `Server — API \(60\)`, `Server — API \(61\)`, `Server — API \(62\)`, `Server — API \(63\)`, `Server — API \(64\)`, `Server — API \(66\)`, `Server — API \(67\)`, `Server — API \(68\)`, `Server — API \(69\)`, `Server — API \(7\)`, `Server — API \(71\)`, `Server — API \(8\)`, `Server — API \(9\)`, `Server — Saas`, `Server Auth — Cookie`; home: `Server — API`; degree 62; score 5588.09
  source files: `D:/Control-Clinico/server.ts`
3. `startServer\(\)` - connects `Server — Anulacion`, `Server — API`, `Server — Cargar`, `Server — Cargar \(2\)`, `Server — Config`, `Server — Consultation`, `Server — Factura`, `Server — Fetch`, `Server — Guardar`, `Server — Saas`, `Server Auth`, `Server Auth — Access`, `Server Auth — Bcrypt`, `Server Auth — Cookie`, `Server Auth — Session`, `Server Crypto`, `Server Email Templates`, `Server Google Maps`, `Server Hacienda API`, `Server Hacienda Factura`, `Server Hacienda Factura — Calcular`, `Server Hacienda Factura — Clave`, `Server Hacienda Factura — Construir`, `Server Hacienda Signer — Array`, `Server Hacienda Signer — Attrs`, `Server HTTPS Cert`, `Server Mailer`, `Server PDF`, `Server PDF Templates`, `Server XML Proveedor Parser`, `Utils Fecha Cr`, `Utils Fecha Cr — Ajustar`; home: `Server`; degree 86; score 29189.4
  source files: `D:/Control-Clinico/server.ts`, `D:/Control-Clinico/server/auth.ts`, `D:/Control-Clinico/server/crypto.ts`, `D:/Control-Clinico/server/emailTemplates.ts`, `D:/Control-Clinico/server/googleMaps.ts`, `D:/Control-Clinico/server/haciendaApi.ts`, `D:/Control-Clinico/server/haciendaFactura.ts`, `D:/Control-Clinico/server/haciendaSigner.ts`, `D:/Control-Clinico/server/httpsCert.ts`, `D:/Control-Clinico/server/mailer.ts`, `D:/Control-Clinico/server/pdf.ts`, `D:/Control-Clinico/server/pdfTemplates.ts`, `D:/Control-Clinico/server/serviciosDefecto.ts`, `D:/Control-Clinico/server/xmlProveedorParser.ts`, `D:/Control-Clinico/src/utils/fechaCR.ts`
4. `App\(\)` - connects `Components App`, `Components Company Settings`, `Components Cx P Manager`, `Components Facturacion Manager`, `Components Reportes Fiscales`, `Src App — Cargar`, `Src App — Handle`, `Src App — Handle \(2\)`, `Src App — Handle \(3\)`, `Src App — Hash`; home: `Src App`; degree 55; score 32581.37
  source files: `D:/Control-Clinico/src/App.tsx`, `D:/Control-Clinico/src/components/CompanySettings.tsx`, `D:/Control-Clinico/src/components/CxPManager.tsx`, `D:/Control-Clinico/src/components/FacturacionManager.tsx`, `D:/Control-Clinico/src/components/ReportesFiscales.tsx`
5. `AgendaCalendar\(\)` - connects `Components Agenda Calendar — Abrir`, `Components Agenda Calendar — Abrir \(2\)`, `Components Agenda Calendar — Abrir \(3\)`, `Components Agenda Calendar — Block`, `Components Agenda Calendar — Cambio`, `Components Agenda Calendar — Cita`, `Components Agenda Calendar — Handle`, `Components Agenda Calendar — Month`, `Components App`, `Components Mock Data`; home: `Components Agenda Calendar`; degree 30; score 20087.63
  source files: `D:/Control-Clinico/src/components/AgendaCalendar.tsx`, `D:/Control-Clinico/src/components/FacturarModal.tsx`, `D:/Control-Clinico/src/hooks/useDialog.ts`
6. `confirmar\(\)` - connects `Components Agenda Calendar — Cambio`, `Components Agenda Calendar — Cita`, `Components Cx P Manager`, `Components Reportes Fiscales — Cerrar`, `Src App — Handle \(2\)`; home: `Components App`; degree 11; score 5741.12
  source files: `D:/Control-Clinico/src/App.tsx`, `D:/Control-Clinico/src/components/AgendaCalendar.tsx`, `D:/Control-Clinico/src/components/CompanySettings.tsx`, `D:/Control-Clinico/src/components/CxPManager.tsx`, `D:/Control-Clinico/src/components/ReportesFiscales.tsx`, `D:/Control-Clinico/src/components/ui/Feedback.tsx`

## God Nodes
1. `startServer\(\)` - 87 edges
2. `app` - 79 edges
3. `requireAuth\(\)` - 62 edges
4. `App\(\)` - 56 edges
5. `AgendaCalendar\(\)` - 32 edges
6. `CompanySettings\(\)` - 28 edges
7. `confirmar\(\)` - 17 edges
8. `Company` - 14 edges
9. `FacturacionManager\(\)` - 12 edges
10. `Patient` - 12 edges

## Surprising Connections
- `handleConfirmarImportacionXml\(\)` --calls--> `confirmar\(\)`  [EXTRACTED]
  D:/Control-Clinico/src/components/CxPManager.tsx → D:/Control-Clinico/src/components/ui/Feedback.tsx  _bridges separate communities; peripheral node \`handleConfirmarImportacionXml\(\)\` unexpectedly reaches hub \`confirmar\(\)\`_
- `AgendaCalendar\(\)` --renders--> `FacturarModal\(\)`  [EXTRACTED]
  D:/Control-Clinico/src/components/AgendaCalendar.tsx → D:/Control-Clinico/src/components/FacturarModal.tsx  _bridges separate communities_
- `ReportView\(\)` --renders--> `FacturarModal\(\)`  [EXTRACTED]
  D:/Control-Clinico/src/components/ReportView.tsx → D:/Control-Clinico/src/components/FacturarModal.tsx  _bridges separate communities_
- `emailShell\(\)` --calls--> `colorMarca\(\)`  [EXTRACTED]
  D:/Control-Clinico/server/emailTemplates.ts → D:/Control-Clinico/server/branding.ts  _bridges separate communities_
- `emailShell\(\)` --calls--> `textoSobre\(\)`  [EXTRACTED]
  D:/Control-Clinico/server/emailTemplates.ts → D:/Control-Clinico/server/branding.ts  _bridges separate communities_

## Semantic Anomalies
- **[HIGH] Bridge node** - startServer\(\) bridges Server and Data Server, Server — Fetch, Server Auth — Cookie, Server — API, Server — Saas, Server — Cargar, Server Auth — Access, Server — Cargar \(2\), Server — Config, Server Hacienda API, Server — Factura, Server — Anulacion, Server — Guardar, Utils Fecha Cr — Ajustar, Server — Consultation, Server Auth — Bcrypt, Server Auth, Server Auth — Session, Server Email Templates, Server Mailer, Server Crypto, Server Hacienda Signer — Attrs, Server Hacienda Signer — Array, Server Hacienda Factura — Calcular, Server Hacienda Factura — Clave, Server Hacienda Factura — Construir, Server Hacienda Factura, Server PDF, Server PDF Templates, Utils Fecha Cr, Server XML Proveedor Parser, Server Google Maps, Server HTTPS Cert.
  _High betweenness centrality \(28783.398\) across 34 communities makes this node a likely dependency chokepoint._
- **[HIGH] Bridge node** - App\(\) bridges Src App and Components Mock Data, Src App — Cargar, Src App — Handle \(2\), Src App — Hash, Components App, Src App — Handle, Src App — Handle \(3\), Components Facturacion Manager, Components Cx P Manager, Components Reportes Fiscales, Components Company Settings.
  _High betweenness centrality \(32426.372\) across 12 communities makes this node a likely dependency chokepoint._
- **[HIGH] Bridge node** - app bridges Server — Use and Data Server, Server — API \(57\), Server — API \(58\), Server — API \(53\), Server — API \(17\), Server — API \(14\), Server — API, Server — API \(39\), Server — Saas, Server — API \(10\), Server — API \(40\), Server — API \(36\), Server — API \(70\), Server — API \(20\), Server — API \(61\), Server — API \(4\), Server — API \(11\), Server — API \(42\), Server — API \(43\), Server — API \(3\), Server — API \(9\), Server — API \(38\), Server — API \(8\), Server — API \(37\), Server — API \(2\), Server — API \(22\), Server — API \(63\), Server — API \(6\), Server — API \(21\), Server — API \(62\), Server — API \(5\), Server — API \(34\), Server — API \(68\), Server — Ajustar, Server — API \(18\), Server — API \(41\), Server — API \(16\), Server — API \(54\), Server — API \(56\), Server — API \(55\), Server — API \(7\), Server — API \(15\), Server — API \(48\), Server — Anular, Server — API \(50\), Server — API \(51\), Server — API \(49\), Server — API \(52\), Server — API \(12\), Server — API \(44\), Server — API \(23\), Server — API \(64\), Server — API \(13\), Server — API \(45\), Server — API \(46\), Server — API \(47\), Server — API \(31\), Server — API \(33\), Server — API \(67\), Server — API \(32\), Server — API \(71\), Server — API \(66\), Server — API \(30\), Server — API \(35\), Server — API \(69\), Server — API \(19\), Server — API \(59\), Server — API \(60\), Server — API \(28\), Server — API \(24\), Server — API \(26\), Server — API \(27\), Server — API \(25\), Server — API \(29\), Server — API \(65\), Server — Handles.
  _High betweenness centrality \(4652.739\) across 77 communities makes this node a likely dependency chokepoint._
- **[HIGH] Low-cohesion community** - Src App is weakly connected for its size.
  _Cohesion score 0.05 across 37 nodes suggests this community may mix unrelated responsibilities._
- **[HIGH] Low-cohesion community** - Server is weakly connected for its size.
  _Cohesion score 0.07 across 27 nodes suggests this community may mix unrelated responsibilities._

## Communities

### Community 0 - "Components Mock Data"
Cohesion (entity basis within full-graph community): 0.01
Nodes (44): AgendaCalendarProps, AjusteFacturaModal\(\), handleEmitir\(\), AjusteFacturaModalProps, NavItem, CompanySettingsProps, CxCManagerProps, FacturacionManagerProps (+36 more)

### Community 1 - "Src App"
Cohesion (entity basis within full-graph community): 0.05
Nodes (37): App\(\), badgeLabel\(\), getEvaDistribution\(\), getWeightHistoryData\(\), handleAddCompany\(\), handleAddPayment\(\), handleAjustarStock\(\), handleCargarServiciosDefecto\(\) (+29 more)

### Community 2 - "Components Company Settings"
Cohesion (entity basis within full-graph community): 0.09
Nodes (23): CompanySettings\(\), buscarCabys\(\), handleAgregarPorcentaje\(\), handleCambiarCantonFiscal\(\), handleCambiarDia\(\), handleCambiarProvinciaFiscal\(\), handleCargarServiciosDefecto\(\), handleCertificadoFileChange\(\) (+15 more)

### Community 3 - "Server"
Cohesion (entity basis within full-graph community): 0.09
Nodes (22): startServer\(\), buscarArticulo\(\), candadoPorConsulta\(\), candadoPorFactura\(\), comprobantesSinResolver\(\), costoDe\(\), esDelProveedor\(\), esFacturaDeclarableLocal\(\) (+14 more)

### Community 4 - "Data Server"
Cohesion (entity basis within full-graph community): 0
Nodes (15): PagoCuentaCobrar, PagoCuentaPagar, acumularLineasD104\(\), esCodigoCatalogo\(\), fetchLineasPorCuentaPagar\(\), generarSlotsCandidatos\(\), guardarEvaluacionesConsulta\(\), guardarHorarioAtencionCompania\(\) (+7 more)

### Community 5 - "Components Consultation Form"
Cohesion (entity basis within full-graph community): 0.16
Nodes (10): aplicarPorcentaje\(\), calcularPromedioSemanal\(\), calcularTMB\(\), ConsultationForm\(\), handleFormSubmit\(\), invalidarRestaurado\(\), ConsultationFormProps, PainMapProps (+2 more)

### Community 6 - "Server Email Templates"
Cohesion (entity basis within full-graph community): 0.31
Nodes (13): emailShell\(\), escapeHtml\(\), gramosDesdeMacroPct\(\), infoCard\(\), renderAccountStatusEmail\(\), renderCitaEmail\(\), renderCitaEmailProfesional\(\), renderConsultaEmail\(\) (+5 more)

### Community 7 - "Server Hacienda API"
Cohesion (entity basis within full-graph community): 0.11
Nodes (10): consultarEstadoHacienda\(\), enviarFacturaHacienda\(\), EnvioHaciendaResultado, esperarResolucionHacienda\(\), EstadoHaciendaResultado, extraerDetalleMensajeHacienda\(\), obtenerTokenHacienda\(\), mensajeHacienda\(\) (+2 more)

### Community 8 - "Components Agenda Calendar"
Cohesion (entity basis within full-graph community): 0.2
Nodes (10): AgendaCalendar\(\), getStatusColor\(\), handleAbrirFacturar\(\), handleBlockFormSubmit\(\), handleNext\(\), handleOpenEditBlock\(\), handlePrev\(\), handleResize\(\) (+2 more)

### Community 9 - "Components Cx P Manager"
Cohesion (entity basis within full-graph community): 0.22
Nodes (9): CxPManager\(\), abrirAbono\(\), abrirForm\(\), actualizarLinea\(\), confirmarAbono\(\), handleConfirmarImportacionXml\(\), handleGuardar\(\), handleXmlFileChange\(\) (+1 more)

### Community 10 - "Components Facturacion Manager"
Cohesion (entity basis within full-graph community): 0.22
Nodes (9): cantidadesAcreditadas\(\), FacturacionManager\(\), handleConfirmarAnular\(\), handleVerificarEstado\(\), nombrePaciente\(\), puedeAjustar\(\), puedeAnularFactura\(\), puedeVerificar\(\) (+1 more)

### Community 11 - "Server Branding"
Cohesion (entity basis within full-graph community): 0.29
Nodes (7): aRgb\(\), colorMarca\(\), luminancia\(\), canal\(\), razonContraste\(\), textoSobre\(\), tinte\(\)

### Community 12 - "Components Feedback"
Cohesion (entity basis within full-graph community): 0.14
Nodes (7): dismissToast\(\), FeedbackState, push\(\), resolveConfirm\(\), setState\(\), subscribe\(\), ToastItem

### Community 13 - "Server Hacienda Factura"
Cohesion (entity basis within full-graph community): 0
Nodes (7): DesgloseImpuestoCalculado, EmisorFactura, InformacionReferenciaFactura, limpiarCodigoActividad\(\), mapearCodigoTarifaIva\(\), ReceptorFactura, ResumenCalculado

### Community 14 - "Server PDF Templates"
Cohesion (entity basis within full-graph community): 0.43
Nodes (7): colones\(\), documentoShell\(\), escapeHtml\(\), renderConsultaPacientePdf\(\), bloque\(\), gramos\(\), renderFacturaPdf\(\)

### Community 15 - "Server XML Proveedor Parser"
Cohesion (entity basis within full-graph community): 0.13
Nodes (6): FacturaProveedorParseada, LineaFacturaProveedor, parsearFacturaProveedorXML\(\), aColones\(\), facturaXml\(\), textoDe\(\)

### Community 16 - "Server Hacienda Factura — Construir"
Cohesion (entity basis within full-graph community): 0.43
Nodes (7): construirCuerpoComprobante\(\), construirInformacionReferencia\(\), construirXmlFactura\(\), construirXmlNotaCredito\(\), construirXmlNotaDebito\(\), escapeXml\(\), fechaEmisionCR\(\)

### Community 17 - "Components Reporteria Clinica"
Cohesion (entity basis within full-graph community): 0.2
Nodes (6): mesActual\(\), primerDiaMes\(\), ReporteClientesSesiones, ReporteriaClinica\(\), ReporteriaClinicaProps, ultimoDiaMes\(\)

### Community 18 - "Server — Cargar"
Cohesion (entity basis within full-graph community): 0.29
Nodes (7): cargarEmpresaYPaciente\(\), cargarFacturaParaAjuste\(\), cargarFacturaPorId\(\), mensajeEnvioIncierto\(\), notaEnEnvioIncierto\(\), notasDeFactura\(\), sessionOf\(\)

### Community 19 - "Server Hacienda Factura — Calcular"
Cohesion (entity basis within full-graph community): 0.4
Nodes (5): calcularLineas\(\), calcularResumen\(\), esGravada\(\), generarConsecutivo\(\), base\(\)

### Community 20 - "Components My Profile"
Cohesion (entity basis within full-graph community): 0.33
Nodes (4): loadGoogleMapsScript\(\), MyProfile\(\), handleSave\(\), MyProfileProps

### Community 21 - "Data Mock Data"
Cohesion (entity basis within full-graph community): 0
Nodes (5): CierreFiscal, GastosManualesAnuales, ReporteD101, ReporteD104, ReportesFiscalesProps

### Community 22 - "Components Patient Form"
Cohesion (entity basis within full-graph community): 0.33
Nodes (6): PatientForm\(\), handleBirthdateChange\(\), handleCantonChange\(\), handleDistritoChange\(\), handleProvinciaChange\(\), handleSave\(\)

### Community 23 - "Components Plantilla Dieta Manager"
Cohesion (entity basis within full-graph community): 0.47
Nodes (6): PlantillaDietaManager\(\), handleEditar\(\), handleGuardar\(\), parsePct\(\), handleNueva\(\), limpiarFormulario\(\)

### Community 24 - "Components Public Booking"
Cohesion (entity basis within full-graph community): 0.33
Nodes (6): PublicBooking\(\), buscarPacientePorCedula\(\), cargarHorarios\(\), confirmarCita\(\), fechaLegible\(\), usarUbicacionActual\(\)

### Community 25 - "Components Report View"
Cohesion (entity basis within full-graph community): 0.33
Nodes (6): gramosDesdeMacroPct\(\), ReportView\(\), getEvaLabel\(\), handleToggleEstado\(\), sendClientEmail\(\), triggerPrint\(\)

### Community 26 - "Components App"
Cohesion (entity basis within full-graph community): 0.4
Nodes (5): handleDeleteBlock\(\), handleDeleteConsultation\(\), handleDeletePatient\(\), handleSaveHacienda\(\), confirmar\(\)

### Community 27 - "Server Auth"
Cohesion (entity basis within full-graph community): 0
Nodes (4): generateNumericPassword\(\), hashPassword\(\), serializeSessionCookie\(\), SessionPayload

### Community 28 - "Server Hacienda Factura — Fmt"
Cohesion (entity basis within full-graph community): 0.4
Nodes (5): sumaSubtotal\(\), fmtCantidad\(\), fmtDinero\(\), fmtTarifa\(\), redondear\(\)

### Community 29 - "Components Proveedor Manager"
Cohesion (entity basis within full-graph community): 0.4
Nodes (5): ProveedorManager\(\), abrirEditar\(\), abrirNuevo\(\), handleGuardar\(\), handleToggleActivo\(\)

### Community 30 - "Components Reportes Fiscales"
Cohesion (entity basis within full-graph community): 0.4
Nodes (5): colones\(\), periodOptions\(\), ReportesFiscales\(\), cargarD104\(\), yearOptions\(\)

### Community 31 - "Components Saas Admin Panel"
Cohesion (entity basis within full-graph community): 0.4
Nodes (5): SaasAdminPanel\(\), handleAddPaymentSubmit\(\), openLimitEditor\(\), openPayments\(\), saveLimitEditor\(\)

### Community 32 - "Server — Factura"
Cohesion (entity basis within full-graph community): 0.4
Nodes (5): fetchLineasPorFactura\(\), reconstruirLineaFactura\(\), cantidadesAcreditadas\(\), lineasDeFactura\(\), obtenerDatosD104\(\)

### Community 33 - "Components Agenda Calendar — Month"
Cohesion (entity basis within full-graph community): 0.5
Nodes (4): activarConTeclado\(\), getDaysInMonth\(\), isSlotBlocked\(\), renderMonthView\(\)

### Community 34 - "Src App — Handle"
Cohesion (entity basis within full-graph community): 0.5
Nodes (4): handleAnularFactura\(\), handleEmitirNotaCredito\(\), handleEmitirNotaDebito\(\), recargarFacturacion\(\)

### Community 35 - "Src App — Handle \(2\)"
Cohesion (entity basis within full-graph community): 0.5
Nodes (4): handleLoginSuccess\(\), handleStartSoapFromCalendar\(\), navigateTo\(\), setActiveTab\(\)

### Community 36 - "Data Costa Rica Locations"
Cohesion (entity basis within full-graph community): 0
Nodes (3): CRCanton, CRDistrito, CRProvincia

### Community 37 - "Server — Cargar \(2\)"
Cohesion (entity basis within full-graph community): 0.67
Nodes (4): decryptSecret\(\), cargarCertificadoEmpresa\(\), cargarCredencialesAtv\(\), exigirConfigHacienda\(\)

### Community 38 - "Components Cx C Manager"
Cohesion (entity basis within full-graph community): 0.5
Nodes (4): CxCManager\(\), abrirAbono\(\), confirmarAbono\(\), nombrePaciente\(\)

### Community 39 - "Components Cx P Manager — Cx"
Cohesion (entity basis within full-graph community): 0
Nodes (3): CxPManagerProps, ImportarXmlResultado, LineaForm

### Community 40 - "Server — Use"
Cohesion (entity basis within full-graph community): 0.5
Nodes (4): app, USE /, USE /, USE /

### Community 41 - "Components Factura Detail View"
Cohesion (entity basis within full-graph community): 0.5
Nodes (4): colones\(\), FacturaDetailView\(\), handleReenviar\(\), triggerPrint\(\)

### Community 42 - "Components Feedback — Card"
Cohesion (entity basis within full-graph community): 0.67
Nodes (3): ConfirmDialog\(\), FeedbackHost\(\), ToastCard\(\)

### Community 43 - "Server HTTPS Cert"
Cohesion (entity basis within full-graph community): 0.67
Nodes (3): direccionesLan\(\), generarCertificadoAutofirmado\(\), obtenerCertificadoHttps\(\)

### Community 44 - "Components Login View"
Cohesion (entity basis within full-graph community): 0.5
Nodes (4): LoginView\(\), handleForgotSubmit\(\), handleLoginSubmit\(\), handleRegisterSubmit\(\)

### Community 45 - "Server Mailer"
Cohesion (entity basis within full-graph community): 0
Nodes (3): AdjuntoEmail, OutgoingEmail, sendMail\(\)

### Community 46 - "Components Public Booking — Publico"
Cohesion (entity basis within full-graph community): 0
Nodes (3): ClinicaPublica, ProfesionalPublico, ServicioPublico

### Community 47 - "Components Reportes Fiscales — Cerrar"
Cohesion (entity basis within full-graph community): 0.5
Nodes (4): cerrarPeriodo\(\), enviar\(\), handleCerrarD101\(\), handleCerrarD104\(\)

### Community 48 - "Server — En"
Cohesion (entity basis within full-graph community): 0.67
Nodes (4): construirReporteClientesSesiones\(\), enRango\(\), esNuevoEnRango\(\), registrarPrimerContacto\(\)

### Community 49 - "Components Agenda Calendar — Abrir"
Cohesion (entity basis within full-graph community): 0.67
Nodes (3): avisarBloqueo\(\), renderWeekView\(\), abrirHora\(\)

### Community 50 - "Components Agenda Calendar — Cambio"
Cohesion (entity basis within full-graph community): 0.67
Nodes (3): confirmarCambioEstadoFacturada\(\), facturaVigenteDeCita\(\), handleFormSubmit\(\)

### Community 51 - "Components Agenda Calendar — Cita"
Cohesion (entity basis within full-graph community): 0.67
Nodes (3): guardarCita\(\), aMinutos\(\), handleCancelarCita\(\)

### Community 52 - "Components Agenda Calendar — Handle"
Cohesion (entity basis within full-graph community): 0.67
Nodes (3): handleOpenEditCita\(\), handleSelectPatient\(\), patientLabel\(\)

### Community 53 - "Server Auth — Session"
Cohesion (entity basis within full-graph community): 0.67
Nodes (3): createSessionToken\(\), getSessionKey\(\), verifySessionToken\(\)

### Community 54 - "Server Crypto"
Cohesion (entity basis within full-graph community): 1
Nodes (2): encryptSecret\(\), getKey\(\)

### Community 55 - "Server — API"
Cohesion (entity basis within full-graph community): 0.67
Nodes (3): GET /api/companies, inline handles\_route GET /api/companies, requireAuth\(\)

### Community 56 - "Server — Saas"
Cohesion (entity basis within full-graph community): 0.67
Nodes (3): POST /api/companies/:id/estado-saas, inline handles\_route POST /api/companies/:id/estado-saas, requireSaasAdmin\(\)

### Community 57 - "Components Facturacion Manager — Acreditar"
Cohesion (entity basis within full-graph community): 0.67
Nodes (3): explicacionAnulacion\(\), quedaPorAcreditar\(\), unirFrases\(\)

### Community 58 - "Utils Fecha Cr"
Cohesion (entity basis within full-graph community): 1
Nodes (2): fechaCR\(\), fechaHoraCR\(\)

### Community 59 - "Server Hacienda Factura — Datos"
Cohesion (entity basis within full-graph community): 0.67
Nodes (3): DatosFacturaXml, DatosNotaCreditoXml, DatosNotaDebitoXml

### Community 60 - "Server Hacienda Signer"
Cohesion (entity basis within full-graph community): 0
Nodes (2): InfoCertificadoP12, LlavesP12

### Community 61 - "Components Online Booking Share"
Cohesion (entity basis within full-graph community): 1
Nodes (3): OnlineBookingShare\(\), handleCompartir\(\), handleCopiar\(\)

### Community 62 - "Server PDF"
Cohesion (entity basis within full-graph community): 1
Nodes (2): enFila\(\), generarPdfDesdeHtml\(\)

### Community 63 - "Components Public Booking — Fecha"
Cohesion (entity basis within full-graph community): 0.67
Nodes (3): fechaLocalHoy\(\), irAPaso\(\), nuevaReserva\(\)

### Community 64 - "Components Reporteria Clinica — Cargar"
Cohesion (entity basis within full-graph community): 0.67
Nodes (3): cargarReporte\(\), exportarCsv\(\), rangoEfectivo\(\)

### Community 65 - "Data Schema"
Cohesion (entity basis within full-graph community): 0
Nodes (2): ColumnInfo, TableInfo

### Community 66 - "Server — Redondear2"
Cohesion (entity basis within full-graph community): 0.67
Nodes (3): redondear2\(\), construirReporteD104\(\), redondear2\(\)

### Community 67 - "Server — Guardar"
Cohesion (entity basis within full-graph community): 0.67
Nodes (3): guardarLineasFactura\(\), emitirYGuardarNota\(\), insertarNota\(\)

### Community 68 - "Server — Pick"
Cohesion (entity basis within full-graph community): 0.67
Nodes (3): reconstruirEvaluaciones\(\), pick\(\), pickMapped\(\)

### Community 69 - "Server — Seed"
Cohesion (entity basis within full-graph community): 0.67
Nodes (3): seedDefaultData\(\), seedUbicaciones\(\), setupDatabase\(\)

### Community 70 - "Server — Anulacion"
Cohesion (entity basis within full-graph community): 0.67
Nodes (3): aplicarAnulacion\(\), yaAnulada\(\), moverStockPorNota\(\)

### Community 71 - "Components Agenda Calendar — Block"
Cohesion (entity basis within full-graph community): 1
Nodes (2): formatDateString\(\), handleOpenNewBlock\(\)

### Community 72 - "Components Agenda Calendar — Abrir \(2\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): handleOpenNewCita\(\), abrirDia\(\)

### Community 73 - "Components Agenda Calendar — Abrir \(3\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): renderDayView\(\), abrirHora\(\)

### Community 74 - "Src App — Cargar"
Cohesion (entity basis within full-graph community): 1
Nodes (2): cargarCitas\(\), onVisibilityChange\(\)

### Community 75 - "Src App — Handle \(3\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): handleAddNotificationLog\(\), handleReenviarFacturaCorreo\(\)

### Community 76 - "Src App — Hash"
Cohesion (entity basis within full-graph community): 1
Nodes (2): onHashChange\(\), tabFromHash\(\)

### Community 77 - "Server Auth — Bcrypt"
Cohesion (entity basis within full-graph community): 1
Nodes (2): isBcryptHash\(\), passwordMatches\(\)

### Community 78 - "Server Auth — Access"
Cohesion (entity basis within full-graph community): 1
Nodes (2): isSaasAdmin\(\), canAccessCompany\(\)

### Community 79 - "Server Auth — Cookie"
Cohesion (entity basis within full-graph community): 1
Nodes (2): readCookie\(\), getSession\(\)

### Community 80 - "Components Company Settings — Company"
Cohesion (entity basis within full-graph community): 1
Nodes (2): createCompany\(\), handleSelect\(\)

### Community 81 - "Components Consultation Form — Aplicar"
Cohesion (entity basis within full-graph community): 1
Nodes (2): handleAplicarPlantilla\(\), handleAplicarPrescripcion\(\)

### Community 82 - "Components Cx C Manager — Efectivo"
Cohesion (entity basis within full-graph community): 1
Nodes (2): estadoEfectivo\(\), hoyISO\(\)

### Community 83 - "Components Cx P Manager — Efectivo"
Cohesion (entity basis within full-graph community): 1
Nodes (2): estadoEfectivo\(\), hoyISO\(\)

### Community 84 - "Server — API \(2\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): DELETE /api/calendar-blocks/:id, inline handles\_route DELETE /api/calendar-blocks/:id

### Community 85 - "Server — API \(3\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): DELETE /api/consultations/:id, inline handles\_route DELETE /api/consultations/:id

### Community 86 - "Server — API \(4\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): DELETE /api/patients/:id, inline handles\_route DELETE /api/patients/:id

### Community 87 - "Server — API \(5\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): DELETE /api/plantillas-dieta/:id, inline handles\_route DELETE /api/plantillas-dieta/:id

### Community 88 - "Server — API \(6\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): DELETE /api/porcentajes-dieta/:id, inline handles\_route DELETE /api/porcentajes-dieta/:id

### Community 89 - "Server — Handles"
Cohesion (entity basis within full-graph community): 1
Nodes (2): GET /\*, inline handles\_route GET /\*

### Community 90 - "Server — API \(7\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): GET /api/cabys, inline handles\_route GET /api/cabys

### Community 91 - "Server — API \(8\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): GET /api/calendar-blocks, inline handles\_route GET /api/calendar-blocks

### Community 92 - "Server — API \(9\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): GET /api/citas, inline handles\_route GET /api/citas

### Community 93 - "Server — API \(10\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): GET /api/companies/:id/pagos, inline handles\_route GET /api/companies/:id/pagos

### Community 94 - "Server — API \(11\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): GET /api/consultations, inline handles\_route GET /api/consultations

### Community 95 - "Server — API \(12\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): GET /api/cxc, inline handles\_route GET /api/cxc

### Community 96 - "Server — API \(13\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): GET /api/cxp, inline handles\_route GET /api/cxp

### Community 97 - "Server — API \(14\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): GET /api/db-status, inline handles\_route GET /api/db-status

### Community 98 - "Server — API \(15\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): GET /api/facturas, inline handles\_route GET /api/facturas

### Community 99 - "Server — API \(16\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): GET /api/hacienda-config/:idCompania, inline handles\_route GET /api/hacienda-config/:idCompania

### Community 100 - "Server — API \(17\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): GET /api/me, inline handles\_route GET /api/me

### Community 101 - "Server — API \(18\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): GET /api/movimientos-inventario, inline handles\_route GET /api/movimientos-inventario

### Community 102 - "Server — API \(19\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): GET /api/notification-logs, inline handles\_route GET /api/notification-logs

### Community 103 - "Server — API \(20\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): GET /api/patients, inline handles\_route GET /api/patients

### Community 104 - "Server — API \(21\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): GET /api/plantillas-dieta, inline handles\_route GET /api/plantillas-dieta

### Community 105 - "Server — API \(22\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): GET /api/porcentajes-dieta, inline handles\_route GET /api/porcentajes-dieta

### Community 106 - "Server — API \(23\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): GET /api/proveedores, inline handles\_route GET /api/proveedores

### Community 107 - "Server — API \(24\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): GET /api/public/clinicas, inline handles\_route GET /api/public/clinicas

### Community 108 - "Server — API \(25\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): GET /api/public/clinicas/:id/pacientes/:identificacion, inline handles\_route GET /api/public/clinicas/:id/pacientes/:identificacion

### Community 109 - "Server — API \(26\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): GET /api/public/clinicas/:id/profesionales, inline handles\_route GET /api/public/clinicas/:id/profesionales

### Community 110 - "Server — API \(27\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): GET /api/public/clinicas/:id/servicios, inline handles\_route GET /api/public/clinicas/:id/servicios

### Community 111 - "Server — API \(28\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): GET /api/public/config, inline handles\_route GET /api/public/config

### Community 112 - "Server — API \(29\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): GET /api/public/disponibilidad, inline handles\_route GET /api/public/disponibilidad

### Community 113 - "Server — API \(30\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): GET /api/reportes/cierres, inline handles\_route GET /api/reportes/cierres

### Community 114 - "Server — API \(31\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): GET /api/reportes/clientes-sesiones, inline handles\_route GET /api/reportes/clientes-sesiones

### Community 115 - "Server — API \(32\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): GET /api/reportes/d101, inline handles\_route GET /api/reportes/d101

### Community 116 - "Server — API \(33\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): GET /api/reportes/d104, inline handles\_route GET /api/reportes/d104

### Community 117 - "Server — API \(34\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): GET /api/servicios, inline handles\_route GET /api/servicios

### Community 118 - "Server — API \(35\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): GET /api/smtp-configs, inline handles\_route GET /api/smtp-configs

### Community 119 - "Server — API \(36\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): GET /api/users, inline handles\_route GET /api/users

### Community 120 - "Server — API \(37\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): POST /api/calendar-blocks, inline handles\_route POST /api/calendar-blocks

### Community 121 - "Server — API \(38\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): POST /api/citas, inline handles\_route POST /api/citas

### Community 122 - "Server — API \(39\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): POST /api/companies, inline handles\_route POST /api/companies

### Community 123 - "Server — API \(40\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): POST /api/companies/:id/pagos, inline handles\_route POST /api/companies/:id/pagos

### Community 124 - "Server — API \(41\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): POST /api/companies/:id/servicios-defecto, inline handles\_route POST /api/companies/:id/servicios-defecto

### Community 125 - "Server — API \(42\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): POST /api/consultations, inline handles\_route POST /api/consultations

### Community 126 - "Server — API \(43\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): POST /api/consultations/:id/estado, inline handles\_route POST /api/consultations/:id/estado

### Community 127 - "Server — API \(44\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): POST /api/cxc/:id/pagos, inline handles\_route POST /api/cxc/:id/pagos

### Community 128 - "Server — API \(45\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): POST /api/cxp, inline handles\_route POST /api/cxp

### Community 129 - "Server — API \(46\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): POST /api/cxp/:id/pagos, inline handles\_route POST /api/cxp/:id/pagos

### Community 130 - "Server — API \(47\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): POST /api/cxp/importar-xml, inline handles\_route POST /api/cxp/importar-xml

### Community 131 - "Server — API \(48\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): POST /api/facturas, inline handles\_route POST /api/facturas

### Community 132 - "Server — Anular"
Cohesion (entity basis within full-graph community): 1
Nodes (2): POST /api/facturas/:id/anular, inline handles\_route POST /api/facturas/:id/anular

### Community 133 - "Server — API \(49\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): POST /api/facturas/:id/estado, inline handles\_route POST /api/facturas/:id/estado

### Community 134 - "Server — API \(50\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): POST /api/facturas/:id/nota-credito, inline handles\_route POST /api/facturas/:id/nota-credito

### Community 135 - "Server — API \(51\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): POST /api/facturas/:id/nota-debito, inline handles\_route POST /api/facturas/:id/nota-debito

### Community 136 - "Server — API \(52\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): POST /api/facturas/:id/reenviar-correo, inline handles\_route POST /api/facturas/:id/reenviar-correo

### Community 137 - "Server — API \(53\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): POST /api/forgot-password, inline handles\_route POST /api/forgot-password

### Community 138 - "Server — API \(54\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): POST /api/hacienda-config, inline handles\_route POST /api/hacienda-config

### Community 139 - "Server — API \(55\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): POST /api/hacienda/firmar, inline handles\_route POST /api/hacienda/firmar

### Community 140 - "Server — API \(56\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): POST /api/hacienda/verificar-certificado, inline handles\_route POST /api/hacienda/verificar-certificado

### Community 141 - "Server — API \(57\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): POST /api/login, inline handles\_route POST /api/login

### Community 142 - "Server — API \(58\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): POST /api/logout, inline handles\_route POST /api/logout

### Community 143 - "Server — API \(59\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): POST /api/notification-logs, inline handles\_route POST /api/notification-logs

### Community 144 - "Server — API \(60\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): POST /api/notifications/send, inline handles\_route POST /api/notifications/send

### Community 145 - "Server — API \(61\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): POST /api/patients, inline handles\_route POST /api/patients

### Community 146 - "Server — API \(62\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): POST /api/plantillas-dieta, inline handles\_route POST /api/plantillas-dieta

### Community 147 - "Server — API \(63\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): POST /api/porcentajes-dieta, inline handles\_route POST /api/porcentajes-dieta

### Community 148 - "Server — API \(64\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): POST /api/proveedores, inline handles\_route POST /api/proveedores

### Community 149 - "Server — API \(65\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): POST /api/public/citas, inline handles\_route POST /api/public/citas

### Community 150 - "Server — API \(66\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): POST /api/reportes/d101/cerrar, inline handles\_route POST /api/reportes/d101/cerrar

### Community 151 - "Server — API \(67\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): POST /api/reportes/d104/cerrar, inline handles\_route POST /api/reportes/d104/cerrar

### Community 152 - "Server — API \(68\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): POST /api/servicios, inline handles\_route POST /api/servicios

### Community 153 - "Server — Ajustar"
Cohesion (entity basis within full-graph community): 1
Nodes (2): POST /api/servicios/:id/ajustar-stock, inline handles\_route POST /api/servicios/:id/ajustar-stock

### Community 154 - "Server — API \(69\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): POST /api/smtp-configs, inline handles\_route POST /api/smtp-configs

### Community 155 - "Server — API \(70\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): POST /api/users, inline handles\_route POST /api/users

### Community 156 - "Server — API \(71\)"
Cohesion (entity basis within full-graph community): 1
Nodes (2): PUT /api/reportes/d101-gastos-manuales, inline handles\_route PUT /api/reportes/d101-gastos-manuales

### Community 157 - "Utils Fecha Cr — Ajustar"
Cohesion (entity basis within full-graph community): 1
Nodes (2): sumarDiasCR\(\), ajustarCxcPorNota\(\)

### Community 158 - "Components Feedback — Confirm"
Cohesion (entity basis within full-graph community): 1
Nodes (2): ConfirmOptions, ConfirmRequest

### Community 159 - "Server Google Maps"
Cohesion (entity basis within full-graph community): 1
Nodes (1): calcularTiempoTrasladoMinutos\(\)

### Community 160 - "Server Google Maps — Error"
Cohesion (entity basis within full-graph community): 1
Nodes (2): Error, TrasladoNoCalculableError

### Community 161 - "Server Hacienda API — Error"
Cohesion (entity basis within full-graph community): 1
Nodes (2): Error, HaciendaApiError

### Community 162 - "Server Hacienda Factura — Es"
Cohesion (entity basis within full-graph community): 1
Nodes (2): esServicio\(\), esMercanciaPorCabys\(\)

### Community 163 - "Server Hacienda Factura — Clave"
Cohesion (entity basis within full-graph community): 1
Nodes (2): generarClaveNumerica\(\), limpiarIdentificacion\(\)

### Community 164 - "Server Hacienda Factura — Factura"
Cohesion (entity basis within full-graph community): 1
Nodes (2): LineaFacturaCalculada, LineaFacturaInput

### Community 165 - "Server Hacienda Signer — Array"
Cohesion (entity basis within full-graph community): 1
Nodes (2): base64ToArrayBuffer\(\), firmarXadesEpes\(\)

### Community 166 - "Server Hacienda Signer — Base64"
Cohesion (entity basis within full-graph community): 1
Nodes (2): derToBase64\(\), separarP12\(\)

### Community 167 - "Server Hacienda Signer — Attrs"
Cohesion (entity basis within full-graph community): 1
Nodes (2): verificarLlaveP12\(\), attrsToString\(\)

### Community 168 - "Components Reportes Fiscales — Cargar"
Cohesion (entity basis within full-graph community): 1
Nodes (2): cargarD101\(\), handleGuardarGastos\(\)

### Community 169 - "Server — Calcular"
Cohesion (entity basis within full-graph community): 1
Nodes (2): calcularImpuestoRenta\(\), fmt\(\)

### Community 170 - "Server — Construir"
Cohesion (entity basis within full-graph community): 1
Nodes (2): construirReporteD101\(\), sumar\(\)

### Community 171 - "Server — Fetch"
Cohesion (entity basis within full-graph community): 1
Nodes (2): fetchHorarioAtencionCompania\(\), fetchCompanyById\(\)

### Community 172 - "Server — Gastos"
Cohesion (entity basis within full-graph community): 1
Nodes (2): GastosManualesAnuales, LocalGastosManuales

### Community 173 - "Server — Desde"
Cohesion (entity basis within full-graph community): 1
Nodes (2): minutosDesdeMedianoche\(\), slotLibre\(\)

### Community 174 - "Server — Consultation"
Cohesion (entity basis within full-graph community): 1
Nodes (2): normalizeRow\(\), fetchConsultationById\(\)

### Community 175 - "Server — Config"
Cohesion (entity basis within full-graph community): 1
Nodes (2): configLocalHacienda\(\), reservarConsecutivoNota\(\)

### Community 176 - "Apple Touch Icon Png"
Cohesion (entity basis within full-graph community): n/a
Nodes (0): 

### Community 177 - "Favicon Png"
Cohesion (entity basis within full-graph community): n/a
Nodes (0): 

### Community 178 - "Logo Tuanis 192 Webp"
Cohesion (entity basis within full-graph community): n/a
Nodes (0): 

### Community 179 - "Logo Tuanis Booking Png"
Cohesion (entity basis within full-graph community): n/a
Nodes (0): 

### Community 180 - "Vite Config TypeScript"
Cohesion (entity basis within full-graph community): n/a
Nodes (0): 

### Community 181 - "Vitest Config TypeScript"
Cohesion (entity basis within full-graph community): n/a
Nodes (0): 

## Knowledge Gaps
- **390 weakly connected node(s):** `ColumnInfo`, `TableInfo`, `SessionPayload`, `hashPassword\(\)`, `generateNumericPassword\(\)` (+385 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Components Agenda Calendar — Block`** (2 nodes): `formatDateString\(\)`, `handleOpenNewBlock\(\)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Components Agenda Calendar — Abrir \(2\)`** (2 nodes): `handleOpenNewCita\(\)`, `abrirDia\(\)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Components Agenda Calendar — Abrir \(3\)`** (2 nodes): `renderDayView\(\)`, `abrirHora\(\)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Src App — Cargar`** (2 nodes): `cargarCitas\(\)`, `onVisibilityChange\(\)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Src App — Handle \(3\)`** (2 nodes): `handleAddNotificationLog\(\)`, `handleReenviarFacturaCorreo\(\)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Src App — Hash`** (2 nodes): `onHashChange\(\)`, `tabFromHash\(\)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server Auth — Bcrypt`** (2 nodes): `isBcryptHash\(\)`, `passwordMatches\(\)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server Auth — Access`** (2 nodes): `isSaasAdmin\(\)`, `canAccessCompany\(\)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server Auth — Cookie`** (2 nodes): `readCookie\(\)`, `getSession\(\)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Components Company Settings — Company`** (2 nodes): `createCompany\(\)`, `handleSelect\(\)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Components Consultation Form — Aplicar`** (2 nodes): `handleAplicarPlantilla\(\)`, `handleAplicarPrescripcion\(\)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Components Cx C Manager — Efectivo`** (2 nodes): `estadoEfectivo\(\)`, `hoyISO\(\)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Components Cx P Manager — Efectivo`** (2 nodes): `estadoEfectivo\(\)`, `hoyISO\(\)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(2\)`** (2 nodes): `DELETE /api/calendar-blocks/:id`, `inline handles\_route DELETE /api/calendar-blocks/:id`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(3\)`** (2 nodes): `DELETE /api/consultations/:id`, `inline handles\_route DELETE /api/consultations/:id`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(4\)`** (2 nodes): `DELETE /api/patients/:id`, `inline handles\_route DELETE /api/patients/:id`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(5\)`** (2 nodes): `DELETE /api/plantillas-dieta/:id`, `inline handles\_route DELETE /api/plantillas-dieta/:id`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(6\)`** (2 nodes): `DELETE /api/porcentajes-dieta/:id`, `inline handles\_route DELETE /api/porcentajes-dieta/:id`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — Handles`** (2 nodes): `GET /\*`, `inline handles\_route GET /\*`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(7\)`** (2 nodes): `GET /api/cabys`, `inline handles\_route GET /api/cabys`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(8\)`** (2 nodes): `GET /api/calendar-blocks`, `inline handles\_route GET /api/calendar-blocks`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(9\)`** (2 nodes): `GET /api/citas`, `inline handles\_route GET /api/citas`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(10\)`** (2 nodes): `GET /api/companies/:id/pagos`, `inline handles\_route GET /api/companies/:id/pagos`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(11\)`** (2 nodes): `GET /api/consultations`, `inline handles\_route GET /api/consultations`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(12\)`** (2 nodes): `GET /api/cxc`, `inline handles\_route GET /api/cxc`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(13\)`** (2 nodes): `GET /api/cxp`, `inline handles\_route GET /api/cxp`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(14\)`** (2 nodes): `GET /api/db-status`, `inline handles\_route GET /api/db-status`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(15\)`** (2 nodes): `GET /api/facturas`, `inline handles\_route GET /api/facturas`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(16\)`** (2 nodes): `GET /api/hacienda-config/:idCompania`, `inline handles\_route GET /api/hacienda-config/:idCompania`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(17\)`** (2 nodes): `GET /api/me`, `inline handles\_route GET /api/me`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(18\)`** (2 nodes): `GET /api/movimientos-inventario`, `inline handles\_route GET /api/movimientos-inventario`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(19\)`** (2 nodes): `GET /api/notification-logs`, `inline handles\_route GET /api/notification-logs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(20\)`** (2 nodes): `GET /api/patients`, `inline handles\_route GET /api/patients`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(21\)`** (2 nodes): `GET /api/plantillas-dieta`, `inline handles\_route GET /api/plantillas-dieta`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(22\)`** (2 nodes): `GET /api/porcentajes-dieta`, `inline handles\_route GET /api/porcentajes-dieta`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(23\)`** (2 nodes): `GET /api/proveedores`, `inline handles\_route GET /api/proveedores`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(24\)`** (2 nodes): `GET /api/public/clinicas`, `inline handles\_route GET /api/public/clinicas`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(25\)`** (2 nodes): `GET /api/public/clinicas/:id/pacientes/:identificacion`, `inline handles\_route GET /api/public/clinicas/:id/pacientes/:identificacion`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(26\)`** (2 nodes): `GET /api/public/clinicas/:id/profesionales`, `inline handles\_route GET /api/public/clinicas/:id/profesionales`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(27\)`** (2 nodes): `GET /api/public/clinicas/:id/servicios`, `inline handles\_route GET /api/public/clinicas/:id/servicios`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(28\)`** (2 nodes): `GET /api/public/config`, `inline handles\_route GET /api/public/config`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(29\)`** (2 nodes): `GET /api/public/disponibilidad`, `inline handles\_route GET /api/public/disponibilidad`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(30\)`** (2 nodes): `GET /api/reportes/cierres`, `inline handles\_route GET /api/reportes/cierres`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(31\)`** (2 nodes): `GET /api/reportes/clientes-sesiones`, `inline handles\_route GET /api/reportes/clientes-sesiones`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(32\)`** (2 nodes): `GET /api/reportes/d101`, `inline handles\_route GET /api/reportes/d101`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(33\)`** (2 nodes): `GET /api/reportes/d104`, `inline handles\_route GET /api/reportes/d104`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(34\)`** (2 nodes): `GET /api/servicios`, `inline handles\_route GET /api/servicios`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(35\)`** (2 nodes): `GET /api/smtp-configs`, `inline handles\_route GET /api/smtp-configs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(36\)`** (2 nodes): `GET /api/users`, `inline handles\_route GET /api/users`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(37\)`** (2 nodes): `POST /api/calendar-blocks`, `inline handles\_route POST /api/calendar-blocks`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(38\)`** (2 nodes): `POST /api/citas`, `inline handles\_route POST /api/citas`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(39\)`** (2 nodes): `POST /api/companies`, `inline handles\_route POST /api/companies`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(40\)`** (2 nodes): `POST /api/companies/:id/pagos`, `inline handles\_route POST /api/companies/:id/pagos`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(41\)`** (2 nodes): `POST /api/companies/:id/servicios-defecto`, `inline handles\_route POST /api/companies/:id/servicios-defecto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(42\)`** (2 nodes): `POST /api/consultations`, `inline handles\_route POST /api/consultations`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(43\)`** (2 nodes): `POST /api/consultations/:id/estado`, `inline handles\_route POST /api/consultations/:id/estado`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(44\)`** (2 nodes): `POST /api/cxc/:id/pagos`, `inline handles\_route POST /api/cxc/:id/pagos`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(45\)`** (2 nodes): `POST /api/cxp`, `inline handles\_route POST /api/cxp`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(46\)`** (2 nodes): `POST /api/cxp/:id/pagos`, `inline handles\_route POST /api/cxp/:id/pagos`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(47\)`** (2 nodes): `POST /api/cxp/importar-xml`, `inline handles\_route POST /api/cxp/importar-xml`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(48\)`** (2 nodes): `POST /api/facturas`, `inline handles\_route POST /api/facturas`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — Anular`** (2 nodes): `POST /api/facturas/:id/anular`, `inline handles\_route POST /api/facturas/:id/anular`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(49\)`** (2 nodes): `POST /api/facturas/:id/estado`, `inline handles\_route POST /api/facturas/:id/estado`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(50\)`** (2 nodes): `POST /api/facturas/:id/nota-credito`, `inline handles\_route POST /api/facturas/:id/nota-credito`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(51\)`** (2 nodes): `POST /api/facturas/:id/nota-debito`, `inline handles\_route POST /api/facturas/:id/nota-debito`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(52\)`** (2 nodes): `POST /api/facturas/:id/reenviar-correo`, `inline handles\_route POST /api/facturas/:id/reenviar-correo`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(53\)`** (2 nodes): `POST /api/forgot-password`, `inline handles\_route POST /api/forgot-password`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(54\)`** (2 nodes): `POST /api/hacienda-config`, `inline handles\_route POST /api/hacienda-config`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(55\)`** (2 nodes): `POST /api/hacienda/firmar`, `inline handles\_route POST /api/hacienda/firmar`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(56\)`** (2 nodes): `POST /api/hacienda/verificar-certificado`, `inline handles\_route POST /api/hacienda/verificar-certificado`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(57\)`** (2 nodes): `POST /api/login`, `inline handles\_route POST /api/login`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(58\)`** (2 nodes): `POST /api/logout`, `inline handles\_route POST /api/logout`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(59\)`** (2 nodes): `POST /api/notification-logs`, `inline handles\_route POST /api/notification-logs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(60\)`** (2 nodes): `POST /api/notifications/send`, `inline handles\_route POST /api/notifications/send`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(61\)`** (2 nodes): `POST /api/patients`, `inline handles\_route POST /api/patients`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(62\)`** (2 nodes): `POST /api/plantillas-dieta`, `inline handles\_route POST /api/plantillas-dieta`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(63\)`** (2 nodes): `POST /api/porcentajes-dieta`, `inline handles\_route POST /api/porcentajes-dieta`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(64\)`** (2 nodes): `POST /api/proveedores`, `inline handles\_route POST /api/proveedores`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(65\)`** (2 nodes): `POST /api/public/citas`, `inline handles\_route POST /api/public/citas`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(66\)`** (2 nodes): `POST /api/reportes/d101/cerrar`, `inline handles\_route POST /api/reportes/d101/cerrar`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(67\)`** (2 nodes): `POST /api/reportes/d104/cerrar`, `inline handles\_route POST /api/reportes/d104/cerrar`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(68\)`** (2 nodes): `POST /api/servicios`, `inline handles\_route POST /api/servicios`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — Ajustar`** (2 nodes): `POST /api/servicios/:id/ajustar-stock`, `inline handles\_route POST /api/servicios/:id/ajustar-stock`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(69\)`** (2 nodes): `POST /api/smtp-configs`, `inline handles\_route POST /api/smtp-configs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(70\)`** (2 nodes): `POST /api/users`, `inline handles\_route POST /api/users`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — API \(71\)`** (2 nodes): `PUT /api/reportes/d101-gastos-manuales`, `inline handles\_route PUT /api/reportes/d101-gastos-manuales`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Utils Fecha Cr — Ajustar`** (2 nodes): `sumarDiasCR\(\)`, `ajustarCxcPorNota\(\)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Components Feedback — Confirm`** (2 nodes): `ConfirmOptions`, `ConfirmRequest`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server Google Maps`** (2 nodes): `googleMaps.ts`, `calcularTiempoTrasladoMinutos\(\)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server Google Maps — Error`** (2 nodes): `Error`, `TrasladoNoCalculableError`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server Hacienda API — Error`** (2 nodes): `Error`, `HaciendaApiError`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server Hacienda Factura — Es`** (2 nodes): `esServicio\(\)`, `esMercanciaPorCabys\(\)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server Hacienda Factura — Clave`** (2 nodes): `generarClaveNumerica\(\)`, `limpiarIdentificacion\(\)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server Hacienda Factura — Factura`** (2 nodes): `LineaFacturaCalculada`, `LineaFacturaInput`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server Hacienda Signer — Array`** (2 nodes): `base64ToArrayBuffer\(\)`, `firmarXadesEpes\(\)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server Hacienda Signer — Base64`** (2 nodes): `derToBase64\(\)`, `separarP12\(\)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server Hacienda Signer — Attrs`** (2 nodes): `verificarLlaveP12\(\)`, `attrsToString\(\)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Components Reportes Fiscales — Cargar`** (2 nodes): `cargarD101\(\)`, `handleGuardarGastos\(\)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — Calcular`** (2 nodes): `calcularImpuestoRenta\(\)`, `fmt\(\)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — Construir`** (2 nodes): `construirReporteD101\(\)`, `sumar\(\)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — Fetch`** (2 nodes): `fetchHorarioAtencionCompania\(\)`, `fetchCompanyById\(\)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — Gastos`** (2 nodes): `GastosManualesAnuales`, `LocalGastosManuales`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — Desde`** (2 nodes): `minutosDesdeMedianoche\(\)`, `slotLibre\(\)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — Consultation`** (2 nodes): `normalizeRow\(\)`, `fetchConsultationById\(\)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server — Config`** (2 nodes): `configLocalHacienda\(\)`, `reservarConsecutivoNota\(\)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Apple Touch Icon Png`** (1 nodes): `apple-touch-icon.png`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Favicon Png`** (1 nodes): `favicon.png`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Logo Tuanis 192 Webp`** (1 nodes): `logo-tuanis-192.webp`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Logo Tuanis Booking Png`** (1 nodes): `logo\_tuanisBooking.png`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Vite Config TypeScript`** (1 nodes): `vite.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Vitest Config TypeScript`** (1 nodes): `vitest.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does \`App\(\)\` connect \`Src App\` to \`Components Mock Data\`, \`Src App — Cargar\`, \`Src App — Handle \(2\)\`, \`Src App — Hash\`, \`Components App\`, \`Src App — Handle\`, \`Src App — Handle \(3\)\`, \`Components Facturacion Manager\`, \`Components Cx P Manager\`, \`Components Reportes Fiscales\`, \`Components Company Settings\`?**
  _High betweenness centrality \(32426.372\) - this node is a cross-community bridge._
- **Why does \`startServer\(\)\` connect \`Server\` to \`Data Server\`, \`Server — Fetch\`, \`Server Auth — Cookie\`, \`Server — API\`, \`Server — Saas\`, \`Server — Cargar\`, \`Server Auth — Access\`, \`Server — Cargar \(2\)\`, \`Server — Config\`, \`Server Hacienda API\`, \`Server — Factura\`, \`Server — Anulacion\`, \`Server — Guardar\`, \`Utils Fecha Cr — Ajustar\`, \`Server — Consultation\`, \`Server Auth — Bcrypt\`, \`Server Auth\`, \`Server Auth — Session\`, \`Server Email Templates\`, \`Server Mailer\`, \`Server Crypto\`, \`Server Hacienda Signer — Attrs\`, \`Server Hacienda Signer — Array\`, \`Server Hacienda Factura — Calcular\`, \`Server Hacienda Factura — Clave\`, \`Server Hacienda Factura — Construir\`, \`Server Hacienda Factura\`, \`Server PDF\`, \`Server PDF Templates\`, \`Utils Fecha Cr\`, \`Server XML Proveedor Parser\`, \`Server Google Maps\`, \`Server HTTPS Cert\`?**
  _High betweenness centrality \(28783.398\) - this node is a cross-community bridge._
- **Why does \`AgendaCalendar\(\)\` connect \`Components Agenda Calendar\` to \`Components Mock Data\`, \`Components Agenda Calendar — Block\`, \`Components Agenda Calendar — Month\`, \`Components Agenda Calendar — Abrir\`, \`Components Agenda Calendar — Handle\`, \`Components Agenda Calendar — Abrir \(2\)\`, \`Components App\`, \`Components Agenda Calendar — Cita\`, \`Components Agenda Calendar — Cambio\`, \`Components Agenda Calendar — Abrir \(3\)\`?**
  _High betweenness centrality \(19957.629\) - this node is a cross-community bridge._
- **What connects \`ColumnInfo\`, \`TableInfo\`, \`SessionPayload\` to the rest of the system?**
  _390 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should \`Src App\` be split into smaller, more focused modules?**
  _Cohesion score 0.05 across 37 entity nodes - this community may mix unrelated responsibilities._
- **Should \`Server\` be split into smaller, more focused modules?**
  _Cohesion score 0.07 across 27 entity nodes - this community may mix unrelated responsibilities._
- **Should \`Components Company Settings\` be split into smaller, more focused modules?**
  _Cohesion score 0.09 across 23 entity nodes - this community may mix unrelated responsibilities._
