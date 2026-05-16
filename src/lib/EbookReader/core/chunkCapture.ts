import { getChatElementByChatIndex } from './readerSelectors'
import type { CapturedReaderMessage, CaptureChunkResult, ChatIndex, ReaderContentButtonDescriptor, ReaderHeaderInfo } from './readerTypes'

type CaptureOptions = {
    radius?: number
    root?: ParentNode | null
    timeoutMs?: number
    intervalMs?: number
}

const DEFAULT_CHUNK_RADIUS = 5
const DEFAULT_WAIT_TIMEOUT_MS = 500
const DEFAULT_WAIT_INTERVAL_MS = 25

export const CONTENT_BUTTON_SELECTOR = [
    '[risu-trigger]',
    '[risu-btn]',
    'button',
    '[role="button"]',
    '.risu-btn',
    '.x-risu-lb-opener',
    '.x-risu-lb-nai-btn',
    '.x-risu-lb-nai-opener',
].join(', ')

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeMessageCount(messageCount: number) {
    return Math.max(0, Math.floor(messageCount))
}

function parseChatIndex(row: HTMLElement): ChatIndex {
    const parsed = Number.parseInt(row.getAttribute('data-chat-index') ?? '', 10)
    return Number.isFinite(parsed) ? parsed : -1
}

function readTrimmedText(element: Element | null) {
    const value = element?.textContent?.trim()
    return value ? value.replace(/\s+/g, ' ') : undefined
}

function findBestContentElement(row: HTMLElement): HTMLElement | null {
    const selectors = [
        '[data-reader-content]',
        '.message-content',
        '.chat-body',
        '.markdown-body',
        '.prose',
        '.leading-relaxed',
        '.message-edit-area',
    ]

    for (const selector of selectors) {
        const candidate = row.querySelector<HTMLElement>(selector)
        if (candidate) return candidate
    }

    return null
}

function removeNonContentControls(clone: HTMLElement) {
    const selectors = [
        'button',
        'svg',
        '[role="button"]',
        '.toolbar',
        '.header',
        '.flexium.items-center.chat-width',
        '.absolute.bottom-0.right-0',
        '.min-w-0',
    ]
    clone.querySelectorAll(selectors.join(',')).forEach((element) => {
        element.remove()
    })
}

export function getReaderIndices(messageCount: number): ChatIndex[] {
    return [-1, ...Array.from({ length: normalizeMessageCount(messageCount) }, (_, index) => index)]
}

export function getChunkIndices(center: ChatIndex, messageCount: number, radius = DEFAULT_CHUNK_RADIUS): ChatIndex[] {
    const all = getReaderIndices(messageCount)
    const exactCenterPos = all.indexOf(center)
    const centerPos = exactCenterPos >= 0
        ? exactCenterPos
        : center < all[0]
            ? 0
            : all.length - 1
    const safeRadius = Math.max(0, Math.floor(radius))
    return all.slice(Math.max(0, centerPos - safeRadius), Math.min(all.length, centerPos + safeRadius + 1))
}

export async function waitForChatElement(
    chatIndex: ChatIndex,
    options: Pick<CaptureOptions, 'root' | 'timeoutMs' | 'intervalMs'> = {},
): Promise<HTMLElement | null> {
    const timeoutMs = Math.max(0, options.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS)
    const intervalMs = Math.max(1, options.intervalMs ?? DEFAULT_WAIT_INTERVAL_MS)
    const deadline = Date.now() + timeoutMs

    do {
        const row = getChatElementByChatIndex(chatIndex, options.root)
        if (row) return row
        if (Date.now() >= deadline) break
        await delay(Math.min(intervalMs, Math.max(0, deadline - Date.now())))
    } while (Date.now() <= deadline)

    return getChatElementByChatIndex(chatIndex, options.root)
}

export async function ensureRepresentativeRow(
    indices: ChatIndex[],
    options: Pick<CaptureOptions, 'root' | 'timeoutMs' | 'intervalMs'> = {},
): Promise<HTMLElement | null> {
    for (const index of indices) {
        const existing = getChatElementByChatIndex(index, options.root)
        if (existing) return existing
    }

    const representative = indices[Math.max(0, Math.floor(indices.length / 2))]
    if (representative === undefined) return null
    return waitForChatElement(representative, options)
}

export function extractHeaderInfo(row: HTMLElement): ReaderHeaderInfo {
    const chatIndex = parseChatIndex(row)
    const thumbnailUrl = row.querySelector<HTMLImageElement>('img')?.currentSrc || row.querySelector<HTMLImageElement>('img')?.src || undefined
    const name = readTrimmedText(row.querySelector('.name'))
        ?? readTrimmedText(row.querySelector('.chat-width.text-xl span'))
        ?? readTrimmedText(row.querySelector('.text-lg, .text-xl, h2'))

    return { chatIndex, ...(name ? { name } : {}), ...(thumbnailUrl ? { thumbnailUrl } : {}) }
}

export function extractContentHtml(row: HTMLElement): string {
    const content = findBestContentElement(row)
    if (content) return content.innerHTML.trim()

    const clone = row.cloneNode(true) as HTMLElement
    removeNonContentControls(clone)
    return clone.innerHTML.trim()
}

export function extractContentButtonDescriptors(row: HTMLElement, chatIndex = parseChatIndex(row)): ReaderContentButtonDescriptor[] {
    return Array.from(row.querySelectorAll<HTMLElement>(CONTENT_BUTTON_SELECTOR), (_, ordinal) => ({
        chatIndex,
        ordinal,
        selector: CONTENT_BUTTON_SELECTOR,
    }))
}

export function hashContent(content: string): string {
    let hash = 2166136261
    for (let index = 0; index < content.length; index += 1) {
        hash ^= content.charCodeAt(index)
        hash = Math.imul(hash, 16777619)
    }
    return (hash >>> 0).toString(16).padStart(8, '0')
}

export function captureRow(row: HTMLElement): CapturedReaderMessage {
    const chatIndex = parseChatIndex(row)
    const chatId = row.getAttribute('data-chat-id') || undefined
    const contentButtons = extractContentButtonDescriptors(row, chatIndex)
    const html = extractContentHtml(row)
    return {
        chatIndex,
        ...(chatId ? { chatId } : {}),
        html,
        headerInfo: extractHeaderInfo(row),
        contentHash: hashContent(html),
        contentButtons,
    }
}

export async function captureChunk(
    center: ChatIndex,
    messageCount: number,
    options: CaptureOptions = {},
): Promise<CaptureChunkResult> {
    const requestedIndices = getChunkIndices(center, messageCount, options.radius ?? DEFAULT_CHUNK_RADIUS)
    await ensureRepresentativeRow(requestedIndices, options)

    const capturedMessages: CapturedReaderMessage[] = []
    const missingIndices: ChatIndex[] = []

    for (const index of requestedIndices) {
        const row = await waitForChatElement(index, options)
        if (row) {
            capturedMessages.push(captureRow(row))
        } else {
            missingIndices.push(index)
        }
    }

    return {
        requestedIndices,
        capturedMessages,
        missingIndices,
        partial: missingIndices.length > 0,
        startIndex: requestedIndices[0] ?? center,
        endIndex: requestedIndices.at(-1) ?? center,
    }
}
