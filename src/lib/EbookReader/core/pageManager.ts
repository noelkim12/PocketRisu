import { createTextSplitter, type ReaderMode } from './textSplitter'
import { CONTENT_BUTTON_SELECTOR } from './chunkCapture'
import type { CapturedReaderMessage, ReaderPage, ReaderPageOverflowMode } from './readerTypes'

export type PaginationDimensions = { width: number; height: number }
export type PaginationMeasurementStyle = {
    fontSize?: string
    lineHeight?: string
    paragraphSpacing?: string
    fontFamily?: string
}

export type PaginationOptions = {
    dimensions?: PaginationDimensions
    measurementStyle?: PaginationMeasurementStyle
    mode?: ReaderMode
    measureText?: (element: HTMLElement) => number
}

type PageHtmlSegment = { html: string; overflowMode?: ReaderPageOverflowMode }

export const DEFAULT_PAGINATION_DIMENSIONS: PaginationDimensions = { width: 720, height: 640 }
const DELEGATION_ATTRIBUTE_SELECTOR = '[data-ebook-reader-content-button], [data-ebook-reader-chat-index], [data-ebook-reader-button-ordinal]'
const DELEGATION_ATTRIBUTES = ['data-ebook-reader-content-button', 'data-ebook-reader-chat-index', 'data-ebook-reader-button-ordinal']
const READER_POPOVER_ATTRIBUTE = 'data-ebook-reader-popover'
const COMFY_VIDEO_CAPTURED_CONTROL_SELECTOR = '.x-risu-risu-comfy-video-action-button, .x-risu-risu-comfy-video-generating-status'
const INLAY_RESOLUTION_STATE_SELECTOR = '[data-inlay-id][data-inlay-type][data-inlay-resolving]'
const RICH_WIDGET_SELECTOR = '.x-risu-dos-status, [data-ebook-reader-widget], [data-ebook-reader-rich-block], [data-ebook-reader-unbreakable]'
const BLOCK_ELEMENTS = new Set([
    'p', 'div', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'blockquote', 'pre', 'hr',
    'details', 'figure', 'section', 'article', 'header', 'footer', 'nav', 'aside', 'title',
])

export function wrapNakedTextNodes(container: HTMLElement): void {
    const childNodes = Array.from(container.childNodes)
    let currentGroup: ChildNode[] = []

    const flushGroup = () => {
        if (currentGroup.length === 0) return

        const combinedHtml = currentGroup.map((node) => {
            if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
            if (node instanceof HTMLElement) return node.outerHTML
            return node.textContent ?? ''
        }).join('')

        if (combinedHtml.trim() !== '') {
            const paragraph = document.createElement('p')
            paragraph.innerHTML = combinedHtml
            container.insertBefore(paragraph, currentGroup[0])
        }

        for (const node of currentGroup) {
            node.parentNode?.removeChild(node)
        }
        currentGroup = []
    }

    for (const node of childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
            if ((node.textContent ?? '').trim() !== '' || currentGroup.length > 0) currentGroup.push(node)
            continue
        }

        if (node instanceof HTMLElement) {
            if (BLOCK_ELEMENTS.has(node.tagName.toLowerCase())) {
                flushGroup()
            } else {
                currentGroup.push(node)
            }
        }
    }

    flushGroup()
}

export function annotateContentButtons(html: string, chatIndex: number): string {
    const container = document.createElement('div')
    container.innerHTML = html
    normalizeReaderImages(container)
    removeCapturedComfyVideoControls(container)
    resetCapturedInlayResolutionState(container)

    for (const element of Array.from(container.querySelectorAll<HTMLElement>(DELEGATION_ATTRIBUTE_SELECTOR))) {
        for (const attribute of DELEGATION_ATTRIBUTES) element.removeAttribute(attribute)
    }

    retargetPopoverControls(container, chatIndex)

    Array.from(container.querySelectorAll<HTMLElement>(CONTENT_BUTTON_SELECTOR)).forEach((button, ordinal) => {
        button.setAttribute('data-ebook-reader-content-button', 'true')
        button.setAttribute('data-ebook-reader-chat-index', String(chatIndex))
        button.setAttribute('data-ebook-reader-button-ordinal', String(ordinal))
    })

    return container.innerHTML
}

