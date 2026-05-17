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

    it('retargets copied popover controls to reader-local popover ids', () => {
        const html = annotateContentButtons(`
            <button popovertarget="lb-xnai-lazy-13">삽화</button>
            <div class="x-risu-lb-xnai-menu" id="lb-xnai-lazy-13" popover>
                <button popovertarget="lb-xnai-lazy-13" risu-btn="lb-xnai-gen/13">이미지 전체 생성</button>
            </div>
        `, 13)
        const container = document.createElement('div')
        container.innerHTML = html
        const opener = container.querySelector<HTMLButtonElement>('button:not([risu-btn])')!
        const action = container.querySelector<HTMLButtonElement>('button[risu-btn]')!
        const popover = container.querySelector<HTMLElement>('[popover]')!

        expect(opener.getAttribute('popovertarget')).toBe('ebook-reader-popover-13-0')
        expect(action.getAttribute('popovertarget')).toBe('ebook-reader-popover-13-0')
        expect(popover.id).toBe('ebook-reader-popover-13-0')
        expect(popover.getAttribute('data-ebook-reader-popover')).toBe('true')
    })

    it('preserves fullsize image popovers without reader retargeting', () => {
        const html = annotateContentButtons(`
            <button type="button" popovertarget="lb-xnai-pop-15-5"><img src="/api/asset/example"></button>
            <dialog class="x-risu-lb-xnai-fullsize-pop" popover id="lb-xnai-pop-15-5">
                <div><button type="button" popovertarget="lb-xnai-pop-15-5"><img src="/api/asset/full"></button></div>
            </dialog>
        `, 15)
        const container = document.createElement('div')
        container.innerHTML = html
        const opener = container.querySelector<HTMLButtonElement>('button')!
        const dialog = container.querySelector<HTMLDialogElement>('dialog')!
        const images = Array.from(container.querySelectorAll<HTMLImageElement>('img'))

        expect(opener.getAttribute('popovertarget')).toBe('lb-xnai-pop-15-5')
        expect(dialog.id).toBe('lb-xnai-pop-15-5')
        expect(dialog.hasAttribute('data-ebook-reader-popover')).toBe(false)
        expect(images.map((image) => image.getAttribute('src'))).toEqual(['/api/asset/example', '/api/asset/full'])
    })

    it('removes captured Comfy video hover controls so nested image opener buttons are not split by HTML parsing', () => {
        const html = annotateContentButtons(`
            <button popovertarget="lb-xnai-pop-59-3" type="button">
                <div class="x-risu-risu-comfy-video-image-wrap x-risu-risu-inlay-image">
                    <img data-inlay-id="source-id" src="/api/asset/source-id">
                    <div class="x-risu-risu-comfy-video-action-bar">
                        <button type="button" class="x-risu-risu-comfy-video-action-button">Generate video</button>
                        <div class="x-risu-risu-comfy-video-generating-status" hidden>Generating video...</div>
                    </div>
                </div>
            </button>
        `, 59)
        const container = document.createElement('div')
        container.innerHTML = html

        expect(container.querySelector('.x-risu-risu-comfy-video-image-wrap img')).not.toBeNull()
        expect(container.querySelector('.x-risu-risu-comfy-video-action-bar')).not.toBeNull()
        expect(container.querySelector('.x-risu-risu-comfy-video-action-button')).toBeNull()
        expect(container.querySelector('.x-risu-risu-comfy-video-generating-status')).toBeNull()
        expect(container.querySelectorAll('[data-ebook-reader-content-button="true"]')).toHaveLength(1)
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
