<script lang="ts">
    import { onDestroy, onMount, tick } from 'svelte'
    import DesktopBookViewer from './desktop/DesktopBookViewer.svelte'
    import MobileBookViewer from './mobile/MobileBookViewer.svelte'
    import { captureChunk } from './core/chunkCapture'
    import { clampPageIndex, getNextChunkCenter, getPrevChunkCenter, getSpreadPageIndex } from './core/navigation'
    import { observeEbookReaderChanges, observeEbookReaderGeometry } from './core/observer'
    import { DEFAULT_PAGINATION_DIMENSIONS, paginateCapturedMessages } from './core/pageManager'
    import { dispatchContentButtonAction, proxyReaderAction } from './core/domActionProxy'
    import { CONTENT_BUTTON_SELECTOR } from './core/chunkCapture'
    import { getOverlayPresentation } from './core/overlayPresentation'
    import { getReaderPanelRect, getVisibleRect, type EbookReaderPanelRect, type EbookReaderViewportRect } from './core/overlayGeometry'
    import { normalizeEbookReaderPrefs, prefsToCssVars } from './core/preferences'
    import { getChatMessageContainerByChatIndex, getDefaultChatScreen } from './core/readerSelectors'
    import type { CaptureChunkResult, ReaderAction, ReaderHeaderInfo, ReaderPage } from './core/readerTypes'
    import { DBState, DynamicGUI, ebookReaderStore, selectedCharID } from 'src/ts/stores.svelte'
    import { readerLabel } from './readerLanguage'

    let pages: ReaderPage[] = $state([])
    let currentChunk: CaptureChunkResult | null = $state(null)
    let headerInfo: ReaderHeaderInfo | null = $state(null)
    let showUpdated = $state(false)
    let updateNoticeTimer: ReturnType<typeof setTimeout> | null = null
    let anchorMeasureFrame: ReturnType<typeof requestAnimationFrame> | null = null
    let cleanupObserver: (() => void) | null = null
    let cleanupGeometryObserver: (() => void) | null = null
    let loadGeneration = 0
    let observedMode: 'mobile' | 'desktop' | null = null
    let errorText = $state(readerLabel('ebookReaderCaptureFailed'))
    let lastReaderPreferenceSignature: string | null = null
    let lastPaginationWidth: number | null = null
    let pendingPreferenceRefresh = false
    let pendingGeometryRefresh = false
    let anchorRect: EbookReaderPanelRect | null = $state(null)
    let geometryChatIndex = ebookReaderStore.currentChatIndex
    let geometryAnchorElement: HTMLElement | null = null

    let messageCount = $derived.by(() => {
        const character = DBState.db.characters?.[$selectedCharID]
        const activeChat = character?.chats?.[character.chatPage]
        return activeChat?.message?.length ?? 0
    })
    let isMobile = $derived($DynamicGUI)
    let pageMode: 'mobile' | 'desktop' = $derived(isMobile ? 'mobile' : 'desktop')
    let overlayPresentation = $derived(getOverlayPresentation(pageMode))
    let readerPrefs = $derived(normalizeEbookReaderPrefs(DBState.db.ebookReaderPrefs))
    let readerStyle = $derived(prefsToCssVars(readerPrefs))
    let readerStyleText = $derived(Object.entries(readerStyle).map(([name, value]) => `${name}: ${value}`).join('; '))
    let readerPreferenceSignature = $derived(JSON.stringify(readerPrefs))
    let normalizedPageIndex = $derived(isMobile
        ? clampPageIndex(ebookReaderStore.currentPageIndex, pages.length)
        : getSpreadPageIndex(ebookReaderStore.currentPageIndex, pages.length))
    let anchoredPanelStyle = $derived(anchorRect
        ? `top: ${anchorRect.top}px; left: ${anchorRect.left}px; width: ${anchorRect.width}px; height: ${anchorRect.height}px;`
        : 'display: none;')
    let errorMessage = $derived(ebookReaderStore.status === 'error' ? errorText : '')

    function close() {
        ebookReaderStore.open = false
    }

    function closeForMissingChatContainer() {
        anchorRect = null
        close()
    }

    function removeMeasureContainers() {
        for (const container of Array.from(document.querySelectorAll('[data-ebook-reader-measure]'))) container.remove()
    }

    function rectToViewportRect(rect: DOMRect): EbookReaderViewportRect {
        return { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom }
    }

    function getVisualViewportRect(): EbookReaderViewportRect {
        const viewport = window.visualViewport
        if (!viewport) return { top: 0, left: 0, right: window.innerWidth, bottom: window.innerHeight }

        return {
            top: viewport.offsetTop,
            left: viewport.offsetLeft,
            right: viewport.offsetLeft + viewport.width,
            bottom: viewport.offsetTop + viewport.height,
        }
    }

    function getElementVisibleRect(element: HTMLElement, visibleHost: HTMLElement) {
        return getVisibleRect(rectToViewportRect(element.getBoundingClientRect()), rectToViewportRect(visibleHost.getBoundingClientRect()))
    }

    function getPanelRect(anchor: HTMLElement, visibleHost: HTMLElement) {
        const excludedRects = Array.from(visibleHost.querySelectorAll<HTMLElement>('[data-chat-composer-region]'))
            .map((element) => rectToViewportRect(element.getBoundingClientRect()))

        return getReaderPanelRect(
            rectToViewportRect(anchor.getBoundingClientRect()),
            rectToViewportRect(visibleHost.getBoundingClientRect()),
            getVisualViewportRect(),
            excludedRects,
        )
    }

    function findVisibleMessageContainer(visibleHost: HTMLElement | null) {
        const host = visibleHost ?? getDefaultChatScreen()
        if (!host) return null

        const visibleContainers = Array.from(host.querySelectorAll<HTMLElement>('.chat-message-container'))
            .map((element) => ({ element, rect: getElementVisibleRect(element, host) }))
            .filter((item): item is { element: HTMLElement; rect: EbookReaderPanelRect } => item.rect !== null)
            .sort((a, b) => a.rect.top - b.rect.top)

        return visibleContainers[0]?.element ?? null
    }

    function resolveGeometryAnchor(visibleHost: HTMLElement | null) {
        if (geometryAnchorElement?.isConnected) return geometryAnchorElement

        geometryAnchorElement = getChatMessageContainerByChatIndex(geometryChatIndex, visibleHost) ?? findVisibleMessageContainer(visibleHost)
        return geometryAnchorElement
    }

    function measureAnchorRect() {
        const visibleHost = getDefaultChatScreen()
        if (!visibleHost) {
            closeForMissingChatContainer()
            return
        }

        const anchor = resolveGeometryAnchor(visibleHost)
        if (!anchor) {
            closeForMissingChatContainer()
            return
        }

        anchorRect = getPanelRect(anchor, visibleHost)
        if (!anchorRect && anchor === geometryAnchorElement) {
            const visibleAnchor = findVisibleMessageContainer(visibleHost)
            if (visibleAnchor && visibleAnchor !== anchor) {
                geometryAnchorElement = visibleAnchor
                anchorRect = getPanelRect(visibleAnchor, visibleHost)
            }
        }
        if (!anchorRect) closeForMissingChatContainer()
    }

    function scheduleAnchorMeasure() {
        if (anchorMeasureFrame !== null) return
        anchorMeasureFrame = requestAnimationFrame(() => {
            anchorMeasureFrame = null
            measureAnchorRect()
        })
    }

    function getPaginationWidth() {
        if (!anchorRect) measureAnchorRect()
        const fallbackWidth = DEFAULT_PAGINATION_DIMENSIONS.width
        const panelWidth = anchorRect?.width ?? window.visualViewport?.width ?? window.innerWidth ?? fallbackWidth
        const readableWidth = isMobile ? panelWidth : Math.max((panelWidth - 12) / 2, 1)
        return Math.max(Math.round((readableWidth * readerPrefs.pageWidth) / 100), 1)
    }

    function refreshForGeometryChange(nextPaginationWidth: number) {
        if (lastPaginationWidth === null || nextPaginationWidth === lastPaginationWidth) {
            pendingGeometryRefresh = false
            return
        }

        if (!currentChunk || ebookReaderStore.status !== 'ready') {
            pendingGeometryRefresh = true
            return
        }

        pendingGeometryRefresh = false
        void refreshCurrentChunk()
    }

    function setVisibleChatIndex(pageIndex: number) {
        const page = pages[clampPageIndex(pageIndex, pages.length)]
        if (!page) return
        ebookReaderStore.currentChatIndex = page.chatIndex
        headerInfo = page.headerInfo
    }

    type ChunkTargetPage = 'first' | 'last' | 'centerFirst' | number

    function resolveTargetPageIndex(targetPage: ChunkTargetPage, pagesToSearch: ReaderPage[], center: number) {
        if (targetPage === 'last') return pagesToSearch.length - 1
        if (targetPage === 'first') return 0
        if (targetPage === 'centerFirst') {
            const centerPageIndex = pagesToSearch.findIndex((page) => page.chatIndex === center)
            return centerPageIndex >= 0 ? centerPageIndex : 0
        }

        return targetPage
    }

    async function loadChunk(center: number, targetPage: ChunkTargetPage = 0) {
        const generation = loadGeneration + 1
        loadGeneration = generation
        ebookReaderStore.status = 'capturing'

        try {
            const captured = await captureChunk(center, messageCount)
            if (generation !== loadGeneration) return
            if (captured.capturedMessages.length === 0) {
                pages = []
                currentChunk = captured
                headerInfo = null
                errorText = readerLabel('ebookReaderCaptureFailed')
                ebookReaderStore.status = 'error'
                return
            }

            ebookReaderStore.status = 'paginating'
            await tick()
            const paginationWidth = getPaginationWidth()
            const nextPages = paginateCapturedMessages(captured.capturedMessages, {
                dimensions: { width: paginationWidth, height: DEFAULT_PAGINATION_DIMENSIONS.height },
                measurementStyle: {
                    fontSize: `${readerPrefs.fontSize}px`,
                    lineHeight: `${readerPrefs.lineHeight}`,
                    paragraphSpacing: `${readerPrefs.paragraphSpacing * readerPrefs.fontSize}px`,
                    fontFamily: readerPrefs.fontFamily,
                },
                mode: isMobile ? 'mobile' : 'desktop',
            })
            if (generation !== loadGeneration) return

            pages = nextPages
            currentChunk = captured
            lastPaginationWidth = paginationWidth
            headerInfo = nextPages[0]?.headerInfo ?? captured.capturedMessages[0]?.headerInfo ?? null
            const rawTarget = resolveTargetPageIndex(targetPage, nextPages, center)
            ebookReaderStore.currentPageIndex = isMobile
                ? clampPageIndex(rawTarget, nextPages.length)
                : getSpreadPageIndex(rawTarget, nextPages.length)
            setVisibleChatIndex(ebookReaderStore.currentPageIndex)
            if (nextPages.length === 0) errorText = readerLabel('ebookReaderPaginationFailed')
            ebookReaderStore.status = nextPages.length > 0 ? 'ready' : 'error'
        } catch {
            if (generation !== loadGeneration) return
            pages = []
            currentChunk = null
            headerInfo = null
            errorText = readerLabel('ebookReaderPaginationFailed')
            ebookReaderStore.status = 'error'
        } finally {
            removeMeasureContainers()
        }
    }

    async function refreshCurrentChunk() {
        const center = currentChunk
            ? Math.min(Math.max(ebookReaderStore.currentChatIndex, currentChunk.startIndex), currentChunk.endIndex)
            : ebookReaderStore.currentChatIndex
        await loadChunk(center, ebookReaderStore.currentPageIndex)
    }

    function notifyUpdated() {
        showUpdated = true
        if (updateNoticeTimer) clearTimeout(updateNoticeTimer)
        updateNoticeTimer = setTimeout(() => {
            showUpdated = false
            updateNoticeTimer = null
        }, 1800)
    }

    function nextPage() {
        const step = isMobile ? 1 : 2
        const nextIndex = normalizedPageIndex + step
        if (nextIndex < pages.length) {
            ebookReaderStore.currentPageIndex = isMobile ? nextIndex : getSpreadPageIndex(nextIndex, pages.length)
            setVisibleChatIndex(ebookReaderStore.currentPageIndex)
            return
        }
        if (!currentChunk) return
        const nextCenter = getNextChunkCenter(currentChunk, messageCount)
        if (nextCenter <= currentChunk.endIndex) return
        void loadChunk(nextCenter, 'first')
    }

    function previousPage() {
        const step = isMobile ? 1 : 2
        const previousIndex = normalizedPageIndex - step
        if (previousIndex >= 0) {
            ebookReaderStore.currentPageIndex = isMobile ? previousIndex : getSpreadPageIndex(previousIndex, pages.length)
            setVisibleChatIndex(ebookReaderStore.currentPageIndex)
            return
        }
        if (!currentChunk) return
        const previousCenter = getPrevChunkCenter(currentChunk, messageCount)
        if (previousCenter >= currentChunk.startIndex) return
        void loadChunk(previousCenter, 'last')
    }

    function focusedInEditable(target: EventTarget | null) {
        if (!(target instanceof Element)) return false
        return target.closest('input, textarea, [contenteditable="true"], [contenteditable=""]') !== null
    }

    function hasTextSelection() {
        return (window.getSelection()?.toString().trim() ?? '') !== ''
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            close()
            return
        }
        if (focusedInEditable(event.target) || hasTextSelection()) return
        if (event.key === 'ArrowRight' || event.key === 'PageDown') {
            event.preventDefault()
            nextPage()
        } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
            event.preventDefault()
            previousPage()
        }
    }

    function handleAction(action: ReaderAction) {
        proxyReaderAction(action, ebookReaderStore.currentChatIndex)
    }

    function parseContentButtonNumber(value: string | null) {
        const parsed = Number.parseInt(value ?? '', 10)
        return Number.isFinite(parsed) ? parsed : null
    }

    type ReaderPopoverElement = HTMLElement & {
        showPopover?: () => void
        hidePopover?: () => void
    }

    function isReaderPopoverElement(element: HTMLElement | null): element is ReaderPopoverElement {
        return element?.getAttribute('data-ebook-reader-popover') === 'true'
    }

    function closeReaderPopovers(except?: HTMLElement) {
        for (const popover of Array.from(document.querySelectorAll<ReaderPopoverElement>('[data-ebook-reader-popover="true"]'))) {
            if (popover === except || !popover.matches(':popover-open')) continue
            popover.hidePopover?.()
        }
    }

    function clampPosition(value: number, min: number, max: number) {
        return Math.min(Math.max(value, min), Math.max(min, max))
    }

    function positionReaderPopover(popover: HTMLElement, invoker: HTMLElement) {
        const margin = 8
        const invokerRect = invoker.getBoundingClientRect()
        const popoverRect = popover.getBoundingClientRect()
        const left = clampPosition(invokerRect.left, margin, window.innerWidth - popoverRect.width - margin)
        const top = clampPosition(invokerRect.bottom + margin, margin, window.innerHeight - popoverRect.height - margin)

        popover.style.position = 'fixed'
        popover.style.inset = 'auto'
        popover.style.left = `${left}px`
        popover.style.top = `${top}px`
        popover.style.maxWidth = `calc(100vw - ${margin * 2}px)`
        popover.style.maxHeight = `calc(100vh - ${margin * 2}px)`
    }

    function handleReaderPopoverInvoker(target: HTMLElement, event: MouseEvent) {
        if (!target.hasAttribute('popovertarget')) return false
        if (target.hasAttribute('risu-btn') || target.hasAttribute('risu-trigger')) return false

        const popoverId = target.getAttribute('popovertarget')
        const popover = popoverId ? document.getElementById(popoverId) : null
        if (!isReaderPopoverElement(popover)) return false

        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()

        if (popover.matches(':popover-open')) {
            popover.hidePopover?.()
            return true
        }

        closeReaderPopovers(popover)
        positionReaderPopover(popover, target)
        popover.showPopover?.()
        requestAnimationFrame(() => positionReaderPopover(popover, target))
        return true
    }

    function handleContentButtonClick(event: MouseEvent) {
        const target = event.target instanceof Element
            ? event.target.closest<HTMLElement>('[data-ebook-reader-content-button="true"]')
            : null
        if (!target) return false
        if (!target.matches(CONTENT_BUTTON_SELECTOR)) return false

        if (handleReaderPopoverInvoker(target, event)) return true

        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()

        closeReaderPopovers()

        const chatIndex = parseContentButtonNumber(target.getAttribute('data-ebook-reader-chat-index'))
        const ordinal = parseContentButtonNumber(target.getAttribute('data-ebook-reader-button-ordinal'))
        if (chatIndex === null || ordinal === null || ordinal < 0) return true

        dispatchContentButtonAction({ chatIndex, ordinal, selector: CONTENT_BUTTON_SELECTOR })
        return true
    }

    $effect(() => {
        if (ebookReaderStore.currentPageIndex !== normalizedPageIndex) ebookReaderStore.currentPageIndex = normalizedPageIndex
        setVisibleChatIndex(normalizedPageIndex)
        scheduleAnchorMeasure()
    })

    $effect(() => {
        if (observedMode === null) {
            observedMode = pageMode
            return
        }
        if (currentChunk && observedMode !== pageMode) {
            observedMode = pageMode
            void loadChunk(ebookReaderStore.currentChatIndex, normalizedPageIndex)
        }
    })

    $effect(() => {
        const signature = readerPreferenceSignature
        if (lastReaderPreferenceSignature === null) {
            lastReaderPreferenceSignature = signature
            return
        }
        if (signature === lastReaderPreferenceSignature) return

        lastReaderPreferenceSignature = signature
        if (!currentChunk || ebookReaderStore.status !== 'ready') {
            pendingPreferenceRefresh = true
            return
        }

        pendingPreferenceRefresh = false
        void refreshCurrentChunk()
    })

    $effect(() => {
        if (!pendingPreferenceRefresh || !currentChunk || ebookReaderStore.status !== 'ready') return
        pendingPreferenceRefresh = false
        void refreshCurrentChunk()
    })

    $effect(() => {
        const measuredAnchorRect = anchorRect
        if (!measuredAnchorRect) return
        refreshForGeometryChange(getPaginationWidth())
    })

    $effect(() => {
        if (!pendingGeometryRefresh || !currentChunk || ebookReaderStore.status !== 'ready') return
        pendingGeometryRefresh = false
        refreshForGeometryChange(getPaginationWidth())
    })

    onMount(() => {
        window.addEventListener('keydown', handleKeydown)
        window.addEventListener('resize', scheduleAnchorMeasure)
        window.addEventListener('scroll', scheduleAnchorMeasure, true)
        window.visualViewport?.addEventListener('resize', scheduleAnchorMeasure)
        window.visualViewport?.addEventListener('scroll', scheduleAnchorMeasure)
        cleanupObserver = observeEbookReaderChanges({ onRefresh: () => void refreshCurrentChunk(), onNotify: notifyUpdated })
        cleanupGeometryObserver = observeEbookReaderGeometry({ onMeasure: scheduleAnchorMeasure })
        scheduleAnchorMeasure()
        void loadChunk(ebookReaderStore.currentChatIndex, 'centerFirst')
    })

    onDestroy(() => {
        window.removeEventListener('keydown', handleKeydown)
        window.removeEventListener('resize', scheduleAnchorMeasure)
        window.removeEventListener('scroll', scheduleAnchorMeasure, true)
        window.visualViewport?.removeEventListener('resize', scheduleAnchorMeasure)
        window.visualViewport?.removeEventListener('scroll', scheduleAnchorMeasure)
        if (anchorMeasureFrame !== null) cancelAnimationFrame(anchorMeasureFrame)
        anchorMeasureFrame = null
        cleanupGeometryObserver?.()
        cleanupGeometryObserver = null
        cleanupObserver?.()
        cleanupObserver = null
        if (updateNoticeTimer) clearTimeout(updateNoticeTimer)
        updateNoticeTimer = null
        removeMeasureContainers()
    })
