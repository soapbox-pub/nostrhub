import { Link, NavLink } from 'react-router-dom';
import { Moon, Sun, Plus, Settings } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { LoginArea } from '@/components/auth/LoginArea';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface LayoutProps {
  children: React.ReactNode;
  /** Optional sidebar content rendered to the right of the main column on large screens. */
  sidebar?: React.ReactNode;
  /** Constrain the main content width. Defaults to a comfortable reading width. */
  className?: string;
}

const NAV_ITEMS = [
  { to: '/', label: 'NIPs', end: true },
  { to: '/stats', label: 'Stats' },
  { to: '/community', label: 'Community' },
];

function Logo() {
  return (
    <Link
      to="/"
      className="flex items-center gap-2 font-semibold text-lg tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
    >
      <span>
        Nostr<span className="text-primary">Hub</span>
      </span>
    </Link>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}

export function Layout({ children, sidebar, className }: LayoutProps) {
  const { user } = useCurrentUser();

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center gap-4 px-4 sm:px-6">
          <Logo />

          <nav className="hidden md:flex items-center gap-1 ml-2" aria-label="Primary">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    'hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isActive ? 'text-foreground' : 'text-muted-foreground',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {user && (
              <Button asChild size="sm" className="hidden sm:inline-flex gap-1.5 rounded-full">
                <Link to="/create">
                  <Plus className="size-4" />
                  New NIP
                </Link>
              </Button>
            )}
            <ThemeToggle />
            <Button asChild variant="ghost" size="icon" aria-label="Settings">
              <Link to="/settings">
                <Settings className="size-4" />
              </Link>
            </Button>
            <LoginArea className="max-w-60" />
          </div>
        </div>

        {/* Mobile nav */}
        <nav
          className="md:hidden flex items-center gap-1 overflow-x-auto border-t border-border/60 px-4 py-2"
          aria-label="Primary mobile"
        >
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/60',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="container mx-auto flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {sidebar ? (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
            <div className={cn('min-w-0', className)}>{children}</div>
            <aside className="hidden lg:block">
              <div className="sticky top-24 space-y-6">{sidebar}</div>
            </aside>
          </div>
        ) : (
          <div className={cn('mx-auto w-full max-w-4xl', className)}>{children}</div>
        )}
      </main>

      <footer className="border-t border-border/60 py-6">
        <div className="container mx-auto flex flex-col items-center justify-between gap-2 px-4 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <p>Build the Nostr protocol together.</p>
          <p>
            Vibed with{' '}
            <a
              href="https://soapbox.pub/mkstack"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground hover:text-primary"
            >
              MKStack
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}

export default Layout;
