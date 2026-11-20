export type DeepLink = { type: 'home' } | { type: 'scene'; id: string } | { type: 'remote'; id: string };

const SAFE_ID = /^[A-Za-z0-9-]{1,64}$/;

/** unimote://home, unimote://scene/<id>, unimote://remote/<id>. Anything else is ignored. */
export function parseDeepLink(url: string | null | undefined): DeepLink | null {
  const m = /^unimote:\/\/([a-z]+)(?:\/([^/?#]*))?\/?(?:[?#].*)?$/.exec(url ?? '');
  if (!m) return null;
  const [, kind, id] = m;
  if (kind === 'home' && !id) return { type: 'home' };
  if ((kind === 'scene' || kind === 'remote') && id && SAFE_ID.test(id)) return { type: kind, id };
  return null;
}
