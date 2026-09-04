import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthDialog } from './AuthDialog'
import { useAuth } from '../authStore'

const initialState = useAuth.getState()

afterEach(() => {
  useAuth.setState(initialState, true)
})

describe('AuthDialog', () => {
  it('renders nothing when closed', () => {
    render(<AuthDialog open={false} onClose={vi.fn()} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('defaults to the login tab, and submits email + password', async () => {
    const login = vi.fn().mockResolvedValue(true)
    useAuth.setState({ login })
    const onClose = vi.fn()
    render(<AuthDialog open onClose={onClose} />)

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret12' } })
    const submit = screen.getAllByRole('button', { name: 'Log In' }).at(-1)!
    fireEvent.click(submit)

    await waitFor(() => expect(login).toHaveBeenCalledWith('a@b.com', 'secret12'))
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
  })

  it('does not close the dialog when login fails', async () => {
    const login = vi.fn().mockResolvedValue(false)
    useAuth.setState({ login })
    const onClose = vi.fn()
    render(<AuthDialog open onClose={onClose} />)

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong123' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Log In' }).at(-1)!)

    await waitFor(() => expect(login).toHaveBeenCalledOnce())
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows the store error message', () => {
    useAuth.setState({ error: 'invalid email or password' })
    render(<AuthDialog open onClose={vi.fn()} />)
    expect(screen.getByText('invalid email or password')).toBeInTheDocument()
  })

  it('switching to Register shows the display name field and requires a valid password', async () => {
    const register = vi.fn().mockResolvedValue(true)
    useAuth.setState({ register })
    const onClose = vi.fn()
    render(<AuthDialog open initialMode="login" onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'Register' }))
    expect(screen.getByLabelText('Display name')).toBeInTheDocument()

    const submit = () => screen.getAllByRole('button', { name: 'Register' }).at(-1)!

    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Ana' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } })
    // too short / no digit: the register client-side policy should keep submit disabled
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'short' } })
    expect(submit()).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'longenough1' } })
    expect(submit()).not.toBeDisabled()
    fireEvent.click(submit())

    await waitFor(() => expect(register).toHaveBeenCalledWith('a@b.com', 'longenough1', 'Ana'))
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(<AuthDialog open onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })
})
