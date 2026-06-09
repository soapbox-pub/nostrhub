import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ClientUsersChart } from '@/components/ClientUsersChart';

/** Homepage right sidebar: distinct users per Nostr client. */
export function StatsSidebar() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Nostr Clients</CardTitle>
        <p className="text-xs text-muted-foreground">Distinct users per client (last 30 days)</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <ClientUsersChart bare />
        <Link to="/stats" className="block text-xs font-medium text-primary hover:underline">
          View all network stats →
        </Link>
      </CardContent>
    </Card>
  );
}

export default StatsSidebar;
