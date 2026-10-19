# Perfil Legal: Clientes, Casos y Control de Documentos

## Contexto

La app hoy atiende clínicas (`perfilCompania`: `Nutrición`, `Fisioterapia`, `Ambas`, `Spa`). Se agrega un perfil para despachos de abogados: control de clientes y sus casos, un "archivador virtual" que registra **dónde está guardado físicamente** cada expediente/documento (no se suben archivos), y recordatorios por correo al cliente de los documentos que aún debe entregar.

No existe hoy ningún proceso programado en el servidor: `citas.recordatorioEnviadoEn` existe pero nada la llena. El recordatorio de documentos será el primer envío automático.

## Decisiones (confirmadas con el usuario)

1. **Nuevo valor `perfilCompania = 'Legal'`** dentro de la misma app — no una app separada. Reutiliza agenda, facturación, CxC/CxP y SMTP por empresa.
2. **Cliente → Caso → Documentos.** Un cliente puede tener varios casos; cada caso tiene su lista de documentos.
3. **El cliente es una fila de `pacientes`.** Agenda, facturación y CxC ya cuelgan de `idPaciente`; reusarla da todo eso sin refactor. En perfil Legal se ocultan los campos clínicos del formulario.
4. **Ubicación física: el caso guarda la carpeta, el documento guarda su folio.** `casos_legales.ubicacionFisica` es texto libre (ej. "Archivador 2 · Gaveta B"); `documentos_caso.folio` (ej. "f. 12-15"). Sin catálogo de archivadores.
5. **Recordatorios: correo automático + botón manual**, por el SMTP de la empresa. Frecuencia por caso (`recordatorioCadaDias`, 0 = apagado).
6. **"Paciente" → "Cliente" en toda la app** cuando el perfil es Legal, incluidos correos y PDF.

## Fuera de alcance

Subir/almacenar archivos, portal del cliente, plazos procesales/audiencias (se usa la agenda existente), catálogo de archivadores, plantillas de documentos por tipo de caso, WhatsApp/SMS.

## Modelo de datos

El esquema ya no se crea al arrancar (`server.ts` lo retiró en 2026-08-05), así que las tablas van en un script SQL que se aplica a mano: `docs/sql/2026-10-19-perfil-legal.sql`.

```sql
CREATE TABLE IF NOT EXISTS casos_legales (
  id INT AUTO_INCREMENT PRIMARY KEY,
  idCompania INT NOT NULL,
  idPaciente INT NOT NULL,                 -- el cliente
  numeroExpediente VARCHAR(60) NULL,
  titulo VARCHAR(150) NOT NULL,            -- ej. "Divorcio"
  materia VARCHAR(100) NULL,               -- texto libre
  estado ENUM('ABIERTO','CERRADO') NOT NULL DEFAULT 'ABIERTO',
  ubicacionFisica VARCHAR(150) NULL,
  recordatorioCadaDias INT NOT NULL DEFAULT 7,   -- 0 = sin recordatorio
  ultimoRecordatorioEn DATETIME NULL,
  notas TEXT NULL,
  creadoEn DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (idCompania), INDEX (idPaciente)
);

CREATE TABLE IF NOT EXISTS documentos_caso (
  id INT AUTO_INCREMENT PRIMARY KEY,
  idCaso INT NOT NULL,
  nombre VARCHAR(150) NOT NULL,            -- ej. "Cédula"
  estado ENUM('PENDIENTE','RECIBIDO') NOT NULL DEFAULT 'PENDIENTE',
  folio VARCHAR(60) NULL,
  fechaLimite DATE NULL,
  fechaRecibido DATE NULL,
  notas TEXT NULL,
  INDEX (idCaso),
  CONSTRAINT fk_documentos_caso_caso FOREIGN KEY (idCaso) REFERENCES casos_legales(id) ON DELETE CASCADE
);
```

