import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';

const NAV_LINKS = [
  { to: '/', label: 'Mon profil', adminOnly: false },
  { to: '/admin/users', label: 'Utilisateurs', adminOnly: true },
  { to: '/admin/clients', label: 'Applications', adminOnly: true },
];

function navLinkClass({ isActive }: { isActive: boolean }) {
  return `font-body-strong text-body-strong transition-colors ${
    isActive ? 'text-ink' : 'text-mute hover:text-ink'
  }`;
}

export function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const links = NAV_LINKS.filter((link) => !link.adminOnly || user?.isAdmin);
  const renderLink = (link: (typeof NAV_LINKS)[number]) => (
    <NavLink
      key={link.to}
      to={link.to}
      end={link.to === '/'}
      className={navLinkClass}
    >
      {link.label}
    </NavLink>
  );

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
          <nav
            aria-label="Navigation principale"
            className="hidden md:flex items-center gap-lg h-full"
          >
            {links.map(renderLink)}
          </nav>
        </div>
        {user && (
          <div className="flex items-center gap-md">
            <span className="hidden sm:inline font-caption text-caption text-mute">
              {user.email}
            </span>
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
      {links.length > 1 && (
        <nav
          aria-label="Navigation principale"
          className="md:hidden flex items-center gap-lg h-12 px-margin-mobile overflow-x-auto whitespace-nowrap border-t border-hairline"
        >
          {links.map(renderLink)}
        </nav>
      )}
    </header>
  );
}
