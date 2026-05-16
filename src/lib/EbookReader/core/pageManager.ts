import { createTextSplitter, type ReaderMode } from './textSplitter'
import { CONTENT_BUTTON_SELECTOR } from './chunkCapture'
import type { CapturedReaderMessage, ReaderPage } from './readerTypes'

export type PaginationDimensions = { width: number; height: number }
export type PaginationMeasurementStyle = {
    fontSize?: string
    lineHeight?: string
    fontFamily?: string
}

export type PaginationOptions = {
    dimensions?: PaginationDimensions
    measurementStyle?: PaginationMeasurementStyle
    mode?: ReaderMode
    measureText?: (element: HTMLElement) => number
}

export const DEFAULT_PAGINATION_DIMENSIONS: PaginationDimensions = { width: 720, height: 640 }
const DELEGATION_ATTRIBUTE_SELECTOR = '[data-ebook-reader-content-button], [data-ebook-reader-chat-index], [data-ebook-reader-button-ordinal]'
const DELEGATION_ATTRIBUTES = ['data-ebook-reader-content-button', 'data-ebook-reader-chat-index', 'data-ebook-reader-button-ordinal']
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

    for (const element of Array.from(container.querySelectorAll<HTMLElement>(DELEGATION_ATTRIBUTE_SELECTOR))) {
        for (const attribute of DELEGATION_ATTRIBUTES) element.removeAttribute(attribute)
    }

    Array.from(container.querySelectorAll<HTMLElement>(CONTENT_BUTTON_SELECTOR)).forEach((button, ordinal) => {
        button.setAttribute('data-ebook-reader-content-button', 'true')
        button.setAttribute('data-ebook-reader-chat-index', String(chatIndex))
        button.setAttribute('data-ebook-reader-button-ordinal', String(ordinal))
    })

    return container.innerHTML
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

        for (const message of messages) {
            const content = document.createElement('div')
            content.innerHTML = annotateContentButtons(message.html, message.chatIndex)
            wrapNakedTextNodes(content)

            const pageHtmls = splitIntoPageHtml(content, measureContainer, textSplitter, measureElement)
            for (const html of pageHtmls) {
                if (html.trim() === '') continue
                pages.push({ pageIndex: pages.length, chatIndex: message.chatIndex, html })
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
    if (measurementStyle.fontFamily) container.style.fontFamily = measurementStyle.fontFamily
    document.body.appendChild(container)
    return container
}

function splitIntoPageHtml(
    content: HTMLElement,
    measureContainer: HTMLElement,
    textSplitter: ReturnType<typeof createTextSplitter>,
    measureElement: (element: HTMLElement) => number,
): string[] {
    const pages: string[] = []
    let currentPageContent: HTMLElement[] = []
    const availableHeight = getAvailableHeight(measureContainer)

    const pushCurrentPage = () => {
        if (currentPageContent.length === 0) return
        pages.push(createPageHtml(currentPageContent))
        currentPageContent = []
    }

    const addElementToPage = (element: HTMLElement) => {
        const candidate = [...currentPageContent, element]
        if (currentPageContent.length > 0 && measureElements(candidate, measureContainer, measureElement) > availableHeight) {
            pushCurrentPage()
        }
        currentPageContent.push(element.cloneNode(true) as HTMLElement)
    }

    for (const element of Array.from(content.children)) {
        if (!(element instanceof HTMLElement)) continue

        if (isSeparatePageBlock(element)) {
            pushCurrentPage()
            pages.push(createPageHtml([element.cloneNode(true) as HTMLElement]))
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

function isSeparatePageBlock(element: HTMLElement): boolean {
    return element.tagName === 'IMG'
        || element.tagName === 'DETAILS'
        || element.querySelector('img') !== null
        || (element.tagName === 'DIV' && element.classList.contains('x-risu-image-container'))
}

function measureElements(elements: HTMLElement[], measureContainer: HTMLElement, measureElement: (element: HTMLElement) => number): number {
    measureContainer.innerHTML = ''
    let totalHeight = 0

    for (const element of elements) {
        const clone = element.cloneNode(true) as HTMLElement
        measureContainer.appendChild(clone)
        totalHeight += measureElement(clone)
    }

    return totalHeight
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

function getAvailableHeight(measureContainer: HTMLElement): number {
    const styleHeight = Number.parseFloat(measureContainer.style.height)
    return measureContainer.clientHeight || styleHeight || DEFAULT_PAGINATION_DIMENSIONS.height
}

function createPageHtml(elements: HTMLElement[]): string {
    const wrapper = document.createElement('div')
    for (const element of elements) {
        wrapper.appendChild(element.cloneNode(true))
    }
    return wrapper.innerHTML
}
