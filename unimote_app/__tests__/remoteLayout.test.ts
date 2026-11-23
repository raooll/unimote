import type { Remote } from '../src/api/types';
import { applyPrefs, buildBlocks, columnsFor, dropTarget, moveBlock, reorderKeys, sortByOrder, NUMBERS_ID } from '../src/lib/remoteLayout';

const btn = (key: string, label?: string, icon?: string) => ({ key, ...(label ? { label } : {}), ...(icon ? { icon } : {}) });

const tv = {
  layout: {
    name: 'TV',
    sections: [
      { id: 'power', type: 'row', buttons: [btn('POWER'), btn('MUTE')] },
      { id: 'nav', type: 'dpad', buttons: [btn('UP'), btn('DOWN'), btn('LEFT'), btn('RIGHT'), btn('OK')] },
      { id: 'rockers', type: 'rocker', rockers: [{ label: 'Vol', up: btn('VOL_UP'), down: btn('VOL_DOWN') }] },
      { id: 'keypad', type: 'keypad', buttons: [...'123456789'.split('').map(n => btn(n)), btn('LAST'), btn('0'), btn('GUIDE')] },
    ],
  },
  signal_data: {
    commands: Object.fromEntries(
      ['POWER', 'MUTE', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'OK', 'VOL_UP', 'VOL_DOWN', 'LAST', 'GUIDE', 'EXTRA_KEY', ...'0123456789'.split('')].map(k => [k, {}]),
    ),
  },
} as unknown as Pick<Remote, 'layout' | 'signal_data'>;

