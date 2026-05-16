export type ReaderMode = 'desktop' | 'mobile'

export type ElementMeasure = (element: HTMLElement) => number

type TextSplitterOptions = {
    splittableTags?: string[]
    measureElement: ElementMeasure
}

const DESKTOP_COMPLEX_SELECTOR = 'mark, strong, em, a, span[class], code'
const MOBILE_COMPLEX_SELECTOR = 'mark, strong, em, a, code'

export class TextSplitterBase {
    protected readonly splittableTags: string[]
    protected readonly measureElement: ElementMeasure
    protected readonly complexSelector: string

    constructor(options: TextSplitterOptions, complexSelector = DESKTOP_COMPLEX_SELECTOR) {
        this.splittableTags = options.splittableTags ?? ['p']
        this.measureElement = options.measureElement
        this.complexSelector = complexSelector
    }

    isSplittable(element: HTMLElement): boolean {
        const tagName = element.tagName.toLowerCase()
        return this.splittableTags.includes(tagName) && !element.querySelector(this.complexSelector)
    }

    splitElement(element: HTMLElement, availableHeight: number): HTMLElement[] {
        if (!this.isSplittable(element) || this.measureElement(element) <= availableHeight) {
            return [element.cloneNode(true) as HTMLElement]
        }

        return this.splitBySentence(element, availableHeight)
    }

    protected splitBySentence(element: HTMLElement, availableHeight: number): HTMLElement[] {
        const sentences = this.splitIntoSentences(this.getElementText(element))
        if (sentences.length <= 1) return this.splitByWords(element, availableHeight)

        const results: HTMLElement[] = []
        let current: string[] = []

        for (const sentence of sentences) {
            const next = [...current, sentence]
            const candidate = this.createPartElement(element, next.join(''))

            if (this.measureElement(candidate) <= availableHeight) {
                current = next
            } else if (current.length === 0) {
                results.push(...this.splitTextByWords(element, sentence, availableHeight))
            } else {
                const currentElement = this.createPartElement(element, current.join(''))
                if (this.measureElement(currentElement) <= availableHeight) {
                    results.push(currentElement)
                } else {
                    results.push(...this.splitTextByWords(element, current.join(''), availableHeight))
                }
                current = [sentence]
            }
        }

        if (current.length > 0) {
            const finalElement = this.createPartElement(element, current.join(''))
            if (this.measureElement(finalElement) <= availableHeight) {
                results.push(finalElement)
            } else {
                results.push(...this.splitTextByWords(element, current.join(''), availableHeight))
            }
        }
        return results.length > 0 ? results : [element.cloneNode(true) as HTMLElement]
    }

    protected splitIntoSentences(text: string): string[] {
        const sentences: string[] = text.match(/[^.!?。！？]+[.!?。！？]?\s*/g) ?? []
        return sentences.filter((part) => part.length > 0)
    }

    protected splitByWords(element: HTMLElement, availableHeight: number): HTMLElement[] {
        return this.splitTextByWords(element, this.getElementText(element), availableHeight)
    }

    protected splitTextByWords(element: HTMLElement, text: string, availableHeight: number): HTMLElement[] {
        const tokens = this.tokenize(text)
        if (tokens.length === 0) return [element.cloneNode(true) as HTMLElement]

        const results: HTMLElement[] = []
        let startIndex = 0

        while (startIndex < tokens.length) {
            const bestFit = this.findBestFitBinary(tokens, startIndex, element, availableHeight)
            const endIndex = Math.max(bestFit, startIndex + 1)
            results.push(this.createPartElement(element, tokens.slice(startIndex, endIndex).join('')))
            startIndex = endIndex
        }

        return results
    }

    protected findBestFitBinary(tokens: string[], startIndex: number, element: HTMLElement, availableHeight: number): number {
        let low = startIndex + 1
        let high = tokens.length
        let bestFit = startIndex + 1

        const single = this.createPartElement(element, tokens.slice(startIndex, startIndex + 1).join(''))
        if (this.measureElement(single) > availableHeight) return startIndex + 1

        while (low <= high) {
            const mid = Math.floor((low + high) / 2)
            const candidate = this.createPartElement(element, tokens.slice(startIndex, mid).join(''))

            if (this.measureElement(candidate) <= availableHeight) {
                bestFit = mid
                low = mid + 1
            } else {
                high = mid - 1
            }
        }

        return bestFit
    }

    protected tokenize(text: string): string[] {
        return text.split(/(\s+)/).filter((part) => part.length > 0)
    }

    protected getElementText(element: HTMLElement): string {
        return element.innerText || element.textContent || ''
    }

    protected createPartElement(originalElement: HTMLElement, textContent: string): HTMLElement {
        const partElement = document.createElement(originalElement.tagName.toLowerCase())
        for (const attribute of Array.from(originalElement.attributes)) {
            partElement.setAttribute(attribute.name, attribute.value)
        }
        partElement.textContent = textContent
        return partElement
    }
}

export class DesktopTextSplitter extends TextSplitterBase {
    constructor(options: TextSplitterOptions) {
        super(options, DESKTOP_COMPLEX_SELECTOR)
    }
}

export class MobileTextSplitter extends TextSplitterBase {
    constructor(options: TextSplitterOptions) {
        super(options, MOBILE_COMPLEX_SELECTOR)
    }

    protected tokenize(text: string): string[] {
        const tokens: string[] = []
        let currentToken = ''
        let lastCharType = ''

        for (const char of text) {
            const charType = this.getCharType(char)

            if (charType === 'space') {
                if (currentToken) tokens.push(currentToken)
                currentToken = ''
                tokens.push(char)
            } else if (charType === 'korean') {
                if (currentToken) tokens.push(currentToken)
                currentToken = ''
                tokens.push(char)
            } else {
                if (currentToken && lastCharType && lastCharType !== charType && lastCharType !== 'space') {
                    tokens.push(currentToken)
                    currentToken = ''
                }
                currentToken += char
            }

            lastCharType = charType
        }

        if (currentToken) tokens.push(currentToken)
        return tokens
    }

    private getCharType(char: string): string {
        if (/\s/.test(char)) return 'space'
        if (/[\u3131-\uD79D]/.test(char)) return 'korean'
        if (/[\u3040-\u30FF]/.test(char)) return 'japanese'
        if (/[\u4E00-\u9FFF]/.test(char)) return 'chinese'
        if (/[a-zA-Z]/.test(char)) return 'english'
        if (/[0-9]/.test(char)) return 'number'
        return 'other'
    }
}

export function createTextSplitter(mode: ReaderMode, measureElement: ElementMeasure): TextSplitterBase {
    return mode === 'mobile'
        ? new MobileTextSplitter({ measureElement })
        : new DesktopTextSplitter({ measureElement })
}
