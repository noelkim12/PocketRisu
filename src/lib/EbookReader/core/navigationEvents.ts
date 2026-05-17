export type EbookReaderNavigationDirection = 'previous' | 'next'

export type EbookReaderNavigationEventDetail = {
    direction: EbookReaderNavigationDirection
}

export const EBOOK_READER_NAVIGATION_EVENT = 'ebook-reader:navigate'

export function dispatchEbookReaderNavigation(direction: EbookReaderNavigationDirection) {
    window.dispatchEvent(new CustomEvent<EbookReaderNavigationEventDetail>(EBOOK_READER_NAVIGATION_EVENT, {
        detail: { direction },
    }))
}
