# Facturación: IVA/Vuelto/Medio de Pago, Modo Sin Envío, y Reportes por Estado Aceptado Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En el modal "Facturar Cita" mostrar desglose de IVA y vuelto en vivo y persistir el medio de pago; agregar un ambiente `PRUEBAS_LOCAL` que nunca envía a Hacienda; confirmar el estado real ante Hacienda (automático + botón manual) y ajustar D101/D104 para solo contemplar facturas con respuesta aceptada.

**Architecture:** Cambios de tipo puramente aditivos (nuevos valores de unión, nuevas columnas opcionales) para no romper facturas ya emitidas. El cálculo de IVA en el navegador replica —sin compartir código— la fórmula ya usada en `server/haciendaFactura.ts`, porque ese archivo tiene el comentario "Import exclusivo del servidor" y no debe importarse desde el bundle de frontend. El resto sigue el patrón dual (`pool`/`local*`) ya usado en todo `server.ts`.

**Tech Stack:** React + TypeScript (frontend), Express + MySQL vía `mysql2` (backend).

## Global Constraints

- `estado` en la tabla `facturas` ya es `VARCHAR(20)` libre (confirmado contra la base real) — agregar `'SIMULADA'` no requiere ninguna migración de columna, solo ampliar el tipo TypeScript `EstadoFactura`.
- `ambiente` en `compania_hacienda_config` SÍ es un `ENUM('SANDBOX','PRODUCCION')` estricto en MySQL — agregar `'PRUEBAS_LOCAL'` requiere un `ALTER TABLE ... MODIFY COLUMN`, siguiendo el patrón ya usado en la línea 334 de `server.ts` (`ALTER TABLE facturas MODIFY COLUMN estado ...`).
- En modo `PRUEBAS_LOCAL`, el servidor **nunca debe llamar** `obtenerTokenHacienda` ni `enviarFacturaHacienda` — ni siquiera para probar credenciales. Cero tráfico de red hacia Hacienda en ese modo.
- El vuelto (`montoRecibido - total`) se deriva en el momento, nunca se persiste — solo se persiste `montoRecibido`.
- Filtro D104 (declara IVA, con neteo de Notas de Crédito): facturas (`tipoDocumento='01'`) → `estado IN ('ACEPTADA','ANULADA')`; notas de crédito (`tipoDocumento='03'`) → `estado = 'ACEPTADA'`.
- Filtro D101 (declara renta, sin neteo): facturas → `estado = 'ACEPTADA'` estricto (excluye también `ANULADA`, a diferencia de D104).
- Sin framework de pruebas de componentes en este repo; se verifica con `npx tsc --noEmit -p .` (debe pasar sin salida) en cada tarea, y `npx vitest run` para confirmar que las 16 pruebas de `calorieFormulas.ts` (sin relación, pero es la única suite existente) siguen en verde.
- El servidor de producción (proceso PM2 `control-clinico`, puerto 3000) corre contra MySQL real con facturación electrónica real de Hacienda ya en uso. No reiniciar servicios ni tocar `compania_hacienda_config`/`facturas` de producción sin confirmación explícita del usuario — el despliegue queda fuera del alcance de las tareas de este plan.

---

## Task 1: Tipos nuevos en `mockData.ts`

**Files:**
- Modify: `src/data/mockData.ts:685-703` (`HaciendaConfig`, `HaciendaConfigInput`)
- Modify: `src/data/mockData.ts:777-800` (`EstadoFactura`, `Factura`)

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces: `HaciendaConfig.ambiente`/`HaciendaConfigInput.ambiente` con `'PRUEBAS_LOCAL'`, `EstadoFactura` con `'SIMULADA'`, `Factura.medioPago`/`Factura.montoRecibido`. Todas las tareas siguientes dependen de estos tipos.

- [ ] **Step 1: Ampliar `ambiente` en `HaciendaConfig`/`HaciendaConfigInput`**

En `src/data/mockData.ts:685-703`, el bloque actual es:

```typescript
export interface HaciendaConfig {
  idCompania: number;
  ambiente: 'SANDBOX' | 'PRODUCCION';
  usuarioAtv: string;
  tienePasswordAtv: boolean;
  tieneCertificado: boolean;
  certificadoNombreArchivo: string | null;
  certificadoVenceEn: string | null; // YYYY-MM-DD
}

export type HaciendaConfigInput = {
  idCompania: number;
  ambiente: 'SANDBOX' | 'PRODUCCION';
  usuarioAtv: string;
  passwordAtv?: string; // solo cuando el usuario escribe una nueva
  certificadoP12Base64?: string; // solo cuando el usuario sube un nuevo archivo .p12
  certificadoNombreArchivo?: string; // nombre del archivo nuevo, acompaña a certificadoP12Base64
  certificadoPin?: string; // solo cuando el usuario escribe un nuevo PIN
};
```

Reemplazar por (ambos `ambiente` ganan `'PRUEBAS_LOCAL'`):

```typescript
export interface HaciendaConfig {
  idCompania: number;
  ambiente: 'SANDBOX' | 'PRODUCCION' | 'PRUEBAS_LOCAL';
  usuarioAtv: string;
  tienePasswordAtv: boolean;
  tieneCertificado: boolean;
  certificadoNombreArchivo: string | null;
  certificadoVenceEn: string | null; // YYYY-MM-DD
}

export type HaciendaConfigInput = {
  idCompania: number;
  ambiente: 'SANDBOX' | 'PRODUCCION' | 'PRUEBAS_LOCAL';
  usuarioAtv: string;
  passwordAtv?: string; // solo cuando el usuario escribe una nueva
  certificadoP12Base64?: string; // solo cuando el usuario sube un nuevo archivo .p12
  certificadoNombreArchivo?: string; // nombre del archivo nuevo, acompaña a certificadoP12Base64
  certificadoPin?: string; // solo cuando el usuario escribe un nuevo PIN
};
```

- [ ] **Step 2: Ampliar `EstadoFactura` y agregar `medioPago`/`montoRecibido` a `Factura`**

En `src/data/mockData.ts:777-800`, el bloque actual es:

```typescript
export type EstadoFactura = 'FIRMADA' | 'ENVIADA' | 'ACEPTADA' | 'RECHAZADA' | 'ERROR' | 'ANULADA';
export type TipoDocumentoFactura = '01' | '03'; // 01 = Factura Electrónica, 03 = Nota de Crédito Electrónica

export interface Factura {
  id: number;
  idCompania: number;
  idCita: number | null;
  idPaciente: number;
  clave: string; // 50 dígitos
  consecutivo: string; // 20 dígitos
  fechaEmision: string; // ISO 8601 con offset
  ambiente: 'SANDBOX' | 'PRODUCCION';
  lineas: FacturaLinea[];
  subtotal: number;
  totalIva: number;
  total: number;
  estado: EstadoFactura;
  mensajeError: string | null;
  creadaEn: string;
  condicionVenta: string; // '01' contado, '02' crédito, etc. — catálogo de Hacienda
  tipoDocumento: TipoDocumentoFactura;
  idFacturaReferencia: number | null; // solo en Notas de Crédito: id de la Factura que anulan
  motivoAnulacion: string | null; // solo en Notas de Crédito
}
```

Reemplazar por:

