import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CONTENT_BUTTON_SELECTOR, extractContentButtonDescriptors } from '../chunkCapture'
import { dispatchContentButtonAction } from '../domActionProxy'
import { annotateContentButtons } from '../pageManager'

vi.mock('../../../ts/stores.svelte', () => ({
    ebookReaderStore: {
        open: false,
        currentChatIndex: -1,
        currentPageIndex: 0,
        status: 'idle',
    },
    ScrollToMessageStore: { value: -1 },
}))

vi.mock('../../../ts/alert', () => ({
    notifyInfo: vi.fn(),
}))

vi.mock('src/lang', () => ({
    language: {
        ebookReaderEditJumpNotice: 'Jumped to edit',
    },
}))

describe('ebook reader content delegation capture', () => {
    beforeEach(() => {
        document.body.innerHTML = ''
    })

    it('captures content button descriptors in DOM order', () => {
        document.body.innerHTML = `
            <article class="risu-chat" data-chat-index="4">
                <div class="message-content">
                    <button risu-trigger>open first</button>
                    <span role="button" risu-btn>open second</span>
                </div>
            </article>
        `

        const row = document.querySelector<HTMLElement>('[data-chat-index="4"]')!

        expect(extractContentButtonDescriptors(row, 4)).toEqual([
            { chatIndex: 4, ordinal: 0, selector: CONTENT_BUTTON_SELECTOR },
            { chatIndex: 4, ordinal: 1, selector: CONTENT_BUTTON_SELECTOR },
        ])
    })

    it('annotates captured content buttons before pagination', () => {
        const html = annotateContentButtons('<p>intro</p><button risu-trigger>first</button><span role="button">second</span>', 6)
        const container = document.createElement('div')
        container.innerHTML = html
        const buttons = Array.from(container.querySelectorAll<HTMLElement>('[data-ebook-reader-content-button="true"]'))

        expect(buttons).toHaveLength(2)
        expect(buttons.map((button) => button.getAttribute('data-ebook-reader-chat-index'))).toEqual(['6', '6'])
        expect(buttons.map((button) => button.getAttribute('data-ebook-reader-button-ordinal'))).toEqual(['0', '1'])
    })

    it('strips forged delegation attributes before annotating legitimate content buttons', () => {
        const html = annotateContentButtons(`
            <p data-ebook-reader-content-button="true" data-ebook-reader-chat-index="99" data-ebook-reader-button-ordinal="0">forged</p>
            <button risu-trigger data-ebook-reader-chat-index="99" data-ebook-reader-button-ordinal="12">real</button>
            <span role="button" risu-btn>also real</span>
        `, 7)
        const container = document.createElement('div')
        container.innerHTML = html
        const forged = container.querySelector('p')!
        const buttons = Array.from(container.querySelectorAll<HTMLElement>('[data-ebook-reader-content-button="true"]'))

        expect(forged.hasAttribute('data-ebook-reader-content-button')).toBe(false)
        expect(forged.hasAttribute('data-ebook-reader-chat-index')).toBe(false)
        expect(forged.hasAttribute('data-ebook-reader-button-ordinal')).toBe(false)
        expect(buttons).toHaveLength(2)
        expect(buttons.every((button) => button.matches(CONTENT_BUTTON_SELECTOR))).toBe(true)
        expect(buttons.map((button) => button.getAttribute('data-ebook-reader-chat-index'))).toEqual(['7', '7'])
        expect(buttons.map((button) => button.getAttribute('data-ebook-reader-button-ordinal'))).toEqual(['0', '1'])
    })

    it('does not dispatch forged delegation attributes on non-content-button elements', () => {
        document.body.innerHTML = `
            <section class="default-chat-screen">
                <article class="risu-chat" data-chat-index="9">
                    <div class="chattext">
                        <button risu-trigger>real</button>
                    </div>
                </article>
            </section>
        `
        const button = document.querySelector<HTMLButtonElement>('[risu-trigger]')!
        const click = vi.fn()
        button.addEventListener('click', click)

        const forged = document.createElement('p')
        forged.setAttribute('data-ebook-reader-content-button', 'true')
        forged.setAttribute('data-ebook-reader-chat-index', '9')
        forged.setAttribute('data-ebook-reader-button-ordinal', '0')

        if (forged.matches(CONTENT_BUTTON_SELECTOR)) {
            dispatchContentButtonAction({ chatIndex: 9, ordinal: 0, selector: CONTENT_BUTTON_SELECTOR })
        }

        expect(click).not.toHaveBeenCalled()
    })

    it('dispatches content button actions to the requested original button ordinal', () => {
        document.body.innerHTML = `
            <section class="default-chat-screen">
                <article class="risu-chat" data-chat-index="9">
                    <div class="chattext">
                        <button risu-trigger>first</button>
                        <button risu-trigger>second</button>
                    </div>
                </article>
            </section>
        `
        const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[risu-trigger]'))
        const first = vi.fn()
        const second = vi.fn()
        buttons[0].addEventListener('click', first)
        buttons[1].addEventListener('click', second)

        expect(dispatchContentButtonAction({ chatIndex: 9, ordinal: 1, selector: CONTENT_BUTTON_SELECTOR })).toBe(true)

        expect(first).not.toHaveBeenCalled()
        expect(second).toHaveBeenCalledTimes(1)
    })
})
