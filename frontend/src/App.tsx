import { Suspense, lazy } from "react";
import { Route, Routes } from "react-router-dom";
import { PageSpinner } from "./components/ui";
import { AppLayout } from "./layouts/AppLayout";
import { PublicLayout } from "./layouts/PublicLayout";
import { UserGuard } from "./lib/session";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import Pricing from "./pages/Pricing";
import Register from "./pages/Register";
import Accounts from "./pages/user/Accounts";
import Dashboard from "./pages/user/Dashboard";
import Keywords from "./pages/user/Keywords";
import PlanPage from "./pages/user/Plan";

// The admin console is a separate chunk: normal visitors never download it.
const AdminApp = lazy(() => import("./pages/admin/AdminApp"));

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<Landing />} />
        <Route path="pricing" element={<Pricing />} />
      </Route>
      <Route path="login" element={<Login />} />
      <Route path="register" element={<Register />} />
      <Route path="app" element={<UserGuard><AppLayout /></UserGuard>}>
        <Route index element={<Dashboard />} />
        <Route path="accounts" element={<Accounts />} />
        <Route path="keywords" element={<Keywords />} />
        <Route path="plan" element={<PlanPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
      <Route path="admin-panel/*" element={<Suspense fallback={<PageSpinner />}><AdminApp /></Suspense>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
