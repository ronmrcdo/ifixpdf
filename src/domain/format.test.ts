import {formatSize} from './format';

describe('formatSize', () => {
  it.each([[0, '1 KB'], [1, '1 KB'], [1536, '2 KB'], [1048576, '1024 KB'], [1048577, '1.0 MB'], [5_242_880 + 52_429, '5.1 MB']])('%i bytes is %s', (bytes, text) => {
    expect(formatSize(bytes)).toBe(text);
  });
});
