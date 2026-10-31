import {platform} from '../platform';
import {createRecents} from './recents';

/** The one recents repository the app uses (import, open, save, Home). */
export const recents = createRecents(platform);
