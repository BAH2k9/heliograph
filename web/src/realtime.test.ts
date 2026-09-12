import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from './authStore'

/**
 * A minimal fake of the `@microsoft/signalr` surface `realtime.ts` actually uses. One fake
 * connection object is shared across a test (mirroring the module's own singleton), captured via
 * `builder.build()` so a test can drive `on`/`onreconnected` handlers directly.
 */
function makeFakeConnection() {
  const handlers = new Map<string, (...args: unknown[]) => void>()
  let reconnectedHandler: (() => void) | null = null
  return {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => handlers.set(event, handler)),
    invoke: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    onreconnected: vi.fn((handler: () => void) => {
      reconnectedHandler = handler
    }),
    onreconnecting: vi.fn(),
    onclose: vi.fn(),
    state: 'Connected',
    // test helpers, not part of the real SignalR API
    emit(event: string, ...args: unknown[]) {
      handlers.get(event)?.(...args)
    },
    triggerReconnected() {
      reconnectedHandler?.()
    },
  }
}

let fakeConnection: ReturnType<typeof makeFakeConnection>

vi.mock('@microsoft/signalr', () => {
  return {
    HubConnectionBuilder: vi.fn().mockImplementation(function () {
      return {
        withUrl: vi.fn().mockReturnThis(),
        withAutomaticReconnect: vi.fn().mockReturnThis(),
        configureLogging: vi.fn().mockReturnThis(),
        build: vi.fn(() => fakeConnection),
      }
    }),
    HubConnectionState: { Connected: 'Connected' },
    LogLevel: { Warning: 2 },
  }
})

beforeEach(() => {
  fakeConnection = makeFakeConnection()
  useAuth.setState({ accessToken: null, refreshToken: null, user: null })
})

afterEach(() => {
  vi.resetModules()
})

describe('subscribeToUserInvites', () => {
  it('calls SubscribeToUser for an authenticated user', async () => {
    useAuth.setState({ accessToken: 'token-123' })
    const { subscribeToUserInvites } = await import('./realtime')

    await subscribeToUserInvites(() => {})

    expect(fakeConnection.start).toHaveBeenCalled()
    expect(fakeConnection.invoke).toHaveBeenCalledWith('SubscribeToUser')
  })

  it('does not connect or subscribe a guest', async () => {
    useAuth.setState({ accessToken: null })
    const { subscribeToUserInvites } = await import('./realtime')

    await subscribeToUserInvites(() => {})

    expect(fakeConnection.start).not.toHaveBeenCalled()
    expect(fakeConnection.invoke).not.toHaveBeenCalledWith('SubscribeToUser')
  })

  it('fires the registered handler on an inviteReceived push', async () => {
    useAuth.setState({ accessToken: 'token-123' })
    const { subscribeToUserInvites } = await import('./realtime')
    const onInvite = vi.fn()

    await subscribeToUserInvites(onInvite)
    fakeConnection.emit('inviteReceived', { inviteId: 'i1' })

    expect(onInvite).toHaveBeenCalled()
  })

  it('re-subscribes on automatic reconnect', async () => {
    useAuth.setState({ accessToken: 'token-123' })
    const { subscribeToUserInvites } = await import('./realtime')

    await subscribeToUserInvites(() => {})
    fakeConnection.invoke.mockClear()
    fakeConnection.triggerReconnected()
    await Promise.resolve()

    expect(fakeConnection.invoke).toHaveBeenCalledWith('SubscribeToUser')
  })
})

describe('followGame / unfollow', () => {
  it('joins the game group and keeps the connection open after unfollow (invite subscription survives)', async () => {
    useAuth.setState({ accessToken: 'token-123' })
    const { followGame, unfollow, isConnected } = await import('./realtime')

    await followGame(
      'game-1',
      'P1',
      () => {},
      () => {},
      () => {},
      () => {},
      () => {},
      () => {},
    )

    expect(fakeConnection.invoke).toHaveBeenCalledWith('Join', 'game-1', 'P1')

    await unfollow()

    // unfollow() must not stop the socket — an authenticated user still needs it for invites.
    expect(fakeConnection.stop).not.toHaveBeenCalled()
    expect(isConnected()).toBe(true)
  })
})

describe('disconnect', () => {
  it('actually stops the connection', async () => {
    useAuth.setState({ accessToken: 'token-123' })
    const { subscribeToUserInvites, disconnect } = await import('./realtime')

    await subscribeToUserInvites(() => {})
    await disconnect()

    expect(fakeConnection.stop).toHaveBeenCalled()
  })
})
