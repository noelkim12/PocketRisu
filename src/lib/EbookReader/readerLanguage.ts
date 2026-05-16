import { language } from 'src/lang'

export type EbookReaderLanguageKey =
    | 'ebookReader'
    | 'ebookReaderUpdated'
    | 'ebookReaderCaptureFailed'
    | 'ebookReaderPaginationFailed'
    | 'ebookReaderJumpToOriginal'
    | 'ebookReaderEditInOriginal'
    | 'ebookReaderEditJumpNotice'
    | 'ebookReaderPreviousPage'
    | 'ebookReaderNextPage'
    | 'ebookReaderClose'
    | 'ebookReaderCustomization'
    | 'ebookReaderAppearance'
    | 'ebookReaderAppearanceSystem'
    | 'ebookReaderAppearanceLight'
    | 'ebookReaderAppearanceDark'
    | 'ebookReaderAppearanceSepia'
    | 'ebookReaderFontSize'
    | 'ebookReaderLineHeight'
    | 'ebookReaderParagraphSpacing'
    | 'ebookReaderDisplayOptions'
    | 'ebookReaderResetDisplayOptions'
    | 'ebookReaderFontFamily'
    | 'ebookReaderFontFamilyInherit'
    | 'ebookReaderFontFamilySerif'
    | 'ebookReaderFontFamilySansSerif'
    | 'ebookReaderFontFamilyMonospace'
    | 'ebookReaderPageWidth'
    | 'ebookReaderBlurImages'

type EbookReaderLanguage = typeof language & Record<EbookReaderLanguageKey, string>

export function readerLabel(key: EbookReaderLanguageKey): string {
    return (language as EbookReaderLanguage)[key]
}
