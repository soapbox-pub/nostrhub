import { Check, ChevronDown, Code2, Copy } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type GitRepoAnnouncement } from '@/lib/git';
import { useNostrCloneUri } from '@/hooks/useNostrCloneUri';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/** Compact GitHub-style URL row: mono text + copy icon, single click target. */
function UrlRow({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable — fail quietly.
    }
  }, [value]);

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? 'Copied' : label}
      title={value}
      className="flex w-full items-center gap-2 rounded-md border border-border/60 bg-muted/50 px-2.5 py-1.5 text-left transition-colors hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <code className="min-w-0 flex-1 truncate font-mono text-xs">{value}</code>
      {copied ? (
        <Check className="size-3.5 shrink-0 text-chart-5" aria-hidden="true" />
      ) : (
        <Copy className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
    </button>
  );
}

/**
 * GitHub-style "Code" button: clone URLs live in a popover, out of the way
 * until needed. Nostr URI first; HTTPS mirrors behind a tab.
 */
export function CloneButton({ repo }: { repo: GitRepoAnnouncement }) {
  const cloneUri = useNostrCloneUri(repo.pubkey, repo.identifier);
  const hasHttps = repo.cloneUrls.length > 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Code2 className="size-4" aria-hidden="true" />
          Code
          <ChevronDown className="size-3.5 opacity-70" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        <Tabs defaultValue="nostr">
          {hasHttps && (
            <TabsList className="mb-2 h-8 w-full">
              <TabsTrigger value="nostr" className="text-xs">
                Nostr
              </TabsTrigger>
              <TabsTrigger value="https" className="text-xs">
                HTTPS
              </TabsTrigger>
            </TabsList>
          )}
          <TabsContent value="nostr" className="space-y-2">
            <UrlRow value={cloneUri} label="Copy nostr clone URI" />
            <p className="text-xs text-muted-foreground">
              Requires{' '}
              <a
                href="https://gitworkshop.dev/ngit"
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-dotted underline-offset-2 hover:text-foreground"
              >
                ngit
              </a>
              .
            </p>
          </TabsContent>
          {hasHttps && (
            <TabsContent value="https" className="space-y-2">
              {repo.cloneUrls.map((url) => (
                <UrlRow key={url} value={url} label={`Copy clone URL for ${new URL(url).hostname}`} />
              ))}
            </TabsContent>
          )}
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}

export default CloneButton;
