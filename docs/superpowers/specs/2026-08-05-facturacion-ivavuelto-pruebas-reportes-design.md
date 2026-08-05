# Facturación: IVA/Vuelto/Medio de Pago, Modo Sin Envío a Hacienda, y Reportes D101/D104 por Estado Aceptado

## Contexto

Se investigaron tres pedidos relacionados con el módulo de facturación electrónica (Hacienda, Costa Rica) y se encontró que ninguno es un simple ajuste de UI — los tres tocan huecos reales en el modelo de datos y el flujo:

1. **Facturar Cita** (`AgendaCalendar.tsx`, modal "Facturar Cita") no muestra desglose de IVA antes de emitir, no tiene concepto de "vuelto", y el medio de pago que se selecciona **nunca se guarda** — ni `Factura` ni la tabla `facturas` tienen columna `medioPago`.
2. El ambiente "Sandbox (Pruebas)" que ya existe en Configuración de Empresa **no es un modo local** — es el ambiente de pruebas real de Hacienda (sigue mandando tráfico real a sus servidores de staging). Hoy no existe ninguna forma de no enviar nada a Hacienda.
3. Los reportes D101/D104 tratan `ENVIADA` como si fuera definitivo, pero **nada en el frontend llama nunca** al endpoint que confirma el estado real ante Hacienda (`POST /api/facturas/:id/estado`, que ya existe y funciona) — así que casi ninguna factura pasa de `ENVIADA` a `ACEPTADA` en la práctica.

## Decisiones (confirmadas con el usuario)

1. **Confirmación de estado con Hacienda**: tras emitir una factura (en ambiente real, no en modo simulado), se espera ~8 segundos y se llama automáticamente a `POST /api/facturas/:id/estado` una vez. Además, se agrega un botón "Verificar estado con Hacienda" en el historial (`FacturacionManager.tsx`) para consultarlo manualmente cuando se quiera (Hacienda a veces tarda más).
2. **Modo sin envío**: nuevo valor de `ambiente`, `'PRUEBAS_LOCAL'`, junto a `SANDBOX`/`PRODUCCION`. En ese modo, la factura se crea, numera y guarda igual que siempre, pero el servidor **nunca llama** a `obtenerTokenHacienda`/`enviarFacturaHacienda` — el estado queda `'SIMULADA'` en vez de `ENVIADA`/`ACEPTADA`/`ERROR`.
3. **Vuelto**: aplica para cualquier medio de pago (no solo efectivo). Se agrega un campo "Monto Recibido"; `vuelto = montoRecibido − total`, calculado y mostrado en vivo, y `montoRecibido` se persiste junto a la factura (igual que `medioPago`) para trazabilidad — `vuelto` en sí no se guarda, se deriva.
4. **Medio de pago**: solo se corrige que el único medio ya seleccionado hoy se guarde — no se agregan pagos divididos/múltiples métodos por factura.
5. **Desglose de IVA**: se calcula en el navegador, en vivo, replicando la misma fórmula que ya usa el servidor (`server/haciendaFactura.ts`, `calcularLineas`/`calcularResumen`) — sin llamadas al servidor para previsualizar.
6. **Filtro D101/D104 — caso de facturas anuladas**: una factura solo puede anularse si estaba `ENVIADA`/`ACEPTADA` (`server.ts:2824-2826`), así que al anularse pierde ese estado (queda `ANULADA`) pero de todas formas fue una operación fiscal real en su momento. Para no dejar netos incorrectos:
   - **D104** (declara IVA, ya neteaba usando Notas de Crédito): facturas (`tipoDocumento='01'`) → `estado IN ('ACEPTADA','ANULADA')`; notas de crédito (`tipoDocumento='03'`) → `estado = 'ACEPTADA'` (una Nota de Crédito nunca puede estar `ANULADA` — `server.ts:2818-2820` solo permite anular Facturas, no Notas de Crédito).
   - **D101** (declara renta, sin neteo por Notas de Crédito): facturas → `estado = 'ACEPTADA'` estricto, **excluyendo también `ANULADA`** (una venta cancelada no debe contar como ingreso, y aquí no hay Nota de Crédito que la compense).
   - En ambos reportes, `SIMULADA` queda excluida (nunca fue una presentación fiscal real).

