import { Link, NavLink } from 'react-router-dom';
import { LoginArea } from '@/components/auth/LoginArea';
import { SearchBar } from '@/components/SearchBar';
import { cn } from '@/lib/utils';

interface LayoutProps {
  children: React.ReactNode;
  /** Optional sidebar content rendered to the right of the main column on large screens. */
  sidebar?: React.ReactNode;
  /** Constrain the main content width. Defaults to a comfortable reading width. */
  className?: string;
  /**
   * App-style full-bleed mode: the main area fills exactly the space below the
   * sticky header with no container, padding, or footer. Used for full-height
   * experiences like chat. `children` becomes the sole flex child of `<main>`.
   */
  fullBleed?: boolean;
}

const NAV_ITEMS = [
  { to: '/', label: 'NIPs', end: true },
  { to: '/stats', label: 'Stats' },
  { to: '/chat', label: 'Chat' },
];

function Logo() {
  return (
    <Link
      to="/"
      className="group flex items-center gap-2.5 font-display font-semibold text-lg tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
    >
      <span
        className="grid size-9 place-items-center text-2xl leading-none transition-transform duration-500 group-hover:rotate-[12deg] group-hover:scale-110 drop-shadow-[0_0_10px_hsl(264_90%_72%/0.55)]"
        aria-hidden="true"
      >
        🍄
      </span>
      <span>
        Nostr<span className="text-cosmic">Hub</span>
      </span>
    </Link>
  );
}

export function Layout({ children, sidebar, className, fullBleed = false }: LayoutProps) {
  return (
    <div className={cn('flex flex-col bg-background text-foreground', fullBleed ? 'h-screen' : 'min-h-screen')}>
      <header className="sticky top-0 z-40 border-b border-primary/15 bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/50">
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
                    'relative rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    'hover:bg-accent/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    'after:absolute after:inset-x-3 after:-bottom-px after:h-px after:rounded-full after:bg-gradient-to-r after:from-primary after:to-nebula after:opacity-0 after:transition-opacity',
                    isActive ? 'text-foreground after:opacity-100' : 'text-muted-foreground',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <SearchBar className="hidden sm:block w-40 md:w-56 lg:w-64" />
            <LoginArea className="max-w-60" />
          </div>
        </div>

        {/* Mobile search */}
        <div className="border-t border-primary/15 px-4 py-2 sm:hidden">
          <SearchBar />
        </div>

        {/* Mobile nav */}
        <nav
          className="md:hidden flex items-center gap-1 overflow-x-auto border-t border-primary/15 px-4 py-2"
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
                    ? 'bg-gradient-to-r from-primary/20 to-nebula/20 text-foreground'
                    : 'text-muted-foreground hover:bg-accent/10',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      {fullBleed ? (
        <main className={cn('min-h-0 flex-1', className)}>{children}</main>
      ) : (
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
      )}

      {!fullBleed && (
        <footer className="border-t border-primary/15 py-6">
          <div className="container mx-auto flex flex-col items-center justify-between gap-2 px-4 text-sm text-muted-foreground sm:flex-row sm:px-6">
            <p className="flex items-center gap-1.5">
              <span className="inline-block size-1.5 rounded-full bg-nebula shadow-[0_0_8px] shadow-nebula/70" aria-hidden="true" />
              Build the Nostr protocol together.
            </p>
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
      )}
    </div>
  );
}

export default Layout;
