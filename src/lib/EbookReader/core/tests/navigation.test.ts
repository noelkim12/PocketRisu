import { describe, expect, it } from 'vitest'
import { clampPageIndex, getNextChunkCenter, getPrevChunkCenter, getSpreadPageIndex } from '../navigation'
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
})
