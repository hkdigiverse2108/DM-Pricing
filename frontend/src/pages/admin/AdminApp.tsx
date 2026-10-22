import { Route, Routes } from "react-router-dom";
import { AdminLayout } from "../../layouts/AdminLayout";
import { AdminAuthProvider, AdminGuard } from "../../lib/session";
import NotFound from "../NotFound";
import AdminLogin from "./AdminLogin";
import Addons from "./Addons";
import Overview from "./Overview";
import Plans from "./Plans";
import SettingsPage from "./SettingsPage";
import UsersPage from "./UsersPage";

export default function AdminApp() {
  return (
    <AdminAuthProvider>
      <Routes>
        <Route path="login" element={<AdminLogin />} />
        <Route element={<AdminGuard><AdminLayout /></AdminGuard>}>
          <Route index element={<Overview />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="plans" element={<Plans />} />
          <Route path="addons" element={<Addons />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AdminAuthProvider>
  );
}
