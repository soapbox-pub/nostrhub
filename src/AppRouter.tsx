import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ScrollToTop } from "./components/ScrollToTop";

import Index from "./pages/Index";
import { NIP19Page } from "./pages/NIP19Page";
import { RepoRoute } from "./pages/RepoRoute";
import NotFound from "./pages/NotFound";
import SettingsPage from "./pages/SettingsPage";
import OfficialNipPage from "./pages/OfficialNipPage";
import OfficialBudPage from "./pages/OfficialBudPage";
import CreateNipPage from "./pages/CreateNipPage";
import EditNipPage from "./pages/EditNipPage";
import ComparePage from "./pages/ComparePage";
import StatsPage from "./pages/StatsPage";
import ExpertsPage from "./pages/ExpertsPage";
import CommunityPage from "./pages/CommunityPage";
import GitReposPage from "./pages/GitReposPage";
import AddRepoPage from "./pages/AddRepoPage";
import NipsPage from "./pages/NipsPage";
import KindPage from "./pages/KindPage";
import AppsPage from "./pages/AppsPage";
import SubmitAppPage from "./pages/SubmitAppPage";
import ReleasesPage from "./pages/ReleasesPage";
import ArticlesPage from "./pages/ArticlesPage";
import CreateArticlePage from "./pages/CreateArticlePage";
import DraftsPage from "./pages/DraftsPage";
import PlanGraphPage from "./pages/PlanGraphPage";
import NotificationsPage from "./pages/NotificationsPage";
import { DEFAULT_TOPIC } from "./lib/chat";

export function AppRouter() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/nips" element={<NipsPage />} />
        <Route path="/articles" element={<ArticlesPage />} />
        <Route path="/articles/create" element={<CreateArticlePage />} />
        <Route path="/drafts" element={<DraftsPage />} />
        <Route path="/repos" element={<GitReposPage />} />
        <Route path="/repos/new" element={<AddRepoPage />} />
        <Route path="/repos/edit/:naddr" element={<AddRepoPage />} />
        <Route path="/apps" element={<AppsPage />} />
        <Route path="/apps/submit" element={<SubmitAppPage />} />
        <Route path="/apps/edit/:naddr" element={<SubmitAppPage />} />
        <Route path="/releases" element={<ReleasesPage />} />
        <Route path="/plan" element={<PlanGraphPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/experts" element={<ExpertsPage />} />
        <Route path="/chat" element={<Navigate to={`/chat/${DEFAULT_TOPIC}`} replace />} />
        <Route path="/chat/:topic" element={<CommunityPage />} />
        <Route path="/nip/:number" element={<OfficialNipPage />} />
        <Route path="/bud/:number" element={<OfficialBudPage />} />
        <Route path="/k/:kind" element={<KindPage />} />
        <Route path="/create" element={<CreateNipPage />} />
        <Route path="/edit/:naddr" element={<EditNipPage />} />
        <Route path="/compare" element={<ComparePage />} />
        {/* NIP-19 route for npub1, note1, naddr1, nevent1, nprofile1, plus
            NIP-05 identifiers (user@domain.com) and bare domains. */}
        <Route path="/:nip19" element={<NIP19Page />} />
        {/* NIP-34 repository: /{owner}/{repo} where owner is a verified NIP-05,
            npub, or hex pubkey and repo is the `d` identifier. Static-prefixed
            two-segment routes above (e.g. /repos/new, /chat/:topic) take
            precedence over this dynamic pair. */}
        <Route path="/:owner/:repo" element={<RepoRoute />} />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
export default AppRouter;