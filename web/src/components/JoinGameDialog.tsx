import { useState } from 'react'
import { Button } from '../ui/Button'
import { Dialog, DialogClose, DialogContent, DialogFooter } from '../ui/Dialog'
import { Field } from '../ui/Field'

// Mount fresh per open (the caller keys this on the open/closed state), so `code` starts blank.
export function JoinGameDialog({
  open,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean
  busy: boolean
  onConfirm: (code: string) => void
  onClose: () => void
}) {
  const [code, setCode] = useState('')

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent title="Join Game" onOpenAutoFocus={(e) => e.preventDefault()}>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (code.trim()) onConfirm(code)
          }}
        >
          <Field
            label="Room code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="code"
            maxLength={6}
            autoFocus
            inputClassName="font-mono uppercase tracking-widest"
          />

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" size="sm" disabled={busy || !code.trim()}>
              Join Game
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
