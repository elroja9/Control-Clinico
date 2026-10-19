# CxP: lectura de correo — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Spec: `docs/superpowers/specs/2026-10-19-cxp-lectura-correo-design.md`.

**Goal:** Bandeja de facturas de proveedor leídas por IMAP, importables a CxP con el importador existente.

**Global constraints:** fechas VARCHAR; contraseña cifrada con `encryptSecret`/`decryptSecret`; todo filtrado por `sessionOf(req).idCompania`; proceso automático solo con `NODE_ENV=production`; no `vite build` para verificar; el SQL se aplica con confirmación.

### Task 1: Dependencias, SQL y tipos
- `npm i imapflow yauzl` y `npm i -D @types/yauzl`.
- `docs/sql/2026-10-19-cxp-correo.sql` con las dos tablas.
- Tipos en `src/data/mockData.ts`: `CompaniaImapConfig`, `FacturaCorreo`.

### Task 2: `server/correoProveedores.ts` (TDD de las funciones puras)
- Test primero: `extraerMetadatosComprobante` (factura 01, tiquete 04, NC → null, USD convertida), `esCompraDeLaEmpresa`, `partesXmlDelMensaje`, `carpetasDe`.
- Portar el colector del ERP; `TIPOS_ACEPTADOS = {01, 04}`; config propia (`ConfigImap` con contraseña ya descifrada).

### Task 3: Endpoints y proceso en `server.ts`
- Config IMAP (GET sin contraseña, POST cifra, reinicia avance si cambia host/usuario), probar, carpetas.
- Bandeja: listar, xml, estado (solo desde PENDIENTE; IMPORTADA exige `idCuentaPagar`), revisar-ahora.
- `revisarBuzonEmpresa` con `Set` anti-concurrencia, dedupe contra `cuentas_pagar`, `INSERT IGNORE`, avance solo si todo se guardó.
- Proceso cada 5 min (solo producción).

### Task 4: UI
- CompanySettings: sección de correo entrante (guardar, probar, ver carpetas).
- CxPManager: panel de bandeja (filtro, Importar → mismo flujo de confirmación con el XML del servidor y luego marcar IMPORTADA; Descartar con motivo; Revisar correo ahora).
- App: handlers/props necesarios.

### Task 5: Verificación
- `tsc`, `vitest`, prueba en modo memoria de la UI (503 esperado sin BD) y del parseo; aplicar SQL con confirmación; reiniciar pm2.