```typescript
export type EstadoFactura = 'FIRMADA' | 'ENVIADA' | 'ACEPTADA' | 'RECHAZADA' | 'ERROR' | 'ANULADA' | 'SIMULADA';
export type TipoDocumentoFactura = '01' | '03'; // 01 = Factura Electrónica, 03 = Nota de Crédito Electrónica

export interface Factura {
  id: number;
  idCompania: number;
  idCita: number | null;
  idPaciente: number;
  clave: string; // 50 dígitos
  consecutivo: string; // 20 dígitos
  fechaEmision: string; // ISO 8601 con offset
  ambiente: 'SANDBOX' | 'PRODUCCION' | 'PRUEBAS_LOCAL';
  lineas: FacturaLinea[];
  subtotal: number;
  totalIva: number;
  total: number;
  estado: EstadoFactura;
  mensajeError: string | null;
  creadaEn: string;
  condicionVenta: string; // '01' contado, '02' crédito, etc. — catálogo de Hacienda
  tipoDocumento: TipoDocumentoFactura;
  idFacturaReferencia: number | null; // solo en Notas de Crédito: id de la Factura que anulan
  motivoAnulacion: string | null; // solo en Notas de Crédito
  medioPago: string; // '01' Efectivo, '02' Tarjeta, '06' SINPE Móvil — catálogo de Hacienda
  montoRecibido: number | null; // solo informativo, para trazabilidad del vuelto entregado
}
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit -p .`
Expected: errores esperados en `server.ts`, `AgendaCalendar.tsx`, `App.tsx`, `FacturacionManager.tsx`, `CompanySettings.tsx` — todos por construir objetos `Factura`/`HaciendaConfig` sin los campos nuevos requeridos, o por comparar/asignar el tipo `ambiente`/`estado` ampliado contra el tipo viejo en esos archivos. Esto es exactamente lo esperado; se resuelve en las tareas siguientes. Confirmar que NO hay errores dentro de `src/data/mockData.ts` mismo.

- [ ] **Step 4: Commit**

```bash
git add src/data/mockData.ts
git commit -m "$(cat <<'EOF'
Add PRUEBAS_LOCAL ambiente, SIMULADA estado, and Factura.medioPago/montoRecibido

Groundwork for the invoicing IVA/vuelto/payment-method fixes and the
Hacienda test mode; no behavior change yet.
EOF
)"
```

---

## Task 2: Tipo `AmbienteHacienda` en `server/haciendaApi.ts`

**Files:**
- Modify: `server/haciendaApi.ts:8`

**Interfaces:**
- Consumes: nada.
- Produces: `AmbienteHacienda` ampliado, usado por `obtenerTokenHacienda`/`enviarFacturaHacienda`/`consultarEstadoHacienda` — sus firmas ya usan este tipo, así que aceptan `'PRUEBAS_LOCAL'` sin más cambios en este archivo (esas funciones nunca se invocan en ese modo — ver Task 3).

- [ ] **Step 1: Ampliar el tipo**

En `server/haciendaApi.ts:8`:

```typescript
export type AmbienteHacienda = "SANDBOX" | "PRODUCCION";
```

Reemplazar por:

```typescript
export type AmbienteHacienda = "SANDBOX" | "PRODUCCION" | "PRUEBAS_LOCAL";
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit -p .`
Expected: mismo conjunto de errores esperados que al final de Task 1 (este archivo no introduce nuevos ni resuelve los existentes todavía).

- [ ] **Step 3: Commit**

```bash
git add server/haciendaApi.ts
git commit -m "$(cat <<'EOF'
Add PRUEBAS_LOCAL to AmbienteHacienda

The Hacienda HTTP client functions accept the value in their type
signature but are never actually invoked when it's set (Task 3) — no
new URL mapping needed.
EOF
)"
```

---

## Task 3: Backend — migraciones y `POST /api/facturas`

**Files:**
- Modify: `server.ts:96` (`LocalHaciendaConfig.ambiente`)
- Modify: `server.ts:320` (migración `facturas`, después de `creadaEn`)
- Modify: `server.ts:344` (migración `compania_hacienda_config`, después de `ultimo_consecutivo_nc`)
- Modify: `server.ts:2505` (`cargarCredencialesAtv` tipo de retorno)
- Modify: `server.ts:2552-2779` (`POST /api/facturas` — leer `montoRecibido`, persistir `medioPago`/`montoRecibido`, saltar Hacienda en `PRUEBAS_LOCAL`)

**Interfaces:**
- Consumes: tipos de Task 1 (`Factura.medioPago`/`montoRecibido`), `AmbienteHacienda` de Task 2.
- Produces: `POST /api/facturas` acepta `montoRecibido` en el body y responde una `Factura` con `medioPago`/`montoRecibido` poblados; en `PRUEBAS_LOCAL` responde `estado: 'SIMULADA'` sin tocar la red. Consumido por `AgendaCalendar.tsx` (Task 7).

- [ ] **Step 1: Ampliar `LocalHaciendaConfig.ambiente`**

En `server.ts:96`:

```typescript
  ambiente: 'SANDBOX' | 'PRODUCCION';
```

Reemplazar por:

```typescript
  ambiente: 'SANDBOX' | 'PRODUCCION' | 'PRUEBAS_LOCAL';
```

- [ ] **Step 2: Migración de `facturas` — `medioPago`/`montoRecibido`**

En `server.ts:320`, justo después de:

```typescript
    await pool.query(`ALTER TABLE facturas ADD COLUMN IF NOT EXISTS creadaEn VARCHAR(30) NULL`);
```

agregar:

```typescript
    await pool.query(`ALTER TABLE facturas ADD COLUMN IF NOT EXISTS medioPago VARCHAR(5) NOT NULL DEFAULT '01'`);
    await pool.query(`ALTER TABLE facturas ADD COLUMN IF NOT EXISTS montoRecibido DECIMAL(12,2) NULL`);
```

- [ ] **Step 3: Migración de `compania_hacienda_config` — ampliar el ENUM de `ambiente`**

En `server.ts:344`, justo después de:

```typescript
    await pool.query(`ALTER TABLE compania_hacienda_config ADD COLUMN IF NOT EXISTS ultimo_consecutivo_nc INT NOT NULL DEFAULT 0`);
```

agregar:

```typescript
    await pool.query(`ALTER TABLE compania_hacienda_config MODIFY COLUMN ambiente ENUM('SANDBOX','PRODUCCION','PRUEBAS_LOCAL') NOT NULL DEFAULT 'SANDBOX'`);
```

- [ ] **Step 4: Ampliar el tipo de retorno de `cargarCredencialesAtv`**

En `server.ts:2505`:

```typescript
  async function cargarCredencialesAtv(idCompania: number): Promise<{ ambiente: 'SANDBOX' | 'PRODUCCION'; usuarioAtv: string; passwordAtv: string } | null> {
```

Reemplazar por:

```typescript
  async function cargarCredencialesAtv(idCompania: number): Promise<{ ambiente: 'SANDBOX' | 'PRODUCCION' | 'PRUEBAS_LOCAL'; usuarioAtv: string; passwordAtv: string } | null> {
```

- [ ] **Step 5: Leer `montoRecibido` del body**

En `server.ts:2552-2560`, el bloque actual es:

```typescript
  app.post("/api/facturas", requireAuth, async (req, res) => {
    try {
      const body = req.body;
      const idCompania = sessionOf(req).idCompania;
      const idCita = body.idCita != null ? parseInt(body.idCita) : null;
      const idPaciente = parseInt(body.idPaciente);
      const condicionVenta = body.condicionVenta || "01";
      const medioPago = body.medioPago || "01";
      const lineasBody: Array<{ idServicio: number; cantidad: number }> = body.lineas || [];
```

Reemplazar por (se agrega `montoRecibido`):

