import { describe, expect, it } from 'vitest'
import { defaultEbookReaderPrefs, normalizeEbookReaderPrefs, prefsToCssVars, clamp } from '../preferences'

describe('ebook reader preferences', () => {
    it('normalizes undefined to the exact default preferences', () => {
        expect(normalizeEbookReaderPrefs(undefined)).toEqual({
            appearance: 'system',
            fontSize: 16,
            lineHeight: 1.65,
            fontFamily: 'inherit',
            pageWidth: 900,
            blurImages: false,
        })
        expect(normalizeEbookReaderPrefs(undefined)).toEqual(defaultEbookReaderPrefs)
    })

    it('clamps invalid numeric preferences to safe ranges', () => {
        expect(normalizeEbookReaderPrefs({
            fontSize: -10,
            lineHeight: Number.NaN,
            pageWidth: Number.POSITIVE_INFINITY,
        })).toMatchObject({
            fontSize: 12,
            lineHeight: 1.65,
            pageWidth: 1200,
        })

        expect(normalizeEbookReaderPrefs({
            fontSize: 200,
            lineHeight: 0.1,
            pageWidth: 100,
        })).toMatchObject({
            fontSize: 28,
            lineHeight: 1.2,
            pageWidth: 560,
        })

        expect(clamp(16, 12, 28)).toBe(16)
        expect(clamp(-1, 12, 28)).toBe(12)
        expect(clamp(100, 12, 28)).toBe(28)
        expect(clamp(Number.NaN, 12, 28, 16)).toBe(16)
    })

    it('normalizes invalid primitive values safely', () => {
        expect(normalizeEbookReaderPrefs({
            appearance: 'solarized',
            fontFamily: 42,
            blurImages: 'yes',
        })).toEqual(defaultEbookReaderPrefs)

        expect(normalizeEbookReaderPrefs({
            appearance: 'sepia',
            fontFamily: 'serif',
            blurImages: true,
        })).toMatchObject({
            appearance: 'sepia',
            fontFamily: 'serif',
            blurImages: true,
        })
    })

    it('only accepts controlled font family values', () => {
        expect(normalizeEbookReaderPrefs({ fontFamily: 'serif; pointer-events:none' })).toMatchObject({
            fontFamily: 'inherit',
        })

        expect(normalizeEbookReaderPrefs({ fontFamily: '"Comic Sans MS"' })).toMatchObject({
            fontFamily: 'inherit',
        })

        for (const fontFamily of ['inherit', 'serif', 'sans-serif', 'monospace'] as const) {
            expect(normalizeEbookReaderPrefs({ fontFamily })).toMatchObject({ fontFamily })
        }
    })

    it('converts normalized preferences into CSS variable style data', () => {
        expect(prefsToCssVars({
            appearance: 'light',
            fontSize: 18,
            lineHeight: 1.8,
            fontFamily: 'serif',
            pageWidth: 720,
            blurImages: true,
        })).toEqual({
            '--ebook-reader-font-size': '18px',
            '--ebook-reader-line-height': '1.8',
            '--ebook-reader-font-family': 'serif',
            '--ebook-reader-page-width': '720px',
            '--ebook-reader-image-filter': 'blur(8px)',
        })
    })
})
