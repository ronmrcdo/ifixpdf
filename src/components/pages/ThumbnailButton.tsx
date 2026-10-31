import type {ButtonHTMLAttributes} from 'react';
import type {Rotation} from '../../domain/types';
import {Thumbnail} from './Thumbnail';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {fileId: string; local: number; rotation: Rotation};

/** A page thumbnail as a button, with its label as children. Shared by the editable card and the read-only grid. */
export function ThumbnailButton({fileId, local, rotation, children, ...button}: Props) {
  return (
    <button type="button" {...button}>
      <Thumbnail fileId={fileId} local={local} rotation={rotation} />
      {children}
    </button>
  );
}