```typescript
  app.post("/api/facturas", requireAuth, async (req, res) => {
    try {
      const body = req.body;
      const idCompania = sessionOf(req).idCompania;
      const idCita = body.idCita != null ? parseInt(body.idCita) : null;
      const idPaciente = parseInt(body.idPaciente);
      const condicionVenta = body.condicionVenta || "01";
      const medioPago = body.medioPago || "01";
      const montoRecibido = body.montoRecibido != null && String(body.montoRecibido).trim() !== '' ? parseFloat(body.montoRecibido) : null;
      const lineasBody: Array<{ idServicio: number; cantidad: number }> = body.lineas || [];
```

- [ ] **Step 6: Incluir `medioPago`/`montoRecibido` en el objeto `nuevaFactura` y saltar Hacienda en `PRUEBAS_LOCAL`**

En `server.ts:2702-2744`, el bloque actual es:

```typescript
      const nuevaFactura: any = {
        idCompania,
        idCita,
        idPaciente,
        clave,
        consecutivo,
        fechaEmision: fechaEmisionCR(fechaEmision),
        ambiente: credenciales.ambiente,
        lineas: lineasCalculadas,
        subtotal: resumen.totalVenta,
        totalIva: resumen.totalImpuesto,
        total: resumen.totalComprobante,
        estado: "FIRMADA",
        mensajeError: null,
        creadaEn: new Date().toISOString(),
        condicionVenta,
        tipoDocumento: "01",
        idFacturaReferencia: null,
        motivoAnulacion: null
      };

      // Envío a Hacienda — best-effort: si Hacienda no responde o rechaza, la factura queda
      // guardada como FIRMADA/ERROR y se puede reintentar el envío después.
      try {
        const token = await obtenerTokenHacienda(credenciales.ambiente, credenciales.usuarioAtv, credenciales.passwordAtv);
        const envio = await enviarFacturaHacienda({
          ambiente: credenciales.ambiente,
          token,
          clave,
          fechaEmisionIso: fechaEmisionCR(fechaEmision),
          tipoIdentificacionEmisor: company.tipoIdentificacion,
          cedulaEmisor: limpiarIdentificacion(company.identificacion),
          tipoIdentificacionReceptor: tipoIdReceptor,
          cedulaReceptor: limpiarIdentificacion(paciente.identificacion),
          xmlFirmado
        });
        nuevaFactura.estado = envio.aceptadoParaProcesar ? "ENVIADA" : "ERROR";
        nuevaFactura.mensajeError = envio.mensaje;
      } catch (err: any) {
        nuevaFactura.estado = "ERROR";
        nuevaFactura.mensajeError = err.message;
        console.error("[Hacienda] Error enviando factura:", err.message || err);
      }
```

Reemplazar por (se agregan `medioPago`/`montoRecibido` al objeto, y se envuelve el bloque de envío en un `if` que lo salta por completo en `PRUEBAS_LOCAL`):

```typescript
      const nuevaFactura: any = {
        idCompania,
        idCita,
        idPaciente,
        clave,
        consecutivo,
        fechaEmision: fechaEmisionCR(fechaEmision),
        ambiente: credenciales.ambiente,
        lineas: lineasCalculadas,
        subtotal: resumen.totalVenta,
        totalIva: resumen.totalImpuesto,
        total: resumen.totalComprobante,
        estado: "FIRMADA",
        mensajeError: null,
        creadaEn: new Date().toISOString(),
        condicionVenta,
        tipoDocumento: "01",
        idFacturaReferencia: null,
        motivoAnulacion: null,
        medioPago,
        montoRecibido
      };

      if (credenciales.ambiente === "PRUEBAS_LOCAL") {
        // Modo sin envío: la factura se numera y guarda igual que siempre, pero nunca se
        // llama a la API de Hacienda — ni para pedir token ni para enviar el XML.
        nuevaFactura.estado = "SIMULADA";
        nuevaFactura.mensajeError = "Ambiente de pruebas locales — no se envió a Hacienda.";
      } else {
        // Envío a Hacienda — best-effort: si Hacienda no responde o rechaza, la factura queda
        // guardada como FIRMADA/ERROR y se puede reintentar el envío después.
        try {
          const token = await obtenerTokenHacienda(credenciales.ambiente, credenciales.usuarioAtv, credenciales.passwordAtv);
          const envio = await enviarFacturaHacienda({
            ambiente: credenciales.ambiente,
            token,
            clave,
            fechaEmisionIso: fechaEmisionCR(fechaEmision),
            tipoIdentificacionEmisor: company.tipoIdentificacion,
            cedulaEmisor: limpiarIdentificacion(company.identificacion),
            tipoIdentificacionReceptor: tipoIdReceptor,
            cedulaReceptor: limpiarIdentificacion(paciente.identificacion),
            xmlFirmado
          });
          nuevaFactura.estado = envio.aceptadoParaProcesar ? "ENVIADA" : "ERROR";
          nuevaFactura.mensajeError = envio.mensaje;
        } catch (err: any) {
          nuevaFactura.estado = "ERROR";
          nuevaFactura.mensajeError = err.message;
          console.error("[Hacienda] Error enviando factura:", err.message || err);
        }
      }
```

- [ ] **Step 7: Incluir `medioPago`/`montoRecibido` en el INSERT**

En `server.ts:2746-2755`, el bloque actual es:

```typescript
      if (dbConnected && pool) {
        const [result] = await pool.query(
          "INSERT INTO facturas (idCompania, idCita, idPaciente, clave, consecutivo, fechaEmision, ambiente, lineas, subtotal, totalIva, total, estado, mensajeError, creadaEn, condicionVenta, tipoDocumento, idFacturaReferencia, motivoAnulacion) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [nuevaFactura.idCompania, nuevaFactura.idCita, nuevaFactura.idPaciente, nuevaFactura.clave, nuevaFactura.consecutivo, nuevaFactura.fechaEmision, nuevaFactura.ambiente, JSON.stringify(nuevaFactura.lineas), nuevaFactura.subtotal, nuevaFactura.totalIva, nuevaFactura.total, nuevaFactura.estado, nuevaFactura.mensajeError, nuevaFactura.creadaEn, nuevaFactura.condicionVenta, nuevaFactura.tipoDocumento, nuevaFactura.idFacturaReferencia, nuevaFactura.motivoAnulacion]
        );
        nuevaFactura.id = (result as any).insertId;
      } else {
        nuevaFactura.id = Math.max(0, ...localFacturas.map(f => f.id)) + 1;
        localFacturas.push(nuevaFactura);
      }
```

Reemplazar por:

```typescript
      if (dbConnected && pool) {
        const [result] = await pool.query(
          "INSERT INTO facturas (idCompania, idCita, idPaciente, clave, consecutivo, fechaEmision, ambiente, lineas, subtotal, totalIva, total, estado, mensajeError, creadaEn, condicionVenta, tipoDocumento, idFacturaReferencia, motivoAnulacion, medioPago, montoRecibido) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [nuevaFactura.idCompania, nuevaFactura.idCita, nuevaFactura.idPaciente, nuevaFactura.clave, nuevaFactura.consecutivo, nuevaFactura.fechaEmision, nuevaFactura.ambiente, JSON.stringify(nuevaFactura.lineas), nuevaFactura.subtotal, nuevaFactura.totalIva, nuevaFactura.total, nuevaFactura.estado, nuevaFactura.mensajeError, nuevaFactura.creadaEn, nuevaFactura.condicionVenta, nuevaFactura.tipoDocumento, nuevaFactura.idFacturaReferencia, nuevaFactura.motivoAnulacion, nuevaFactura.medioPago, nuevaFactura.montoRecibido]
        );
        nuevaFactura.id = (result as any).insertId;
      } else {
        nuevaFactura.id = Math.max(0, ...localFacturas.map(f => f.id)) + 1;
        localFacturas.push(nuevaFactura);
      }
```

