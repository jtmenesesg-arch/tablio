import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "./contexts/ThemeContext";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import NotFound from "./pages/NotFound";
import RestaurantSplash from "./pages/RestaurantSplash";
import MenuPage from "./pages/MenuPage";
import ItemDetailPage from "./pages/ItemDetailPage";
import CartPage from "./pages/CartPage";
import ConfirmPage from "./pages/ConfirmPage";
import TrackingPage from "./pages/TrackingPage";
import BillPage from "./pages/BillPage";
import KDSPage from "./pages/KDSPage";
import { AdminProvider } from "./contexts/AdminContext";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminGuard from "./pages/admin/AdminGuard";
import UnifiedLoginPage from "./pages/UnifiedLoginPage";
import MozoJoinPage from "./pages/mozo/MozoJoinPage";
import MesasPage from "./pages/admin/MesasPage";
import MenuAdminPage from "./pages/admin/MenuAdminPage";
import QRPage from "./pages/admin/QRPage";
import SucursalPage from "./pages/admin/SucursalPage";
import EquipoPage from "./pages/admin/EquipoPage";
import PedidosPage from "./pages/admin/PedidosPage";
import ReportesPage from "./pages/admin/ReportesPage";
import SoportePage from "./pages/admin/SoportePage";
import { WaitersProvider } from "./contexts/WaitersContext";
import MozoLoginPage from "./pages/mozo/MozoLoginPage";
import MozoLayout from "./pages/mozo/MozoLayout";
import MozoMesasPage from "./pages/mozo/MozoMesasPage";
import MozoNotificacionesPage from "./pages/mozo/MozoNotificacionesPage";
import MozoPerfilPage from "./pages/mozo/MozoPerfilPage";
import MozoPedidoManualPage from "./pages/mozo/MozoPedidoManualPage";
import { SuperAdminProvider } from "./contexts/SuperAdminContext";
import SuperAdminLayout from "./pages/superadmin/SuperAdminLayout";
import SATenantsPage from "./pages/superadmin/SATenantsPage";
import SAMetricsPage from "./pages/superadmin/SAMetricsPage";
import SAFlagsPage from "./pages/superadmin/SAFlagsPage";
import SAConfigPage from "./pages/superadmin/SAConfigPage";
import SAEquipoPage from "./pages/superadmin/SAEquipoPage";
import ForgotPasswordPage from "./pages/admin/ForgotPasswordPage";
import ResetPasswordPage from "./pages/admin/ResetPasswordPage";
import BackofficeJoinPage from "./pages/backoffice/BackofficeJoinPage";
import { SellerProvider } from "./contexts/SellerContext";
import SellerLayout from "./pages/seller/SellerLayout";
import SellerMiDiaPage from "./pages/seller/SellerMiDiaPage";
import SellerRegistroPage from "./pages/seller/SellerRegistroPage";
import SellerPipelinePage from "./pages/seller/SellerPipelinePage";
import SellerNumerosPage from "./pages/seller/SellerNumerosPage";
import SellerRecursosPage from "./pages/seller/SellerRecursosPage";
import FinanzasLayout from "./pages/finanzas/FinanzasLayout";
import FinanzasRevenuePage from "./pages/finanzas/FinanzasRevenuePage";
import FinanzasClientesPage from "./pages/finanzas/FinanzasClientesPage";
import FinanzasChurnPage from "./pages/finanzas/FinanzasChurnPage";
import FinanzasCostosPage from "./pages/finanzas/FinanzasCostosPage";
import { JefeVentasProvider } from "./contexts/JefeVentasContext";
import JefeVentasLayout from "./pages/jefe-ventas/JefeVentasLayout";
import JVDashboardPage from "./pages/jefe-ventas/JVDashboardPage";
import JVEquipoPage from "./pages/jefe-ventas/JVEquipoPage";
import JVComisionesPage from "./pages/jefe-ventas/JVComisionesPage";
import JVPipelinePage from "./pages/jefe-ventas/JVPipelinePage";
import JVPerfilPage from "./pages/jefe-ventas/JVPerfilPage";
import SellerComisionesPage from "./pages/seller/SellerComisionesPage";

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<UnifiedLoginPage />} />
          {/* Unified login */}
          <Route path="/login" element={<UnifiedLoginPage />} />
          <Route path="/admin/login" element={<UnifiedLoginPage />} />
          <Route path="/admin/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          {/* Admin with slug (protected) */}
          <Route path="/admin/:slug" element={<AdminProvider><AdminLayout /></AdminProvider>}>
            <Route element={<AdminGuard />}>
              <Route index element={<Navigate to="mesas" replace />} />
              <Route path="mesas" element={<MesasPage />} />
              <Route path="menu" element={<MenuAdminPage />} />
              <Route path="equipo" element={<EquipoPage />} />
              <Route path="qr" element={<QRPage />} />
              <Route path="sucursal" element={<SucursalPage />} />
              <Route path="pedidos" element={<PedidosPage />} />
              <Route path="reportes" element={<ReportesPage />} />
              <Route path="soporte" element={<SoportePage />} />
            </Route>
          </Route>
          <Route path="/:slug" element={<RestaurantSplash />} />
          <Route path="/:slug/menu" element={<MenuPage />} />
          <Route path="/:slug/item/:id" element={<ItemDetailPage />} />
          <Route path="/:slug/cart" element={<CartPage />} />
          <Route path="/:slug/confirm" element={<ConfirmPage />} />
          <Route path="/:slug/tracking" element={<TrackingPage />} />
          <Route path="/:slug/bill" element={<BillPage />} />
          <Route path="/kds" element={<KDSPage />} />
          {/* Mozo */}
          <Route path="/mozo/join/:token" element={<MozoJoinPage />} />
          <Route path="/mozo/login" element={<WaitersProvider><MozoLoginPage /></WaitersProvider>} />
          <Route path="/mozo" element={<WaitersProvider><MozoLayout /></WaitersProvider>}>
            <Route index element={<Navigate to="/mozo/mesas" replace />} />
            <Route path="mesas" element={<MozoMesasPage />} />
            <Route path="notificaciones" element={<MozoNotificacionesPage />} />
            <Route path="perfil" element={<MozoPerfilPage />} />
            <Route path="pedido-manual/:tableId" element={<MozoPedidoManualPage />} />
          </Route>
          {/* Superadmin */}
          <Route path="/superadmin" element={<SuperAdminProvider><SuperAdminLayout /></SuperAdminProvider>}>
            <Route index element={<Navigate to="/superadmin/tenants" replace />} />
            <Route path="tenants" element={<SATenantsPage />} />
            <Route path="equipo" element={<SAEquipoPage />} />
            <Route path="metricas" element={<SAMetricsPage />} />
            <Route path="flags" element={<SAFlagsPage />} />
            <Route path="config" element={<SAConfigPage />} />
          </Route>
          {/* Backoffice join (kept for invitation links) */}
          <Route path="/backoffice/join/:token" element={<BackofficeJoinPage />} />
          {/* Redirect old backoffice routes to jefe-ventas */}
          <Route path="/backoffice" element={<Navigate to="/jefe-ventas/dashboard" replace />} />
          <Route path="/backoffice/*" element={<Navigate to="/jefe-ventas/dashboard" replace />} />
          {/* Seller panel - mobile-first */}
          <Route path="/vendedor" element={<SellerProvider><SellerLayout /></SellerProvider>}>
            <Route index element={<Navigate to="/vendedor/mi-dia" replace />} />
            <Route path="mi-dia" element={<SellerMiDiaPage />} />
            <Route path="registro" element={<SellerRegistroPage />} />
            <Route path="pipeline" element={<SellerPipelinePage />} />
            <Route path="comisiones" element={<SellerComisionesPage />} />
            <Route path="numeros" element={<SellerNumerosPage />} />
            <Route path="recursos" element={<SellerRecursosPage />} />
          </Route>
          {/* Jefe de Ventas panel */}
          <Route path="/jefe-ventas" element={<JefeVentasProvider><JefeVentasLayout /></JefeVentasProvider>}>
            <Route index element={<Navigate to="/jefe-ventas/dashboard" replace />} />
            <Route path="dashboard" element={<JVDashboardPage />} />
            <Route path="equipo" element={<JVEquipoPage />} />
            <Route path="comisiones" element={<JVComisionesPage />} />
            <Route path="pipeline" element={<JVPipelinePage />} />
            <Route path="perfil" element={<JVPerfilPage />} />
          </Route>
          {/* Finance panel */}
          <Route path="/finanzas" element={<FinanzasLayout />}>
            <Route index element={<Navigate to="/finanzas/revenue" replace />} />
            <Route path="revenue" element={<FinanzasRevenuePage />} />
            <Route path="clientes" element={<FinanzasClientesPage />} />
            <Route path="churn" element={<FinanzasChurnPage />} />
            <Route path="costos" element={<FinanzasCostosPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </ThemeProvider>
);

export default App;
