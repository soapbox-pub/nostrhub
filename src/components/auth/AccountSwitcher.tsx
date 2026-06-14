import { Bell, ChevronDown, LogOut, Monitor, Moon, Settings, Sun, User, UserPlus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.tsx';
import { Skeleton } from '@/components/ui/skeleton.tsx';
import { UserAvatar } from '@/components/UserAvatar';
import { NotificationDot } from '@/components/NotificationDot';
import { DittoIcon } from '@/components/icons/DittoIcon';
import { useLoggedInAccounts, type Account } from '@/hooks/useLoggedInAccounts';
import { useTheme } from '@/hooks/useTheme';
import { useActiveProfileTheme } from '@/hooks/useActiveProfileTheme';
import { useHasUnreadNotifications } from '@/hooks/useHasUnreadNotifications';
import { type Theme } from '@/contexts/AppContext';

interface AccountSwitcherProps {
  onAddAccountClick: () => void;
}

export function AccountSwitcher({ onAddAccountClick }: AccountSwitcherProps) {
  const { currentUser, otherUsers, isLoading, setLogin, removeLogin } = useLoggedInAccounts();
  const { theme, setTheme } = useTheme();
  const { hasDittoTheme } = useActiveProfileTheme();
  const hasUnreadNotifications = useHasUnreadNotifications();

  if (!currentUser) return null;

  const getDisplayName = (account: Account): string => {
    return account.metadata.name ?? 'Anonymous';
  }

  // While the metadata query is in-flight and we don't yet have a name,
  // we don't want to flash a generated animal name / its first letter.
  const isCurrentUserPending = isLoading && !currentUser.metadata.name;

  const npub = nip19.npubEncode(currentUser.pubkey);

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button className='relative flex items-center gap-2 h-10 p-1 pr-2.5 rounded-full hover:bg-accent transition-all text-foreground'>
          {isCurrentUserPending ? (
            <Skeleton className='w-8 h-8 rounded-full' />
          ) : (
            <UserAvatar pubkey={currentUser.pubkey} />
          )}
          <ChevronDown className='w-4 h-4 text-muted-foreground' />
          <NotificationDot show={hasUnreadNotifications} className='top-0.5 left-7' />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className='w-56 p-2 animate-scale-in'>
        <div className='px-2 pb-1.5'>
          <span className='text-xs font-medium text-muted-foreground'>Theme</span>
          <Select value={theme} onValueChange={(v) => setTheme(v as Theme)}>
            <SelectTrigger className='mt-1 h-9 w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='light'>
                <span className='flex items-center gap-2'>
                  <Sun className='w-4 h-4' /> Light
                </span>
              </SelectItem>
              <SelectItem value='dark'>
                <span className='flex items-center gap-2'>
                  <Moon className='w-4 h-4' /> Dark
                </span>
              </SelectItem>
              <SelectItem value='system'>
                <span className='flex items-center gap-2'>
                  <Monitor className='w-4 h-4' /> System
                </span>
              </SelectItem>
              {hasDittoTheme && (
                <SelectItem value='ditto'>
                  <span className='flex items-center gap-2'>
                    <DittoIcon className='w-4 h-4' /> Ditto
                  </span>
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className='flex items-center gap-2 cursor-pointer p-2 rounded-md'>
          <Link to='/notifications'>
            <Bell className='w-4 h-4' />
            <span className='flex-1'>Notifications</span>
            {hasUnreadNotifications && (
              <span className='w-2 h-2 rounded-full bg-primary shrink-0' aria-hidden='true' />
            )}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className='flex items-center gap-2 cursor-pointer p-2 rounded-md'>
          <Link to={`/${npub}`}>
            <User className='w-4 h-4' />
            <span>My Profile</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className='flex items-center gap-2 cursor-pointer p-2 rounded-md'>
          <Link to='/settings'>
            <Settings className='w-4 h-4' />
            <span>Settings</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {otherUsers.length > 0 && (
          <>
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
          </>
        )}
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
