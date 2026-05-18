import type { CaptureChunkResult, ChatIndex } from './readerTypes'

export type PageMode = 'spread' | 'single'

type SpreadOptions = {
    mode?: PageMode
}

export type ReaderPageAnchor = {
    chatIndex: ChatIndex
    chatPageIndex: number
}

type ChatIndexedPage = {
    chatIndex: ChatIndex
    chatPageIndex: number
}

function normalizeInteger(value: number) {
    return Number.isFinite(value) ? Math.floor(value) : 0
}

export function clampPageIndex(pageIndex: number, pageCount: number): number {
    const safePageCount = Math.max(0, normalizeInteger(pageCount))
    if (safePageCount <= 0) return 0
    return Math.min(Math.max(0, normalizeInteger(pageIndex)), safePageCount - 1)
}

export function getSpreadPageIndex(pageIndex: number, pageCount: number, options: SpreadOptions = {}): number {
    const clamped = clampPageIndex(pageIndex, pageCount)
    if (options.mode === 'single') return clamped
    return clamped % 2 === 0 ? clamped : clamped - 1
}

export function getChatAwareSpreadPageIndex<T extends ChatIndexedPage>(pages: T[], pageIndex: number, options: SpreadOptions = {}): number {
    const clamped = clampPageIndex(pageIndex, pages.length)
    if (options.mode === 'single') return clamped

    const page = pages[clamped]
    if (!page) return clamped

    if (page.chatPageIndex % 2 === 1 && clamped > 0) {
        const previousPage = pages[clamped - 1]
        if (previousPage?.chatIndex === page.chatIndex) return clamped - 1
    }

    return clamped
}

export function getReaderPageAnchor<T extends ChatIndexedPage>(pages: T[], pageIndex: number): ReaderPageAnchor | null {
    const page = pages[clampPageIndex(pageIndex, pages.length)]
    if (!page) return null

    return { chatIndex: page.chatIndex, chatPageIndex: Math.max(0, normalizeInteger(page.chatPageIndex)) }
}

export function resolveReaderPageAnchor<T extends ChatIndexedPage>(pages: T[], anchor: ReaderPageAnchor, fallbackPageIndex = 0): number {
    const exactIndex = pages.findIndex((page) => page.chatIndex === anchor.chatIndex && page.chatPageIndex === anchor.chatPageIndex)
    if (exactIndex >= 0) return exactIndex

    const matchingIndexes = pages
        .map((page, index) => page.chatIndex === anchor.chatIndex ? index : -1)
        .filter((index) => index >= 0)

    if (matchingIndexes.length === 0) return clampPageIndex(fallbackPageIndex, pages.length)
    return matchingIndexes[Math.min(Math.max(0, normalizeInteger(anchor.chatPageIndex)), matchingIndexes.length - 1)]
}

export function getNextChunkCenter(currentChunk: Pick<CaptureChunkResult, 'endIndex'>, messageCount?: number): number {
    const nextCenter = currentChunk.endIndex + 1
    if (messageCount === undefined) return nextCenter
    return Math.min(nextCenter, Math.max(-1, normalizeInteger(messageCount) - 1))
}

export function getPrevChunkCenter(currentChunk: Pick<CaptureChunkResult, 'startIndex'>, messageCount?: number): number {
    const prevCenter = currentChunk.startIndex - 1
    if (messageCount === undefined) return prevCenter
    return Math.max(-1, Math.min(prevCenter, normalizeInteger(messageCount) - 1))
}