function normalizeReaderImages(container: HTMLElement) {
    for (const image of Array.from(container.querySelectorAll<HTMLImageElement>('img'))) {
        image.loading = 'eager'
        image.decoding = 'async'
    }
}

function removeCapturedComfyVideoControls(container: HTMLElement) {
    for (const control of Array.from(container.querySelectorAll<HTMLElement>(COMFY_VIDEO_CAPTURED_CONTROL_SELECTOR))) {
        control.remove()
    }
}

function resetCapturedInlayResolutionState(container: HTMLElement) {
    for (const placeholder of Array.from(container.querySelectorAll<HTMLElement>(INLAY_RESOLUTION_STATE_SELECTOR))) {
        placeholder.removeAttribute('data-inlay-resolving')
    }
}

function retargetPopoverControls(container: HTMLElement, chatIndex: number) {
    const targetsById = new Map<string, HTMLElement>()
    for (const target of Array.from(container.querySelectorAll<HTMLElement>('[id][popover]'))) {
        if (!isReaderManagedPopover(target)) continue
        const id = target.id
        if (id) targetsById.set(id, target)
    }

    const idMap = new Map<string, string>()
    for (const control of Array.from(container.querySelectorAll<HTMLElement>('[popovertarget]'))) {
        const oldId = control.getAttribute('popovertarget') ?? ''
        const target = targetsById.get(oldId)
        if (!target) continue

        const newId = idMap.get(oldId) ?? `ebook-reader-popover-${chatIndex}-${idMap.size}`
        idMap.set(oldId, newId)
        control.setAttribute('popovertarget', newId)
        target.id = newId
        target.setAttribute(READER_POPOVER_ATTRIBUTE, 'true')
    }
}

function isReaderManagedPopover(target: HTMLElement) {
    return target.classList.contains('x-risu-lb-xnai-menu')
}

export function paginateCapturedMessages(messages: CapturedReaderMessage[], options: PaginationOptions = {}): ReaderPage[] {
    const createdContainers: HTMLElement[] = []

    try {
        const dimensions = options.dimensions ?? DEFAULT_PAGINATION_DIMENSIONS
        const measureContainer = createMeasureContainer(dimensions, options.measurementStyle)
        createdContainers.push(measureContainer)

        const measureElement = (element: HTMLElement) => measureSingleElement(element, options)
        const textSplitter = createTextSplitter(options.mode ?? 'desktop', measureElement)
        const pages: ReaderPage[] = []
        const chatPageCounters = new Map<number, number>()

        for (const message of messages) {
            const content = document.createElement('div')
            content.innerHTML = annotateContentButtons(message.html, message.chatIndex)
            wrapNakedTextNodes(content)

            const pageSegments = splitIntoPageHtml(content, measureContainer, textSplitter, measureElement)
            for (const segment of pageSegments) {
                if (segment.html.trim() === '') continue
                const chatPageIndex = chatPageCounters.get(message.chatIndex) ?? 0
                chatPageCounters.set(message.chatIndex, chatPageIndex + 1)
                pages.push({ pageIndex: pages.length, chatPageIndex, chatIndex: message.chatIndex, headerInfo: message.headerInfo, html: segment.html, overflowMode: segment.overflowMode })
            }
        }

        return pages
    } finally {
        for (const container of createdContainers) container.remove()
        for (const container of Array.from(document.querySelectorAll('[data-ebook-reader-measure]'))) {
            container.remove()
        }
    }
}

function createMeasureContainer(dimensions: PaginationDimensions, measurementStyle: PaginationMeasurementStyle = {}): HTMLElement {
    const container = document.createElement('div')
    container.className = 'text-content chattext'
    container.setAttribute('data-ebook-reader-measure', 'true')
    container.style.cssText = [
        'position:absolute',
        'visibility:hidden',
        'pointer-events:none',
        'overflow:hidden',
        `width:${dimensions.width}px`,
        `height:${dimensions.height}px`,
        'left:-10000px',
        'top:0',
    ].join(';')
    if (measurementStyle.fontSize) container.style.fontSize = measurementStyle.fontSize
    if (measurementStyle.lineHeight) container.style.lineHeight = measurementStyle.lineHeight
    if (measurementStyle.paragraphSpacing) container.dataset.ebookReaderParagraphSpacing = measurementStyle.paragraphSpacing
    if (measurementStyle.fontFamily) container.style.fontFamily = measurementStyle.fontFamily
    document.body.appendChild(container)
    return container
}

