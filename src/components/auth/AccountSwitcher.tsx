import { ChevronDown, LogOut, Monitor, Moon, Palette, Settings, Sun, UserPlus, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx';
import { Skeleton } from '@/components/ui/skeleton.tsx';
import { UserAvatar } from '@/components/UserAvatar';
import { useLoggedInAccounts, type Account } from '@/hooks/useLoggedInAccounts';
import { useTheme } from '@/hooks/useTheme';
import { type Theme } from '@/contexts/AppContext';
import { themePresets, type ThemePreset } from '@/themes';

interface AccountSwitcherProps {
  onAddAccountClick: () => void;
}

const MODE_ITEMS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export function AccountSwitcher({ onAddAccountClick }: AccountSwitcherProps) {
  const { currentUser, otherUsers, isLoading, setLogin, removeLogin } = useLoggedInAccounts();
  const { theme, customTheme, setTheme, applyCustomTheme } = useTheme();

  if (!currentUser) return null;

  const getDisplayName = (account: Account): string => {
    return account.metadata.name ?? 'Anonymous';
  }

  const featuredPresets = Object.entries(themePresets).filter(([, p]) => p.featured);

  const applyPreset = (preset: ThemePreset) => {
    applyCustomTheme({
      title: preset.label,
      colors: preset.colors,
      ...(preset.font && { font: preset.font }),
      ...(preset.titleFont && { titleFont: preset.titleFont }),
      ...(preset.background && { background: preset.background }),
    });
  };

  const activePresetKey =
    theme === 'custom' && customTheme
      ? Object.entries(themePresets).find(
          ([, p]) => JSON.stringify(p.colors) === JSON.stringify(customTheme.colors),
        )?.[0]
      : undefined;

  // While the metadata query is in-flight and we don't yet have a name,
  // we don't want to flash a generated animal name / its first letter.
  const isCurrentUserPending = isLoading && !currentUser.metadata.name;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button className='flex items-center gap-2 h-10 p-1 pr-2.5 rounded-full hover:bg-accent transition-all text-foreground'>
          {isCurrentUserPending ? (
            <Skeleton className='w-8 h-8 rounded-full' />
          ) : (
            <UserAvatar pubkey={currentUser.pubkey} />
          )}
          <ChevronDown className='w-4 h-4 text-muted-foreground' />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className='w-56 p-2 animate-scale-in'>
        <div className='font-medium text-sm px-2 py-1.5'>Switch Account</div>
        {otherUsers.map((user) => {
          const isPending = isLoading && !user.metadata.name;
          return (
            <DropdownMenuItem
              key={user.id}
              onClick={() => setLogin(user.id)}
              className='flex items-center gap-2 cursor-pointer p-2 rounded-md'
            >
              {isPending ? (
                <Skeleton className='w-8 h-8 rounded-full' />
              ) : (
                <UserAvatar pubkey={user.pubkey} />
              )}
              <div className='flex-1 truncate'>
                {isPending ? (
                  <Skeleton className='h-4 w-24' />
                ) : (
                  <p className='text-sm font-medium'>{getDisplayName(user)}</p>
                )}
              </div>
              {user.id === currentUser.id && <div className='w-2 h-2 rounded-full bg-primary'></div>}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className='flex items-center gap-2 p-2 rounded-md'>
            <Palette className='w-4 h-4 text-muted-foreground' />
            <span>Theme</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className='w-48 p-1'>
            {MODE_ITEMS.map(({ value, label, icon: Icon }) => (
              <DropdownMenuItem
                key={value}
                onClick={() => setTheme(value)}
                className='flex items-center gap-2 cursor-pointer p-2 rounded-md'
              >
                <Icon className='w-4 h-4 text-muted-foreground' />
                <span className='flex-1'>{label}</span>
                {theme === value && <Check className='w-4 h-4 text-primary' />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            {featuredPresets.map(([key, preset]) => (
              <DropdownMenuItem
                key={key}
                onClick={() => applyPreset(preset)}
                className='flex items-center gap-2 cursor-pointer p-2 rounded-md'
              >
                <span aria-hidden className='text-base leading-none'>{preset.emoji}</span>
                <span className='flex overflow-hidden rounded-full ring-1 ring-border'>
                  {(['background', 'primary', 'text'] as const).map((role) => (
                    <span
                      key={role}
                      className='size-3'
                      style={{ background: `hsl(${preset.colors[role]})` }}
                    />
                  ))}
                </span>
                <span className='flex-1 truncate'>{preset.label}</span>
                {activePresetKey === key && <Check className='w-4 h-4 text-primary' />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className='cursor-pointer p-2 rounded-md text-muted-foreground'>
              <Link to='/settings'>More in Settings…</Link>
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem asChild className='flex items-center gap-2 cursor-pointer p-2 rounded-md'>
          <Link to='/settings'>
            <Settings className='w-4 h-4' />
            <span>Settings</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={onAddAccountClick}
          className='flex items-center gap-2 cursor-pointer p-2 rounded-md'
        >
          <UserPlus className='w-4 h-4' />
          <span>Add another account</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => removeLogin(currentUser.id)}
          className='flex items-center gap-2 cursor-pointer p-2 rounded-md text-red-500'
        >
          <LogOut className='w-4 h-4' />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
