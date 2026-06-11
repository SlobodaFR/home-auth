import { Route, Routes } from 'react-router-dom';
import { RequireAdmin } from './auth/RequireAdmin';
import { RequireAuth } from './auth/RequireAuth';
import { Header } from './components/Header';
import { AdminClientsPage } from './pages/AdminClientsPage';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { AuthCallbackPage } from './pages/AuthCallbackPage';
import { LoginPage } from './pages/LoginPage';
import { ProfilePage } from './pages/ProfilePage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <div className="text-ink min-h-screen">
              <Header />
              <ProfilePage />
            </div>
          </RequireAuth>
        }
      />
      <Route
        path="/admin/users"
        element={
          <RequireAdmin>
            <div className="text-ink min-h-screen">
              <Header />
              <AdminUsersPage />
            </div>
          </RequireAdmin>
        }
      />
      <Route
        path="/admin/clients"
        element={
          <RequireAdmin>
            <div className="text-ink min-h-screen">
              <Header />
              <AdminClientsPage />
            </div>
          </RequireAdmin>
        }
      />
    </Routes>
  );
}
