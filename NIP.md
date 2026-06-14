# NostrHub Custom Kinds & Schemas

This document defines the custom Nostr event kinds and labels used by **NostrHub**. These schemas
are inherited 1:1 from the previous version of NostrHub to preserve interoperability — existing
content published by the old app remains fully readable and writable by the new app.

---

## Kind `30817` — Custom NIP

An **addressable** event (30000 ≤ kind < 40000) representing a community-authored Nostr
Implementation Possibility (NIP). The `content` field holds the NIP body as Markdown.

### Tags

| Tag       | Required | Repeatable | Description                                                                 |
| --------- | -------- | ---------- | --------------------------------------------------------------------------- |
| `d`       | yes      | no         | Unique identifier (kebab-case slug). Used in the `naddr`.                    |
| `title`   | yes      | no         | Human-readable NIP title.                                                   |
| `k`       | no       | yes        | An event kind number this NIP defines or concerns (string).                 |
| `a`       | no       | yes        | Fork reference to a **custom** NIP: `30817:<pubkey>:<d>` with `fork` marker. |
| `i`       | no       | yes        | Fork reference to an **official** NIP (GitHub URL) with `fork` marker.       |
| `p`       | no       | yes        | Author of a forked custom NIP, to notify them of the fork.                  |

### Example

```jsonc
{
  "kind": 30817,
  "content": "# My NIP\n\nThis NIP defines ...",
  "tags": [
    ["d", "custom-xyz-events"],
    ["title", "Custom Event Kind for XYZ"],
    ["k", "31337"],
    ["k", "31338"]
  ]
}
```

### Fork examples

Fork of a **custom** NIP (kind 30817):

```jsonc
{
  "kind": 30817,
  "content": "# Forked NIP\n\n...",
  "tags": [
    ["d", "my-fork-of-xyz"],
    ["title", "My Fork of XYZ"],
    ["a", "30817:<original-author-pubkey>:<original-d>", "", "fork"],
    ["p", "<original-author-pubkey>"]
  ]
}
```

Fork of an **official** NIP:

```jsonc
{
  "kind": 30817,
  "content": "# Improved NIP-XX\n\n...",
  "tags": [
    ["d", "improved-nip-xx"],
    ["title", "Improved NIP-XX"],
    ["i", "https://github.com/nostr-protocol/nips/blob/master/XX.md", "fork"]
  ]
}
```

### Querying

```ts
// All custom NIPs
nostr.query([{ kinds: [30817], limit: 50 }]);

// Custom NIPs concerning a specific event kind
nostr.query([{ kinds: [30817], "#k": ["31337"] }]);

// A specific custom NIP (decode the naddr first)
nostr.query([{ kinds: [30817], authors: [pubkey], "#d": [identifier], limit: 1 }]);
```

---

## `nostrhub.approve` — Expert Approval Label (NIP-32)