function splitIntoPageHtml(
    content: HTMLElement,
    measureContainer: HTMLElement,
    textSplitter: ReturnType<typeof createTextSplitter>,
    measureElement: (element: HTMLElement) => number,
): PageHtmlSegment[] {
    const pages: PageHtmlSegment[] = []
    let currentPageContent: HTMLElement[] = []
    let currentPageOverflowMode: ReaderPageOverflowMode | undefined
    const availableHeight = getSafeAvailableHeight(measureContainer)

    const pushCurrentPage = () => {
        if (currentPageContent.length === 0) return
        pages.push(createPageSegment(currentPageContent, currentPageOverflowMode))
        currentPageContent = []
        currentPageOverflowMode = undefined
    }

    const addElementToPage = (element: HTMLElement) => {
        const candidate = [...currentPageContent, element]
        if (currentPageContent.length > 0 && measureElements(candidate, measureContainer, measureElement) > availableHeight) {
            pushCurrentPage()
        }
        if (isScrollableRichBlock(element)) currentPageOverflowMode = 'scrollable'
        currentPageContent.push(element.cloneNode(true) as HTMLElement)
    }

    for (const element of Array.from(content.children)) {
        if (!(element instanceof HTMLElement)) continue

        const standaloneImageSegments = splitMixedImageElement(element)
        if (standaloneImageSegments.length > 1) {
            for (const segment of standaloneImageSegments) {
                if (isSeparatePageBlock(segment)) {
                    pushCurrentPage()
                    pages.push(createPageSegment([segment], isScrollableRichBlock(segment) ? 'scrollable' : undefined))
                    continue
                }

                const candidate = [...currentPageContent, segment]
                if (measureElements(candidate, measureContainer, measureElement) <= availableHeight) {
                    currentPageContent.push(segment)
                    continue
                }

                pushCurrentPage()

                if (textSplitter.isSplittable(segment)) {
                    for (const splitElement of textSplitter.splitElement(segment, availableHeight)) addElementToPage(splitElement)
                    continue
                }

                addElementToPage(segment)
            }
            continue
        }

        if (isSeparatePageBlock(element)) {
            pushCurrentPage()
            pages.push(createPageSegment([element.cloneNode(true) as HTMLElement], isScrollableRichBlock(element) ? 'scrollable' : undefined))
            continue
        }

        const candidate = [...currentPageContent, element]
        if (measureElements(candidate, measureContainer, measureElement) <= availableHeight) {
            currentPageContent.push(element.cloneNode(true) as HTMLElement)
            continue
        }

        pushCurrentPage()

        if (textSplitter.isSplittable(element)) {
            for (const splitElement of textSplitter.splitElement(element, availableHeight)) addElementToPage(splitElement)
            continue
        }

        addElementToPage(element)
    }

    pushCurrentPage()
    return pages
}

function splitMixedImageElement(element: HTMLElement): HTMLElement[] {
    if (!element.querySelector('img')) return [element]
    if (isImagePageBlock(element)) return [element]

    const segments: HTMLElement[] = []
    let currentTextSegment = createEmptyElementClone(element)

    const flushTextSegment = () => {
        if (!hasMeaningfulContent(currentTextSegment)) {
            currentTextSegment = createEmptyElementClone(element)
            return
        }

        segments.push(currentTextSegment)
        currentTextSegment = createEmptyElementClone(element)
    }

    for (const child of Array.from(element.childNodes)) {
        if (child instanceof HTMLElement && isImagePageBlock(child)) {
            flushTextSegment()
            segments.push(child.cloneNode(true) as HTMLElement)
            continue
        }

        currentTextSegment.appendChild(child.cloneNode(true))
    }

    flushTextSegment()
    return segments.length > 1 ? segments : [element]
}

function createEmptyElementClone(element: HTMLElement): HTMLElement {
    const clone = document.createElement(element.tagName.toLowerCase())
    for (const attribute of Array.from(element.attributes)) clone.setAttribute(attribute.name, attribute.value)
    return clone
}

function hasMeaningfulContent(element: HTMLElement): boolean {
    for (const node of Array.from(element.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '') return true
        if (node instanceof HTMLBRElement) continue
        if (node instanceof HTMLElement) return true
    }

    return false
}

