import { describe, expect, it } from 'vitest'
import { getReaderPanelRect, getVisibleRect } from '../overlayGeometry'

describe('ebook reader overlay geometry', () => {
    it('clips a rectangle to the visible viewport', () => {
        expect(getVisibleRect(
            { top: -10, left: 20, right: 220, bottom: 90 },
            { top: 0, left: 0, right: 200, bottom: 100 },
        )).toEqual({ top: 0, left: 20, width: 180, height: 90 })
    })

    it('sizes the reader panel from the unobstructed chat viewport instead of a short chat anchor', () => {
        const panelRect = getReaderPanelRect(
            { top: 720, left: 40, right: 760, bottom: 760 },
            { top: 80, left: 0, right: 800, bottom: 780 },
            { top: 0, left: 0, right: 800, bottom: 800 },
            [{ top: 680, left: 0, right: 800, bottom: 780 }],
        )

        expect(panelRect).toEqual({ top: 80, left: 40, width: 720, height: 600 })
        expect(panelRect?.height).toBeGreaterThan(40)
    })

    it('keeps horizontal sizing anchored to the visible chat message column', () => {
        expect(getReaderPanelRect(
            { top: 120, left: -20, right: 620, bottom: 220 },
            { top: 80, left: 40, right: 700, bottom: 780 },
            { top: 0, left: 0, right: 800, bottom: 800 },
        )).toEqual({ top: 80, left: 40, width: 580, height: 700 })
    })

    it('ignores obstructions outside the panel column', () => {
        expect(getReaderPanelRect(
            { top: 120, left: 40, right: 600, bottom: 220 },
            { top: 80, left: 0, right: 800, bottom: 780 },
            { top: 0, left: 0, right: 800, bottom: 800 },
            [{ top: 680, left: 620, right: 760, bottom: 780 }],
        )).toEqual({ top: 80, left: 40, width: 560, height: 700 })
    })
})
