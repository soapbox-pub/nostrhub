import { Check, Link2, Share2 } from 'lucide-react';
import { useState } from 'react';
import { useAuthor } from '@/hooks/useAuthor';
import { useNip05Verify } from '@/hooks/useNip05Verify';
import { useToast } from '@/hooks/useToast';
import { getRepoUrl, repoNaddr, type GitRepoAnnouncement } from '@/lib/git';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** Prefix a root-relative path with the current origin for a shareable link. */
function absolute(path: string): string {
  if (typeof window === 'undefined') return path;
  return `${window.location.origin}${path}`;
}

interface ShareRepoMenuProps {
  repo: GitRepoAnnouncement;
  className?: string;
}

/**
 * Dropdown to copy a shareable link to the repository in two formats:
 * a human-readable `/{owner}/{repo}` link (using the owner's verified NIP-05
 * when available) and a relay-portable `/{naddr}` link.
 */
export function ShareRepoMenu({ repo, className }: ShareRepoMenuProps) {
  const { toast } = useToast();
  const author = useAuthor(repo.pubkey);
  const nip05 = author.data?.metadata?.nip05;
  const { data: nip05Verified } = useNip05Verify(nip05, repo.pubkey);
  const [copied, setCopied] = useState<'pretty' | 'naddr' | null>(null);

  const prettyUrl = absolute(
    getRepoUrl(repo.pubkey, repo.identifier, nip05, nip05Verified === true),
  );
  const naddrUrl = absolute(`/${repoNaddr(repo.pubkey, repo.identifier, repo.relays)}`);

  const copy = async (value: string, kind: 'pretty' | 'naddr', label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
      toast({ title: `${label} copied to clipboard` });
    } catch {
      toast({ title: 'Could not copy link', variant: 'destructive' });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={className ?? 'size-8 text-muted-foreground hover:text-foreground'}
          aria-label="Share repository"
        >
          <Share2 className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(20rem,calc(100vw-2rem))]">
        <DropdownMenuLabel>Copy share link</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => copy(prettyUrl, 'pretty', 'Share link')}>
          {copied === 'pretty' ? (
            <Check className="size-4 shrink-0 text-chart-5" aria-hidden="true" />
          ) : (
            <Link2 className="size-4 shrink-0" aria-hidden="true" />
          )}
          <div className="flex min-w-0 flex-col">
            <span>
              Readable link{' '}
              <span className="text-xs font-normal text-muted-foreground">· NIP-05 / npub</span>
            </span>
            <span className="truncate text-xs text-muted-foreground/70">
              {prettyUrl.replace(/^https?:\/\//, '')}
            </span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => copy(naddrUrl, 'naddr', 'naddr link')}>
          {copied === 'naddr' ? (
            <Check className="size-4 shrink-0 text-chart-5" aria-hidden="true" />
          ) : (
            <Link2 className="size-4 shrink-0" aria-hidden="true" />
          )}
          <div className="flex min-w-0 flex-col">
            <span>
              naddr link{' '}
              <span className="text-xs font-normal text-muted-foreground">· relay-portable</span>
            </span>
            <span className="truncate text-xs text-muted-foreground/70">
              {naddrUrl.replace(/^https?:\/\//, '')}
            </span>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default ShareRepoMenu;
