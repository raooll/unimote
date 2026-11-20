import ReactTestRenderer, { act } from 'react-test-renderer';
import { RemoteRenderer } from '../src/components/remote/RemoteRenderer';
import { irRemote } from '../__fixtures__/remotes';

function render(onPress = jest.fn()) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    tree = ReactTestRenderer.create(<RemoteRenderer remote={irRemote} onPress={onPress} />);
  });
  const labels = () => tree.root.findAll(n => n.props.accessibilityRole === 'button' && typeof n.props.onPressIn === 'function').map(n => n.props.accessibilityLabel);
  return { tree, labels, onPress };
}

describe('RemoteRenderer', () => {
  it('shows only buttons the remote has a signal for', () => {
    const { labels } = render();
    expect(labels()).toEqual(expect.arrayContaining(['Power', 'Vol +']));
    expect(labels()).not.toEqual(expect.arrayContaining(['Mute', 'Vol -', 'Play', 'Stop']));
  });

  it('puts commands that no layout button covers under "Other buttons"', () => {
    const { labels, tree } = render();
    expect(labels()).toContain('Netflix'); // label comes from signal_data.labels
    const text = JSON.stringify(tree.toJSON());
    expect(text).toContain('Other buttons');
  });

  it('reports the canonical command name when pressed', () => {
    const { tree, onPress } = render();
    const power = tree.root.find(n => n.props.accessibilityLabel === 'Power' && typeof n.props.onPressIn === 'function');
    act(() => power.props.onPressIn());
    act(() => power.props.onPressOut());
    expect(onPress).toHaveBeenCalledWith('POWER');
  });
});
