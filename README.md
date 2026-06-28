# NostrHub

**A Nostr-native hub where the developer community builds the protocol together.**

NostrHub is a place to collaborate on Nostr itself. Its center of gravity is **NIPs** — the proposals that define how Nostr works — along with the discussion around them, a **plan graph** of what the ecosystem is building, an **app directory**, and **git repos**. Everything lives on Nostr as ordinary events, owned by no forge and governed by no central authority.

It's not a democracy. It's not a dictatorship. It's a **configurable meritocracy** you tune yourself.

🌐 **[nostrhub.io](https://nostrhub.io)**

## The Idea

NIPs on GitHub are centralized — an oligarchy of maintainers decides which proposals become "official." NostrHub takes a different approach, rooted in a single trust primitive applied everywhere.

### Experts

NostrHub ships with a default set of **experts**: the top contributors to the NIPs repo (fiatjaf, hodlbod, Vitor Pamplona, PABLOF7z, jb55, Kieran, mattn, and others). But the list is **yours to edit** in Settings.

Instead of a "Follow" button, profiles have an **"add as expert"** button. Experts wear a shield badge above their avatar wherever they appear, so you always know whose judgment you're looking at.

### Approvals

Anyone can approve a NIP. Approvals are [NIP-32](https://github.com/nostr-protocol/nips/blob/master/32.md) label events — ordinary Nostr data — but **only approvals from your experts count** toward a NIP becoming "official." NIPs are ranked by how many experts approve them. Change your experts, and the rankings rearrange themselves around your trust.

> NostrHub doesn't tell you what's true. It tells you what the people you trust think is true, and lets you choose those people.

### The Community

From the experts, NostrHub derives a much larger **community**: it combines the follow lists of every expert, ranks each followed account by how many experts follow them, and caps the result (1,000 by default, configurable, or off entirely).

To be **seen** on NostrHub, you don't need permission — Nostr is permissionless. But to be **rendered**, you have to have already earned the attention of people the experts trust. This is what kills spam — not a moderator, captcha, or blocklist, but the shape of the network itself. The same community set scopes everything downstream: comments, chat, the plan graph, apps, and repos.

Curation and participation are cleanly separated. Experts **curate** by approving. The community **participates** by building.

## Features

### NIPs
The heart of NostrHub. Browse, propose, discuss, and approve NIPs. Fresh drafts surface the moment a community member publishes them. Expert approval is required to rise.

### Plan Graph
A shared, visual map of what the Nostr community is building — goals, problems, tasks, and the people and projects connected to them. Every node and edge is an independent Nostr event owned by its author. The client merges everyone's contributions into one force-directed "galaxy" and computes the layout locally, so nobody can fight over a shared canvas.

### App Directory
Applications announced on Nostr itself via [NIP-89](https://github.com/nostr-protocol/nips/blob/master/89.md) handler events, with no central submission. The community rates how well each app implements each NIP, ProtonDB-style: **Flawless**, **Incomplete**, **Isolated**, or **Borked**. Reports are shared 1:1 with the [Borkstr](https://borkstr.com) directory, so ratings flow between clients.

### Git Repos
Code that lives on Nostr via [NIP-34](https://github.com/nostr-protocol/nips/blob/master/34.md) — announced over relays, cloneable from anywhere, owned by no forge. Spin up a brand-new repo entirely in the browser and push it to a GRASP server (a relay that doubles as a git host), or mirror an existing GitHub repo onto Nostr. Repo pages are laid out GitHub-style, with issues, pull requests, and a file browser — except there's no GitHub underneath.

### Chat
A public community chat with AI agent integration.

## Tech Stack

NostrHub is built with [MKStack](https://soapbox.pub/mkstack), Soapbox's framework for building Nostr clients with AI.

- **React 19** — hooks, concurrent rendering, ref-as-prop
- **TailwindCSS 4** — utility-first styling
- **Vite** — dev server and production bundler
- **shadcn/ui** — accessible Radix UI + Tailwind components
- **Nostrify** (`@nostrify/react`) — Nostr protocol framework
- **TanStack Query** — data fetching, caching, state
- **React Router** — client-side routing
- **isomorphic-git** — in-browser git for NIP-34 repos
- **TypeScript** — type-safe throughout

## Development

```bash
# Start the dev server
npm run dev

# Type-check, lint, test, and build
npm run test

# Production build
npm run build
```

## Source

NostrHub is open source and hosts its own source code on Nostr, at [nostrhub.io/alex@gleasonator.com/nostrhub](https://nostrhub.io/alex@gleasonator.com/nostrhub).

## Further Reading

- [NostrHub 2.0: A Meritocracy for Building Nostr Together](https://soapbox.pub/blog/nostrhub-2)
- [NostrHub: NIPs, Apps, and Repos on Nostr](https://soapbox.pub/blog/announcing-nostrhub)
- [Build a Nostr App with MKStack](https://soapbox.pub/blog/mkstack-tutorial)

---

Come build Nostr with us at [nostrhub.io](https://nostrhub.io).
