import { Dialog, DialogContent } from '../ui/Dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs'
import { DisplaySettingsPanel } from './DisplaySettingsPanel'

/** A small modal. One tab for now — Display Settings. */
export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent title="Settings" size="md">
        <Tabs defaultValue="display">
          <TabsList>
            <TabsTrigger value="display">Display Settings</TabsTrigger>
          </TabsList>
          <TabsContent value="display">
            <DisplaySettingsPanel />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