A [NIP-32](https://github.com/nostr-protocol/nips/blob/master/32.md) label (kind `1985`) used to
**curate NIPs**. Anyone may apply it, but NostrHub's homepage ranking only counts approvals
authored by the user's configured **Nostr Experts**.

- **Namespace (`L`):** `nostrhub`
- **Label (`l`):** `approve` (with mark `nostrhub`)
- **Target:** the NIP being approved
  - Custom NIP → `a` tag: `30817:<pubkey>:<d>`
  - Official NIP → `i` tag (NIP-73 external id / GitHub URL) or `r` tag (URL)

### Example — approving a custom NIP

```jsonc
{
  "kind": 1985,
  "content": "",
  "tags": [
    ["L", "nostrhub"],
    ["l", "approve", "nostrhub"],
    ["a", "30817:<nip-author-pubkey>:<nip-d-tag>", "<relay-url>"]
  ]
}
```

### Example — approving an official NIP

```jsonc
{
  "kind": 1985,
  "content": "",
  "tags": [
    ["L", "nostrhub"],
    ["l", "approve", "nostrhub"],
    ["i", "https://github.com/nostr-protocol/nips/blob/master/01.md"]
  ]
}
```

### Querying expert approvals

```ts
// Approvals from experts only, used for homepage ranking
nostr.query([{
  kinds: [1985],
  authors: EXPERT_PUBKEYS,
  "#L": ["nostrhub"],
  "#l": ["approve"],
}]);
```

### Removing an approval

An approval is undone by requesting deletion ([NIP-09](https://github.com/nostr-protocol/nips/blob/master/09.md))
of the user's own kind-1985 label event(s):

```jsonc
{
  "kind": 5,
  "content": "",
  "tags": [
    ["e", "<label-event-id>"],
    ["k", "1985"]
  ]
}
```

---

## Community Chat — Kind `9` ([NIP-C7](https://github.com/nostr-protocol/nips/blob/master/C7.md))

NostrHub's `/chat` is built on **kind 9** chat messages. Each chat **channel** is a
topic addressed by the canonical URL `https://nostrhub.io/chat/<topic>`. A message is
scoped to its channel with a [NIP-73](https://github.com/nostr-protocol/nips/blob/master/73.md)
`i` tag pointing at that URL, plus a `k=web` tag describing the identifier kind. Using
the relay-indexable single-letter `i` tag lets any client fetch a channel transcript
with a single filter.

### Tags

| Tag | Required | Description                                                          |
| --- | -------- | -------------------------------------------------------------------- |
| `i` | yes      | Channel scope — the canonical topic URL `https://nostrhub.io/chat/<topic>`. |
| `k` | yes      | Identifier kind for the `i` tag: `web`.                              |
| `q` | no       | Quoted parent message (event id) for replies, per NIP-C7.            |

### Example

```jsonc
{
  "kind": 9,
  "content": "GM nostrhub",
  "tags": [
    ["i", "https://nostrhub.io/chat/general"],
    ["k", "web"]
  ]
}
```

### Querying

```ts
// The transcript for a channel
nostr.query([{ kinds: [9], "#i": ["https://nostrhub.io/chat/general"], limit: 200 }]);
```

The canonical origin (`https://nostrhub.io`) is fixed rather than `location.origin`, so
chat is interoperable across deployments and local development. The "community" author
set only scopes which messages are displayed (spam resistance) — every message is
publicly readable.

### AI-generated chat messages (NIP-32 `agent/ai` label)

A user can address the in-chat **AI assistant** by starting a message with `@ai`. The reply
is generated by an OpenAI-compatible API (configured under Settings, called directly from
the browser) and then published **by the user themselves** as an ordinary kind 9 chat
message — but carrying a [NIP-32](https://github.com/nostr-protocol/nips/blob/master/32.md)
label marking it as AI-generated:

- **Namespace (`L`):** `agent`
- **Label (`l`):** `ai` (with namespace mark `agent`)

Clients that recognize this label render the message as if posted by a distinct "AI"
participant, ignoring the signing user's own profile. This convention is shared with other
Nostr clients (e.g. Clawstr) for interoperability.

```jsonc
{
  "kind": 9,
  "content": "Here's a summary of the thread …",
  "tags": [
    ["i", "https://nostrhub.io/chat/general"],
    ["k", "web"],
    ["L", "agent"],
    ["l", "ai", "agent"]
  ]
}
```

---

## App Compatibility Reports — Kind `31986` (Borkstr-compatible)

NostrHub's `/apps` directory lists applications announced via **kind `31990`**
([NIP-89](https://github.com/nostr-protocol/nips/blob/master/89.md) Handler Information) and rates
them **ProtonDB-style** using per-NIP compatibility reports. The report schema is shared 1:1 with
the [Borkstr](https://borkstr.com) directory for interoperability — NostrHub introduces no new
kinds here.

A report is a **kind `31986`** addressable event (proposed NIP-85 Reviews), self-labeled via
[NIP-32](https://github.com/nostr-protocol/nips/blob/master/32.md) with the `borkstr` namespace,
targeting an app's kind `31990` listing. One report exists per author per app+NIP combination
(enforced by the `d` tag).

### Structure

```jsonc
{
  "kind": 31986,
  "content": "Human-readable explanation of the user's experience",
  "tags": [
    // Target: the app's kind 31990 handler event
    ["a", "31990:<app-pubkey>:<d-tag>"],
    ["p", "<app-pubkey>"],
    ["k", "31990"],

    // One report per app+NIP per author
    ["d", "31990:<app-pubkey>:<d-tag>:<nip-identifier>"],

    // Rating (0.0–1.0 scale, per proposed NIP-85 Reviews)
    ["rating", "<0.0-1.0>", "<nip-identifier>"],

    // Self-labeling as a compatibility report (NIP-32)
    ["L", "borkstr"],
    ["l", "nip-compatibility", "borkstr"],

    // Which NIP is being rated (lowercase, e.g. "nip-17")
    ["t", "<nip-identifier>"],

    ["alt", "Borkstr NIP compatibility report"]
  ]
}
```

### Rating scale → tiers

| Rating range | Tier       | Description                                                  |
| ------------ | ---------- | ------------------------------------------------------------ |
| 0.75 – 1.0   | Flawless   | Every expected feature is interoperable with all other apps  |
| 0.50 – 0.74  | Incomplete | Doesn't comply with the entire NIP; things are missing       |
| 0.25 – 0.49  | Isolated   | Not interoperable with other clients                         |
| 0.00 – 0.24  | Borked     | Doesn't load basic events or crashes                         |

When submitting through NostrHub, the selected tier publishes a fixed rating: Flawless = `1.0`,
Incomplete = `0.6`, Isolated = `0.3`, Borked = `0.1`.

### Aggregation

1. Collect kind `31986` events labeled `["l", "nip-compatibility", "borkstr"]` targeting the app,
   keeping only each author's latest revision per `d` tag.
2. Group by NIP (`t` tag) and compute the **median** rating per NIP.
3. Map each median to its tier; the overall app tier is the median of the per-NIP medians.

Medians are preferred over means to blunt outlier ratings.

### Querying

```ts
// All reports for a specific app
nostr.query([{ kinds: [31986], "#l": ["nip-compatibility"], "#a": ["31990:<pubkey>:<d>"] }]);

// All reports across all apps (directory aggregation)
nostr.query([{ kinds: [31986], "#l": ["nip-compatibility"], limit: 1000 }]);
```

---

## Plan Graph — Kinds `32473` (Node) and `39249` (Edge)

NostrHub's `/plan` page is a **community plan graph**: a shared, visual map of goals,
problems, and work items that anyone can contribute to. There is no shared mutable canvas —
the graph is **append-only and author-owned**. Every node and every edge is an independent
addressable event owned by its creator; clients merge all contributions into a single view
and compute the layout locally (force-directed). Positions are never stored, so contributors
cannot conflict over them.

### Kind `32473` — Plan Node

An **addressable** event representing one node in the graph. `content` holds a Markdown
description.

| Tag      | Required | Repeatable | Description                                                              |
| -------- | -------- | ---------- | ------------------------------------------------------------------------ |
| `d`      | yes      | no         | Unique identifier (kebab-case slug).                                     |
| `title`  | yes      | no         | Short human-readable node title.                                         |
| `type`   | yes      | no         | Node type. **Work items:** `goal`, `problem`, `task`. **Entities:** `person`, `org`, `concept`, `object`. |
| `status` | no       | no         | Work items only: `open` (default), `in-progress`, `blocked`, `done`, or `dropped`. Ignored for entities. |
| `p`      | no       | no         | With marker `subject` (`["p", "<pubkey>", "", "subject"]`): on a `person` node, the **real Nostr identity** it represents (renders their profile avatar/name). |
| `a`      | no       | yes        | With marker `parent` (`["a", "32473:<pk>:<d>", "", "parent"]`): a **parent node**, forming a multi-parent hierarchy. Without a marker: an **anchor** to a related entity (custom NIP `30817:<pk>:<d>`, app `31990:<pk>:<d>`, repo `30617:<pk>:<d>`). |
| `t`      | no       | yes        | Topic tag for grouping/filtering subgraphs (relay-indexable).            |
| `p`      | no       | yes        | Pubkey of a person involved/assigned (unmarked `p` tag; notifies them).  |
| `alt`    | yes      | no         | NIP-31 human-readable description.                                       |

```jsonc
{
  "kind": 32473,
  "content": "We should converge on a single DM standard across clients...",
  "tags": [
    ["d", "interoperable-dms"],
    ["title", "Interoperable DMs everywhere"],
    ["type", "goal"],
    ["status", "open"],
    ["a", "32473:<pubkey>:nostr-roadmap", "", "parent"],
    ["a", "30817:<pubkey>:my-dm-nip"],
    ["t", "dms"],
    ["t", "interop"],
    ["p", "<assignee-pubkey>"],
    ["alt", "NostrHub plan node (goal): Interoperable DMs everywhere"]
  ]
}
```

A `person` entity node bound to a real identity:

```jsonc
{
  "kind": 32473,
  "content": "Maintains the reference DM implementation.",
  "tags": [
    ["d", "alice"],
    ["title", "Alice"],
    ["type", "person"],
    ["p", "<alice-pubkey>", "", "subject"],
    ["alt", "NostrHub plan node (person): Alice"]
  ]
}
```

**Node families.** Types split into **work items** (goal/problem/task — abstract things
with a lifecycle `status`) and **entities** (person/org/concept/object — actors and
subjects in the ecosystem, no status). A `person` may carry a `subject`-marked `p` tag
binding it to a real npub so the node renders that user's avatar and links to their
profile. A `concept` is an abstract theme or domain (e.g. "Marketing"); an `object` is a
concrete thing or artifact (e.g. an app like "Ditto"). This keeps the graph a single kind
(kind = schema, `type` = semantics) while supporting roadmap items, the people/orgs around
them, and the concepts/objects they touch.

Only the node's author can edit it (addressable replacement) or delete it (NIP-09).
`status` is managed by the author; others coordinate through NIP-22 comments on the node.

**Hierarchy & scale.** `parent` references form a multi-parent DAG (a node may have several
parents; cycles are ignored at render time). Clients derive each node's **depth** from the
hierarchy (root = 0) and use it to size nodes — sun → planet → moon → submoon. This keeps
*scale* (how broad something is, from the hierarchy) independent from *type* (its nature:
goal/problem/task). A large goal with sub-tasks renders as a sun with orbiting moons.

Clients should render **unrecognized `type` or `status` values gracefully** (e.g. fall back
to a neutral style) so the vocabulary can evolve without a coordinating server.

### Kind `39249` — Plan Edge

An **addressable** event declaring a typed, directed relationship between two nodes —
the node a relationship starts **from** and the node it points **to**, marked with
NIP-10-style markers on `a` tags. Anyone may link any two nodes (including other
people's); an edge is owned by whoever published it.

| Tag    | Required | Repeatable | Description                                                            |
| ------ | -------- | ---------- | ----------------------------------------------------------------------- |
| `d`    | yes      | no         | `"<from-address>-><to-address>"` — deterministic, so each author has at most one edge per directed pair; republishing retypes it. |
| `a`    | yes      | yes (2)    | `["a", "32473:<pk>:<d>", "", "from"]` and `["a", "32473:<pk>:<d>", "", "to"]`. |
| `type` | yes      | no         | Work-flow: `depends-on`, `blocks`, `supports`, `relates` (undirected). Relationship (for entities): `leads`, `funds`, `works-with` (undirected), `advises`, `builds`. |
| `label`| no       | no         | Short free-text annotation, e.g. "needs NIP-44 first".                  |
| `alt`  | yes      | no         | NIP-31 human-readable description.                                      |

The event `content` may hold a longer Markdown note explaining the relationship.

```jsonc
{
  "kind": 39249,
  "content": "We can't ship interop until auth lands.",
  "tags": [
    ["d", "32473:<pk-a>:fix-relay-auth->32473:<pk-b>:interoperable-dms"],
    ["a", "32473:<pk-a>:fix-relay-auth", "", "from"],
    ["a", "32473:<pk-b>:interoperable-dms", "", "to"],
    ["type", "depends-on"],
    ["label", "blocks until merged"],
    ["alt", "NostrHub plan edge: fix-relay-auth depends on interoperable-dms"]
  ]
}
```

Edges whose `from` or `to` node cannot be found (deleted, out of the author set, or not
fetched) are ignored at render time.

### Spam resistance

Like comments and chat, the graph view is scoped to the **community author set** (the
pubkeys followed by the configured experts, plus the current user). Anyone can publish
nodes and edges, but NostrHub only renders contributions from that set.

### Querying

```ts
// The whole graph in one query (two filters)
nostr.query([
  { kinds: [32473], authors: communityAuthors, limit: 500 },
  { kinds: [39249], authors: communityAuthors, limit: 1000 },
]);

// Edges touching one node (matches both roles)
nostr.query([{ kinds: [39249], "#a": ["32473:<pk>:<d>"] }]);
```

---

## Ditto Profile Theme — Kind `16767` (replaceable, consumed read-only)

NostrHub offers a **Ditto** theme option that applies the theme a user configured
in [Ditto](https://ditto.pub) (or any compatible client), published as a replaceable
kind 16767 event. NostrHub **reads** this event; it does not author it.

A theme is fundamentally **three core colors** (`background`, `text`, `primary`),
stored as **hex** in single-letter `c` tags. NostrHub derives its full token set
(cards, borders, muted, accent, `nebula`, sidebar, charts) from those three colors on
the client. Optional fonts (`f` tags) and a background image (`bg` tag) are also honored.

| Tag     | Description                                              |
| ------- | -------------------------------------------------------- |
| `c`     | Color: `["c", "#1a1a2e", "background"]` — hex + role (`background`/`text`/`primary`). |
| `f`     | Font: `["f", "<family>", "<url|empty>", "body"|"title"]`. |
| `bg`    | Background, imeta-style: `["bg", "url https://…", "mode cover", "m image/jpeg"]`. |
| `title` | Optional theme name.                                     |
| `alt`   | NIP-31 human-readable description.                       |

```jsonc
{
  "kind": 16767,
  "content": "",
  "tags": [
    ["c", "#0a1a22", "background"],
    ["c", "#e6f7ff", "text"],
    ["c", "#22d3ee", "primary"],
    ["f", "Inter", "", "body"],
    ["bg", "url https://example.com/ocean.jpg", "mode cover", "m image/jpeg"]
  ]
}
```

- NostrHub queries `{ kinds: [16767], authors: [self], limit: 1 }` for the logged-in
  user. The "Ditto" theme option only appears when such an event exists.
- Colors may alternatively appear as JSON in `content` (legacy Ditto format); both the
  current 3-color and the legacy 19-token shapes are parsed.
- When the Ditto theme carries a background image, NostrHub paints it full-viewport and
  lays a tint/scrim (derived from the theme background color) beneath the content for
  legibility.
- Filtered by `authors` — a replaceable event's author is its trust boundary.

---

## Encrypted App Settings — Kind `30078` ([NIP-78](https://github.com/nostr-protocol/nips/blob/master/78.md))

NostrHub syncs cross-device app preferences in a **single** kind 30078
application-specific-data event, **encrypted to self** with [NIP-44](https://github.com/nostr-protocol/nips/blob/master/44.md).
The decrypted `content` is a JSON object holding `theme` (the mode: `light`/`dark`/
`system`/`ditto`), `experts`, `communityCap`, `statsProvider`, `useAppBlossomServers`,
and a `lastSync` logical clock (ms). Device-local secrets (e.g. the AI API key) are
**never** synced.

| Tag     | Description                                              |
| ------- | -------------------------------------------------------- |
| `d`     | `nostrhub/metadata` — app-namespaced so multiple apps coexist on one pubkey. |
| `title` | `NostrHub Settings`.                                     |
| `client`| Client hostname.                                         |

`content` is opaque NIP-44 ciphertext. Writes merge onto the freshest relay copy and
bump `lastSync`; clients ignore remote snapshots older than the last applied one.
These settings are private to the owner — always queried with `authors: [self]`.

---

## Related standard kinds used by NostrHub

These are **not** custom — NostrHub reuses standard NIPs:

- **Kind `1111`** — Comments / discussion threads ([NIP-22](https://github.com/nostr-protocol/nips/blob/master/22.md)).
- **Kind `7` / `17`** — Reactions ([NIP-25](https://github.com/nostr-protocol/nips/blob/master/25.md) / [NIP-73](https://github.com/nostr-protocol/nips/blob/master/73.md)); legacy NIP voting, still read where useful.
- **Kind `3`** — Follow lists ([NIP-02](https://github.com/nostr-protocol/nips/blob/master/02.md)); used to derive the community author set from experts.
- **Kind `0`** — Profile metadata ([NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md)).
- **Kind `9`** — Community chat messages ([NIP-C7](https://github.com/nostr-protocol/nips/blob/master/C7.md)); see the dedicated section above.
- **Kind `31990`** — App listings ([NIP-89](https://github.com/nostr-protocol/nips/blob/master/89.md) Handler Information); powers the `/apps` directory.
- **Kind `31986`** — App compatibility reports (proposed NIP-85 Reviews, Borkstr-compatible); see the dedicated section above.
- **Kind `31234`** — Encrypted drafts ([NIP-37](https://github.com/nostr-protocol/nips/blob/master/37.md) Draft Wraps); see below.

---

## Drafts — Kind `31234` ([NIP-37](https://github.com/nostr-protocol/nips/blob/master/37.md))

Manual drafts for unfinished community NIPs (kind `30817`) and long-form articles
(kind `30023`) are stored as standard NIP-37 Draft Wraps. The unsigned draft event —
the exact `{ kind, content, tags }` that would be published — is JSON-stringified,
**NIP-44-encrypted to the author's own pubkey**, and placed in `.content`. Drafts are
therefore private to their owner and sync across the user's devices.

Each draft has a unique `d` tag, so a user can keep several in flight at once. A
blanked `.content` signals deletion per NIP-37.

### Tags

| Tag          | Required | Description                                                                 |
| ------------ | -------- | --------------------------------------------------------------------------- |
| `d`          | yes      | Unique draft identifier (`draft-<ts>-<rand>`).                              |
| `k`          | yes      | Kind of the wrapped draft event: `30817` (NIP) or `30023` (article).        |
| `expiration` | no       | NIP-40 expiration; set to ~90 days out, as recommended by NIP-37.           |

### Querying

```ts
// Always scoped to self; content is encrypted to the owner.
nostr.query([{ kinds: [31234], authors: [user.pubkey], limit: 100 }]);
// Decrypt content with the owner's NIP-44 key, then route by the `k` tag.
```
