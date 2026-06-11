import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';

export function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <header className="sticky top-0 z-50 bg-canvas border-b border-hairline">
      <div className="max-w-7xl mx-auto px-margin-mobile md:px-margin-desktop h-16 flex items-center justify-between gap-xl">
        <div className="flex items-center gap-xl">
          <Link
            to="/"
            className="font-headline-lg text-headline-lg font-black text-primary tracking-tighter"
          >
            Auth Service
          </Link>
          <nav className="hidden md:flex items-center gap-lg h-full">
            <Link
              to="/"
              className="font-body-strong text-body-strong text-mute hover:text-ink transition-colors"
            >
              Mon profil
            </Link>
            {user?.isAdmin && (
              <Link
                to="/admin/users"
                className="font-body-strong text-body-strong text-mute hover:text-ink transition-colors"
              >
                Utilisateurs
              </Link>
            )}
            {user?.isAdmin && (
              <Link
                to="/admin/clients"
                className="font-body-strong text-body-strong text-mute hover:text-ink transition-colors"
              >
                Applications
              </Link>
            )}
          </nav>
        </div>
        {user && (
          <div className="flex items-center gap-md">
            <span className="hidden sm:inline font-caption text-caption text-mute">{user.email}</span>
            <img
              src={user.avatarUrl}
              alt={user.name}
              className="w-8 h-8 rounded-full bg-surface-variant object-cover"
            />
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="p-sm text-mute hover:text-ink transition-colors"
              title="Deconnexion"
            >
              <span className="material-symbols-outlined">logout</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
