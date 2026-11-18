import { describe, expect, it } from 'vitest';
import { app } from './app';

describe('app', () => {
  it('exposes health', async () => {
    await expect(app.getHealth()).resolves.toEqual({ status: 'ok' });
  });
});
