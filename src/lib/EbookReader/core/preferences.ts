export type EbookReaderAppearance = 'system' | 'light' | 'dark' | 'sepia'
export type EbookReaderFontFamily = 'inherit' | 'serif' | 'sans-serif' | 'monospace'

export interface EbookReaderPrefs {
    appearance: EbookReaderAppearance
    fontSize: number
    lineHeight: number
    paragraphSpacing: number
    fontFamily: EbookReaderFontFamily
    pageWidth: number
    blurImages: boolean
}

export const defaultEbookReaderPrefs: EbookReaderPrefs = {
    appearance: 'system',
    fontSize: 16,
    lineHeight: 1.65,
    paragraphSpacing: 0.65,
    fontFamily: 'inherit',
    pageWidth: 75,
    blurImages: false,
}

const FONT_SIZE_MIN = 12
const FONT_SIZE_MAX = 28
const LINE_HEIGHT_MIN = 1.2
const LINE_HEIGHT_MAX = 2.2
const PARAGRAPH_SPACING_MIN = 0
const PARAGRAPH_SPACING_MAX = 1.5
export const PAGE_WIDTH_PERCENT_MIN = 50
export const PAGE_WIDTH_PERCENT_MAX = 100
export const PAGE_WIDTH_PERCENT_STEP = 5
const LEGACY_PAGE_WIDTH_MAX = 1200
const VALID_APPEARANCES = new Set<EbookReaderAppearance>(['system', 'light', 'dark', 'sepia'])
const VALID_FONT_FAMILIES = new Set<EbookReaderFontFamily>(['inherit', 'serif', 'sans-serif', 'monospace'])

export function clamp(value: number, min: number, max: number, fallback = min): number {
    if (Number.isNaN(value)) return fallback
    return Math.min(Math.max(value, min), max)
}

function normalizePageWidthPercent(value: unknown): number {
    const numericValue = Number(value)
    if (Number.isNaN(numericValue)) return defaultEbookReaderPrefs.pageWidth

    if (numericValue > PAGE_WIDTH_PERCENT_MAX) {
        const legacyPercent = Math.round((numericValue / LEGACY_PAGE_WIDTH_MAX) * 100)
        return clamp(legacyPercent, PAGE_WIDTH_PERCENT_MIN, PAGE_WIDTH_PERCENT_MAX, defaultEbookReaderPrefs.pageWidth)
    }

    return clamp(numericValue, PAGE_WIDTH_PERCENT_MIN, PAGE_WIDTH_PERCENT_MAX, defaultEbookReaderPrefs.pageWidth)
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
        paragraphSpacing: clamp(Number(prefs.paragraphSpacing), PARAGRAPH_SPACING_MIN, PARAGRAPH_SPACING_MAX, defaultEbookReaderPrefs.paragraphSpacing),
        fontFamily: VALID_FONT_FAMILIES.has(prefs.fontFamily as EbookReaderFontFamily)
            ? prefs.fontFamily as EbookReaderFontFamily
            : defaultEbookReaderPrefs.fontFamily,
        pageWidth: normalizePageWidthPercent(prefs.pageWidth),
        blurImages: typeof prefs.blurImages === 'boolean' ? prefs.blurImages : defaultEbookReaderPrefs.blurImages,
    }
}

export function prefsToCssVars(prefs: EbookReaderPrefs): Record<string, string> {
    const normalized = normalizeEbookReaderPrefs(prefs)

    return {
        '--ebook-reader-font-size': `${normalized.fontSize}px`,
        '--ebook-reader-line-height': `${normalized.lineHeight}`,
        '--ebook-reader-paragraph-spacing': `${normalized.paragraphSpacing}em`,
        '--ebook-reader-font-family': normalized.fontFamily,
        '--ebook-reader-page-width': `${normalized.pageWidth}%`,
        '--ebook-reader-image-filter': normalized.blurImages ? 'blur(8px)' : 'none',
    }
}
