export type EbookReaderOverlayMode = 'desktop' | 'mobile'

export type EbookReaderOverlayPresentation = {
    shellClass: string
    panelClass: string
    viewerRole: 'region' | 'dialog'
    ariaModal?: 'true'
    closeOnShellClick: boolean
}

const DESKTOP_SHELL_CLASS = [
    'ebook-reader-overlay',
    'fixed',
    'inset-0',
    'z-50',
    'pointer-events-none',
    'flex',
].join(' ')

const DESKTOP_PANEL_CLASS = [
    'absolute',
    'pointer-events-auto',
    'flex',
    'min-w-0',
].join(' ')

const MOBILE_SHELL_CLASS = [
    'ebook-reader-overlay',
    'fixed',
    'inset-0',
    'z-50',
    'pointer-events-none',
].join(' ')

const MOBILE_PANEL_CLASS = 'absolute pointer-events-auto min-w-0'

export function getOverlayPresentation(mode: EbookReaderOverlayMode): EbookReaderOverlayPresentation {
    if (mode === 'mobile') {
        return {
            shellClass: MOBILE_SHELL_CLASS,
            panelClass: MOBILE_PANEL_CLASS,
            viewerRole: 'dialog',
            ariaModal: 'true',
            closeOnShellClick: false,
        }
    }

    return {
        shellClass: DESKTOP_SHELL_CLASS,
        panelClass: DESKTOP_PANEL_CLASS,
        viewerRole: 'region',
        closeOnShellClick: false,
    }
}
