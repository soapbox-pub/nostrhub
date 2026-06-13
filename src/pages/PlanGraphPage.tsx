import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { Plus, X } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { GraphCanvas } from '@/components/graph/GraphCanvas';
import { NodeDialog } from '@/components/graph/NodeDialog';
import { EdgeDialog } from '@/components/graph/EdgeDialog';
import { NodePanel } from '@/components/graph/NodePanel';
import { usePlanGraph } from '@/hooks/usePlanGraph';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useIsMobile } from '@/hooks/useIsMobile';
import { cn } from '@/lib/utils';
import type { GraphNode } from '@/lib/planGraph';

/**
 * The community plan graph: a shared force-directed map of goals,
 * problems, and tasks. Every node and edge is an independent Nostr event
 * owned by its author; the client merges them into one view.
 */
export function PlanGraphPage() {
  const { data: graph, isLoading } = usePlanGraph();
  const { user } = useCurrentUser();
  const isMobile = useIsMobile();

  // The selected node lives in the URL (`?node=<address>`) so views are shareable.
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedAddress = searchParams.get('node');
  const setSelectedAddress = (address: string | null) => {
    setSearchParams(address ? { node: address } : {}, { replace: true });
  };

  const [nodeDialogOpen, setNodeDialogOpen] = useState(false);
  const [editingNode, setEditingNode] = useState<GraphNode | null>(null);
  const [connectFrom, setConnectFrom] = useState<GraphNode | null>(null);
  const [connectTarget, setConnectTarget] = useState<GraphNode | null>(null);
  const [subNodeParent, setSubNodeParent] = useState<string | null>(null);
  const [activeTopic, setActiveTopic] = useState<string | null>(null);

  useSeoMeta({
    title: 'Plan | NostrHub',
    description:
      'The community plan graph — a shared map of goals, problems, and tasks for building Nostr together.',
  });

  const nodes = graph?.nodes ?? [];
  const edges = graph?.edges ?? [];
  const hierarchy = graph?.hierarchy ?? [];
  const topics = graph?.topics ?? [];
  const nodesByAddress = graph?.nodesByAddress;

  const selectedNode = selectedAddress ? nodesByAddress?.get(selectedAddress) ?? null : null;

  // Escape exits connect mode.
  useEffect(() => {
    if (!connectFrom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setConnectFrom(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [connectFrom]);

  const handleSelectNode = (address: string | null) => {
    if (connectFrom && address && address !== connectFrom.address) {
      const target = nodesByAddress?.get(address);
      if (target) {
        setConnectTarget(target);
        return;
      }
    }
    setSelectedAddress(address);
  };

  const handleStartConnect = (node: GraphNode) => {
    if (!user) return;
    setConnectFrom(node);
    // On mobile the panel covers the canvas; close it so a target can be picked.
    if (isMobile) setSelectedAddress(null);
  };

  const handleEdit = (node: GraphNode) => {
    setEditingNode(node);
    setSubNodeParent(null);
    setNodeDialogOpen(true);
  };

  const handleAddSubNode = (parent: GraphNode) => {
    setEditingNode(null);
    setSubNodeParent(parent.address);
    setNodeDialogOpen(true);
  };

  const openNewNode = () => {
    setEditingNode(null);
    setSubNodeParent(null);
    setNodeDialogOpen(true);
  };

  const handleSelectTopic = (topic: string) => {
    setActiveTopic((current) => (current === topic ? null : topic));
  };

  const closeEdgeDialog = (open: boolean) => {
    if (!open) {
      setConnectTarget(null);
      setConnectFrom(null);
    }
  };

  const isEmpty = !isLoading && nodes.length === 0;

  const panel = selectedNode && graph && (
    <NodePanel
      node={selectedNode}
      edges={edges}
      nodesByAddress={graph.nodesByAddress}
      onClose={() => setSelectedAddress(null)}
      onSelectNode={(address) => setSelectedAddress(address)}
      onEdit={handleEdit}
      onStartConnect={handleStartConnect}
      onAddSubNode={handleAddSubNode}
      onSelectTopic={handleSelectTopic}
    />
  );

  return (
    <Layout fullBleed>
      <div className="flex h-full min-h-0 bg-background">
        {/* Canvas column */}
        <div className="relative min-w-0 flex-1">
          {isLoading ? (
            <div className="flex h-full items-center justify-center p-8">
              <div className="w-full max-w-md space-y-4">
                <Skeleton className="mx-auto size-24 rounded-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
                <p className="text-center text-sm text-muted-foreground">Loading the plan graph…</p>
              </div>
            </div>
          ) : isEmpty ? (
            <div className="flex h-full items-center justify-center p-8">
              <Card className="max-w-md border-dashed">
                <CardContent className="px-8 py-12 text-center">
                  <p className="mb-4 text-muted-foreground">
                    The plan graph is empty. Publish the first goal, problem, or task and
                    give the community something to build around.
                  </p>
                  <Button onClick={openNewNode} disabled={!user}>
                    <Plus className="size-4" />
                    {user ? 'Add the first node' : 'Log in to contribute'}
                  </Button>
                </CardContent>
              </Card>
            </div>
          ) : (
            <GraphCanvas
              nodes={nodes}
              edges={edges}
              hierarchy={hierarchy}
              selectedAddress={selectedAddress}
              connectFrom={connectFrom?.address ?? null}
              activeTopic={activeTopic}
              onSelectNode={handleSelectNode}
            />
          )}

          {/* Top bar: title + add button */}
          {!isEmpty && !isLoading && (
            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
              <div className="pointer-events-auto rounded-lg border border-border/60 bg-background/80 px-3 py-2 backdrop-blur">
                <h1 className="font-display text-sm font-semibold">Plan graph</h1>
                <p className="hidden text-xs text-muted-foreground sm:block">
                  Goals, problems & tasks — owned by their authors, connected by everyone.
                </p>
              </div>
              <Button
                className="pointer-events-auto"
                onClick={openNewNode}
                disabled={!user}
                title={user ? undefined : 'Log in to contribute'}
              >
                <Plus className="size-4" />
                Add node
              </Button>
            </div>
          )}

          {/* Topic filter bar */}
          {!isEmpty && !isLoading && topics.length > 0 && (
            <div className="pointer-events-none absolute inset-x-0 top-20 flex justify-center px-4">
              <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-1.5 overflow-x-auto rounded-full border border-border/60 bg-background/80 px-3 py-1.5 backdrop-blur">
                {activeTopic && (
                  <button
                    type="button"
                    onClick={() => setActiveTopic(null)}
                    className="rounded-full px-2 py-0.5 text-xs font-medium text-primary hover:underline"
                  >
                    Clear
                  </button>
                )}
                {topics.slice(0, 12).map((topic) => (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => handleSelectTopic(topic)}
                    className={cn(
                      'rounded-full px-2.5 py-0.5 text-xs transition-colors',
                      topic === activeTopic
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent/10 hover:text-foreground',
                    )}
                  >
                    #{topic}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Connect-mode banner */}
          {connectFrom && (
            <div className="absolute inset-x-0 bottom-20 flex justify-center px-4 sm:bottom-6">
              <div className="flex items-center gap-3 rounded-full border border-amber-500/40 bg-background/90 py-2 pl-4 pr-2 text-sm shadow-lg backdrop-blur">
                <span>
                  Connecting from <span className="font-medium">{connectFrom.title}</span> — click a target node
                </span>
                <Button size="sm" variant="ghost" onClick={() => setConnectFrom(null)}>
                  <X className="size-4" />
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Detail panel: sidebar on desktop, drawer on mobile */}
        {!isMobile && selectedNode && (
          <aside className="hidden w-[400px] shrink-0 border-l border-border/60 md:block">
            {panel}
          </aside>
        )}
        {isMobile && (
          <Drawer open={Boolean(selectedNode)} onOpenChange={(open) => { if (!open) setSelectedAddress(null); }}>
            <DrawerContent className="h-[85vh]">
              <DrawerTitle className="sr-only">{selectedNode?.title ?? 'Node details'}</DrawerTitle>
              {panel}
            </DrawerContent>
          </Drawer>
        )}
      </div>

      <NodeDialog
        open={nodeDialogOpen}
        onOpenChange={(open) => {
          setNodeDialogOpen(open);
          if (!open) {
            setEditingNode(null);
            setSubNodeParent(null);
          }
        }}
        node={editingNode}
        allNodes={nodes}
        hierarchy={hierarchy}
        initialParent={subNodeParent}
      />

      <EdgeDialog
        open={Boolean(connectFrom && connectTarget)}
        onOpenChange={closeEdgeDialog}
        source={connectFrom}
        target={connectTarget}
      />
    </Layout>
  );
}

export default PlanGraphPage;
