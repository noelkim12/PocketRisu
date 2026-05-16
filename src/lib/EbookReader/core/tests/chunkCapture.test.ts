import { beforeEach, describe, expect, it } from 'vitest'
import { getChatElementByChatIndex, getChatMessageContainerByChatIndex, getTopVisibleChatIndex } from '../readerSelectors'
import { captureChunk, extractContentHtml, getChunkIndices, getReaderIndices, hashContent } from '../chunkCapture'

function setRect(element: Element, rect: Partial<DOMRect>) {
    element.getBoundingClientRect = () => ({
        x: 0,
        y: rect.top ?? 0,
        width: rect.width ?? 0,
        height: rect.height ?? 0,
        top: rect.top ?? 0,
        right: rect.right ?? 0,
        bottom: rect.bottom ?? 0,
        left: rect.left ?? 0,
        toJSON: () => ({}),
    } as DOMRect)
}

function row(index: number, html: string, chatId = `chat-${index}`, role = 'char') {
    return `
        <article class="risu-chat" data-chat-index="${index}" data-chat-role="${role}" data-chat-id="${chatId}">
            <div class="header"><img src="/thumb-${index}.png" alt=""><span class="name">Name ${index}</span></div>
            <div class="message-content">${html}</div>
            <div class="toolbar"><button>copy</button></div>
        </article>
    `
}

describe('ebook reader chunk capture', () => {
    beforeEach(() => {
        document.body.innerHTML = ''
    })

    it('builds reader indices with the first-message sentinel', () => {
        expect(getReaderIndices(3)).toEqual([-1, 0, 1, 2])
    })

    it('returns bounded chunk indices around the center', () => {
        expect(getChunkIndices(2, 4, 2)).toEqual([0, 1, 2, 3])
        expect(getChunkIndices(-99, 3, 2)).toEqual([-1, 0, 1])
        expect(getChunkIndices(99, 3, 2)).toEqual([0, 1, 2])
        expect(getChunkIndices(99, 0, 2)).toEqual([-1])
    })

    it('supports -1 as a chunk center', () => {
        expect(getChunkIndices(-1, 3, 2)).toEqual([-1, 0, 1])
    })

    it('scopes chat row lookup to the default chat screen', () => {
        document.body.innerHTML = `
            <div class="risu-chat" data-chat-index="1">outside</div>
            <section class="default-chat-screen">${row(1, '<p>inside</p>')}</section>
        `

        expect(getChatElementByChatIndex(1)?.textContent).toContain('inside')
        expect(getChatElementByChatIndex(1)?.textContent).not.toContain('outside')
    })

    it('only resolves ebook geometry anchors through chat message containers', () => {
        document.body.innerHTML = `
            <section class="default-chat-screen">
                <div class="chat-message-container">${row(1, '<p>inside</p>')}</div>
                ${row(2, '<p>missing wrapper</p>')}
            </section>
        `

        expect(getChatMessageContainerByChatIndex(1)?.classList.contains('chat-message-container')).toBe(true)
        expect(getChatMessageContainerByChatIndex(2)).toBeNull()
    })

    it('uses threshold logic to find the top visible chat index', () => {
        document.body.innerHTML = `<section class="default-chat-screen">${row(-1, '<p>first</p>')}${row(0, '<p>zero</p>')}${row(1, '<p>one</p>')}</section>`
        const screen = document.querySelector('.default-chat-screen') as HTMLElement
        const rows = Array.from(screen.querySelectorAll('.risu-chat'))
        setRect(screen, { top: 100, bottom: 500 })
        setRect(rows[0], { top: 40, bottom: 120 })
        setRect(rows[1], { top: 120, bottom: 160 })
        setRect(rows[2], { top: 160, bottom: 220 })

        expect(getTopVisibleChatIndex()).toBe(0)
    })

    it('captures rendered content without toolbar controls', async () => {
        document.body.innerHTML = `<section class="default-chat-screen">${row(-1, '<p>Hello</p>', 'first')}${row(0, '<p>World</p>', 'zero')}</section>`

        expect(extractContentHtml(getChatElementByChatIndex(-1)!)).toBe('<p>Hello</p>')
        expect(hashContent('<p>Hello</p>')).toBe(hashContent('<p>Hello</p>'))

        const result = await captureChunk(-1, 1, { radius: 1, timeoutMs: 0 })
        expect(result.requestedIndices).toEqual([-1, 0])
        expect(result.capturedMessages.map(message => message.chatIndex)).toEqual([-1, 0])
        expect(result.capturedMessages[0].chatId).toBe('first')
        expect(result.capturedMessages[0].headerInfo.role).toBe('char')
        expect(result.missingIndices).toEqual([])
        expect(result.partial).toBe(false)
        expect(result.startIndex).toBe(-1)
        expect(result.endIndex).toBe(0)
    })

    it('captures speaker role from chat DOM attributes', async () => {
        document.body.innerHTML = `<section class="default-chat-screen">${row(0, '<p>User turn</p>', 'user-chat', 'user')}${row(1, '<p>Character turn</p>', 'char-chat', 'char')}</section>`

        const result = await captureChunk(0, 2, { radius: 1, timeoutMs: 0 })

        expect(result.capturedMessages.map(message => message.headerInfo.role)).toEqual(['user', 'char'])
    })

    it('marks chunks partial when requested rows are missing', async () => {
        document.body.innerHTML = `<section class="default-chat-screen">${row(-1, '<p>Only first</p>')}</section>`

        const result = await captureChunk(0, 2, { radius: 1, timeoutMs: 0 })
        expect(result.requestedIndices).toEqual([-1, 0, 1])
        expect(result.capturedMessages.map(message => message.chatIndex)).toEqual([-1])
        expect(result.missingIndices).toEqual([0, 1])
        expect(result.partial).toBe(true)
        expect(result.startIndex).toBe(-1)
        expect(result.endIndex).toBe(1)
    })
})
