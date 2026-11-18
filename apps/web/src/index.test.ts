import { describe, expect, it } from 'vitest';
import { appName } from './index';

describe('appName', () => {
  it('exposes the product name', () => {
    expect(appName).toBe('Ekusupo');
  });
});
