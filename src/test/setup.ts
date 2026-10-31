import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';

// jsdom has no ResizeObserver; components only need it to exist.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
// jsdom has no IntersectionObserver; this one never reports, so lazy thumbnails stay unrequested unless a test stubs it.
globalThis.IntersectionObserver ??= class { readonly root = null; readonly rootMargin = ''; readonly scrollMargin = ''; readonly thresholds: readonly number[] = []; observe() {} unobserve() {} disconnect() {} takeRecords() { return [] } };
// jsdom has no <dialog> modal API; mirror what the components rely on (open attribute, close event).
HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', '') };
HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { if (this.open) { this.removeAttribute('open'); this.dispatchEvent(new Event('close')) } };