`perfilCompania` es texto, así que `'Legal'` no requiere cambio de esquema. Tipos en `src/data/mockData.ts`: `CasoLegal`, `DocumentoCaso`, y `'Legal'` se agrega a la unión de `perfilCompania` (mockData, CompanySettings, LoginView, ConsultationForm).

`serviciosDefectoParaPerfil('Legal')` devuelve `[]` (igual que Spa). En `LoginView`, el alta con perfil Legal usa `actividadEconomica: 'Por definir (Servicios jurídicos)'`.

## Textos: `terminoPersona`

`src/utils/terminoPersona.ts`:

```typescript
export function terminoPersona(perfil?: string) {
  return perfil === 'Legal'
    ? { singular: 'Cliente', plural: 'Clientes', articulo: 'el cliente' }
    : { singular: 'Paciente', plural: 'Pacientes', articulo: 'el paciente' };
}
```

El servidor lo importa también (como ya hace con `fechaCR`). Se aplica en: App (menú, listas, resumen), PatientForm, AgendaCalendar, FacturacionManager, FacturarModal, CxCManager, ReportView, `server/emailTemplates.ts` y `server/pdfTemplates.ts`. Solo se reemplazan textos visibles; nombres de variables, campos y rutas (`idPaciente`, `/api/patients`) no cambian.

## Pantallas

### Menú (perfil Legal)

- Grupo "Clínica" se llama **"Despacho"**: Resumen, Clientes, **Casos y Documentos** (tab nuevo `casos`, hash `#/casos`), Agenda.
- Se oculta "Historial de Citas" (`consultations`) — no hay consultas clínicas.
- Finanzas y Configuración sin cambios. El tab `casos` no aparece en los otros perfiles.

### PatientForm (perfil Legal)

Oculta antecedentes nutricionales, de fisioterapia, situación de vivienda y sexo. Conserva identificación, nombre, contacto, dirección y ocupación.

### Resumen (perfil Legal)

Tres indicadores en lugar de las gráficas clínicas: casos abiertos, documentos pendientes, documentos vencidos (`PENDIENTE` con `fechaLimite` < hoy CR). Cada uno navega a `#/casos`.

### `src/components/CasosLegalesManager.tsx`

- **Lista**: búsqueda por nombre de cliente, número de expediente, título o ubicación física; filtro Abierto/Cerrado (por defecto Abierto). Cada fila: cliente, título, expediente, ubicación, pendientes/vencidos.
- **Nuevo/editar caso**: cliente (selector de `pacientes` de la empresa), título, expediente, materia, ubicación física, recordatorio cada N días, estado, notas.
- **Detalle**: checklist de documentos — agregar, marcar recibido (pone `fechaRecibido` = hoy CR), editar folio/fecha límite/notas, eliminar. Indicador de último recordatorio enviado.
- **Botón "Enviar recordatorio ahora"**: desactivado si el cliente no tiene correo o no hay pendientes (con el motivo visible).
- Confirmaciones con el `confirmar()` existente (`ui/Feedback.tsx`).

## API

