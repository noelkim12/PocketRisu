import { beforeEach, describe, expect, it, vi } from 'vitest'
import { proxyReaderAction } from '../domActionProxy'
import { ebookReaderStore, ScrollToMessageStore } from '../../../../ts/stores.svelte'

const notifyInfoMock = vi.hoisted(() => vi.fn())

vi.mock('../../../../ts/stores.svelte', () => ({
    ebookReaderStore: {
        open: false,
        currentChatIndex: -1,
        currentPageIndex: 0,
        status: 'idle',
    },
    ScrollToMessageStore: { value: -1 },
}))

vi.mock('../../../../ts/alert', () => ({
    notifyInfo: notifyInfoMock,
}))

vi.mock('src/lang', () => ({
    language: {
        ebookReaderEditJumpNotice: 'Jumped to edit',
    },
}))

function row(index: number, toolbarHtml: string) {
    return `<article class="risu-chat" data-chat-index="${index}">${toolbarHtml}</article>`
}

describe('ebook reader DOM action proxy', () => {
    beforeEach(() => {
        document.body.innerHTML = ''
        ebookReaderStore.open = true
        ebookReaderStore.currentChatIndex = 0
        ScrollToMessageStore.value = -1
        notifyInfoMock.mockClear()
    })

    it('dispatches copy through the first scoped copy button click event', () => {
        document.body.innerHTML = `<section class="default-chat-screen">${row(2, '<button class="button-icon-copy">copy</button><button class="button-icon-copy">copy 2</button>')}</section>`
        const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.button-icon-copy'))
        const first = vi.fn()
        const second = vi.fn()
        buttons[0].addEventListener('click', first)
        buttons[1].addEventListener('click', second)

        expect(proxyReaderAction('copy', 2)).toBe(true)

        expect(first).toHaveBeenCalledTimes(1)
        expect(second).not.toHaveBeenCalled()
    })

    it('dispatches reroll through the last matching scoped reroll button', () => {
        document.body.innerHTML = `<section class="default-chat-screen">${row(3, '<button class="button-icon-reroll">first</button><button class="button-icon-reroll">last</button>')}</section>`
        const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.button-icon-reroll'))
        const first = vi.fn()
        const last = vi.fn()
        buttons[0].addEventListener('click', first)
        buttons[1].addEventListener('click', last)

        expect(proxyReaderAction('reroll', 3)).toBe(true)

        expect(first).not.toHaveBeenCalled()
        expect(last).toHaveBeenCalledTimes(1)
    })

    it('scopes DOM action dispatch to the requested chat row', () => {
        document.body.innerHTML = `<section class="default-chat-screen">${row(1, '<button class="button-icon-copy">wrong</button>')}${row(2, '<button class="button-icon-copy">right</button>')}</section>`
        const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.button-icon-copy'))
        const wrong = vi.fn()
        const right = vi.fn()
        buttons[0].addEventListener('click', wrong)
        buttons[1].addEventListener('click', right)

        expect(proxyReaderAction('copy', 2)).toBe(true)

        expect(wrong).not.toHaveBeenCalled()
        expect(right).toHaveBeenCalledTimes(1)
    })

    it('closes reader and scrolls only nonnegative jump targets', () => {
        expect(proxyReaderAction('jumpToOriginal', 4)).toBe(true)
        expect(ebookReaderStore.open).toBe(false)
        expect(ScrollToMessageStore.value).toBe(4)

        ebookReaderStore.open = true
        ScrollToMessageStore.value = 12
        expect(proxyReaderAction('jumpToOriginal', -1)).toBe(true)
        expect(ebookReaderStore.open).toBe(false)
        expect(ScrollToMessageStore.value).toBe(12)
    })

    it('closes reader, scrolls, and notifies before editing in the original chat', () => {
        expect(proxyReaderAction('editInOriginal', 5)).toBe(true)

        expect(ebookReaderStore.open).toBe(false)
        expect(ScrollToMessageStore.value).toBe(5)
        expect(notifyInfoMock).toHaveBeenCalledWith('Jumped to edit')
    })
})