## Modelo de datos

### `src/data/mockData.ts`

```typescript
export interface HaciendaConfig {
  idCompania: number;
  ambiente: 'SANDBOX' | 'PRODUCCION' | 'PRUEBAS_LOCAL';
  // ...resto sin cambios
}

export type HaciendaConfigInput = {
  idCompania: number;
  ambiente: 'SANDBOX' | 'PRODUCCION' | 'PRUEBAS_LOCAL';
  // ...resto sin cambios
};

export type EstadoFactura = 'FIRMADA' | 'ENVIADA' | 'ACEPTADA' | 'RECHAZADA' | 'ERROR' | 'ANULADA' | 'SIMULADA';

export interface Factura {
  // ...campos existentes...
  ambiente: 'SANDBOX' | 'PRODUCCION' | 'PRUEBAS_LOCAL';
  medioPago: string; // '01' Efectivo, '02' Tarjeta, '06' SINPE Móvil — catálogo de Hacienda, ya usado hoy pero nunca guardado
  montoRecibido: number | null; // solo informativo, para trazabilidad de vuelto entregado
  // ...resto sin cambios
}
```

`estado` ya es un `VARCHAR(20)` libre en la tabla `facturas` — agregar `'SIMULADA'` no requiere ninguna migración de esquema. `ambiente` en `compania_hacienda_config` sí es un `ENUM('SANDBOX','PRODUCCION')` estricto en MySQL — necesita una migración explícita (ver Backend).

### `server/haciendaApi.ts`

```typescript
export type AmbienteHacienda = "SANDBOX" | "PRODUCCION" | "PRUEBAS_LOCAL";
```

Este tipo se usa en las firmas de `obtenerTokenHacienda`/`enviarFacturaHacienda`/`consultarEstadoHacienda`, pero esas funciones **nunca se invocan** cuando `ambiente === 'PRUEBAS_LOCAL'` (ver Backend) — el tipo solo necesita aceptar el valor para que TypeScript no rechace pasarlo por la cadena de llamadas, no ganar lógica nueva de URLs.

## Backend (`server.ts`)

### Migración de `compania_hacienda_config.ambiente`

Junto a los demás `ALTER TABLE` de arranque:

```sql
ALTER TABLE compania_hacienda_config MODIFY COLUMN ambiente ENUM('SANDBOX','PRODUCCION','PRUEBAS_LOCAL') NOT NULL DEFAULT 'SANDBOX';
```

(`MODIFY COLUMN` es idempotente — puede ejecutarse en cada arranque sin efectos adversos, igual que los `ADD COLUMN IF NOT EXISTS` ya usados en el resto del archivo.)

### `medioPago` y `montoRecibido` en `facturas`

```sql
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS medioPago VARCHAR(5) NOT NULL DEFAULT '01';
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS montoRecibido DECIMAL(12,2) NULL;
```

### `POST /api/facturas` — persistir `medioPago`/`montoRecibido` y saltar Hacienda en `PRUEBAS_LOCAL`

- El body ya recibe `medioPago` (`server.ts:2559`) — falta leer `montoRecibido` del body también.
- `nuevaFactura` (`server.ts:2702-2721`) gana `medioPago` y `montoRecibido`; el `INSERT INTO facturas` (`server.ts:2748-2749`) gana ambas columnas.
- El bloque de envío a Hacienda (`server.ts:2725-2744`) se envuelve en una condición: si `credenciales.ambiente === 'PRUEBAS_LOCAL'`, se salta por completo (no se llama `obtenerTokenHacienda` ni `enviarFacturaHacienda`) y se fija `nuevaFactura.estado = 'SIMULADA'` directamente, sin intentar red alguna.

