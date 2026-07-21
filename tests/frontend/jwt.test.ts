import { decodeJwtPayload, isTokenExpired } from '../../src/frontend/src/lib/jwt';

describe('jwt helpers', () => {
  const payload = { userId: 'abc', email: 'test@example.com', role: 'user', exp: Math.floor(Date.now() / 1000) + 3600 };
  const encoded = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const token = `aaa.${encoded}.bbb`;

  test('decodeJwtPayload returns parsed payload', () => {
    const decoded = decodeJwtPayload(token);
    expect(decoded?.email).toBe('test@example.com');
    expect(decoded?.userId).toBe('abc');
  });

  test('isTokenExpired returns false for valid token', () => {
    expect(isTokenExpired(token)).toBe(false);
  });

  test('isTokenExpired returns true for expired token', () => {
    const expiredPayload = { ...payload, exp: Math.floor(Date.now() / 1000) - 10 };
    const expiredEncoded = btoa(JSON.stringify(expiredPayload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(isTokenExpired(`aaa.${expiredEncoded}.bbb`)).toBe(true);
  });
});
