import ReactTestRenderer, { act } from 'react-test-renderer';
import App from '../App';

test('boots to the empty home screen for a guest', async () => {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = ReactTestRenderer.create(<App />);
  });
  // let persisted stores hydrate and navigation settle
  await act(async () => {
    await new Promise<void>(r => setTimeout(() => r(), 100));
  });
  const text = JSON.stringify(tree.toJSON());
  expect(text).toContain('Add your first remote');
  expect(text).toContain('No account needed');
  act(() => tree.unmount());
});
