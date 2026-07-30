

# Plan: Reestructurar Backoffice — Jefe de Ventas, Comisiones y Sincronización

## Resumen

Crear un sistema de ventas con dos paneles diferenciados: uno para el **Jefe de Ventas** (gestiona equipo, ve comisiones con pilotos, invita vendedores) y otro para **Vendedores** (ven solo sus proyecciones a $299k). Borrar datos existentes del backoffice, crear la cuenta de Agustín, y sincronizar con Finanzas y Superadmin.

---

## Paso 1 — Limpiar datos del backoffice

Ejecutar DELETE vía insert tool en las tablas:
- `lead_activities` (todo)
- `leads` (todo)
- `seller_goals` (todo)
- `backoffice_invitations` (todo)
- `backoffice_members` (todo)

---

## Paso 2 — Crear cuenta del Jefe de Ventas

- Usar edge function `create-platform-admin` o similar para crear el usuario `agustin.menesesgalda@gmail.com` con contraseña `123456789` (con auto-confirm habilitado temporalmente o via edge function con service_role)
- Insertar en `backoffice_members` con `role: 'jefe_ventas'`, `name: 'Agustín Meneses'`
- Vincular `user_id` al auth user creado

---

## Paso 3 — Panel Jefe de Ventas (`/jefe-ventas`)

Crear nueva ruta `/jefe-ventas` con layout propio. Páginas:

### 3a. Dashboard (`/jefe-ventas/dashboard`)
- KPIs: pilotos cerrados (de 5), clientes activos, MRR proyectado
- Fase actual: si <5 pilotos → "Fase Piloto (199k)", si >=5 → "Fase Comercial (299k)"
- Funnel visual del pipeline

### 3b. Equipo (`/jefe-ventas/equipo`)
- Tabla de vendedores con stats (leads, cierres, comisiones proyectadas)
- Botón invitar vendedor (genera link con `backoffice_invitations`)
- Activar/desactivar vendedores
- Ver detalle de cada vendedor

### 3c. Comisiones (`/jefe-ventas/comisiones`)
**Calculadora de proyecciones para el jefe:**
- Fase Piloto (primeros 5): $199.000/cliente → comisión $50.000 cierre + $30.000 por cliente activo recurrente
- Fase Comercial (post-5): $299.000/cliente → comisión $50.000 cierre + $40.000 por cliente activo
- Input slider: "¿Cuántos clientes?" → muestra:
  - Total por cierres (N × $50.000)
  - Recurrente mensual (N × $30k o $40k según fase)
  - Total mensual proyectado
  - Tabla mes a mes acumulada

### 3d. Pipeline (`/jefe-ventas/pipeline`)
- Kanban reutilizando lógica de BackofficePipeline
- Filtrar por vendedor asignado

### 3e. Configuración (`/jefe-ventas/perfil`)
- Cambiar contraseña
- Editar nombre, teléfono

---

## Paso 4 — Módulo Comisiones para Vendedores (`/vendedor/comisiones`)

Agregar nueva página al panel vendedor existente:
- Precio fijo: $299.000
- Comisión por cierre: $50.000
- Comisión cliente activo: $40.000/mes
- Bono: $100.000 si cierra 7+ en un mes
- Calculadora: input "¿Cuántos clientes puedo cerrar?" → proyección:
  - Cierres × $50.000
  - Activos × $40.000/mes recurrente
  - Bono si ≥7
  - Total proyectado

---

## Paso 5 — Sincronización con Finanzas

Actualizar los 4 paneles de Finanzas para que reflejen datos reales:
- **FinanzasRevenuePage**: MRR basado en `tenants` con `plan_status` — distinguir pilotos ($199k) vs activos ($299k)
- **FinanzasClientesPage**: Mostrar cuáles están "pagando" y cuáles en "piloto", con fecha de próximo cobro
- **FinanzasChurnPage**: Churn calculado sobre tenants que pasaron de activo a inactivo
- **FinanzasCostosPage**: Incluir comisiones proyectadas como costo variable

Agregar a tenants la distinción `plan_status`: `pilot` (199k), `active` (299k) ya existente.

---

## Paso 6 — Sincronización con Superadmin

- En `SATenantsPage` o `BackofficeDashboard`: mostrar fase actual (piloto/comercial)
- En `SAMetricsPage`: agregar KPI de comisiones totales pagadas/proyectadas
- El superadmin ya ve todo por ser platform_admin

---

## Paso 7 — Routing y Auth

Archivos a crear/modificar:
- `src/pages/jefe-ventas/JefeVentasLayout.tsx` — Layout con sidebar
- `src/pages/jefe-ventas/JVDashboardPage.tsx`
- `src/pages/jefe-ventas/JVEquipoPage.tsx`
- `src/pages/jefe-ventas/JVComisionesPage.tsx`
- `src/pages/jefe-ventas/JVPipelinePage.tsx`
- `src/pages/jefe-ventas/JVPerfilPage.tsx`
- `src/pages/seller/SellerComisionesPage.tsx` — Nueva página
- `src/App.tsx` — Agregar rutas `/jefe-ventas/*`
- `src/pages/UnifiedLoginPage.tsx` — Redirigir `jefe_ventas` a `/jefe-ventas/dashboard`
- `src/pages/seller/SellerLayout.tsx` — Agregar nav item "Comisiones"
- Finanzas pages — Actualizar lógica de pricing con pilotos

Context nuevo: `JefeVentasContext.tsx` que verifica rol `jefe_ventas` en `backoffice_members`.

---

## Funcionalidades extra para facilitar la gestión

1. **Alertas de inactividad**: leads sin actualizar >48h destacados en rojo
2. **Resumen semanal**: card con cierres de la semana vs meta
3. **Vista rápida de vendedor**: click en vendedor → sheet con sus leads, actividad reciente, comisiones
4. **Cambio de contraseña**: en perfil del jefe de ventas con `supabase.auth.updateUser`
