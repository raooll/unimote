import ReactTestRenderer, { act } from 'react-test-renderer';
import type { Remote } from '../src/api/types';
import { RemoteRenderer } from '../src/components/remote/RemoteRenderer';
import type { LayoutPrefs } from '../src/lib/remoteLayout';
import { irRemote } from '../__fixtures__/remotes';

// A TV with number keys, so the "numbers hidden by default" behaviour has something to hide.
const sig = { frequency: 38000, duty_cycle: 0.33, pattern: [9000, 4500, 560, 560, 560] };
const withNumbers: Remote = {
  ...irRemote,
  layout: {
    name: 'TV',
    sections: [
      ...irRemote.layout!.sections,
      { id: 'keypad', type: 'keypad', buttons: [...'123456789'.split('').map(n => ({ key: n })), { key: 'LAST', label: 'Last' }, { key: '0' }, { key: 'GUIDE', label: 'Guide' }] },
    ],
  },
  signal_data: {
    ...irRemote.signal_data,
    commands: { ...(irRemote.signal_data as { commands: Record<string, unknown> }).commands, ...Object.fromEntries(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'LAST', 'GUIDE'].map(k => [k, sig])) },
  } as Remote['signal_data'],
};

function render(opts: { remote?: Remote; prefs?: LayoutPrefs; editing?: boolean; onPress?: jest.Mock; onPrefs?: jest.Mock } = {}) {
  const onPress = opts.onPress ?? jest.fn();
  const onPrefs = opts.onPrefs ?? jest.fn();
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    tree = ReactTestRenderer.create(
      <RemoteRenderer remote={opts.remote ?? irRemote} prefs={opts.prefs} onPrefs={onPrefs} editing={!!opts.editing} onPress={onPress} />,
    );
  });
  const labels = () => tree.root.findAll(n => n.props.accessibilityRole === 'button' && typeof n.props.onPressIn === 'function').map(n => n.props.accessibilityLabel);
  const byLabel = (label: string) => tree.root.find(n => n.props.accessibilityLabel === label && n.props.accessibilityRole === 'button');
  return { tree, labels, byLabel, onPress, onPrefs };
}

describe('RemoteRenderer', () => {
  it('shows only buttons the remote has a signal for', () => {
    const { labels } = render();
    expect(labels()).toEqual(expect.arrayContaining(['Power', 'Vol +']));
    expect(labels()).not.toEqual(expect.arrayContaining(['Mute', 'Vol -', 'Play', 'Stop']));
  });

  it('does not show commands that no layout button covers', () => {
    expect(render().labels()).not.toContain('Netflix');
  });

  it('reports the canonical command name when pressed', () => {
    const { tree, onPress } = render();
    const power = tree.root.find(n => n.props.accessibilityLabel === 'Power' && typeof n.props.onPressIn === 'function');
    act(() => power.props.onPressIn());
    act(() => power.props.onPressOut());
    expect(onPress).toHaveBeenCalledWith('POWER');
  });

  describe('number keys', () => {
    it('are hidden by default, with Last and Guide still on screen', () => {
      const { labels } = render({ remote: withNumbers });
      expect(labels()).not.toEqual(expect.arrayContaining(['1', '5', '0']));
      expect(labels()).toEqual(expect.arrayContaining(['Last', 'Guide', 'Power']));
    });

    it('offer a Numbers button that asks to show them', () => {
      const { byLabel, onPrefs } = render({ remote: withNumbers });
      act(() => byLabel('Show number keys').props.onPress());
      expect(onPrefs).toHaveBeenCalledWith({ showNumbers: true });
    });

    it('appear once the user asked for them, and can be folded away again', () => {
      const { labels, byLabel, onPrefs } = render({ remote: withNumbers, prefs: { showNumbers: true } });
      expect(labels()).toEqual(expect.arrayContaining(['1', '2', '9', '0']));
      act(() => byLabel('Hide number keys').props.onPress());
      expect(onPrefs).toHaveBeenCalledWith({ showNumbers: false });
    });

    it('send their command when pressed', () => {
      const { tree, onPress } = render({ remote: withNumbers, prefs: { showNumbers: true } });
      const five = tree.root.find(n => n.props.accessibilityLabel === '5' && typeof n.props.onPressIn === 'function');
      act(() => five.props.onPressIn());
      act(() => five.props.onPressOut());
      expect(onPress).toHaveBeenCalledWith('5');
    });
  });

  describe("the user's own layout", () => {
    it('leaves out buttons the user hid', () => {
      const { labels } = render({ remote: withNumbers, prefs: { hidden: ['GUIDE'] } });
      expect(labels()).not.toContain('Guide');
      expect(labels()).toContain('Last');
    });

    it('leaves out blocks the user hid', () => {
      const { labels } = render({ remote: withNumbers, prefs: { hiddenBlocks: ['rockers'] } });
      expect(labels()).not.toContain('Vol +');
    });

    it('puts buttons in the order the user chose', () => {
      const { labels } = render({ remote: withNumbers, prefs: { order: { more: ['GUIDE', 'LAST'] } } });
      expect(labels().indexOf('Guide')).toBeLessThan(labels().indexOf('Last'));
    });
  });

  describe('edit mode', () => {
    it('shows the numbers even when folded, so they can be arranged', () => {
      const { tree } = render({ remote: withNumbers, editing: true });
      expect(JSON.stringify(tree.toJSON())).toContain('"5"');
    });

    it('never sends a command while buttons are being moved', () => {
      const { tree, onPress } = render({ editing: true });
      const power = tree.root.find(n => n.props.accessibilityLabel === 'Power' && typeof n.props.onPressIn === 'function');
      act(() => power.props.onPressIn());
      expect(onPress).not.toHaveBeenCalled();
    });

    it('hides a button with its × and lists it so it can be brought back', () => {
      const first = render({ remote: withNumbers, editing: true });
      act(() => first.byLabel('Hide Guide').props.onPress());
      expect(first.onPrefs).toHaveBeenCalledWith({ hidden: ['GUIDE'] });

      const again = render({ remote: withNumbers, editing: true, prefs: { hidden: ['GUIDE'] } });
      expect(again.labels()).not.toContain('Guide');
      act(() => again.byLabel('Bring back Guide').props.onPress());
      expect(again.onPrefs).toHaveBeenCalledWith({ hidden: [] });
    });

    it('moves a whole block up or down', () => {
      const { byLabel, onPrefs } = render({ editing: true });
      act(() => byLabel('Move Volume and channel up').props.onPress());
      expect(onPrefs).toHaveBeenCalledWith({ blocks: ['rockers', 'power'] }) // media has no signals here, so it isn't drawn;
    });
  });
});
