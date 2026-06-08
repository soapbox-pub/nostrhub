# NostrHub — Build Plan

NostrHub is a Nostr-native hub where the developer community collaborates on building the
Nostr protocol together. It is, in spirit, a decentralized "GitHub for Nostr development" —
but its center of gravity is the **NIPs** (Nostr Implementation Possibilities) and the
**discussion around them**, not git itself.

This document is the source of truth for the product vision and the phased implementation
roadmap. We build it one step at a time, in priority order.

---

## 1. Vision & Priorities

In descending order of importance:

1. **NIPs (primary focus).** Browse, discover, read, draft, fork, and discuss NIPs — both the
   official NIPs from the `nostr-protocol/nips` repository and community-authored custom NIPs
   published as Nostr events (kind `30817`).
2. **NIP discussion.** Threaded, spam-resistant conversation attached to every NIP, gated by a
   community-curated set of "Nostr Experts."
3. **Stats & metrics about Nostr.** Live network statistics surfaced in a homepage sidebar and a
   dedicated `/stats` page.
4. **Community discussion ("public Slack").** Topic-separated public channels where developers —
   and AI agents — talk to each other. The developer community is the default visible audience.
5. **Git repos & dev utilities (long-term).** NIP-34 git collaboration (repo announcements,
   issues, patches, PRs) plus forms for creating various development-related event kinds.

We deliberately ship NIPs first, then layer the rest on top of the same trust and identity
primitives.

---

## 2. Core Concept: The "Nostr Experts" Trust Model

Nostr is permissionless — a signature proves authorship, not trustworthiness. To keep NostrHub
useful and spam-free without becoming centralized, the entire app is anchored on a
**user-configurable set of "Nostr Experts."**

### 2.1 What experts are

- A list of expert pubkeys, configurable by the end-user in **Settings**, and editable inline
  from anywhere experts are displayed (quick add/remove).
- Ships with a sensible **default expert list** (well-known Nostr protocol developers) so the app
  is useful out of the box.
- Experts are visually distinguished in the UI — e.g. a **graduation-cap (🎓) badge** floating
  above their avatar — wherever they appear.

### 2.2 The derived "community" author set (spam prevention)

From the experts we compute a larger trusted **community author set**, used primarily to filter
**comments/discussion** so randoms can't spam:

1. Fetch the **follow lists (kind 3)** of every configured expert.
2. Rank every followed pubkey by **how many experts follow them** (descending).
3. **Truncate** the ranked list to a configurable maximum (**default 1000**). This cap is
   configurable in Settings, and can be **disabled entirely** (no cap).
4. Always **union in** the experts themselves and the **logged-in user**, even if that pushes the
   set above the configured cap.

The resulting set is the `authors` filter applied to discussion queries. This is computed once
and cached (it is relatively expensive), and recomputed when the expert list or cap changes.

### 2.3 How NIPs themselves are ranked (separate from comments)

NIP ranking does **not** use the 1000-author community set. Instead it uses an explicit
**approval label**:

- A new NIP-32 label, namespace **`nostrhub`**, label value **`approve`** (the
  `nostrhub.approve` concept), can be applied by anyone to any NIP (official or custom).
- The **homepage NIP ranking** syncs as many `nostrhub.approve` labels as possible **from the
  experts only**, and ranks NIPs by expert-approval count/weight.
- A separate **"Latest Drafts"** section below pulls the most recent custom-NIP events (kind
  `30817`) from the **full community author set** (the ~1000), surfacing fresh community work
  without requiring expert approval first.

This cleanly separates *curation* (experts approve via labels) from *participation* (the broad
community drafts and discusses).

---

## 3. Backwards Compatibility (old NostrHub)

A previous version of NostrHub exists. We are doing a fresh rebuild, but the **event kinds must
remain 1:1 compatible** so old and new content interoperate. Confirmed compatibility points:

- **Custom NIP = kind `30817`** (addressable). Tags:
  - `["d", "<identifier>"]` — kebab-case slug (used in the `naddr`).
  - `["title", "<human title>"]`.
  - `["k", "<event-kind-number>"]` — repeatable; the event kinds the NIP defines/concerns.
  - Fork of a **custom** NIP: `["a", "30817:<pubkey>:<d>", "", "fork"]` plus `["p", "<author>"]`.
  - Fork of an **official** NIP: `["i", "https://github.com/nostr-protocol/nips/blob/master/<NIP>.md", "fork"]`.
  - `content` = Markdown body of the NIP.
- **Comments = kind `1111`** (NIP-22).
- **Reactions = kind `7` / `17`** (NIP-25 / NIP-73) — legacy voting. The new app prefers the
  `nostrhub.approve` label for curation but should still *read* legacy reactions where useful.

These are documented authoritatively in `NIP.md`.

---

## 4. Architecture & Conventions

- React 19 + TailwindCSS 4 + Vite + shadcn/ui + Nostrify + TanStack Query + React Router.
- Data access via `useNostr` + `useQuery` custom hooks in `src/hooks/`.
- Routing in `src/AppRouter.tsx`; all NIP-19 identifiers resolved at `/:nip19` via `NIP19Page`.
- App-wide config (theme, relays, **experts**, **community cap**, stats provider) lives in
  `AppContext` / `AppProvider`, persisted to localStorage.