function isImagePageBlock(element: HTMLElement): boolean {
    return element.tagName === 'IMG'
        || element.classList.contains('x-risu-risu-inlay-image')
        || element.classList.contains('x-risu-image-container')
        || element.tagName === 'FIGURE'
        || isImageOnlyElement(element)
}

function isImageOnlyElement(element: HTMLElement): boolean {
    const meaningfulChildren = Array.from(element.childNodes).filter((node) => {
        if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').trim() !== ''
        if (node instanceof HTMLBRElement) return false
        return node instanceof HTMLElement
    })

    return meaningfulChildren.length === 1
        && meaningfulChildren[0] instanceof HTMLElement
        && (meaningfulChildren[0].tagName === 'IMG' || isImagePageBlock(meaningfulChildren[0]))
}

function isSeparatePageBlock(element: HTMLElement): boolean {
    return isImagePageBlock(element)
        || element.tagName === 'DETAILS'
        || element.querySelector('img') !== null
        || isScrollableRichBlock(element)
}

function isScrollableRichBlock(element: HTMLElement): boolean {
    return element.matches(RICH_WIDGET_SELECTOR) || element.querySelector(RICH_WIDGET_SELECTOR) !== null
}

function measureElements(elements: HTMLElement[], measureContainer: HTMLElement, measureElement: (element: HTMLElement) => number): number {
    measureContainer.innerHTML = ''
    let totalHeight = 0
    let previousElement: HTMLElement | null = null

    for (const element of elements) {
        const clone = element.cloneNode(true) as HTMLElement
        measureContainer.appendChild(clone)
        if (previousElement && isParagraphElement(previousElement) && isParagraphElement(clone)) totalHeight += getParagraphSpacingPx(measureContainer)
        totalHeight += measureElement(clone)
        previousElement = clone
    }

    return totalHeight
}

function isParagraphElement(element: HTMLElement): boolean {
    return element.tagName.toLowerCase() === 'p'
}

function getParagraphSpacingPx(measureContainer: HTMLElement): number {
    const rawValue = measureContainer.dataset.ebookReaderParagraphSpacing
    if (!rawValue) return 0
    return Number.parseFloat(rawValue) || 0
}

function measureSingleElement(element: HTMLElement, options: PaginationOptions): number {
    if (options.measureText) return Math.max(0, options.measureText(element))

    const style = window.getComputedStyle(element)
    const marginBottom = Number.parseFloat(style.marginBottom) || 0
    const rectHeight = element.getBoundingClientRect().height
    const measuredHeight = element.scrollHeight || element.clientHeight || rectHeight
    if (measuredHeight > 0) return Math.max(0, measuredHeight - marginBottom)

    const textLength = (element.textContent ?? '').trim().length
    return Math.max(16, Math.ceil(textLength / 80) * 20)
}

function getSafeAvailableHeight(measureContainer: HTMLElement): number {
    const styleHeight = Number.parseFloat(measureContainer.style.height)
    const rawHeight = measureContainer.clientHeight || styleHeight || DEFAULT_PAGINATION_DIMENSIONS.height
    const safetyReserve = Math.ceil(getLineHeightPx(measureContainer) + getParagraphSpacingPx(measureContainer) + 8)
    return Math.max(16, rawHeight - safetyReserve)
}

function getLineHeightPx(measureContainer: HTMLElement): number {
    const style = window.getComputedStyle(measureContainer)
    const fontSize = Number.parseFloat(style.fontSize) || Number.parseFloat(measureContainer.style.fontSize) || 16
    const lineHeight = Number.parseFloat(style.lineHeight || measureContainer.style.lineHeight)
    if (!Number.isFinite(lineHeight) || lineHeight <= 0) return fontSize * 1.2
    if (style.lineHeight.endsWith('px') || measureContainer.style.lineHeight.endsWith('px')) return lineHeight
    return lineHeight * fontSize
}

function createPageHtml(elements: HTMLElement[]): string {
    const wrapper = document.createElement('div')
    for (const element of elements) {
        wrapper.appendChild(element.cloneNode(true))
    }
    return wrapper.innerHTML
}

function createPageSegment(elements: HTMLElement[], overflowMode?: ReaderPageOverflowMode): PageHtmlSegment {
    return { html: createPageHtml(elements), overflowMode }
}
