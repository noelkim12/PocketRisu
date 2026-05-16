<script lang="ts">
    import { onDestroy, onMount, tick } from 'svelte'
    import DesktopBookViewer from './desktop/DesktopBookViewer.svelte'
    import MobileBookViewer from './mobile/MobileBookViewer.svelte'
    import { captureChunk } from './core/chunkCapture'
    import { clampPageIndex, getNextChunkCenter, getPrevChunkCenter, getSpreadPageIndex } from './core/navigation'
    import { observeEbookReaderChanges } from './core/observer'
    import { DEFAULT_PAGINATION_DIMENSIONS, paginateCapturedMessages } from './core/pageManager'
    import { dispatchContentButtonAction, proxyReaderAction } from './core/domActionProxy'
    import { CONTENT_BUTTON_SELECTOR } from './core/chunkCapture'
    import { getOverlayPresentation } from './core/overlayPresentation'
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
    let loadGeneration = 0
    let observedMode: 'mobile' | 'desktop' | null = null
    let errorText = $state(readerLabel('ebookReaderCaptureFailed'))
    let lastReaderPreferenceSignature: string | null = null
    let pendingPreferenceRefresh = false
    let anchorRect: { top: number; left: number; width: number; height: number } | null = $state(null)
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

    function getVisibleRect(element: HTMLElement, visibleHost: HTMLElement | null) {
        const rect = element.getBoundingClientRect()
        const hostRect = visibleHost?.getBoundingClientRect()
        const visibleTop = Math.max(rect.top, hostRect?.top ?? 0, 0)
        const visibleLeft = Math.max(rect.left, hostRect?.left ?? 0, 0)
        const visibleRight = Math.min(rect.right, hostRect?.right ?? window.innerWidth, window.innerWidth)
        const visibleBottom = Math.min(rect.bottom, hostRect?.bottom ?? window.innerHeight, window.innerHeight)
        const width = Math.max(0, visibleRight - visibleLeft)
        const height = Math.max(0, visibleBottom - visibleTop)

        if (width === 0 || height === 0) return null
        return { top: visibleTop, left: visibleLeft, width, height }
    }

    function findVisibleMessageContainer(visibleHost: HTMLElement | null) {
        const host = visibleHost ?? getDefaultChatScreen()
        if (!host) return null

        const visibleContainers = Array.from(host.querySelectorAll<HTMLElement>('.chat-message-container'))
            .map((element) => ({ element, rect: getVisibleRect(element, host) }))
            .filter((item): item is { element: HTMLElement; rect: { top: number; left: number; width: number; height: number } } => item.rect !== null)
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

        anchorRect = getVisibleRect(anchor, visibleHost)
        if (!anchorRect) closeForMissingChatContainer()
    }

    function scheduleAnchorMeasure() {
        if (anchorMeasureFrame !== null) return
        anchorMeasureFrame = requestAnimationFrame(() => {
            anchorMeasureFrame = null
            measureAnchorRect()
        })
    }

    function setVisibleChatIndex(pageIndex: number) {
        const page = pages[clampPageIndex(pageIndex, pages.length)]
        if (!page) return
        ebookReaderStore.currentChatIndex = page.chatIndex
        headerInfo = currentChunk?.capturedMessages.find((message) => message.chatIndex === page.chatIndex)?.headerInfo ?? headerInfo
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
            const nextPages = paginateCapturedMessages(captured.capturedMessages, {
                dimensions: { width: readerPrefs.pageWidth, height: DEFAULT_PAGINATION_DIMENSIONS.height },
                measurementStyle: {
                    fontSize: `${readerPrefs.fontSize}px`,
                    lineHeight: `${readerPrefs.lineHeight}`,
                    fontFamily: readerPrefs.fontFamily,
                },
                mode: isMobile ? 'mobile' : 'desktop',
            })
            if (generation !== loadGeneration) return

            pages = nextPages
            currentChunk = captured
            headerInfo = captured.capturedMessages[0]?.headerInfo ?? null
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

    function handleContentButtonClick(event: MouseEvent) {
        const target = event.target instanceof Element
            ? event.target.closest<HTMLElement>('[data-ebook-reader-content-button="true"]')
            : null
        if (!target) return false
        if (!target.matches(CONTENT_BUTTON_SELECTOR)) return false

        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()

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

    onMount(() => {
        window.addEventListener('keydown', handleKeydown)
        window.addEventListener('resize', scheduleAnchorMeasure)
        window.addEventListener('scroll', scheduleAnchorMeasure, true)
        cleanupObserver = observeEbookReaderChanges({ onRefresh: () => void refreshCurrentChunk(), onNotify: notifyUpdated })
        scheduleAnchorMeasure()
        void loadChunk(ebookReaderStore.currentChatIndex, 'centerFirst')
    })

    onDestroy(() => {
        window.removeEventListener('keydown', handleKeydown)
        window.removeEventListener('resize', scheduleAnchorMeasure)
        window.removeEventListener('scroll', scheduleAnchorMeasure, true)
        if (anchorMeasureFrame !== null) cancelAnimationFrame(anchorMeasureFrame)
        anchorMeasureFrame = null
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
        --ebook-reader-surface-bg: var(--risu-theme-secondary-100);
        --ebook-reader-panel-bg: var(--risu-theme-secondary-50);
        --ebook-reader-border: var(--risu-theme-secondary-300);
        --ebook-reader-text: var(--risu-theme-secondary-900);
        --ebook-reader-muted: var(--risu-theme-secondary-700);
        --ebook-reader-accent-surface: var(--risu-theme-secondary-200);
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