describe('buildBlocks', () => {
  const blocks = buildBlocks(tv);
  const byId = Object.fromEntries(blocks.map(b => [b.id, b]));

  it('splits the keypad: digits become a Numbers block, Last/Guide stay visible as More', () => {
    expect(byId[NUMBERS_ID].buttons.map(b => b.key)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']);
    expect(byId.more.buttons.map(b => b.key)).toEqual(['LAST', 'GUIDE']);
    expect(blocks.findIndex(b => b.id === 'more')).toBeLessThan(blocks.findIndex(b => b.id === NUMBERS_ID));
  });

  it('keeps a D-pad and a rocker as fixed shapes', () => {
    expect(byId.nav.reorderable).toBe(false);
    expect(byId.rockers.reorderable).toBe(false);
    expect(byId.power.reorderable).toBe(true);
  });

  it('does not show commands no template button covers', () => {
    expect(blocks.flatMap(b => b.buttons.map(x => x.key))).not.toContain('EXTRA_KEY');
  });

  it('drops buttons the remote has no command for', () => {
    const noMute = { ...tv, signal_data: { commands: { POWER: {} } } } as unknown as typeof tv;
    const b = buildBlocks(noMute);
    expect(b.map(x => x.id)).toEqual(['power']);
    expect(b[0].buttons.map(x => x.key)).toEqual(['POWER']);
  });

  it('shows a lone OK as a row and skips ac_state sections', () => {
    const r = {
      layout: { name: 'x', sections: [{ id: 'nav', type: 'dpad', buttons: [btn('OK')] }, { id: 'ac', type: 'ac_state' }] },
      signal_data: { commands: { OK: {} } },
    } as unknown as typeof tv;
    expect(buildBlocks(r).map(b => [b.id, b.type])).toEqual([['nav', 'row']]);
  });

  it('survives a remote with no layout at all', () => {
    const r = { layout: null, signal_data: { commands: { A: {}, B: {} } } } as unknown as typeof tv;
    expect(buildBlocks(r)).toEqual([]);
  });
});

describe('arrow names', () => {
  it('finds the arrows when a remote calls them UP_ARROW, DN_ARROW and so on', () => {
    const r = {
      layout: { name: 'x', sections: [{ id: 'nav', type: 'dpad', buttons: [btn('UP'), btn('DOWN'), btn('LEFT'), btn('RIGHT'), btn('OK')] }] },
      signal_data: { commands: Object.fromEntries(['UP_ARROW', 'DN_ARROW', 'LEFT_ARROW', 'RIGHT_ARROW', 'OK'].map(k => [k, {}])) },
    } as unknown as typeof tv;
    const [b] = buildBlocks(r);
    expect(b.type).toBe('dpad');
    expect(b.buttons.map(x => x.key)).toEqual(['UP_ARROW', 'DN_ARROW', 'LEFT_ARROW', 'RIGHT_ARROW', 'OK']);
  });
});

describe('applyPrefs', () => {
  const blocks = buildBlocks(tv);

  it('changes nothing without preferences', () => {
    const out = applyPrefs(blocks, undefined);
    expect(out.blocks.map(b => b.id)).toEqual(blocks.map(b => b.id));
    expect(out.hiddenButtons).toEqual([]);
  });

  it('orders blocks and buttons the way the user asked, keeping new ones at the end', () => {
    const out = applyPrefs(blocks, { blocks: ['nav', 'power'], order: { power: ['MUTE', 'POWER'] } });
    expect(out.blocks.slice(0, 2).map(b => b.id)).toEqual(['nav', 'power']);
    expect(out.blocks[1].buttons.map(b => b.key)).toEqual(['MUTE', 'POWER']);
    expect(out.blocks.length).toBe(blocks.length);
  });

  it('removes hidden buttons but lists them so they can be restored', () => {
    const out = applyPrefs(blocks, { hidden: ['MUTE'] });
    expect(out.blocks.find(b => b.id === 'power')!.buttons.map(b => b.key)).toEqual(['POWER']);
    expect(out.hiddenButtons).toEqual([{ block: 'power', button: expect.objectContaining({ key: 'MUTE' }) }]);
  });

  it('flags hidden blocks instead of dropping them (edit mode still shows them)', () => {
    const out = applyPrefs(blocks, { hiddenBlocks: ['nav'] });
    expect(out.blocks.find(b => b.id === 'nav')!.hidden).toBe(true);
    expect(out.blocks.find(b => b.id === 'power')!.hidden).toBe(false);
  });

  it('ignores saved keys that no longer exist', () => {
    const out = applyPrefs(blocks, { order: { power: ['GONE', 'MUTE'] }, blocks: ['ghost', 'nav'] });
    expect(out.blocks[0].id).toBe('nav');
    expect(out.blocks.find(b => b.id === 'power')!.buttons.map(b => b.key)).toEqual(['MUTE', 'POWER']);
  });
});

describe('reordering helpers', () => {
  it('reorderKeys moves the dragged key into the target slot', () => {
    expect(reorderKeys(['a', 'b', 'c', 'd'], 'a', 'c')).toEqual(['b', 'c', 'a', 'd']);
    expect(reorderKeys(['a', 'b', 'c', 'd'], 'd', 'a')).toEqual(['d', 'a', 'b', 'c']);
    expect(reorderKeys(['a', 'b'], 'a', 'a')).toEqual(['a', 'b']);
    expect(reorderKeys(['a', 'b'], 'x', 'a')).toEqual(['a', 'b']);
  });

  it('sortByOrder is stable for unknown keys', () => {
    expect(sortByOrder(['x', 'y', 'z'], k => k, ['z'])).toEqual(['z', 'x', 'y']);
    expect(sortByOrder(['x', 'y'], k => k, undefined)).toEqual(['x', 'y']);
  });

  it('moveBlock swaps with a neighbour and stops at the ends', () => {
    expect(moveBlock(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveBlock(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
    expect(moveBlock(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c']);
    expect(moveBlock(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'b', 'c']);
  });

  it('dropTarget picks the slot under the finger, the nearest one in a gap, and nothing when far away', () => {
    const rects = {
      a: { x: 0, y: 0, width: 100, height: 60 },
      b: { x: 110, y: 0, width: 100, height: 60 },
      c: { x: 220, y: 0, width: 100, height: 60 },
    };
    expect(dropTarget(rects, { x: 150, y: 30 }, 'a')).toBe('b');
    expect(dropTarget(rects, { x: 104, y: 30 }, 'c')).toBe('a'); // in the gap: a's centre (50) is nearer than b's (160)
    expect(dropTarget(rects, { x: 100, y: 30 }, 'a')).toBe('b'); // never the dragged item itself
    expect(dropTarget(rects, { x: 150, y: 900 }, 'a')).toBeNull();
  });

  it('columnsFor keeps buttons wide enough to hit', () => {
    expect(columnsFor('grid', 6)).toBe(3);
    expect(columnsFor('grid', 1)).toBe(1); // a lone button is not squeezed into a third of the width
    expect(columnsFor('grid', 2)).toBe(2);
    expect(columnsFor('keypad', 10)).toBe(3);
    expect(columnsFor('row', 2)).toBe(2);
    expect(columnsFor('row', 4)).toBe(4);
    expect(columnsFor('row', 5)).toBe(5);
    expect(columnsFor('row', 6)).toBe(3);
    expect(columnsFor('row', 0)).toBe(1);
  });
});
