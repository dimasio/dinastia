import { config } from '../config.ts'
import { fakeVideo } from './fake.ts'
import { kinescopeVideo } from './kinescope.ts'
import type { VideoProvider } from './provider.ts'
import { storageVideo } from './storage.ts'

export { ProviderError, type Video, type VideoProvider, type VideoStatus, videoFor } from './provider.ts'

const providers = { kinescope: kinescopeVideo, fake: fakeVideo, storage: storageVideo } as const

/** Провайдер видео по `VIDEO_PROVIDER`. */
export const videoProvider = (): VideoProvider => providers[config.VIDEO_PROVIDER]
