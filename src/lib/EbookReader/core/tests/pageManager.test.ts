import { beforeEach, describe, expect, it } from 'vitest'
import { paginateCapturedMessages, wrapNakedTextNodes } from '../pageManager'
import type { CapturedReaderMessage } from '../readerTypes'

function message(chatIndex: number, html: string): CapturedReaderMessage {
    return {
        chatIndex,
        html,
        headerInfo: { chatIndex, role: chatIndex % 2 === 0 ? 'user' : 'char' },
        contentHash: `hash-${chatIndex}`,
    }
}

function htmlToText(html: string) {
    const container = document.createElement('div')
    container.innerHTML = html
    return container.textContent ?? ''
}

describe('ebook reader page manager', () => {
    beforeEach(() => {
        document.body.innerHTML = ''
    })

    it('wraps adjacent naked text and inline nodes into paragraphs', () => {
        const container = document.createElement('div')
        container.innerHTML = 'Hello <span>inline</span> world <div>block</div>tail <em>emphasis</em>'

        wrapNakedTextNodes(container)

        expect(Array.from(container.children).map((child) => child.tagName.toLowerCase())).toEqual(['p', 'div', 'p'])
        expect(container.children[0].innerHTML).toBe('Hello <span>inline</span> world ')
        expect(container.children[2].innerHTML).toBe('tail <em>emphasis</em>')
    })

    it('paginates captured messages while preserving chatIndex on split paragraphs', () => {
        const pages = paginateCapturedMessages([
            message(7, '<p>alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu</p>'),
        ], {
            dimensions: { width: 320, height: 30 },
            mode: 'desktop',
            measureText: (element) => Math.ceil((element.textContent ?? '').length / 20) * 12,
        })

        expect(pages.length).toBeGreaterThan(1)
        expect(pages.every((page) => page.chatIndex === 7)).toBe(true)
        expect(pages.every((page) => page.headerInfo.role === 'char')).toBe(true)
        expect(pages.map((page) => page.pageIndex)).toEqual(pages.map((_, index) => index))
        expect(document.querySelectorAll('[data-ebook-reader-measure]')).toHaveLength(0)
    })

    it('treats image and details blocks as separate pages when mixed with text', () => {
        const pages = paginateCapturedMessages([
            message(3, '<p>intro</p><figure><img src="/a.png" alt="a" loading="lazy"></figure><details><summary>More</summary><p>hidden</p></details><p>outro</p>'),
        ], {
            dimensions: { width: 320, height: 200 },
            mode: 'mobile',
            measureText: () => 12,
        })

        expect(pages).toHaveLength(4)
        expect(pages.every((page) => page.chatIndex === 3)).toBe(true)
        expect(pages[1].html).toContain('<img')
        expect(pages[1].html).toContain('loading="eager"')
        expect(pages[2].html).toContain('<details')
    })

    it('treats rich status widgets as scrollable separate pages', () => {
        const pages = paginateCapturedMessages([
            message(6, '<p>intro</p><div class="x-risu-dos-status"><style>.x-risu-dos-status{max-width:480px}</style><div>status panel</div><button type="button">action</button></div><p>outro</p>'),
        ], {
            dimensions: { width: 320, height: 200 },
            mode: 'mobile',
            measureText: () => 12,
        })

        expect(pages).toHaveLength(3)
        expect(pages[1].html).toContain('x-risu-dos-status')
        expect(pages[1].overflowMode).toBe('scrollable')
        expect(pages[0].overflowMode).toBeUndefined()
        expect(pages[2].overflowMode).toBeUndefined()
    })

    it('removes measure containers when pagination measurement fails', () => {
        expect(() => paginateCapturedMessages([message(1, '<p>boom</p>')], {
            dimensions: { width: 320, height: 30 },
            measureText: () => {
                throw new Error('measurement failed')
            },
        })).toThrow('measurement failed')

        expect(document.querySelectorAll('[data-ebook-reader-measure]')).toHaveLength(0)
    })

    it('applies custom dimensions and font styles to the measurement container', () => {
        const observedStyles: string[] = []

        paginateCapturedMessages([message(2, '<p>styled reader text</p>')], {
            dimensions: { width: 840, height: 300 },
            measurementStyle: {
                fontSize: '21px',
                lineHeight: '1.9',
                paragraphSpacing: '10px',
                fontFamily: 'Georgia, serif',
            },
            measureText: () => {
                const container = document.querySelector<HTMLElement>('[data-ebook-reader-measure]')
                observedStyles.push([
                    container?.style.width,
                    container?.style.height,
                    container?.style.fontSize,
                    container?.style.lineHeight,
                    container?.dataset.ebookReaderParagraphSpacing,
                    container?.style.fontFamily,
                ].join('|'))
                return 12
            },
        })

        expect(observedStyles).toContain('840px|300px|21px|1.9|10px|Georgia, serif')
        expect(document.querySelectorAll('[data-ebook-reader-measure]')).toHaveLength(0)
    })

    it('includes configured spacing between consecutive paragraphs during measurement', () => {
        const pages = paginateCapturedMessages([
            message(8, '<p>first paragraph</p><p>second paragraph</p>'),
        ], {
            dimensions: { width: 320, height: 46 },
            measurementStyle: { fontSize: '16px', lineHeight: '1.5', paragraphSpacing: '10px' },
            measureText: () => 6,
        })

        expect(pages).toHaveLength(2)
    })

    it('reserves conservative bottom space to avoid clipped page text', () => {
        const pages = paginateCapturedMessages([
            message(9, '<p>alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu</p>'),
        ], {
            dimensions: { width: 320, height: 64 },
            measurementStyle: { paragraphSpacing: '10px' },
            measureText: (element) => (element.textContent ?? '').length <= 24 ? 12 : 60,
        })

        expect(pages.length).toBeGreaterThan(1)
    })

    it('preserves whitespace across sentence boundaries when splitting paragraphs', () => {
        const pages = paginateCapturedMessages([
            message(4, '<p>Hello. World. Reader.</p>'),
        ], {
            dimensions: { width: 320, height: 12 },
            measureText: (element) => (element.textContent ?? '').length <= 14 ? 12 : 24,
        })

        expect(pages.length).toBeGreaterThan(1)
        const text = htmlToText(pages.map((page) => page.html).join(''))
        expect(text).toContain('Hello. World. Reader.')
        expect(text).not.toContain('Hello.World')
    })

    it('falls back to word splitting for an oversized sentence in a multi-sentence paragraph', () => {
        const pages = paginateCapturedMessages([
            message(5, '<p>Short. oversized sentence needs binary word splitting to fit safely. End.</p>'),
        ], {
            dimensions: { width: 320, height: 12 },
            measureText: (element) => (element.textContent ?? '').length <= 20 ? 12 : 24,
        })

        expect(pages.length).toBeGreaterThan(3)
        expect(pages.every((page) => page.chatIndex === 5)).toBe(true)
        expect(htmlToText(pages.map((page) => page.html).join(''))).toContain('oversized sentence needs binary word splitting')
    })
})
