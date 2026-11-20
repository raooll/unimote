import { parseDeepLink } from '../src/lib/deeplink';

describe('deep links', () => {
  it('parses the supported links', () => {
    expect(parseDeepLink('unimote://home')).toEqual({ type: 'home' });
    expect(parseDeepLink('unimote://scene/3f2c-9a')).toEqual({ type: 'scene', id: '3f2c-9a' });
    expect(parseDeepLink('unimote://remote/abc-123/')).toEqual({ type: 'remote', id: 'abc-123' });
    expect(parseDeepLink('unimote://scene/abc?x=1')).toEqual({ type: 'scene', id: 'abc' });
  });

  it('ignores everything else', () => {
    ['https://evil.example/scene/1', 'unimote://scene', 'unimote://scene/', 'unimote://scene/a b', 'unimote://scene/../x', 'unimote://wipe/all', 'unimote://home/extra', '', null, undefined].forEach(u =>
      expect(parseDeepLink(u as never)).toBeNull(),
    );
  });
});
