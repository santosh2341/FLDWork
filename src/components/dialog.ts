import { createContext, useContext } from 'react'

// In-page replacements for window.confirm / window.alert. DialogProvider (DialogProvider.tsx) draws them.
export interface AskOptions {
  message: string
  title?: string
  confirmLabel?: string // e.g. "Delete", "Void invoice"; defaults to "OK"
  cancelLabel?: string
  danger?: boolean // red confirm button for destructive actions
}
export interface DialogApi {
  ask: (o: AskOptions | string) => Promise<boolean> // resolves true when confirmed
  tell: (message: string, title?: string) => Promise<void> // a notice with one OK button
}

export const DialogContext = createContext<DialogApi | null>(null)

// Outside the provider (should not happen in the app) fall back to the browser's own dialogs.
const fallback: DialogApi = {
  ask: async (o) => window.confirm(typeof o === 'string' ? o : o.message),
  tell: async (m) => window.alert(m),
}

export function useDialog(): DialogApi {
  return useContext(DialogContext) ?? fallback
}
