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

type EbookReaderLanguage = typeof language & Record<EbookReaderLanguageKey, string>

export function readerLabel(key: EbookReaderLanguageKey): string {
    return (language as EbookReaderLanguage)[key]
}
