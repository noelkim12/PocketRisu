import type { ChatIndex } from './readerTypes'

const TOP_VISIBLE_THRESHOLD = 30

function quoteAttributeValue(value: ChatIndex) {
    return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

export function getDefaultChatScreen(root: ParentNode = document): HTMLElement | null {
    return root.querySelector<HTMLElement>('.default-chat-screen')
}

export function getChatElementByChatIndex(chatIndex: ChatIndex, root?: ParentNode | null): HTMLElement | null {
    const scope = root ?? getDefaultChatScreen()
    if (!scope) return null
    return scope.querySelector<HTMLElement>(`.risu-chat[data-chat-index="${quoteAttributeValue(chatIndex)}"]`)
}

export function getChatMessageContainerByChatIndex(chatIndex: ChatIndex, root?: ParentNode | null): HTMLElement | null {
    return getChatElementByChatIndex(chatIndex, root)?.closest<HTMLElement>('.chat-message-container') ?? null
}

export function getTopVisibleChatIndex(root?: ParentNode | null): ChatIndex | null {
    const container = root instanceof HTMLElement && root.classList.contains('default-chat-screen')
        ? root
        : getDefaultChatScreen(root ?? document)
    if (!container) return null

    const messages = Array.from(container.querySelectorAll<HTMLElement>('[data-chat-index]'))
        .map((el) => ({ el, idx: Number.parseInt(el.getAttribute('data-chat-index') ?? '', 10) }))
        .filter((item): item is { el: HTMLElement; idx: ChatIndex } => Number.isFinite(item.idx))
        .sort((a, b) => a.idx - b.idx)

    const containerRect = container.getBoundingClientRect()

    for (const msg of messages) {
        const rect = msg.el.getBoundingClientRect()
        if (rect.bottom > containerRect.top + TOP_VISIBLE_THRESHOLD) return msg.idx
    }

    return messages[0]?.idx ?? null
}