Mismo patrón que `/api/plantillas-dieta`: `requireAuth`, todo filtrado por `session.idCompania`, respaldo en memoria (`localCasos`, `localDocumentosCaso`) cuando no hay BD.

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/casos` | Casos de la empresa, cada uno con su arreglo `documentos` |
| POST | `/api/casos` | Crea o actualiza (si trae `id`). Valida que `idPaciente` sea de la empresa y `recordatorioCadaDias >= 0` |
| DELETE | `/api/casos/:id` | Borra el caso (documentos en cascada) |
| POST | `/api/casos/:id/documentos` | Crea o actualiza un documento. Valida que el caso sea de la empresa |
| DELETE | `/api/documentos-caso/:id` | Borra un documento (verificando la empresa vía el caso) |
| POST | `/api/casos/:id/recordatorio` | Envío manual; 400 si no hay correo, pendientes o SMTP activo |

Todos los usuarios de la empresa pueden operar casos (como pacientes); solo se restringe por empresa.

## Recordatorio automático

**Decisión pura** en `server/recordatoriosCasos.ts` (testeable):

```typescript
export function tocaRecordatorio(caso, pendientes: number, tieneCorreo: boolean, ahora: Date): boolean
```

Verdadero si: `estado === 'ABIERTO'`, `recordatorioCadaDias > 0`, `pendientes > 0`, `tieneCorreo`, la hora de Costa Rica está entre 08:00 y 17:59, y `ultimoRecordatorioEn` es nulo o tiene al menos `recordatorioCadaDias` días.

**Envío** `enviarRecordatorioCaso(idCaso)` en `server.ts`: carga caso, cliente, documentos pendientes y SMTP activo de la empresa; renderiza `renderRecordatorioDocumentosEmail` (nueva, en `server/emailTemplates.ts`, con `emailShell` y la marca de la empresa: lista de pendientes con su fecha límite si hay, nombre del caso y expediente); `sendMail`; actualiza `ultimoRecordatorioEn = NOW()`. Lo usan el botón manual y el proceso automático.

**Proceso**: en `startServer()`, `setInterval` cada hora (y una pasada 1 min después de arrancar). Recorre los casos abiertos con `recordatorioCadaDias > 0` y llama `enviarRecordatorioCaso` donde `tocaRecordatorio` es verdadero. pm2 corre un solo proceso, así que no hay envíos duplicados.

**Errores**: un fallo de envío se registra (`console.error` con idCaso) y no actualiza `ultimoRecordatorioEn`, así que se reintenta la hora siguiente. Una empresa sin SMTP activo se omite sin error. Un fallo en un caso no detiene los demás. Si la BD no está conectada, el proceso no hace nada.

## Pruebas

- `server/recordatoriosCasos.test.ts` (vitest): `tocaRecordatorio` — caso cerrado, sin pendientes, sin correo, frecuencia 0, fuera de horario CR (incluye 7:59 y 18:00 CR), primer envío, antes y justo al cumplirse N días.
- Prueba de `renderRecordatorioDocumentosEmail`: incluye cada pendiente y escapa HTML del nombre del documento.
- Manual con `npm run dev` y la BD de desarrollo: crear empresa Legal, cliente, caso con documentos, enviar recordatorio manual. **Nunca** `vite build` hacia `dist/` para verificar (es producción).

## Despliegue

1. Aplicar `docs/sql/2026-10-19-perfil-legal.sql` a la BD de producción.
2. `npm run pm2:restart`.

## Ajustes al planificar (2026-10-19)

- **Fechas como VARCHAR**, no DATE/DATETIME: toda la BD guarda fechas como texto (`citas.fechaHora`, `cuentas_cobrar.fechaVencimiento`...). `fechaLimite`/`fechaRecibido` = `YYYY-MM-DD`; `ultimoRecordatorioEn`/`creadoEn` = ISO. El SQL definitivo está en `docs/sql/2026-10-19-perfil-legal.sql`.
- **`tocaRecordatorio(caso, pendientes, ahora)`** sin `tieneCorreo`: el correo y el SMTP los verifica `enviarRecordatorioCaso`, que lanza `RecordatorioNoEnviable` y el proceso lo omite. Los N días se cuentan en días calendario de Costa Rica.
- **El proceso automático solo corre con `NODE_ENV=production`**: el `.env` apunta a la BD de producción, así que un `npm run dev` junto a pm2 enviaría correos duplicados.
- **También se ocultan en perfil Legal**: "Reportería" (cuenta consultas clínicas), la lista "Últimos pacientes atendidos" del Resumen y el botón "Iniciar consulta" de la agenda.
- `ReportView` y el PDF de consulta no se adaptan: son exclusivos de consultas clínicas, que el perfil Legal no usa.
