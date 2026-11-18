import { describe, expect, it } from 'vitest';
import { health } from './index';

describe('health', () => {
  it('returns ok', async () => {
    await expect(health()).resolves.toEqual({ status: 'ok' });
  });
});