- [ ] **Step 8: Verificar tipos**

Run: `npx tsc --noEmit -p .`
Expected: los errores que quedan deben ser SOLO en `AgendaCalendar.tsx`, `App.tsx`, `FacturacionManager.tsx`, `CompanySettings.tsx` (tareas siguientes) — ninguno dentro de `server.ts`.

- [ ] **Step 9: Commit**

```bash
git add server.ts
git commit -m "$(cat <<'EOF'
Persist medioPago/montoRecibido and skip Hacienda in PRUEBAS_LOCAL

POST /api/facturas now saves the payment method and received amount
that were already being collected but discarded, and short-circuits
the real Hacienda API call entirely when the company's ambiente is
PRUEBAS_LOCAL, marking the invoice SIMULADA instead.
EOF
)"
```

---

## Task 4: Backend — filtrar D101/D104 por estado aceptado

**Files:**
- Modify: `server.ts:3639-3649` (`obtenerDatosD104` — consultas SQL)
- Modify: `server.ts:3664-3665` (`obtenerDatosD104` — rama en memoria)
- Modify: `server.ts:3727-3730` (`obtenerDatosD101` — consulta SQL)
- Modify: `server.ts:3752` (`obtenerDatosD101` — rama en memoria)

**Interfaces:**
- Consumes: `EstadoFactura` de Task 1 (solo como referencia conceptual — el SQL usa strings literales).
- Produces: nada consumido por otras tareas.

- [ ] **Step 1: D104 — consultas SQL**

En `server.ts:3639-3649`, el bloque actual es:

```typescript
      const [facturaRows] = await pool.query(
        "SELECT * FROM facturas WHERE idCompania = ? AND tipoDocumento = '01' AND fechaEmision LIKE ? AND estado NOT IN ('RECHAZADA','ERROR')",
        [idCompania, `${periodo}%`]
      );
      const facturasMes = (facturaRows as any[]).map(r => ({ ...r, lineas: typeof r.lineas === "string" ? JSON.parse(r.lineas) : r.lineas }));

      const [ncRows] = await pool.query(
        "SELECT * FROM facturas WHERE idCompania = ? AND tipoDocumento = '03' AND fechaEmision LIKE ? AND estado NOT IN ('RECHAZADA','ERROR')",
        [idCompania, `${periodo}%`]
      );
      const notasCreditoMes = (ncRows as any[]).map(r => ({ ...r, lineas: typeof r.lineas === "string" ? JSON.parse(r.lineas) : r.lineas }));
```

Reemplazar por:

```typescript
      const [facturaRows] = await pool.query(
        "SELECT * FROM facturas WHERE idCompania = ? AND tipoDocumento = '01' AND fechaEmision LIKE ? AND estado IN ('ACEPTADA','ANULADA')",
        [idCompania, `${periodo}%`]
      );
      const facturasMes = (facturaRows as any[]).map(r => ({ ...r, lineas: typeof r.lineas === "string" ? JSON.parse(r.lineas) : r.lineas }));

      const [ncRows] = await pool.query(
        "SELECT * FROM facturas WHERE idCompania = ? AND tipoDocumento = '03' AND fechaEmision LIKE ? AND estado = 'ACEPTADA'",
        [idCompania, `${periodo}%`]
      );
      const notasCreditoMes = (ncRows as any[]).map(r => ({ ...r, lineas: typeof r.lineas === "string" ? JSON.parse(r.lineas) : r.lineas }));
```

- [ ] **Step 2: D104 — rama en memoria**

En `server.ts:3664-3665`, el bloque actual es:

```typescript
      const facturasMes = localFacturas.filter(f => f.idCompania === idCompania && f.tipoDocumento === "01" && f.fechaEmision.startsWith(periodo) && f.estado !== "RECHAZADA" && f.estado !== "ERROR");
      const notasCreditoMes = localFacturas.filter(f => f.idCompania === idCompania && f.tipoDocumento === "03" && f.fechaEmision.startsWith(periodo) && f.estado !== "RECHAZADA" && f.estado !== "ERROR");
```

Reemplazar por:

```typescript
      const facturasMes = localFacturas.filter(f => f.idCompania === idCompania && f.tipoDocumento === "01" && f.fechaEmision.startsWith(periodo) && (f.estado === "ACEPTADA" || f.estado === "ANULADA"));
      const notasCreditoMes = localFacturas.filter(f => f.idCompania === idCompania && f.tipoDocumento === "03" && f.fechaEmision.startsWith(periodo) && f.estado === "ACEPTADA");
```

- [ ] **Step 3: D101 — consulta SQL**

En `server.ts:3727-3730`, el bloque actual es:

```typescript
      const [facturaRows] = await pool.query(
        "SELECT * FROM facturas WHERE idCompania = ? AND tipoDocumento = '01' AND fechaEmision LIKE ? AND estado NOT IN ('ANULADA','RECHAZADA','ERROR')",
        [idCompania, `${anioStr}%`]
      );
```

Reemplazar por:

```typescript
      const [facturaRows] = await pool.query(
        "SELECT * FROM facturas WHERE idCompania = ? AND tipoDocumento = '01' AND fechaEmision LIKE ? AND estado = 'ACEPTADA'",
        [idCompania, `${anioStr}%`]
      );
```

- [ ] **Step 4: D101 — rama en memoria**

En `server.ts:3752`:

```typescript
      const facturasAnio = localFacturas.filter(f => f.idCompania === idCompania && f.tipoDocumento === "01" && f.fechaEmision.startsWith(anioStr) && f.estado !== "ANULADA" && f.estado !== "RECHAZADA" && f.estado !== "ERROR");
```

Reemplazar por:

```typescript
      const facturasAnio = localFacturas.filter(f => f.idCompania === idCompania && f.tipoDocumento === "01" && f.fechaEmision.startsWith(anioStr) && f.estado === "ACEPTADA");
```

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit -p .`
Expected: mismo conjunto de errores pendientes que al final de Task 3 (ninguno nuevo, ninguno resuelto por esta tarea — es un cambio de lógica SQL/JS, no de tipos).

- [ ] **Step 6: Commit**

```bash
git add server.ts
git commit -m "$(cat <<'EOF'
Tighten D101/D104 to only count Hacienda-accepted invoices

D104 (nets Notas de Crédito): facturas ACEPTADA+ANULADA, notas de
crédito ACEPTADA only. D101 (no netting): ACEPTADA strictly, since a
cancelled sale isn't income. ENVIADA/FIRMADA/SIMULADA/ERROR/RECHAZADA
no longer count as final in either report.
EOF
)"
```

---

## Task 5: `CompanySettings.tsx` — opción de ambiente `PRUEBAS_LOCAL`

**Files:**
- Modify: `src/components/CompanySettings.tsx:172` (estado `haciendaAmbiente`)
- Modify: `src/components/CompanySettings.tsx:989-997` (JSX del selector)

**Interfaces:**
- Consumes: `HaciendaConfigInput.ambiente` de Task 1.
- Produces: nada consumido por otras tareas.

- [ ] **Step 1: Ampliar el tipo del estado**

En `src/components/CompanySettings.tsx:172`:

```typescript
  const [haciendaAmbiente, setHaciendaAmbiente] = useState<'SANDBOX' | 'PRODUCCION'>('SANDBOX');
