import {describe, expect, it} from 'vitest';
import {isUnconfiguredError} from './updater';

describe('isUnconfiguredError', () => {
  it('matches the plugin EmptyEndpoints message, as a string or an Error', () => {
    expect(isUnconfiguredError('Updater does not have any endpoints set.')).toBe(true);
    expect(isUnconfiguredError(new Error('Updater does not have any endpoints set.'))).toBe(true);
  });
  it.each([['Could not fetch a valid release JSON from the remote'], [null], [undefined], [{}], ['']])('rejects %s', (e) => {
    expect(isUnconfiguredError(e)).toBe(false);
  });
});
