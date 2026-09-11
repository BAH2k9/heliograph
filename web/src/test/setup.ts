import '@testing-library/jest-dom/vitest'

// `virtual:pwa-register/react` resolves to src/test/pwaRegisterStub.ts under vitest (see the
// `test.alias` in vite.config.ts) — no mock needed here, its default is already "no update
// pending". components/PwaUpdatePrompt.test.tsx overrides it with its own `vi.mock` to exercise
// the "update available" state.
