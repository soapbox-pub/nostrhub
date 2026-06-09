import { Link } from 'react-router-dom';
import { BarChart3, Users, GraduationCap } from 'lucide-react';
import { useExperts } from '@/hooks/useExperts';
import { useCommunityAuthors } from '@/hooks/useCommunityAuthors';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </span>
      <div>
        <div className="text-lg font-semibold leading-none">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

/** Homepage sidebar. Currently shows trust-model stats; network metrics land in Phase 4. */
export function StatsSidebar() {
  const { experts } = useExperts();
  const community = useCommunityAuthors();
  const communitySize = community.data?.authors.length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="size-4 text-primary" /> Your Network
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Stat icon={<GraduationCap className="size-4" />} label="Experts" value={experts.length} />
        <Stat
          icon={<Users className="size-4" />}
          label="Community members"
          value={community.isLoading ? '—' : communitySize ?? 0}
        />
        <p className="border-t border-border/60 pt-3 text-xs text-muted-foreground">
          Network-wide statistics are coming to the{' '}
          <Link to="/stats" className="font-medium text-primary hover:underline">
            Stats page
          </Link>
          .
        </p>
      </CardContent>
    </Card>
  );
}

export default StatsSidebar;
