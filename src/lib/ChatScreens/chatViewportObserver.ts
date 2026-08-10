type ChatViewportObserverOptions = {
    readonly getChatContextKey: () => string | null
}

type AnchorEdge = 'top' | 'bottom'

type AnchorPathStep = {
    readonly childIndex: number
    readonly tagName: string
    readonly offset: number
}

type ChatViewportAnchor = {
    readonly chatIndex: string
    readonly chatContextKey: string | null
    readonly edge: AnchorEdge
    readonly rootOffset: number
    readonly path: readonly AnchorPathStep[]
}

type MessageGeometry = {
    readonly element: HTMLElement
    readonly rect: DOMRect
}

const RESTORE_TOLERANCE_PX = 0.5
const LATEST_MESSAGE_THRESHOLD_PX = 100
const VIEWPORT_PROBE_RATIO = 0.35

/**
 * Keeps a visible descendant element fixed while reactive chat HTML is replaced.
 * @param chatBody Reverse-column message list whose parent is the scroll container.
 * @param options Supplies the active chat identity so chat switches are never restored.
 * @returns Cleanup callback that releases DOM observers and event listeners.
 */
export function observeChatViewport(chatBody: HTMLElement, options: ChatViewportObserverOptions): () => void {
    const scrollContainer = chatBody.parentElement
    let anchor: ChatViewportAnchor | null = null
    let captureFrame: number | null = null
    let restoreFrame: number | null = null
    let ignoreRestorationScroll = false

    if (!scrollContainer) return () => {}

    const getMessageElements = () => Array.from(chatBody.children).filter(
        (element): element is HTMLElement => element instanceof HTMLElement && element.dataset.chatIndex !== undefined
    )

    const getOffset = (element: HTMLElement, containerRect: DOMRect, edge: AnchorEdge) => {
        const rect = element.getBoundingClientRect()
        return edge === 'top' ? rect.top - containerRect.top : rect.bottom - containerRect.bottom
    }

    const getAnchorPath = (message: HTMLElement, target: HTMLElement, containerRect: DOMRect, edge: AnchorEdge) => {
        const ancestors: HTMLElement[] = []
        let current: HTMLElement | null = target
        while (current && current !== message) {
            ancestors.unshift(current)
            current = current.parentElement
        }
        if (current !== message) return []

        const path: AnchorPathStep[] = []
        let parent = message
        for (const element of ancestors) {
            const childIndex = Array.from(parent.children).indexOf(element)
            if (childIndex < 0) break
            path.push({
                childIndex,
                tagName: element.tagName,
                offset: getOffset(element, containerRect, edge),
            })
            parent = element
        }
        return path
    }

    const getDeepestElementAt = (message: HTMLElement, messageRect: DOMRect, containerRect: DOMRect) => {
        const visibleTop = Math.max(messageRect.top, containerRect.top)
        const visibleBottom = Math.min(messageRect.bottom, containerRect.bottom)
        const probeY = visibleTop + Math.max(1, (visibleBottom - visibleTop) / 2)
        const probeX = messageRect.left + messageRect.width / 2
        return message.ownerDocument.elementsFromPoint(probeX, probeY).find(
            (element): element is HTMLElement => element instanceof HTMLElement && message.contains(element)
        ) ?? message
    }

    const captureAnchor = () => {
        const containerRect = scrollContainer.getBoundingClientRect()
        const geometries = getMessageElements().map((element): MessageGeometry => ({
            element,
            rect: element.getBoundingClientRect(),
        }))
        if (geometries.length === 0) {
            anchor = null
            return
        }

        const latest = geometries.reduce((currentLatest, geometry) =>
            Number(geometry.element.dataset.chatIndex) > Number(currentLatest.element.dataset.chatIndex)
                ? geometry
                : currentLatest
        )
        const isAtLatest = latest.rect.top <= containerRect.bottom + LATEST_MESSAGE_THRESHOLD_PX
        const probeY = containerRect.top + containerRect.height * VIEWPORT_PROBE_RATIO
        const visible = geometries
            .filter(({ rect }) => rect.bottom > containerRect.top && rect.top < containerRect.bottom)
            .sort((left, right) => left.rect.top - right.rect.top)
        const selected = isAtLatest
            ? latest
            : visible.find(({ rect }) => rect.top <= probeY && rect.bottom > probeY) ?? visible[0]

        if (!selected) {
            anchor = null
            return
        }

        const edge: AnchorEdge = isAtLatest ? 'bottom' : 'top'
        const target = getDeepestElementAt(selected.element, selected.rect, containerRect)
        anchor = {
            chatIndex: selected.element.dataset.chatIndex ?? '',
            chatContextKey: options.getChatContextKey(),
            edge,
            rootOffset: getOffset(selected.element, containerRect, edge),
            path: getAnchorPath(selected.element, target, containerRect, edge),
        }
    }

    const restoreAnchor = () => {
        const capturedAnchor = anchor
        if (!capturedAnchor || capturedAnchor.chatContextKey !== options.getChatContextKey()) {
            captureAnchor()
            return
        }

        let target = getMessageElements().find((element) => element.dataset.chatIndex === capturedAnchor.chatIndex)
        if (!target) {
            captureAnchor()
            return
        }

        let expectedOffset = capturedAnchor.rootOffset
        for (const step of capturedAnchor.path) {
            const child = target.children.item(step.childIndex)
            if (!(child instanceof HTMLElement) || child.tagName !== step.tagName) break
            target = child
            expectedOffset = step.offset
        }

        const containerRect = scrollContainer.getBoundingClientRect()
        const offsetDelta = getOffset(target, containerRect, capturedAnchor.edge) - expectedOffset
        if (Math.abs(offsetDelta) <= RESTORE_TOLERANCE_PX) return

        ignoreRestorationScroll = true
        if (captureFrame !== null) cancelAnimationFrame(captureFrame)
        if (restoreFrame !== null) cancelAnimationFrame(restoreFrame)
        scrollContainer.scrollTop += offsetDelta
        restoreFrame = requestAnimationFrame(() => {
            ignoreRestorationScroll = false
            restoreFrame = null
        })
    }

    const scheduleCapture = () => {
        if (ignoreRestorationScroll || captureFrame !== null) return
        captureFrame = requestAnimationFrame(() => {
            captureFrame = null
            captureAnchor()
        })
    }

    const resizeObserver = new ResizeObserver(restoreAnchor)
    const mutationObserver = new MutationObserver((records) => {
        for (const record of records) {
            for (const node of record.removedNodes) {
                if (node instanceof HTMLElement && node.classList.contains('chat-message-container')) resizeObserver.unobserve(node)
            }
            for (const node of record.addedNodes) {
                if (node instanceof HTMLElement && node.classList.contains('chat-message-container')) resizeObserver.observe(node)
            }
        }

        const latestChatIndex = getMessageElements().reduce<string | null>((latest, element) => {
            const chatIndex = element.dataset.chatIndex ?? null
            if (chatIndex === null || (latest !== null && Number(chatIndex) <= Number(latest))) return latest
            return chatIndex
        }, null)
        if (anchor?.edge === 'bottom' && latestChatIndex !== anchor.chatIndex) captureAnchor()
        else restoreAnchor()
    })

    scrollContainer.addEventListener('scroll', scheduleCapture, { passive: true })
    mutationObserver.observe(chatBody, { childList: true, subtree: true })
    for (const element of getMessageElements()) resizeObserver.observe(element)
    captureAnchor()

    return () => {
        scrollContainer.removeEventListener('scroll', scheduleCapture)
        mutationObserver.disconnect()
        resizeObserver.disconnect()
        if (captureFrame !== null) cancelAnimationFrame(captureFrame)
        if (restoreFrame !== null) cancelAnimationFrame(restoreFrame)
    }
}
