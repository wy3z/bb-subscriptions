import './app.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  definePluginApp,
  experimental_Icon as Icon,
  experimental_THREAD_CONTEXT_SEGMENT_GROUPS,
  useRealtime,
  useRealtimeConnectionState,
  useRpc,
} from '@get-bb/plugin-sdk/app';
import type { rpcContract } from './server';
import type { Subscription } from './model';

function subscriptionUrl(item: Subscription): string | undefined {
  const url = item.snapshot?.url ?? (item.platform === 'github'
    ? `https://github.com/${item.id.replace('#', '/pull/')}` : undefined);
  return url && /^https?:\/\//i.test(url) ? url : undefined;
}

/** This thread's subscriptions, kept fresh over realtime and reconnects. */
function useSubscriptions(threadId: string) {
  const rpc = useRpc<typeof rpcContract>();
  const [items, setItems] = useState<Subscription[]>([]);
  const requestId = useRef(0);
  const connection = useRealtimeConnectionState();
  const refresh = useCallback(async () => {
    const request = ++requestId.current;
    try {
      const result = await rpc.call('list', { threadId });
      if (request === requestId.current) setItems(result.subscriptions);
    } catch { /* Keep the last known list during disconnects. */ }
  }, [rpc, threadId]);
  useEffect(() => { setItems([]); void refresh(); return () => { requestId.current++; }; }, [refresh]);
  useEffect(() => { if (connection === 'connected') void refresh(); }, [connection, refresh]);
  useRealtime('subscriptions-changed', () => { void refresh(); });
  return { items, refresh, rpc };
}

