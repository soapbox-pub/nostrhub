import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { LoginArea } from '@/components/auth/LoginArea';
import { SearchBar } from '@/components/SearchBar';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
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

/** Primary destinations shown in the top header nav. */
const NAV_ITEMS = [
  { to: '/nips', label: 'NIPs' },
  { to: '/apps', label: 'Apps' },
];

/** Secondary destinations surfaced in the footer to keep the header uncluttered. */
const FOOTER_NAV_ITEMS = [
  { to: '/repos', label: 'Repos' },
  { to: '/articles', label: 'Articles' },
  { to: '/chat', label: 'Chat' },
  { to: '/stats', label: 'Stats' },
  { to: '/experts', label: 'Experts' },
];

function Logo({ onClick }: { onClick?: () => void }) {
  return (
    <Link
      to="/"
      onClick={onClick}
      className="group flex items-center gap-2.5 font-display font-semibold text-lg tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
    >
      <img
        src="/icon-192.png"
        alt=""
        width={36}
        height={36}
        className="size-9 object-contain transition-transform duration-500 group-hover:rotate-[12deg] group-hover:scale-110 drop-shadow-[0_0_10px_hsl(0_80%_62%/0.55)]"
        aria-hidden="true"
      />
      <span>
        Nostr<span className="text-cosmic">Hub</span>
      </span>
    </Link>
  );
}

export function Layout({ children, sidebar, className, fullBleed = false }: LayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className={cn('flex flex-col text-foreground', fullBleed ? 'h-screen' : 'min-h-screen')}>
      <header className="sticky top-0 z-40 border-b border-primary/15 bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/50">
        <div className="container mx-auto max-w-6xl flex h-16 items-center gap-4 px-4 sm:px-6">
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden -ml-2 shrink-0"
                aria-label="Open menu"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 gap-0 p-0">
              <SheetHeader className="border-b border-primary/15 p-4">
                <SheetTitle asChild>
                  <Logo onClick={() => setMobileMenuOpen(false)} />
                </SheetTitle>
              </SheetHeader>

              <div className="border-b border-primary/15 p-4">
                <SearchBar />
              </div>

              <nav className="flex flex-col gap-1 p-4" aria-label="Primary mobile">
                {[...NAV_ITEMS, ...FOOTER_NAV_ITEMS].map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'rounded-md px-3 py-2.5 text-base font-medium transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        isActive
                          ? 'bg-gradient-to-r from-primary/20 to-nebula/20 text-foreground'
                          : 'text-muted-foreground hover:bg-accent/10 hover:text-foreground',
                      )
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </SheetContent>
          </Sheet>

          <Logo />

          <nav className="hidden md:flex items-center gap-1 ml-2" aria-label="Primary">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
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
      </header>

      {fullBleed ? (
        <main className={cn('min-h-0 flex-1', className)}>{children}</main>
      ) : (
        <main className="container mx-auto max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          {sidebar ? (
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
              <div className={cn('min-w-0', className)}>
                {children}
                <SiteFooter />
              </div>
              <aside className="hidden lg:block">
                <div className="sticky top-24 space-y-6">{sidebar}</div>
              </aside>
            </div>
          ) : (
            <div className={cn('mx-auto w-full max-w-4xl', className)}>
              {children}
              <SiteFooter />
            </div>
          )}
        </main>
      )}
    </div>
  );
}

/** Editorial footer rendered once at the bottom of the content column. */
function SiteFooter() {
  return (
    <footer className="mt-16 overflow-hidden rounded-xl border border-primary/15 bg-gradient-to-b from-muted/40 to-muted/10 backdrop-blur-sm">
      <nav
        className="flex flex-wrap items-center gap-1 border-b border-border/50 px-5 py-3"
        aria-label="Secondary"
      >
        {FOOTER_NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                'hover:bg-accent/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isActive ? 'text-foreground' : 'text-muted-foreground',
              )
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-5">
        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className="h-9 w-20 text-foreground/70 bg-[repeating-linear-gradient(90deg,currentColor_0,currentColor_2px,transparent_2px,transparent_5px)]"
          />
          <div className="font-mono text-[10px] uppercase leading-tight text-muted-foreground">
            <p className="flex items-center gap-1.5">
              <span className="inline-block size-1 rounded-full bg-nebula shadow-[0_0_8px] shadow-nebula/70" aria-hidden="true" />
              Build the Nostr protocol together
            </p>
            <p>Display until the heat death of the universe</p>
          </div>
        </div>
        <p className="font-mono text-[10px] uppercase text-muted-foreground">
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
  );
}

export default Layout;
