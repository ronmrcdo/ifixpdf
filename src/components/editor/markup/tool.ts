import {create} from 'zustand';
import type {MarkKind} from '../../../domain/markup';

export type Tool = 'text' | MarkKind | 'sign' | 'redact';

interface ToolState {
  tool: Tool | null;
  signature: string | null; // PNG data URL
  selected: string | null; // markup id
  setTool(t: Tool | null): void;
  setSignature(png: string | null): void;
  select(id: string | null): void;
}

export const useTool = create<ToolState>()((set) => ({
  tool: null,
  signature: null,
  selected: null,
  setTool: (tool) => set({tool}),
  setSignature: (signature) => set({signature}),
  select: (selected) => set({selected}),
}));
