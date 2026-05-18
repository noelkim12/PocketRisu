<script lang="ts">
    import { onDestroy } from 'svelte'
    import MobileBookHeader from './MobileBookHeader.svelte'
    import MobileBookPage from './MobileBookPage.svelte'
    import { attachSwipeHandler } from '../core/touchHandler'
    import type { EbookReaderStatus, ReaderAction, ReaderHeaderInfo, ReaderPage } from '../core/readerTypes'
    import { readerLabel } from '../readerLanguage'

    type Props = {
        pages: ReaderPage[]
        currentPageIndex: number
        status: EbookReaderStatus
        header?: ReaderHeaderInfo | null
        showUpdated: boolean
        errorMessage: string
        onAction: (action: ReaderAction) => void
        onPrevious: () => void
        onNext: () => void
        onClose: () => void
        role?: 'region' | 'dialog'
        ariaModal?: 'true'
    }

    let { pages, currentPageIndex, status, header = null, showUpdated, errorMessage, onAction, onPrevious, onNext, onClose, role = 'dialog', ariaModal = 'true' }: Props = $props()
    let rootElement: HTMLElement | null = $state(null)
    let detachSwipe: (() => void) | null = null
    let page = $derived(pages[currentPageIndex] ?? null)
    let previousPage = $derived(pages[currentPageIndex - 1] ?? null)
    let chatPageCount = $derived(page ? pages.filter((candidate) => candidate.chatIndex === page.chatIndex).length : 0)
    let pageLabel = $derived(page ? `${page.chatPageIndex + 1} / ${chatPageCount}` : readerLabel('ebookReader'))
    let chatIndexLabel = $derived(page ? `ChatIndex ${page.chatIndex}` : '')

    $effect(() => {
        if (!rootElement || detachSwipe) return
        detachSwipe = attachSwipeHandler(rootElement, { onSwipeLeft: onNext, onSwipeRight: onPrevious })
    })

    onDestroy(() => {
        detachSwipe?.()
        detachSwipe = null
    })
</script>

<div bind:this={rootElement} class="flex h-full w-full flex-col overflow-hidden bg-darkbg text-textcolor" {role} aria-modal={ariaModal} aria-labelledby="ebook-reader-title">
    <MobileBookHeader {header} {status} {pageLabel} {chatIndexLabel} {showUpdated} {onAction} {onClose} />
    <MobileBookPage {page} {previousPage} {status} {errorMessage} />
    <footer class="flex items-center justify-between border-t border-darkborderc bg-darkbg px-4 py-3">
        <button class="rounded-md border border-darkborderc px-4 py-2 text-sm text-textcolor2 hover:bg-selected hover:text-primary" onclick={onPrevious}>{readerLabel('ebookReaderPreviousPage')}</button>
        <span class="text-xs text-textcolor2">{pageLabel}</span>
        <button class="rounded-md border border-darkborderc px-4 py-2 text-sm text-textcolor2 hover:bg-selected hover:text-primary" onclick={onNext}>{readerLabel('ebookReaderNextPage')}</button>
    </footer>
</div>
