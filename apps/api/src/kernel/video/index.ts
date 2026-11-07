import { config } from '../config.ts'
import { fakeVideo } from './fake.ts'
import { kinescopeVideo } from './kinescope.ts'
import type { VideoProvider } from './provider.ts'

export { ProviderError, type Video, type VideoProvider, type VideoStatus, videoFor } from './provider.ts'

/** Провайдер видео по `VIDEO_PROVIDER`. */
export const videoProvider = (): VideoProvider => (config.VIDEO_PROVIDER === 'kinescope' ? kinescopeVideo : fakeVideo)
