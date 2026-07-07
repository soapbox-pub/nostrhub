import { useState } from 'react';
import { Check, Copy, FileText, MoreHorizontal } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface NipActionsMenuProps {
  /** bech32 `naddr1…` identifier for this NIP. */
  naddr: string;
  /** Full document markdown text. */
  content: string;
  className?: string;
}

/**
 * Overflow (⋯) menu for a NIP document, offering to copy the relay-portable
 * `naddr` identifier or the full document text. Replaces the bare copy icon so
 * users can choose which representation they want, with explicit toast feedback
 * on success/failure.
 */
export function NipActionsMenu({ naddr, content, className }: NipActionsMenuProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState<'naddr' | 'text' | null>(null);

  const copy = async (value: string, kind: 'naddr' | 'text', label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
      toast({ title: `${label} copied to clipboard` });
    } catch {
      toast({ title: `Could not copy ${label.toLowerCase()}`, variant: 'destructive' });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={cn('shrink-0 text-muted-foreground hover:text-foreground', className)}
          aria-label="NIP actions"
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Copy</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => copy(naddr, 'naddr', 'naddr')}>
          {copied === 'naddr' ? (
            <Check className="size-4 shrink-0 text-chart-5" aria-hidden="true" />
          ) : (
            <Copy className="size-4 shrink-0" aria-hidden="true" />
          )}
          <span>Copy naddr</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => copy(content, 'text', 'Document text')}>
          {copied === 'text' ? (
            <Check className="size-4 shrink-0 text-chart-5" aria-hidden="true" />
          ) : (
            <FileText className="size-4 shrink-0" aria-hidden="true" />
          )}
          <span>Copy text</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default NipActionsMenu;