### `POST /api/facturas/:id/estado` — sin cambios

Ya existe y funciona (`server.ts:3009-3044`) — el problema era que nada lo llamaba, no que estuviera mal construido.

### D104/D101 — nuevo filtro

- `obtenerDatosD104` (`server.ts:3633-3670`): la consulta de facturas (`tipoDocumento='01'`) cambia su condición a `estado IN ('ACEPTADA','ANULADA')`; la de notas de crédito (`tipoDocumento='03'`) cambia a `estado = 'ACEPTADA'`. Mismo cambio reflejado en la rama de arreglo en memoria (`localFacturas.filter(...)`, líneas 3664-3665).
- `obtenerDatosD101` (`server.ts:3720-...`): la consulta de facturas cambia a `estado = 'ACEPTADA'` (reemplaza el `NOT IN ('ANULADA','RECHAZADA','ERROR')` actual). Mismo cambio en la rama en memoria.

## Frontend

### `src/components/CompanySettings.tsx`
- El `<select>` de "Ambiente" (líneas 989-997) gana una tercera `<option value="PRUEBAS_LOCAL">Pruebas Locales (no envía a Hacienda)</option>`, y el `useState<'SANDBOX' | 'PRODUCCION'>` correspondiente amplía su tipo para incluir `'PRUEBAS_LOCAL'`.

### `src/components/AgendaCalendar.tsx` (modal "Facturar Cita")
- Nuevo estado: `facturaMontoRecibido` (string, para el input).
- Nuevo cálculo derivado (reemplaza `facturaSubtotalPreview`, que hoy solo suma sin IVA): una función/objeto que, por cada línea con cantidad > 0, calcula `montoIva = subTotal × (porcentajeIva / 100)` usando el mismo `porcentajeIva` del servicio (o `ivaPorDefecto` de la empresa si el servicio no tiene uno propio — nuevo prop `ivaPorDefecto: number` en `AgendaCalendarProps`, pasado desde `App.tsx` como `activeCompany.ivaPorDefecto`), acumulando subtotal/IVA/total.
- El desglose se muestra antes de emitir: Subtotal, IVA, Total.
- Campo "Monto Recibido" (aplica a cualquier medio de pago) y "Vuelto" = monto recibido − total, mostrado en vivo (en rojo/aviso si el monto recibido es menor al total).
- `handleEmitirFactura` incluye `montoRecibido` en el payload a `onCrearFactura`.
- Tras una emisión exitosa cuyo resultado tenga `estado === 'ENVIADA'` (no `SIMULADA`, no `ERROR`): esperar ~8 segundos y llamar automáticamente al mismo mecanismo de verificación de estado (ver `App.tsx`), actualizando `facturaResultado` con el estado final si cambió.

### `src/components/FacturacionManager.tsx`
- Nueva prop `onVerificarEstadoFactura: (id: number) => Promise<Factura>`.
- Se muestra el medio de pago (`f.medioPago`) y, si `montoRecibido` no es `null`, el vuelto derivado (`montoRecibido - total`) en la línea de detalle de cada factura.
- Nuevo botón "Verificar estado con Hacienda", visible solo cuando `f.estado === 'ENVIADA'` (los demás estados ya son finales o no aplican), que llama `onVerificarEstadoFactura(f.id)`.
- `ESTADO_ESTILO` gana una entrada para `SIMULADA` (estilo neutro, distinto de `ACEPTADA`, para que no se confunda visualmente con una factura real aceptada).

### `src/App.tsx`
- Nuevo handler `handleVerificarEstadoFactura(id)`: `POST /api/facturas/${id}/estado`, actualiza el `estado` de esa factura en el array `facturas` con la respuesta.
- Se pasa `onVerificarEstadoFactura` a `<FacturacionManager>` y (para el auto-chequeo tras emitir) a `<AgendaCalendar>`.
- Se pasa `ivaPorDefecto={activeCompany.ivaPorDefecto}` a `<AgendaCalendar>`.
