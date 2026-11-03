// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { loadPluginApp, renderSlot } from '@get-bb/plugin-sdk/testing/app';
import type { Subscription } from './model';
afterEach(() => { cleanup(); vi.useRealTimers(); });
async function setup(initial: Subscription[], fail = false) {
  let items = initial;
  const unsubscribe = vi.fn((input: { threadId: string; platform: string; ids: string[] }) => {
    if (fail) throw new Error('Removal failed');
    items = items.filter(item => item.platform !== input.platform || !input.ids.includes(item.id));
    return { ids: input.ids };
  });
  const app = await loadPluginApp(() => import('./app'));
  const slot = renderSlot(app.threadContextSegments[0]!.summary, { threadId: 't1', projectId: 'p1', environment: null } as never, {
    rpc: { list: input => {
      expect(input).toEqual({ threadId: 't1' });
      return { subscriptions: items, intervalSeconds: 60 };
    }, unsubscribe: input => unsubscribe(input as { threadId: string; platform: string; ids: string[] }) },
  });
  fireEvent.click(await slot.findByRole('button', { name: /^View subscriptions / }));
  return { slot, unsubscribe };
}
const item = (platform: string, id: string, checkedAt: number | null = null): Subscription => ({ platform, id, snapshot: null, error: null, checkedAt });
it('opens a row in a new tab: the PR page or the issue snapshot URL', async () => {
  const issue = item('linear', 'ENG-1');
  issue.snapshot = { title: 'An issue', url: 'https://linear.app/acme/issue/ENG-1/an-issue', state: 'Todo', updatedAt: '', fields: {} };
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  const { slot, unsubscribe } = await setup([item('github', 'org/repo#42'), issue]);
  fireEvent.click(screen.getByRole('menuitem', { name: 'PR activity on #42' }));
  expect(open).toHaveBeenCalledWith('https://github.com/org/repo/pull/42', '_blank', 'noopener,noreferrer');
  fireEvent.click(screen.getByRole('menuitem', { name: 'Issue activity on ENG-1' }));
  expect(open).toHaveBeenCalledWith(issue.snapshot.url, '_blank', 'noopener,noreferrer');
  expect(screen.getByText('Todo')).toBeTruthy();
  expect(unsubscribe).not.toHaveBeenCalled();
  open.mockRestore();
  slot.lifecycle.unmount();
});
it('heads the tray with the count and updates the last check time every second', async () => {
  const { slot } = await setup([item('linear', 'ENG-1', Date.now() - 5000)]);
  expect(screen.getByText('1 Subscription')).toBeTruthy();
  expect(screen.getByText('5s ago')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /^View subscriptions / }));
  vi.useFakeTimers();
  fireEvent.click(screen.getByRole('button', { name: /^View subscriptions / }));
  act(() => { vi.advanceTimersByTime(2000); });
  expect(screen.getByText('7s ago')).toBeTruthy();
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
  expect(screen.queryByText('1 Subscription')).toBeNull();
  slot.lifecycle.unmount();
});
it('removes one subscription from its row', async () => {
  const { slot, unsubscribe } = await setup([item('linear', 'ENG-1'), item('linear', 'ENG-2'), item('github', 'org/repo#1')]);
  expect(screen.getByText('3 Subscriptions')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Remove subscription Issue activity on ENG-1' }));
  await waitFor(() => expect(screen.queryByRole('menuitem', { name: 'Issue activity on ENG-1' })).toBeNull());
  expect(unsubscribe).toHaveBeenCalledWith({ threadId: 't1', platform: 'linear', ids: ['ENG-1'] });
  expect(screen.getByText('2 Subscriptions')).toBeTruthy();
  slot.lifecycle.unmount();
});
it('keeps subscriptions visible and displays removal failures', async () => {
  const { slot } = await setup([item('linear', 'ENG-1')], true);
  fireEvent.click(screen.getByRole('button', { name: 'Remove subscription Issue activity on ENG-1' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Removal failed');
  expect(screen.getByRole('menuitem', { name: 'Issue activity on ENG-1' })).toBeTruthy();
  slot.lifecycle.unmount();
});
