import { vi } from 'vitest'

// `virtual:pwa-register/react` only exists once vite-plugin-pwa's build step runs, and that
// plugin is excluded from the vitest path entirely (see vite.config.ts). This stub is aliased
// onto the same specifier under `test.alias` purely so the import resolves to a real file —
// `src/test/setup.ts` (default: no update pending) and individual tests (e.g.
// `components/PwaUpdatePrompt.test.tsx`) then `vi.mock('virtual:pwa-register/react', ...)` over
// the top of it to control the returned state.
export function useRegisterSW() {
  return {
    needRefresh: [false, vi.fn()] as [boolean, (v: boolean) => void],
    offlineReady: [false, vi.fn()] as [boolean, (v: boolean) => void],
    updateServiceWorker: vi.fn(),
  }
}