</script>

<div
    class={overlayPresentation.shellClass}
    class:ebook-reader-blur-images={readerPrefs.blurImages}
    style={readerStyleText}
    data-ebook-reader-appearance={readerPrefs.appearance}
    role="presentation"
    onclick={(event) => {
        if (handleContentButtonClick(event)) return
        if (overlayPresentation.closeOnShellClick && event.target === event.currentTarget) close()
    }}
>
    <div class={overlayPresentation.panelClass} style={anchoredPanelStyle}>
        {#if isMobile}
            <MobileBookViewer pages={pages} currentPageIndex={normalizedPageIndex} status={ebookReaderStore.status} header={headerInfo} {showUpdated} {errorMessage} onAction={handleAction} onPrevious={previousPage} onNext={nextPage} onClose={close} role={overlayPresentation.viewerRole} ariaModal={overlayPresentation.ariaModal} />
        {:else}
            <DesktopBookViewer pages={pages} currentPageIndex={normalizedPageIndex} status={ebookReaderStore.status} header={headerInfo} {showUpdated} {errorMessage} onAction={handleAction} onPrevious={previousPage} onNext={nextPage} onClose={close} role={overlayPresentation.viewerRole} ariaModal={overlayPresentation.ariaModal} />
        {/if}
    </div>
</div>

<style>
    .ebook-reader-overlay {
        --ebook-reader-surface-bg: var(--risu-theme-bgcolor);
        --ebook-reader-panel-bg: var(--risu-theme-darkbg);
        --ebook-reader-border: var(--risu-theme-darkborderc);
        --ebook-reader-text: var(--risu-theme-textcolor);
        --ebook-reader-muted: var(--risu-theme-textcolor2);
        --ebook-reader-accent-surface: var(--risu-theme-selected);
        --FontColorStandard: var(--ebook-reader-text);
        --FontColorBold: var(--ebook-reader-text);
        --FontColorItalic: var(--ebook-reader-muted);
        --FontColorItalicBold: var(--ebook-reader-muted);
        --FontColorQuote1: var(--ebook-reader-muted);
        --FontColorQuote2: var(--ebook-reader-muted);
    }

    .ebook-reader-overlay[data-ebook-reader-appearance="light"] {
        --ebook-reader-surface-bg: var(--risu-theme-neutral-100);
        --ebook-reader-panel-bg: var(--risu-theme-neutral-50);
        --ebook-reader-border: var(--risu-theme-neutral-300);
        --ebook-reader-text: var(--risu-theme-neutral-900);
        --ebook-reader-muted: var(--risu-theme-neutral-600);
        --ebook-reader-accent-surface: var(--risu-theme-neutral-200);
    }

    .ebook-reader-overlay[data-ebook-reader-appearance="dark"] {
        --ebook-reader-surface-bg: var(--risu-theme-bgcolor);
        --ebook-reader-panel-bg: var(--risu-theme-darkbg);
        --ebook-reader-border: var(--risu-theme-darkborderc);
        --ebook-reader-text: var(--risu-theme-textcolor);
        --ebook-reader-muted: var(--risu-theme-textcolor2);
        --ebook-reader-accent-surface: var(--risu-theme-selected);
    }

    .ebook-reader-overlay[data-ebook-reader-appearance="sepia"] {
        --ebook-reader-surface-bg: #f3ead7;
        --ebook-reader-panel-bg: #fbf3e3;
        --ebook-reader-border: #d8c19d;
        --ebook-reader-text: #4b3826;
        --ebook-reader-muted: #7a6245;
        --ebook-reader-accent-surface: #ead8b8;
    }

    .ebook-reader-overlay :global([role="dialog"]),
    .ebook-reader-overlay :global(header),
    .ebook-reader-overlay :global(footer),
    .ebook-reader-overlay :global(article) {
        border-color: var(--ebook-reader-border);
        background-color: var(--ebook-reader-panel-bg);
        color: var(--ebook-reader-text);
    }

    .ebook-reader-overlay :global(.bg-bg) {
        background-color: var(--ebook-reader-surface-bg);
    }

    .ebook-reader-overlay :global(.bg-darkbg),
    .ebook-reader-overlay :global(.bg-darkbg\/95) {
        background-color: var(--ebook-reader-panel-bg);
    }

    .ebook-reader-overlay :global(.bg-selected) {
        background-color: var(--ebook-reader-accent-surface);
    }

    .ebook-reader-overlay :global(.border-darkborderc) {
        border-color: var(--ebook-reader-border);
    }

    .ebook-reader-overlay :global(.text-textcolor),
    .ebook-reader-overlay :global(.chattext),
    .ebook-reader-overlay :global(.chattext p) {
        color: var(--ebook-reader-text);
    }

    .ebook-reader-overlay :global(.text-textcolor2) {
        color: var(--ebook-reader-muted);
    }

    .ebook-reader-overlay :global(.chattext) {
        max-width: var(--ebook-reader-page-width);
        margin-inline: auto;
        font-family: var(--ebook-reader-font-family);
        font-size: var(--ebook-reader-font-size);
        line-height: var(--ebook-reader-line-height);
    }

    .ebook-reader-overlay :global(.chattext *) {
        font-family: inherit;
        line-height: inherit;
    }

    .ebook-reader-overlay :global(.chattext p) {
        margin: 0;
    }

    .ebook-reader-overlay :global(.chattext p + p) {
        margin-top: var(--ebook-reader-paragraph-spacing);
    }

    .ebook-reader-overlay :global([data-ebook-reader-content-button="true"]) {
        position: relative;
        z-index: 20;
        pointer-events: auto;
    }

    .ebook-reader-overlay :global(.ebook-reader-page-body-image) {
        box-sizing: border-box;
        display: flex;
        min-height: 0;
        align-items: center;
        justify-content: center;
    }

    .ebook-reader-overlay :global(.ebook-reader-page-body:has(img)) {
        display: flex;
        min-height: 0;
        align-items: center;
        justify-content: center;
    }

    .ebook-reader-overlay :global(.ebook-reader-page-body:has(img) > *) {
        box-sizing: border-box;
        min-width: 0;
        min-height: 0;
        max-width: 100%;
        height: 100%;
        max-height: 100%;
    }

    .ebook-reader-overlay :global(.ebook-reader-page-body-scrollable) {
        overflow: auto !important;
        overscroll-behavior: contain;
        scrollbar-width: thin;
    }

    .ebook-reader-overlay :global(.ebook-reader-page-body-scrollable > *) {
        box-sizing: border-box;
        max-width: 100%;
    }

    .ebook-reader-overlay :global(.ebook-reader-page-body:has(img) figure),
    .ebook-reader-overlay :global(.ebook-reader-page-body:has(img) .x-risu-image-container),
    .ebook-reader-overlay :global(.ebook-reader-page-body:has(img) .x-risu-risu-inlay-image) {
        box-sizing: border-box;
        display: flex;
        min-width: 0;
        min-height: 0;
        align-items: center;
        justify-content: center;
        margin: 0;
    }

    .ebook-reader-overlay :global(.ebook-reader-page-body:has(img) :is(div, figure, button, a, span):has(img)) {
        box-sizing: border-box;
        display: flex;
        min-width: 0;
        min-height: 0;
        width: 100%;
        height: 100%;
        max-width: 100%;
        max-height: 100%;
        align-items: center;
        justify-content: center;
    }

    .ebook-reader-overlay :global(.ebook-reader-page-body:has(img) button:has(img)) {
        padding: 0;
        overflow: hidden;
    }

    .ebook-reader-overlay :global(.ebook-reader-page-body img) {
        display: block;
        flex-shrink: 1;
        max-width: 100% !important;
        max-height: 100% !important;
        width: 100% !important;
        height: 100% !important;
        object-fit: contain !important;
        object-position: center !important;
    }

    .ebook-reader-overlay :global(.ebook-reader-page-body img.root-loaded-image-dynamic),
    .ebook-reader-overlay :global(.ebook-reader-page-body img.root-loaded-image-dynamic:hover) {
        width: 100% !important;
        height: 100% !important;
        max-height: 100% !important;
        object-fit: contain !important;
        object-position: center !important;
        transition: filter var(--risu-animation-speed), opacity var(--risu-animation-speed);
    }

    .ebook-reader-overlay.ebook-reader-blur-images :global(.chattext img) {
        filter: var(--ebook-reader-image-filter);
        transition: filter var(--risu-animation-speed), opacity var(--risu-animation-speed);
    }

    .ebook-reader-overlay.ebook-reader-blur-images :global(.chattext img:hover),
    .ebook-reader-overlay.ebook-reader-blur-images :global(.chattext img:focus),
    .ebook-reader-overlay.ebook-reader-blur-images :global(.chattext:focus-within img) {
        filter: none;
    }
</style>
