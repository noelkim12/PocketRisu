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
    let pageLabel = $derived(pages.length > 0 ? `${currentPageIndex + 1}-${Math.min(currentPageIndex + 2, pages.length)} / ${pages.length}` : readerLabel('ebookReader'))
    let leftPage = $derived(pages[currentPageIndex] ?? null)
    let rightPage = $derived(pages[currentPageIndex + 1] ?? null)
    let chatIndexLabel = $derived.by(() => {
        if (!leftPage) return ''
        if (!rightPage || rightPage.chatIndex === leftPage.chatIndex) return `ChatIndex ${leftPage.chatIndex}`
        return `ChatIndex ${leftPage.chatIndex}-${rightPage.chatIndex}`
    })
</script>

<div class="flex h-full w-full flex-col overflow-hidden rounded-xl border border-darkborderc bg-darkbg/95 text-textcolor shadow-xl" {role} aria-modal={ariaModal} aria-labelledby="ebook-reader-title">
    <DesktopBookHeader {header} {status} {pageLabel} {chatIndexLabel} {showUpdated} {onAction} {onClose} />
    <DesktopBookPages {pages} leftPageIndex={currentPageIndex} {status} {errorMessage} onPrevious={onPrevious} onNext={onNext} />
</div>
