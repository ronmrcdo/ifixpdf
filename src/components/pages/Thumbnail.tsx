import {useEffect, useRef, useState} from 'react';
import type {Rotation} from '../../domain/types';
import {thumbnail} from '../../pdf/thumbnails';
import {useVisible} from './useVisible';

/** A page image rendered only once it nears view. Keeps showing the last image while a new rotation renders. */
export function Thumbnail({fileId, local, rotation, scale = 0.42}: {fileId: string; local: number; rotation: Rotation; scale?: 0.18 | 0.42}) {
  const ref = useRef<HTMLImageElement>(null);
  const visible = useVisible(ref);
  const [src, setSrc] = useState<string>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!visible) return;
    let live = true;
    thumbnail(fileId, local, rotation, scale).then((url) => { if (live) setSrc(url) }, () => { if (live) setFailed(true) });
    return () => { live = false };
  }, [visible, fileId, local, rotation, scale]);
  return <img ref={ref} src={src} alt={failed ? 'Preview unavailable' : ''} />;
}
