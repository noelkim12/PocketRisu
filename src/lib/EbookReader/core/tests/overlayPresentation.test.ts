import { describe, expect, it } from 'vitest'
import { getOverlayPresentation } from '../overlayPresentation'

describe('ebook reader overlay presentation', () => {
    it('uses a chat-anchored desktop shell with only the panel interactive', () => {
        const presentation = getOverlayPresentation('desktop')

        expect(presentation.shellClass).toContain('pointer-events-none')
        expect(presentation.shellClass).toContain('z-50')
        expect(presentation.shellClass).not.toContain('bg-black/60')
        expect(presentation.shellClass).not.toContain('backdrop-blur-sm')
        expect(presentation.panelClass).toContain('absolute')
        expect(presentation.panelClass).toContain('pointer-events-auto')
        expect(presentation.panelClass).not.toContain('md:w-[72vw]')
        expect(presentation.panelClass).not.toContain('max-w-5xl')
        expect(presentation.viewerRole).toBe('region')
        expect(presentation.ariaModal).toBeUndefined()
        expect(presentation.closeOnShellClick).toBe(false)
    })

    it('keeps mobile fullscreen behavior explicit', () => {
        const presentation = getOverlayPresentation('mobile')

        expect(presentation.shellClass).toContain('fixed inset-0')
        expect(presentation.shellClass).toContain('z-50')
        expect(presentation.shellClass).toContain('pointer-events-none')
        expect(presentation.shellClass).not.toContain('bg-darkbg')
        expect(presentation.panelClass).toContain('absolute')
        expect(presentation.panelClass).toContain('pointer-events-auto')
        expect(presentation.viewerRole).toBe('dialog')
        expect(presentation.ariaModal).toBe('true')
        expect(presentation.closeOnShellClick).toBe(false)
    })
})