```

Reemplazar por:

```typescript
  const [haciendaAmbiente, setHaciendaAmbiente] = useState<'SANDBOX' | 'PRODUCCION' | 'PRUEBAS_LOCAL'>('SANDBOX');
```

- [ ] **Step 2: Agregar la opción en el selector**

En `src/components/CompanySettings.tsx:989-997`, el bloque actual es:

```tsx
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
```

Reemplazar por:

```tsx
            <div>
              <label className="block text-slate-600 mb-1 font-semibold">Ambiente</label>
              <select
                value={haciendaAmbiente}
                onChange={(e) => setHaciendaAmbiente(e.target.value as 'SANDBOX' | 'PRODUCCION' | 'PRUEBAS_LOCAL')}
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
              >
                <option value="PRUEBAS_LOCAL">Pruebas Locales (no envía a Hacienda)</option>
                <option value="SANDBOX">Sandbox (Pruebas de Hacienda — envía tráfico real)</option>
                <option value="PRODUCCION">Producción</option>
              </select>
            </div>
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit -p .`
Expected: mismo conjunto de errores pendientes (App.tsx, AgendaCalendar.tsx, FacturacionManager.tsx) — ninguno dentro de `CompanySettings.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/components/CompanySettings.tsx
git commit -m "$(cat <<'EOF'
Add PRUEBAS_LOCAL option to the Hacienda ambiente selector

Relabels SANDBOX to clarify it still sends real traffic to
Hacienda's staging servers, unlike the new local-only option.
EOF
)"
```

---

## Task 6: `App.tsx` — wiring de `handleVerificarEstadoFactura`, `ivaPorDefecto` y `montoRecibido`

**Files:**
- Modify: `src/App.tsx:646-663` (`handleCrearFactura` — tipo del payload)
- Modify: `src/App.tsx:665-676` (después de `handleAnularFactura`, nuevo `handleVerificarEstadoFactura`)
- Modify: `src/App.tsx:1866-1870` (props de `<FacturacionManager>`)
- Modify: `src/App.tsx:1950-1968` (props de `<AgendaCalendar>`)

**Interfaces:**
- Consumes: `Factura` de Task 1.
- Produces: `handleVerificarEstadoFactura`, prop `onVerificarEstadoFactura` para `FacturacionManager` (Task 8) y `AgendaCalendar` (Task 7); prop `ivaPorDefecto` para `AgendaCalendar` (Task 7); `montoRecibido` incluido en el payload de `handleCrearFactura`.

- [ ] **Step 1: Agregar `montoRecibido` al tipo del payload**

En `src/App.tsx:646-653`, el bloque actual es:

```typescript
  const handleCrearFactura = async (payload: {
    idCompania: number;
    idCita: number | null;
    idPaciente: number;
    condicionVenta: string;
    medioPago: string;
    lineas: Array<{ idServicio: number; cantidad: number }>;
  }): Promise<Factura> => {
```

Reemplazar por:

```typescript
  const handleCrearFactura = async (payload: {
    idCompania: number;
    idCita: number | null;
    idPaciente: number;
    condicionVenta: string;
    medioPago: string;
    montoRecibido: number | null;
    lineas: Array<{ idServicio: number; cantidad: number }>;
  }): Promise<Factura> => {
```

(El cuerpo de la función no cambia — ya hace `fetch('/api/facturas', { ..., body: JSON.stringify(payload) })`, así que `montoRecibido` viaja automáticamente en el JSON.)

- [ ] **Step 2: Agregar `handleVerificarEstadoFactura`**

En `src/App.tsx`, justo después del cierre de `handleAnularFactura` (línea 676, `};`):

```typescript
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
```

agregar:

```typescript

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
```

- [ ] **Step 3: Pasar la prop a `<FacturacionManager>`**

En `src/App.tsx:1866-1870`:

```tsx
                <FacturacionManager
                  facturas={facturas.filter(f => f.idCompania === selectedCompanyId)}
                  patients={filteredPatientsByCompany}
                  onAnularFactura={handleAnularFactura}
                />
```

Reemplazar por:

```tsx
                <FacturacionManager
                  facturas={facturas.filter(f => f.idCompania === selectedCompanyId)}
                  patients={filteredPatientsByCompany}
                  onAnularFactura={handleAnularFactura}
                  onVerificarEstadoFactura={handleVerificarEstadoFactura}
                />
```

- [ ] **Step 4: Pasar las props a `<AgendaCalendar>`**

En `src/App.tsx:1950-1968`:

```tsx
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
                themeColor={activeCompany.colorPrimario}
              />
```

Reemplazar por:

```tsx
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
```

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit -p .`
Expected: errores esperados en `AgendaCalendar.tsx` (`AgendaCalendarProps` no acepta aún `onVerificarEstadoFactura`/`ivaPorDefecto`/el nuevo campo `montoRecibido` en `onCrearFactura`) y en `FacturacionManager.tsx` (`FacturacionManagerProps` no acepta aún `onVerificarEstadoFactura`) — se resuelven en las Tareas 7 y 8. Confirmar que no hay ningún otro error.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "$(cat <<'EOF'
Wire handleVerificarEstadoFactura and ivaPorDefecto through App.tsx

Passes the already-working Hacienda status-check endpoint and the
company's default IVA rate down to AgendaCalendar and
FacturacionManager (both wired in the next two tasks).
EOF
)"
```

---

## Task 7: `AgendaCalendar.tsx` — desglose de IVA, vuelto, y confirmación automática de estado

**Files:**
- Modify: `src/components/AgendaCalendar.tsx:44-69` (`AgendaCalendarProps` — nuevas props)
- Modify: `src/components/AgendaCalendar.tsx:126-133` (estado del modal — nuevo `facturaMontoRecibido`)
- Modify: `src/components/AgendaCalendar.tsx:463-469` (`handleAbrirFacturar` — reset del nuevo campo)
- Modify: `src/components/AgendaCalendar.tsx:471-505` (`facturaSubtotalPreview` → desglose completo, `handleEmitirFactura` — incluir `montoRecibido` y disparar la confirmación automática)
- Modify: `src/components/AgendaCalendar.tsx:1363-1380` (JSX — desglose de IVA + monto recibido/vuelto)

**Interfaces:**
- Consumes: `Factura`/`HaciendaConfig` de Task 1, `handleVerificarEstadoFactura`/`ivaPorDefecto` de Task 6 (`App.tsx`).
- Produces: nada consumido por otras tareas.

- [ ] **Step 1: Nuevas props**

En `src/components/AgendaCalendar.tsx:44-69`, el bloque actual es:

```typescript
interface AgendaCalendarProps {
  patients: Patient[];
  users: User[];
  citas: Cita[];
  smtpConfigs: CompaniaSmtpConfig[];
  logs: NotificationLog[];
  activeCompanyId: number;
  currentUser: User;
  onSaveCita: (cita: Cita) => void;
  onTriggerNotification: (log: NotificationLog) => void;
  onStartConsultation: (patient: Patient, citaId: number) => void;
  calendarBlocks: CalendarBlock[];
  onSaveCalendarBlock: (block: CalendarBlock) => void;
  onDeleteCalendarBlock: (id: number) => void;
  servicios: Servicio[];
  facturas: Factura[];
  onCrearFactura: (payload: {
    idCompania: number;
    idCita: number | null;
    idPaciente: number;
    condicionVenta: string;
    medioPago: string;
    lineas: Array<{ idServicio: number; cantidad: number }>;
  }) => Promise<Factura>;
  themeColor: string;
}

