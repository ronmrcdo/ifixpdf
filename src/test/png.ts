/** A PNG data URL whose header says w × h: enough for code that reads the size. */
export function pngOf(w: number, h: number): string {
  const b = new Uint8Array(24);
  b.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  const v = new DataView(b.buffer);
  v.setUint32(16, w);
  v.setUint32(20, h);
  return `data:image/png;base64,${btoa(String.fromCharCode(...b))}`;
}
