import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../authStore'
import { LoginPage } from './LoginPage'

const initialAuthState = useAuth.getState()

afterEach(() => {
  useAuth.setState(initialAuthState, true)
  vi.unstubAllGlobals()
})

function renderPage() {
  render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  )
}

describe('LoginPage', () => {
  it('takes an email or a display name in a plain text field', () => {
    renderPage()
    const field = screen.getByLabelText('Email or display name')
    // Not type="email": the browser's own validation would refuse a bare display name.
    expect(field).toHaveAttribute('type', 'text')
    expect(field).toHaveAttribute('autocomplete', 'username')
  })

  it('posts a display name as the wire `email` field and shows the server error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'invalid login or password' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    renderPage()

    fireEvent.change(screen.getByLabelText('Email or display name'), { target: { value: 'Ana' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-horse-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Log In' }))

    expect(await screen.findByText(/invalid login or password/)).toBeInTheDocument()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/auth/login')
    expect(JSON.parse(init.body as string)).toEqual({ email: 'Ana', password: 'correct-horse-1' })
  })
})
