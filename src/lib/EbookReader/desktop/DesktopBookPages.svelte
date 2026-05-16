<script lang="ts">
    import type { ReaderPage, EbookReaderStatus } from '../core/readerTypes'
    import { readerLabel } from '../readerLanguage'

    type Props = {
        pages: ReaderPage[]
        leftPageIndex: number
        status: EbookReaderStatus
        errorMessage: string
        onPrevious: () => void
        onNext: () => void
    }

    let { pages, leftPageIndex, status, errorMessage, onPrevious, onNext }: Props = $props()
    let leftPage = $derived(pages[leftPageIndex] ?? null)
    let rightPage = $derived(pages[leftPageIndex + 1] ?? null)
</script>

<div class="relative grid min-h-0 flex-1 grid-cols-[1fr_auto_1fr] gap-0 bg-bg px-6 py-5">
    <button class="absolute inset-y-0 left-0 w-1/5 cursor-w-resize opacity-0" tabindex="-1" aria-hidden="true" onclick={onPrevious}></button>
    <button class="absolute inset-y-0 right-0 w-1/5 cursor-e-resize opacity-0" tabindex="-1" aria-hidden="true" onclick={onNext}></button>

    <article class="min-w-0 overflow-hidden rounded-l-lg border border-darkborderc bg-darkbg shadow-xl">
        <div class="chattext h-full overflow-hidden px-8 py-7 text-textcolor">
            {#if leftPage}
                {@html leftPage.html}
            {:else if status === 'error'}
                <p class="text-textcolor2">{errorMessage}</p>
            {/if}
        </div>
        {#if leftPage}
            <div class="border-t border-darkborderc px-4 py-2 text-xs text-textcolor2">{leftPage.pageIndex + 1}</div>
        {/if}
    </article>

    <div class="w-3 bg-linear-to-r from-black/30 via-darkborderc to-black/30"></div>

    <article class="min-w-0 overflow-hidden rounded-r-lg border border-l-0 border-darkborderc bg-darkbg shadow-xl">
        <div class="chattext h-full overflow-hidden px-8 py-7 text-textcolor">
            {#if rightPage}
                {@html rightPage.html}
            {:else if status === 'capturing' || status === 'paginating'}
                <p class="text-textcolor2">{readerLabel('ebookReader')}</p>
            {/if}
        </div>
        {#if rightPage}
            <div class="border-t border-darkborderc px-4 py-2 text-right text-xs text-textcolor2">{rightPage.pageIndex + 1}</div>
        {/if}
    </article>
</div>
