import { describe, expect, it } from 'vitest'
import { clampPageIndex, getNextChunkCenter, getPrevChunkCenter, getReaderPageAnchor, getSpreadPageIndex, resolveReaderPageAnchor } from '../navigation'
import { EBOOK_READER_NAVIGATION_EVENT, dispatchEbookReaderNavigation, type EbookReaderNavigationEventDetail } from '../navigationEvents'
import type { CaptureChunkResult } from '../readerTypes'

function chunk(startIndex: number, endIndex: number): CaptureChunkResult {
    return {
        requestedIndices: [],
        capturedMessages: [],
        missingIndices: [],
        partial: false,
        startIndex,
        endIndex,
    }
}

describe('ebook reader navigation', () => {
    it('clamps page indexes into available bounds', () => {
        expect(clampPageIndex(4, 0)).toBe(0)
        expect(clampPageIndex(Number.NaN, 3)).toBe(0)
        expect(clampPageIndex(-2, 5)).toBe(0)
        expect(clampPageIndex(99, 5)).toBe(4)
        expect(clampPageIndex(2, 5)).toBe(2)
    })

    it('normalizes desktop spreads to an even page index', () => {
        expect(getSpreadPageIndex(3, 8)).toBe(2)
        expect(getSpreadPageIndex(7, 8)).toBe(6)
        expect(getSpreadPageIndex(7, 7)).toBe(6)
        expect(getSpreadPageIndex(-1, 4)).toBe(0)
    })

    it('keeps single-page mode clamped without even spread normalization', () => {
        expect(getSpreadPageIndex(3, 8, { mode: 'single' })).toBe(3)
        expect(getSpreadPageIndex(9, 8, { mode: 'single' })).toBe(7)
    })

    it('calculates next and previous chunk centers with optional bounds', () => {
        expect(getNextChunkCenter(chunk(-1, 4))).toBe(5)
        expect(getPrevChunkCenter(chunk(2, 7))).toBe(1)
        expect(getNextChunkCenter(chunk(3, 7), 5)).toBe(4)
        expect(getPrevChunkCenter(chunk(-1, 3), 8)).toBe(-1)
    })

    it('anchors a page by chat index and offset within that chat', () => {
        const pages = [
            { chatIndex: 1 },
            { chatIndex: 2 },
            { chatIndex: 2 },
            { chatIndex: 3 },
            { chatIndex: 3 },
            { chatIndex: 3 },
        ]

        expect(getReaderPageAnchor(pages, 4)).toEqual({ chatIndex: 3, pageOffset: 1 })
        expect(resolveReaderPageAnchor(pages, { chatIndex: 3, pageOffset: 1 })).toBe(4)
    })

    it('keeps the same chat anchor when earlier pages are inserted or removed', () => {
        const before = [
            { chatIndex: 1 },
            { chatIndex: 1 },
            { chatIndex: 2 },
            { chatIndex: 3 },
            { chatIndex: 3 },
        ]
        const after = [
            { chatIndex: 1 },
            { chatIndex: 2 },
            { chatIndex: 2 },
            { chatIndex: 3 },
            { chatIndex: 3 },
            { chatIndex: 3 },
        ]

        const anchor = getReaderPageAnchor(before, 4)

        expect(anchor).toEqual({ chatIndex: 3, pageOffset: 1 })
        expect(anchor ? resolveReaderPageAnchor(after, anchor) : -1).toBe(4)
    })

    it('clamps chat-relative page offsets when the target chat has fewer pages after repagination', () => {
        const pages = [{ chatIndex: 4 }, { chatIndex: 4 }]

        expect(resolveReaderPageAnchor(pages, { chatIndex: 4, pageOffset: 9 })).toBe(1)
        expect(resolveReaderPageAnchor(pages, { chatIndex: 99, pageOffset: 0 }, 7)).toBe(1)
    })

    it('dispatches external ebook reader navigation events', () => {
        const directions: EbookReaderNavigationEventDetail['direction'][] = []
        const listener = (event: Event) => {
            directions.push((event as CustomEvent<EbookReaderNavigationEventDetail>).detail.direction)
        }

        window.addEventListener(EBOOK_READER_NAVIGATION_EVENT, listener)
        dispatchEbookReaderNavigation('previous')
        dispatchEbookReaderNavigation('next')
        window.removeEventListener(EBOOK_READER_NAVIGATION_EVENT, listener)

        expect(directions).toEqual(['previous', 'next'])
    })
})
