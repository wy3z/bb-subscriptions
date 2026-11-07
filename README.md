# Subscriptions for bb

> Fork of [grrowl/bb-subscriptions](https://github.com/grrowl/bb-subscriptions)
> that shows subscriptions as a **Listening** pill above the composer instead
> of a count in the thread heading.

A small bb plugin that follows **Linear issues** for a thread, read directly
from Linear's API with a **read-only** personal key. It stores the last
observed state and sends a short thread message when something changes. An
idle thread wakes; a busy thread gets a queued message.

GitHub pull requests are not followed here any more: the
[Pull Requests](https://github.com/wy3z/bb-plugin-pull-requests) plugin owns
them, including the ones this plugin recorded before the split (it imports
them on first start, read-only, so nothing needs re-subscribing).

```sh
bb subscriptions subscribe linear ENG-123 ENG-124
bb subscriptions unsubscribe linear ENG-123
bb subscriptions list --json
```

`sub` / `unsub` are aliases. IDs can be separated by spaces or commas; issue
URLs also work. Bulk commands accept up to 50 IDs and are validated before any
subscription changes. Subscriptions are per thread, idempotent, and capped at
100 per thread. Outside a thread, pass `--thread <thread-id>`.

Agents can use the `thread_subscriptions` tool, with `action`, `platform`, and
`ids`. This makes requests such as “subscribe linear ENG-123 ENG-124” work
through the agent. The generated bb command help also exposes the CLI. The
plugin adds no management panel: just a **Listening** chip in the row above the
composer with the count, after Cursor's subscriptions pill. It opens a tray
headed "N Subscriptions" with one row per item: the Linear logo, a sentence
such as "Issue activity on ENG-123", the item's current state or error, and
when it was last checked. Hovering swaps the time for a remove button; clicking
a row opens the issue. The chip is hidden when the thread has no subscriptions.
It carries its own copy of the pill and tray styles under `bb-subs__` classes,
so it needs no other plugin and cannot restyle anything outside its own chip.

## Why a plugin?

The Linear API already provides the reads. The missing part is a durable watcher that remains active after an agent turn and delivers a message into that same thread. This plugin supplies that lifecycle, subscription storage, retry behavior, thread deletion cleanup, and a small count.

A bb scheduled script plus `bb thread tell` is a valid alternative for a few fixed watches; native agent “wake on external change” is not required. For reusable bulk subscription commands and per-thread state, a thin plugin keeps those responsibilities together.

## Install

Requires bb >=0.49 (for the context-row slot the pill uses) and SDK >=0.6.132. Linear needs no CLI: create a personal API key and set it as a plugin secret.

```sh
npm ci
bb plugin build
bb plugin install . --yes
```

### Linear API key

In Linear open **Settings → Account → Security & access → Personal API keys** and create a key. **Only the Read permission is needed**; you can also limit the key to the teams you will follow. Then:

```sh
bb plugin config subscriptions set linearApiKey lin_api_…
```

The key is stored as a plugin secret (a 0600 file under the plugin data directory), never in the database or the browser. The plugin sends read-only GraphQL queries and never writes to Linear, and registers no webhooks. If Linear refuses to let you create a key, a workspace admin has disabled member keys under Administration → API.

Optional settings:

```sh
bb plugin config subscriptions set intervalSeconds 60
# Changes seen within this window go out as one message (default 10; 0 sends at once)
bb plugin config subscriptions set debounceSeconds 10
```

## Behavior

- Checks due items every five seconds, with a default per-item interval of 60 seconds (configurable 30–3600). First successful read establishes a silent baseline. `list` shows pending/error until it succeeds.
- Linear: status, assignee, priority, labels and latest comment. A changed update timestamp without a specific field difference produces “updated”.
- Example: `[Subscription update] [ENG-123](https://linear.app/acme/issue/ENG-123/…): In Progress → Done; assignee: none → Sam.` Several items changing together become one bulleted message.
- **One message per thread, never a stack.** A brand-new message is held for `debounceSeconds` so changes arriving together go out as one. If the thread is busy, bb queues the message and the plugin remembers it; any further change rewrites that same queued message straight away (no debounce) with the full diff since the agent last looked, so an idle agent always reads one current summary rather than several stale ones. Once the message is read (or removed from the queue), the next change starts a new one.
- Unchanged snapshots do not send, and a bumped `updatedAt` with no tracked field change is ignored. Failed reads/sends retain the previous baseline and back off, up to an hour. Requests are cancelled on shutdown/reload.
- Each sweep makes one batched Linear request per 50 due issues. A Linear `RATELIMITED` reply, or fewer than 100 requests left in the hourly window, pauses all Linear checks until the window resets (Linear allows 2 500 requests per user per hour, shared across all of that user's keys). A missing or rejected key pauses Linear for an hour; changing any setting lifts the pause immediately.
- Lookups are shared for identical items in each sweep, and each thread is looked up once per sweep. Delivery is serialized against unsubscribe and checks subscription identity after fetching, so removing a subscription prevents a stale lookup from sending.
- SQLite state survives reload/restart. Archived threads pause checks; deleted threads lose their subscriptions. Subscriptions remain after an issue completes, so reopening is observable.

This is polling of **observed state**, not a complete event log: intermediate transitions between checks, older comment edits, and changes made and reverted while bb is offline may not be reported. Label lists are bounded to 100. Checks run only while bb is running and the plugin is enabled. Heavy subscription loads or provider failures delay delivery. A crash between accepting a thread message and persisting its snapshot can produce a duplicate on retry; the current SDK send operation has no idempotency key.

## Development

```sh
npm ci
npm run typecheck
npm test
bb plugin build
# Optional read-only live smoke tests. Linear needs a key in the environment:
SUBSCRIPTIONS_LIVE=1 LINEAR_API_KEY=lin_api_… npm test -- providers.live.test.ts
```

If every server test fails with "Could not locate the bindings file", `npm ci` did not fetch a `better-sqlite3` binary for your Node version. Run `npx prebuild-install` inside `node_modules/better-sqlite3` (or `npm rebuild better-sqlite3`) once.

Tests cover bulk/scoped commands, normalization, silent baselines, change delivery, failed-send retry, unsubscribe races, batched lookups, provider pauses, Linear request shape and rate-limit handling, archived/deleted threads, reload persistence, backoff, public SDK imports, the heading count, and the GitHub rows left behind for the Pull Requests plugin (never listed, checked, or turned into messages). The opt-in live test reads one accessible Linear issue; it changes no provider or thread state.

### Adding a service

Implement the `Provider` interface from `providers/types.ts` in a new file under `providers/` (ID normalisation, a batched `fetch` that maps into the generic `Snapshot`, and any settings it needs, prefixed with the provider id), then add it to the `providers` array in `providers/index.ts`. The platform enum, settings page, CLI help, and agent tool description are all derived from that array — so rows recorded for a provider that is no longer registered stay in the table but are never listed or checked.
