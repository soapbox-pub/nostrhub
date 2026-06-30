import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { AlertCircle, GitCompare } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { BackLink } from '@/components/DetailHero';
import { DetailSurface } from '@/components/DetailSurface';
import { DiffView } from '@/components/DiffView';
import {
  useResolvedNip,
  canonicalizeRef,
  type NipRef,
  type ResolvedNip,
} from '@/hooks/useResolvedNip';
import { useDirectoryNips } from '@/hooks/useDirectoryNips';
import type { RankedNip } from '@/hooks/useRankedNips';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** An option in the compare dropdowns. */
interface CompareOption {
  /** Canonical {@link NipRef} — also the `<SelectItem>` value. */
  ref: NipRef;
  label: string;
}

/** Build a canonical {@link NipRef} for a ranked directory entry. */
function refForNip(nip: RankedNip): NipRef {
  if (nip.target.type === 'official') return `official:${nip.target.number}`;
  if (nip.target.type === 'bud') return `bud:${nip.target.number}`;
  return canonicalizeRef(nip.target.address);
}

function labelForNip(nip: RankedNip): string {
  if (nip.target.type === 'official') return `NIP-${nip.number} · ${nip.title}`;
  if (nip.target.type === 'bud') return `BUD-${nip.number} · ${nip.title}`;
  return nip.title;
}

/** A `<Select>` of every NIP option, emitting a canonical {@link NipRef}. */
function NipSelect({
  options,
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  options: CompareOption[];
  value: NipRef | null;
  onChange: (ref: NipRef) => void;
  placeholder: string;
  ariaLabel: string;
}) {
  return (
    <Select value={value ?? undefined} onValueChange={onChange}>
      <SelectTrigger aria-label={ariaLabel} className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.ref} value={option.ref}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Compare two NIPs side by side. Both NIPs are passed as `?a=` and `?b=`
 * {@link NipRef}s (used by the "Compare with source" button on forked NIP
 * pages); when either is missing, the user can pick from the directory.
 */
const ComparePage = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Canonicalize so values from "Compare with source" (raw GitHub URLs, naddrs)
  // line up with the directory option values and with each other.
  const aRef = useMemo(() => {
    const raw = searchParams.get('a');
    return raw ? canonicalizeRef(raw) : null;
  }, [searchParams]);
  const bRef = useMemo(() => {
    const raw = searchParams.get('b');
    return raw ? canonicalizeRef(raw) : null;
  }, [searchParams]);

  const a = useResolvedNip(aRef ?? undefined);
  const b = useResolvedNip(bRef ?? undefined);

  const directory = useDirectoryNips();

  // Options come from the directory (official + community), plus the two
  // currently-selected NIPs injected so a fork's source — which may live
  // outside the curated directory — still shows its real title in the dropdown.
  const options = useMemo<CompareOption[]>(() => {
    const byRef = new Map<NipRef, CompareOption>();
    for (const nip of directory.ranked) {
      const ref = refForNip(nip);
      if (!byRef.has(ref)) byRef.set(ref, { ref, label: labelForNip(nip) });
    }

    const inject = (ref: NipRef | null, resolved: ResolvedNip | null | undefined) => {
      if (!ref) return;
      const prefixLabel = ref.startsWith('official:')
        ? `NIP-${ref.slice('official:'.length)}`
        : ref.startsWith('bud:')
          ? `BUD-${ref.slice('bud:'.length)}`
          : null;
      if (resolved) {
        // Always prefer the resolved title (and overwrite a stale directory label).
        const label = prefixLabel ? `${prefixLabel} · ${resolved.title}` : resolved.title;
        byRef.set(ref, { ref, label });
      } else if (!byRef.has(ref)) {
        // Resolution pending/failed: keep the ref selectable with a fallback label.
        byRef.set(ref, { ref, label: prefixLabel ?? ref });
      }
    };
    inject(aRef, a.data);
    inject(bRef, b.data);

    return [...byRef.values()].sort((x, y) => x.label.localeCompare(y.label));
  }, [directory.ranked, aRef, bRef, a.data, b.data]);

  const setRef = (key: 'a' | 'b', ref: NipRef) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set(key, ref);
        return next;
      },
      { replace: true },
    );
  };

  useSeoMeta({
    title: 'Compare NIPs | NostrHub',
    description: 'See exactly what changed between two NIPs or a fork and its source.',
  });

  const bothChosen = Boolean(aRef && bRef);
  const isLoading = (aRef && a.isLoading) || (bRef && b.isLoading);
  const loadError = (aRef && a.isError) || (bRef && b.isError);
  const missingDoc = (aRef && a.data === null) || (bRef && b.data === null);

  return (
    <Layout>
      <BackLink to="/nips">Back to NIPs</BackLink>

      <DetailSurface>
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <GitCompare className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Compare NIPs</h1>
            <p className="text-sm text-muted-foreground">
              See line-by-line what differs between two NIPs.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground" id="compare-a-label">
              Original
            </label>
            <NipSelect
              options={options}
              value={aRef}
              onChange={(ref) => setRef('a', ref)}
              placeholder={directory.isLoading ? 'Loading NIPs…' : 'Choose a NIP'}
              ariaLabel="Original NIP"
            />
          </div>
          <span className="hidden h-9 items-center text-center text-sm text-muted-foreground sm:flex">vs</span>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground" id="compare-b-label">
              Compared
            </label>
            <NipSelect
              options={options}
              value={bRef}
              onChange={(ref) => setRef('b', ref)}
              placeholder={directory.isLoading ? 'Loading NIPs…' : 'Choose a NIP'}
              ariaLabel="NIP to compare"
            />
          </div>
        </div>

        <div className="mt-6">
          {!bothChosen ? (
            <div className="rounded-lg border border-dashed py-12 text-center">
              <p className="text-sm text-muted-foreground">
                Pick two NIPs above to see what's changed between them.
              </p>
            </div>
          ) : isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : loadError ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>Could not load one of the NIPs to compare.</AlertDescription>
            </Alert>
          ) : missingDoc || !a.data || !b.data ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>
                One of the selected NIPs could not be found on your relays.
              </AlertDescription>
            </Alert>
          ) : (
            <DiffView
              oldText={a.data.content}
              newText={b.data.content}
              oldLabel={a.data.title}
              newLabel={b.data.title}
            />
          )}
        </div>
      </DetailSurface>
    </Layout>
  );
};

export default ComparePage;
