<script lang="ts">
    import DesktopBookHeader from './DesktopBookHeader.svelte'
    import DesktopBookPages from './DesktopBookPages.svelte'
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

    let { pages, currentPageIndex, status, header = null, showUpdated, errorMessage, onAction, onPrevious, onNext, onClose, role = 'region', ariaModal }: Props = $props()
    let leftPage = $derived(pages[currentPageIndex] ?? null)
    let rawRightPage = $derived(pages[currentPageIndex + 1] ?? null)
    let rightPage = $derived(rawRightPage && leftPage && rawRightPage.chatIndex === leftPage.chatIndex ? rawRightPage : null)
    let chatPageCount = $derived(leftPage ? pages.filter((page) => page.chatIndex === leftPage.chatIndex).length : 0)
    let pageLabel = $derived.by(() => {
        if (!leftPage) return readerLabel('ebookReader')
        if (rightPage) return `${leftPage.chatPageIndex + 1}-${rightPage.chatPageIndex + 1} / ${chatPageCount}`
        return `${leftPage.chatPageIndex + 1} / ${chatPageCount}`
    })
    let chatIndexLabel = $derived(leftPage ? `ChatIndex ${leftPage.chatIndex}` : '')
</script>

<div class="flex h-full w-full flex-col overflow-hidden rounded-xl border border-darkborderc bg-darkbg/95 text-textcolor shadow-xl" {role} aria-modal={ariaModal} aria-labelledby="ebook-reader-title">
    <DesktopBookHeader {header} {status} {pageLabel} {chatIndexLabel} {showUpdated} {onAction} {onClose} />
    <DesktopBookPages {pages} leftPageIndex={currentPageIndex} {status} {errorMessage} onPrevious={onPrevious} onNext={onNext} />
</div>