function ago(now: number, at: number): string {
  const seconds = Math.max(0, Math.floor((now - at) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ago`;
}

const FIRST_PAGE = 5;
const NEXT_PAGE = 8;

/**
 * Cursor's row sentence (subscription-row-display.js): an action, a
 * connective and an object, such as "PR activity on #42".
 */
function sentence(item: Subscription): { action: string; connective: string; object: string } {
  if (item.platform === 'github') {
    const hash = item.id.lastIndexOf('#');
    return { action: 'PR activity', connective: 'on', object: hash >= 0 ? item.id.slice(hash) : item.id };
  }
  if (item.platform === 'linear') return { action: 'Issue activity', connective: 'on', object: item.id };
  return { action: 'Activity', connective: 'on', object: item.id };
}

function LinearMark() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor">
    <path d="M2.9 13.5 10.5 21.1A9.5 9.5 0 0 1 2.9 13.5Zm-.4-2.6L13.1 21.5c.8-.1 1.6-.3 2.3-.6L3.1 8.6c-.3.7-.5 1.5-.6 2.3Zm1.6-3.9L17 19.9c.6-.4 1.1-.8 1.6-1.3L5.4 5.4C4.9 5.9 4.5 6.4 4.1 7Zm3-2.9A9.5 9.5 0 0 1 19.9 16.9L7.1 4.1Z" />
  </svg>;
}

function SourceIcon({ platform }: { platform: string }) {
  if (platform === 'github') return <Icon name="Github" />;
  if (platform === 'linear') return <LinearMark />;
  return <Icon name="BellDot" />;
}

/**
 * A "Listening 2" chip in the row above the composer, after Cursor's
 * subscriptions pill, opening its tray: "N Subscriptions", then a row per
 * item with the source logo, "PR activity on #42", the item's state, and when
 * it was last checked, which hover swaps for a remove button.
 */
function ListeningPill({ threadId }: { threadId: string }) {
  const { items, refresh, rpc } = useSubscriptions(threadId);
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(FIRST_PAGE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => { setOpen(false); setError(null); }, [threadId]);
  useEffect(() => {
    if (!open) { setShown(FIRST_PAGE); return; }
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      clearInterval(timer);
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  async function unsubscribe(target: Subscription) {
    setBusy(true);
    setError(null);
    try {
      await rpc.call('unsubscribe', { threadId, platform: target.platform, ids: [target.id] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not remove the subscription. Please try again.');
    } finally {
      await refresh();
      setBusy(false);
    }
  }

  if (!items.length) return null;
  const count = items.length;
  const hidden = Math.max(0, count - shown);
  return <div className="bb-agent-pills bb-subs" data-bb-agent-pills="" ref={root}>
    <div className="bb-agent-pills__row">
      <button
        type="button"
        className="bb-agent-pills__pill"
        data-group="listening"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`View subscriptions (${count})`}
        title={`View subscriptions (${count})`}
        onClick={() => setOpen(value => !value)}
      >
        <span className="bb-agent-pills__label">Listening</span>
        <span className="bb-agent-pills__chip-count">{count}</span>
      </button>
    </div>
    {open && <div className="bb-agent-pills__panel bb-agent-pills__tray" role="menu" aria-label="Subscriptions">
      <div className="bb-agent-pills__tray-header">
        <span className="bb-agent-pills__tray-title">{count} {count === 1 ? 'Subscription' : 'Subscriptions'}</span>
        <button type="button" className="bb-agent-pills__tray-icon-button" aria-label="Minimize" title="Minimize (Esc)" onClick={() => setOpen(false)}>
          <Icon name="Minus" />
        </button>
      </div>
      <div className="bb-agent-pills__tray-rows">
        {items.slice(0, shown).map(item => {
          const url = subscriptionUrl(item);
          const words = sentence(item);
          const label = `${words.action} ${words.connective} ${words.object}`;
          const state = item.error ?? item.snapshot?.state ?? 'Checking';
          return <div
            key={`${item.platform}:${item.id}`}
            role="menuitem"
            tabIndex={0}
            aria-label={label}
            aria-disabled={url ? undefined : true}
            className="bb-agent-pills__tray-row bb-subs__row"
            title={item.snapshot?.title ? `${item.snapshot.title} (${item.id})` : item.id}
            onClick={() => { if (url) window.open(url, '_blank', 'noopener,noreferrer'); }}
            onKeyDown={event => {
              if ((event.key === 'Enter' || event.key === ' ') && url) {
                event.preventDefault();
                window.open(url, '_blank', 'noopener,noreferrer');
              }
            }}
          >
            <span className="bb-agent-pills__tray-leading" aria-hidden="true"><SourceIcon platform={item.platform} /></span>
            <span className="bb-agent-pills__tray-label">
              {words.action} <span className="bb-subs__connective">{words.connective}</span> {words.object}
            </span>
            <span className="bb-agent-pills__tray-description" data-error={item.error ? '' : undefined}>{state}</span>
            <span className="bb-agent-pills__tray-end">
              <span className="bb-agent-pills__tray-actions">
                <button
                  type="button"
                  disabled={busy}
                  className="bb-agent-pills__tray-icon-button"
                  aria-label={`Remove subscription ${label}`}
                  title="Remove Subscription"
                  onClick={event => { event.stopPropagation(); void unsubscribe(item); }}
                >
                  <Icon name="Trash2" />
                </button>
              </span>
              <span className="bb-agent-pills__tray-meta">{item.checkedAt ? ago(now, item.checkedAt) : ''}</span>
            </span>
          </div>;
        })}
        {hidden > 0 && <button
          type="button"
          className="bb-agent-pills__tray-more"
          aria-label={`Show ${Math.min(hidden, NEXT_PAGE)} more ${Math.min(hidden, NEXT_PAGE) === 1 ? 'subscription' : 'subscriptions'}`}
          onClick={() => setShown(value => value + NEXT_PAGE)}
        >More</button>}
      </div>
      {error && <p role="alert" className="bb-subs__error">{error}</p>}
    </div>}
  </div>;
}

export default definePluginApp(app => {
  app.slots.experimental_threadContextSegment({
    id: 'listening',
    title: 'Subscriptions',
    group: experimental_THREAD_CONTEXT_SEGMENT_GROUPS.thread,
    // After Agent Pills' activity pills (order 20).
    order: 30,
    summary: ListeningPill,
    useVisible: ({ threadId }) => useSubscriptions(threadId).items.length > 0,
  });
});
