import { getDefaultChatScreen } from './readerSelectors'

export type EbookReaderObserverOptions = {
    root?: ParentNode | null
    debounceMs?: number
    notifyThrottleMs?: number
    onRefresh: () => void
    onNotify?: () => void
}

const DEFAULT_DEBOUNCE_MS = 250
const DEFAULT_NOTIFY_THROTTLE_MS = 2000
const OBSERVER_OPTIONS: MutationObserverInit = {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
}

export function observeEbookReaderChanges(options: EbookReaderObserverOptions): () => void {
    const target = getDefaultChatScreen(options.root ?? document)
    if (!target) return () => undefined

    const debounceMs = Math.max(0, options.debounceMs ?? DEFAULT_DEBOUNCE_MS)
    const notifyThrottleMs = Math.max(0, options.notifyThrottleMs ?? DEFAULT_NOTIFY_THROTTLE_MS)
    let refreshTimer: ReturnType<typeof setTimeout> | null = null
    let lastNotifyAt = 0

    const clearRefreshTimer = () => {
        if (refreshTimer) {
            clearTimeout(refreshTimer)
            refreshTimer = null
        }
    }

    const observer = new MutationObserver(() => {
        clearRefreshTimer()
        refreshTimer = setTimeout(() => {
            refreshTimer = null
            options.onRefresh()
            if (!options.onNotify) return
            const now = Date.now()
            if (now - lastNotifyAt >= notifyThrottleMs) {
                lastNotifyAt = now
                options.onNotify()
            }
        }, debounceMs)
    })

    observer.observe(target, OBSERVER_OPTIONS)

    return () => {
        observer.disconnect()
        clearRefreshTimer()
    }
}

export { OBSERVER_OPTIONS as EBOOK_READER_OBSERVER_OPTIONS }
