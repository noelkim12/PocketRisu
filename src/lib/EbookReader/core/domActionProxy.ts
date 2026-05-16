import { ebookReaderStore, ScrollToMessageStore } from '../../../ts/stores.svelte'
import { notifyInfo } from '../../../ts/alert'
import { language } from 'src/lang'
import { getChatElementByChatIndex } from './readerSelectors'
import type { ChatIndex, ReaderAction, ReaderContentButtonDescriptor } from './readerTypes'

type DomProxiedReaderAction = Extract<ReaderAction, 'copy' | 'tts' | 'bookmark' | 'translate' | 'reroll' | 'unreroll' | 'remove'>

const EDIT_BUTTON_SELECTOR = '.button-icon-edit'
const EDIT_AREA_SELECTOR = '.message-edit-area'
const EDIT_TRIGGER_MAX_ATTEMPTS = 50
const EDIT_TRIGGER_RETRY_MS = 100

export const ACTION_SELECTOR_MAP: Readonly<Record<DomProxiedReaderAction, string>> = {
    copy: '.button-icon-copy',
    tts: '.button-icon-tts',
    bookmark: '.button-icon-bookmark',
    translate: '.button-icon-translate',
    reroll: '.button-icon-reroll',
    unreroll: '.button-icon-unreroll',
    remove: '.button-icon-remove',
}

function dispatchClick(target: Element) {
    return target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
}

function findActionTarget(row: HTMLElement, action: DomProxiedReaderAction): Element | null {
    const matches = Array.from(row.querySelectorAll(ACTION_SELECTOR_MAP[action]))
    if (action === 'reroll') return matches.at(-1) ?? null
    return matches[0] ?? null
}

function triggerOriginalEdit(chatIndex: ChatIndex, root?: ParentNode | null): boolean {
    const row = getChatElementByChatIndex(chatIndex, root)
    const target = row?.querySelector(EDIT_BUTTON_SELECTOR)
    if (!row || !target) return false

    dispatchClick(target)
    row.querySelector<HTMLElement>(EDIT_AREA_SELECTOR)?.focus()
    return true
}

function scheduleOriginalEditTrigger(chatIndex: ChatIndex, root?: ParentNode | null) {
    let attempts = 0

    const tryTrigger = () => {
        attempts += 1
        if (triggerOriginalEdit(chatIndex, root) || attempts >= EDIT_TRIGGER_MAX_ATTEMPTS) return
        setTimeout(tryTrigger, EDIT_TRIGGER_RETRY_MS)
    }

    setTimeout(tryTrigger, 0)
}

export function proxyReaderAction(action: ReaderAction, chatIndex: ChatIndex, root?: ParentNode | null): boolean {
    if (action === 'jumpToOriginal') {
        ebookReaderStore.open = false
        if (chatIndex >= 0) ScrollToMessageStore.value = chatIndex
        return true
    }

    if (action === 'editInOriginal') {
        ebookReaderStore.open = false
        if (chatIndex >= 0) {
            ScrollToMessageStore.value = chatIndex
            scheduleOriginalEditTrigger(chatIndex, root)
        }
        notifyInfo(language.ebookReaderEditJumpNotice)
        return true
    }

    const row = getChatElementByChatIndex(chatIndex, root)
    if (!row) return false

    const target = findActionTarget(row, action)
    if (!target) return false
    dispatchClick(target)
    return true
}

export function dispatchContentButtonAction(descriptor: ReaderContentButtonDescriptor, root?: ParentNode | null): boolean {
    const row = getChatElementByChatIndex(descriptor.chatIndex, root)
    if (!row) return false

    const chatText = row.querySelector<HTMLElement>('.chattext')
    if (!chatText) return false

    const candidates = Array.from(chatText.querySelectorAll(descriptor.selector))
    const target = candidates[descriptor.ordinal]
    if (!target) return false

    dispatchClick(target)
    return true
}
