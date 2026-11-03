---
name: subscriptions
description: Follow Linear issues from this thread; get a short message when one changes. GitHub pull requests belong to the Pull Requests plugin.
---

# Subscriptions

Use the `thread_subscriptions` tool (or `bb subscriptions`) when the user asks to follow, watch, subscribe to, or stop watching a Linear issue.

- `platform` is `linear`. IDs are `ENG-123` or a Linear issue URL. Up to 50 IDs per call, 100 per thread.
- GitHub pull requests are not handled here. Use the `pull_request_subscriptions` tool or `bb pull-requests subscribe <url>`; the Pull Requests plugin also imports any GitHub subscriptions this plugin recorded before the split.
- Subscribing is idempotent. The first successful check is a silent baseline; later changes arrive as `[Subscription update] …` messages in this thread. Changes are coalesced: one message per thread covering everything since you last read one, so a message may list several items or several changes to one item.
- `list` shows each item's last state or its current error. "waiting for first check" is normal for about a minute after subscribing.
- Linear needs a personal API key in plugin settings (`bb plugin config subscriptions set linearApiKey …`). Only the **Read** permission is required. If every Linear item reports "API key not set" or "rejected", that setting is the fix; do not retry in a loop.
- A "rate limit" or "budget" error pauses Linear until its hourly window resets. Nothing is lost; the next check runs after the pause.
