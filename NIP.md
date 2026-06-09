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

---

## Related standard kinds used by NostrHub

These are **not** custom — NostrHub reuses standard NIPs:

- **Kind `1111`** — Comments / discussion threads ([NIP-22](https://github.com/nostr-protocol/nips/blob/master/22.md)).
- **Kind `7` / `17`** — Reactions ([NIP-25](https://github.com/nostr-protocol/nips/blob/master/25.md) / [NIP-73](https://github.com/nostr-protocol/nips/blob/master/73.md)); legacy NIP voting, still read where useful.
- **Kind `3`** — Follow lists ([NIP-02](https://github.com/nostr-protocol/nips/blob/master/02.md)); used to derive the community author set from experts.
- **Kind `0`** — Profile metadata ([NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md)).
- **Kind `9`** — Community chat messages ([NIP-C7](https://github.com/nostr-protocol/nips/blob/master/C7.md)); see the dedicated section above.
