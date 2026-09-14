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
  let closeHandler: ((err?: unknown) => void) | null = null
  return {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => handlers.set(event, handler)),
    invoke: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    onreconnected: vi.fn((handler: () => void) => {
      reconnectedHandler = handler
    }),
    onreconnecting: vi.fn(),
    onclose: vi.fn((handler: (err?: unknown) => void) => {
      closeHandler = handler
    }),
    state: 'Connected',
    // test helpers, not part of the real SignalR API
    emit(event: string, ...args: unknown[]) {
      handlers.get(event)?.(...args)
    },
    triggerReconnected() {
      reconnectedHandler?.()
    },
    /** The terminal close — what the real client does once its retry policy returns null, and
     *  what `disconnect()`'s own `stop()` produces. Sets `state` the way the real one would. */
    triggerClosed() {
      this.state = 'Disconnected'
      closeHandler?.(new Error('connection lost'))
    },
  }
}

let fakeConnection: ReturnType<typeof makeFakeConnection>
/** Every retry policy handed to `withAutomaticReconnect`, in build order — so a test can assert
 *  the module passes one at all rather than falling back to the SDK's give-up-after-4 default. */
let retryPoliciesPassed: unknown[]

vi.mock('@microsoft/signalr', () => {
  return {
    HubConnectionBuilder: vi.fn().mockImplementation(function () {
      const builder = {
        withUrl: vi.fn(() => builder),
        // Records the policy rather than just chaining, so a test can assert the module passes one.
        withAutomaticReconnect: vi.fn((policy: unknown) => {
          retryPoliciesPassed.push(policy)
          return builder
        }),
        configureLogging: vi.fn(() => builder),
        build: vi.fn(() => fakeConnection),
      }
      return builder
    }),
    HubConnectionState: {
      Connected: 'Connected',
      Disconnected: 'Disconnected',
      Reconnecting: 'Reconnecting',
    },
    LogLevel: { Warning: 2 },
  }
})

beforeEach(() => {
  fakeConnection = makeFakeConnection()
  retryPoliciesPassed = []
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

/** A `RetryContext`, which the policy reads but the SDK builds. */
function retryCtx(previousRetryCount: number, elapsedMilliseconds: number) {
  return { previousRetryCount, elapsedMilliseconds, retryReason: new Error('connection lost') }
}

describe('hubRetryPolicy', () => {
  it('retries the first attempt immediately', async () => {
    const { hubRetryPolicy } = await import('./realtime')

    expect(hubRetryPolicy.nextRetryDelayInMilliseconds(retryCtx(0, 0))).toBe(0)
  })

  it('retries densely inside the window covering the 45s abandonment grace', async () => {
    const { hubRetryPolicy } = await import('./realtime')

    // The whole point: several attempts land before the server would accept a claim at 45s.
    expect(hubRetryPolicy.nextRetryDelayInMilliseconds(retryCtx(1, 3_000))).toBe(3_000)
    expect(hubRetryPolicy.nextRetryDelayInMilliseconds(retryCtx(14, 45_000))).toBe(3_000)
    expect(hubRetryPolicy.nextRetryDelayInMilliseconds(retryCtx(19, 59_999))).toBe(3_000)
  })

  it('backs off to a slow poll once past the dense window', async () => {
    const { hubRetryPolicy } = await import('./realtime')

    expect(hubRetryPolicy.nextRetryDelayInMilliseconds(retryCtx(20, 60_000))).toBe(30_000)
    expect(hubRetryPolicy.nextRetryDelayInMilliseconds(retryCtx(40, 300_000))).toBe(30_000)
  })

  it('never gives up — the regression this exists to prevent', async () => {
    const { hubRetryPolicy } = await import('./realtime')

    // The SDK default stops after 4 attempts / ~42s, which is inside the 45s grace window and
    // permanent (see `onclose`). A null here at any point reintroduces the forfeit bug.
    expect(hubRetryPolicy.nextRetryDelayInMilliseconds(retryCtx(4, 42_000))).not.toBeNull()
    expect(hubRetryPolicy.nextRetryDelayInMilliseconds(retryCtx(5_000, 86_400_000))).not.toBeNull()
  })

  it('is actually handed to the connection builder', async () => {
    useAuth.setState({ accessToken: 'token-123' })
    const { subscribeToUserInvites, hubRetryPolicy } = await import('./realtime')

    await subscribeToUserInvites(() => {})

    // Guards against a revert to a bare `withAutomaticReconnect()`, which would silently restore
    // the give-up-after-4-attempts default.
    expect(retryPoliciesPassed).toEqual([hubRetryPolicy])
  })
})

describe('recovery from a closed connection', () => {
  type FollowGame = (typeof import('./realtime'))['followGame']

  /** `followGame` with its event handlers defaulted to no-ops — only `onReconnected` matters here. */
  function followTestGame(followGame: FollowGame, onReconnected: () => void = () => {}) {
    return followGame(
      'game-1',
      'P1',
      () => {},
      onReconnected,
      () => {},
      () => {},
      () => {},
      () => {},
      () => {},
      () => {},
      () => {},
    )
  }

  it('rebuilds a closed connection instead of handing the dead one back forever', async () => {
    useAuth.setState({ accessToken: 'token-123' })
    const { subscribeToUserInvites, followGame } = await import('./realtime')
    const onReconnected = vi.fn()

    await followTestGame(followGame, onReconnected)
    const dead = fakeConnection
    dead.triggerClosed()

    const rebuilt = makeFakeConnection()
    fakeConnection = rebuilt
    await subscribeToUserInvites(() => {})

    expect(rebuilt.start).toHaveBeenCalled()
    // A new connection has no server-side group membership, so both subscriptions must be redone
    // and the store told to catch up on what it missed.
    expect(rebuilt.invoke).toHaveBeenCalledWith('SubscribeToUser')
    expect(rebuilt.invoke).toHaveBeenCalledWith('Join', 'game-1', 'P1')
    expect(onReconnected).toHaveBeenCalled()
  })

  it('reuses a reconnecting connection rather than racing its in-flight attempt', async () => {
    useAuth.setState({ accessToken: 'token-123' })
    const { subscribeToUserInvites } = await import('./realtime')

    await subscribeToUserInvites(() => {})
    fakeConnection.state = 'Reconnecting'

    const wouldBeSecond = makeFakeConnection()
    fakeConnection = wouldBeSecond
    await subscribeToUserInvites(() => {})

    expect(wouldBeSecond.start).not.toHaveBeenCalled()
  })

  it('does not let a replaced connection closing late wipe the live one', async () => {
    useAuth.setState({ accessToken: 'token-123' })
    const { subscribeToUserInvites, disconnect, isConnected } = await import('./realtime')

    const first = fakeConnection
    await subscribeToUserInvites(() => {})
    await disconnect()

    const second = makeFakeConnection()
    fakeConnection = second
    await subscribeToUserInvites(() => {})
    expect(isConnected()).toBe(true)

    // `disconnect()` nulls the singleton before awaiting `stop()`, so the old socket's close can
    // land after a replacement is already live.
    first.triggerClosed()

    expect(isConnected()).toBe(true)
  })
})
