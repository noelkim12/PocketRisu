export type EbookReaderAppearance = 'system' | 'light' | 'dark' | 'sepia'
export type EbookReaderFontFamily = 'inherit' | 'serif' | 'sans-serif' | 'monospace'

export interface EbookReaderPrefs {
    appearance: EbookReaderAppearance
    fontSize: number
    lineHeight: number
    fontFamily: EbookReaderFontFamily
    pageWidth: number
    blurImages: boolean
}

export const defaultEbookReaderPrefs: EbookReaderPrefs = {
    appearance: 'system',
    fontSize: 16,
    lineHeight: 1.65,
    fontFamily: 'inherit',
    pageWidth: 900,
    blurImages: false,
}

const FONT_SIZE_MIN = 12
const FONT_SIZE_MAX = 28
const LINE_HEIGHT_MIN = 1.2
const LINE_HEIGHT_MAX = 2.2
const PAGE_WIDTH_MIN = 560
const PAGE_WIDTH_MAX = 1200
const VALID_APPEARANCES = new Set<EbookReaderAppearance>(['system', 'light', 'dark', 'sepia'])
const VALID_FONT_FAMILIES = new Set<EbookReaderFontFamily>(['inherit', 'serif', 'sans-serif', 'monospace'])

export function clamp(value: number, min: number, max: number, fallback = min): number {
    if (Number.isNaN(value)) return fallback
    return Math.min(Math.max(value, min), max)
}

export function normalizeEbookReaderPrefs(value: Partial<EbookReaderPrefs> | unknown): EbookReaderPrefs {
    if (!value || typeof value !== 'object') {
        return { ...defaultEbookReaderPrefs }
    }

    const prefs = value as Partial<EbookReaderPrefs>
    const appearance = VALID_APPEARANCES.has(prefs.appearance as EbookReaderAppearance)
        ? prefs.appearance as EbookReaderAppearance
        : defaultEbookReaderPrefs.appearance

    return {
        appearance,
        fontSize: clamp(Number(prefs.fontSize), FONT_SIZE_MIN, FONT_SIZE_MAX, defaultEbookReaderPrefs.fontSize),
        lineHeight: clamp(Number(prefs.lineHeight), LINE_HEIGHT_MIN, LINE_HEIGHT_MAX, defaultEbookReaderPrefs.lineHeight),
        fontFamily: VALID_FONT_FAMILIES.has(prefs.fontFamily as EbookReaderFontFamily)
            ? prefs.fontFamily as EbookReaderFontFamily
            : defaultEbookReaderPrefs.fontFamily,
        pageWidth: clamp(Number(prefs.pageWidth), PAGE_WIDTH_MIN, PAGE_WIDTH_MAX, defaultEbookReaderPrefs.pageWidth),
        blurImages: typeof prefs.blurImages === 'boolean' ? prefs.blurImages : defaultEbookReaderPrefs.blurImages,
    }
}

export function prefsToCssVars(prefs: EbookReaderPrefs): Record<string, string> {
    const normalized = normalizeEbookReaderPrefs(prefs)

    return {
        '--ebook-reader-font-size': `${normalized.fontSize}px`,
        '--ebook-reader-line-height': `${normalized.lineHeight}`,
        '--ebook-reader-font-family': normalized.fontFamily,
        '--ebook-reader-page-width': `${normalized.pageWidth}px`,
        '--ebook-reader-image-filter': normalized.blurImages ? 'blur(8px)' : 'none',
    }
}
