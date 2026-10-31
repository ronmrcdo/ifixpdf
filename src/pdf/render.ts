import type {Rotation} from '../domain/types';
import {acquire} from './registry';

const MAX_SIDE = 8192;
const MAX_AREA = 16_777_216;
const generation = new WeakMap<HTMLCanvasElement, number>();
const tasks = new WeakMap<HTMLCanvasElement, {cancel(): void}>();

const isCancel = (e: unknown): boolean =>
  e instanceof Error && e.name === 'RenderingCancelledException';

export async function renderPage(
  canvas: HTMLCanvasElement,
  fileId: string,
  local: number,
  rotation: Rotation,
  scale: number,
): Promise<void> {
  const mine = (generation.get(canvas) ?? 0) + 1;
  generation.set(canvas, mine);
  tasks.get(canvas)?.cancel();

  const page = await (await acquire(fileId)).getPage(local + 1);
  if (generation.get(canvas) !== mine) return; // superseded while loading
  const viewport = page.getViewport({scale, rotation: (page.rotate + rotation) % 360});
  const shrink = Math.min(
    1,
    MAX_SIDE / viewport.width,
    MAX_SIDE / viewport.height,
    Math.sqrt(MAX_AREA / (viewport.width * viewport.height)),
  );
  const fitted =
    shrink < 1
      ? page.getViewport({scale: scale * shrink, rotation: (page.rotate + rotation) % 360})
      : viewport;
  canvas.width = Math.floor(fitted.width);
  canvas.height = Math.floor(fitted.height);
  const canvasContext = canvas.getContext('2d');
  if (!canvasContext) throw new Error('Canvas 2D context unavailable');

  const task = page.render({canvasContext, viewport: fitted});
  tasks.set(canvas, task);
  try {
    await task.promise;
  } catch (error) {
    if (!isCancel(error)) throw error;
  } finally {
    if (tasks.get(canvas) === task) tasks.delete(canvas);
  }
}
