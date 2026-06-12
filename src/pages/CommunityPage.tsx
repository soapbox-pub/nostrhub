import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { Hash, Menu } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { ChannelSidebar } from '@/components/chat/ChannelSidebar';
import { ChatMessageList } from '@/components/chat/ChatMessageList';
import { ChatComposer } from '@/components/chat/ChatComposer';
import { useChatMessages } from '@/hooks/useChatMessages';
import { useCommunityAuthors } from '@/hooks/useCommunityAuthors';
import { useAiChatAgent } from '@/hooks/useAiChatAgent';
import { getChannel, normalizeTopic } from '@/lib/chat';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

export function CommunityPage() {
  const { topic: topicParam } = useParams<{ topic: string }>();
  const topic = normalizeTopic(topicParam);
  const channel = getChannel(topic);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const community = useCommunityAuthors();
  const { data: messages = [], isLoading } = useChatMessages(topic, {
    communityAuthors: community.data?.authors,
  });
  const { runAiReply, typingTopic } = useAiChatAgent();
  const aiTyping = typingTopic === topic;

  useSeoMeta({
    title: `#${channel.label} — NostrHub Community`,
    description: `Join the public #${channel.label} channel and chat with the Nostr developer community.`,
  });

  return (
    <Layout fullBleed>
      <div className="flex h-full overflow-hidden bg-background">
        {/* Desktop channel sidebar */}
        <aside className="hidden w-60 shrink-0 border-r bg-muted/30 md:block">
          <ChannelSidebar activeTopic={topic} />
        </aside>

        {/* Main chat column */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Channel header */}
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
            {/* Mobile channel drawer */}
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open channels">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0">
                <ChannelSidebar activeTopic={topic} onNavigate={() => setMobileNavOpen(false)} />
              </SheetContent>
            </Sheet>

            <Hash className="size-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold leading-tight">{channel.label}</h1>
              <p className="hidden truncate text-xs text-muted-foreground sm:block">
                {channel.description}
              </p>
            </div>
          </header>

          {/* Scrollable transcript */}
          <div className="flex-1 overflow-y-auto">
            <ChatMessageList
              messages={messages}
              isLoading={isLoading || community.isLoading}
              channelLabel={channel.label}
              aiTyping={aiTyping}
            />
          </div>

          {/* Composer */}
          <ChatComposer
            topic={topic}
            channelLabel={channel.label}
            aiBusy={aiTyping}
            onAiPrompt={(prompt) => runAiReply({ topic, prompt })}
          />
        </div>
      </div>
    </Layout>
  );
}

export default CommunityPage;