export default function AgendaCalendar({
  patients,
  users,
  citas,
  smtpConfigs,
  logs,
  activeCompanyId,
  currentUser,
  onSaveCita,
  onTriggerNotification,
  onStartConsultation,
  calendarBlocks,
  onSaveCalendarBlock,
  servicios,
  facturas,
  onCrearFactura,
  onDeleteCalendarBlock,
  themeColor
}: AgendaCalendarProps) {
```

Reemplazar por:

```typescript
interface AgendaCalendarProps {
  patients: Patient[];
  users: User[];
  citas: Cita[];
  smtpConfigs: CompaniaSmtpConfig[];
  logs: NotificationLog[];
  activeCompanyId: number;
  currentUser: User;
  onSaveCita: (cita: Cita) => void;
  onTriggerNotification: (log: NotificationLog) => void;
  onStartConsultation: (patient: Patient, citaId: number) => void;
  calendarBlocks: CalendarBlock[];
  onSaveCalendarBlock: (block: CalendarBlock) => void;
  onDeleteCalendarBlock: (id: number) => void;
  servicios: Servicio[];
  facturas: Factura[];
  onCrearFactura: (payload: {
    idCompania: number;
    idCita: number | null;
    idPaciente: number;
    condicionVenta: string;
    medioPago: string;
    montoRecibido: number | null;
    lineas: Array<{ idServicio: number; cantidad: number }>;
  }) => Promise<Factura>;
  onVerificarEstadoFactura: (idFactura: number) => Promise<Factura>;
  ivaPorDefecto: number;
  themeColor: string;
}

export default function AgendaCalendar({
  patients,
  users,
  citas,
  smtpConfigs,
  logs,
  activeCompanyId,
  currentUser,
  onSaveCita,
  onTriggerNotification,
  onStartConsultation,
  calendarBlocks,
  onSaveCalendarBlock,
  servicios,
  facturas,
  onCrearFactura,
  onVerificarEstadoFactura,
  ivaPorDefecto,
  onDeleteCalendarBlock,
  themeColor
}: AgendaCalendarProps) {
```

- [ ] **Step 2: Nuevo estado `facturaMontoRecibido`**

En `src/components/AgendaCalendar.tsx:126-132`, el bloque actual es:

```typescript
  // Facturar (modal para emitir una Factura Electrónica de Hacienda para una cita)
  const [facturaCita, setFacturaCita] = useState<Cita | null>(null);
  const [facturaCantidades, setFacturaCantidades] = useState<Record<number, number>>({});
  const [facturaMedioPago, setFacturaMedioPago] = useState('01');
  const [facturaEnviando, setFacturaEnviando] = useState(false);
  const [facturaError, setFacturaError] = useState('');
  const [facturaResultado, setFacturaResultado] = useState<Factura | null>(null);
```

Reemplazar por:

```typescript
  // Facturar (modal para emitir una Factura Electrónica de Hacienda para una cita)
  const [facturaCita, setFacturaCita] = useState<Cita | null>(null);
  const [facturaCantidades, setFacturaCantidades] = useState<Record<number, number>>({});
  const [facturaMedioPago, setFacturaMedioPago] = useState('01');
  const [facturaMontoRecibido, setFacturaMontoRecibido] = useState('');
  const [facturaEnviando, setFacturaEnviando] = useState(false);
  const [facturaError, setFacturaError] = useState('');
  const [facturaResultado, setFacturaResultado] = useState<Factura | null>(null);
```

- [ ] **Step 3: Resetear el campo al abrir el modal**

En `src/components/AgendaCalendar.tsx:463-469`:

```typescript
  const handleAbrirFacturar = (cita: Cita) => {
    setFacturaCita(cita);
    setFacturaCantidades(cita.idServicio ? { [cita.idServicio]: 1 } : {});
    setFacturaMedioPago('01');
    setFacturaError('');
    setFacturaResultado(null);
  };
```

Reemplazar por:

```typescript
  const handleAbrirFacturar = (cita: Cita) => {
    setFacturaCita(cita);
    setFacturaCantidades(cita.idServicio ? { [cita.idServicio]: 1 } : {});
    setFacturaMedioPago('01');
    setFacturaMontoRecibido('');
    setFacturaError('');
    setFacturaResultado(null);
  };
```

- [ ] **Step 4: Desglose de IVA en vivo y `handleEmitirFactura` con `montoRecibido` + confirmación automática**

En `src/components/AgendaCalendar.tsx:471-505`, el bloque actual es:

```typescript
  const facturaSubtotalPreview = (Object.entries(facturaCantidades) as [string, number][]).reduce((sum, [idServicio, cantidad]) => {
    if (!cantidad || cantidad <= 0) return sum;
    const servicio = companyServicios.find(s => s.id === parseInt(idServicio));
    return sum + (servicio ? servicio.precio * cantidad : 0);
  }, 0);

  const handleEmitirFactura = async () => {
    if (!facturaCita) return;
    const lineas = (Object.entries(facturaCantidades) as [string, number][])
      .filter(([, cantidad]) => cantidad > 0)
      .map(([idServicio, cantidad]) => ({ idServicio: parseInt(idServicio), cantidad }));

    if (lineas.length === 0) {
      setFacturaError('Agregue al menos un servicio con cantidad mayor a 0.');
      return;
    }

    setFacturaEnviando(true);
    setFacturaError('');
    try {
      const factura = await onCrearFactura({
        idCompania: activeCompanyId,
        idCita: facturaCita.id,
        idPaciente: facturaCita.idPaciente,
        condicionVenta: '01',
        medioPago: facturaMedioPago,
        lineas
      });
      setFacturaResultado(factura);
    } catch (err: any) {
      setFacturaError(err.message || 'No se pudo generar la factura.');
    } finally {
      setFacturaEnviando(false);
    }
  };
```

Reemplazar por:

```typescript
  const facturaDesglosePreview = (Object.entries(facturaCantidades) as [string, number][]).reduce((acc, [idServicio, cantidad]) => {
    if (!cantidad || cantidad <= 0) return acc;
    const servicio = companyServicios.find(s => s.id === parseInt(idServicio));
    if (!servicio) return acc;
    const porcentajeIva = servicio.porcentajeIva != null ? servicio.porcentajeIva : ivaPorDefecto;
    const subTotal = servicio.precio * cantidad;
    const montoIva = subTotal * (porcentajeIva / 100);
    return {
      subtotal: acc.subtotal + subTotal,
      iva: acc.iva + montoIva,
      total: acc.total + subTotal + montoIva
    };
  }, { subtotal: 0, iva: 0, total: 0 });

  const facturaMontoRecibidoNum = facturaMontoRecibido.trim() !== '' ? parseFloat(facturaMontoRecibido) : null;
  const facturaVuelto = facturaMontoRecibidoNum != null && !isNaN(facturaMontoRecibidoNum)
    ? facturaMontoRecibidoNum - facturaDesglosePreview.total
    : null;

  const handleEmitirFactura = async () => {
    if (!facturaCita) return;
    const lineas = (Object.entries(facturaCantidades) as [string, number][])
      .filter(([, cantidad]) => cantidad > 0)
      .map(([idServicio, cantidad]) => ({ idServicio: parseInt(idServicio), cantidad }));

    if (lineas.length === 0) {
      setFacturaError('Agregue al menos un servicio con cantidad mayor a 0.');
      return;
    }

    setFacturaEnviando(true);
    setFacturaError('');
    try {
      const factura = await onCrearFactura({
        idCompania: activeCompanyId,
        idCita: facturaCita.id,
        idPaciente: facturaCita.idPaciente,
        condicionVenta: '01',
        medioPago: facturaMedioPago,
        montoRecibido: facturaMontoRecibidoNum,
        lineas
      });
      setFacturaResultado(factura);

      // Hacienda a veces tarda unos segundos en resolver una factura ENVIADA — se consulta
      // una vez automáticamente; si sigue sin resolver, el botón manual en el historial
      // permite reintentar cuando se quiera.
      if (factura.estado === 'ENVIADA') {
        setTimeout(() => {
          onVerificarEstadoFactura(factura.id)
            .then(actualizada => setFacturaResultado(prev => (prev && prev.id === actualizada.id ? actualizada : prev)))
            .catch(() => {});
        }, 8000);
      }
    } catch (err: any) {
      setFacturaError(err.message || 'No se pudo generar la factura.');
    } finally {
      setFacturaEnviando(false);
    }
  };
```

- [ ] **Step 5: JSX — desglose de IVA + monto recibido/vuelto**

En `src/components/AgendaCalendar.tsx:1363-1380`, el bloque actual es:

```tsx
                  <div>
                    <label className="block text-slate-600 text-xs font-bold mb-1.5">Medio de Pago</label>
                    <select
                      value={facturaMedioPago}
                      onChange={(e) => setFacturaMedioPago(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
                    >
                      <option value="01">Efectivo</option>
                      <option value="02">Tarjeta</option>
                      <option value="06">SINPE Móvil</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                    <span className="text-slate-500">Subtotal estimado (sin IVA)</span>
                    <span className="font-bold text-slate-800">₡{facturaSubtotalPreview.toLocaleString('es-CR', { maximumFractionDigits: 2 })}</span>
                  </div>
                  <p className="text-[10px] text-slate-400">El IVA y el total exacto se calculan al emitir la factura.</p>
```

Reemplazar por:

```tsx
                  <div>
                    <label className="block text-slate-600 text-xs font-bold mb-1.5">Medio de Pago</label>
                    <select
                      value={facturaMedioPago}
                      onChange={(e) => setFacturaMedioPago(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
                    >
                      <option value="01">Efectivo</option>
                      <option value="02">Tarjeta</option>
                      <option value="06">SINPE Móvil</option>
                    </select>
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Subtotal</span>
                      <span className="font-semibold text-slate-700">₡{facturaDesglosePreview.subtotal.toLocaleString('es-CR', { maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">IVA</span>
                      <span className="font-semibold text-slate-700">₡{facturaDesglosePreview.iva.toLocaleString('es-CR', { maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-slate-200 pt-1">
                      <span className="text-slate-600 font-bold">Total</span>
                      <span className="font-bold text-slate-800">₡{facturaDesglosePreview.total.toLocaleString('es-CR', { maximumFractionDigits: 2 })}</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-600 text-xs font-bold mb-1.5">Monto Recibido</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={facturaMontoRecibido}
                      onChange={(e) => setFacturaMontoRecibido(e.target.value)}
                      placeholder={`ej: ${Math.ceil(facturaDesglosePreview.total)}`}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
                    />
                    {facturaVuelto != null && (
                      <p className={`text-[10px] mt-1 font-bold ${facturaVuelto < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {facturaVuelto < 0
                          ? `Falta ₡${Math.abs(facturaVuelto).toLocaleString('es-CR', { maximumFractionDigits: 2 })}`
                          : `Vuelto: ₡${facturaVuelto.toLocaleString('es-CR', { maximumFractionDigits: 2 })}`}
                      </p>
                    )}
                  </div>
```

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc --noEmit -p .`
Expected: los errores restantes deben ser SOLO en `FacturacionManager.tsx` (Task 8) — ninguno en `AgendaCalendar.tsx` ni `App.tsx`.

- [ ] **Step 7: Commit**

```bash
git add src/components/AgendaCalendar.tsx
git commit -m "$(cat <<'EOF'
Show live IVA breakdown and vuelto, send montoRecibido, auto-confirm Hacienda status

The billing modal now computes subtotal/IVA/total per line (mirroring
the server's formula) instead of a flat pre-IVA subtotal, shows change
due for any payment method, and automatically re-checks a freshly
emitted invoice's Hacienda status once after 8s if it's still ENVIADA.
EOF
)"
```

---

## Task 8: `FacturacionManager.tsx` — mostrar medio de pago/vuelto y botón "Verificar estado"

**Files:**
- Modify: `src/components/FacturacionManager.tsx:1-18` (imports, props, `ESTADO_ESTILO`)
- Modify: `src/components/FacturacionManager.tsx:20-34` (destructuring, nuevo estado local)
- Modify: `src/components/FacturacionManager.tsx:73-104` (JSX — medio de pago/vuelto + botón)

**Interfaces:**
- Consumes: `Factura` de Task 1, `onVerificarEstadoFactura` de Task 6 (`App.tsx`).
- Produces: nada consumido por otras tareas — última pieza del flujo.

- [ ] **Step 1: Imports, prop nueva, y estilo de `SIMULADA`**

En `src/components/FacturacionManager.tsx:1-18`, el archivo actual empieza:

```typescript
import React, { useState } from 'react';
import { Factura, Patient } from '../data/mockData';
import { Receipt, XCircle, FileMinus, AlertCircle } from 'lucide-react';

interface FacturacionManagerProps {
  facturas: Factura[];
  patients: Patient[];
  onAnularFactura: (idFactura: number, motivo: string) => Promise<Factura>;
}

const ESTADO_ESTILO: Record<string, string> = {
  FIRMADA: 'bg-slate-100 text-slate-700',
  ENVIADA: 'bg-amber-100 text-amber-800',
  ACEPTADA: 'bg-emerald-100 text-emerald-800',
  RECHAZADA: 'bg-rose-100 text-rose-800',
  ERROR: 'bg-rose-100 text-rose-800',
  ANULADA: 'bg-slate-200 text-slate-600'
};

export default function FacturacionManager({ facturas, patients, onAnularFactura }: FacturacionManagerProps) {
```

Reemplazar por:

```typescript
import React, { useState } from 'react';
import { Factura, Patient } from '../data/mockData';
import { Receipt, XCircle, FileMinus, AlertCircle, RefreshCw } from 'lucide-react';

interface FacturacionManagerProps {
  facturas: Factura[];
  patients: Patient[];
  onAnularFactura: (idFactura: number, motivo: string) => Promise<Factura>;
  onVerificarEstadoFactura: (idFactura: number) => Promise<Factura>;
}

const ESTADO_ESTILO: Record<string, string> = {
  FIRMADA: 'bg-slate-100 text-slate-700',
  ENVIADA: 'bg-amber-100 text-amber-800',
  ACEPTADA: 'bg-emerald-100 text-emerald-800',
  RECHAZADA: 'bg-rose-100 text-rose-800',
  ERROR: 'bg-rose-100 text-rose-800',
  ANULADA: 'bg-slate-200 text-slate-600',
  SIMULADA: 'bg-sky-100 text-sky-700'
};

const MEDIO_PAGO_LABEL: Record<string, string> = {
  '01': 'Efectivo',
  '02': 'Tarjeta',
  '06': 'SINPE Móvil'
};

export default function FacturacionManager({ facturas, patients, onAnularFactura, onVerificarEstadoFactura }: FacturacionManagerProps) {
```

- [ ] **Step 2: Estado local para el botón de verificar**

En `src/components/FacturacionManager.tsx:21-24`, el bloque actual es:

```typescript
  const [anulandoId, setAnulandoId] = useState<number | null>(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState('');
  const [anulando, setAnulando] = useState(false);
  const [error, setError] = useState('');
```

Reemplazar por (se agrega `verificandoId`):

```typescript
  const [anulandoId, setAnulandoId] = useState<number | null>(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState('');
  const [anulando, setAnulando] = useState(false);
  const [error, setError] = useState('');
  const [verificandoId, setVerificandoId] = useState<number | null>(null);

  const handleVerificarEstado = async (id: number) => {
    setVerificandoId(id);
    try {
      await onVerificarEstadoFactura(id);
    } catch (err: any) {
      setError(err.message || 'No se pudo verificar el estado con Hacienda.');
    } finally {
      setVerificandoId(null);
    }
  };
```

- [ ] **Step 3: JSX — medio de pago/vuelto y botón "Verificar estado"**

En `src/components/FacturacionManager.tsx:73-104`, el bloque actual es:

```tsx
                <div className="min-w-0">
                  <span className="font-semibold text-slate-800 inline-flex items-center gap-1.5 text-xs">
                    {esNotaCredito ? <FileMinus className="w-3.5 h-3.5 text-rose-500" /> : <Receipt className="w-3.5 h-3.5 text-slate-500" />}
                    {esNotaCredito ? 'Nota de Crédito' : 'Factura'} {f.consecutivo}
                  </span>
                  <span className="text-[10px] text-slate-500 block truncate">
                    {nombrePaciente(f.idPaciente)} &middot; {new Date(f.fechaEmision).toLocaleString('es-CR')} &middot; ₡{f.total.toLocaleString('es-CR', { maximumFractionDigits: 2 })}
                    {f.condicionVenta === '02' && ' · Crédito'}
                  </span>
                  {esNotaCredito && f.idFacturaReferencia != null && (
                    <span className="text-[10px] text-slate-400 block">Anula factura {referenciaFactura(f.idFacturaReferencia)}{f.motivoAnulacion ? ` — ${f.motivoAnulacion}` : ''}</span>
                  )}
                  {f.mensajeError && (f.estado === 'ERROR' || f.estado === 'RECHAZADA') && (
                    <span className="text-[10px] text-rose-600 block truncate" title={f.mensajeError}>{f.mensajeError}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ESTADO_ESTILO[f.estado] || 'bg-slate-100 text-slate-600'}`}>
                    {f.estado}
                  </span>
                  {puedeAnular(f) && (
                    <button
                      onClick={() => { setAnulandoId(f.id); setMotivoAnulacion(''); setError(''); }}
                      title="Anular Factura"
                      className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
```

Reemplazar por (se agrega el medio de pago/vuelto a la línea de detalle, y el botón "Verificar estado" junto al de anular):

```tsx
                <div className="min-w-0">
                  <span className="font-semibold text-slate-800 inline-flex items-center gap-1.5 text-xs">
                    {esNotaCredito ? <FileMinus className="w-3.5 h-3.5 text-rose-500" /> : <Receipt className="w-3.5 h-3.5 text-slate-500" />}
                    {esNotaCredito ? 'Nota de Crédito' : 'Factura'} {f.consecutivo}
                  </span>
                  <span className="text-[10px] text-slate-500 block truncate">
                    {nombrePaciente(f.idPaciente)} &middot; {new Date(f.fechaEmision).toLocaleString('es-CR')} &middot; ₡{f.total.toLocaleString('es-CR', { maximumFractionDigits: 2 })}
                    {f.condicionVenta === '02' && ' · Crédito'}
                    {!esNotaCredito && ` · ${MEDIO_PAGO_LABEL[f.medioPago] || f.medioPago}`}
                    {!esNotaCredito && f.montoRecibido != null && ` · Vuelto ₡${(f.montoRecibido - f.total).toLocaleString('es-CR', { maximumFractionDigits: 2 })}`}
                  </span>
                  {esNotaCredito && f.idFacturaReferencia != null && (
                    <span className="text-[10px] text-slate-400 block">Anula factura {referenciaFactura(f.idFacturaReferencia)}{f.motivoAnulacion ? ` — ${f.motivoAnulacion}` : ''}</span>
                  )}
                  {f.mensajeError && (f.estado === 'ERROR' || f.estado === 'RECHAZADA') && (
                    <span className="text-[10px] text-rose-600 block truncate" title={f.mensajeError}>{f.mensajeError}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ESTADO_ESTILO[f.estado] || 'bg-slate-100 text-slate-600'}`}>
                    {f.estado}
                  </span>
                  {f.estado === 'ENVIADA' && (
                    <button
                      onClick={() => handleVerificarEstado(f.id)}
                      disabled={verificandoId === f.id}
                      title="Verificar estado con Hacienda"
                      className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${verificandoId === f.id ? 'animate-spin' : ''}`} />
                    </button>
                  )}
                  {puedeAnular(f) && (
                    <button
                      onClick={() => { setAnulandoId(f.id); setMotivoAnulacion(''); setError(''); }}
                      title="Anular Factura"
                      className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit -p .`
Expected: sin salida (último eslabón de la cadena — el conteo de errores del plan debe llegar a cero aquí).

- [ ] **Step 5: Verificación manual (documentada, no automatizada)**

No ejecutar contra el servidor de producción sin supervisión. Pasos a probar manualmente en el navegador:
1. En Configuración de Empresa, cambiar el ambiente de Hacienda a "Pruebas Locales", guardar.
2. Facturar una cita — el modal debe mostrar Subtotal/IVA/Total en vivo al ajustar cantidades, y el campo "Monto Recibido" con "Vuelto"/"Falta" actualizándose en vivo.
3. Al emitir, la factura debe quedar en estado `SIMULADA` (no debe haber ninguna llamada de red hacia Hacienda — puede confirmarse en las herramientas de red del navegador que no hay tráfico hacia `comprobanteselectronicos.go.cr`).
4. Cambiar el ambiente a "Sandbox" con credenciales reales de prueba, facturar de nuevo — debe quedar `ENVIADA`, y unos 8 segundos después debe actualizarse solo (si Hacienda ya resolvió) a `ACEPTADA`/`RECHAZADA`.
5. En el historial de Facturación, para una factura `ENVIADA`, click en "Verificar estado con Hacienda" — debe consultar y actualizar el estado.
6. Correr los reportes D101/D104 antes y después de que una factura pase a `ACEPTADA` — confirmar que solo aparece una vez aceptada.

- [ ] **Step 6: Commit**

```bash
git add src/components/FacturacionManager.tsx
git commit -m "$(cat <<'EOF'
Show payment method/vuelto and add manual Hacienda status check

Displays the now-persisted medioPago and derived vuelto per invoice,
and adds a "Verificar estado con Hacienda" button for ENVIADA
invoices that don't resolve automatically within the emission flow's
one-shot check.
EOF
)"
```

---

## Final check (repaso rápido antes de cerrar)

- [ ] `npx tsc --noEmit -p .` sin salida.
- [ ] `npx vitest run` — las 16 pruebas existentes de `calorieFormulas.ts` en verde (sin relación, chequeo de no-regresión).
- [ ] Repasar la spec (`docs/superpowers/specs/2026-08-05-facturacion-ivavuelto-pruebas-reportes-design.md`) punto por punto contra las tareas 1-8 — cada decisión confirmada con el usuario tiene una tarea que la implementa.
- [ ] Desplegar a producción (`npm run build && pm2 restart control-clinico`) **solo con confirmación explícita del usuario**, y verificar primero cuál PID/nombre PM2 corresponde realmente a `control-clinico` antes de reiniciar nada (ver el incidente de `erp-corporativo` en esta misma sesión).