- **Security:** never render untrusted markdown/HTML unsafely; sanitize all event-sourced URLs;
  filter trust-sensitive queries by author. See the `nostr-security` skill before any feature
  that renders user content or makes trust decisions.
- A persistent **Layout** (header with nav + `LoginArea` + account menu, optional sidebar) wraps
  all pages.

---

## 5. Phased Roadmap

### Phase 0 — Foundations (scaffolding)
- [ ] `NIP.md` documenting kind `30817` and the `nostrhub.approve` (NIP-32) label.
- [ ] Brand/theme pass (name, colors, fonts, logo) via the `theming` skill.
- [ ] `Layout` component: responsive header (logo, nav, `LoginArea` + profile/account menu),
      content area, footer.
- [ ] App config schema extended with: `experts: string[]`, `communityCap: number | null`,
      `statsProvider`, persisted in `AppContext`.

### Phase 1 — Expert & Community Trust Engine
- [ ] Default expert list constant.
- [ ] `useExperts()` — read/write the configured expert pubkeys.
- [ ] `ExpertBadge` / avatar treatment (🎓 cap) + inline add/remove control.
- [ ] `useCommunityAuthors()` — fetch experts' kind-3 follows, rank by expert-follow count,
      truncate to cap (or disable), union experts + current user. Cached.
- [ ] Settings UI section for experts and the community cap (set number / disable).

### Phase 2 — NIPs: Browse & Read (FIRST IMPLEMENTATION TARGET)
- [ ] Fetch & cache **official NIPs** (from `nostr-protocol/nips`) — index + per-NIP markdown.
- [ ] `useCustomNips()` / `useCustomNip(naddr)` — query kind `30817`.
- [ ] `nostrhub.approve` label hooks: `useApprovals(targets)` (read), restricted to experts for
      ranking; `useApproveNip()` (write a kind-1985 label).
- [ ] **Homepage**: experts-approved NIP ranking (official + custom unified) at top; **Latest
      Drafts** (recent kind `30817` from community authors) below; stats sidebar placeholder.
- [ ] **NIP detail page**: rendered Markdown, metadata (kinds, author, approvals, forks), approve
      button, fork button, link to discussion.
- [ ] Markdown renderer (safe) + NIP-19 / `nostr:` reference resolution.

### Phase 3 — NIPs: Author, Fork & Discuss
- [ ] Create/Edit custom NIP form (kind `30817`): title → auto-slug `d`, `k` kinds input,
      Markdown editor with live preview. Use `nostr_generate_kind` when a NIP needs a new kind.
- [ ] Fork flows: fork a custom NIP (`a` + `fork` + `p`) or an official NIP (`i` + `fork`),
      pre-filling the editor.
- [ ] Threaded discussion (kind `1111`, NIP-22) attached to each NIP, with the **community author
      filter** applied. Compose, reply, render. Reactions optional.
- [ ] Notifications for replies / approvals on your NIPs.

### Phase 4 — Stats & Metrics
- [ ] `/stats` page + homepage sidebar widgets: network stats (events, active pubkeys, relays,
      kind distribution, NIP adoption). Source TBD (NIP-45 COUNT, NIP-85 assertions, and/or a
      stats provider). Define provider in `AppConfig`.

### Phase 5 — Community Discussion ("public Slack")
- [ ] Topic/channel model (evaluate NIP-29 relay-based groups vs. NIP-7D forum threads vs.
      kind-1 with `t` topics). Default visible audience = the developer community author set.
- [ ] Channel list + threaded messages + composer; AI-agent participants as first-class members.

### Phase 6 — Git & Dev Utilities (long-term)
- [ ] NIP-34: repo announcements (`30617`), repo browse, issues (`1621`), patches (`1617`),
      PRs (`1618`), status events (`1630`–`1633`).
- [ ] Forms/utilities for composing assorted development-related event kinds.

---

## 6. Custom Kinds & Schemas

Authoritative definitions live in **`NIP.md`** and must be updated whenever a kind or schema
changes. Current custom surface:

- **Kind `30817`** — Custom NIP (addressable). Inherited 1:1 from the previous NostrHub.
- **`nostrhub.approve`** — NIP-32 label (namespace `nostrhub`, value `approve`) for expert NIP
  curation.

New kinds beyond these MUST be generated with the kind-generator tool and carry a NIP-31 `alt`
tag.

---

## 7. Working Agreement

- Build in the phase order above; finish and verify a step before starting the next.
- Each step ends with: type-check ✓, build ✓, lint (fix critical) ✓, tests if present ✓, commit ✓.
- Reuse existing NIPs over inventing kinds; keep old kinds interoperable.
- Load the relevant skill (`theming`, `nostr-security`, `nostr-comments`, `note-content`,
  `nip19-routing`, `nip85-stats`, `relay-management`, etc.) when its task comes up.
