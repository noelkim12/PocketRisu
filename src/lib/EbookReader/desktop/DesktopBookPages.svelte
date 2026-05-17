<script lang="ts">
    import { tick } from 'svelte'
    import { resolveInlayPlaceholders } from '../../../ts/parser/parser.svelte'
    import SpeakerStrip from '../SpeakerStrip.svelte'
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
    let showLeftSpeaker = $derived(Boolean(leftPage && pages[leftPageIndex - 1]?.chatIndex !== leftPage.chatIndex))
    let showRightSpeaker = $derived(Boolean(rightPage && leftPage?.chatIndex !== rightPage.chatIndex))
    let leftPageContainsImage = $derived(Boolean(leftPage?.html.includes('<img')))
    let rightPageContainsImage = $derived(Boolean(rightPage?.html.includes('<img')))
    let leftPageIsScrollable = $derived(leftPage?.overflowMode === 'scrollable')
    let rightPageIsScrollable = $derived(rightPage?.overflowMode === 'scrollable')
    let leftPageBodyElement: HTMLElement | null = $state(null)
    let rightPageBodyElement: HTMLElement | null = $state(null)

    async function resolveVisibleInlays(...roots: Array<HTMLElement | null>) {
        await tick()
        for (const root of roots) {
            if (root) resolveInlayPlaceholders(root)
        }
    }

    $effect(() => {
        leftPage?.html
        rightPage?.html
        leftPageBodyElement
        rightPageBodyElement
        void resolveVisibleInlays(leftPageBodyElement, rightPageBodyElement)
    })
</script>

<div class="relative grid min-h-0 flex-1 grid-cols-[1fr_auto_1fr] gap-0 bg-bg px-6 py-5">
    <button type="button" class="ebook-reader-page-turn ebook-reader-page-turn-previous absolute inset-y-0 left-0 z-10 bg-linear-to-r from-primary/15 via-primary/5 to-transparent opacity-0 transition-opacity duration-150 hover:opacity-100" tabindex="-1" aria-hidden="true" onclick={onPrevious}></button>
    <button type="button" class="ebook-reader-page-turn ebook-reader-page-turn-next absolute inset-y-0 right-0 z-10 bg-linear-to-l from-primary/15 via-primary/5 to-transparent opacity-0 transition-opacity duration-150 hover:opacity-100" tabindex="-1" aria-hidden="true" onclick={onNext}></button>

    <article class="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-l-lg border border-darkborderc bg-darkbg shadow-xl">
        <div class="chattext flex min-h-0 flex-1 flex-col overflow-hidden px-8 py-7 text-textcolor">
            {#if leftPage}
                {#if showLeftSpeaker}
                    <SpeakerStrip header={leftPage.headerInfo} />
                {/if}
                <div bind:this={leftPageBodyElement} class="ebook-reader-page-body min-h-0 flex-1 overflow-hidden" class:ebook-reader-page-body-image={leftPageContainsImage} class:ebook-reader-page-body-scrollable={leftPageIsScrollable}>
                    {@html leftPage.html}
                </div>
            {:else if status === 'error'}
                <p class="text-textcolor2">{errorMessage}</p>
            {/if}
        </div>
        {#if leftPage}
            <div class="shrink-0 border-t border-darkborderc px-4 py-2 text-xs text-textcolor2">{leftPage.pageIndex + 1}</div>
        {/if}
    </article>

    <div class="w-3 bg-linear-to-r from-black/30 via-darkborderc to-black/30"></div>

    <article class="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-r-lg border border-l-0 border-darkborderc bg-darkbg shadow-xl">
        <div class="chattext flex min-h-0 flex-1 flex-col overflow-hidden px-8 py-7 text-textcolor">
            {#if rightPage}
                {#if showRightSpeaker}
                    <SpeakerStrip header={rightPage.headerInfo} />
                {/if}
                <div bind:this={rightPageBodyElement} class="ebook-reader-page-body min-h-0 flex-1 overflow-hidden" class:ebook-reader-page-body-image={rightPageContainsImage} class:ebook-reader-page-body-scrollable={rightPageIsScrollable}>
                    {@html rightPage.html}
                </div>
            {:else if status === 'capturing' || status === 'paginating'}
                <p class="text-textcolor2">{readerLabel('ebookReader')}</p>
            {/if}
        </div>
        {#if rightPage}
            <div class="shrink-0 border-t border-darkborderc px-4 py-2 text-right text-xs text-textcolor2">{rightPage.pageIndex + 1}</div>
        {/if}
    </article>
</div>

<style>
    .ebook-reader-page-turn {
        width: var(--ebook-reader-desktop-nav-area-width, 20%);
    }

    .ebook-reader-page-turn-previous {
        cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Cpath d='M20 8L12 16l8 8' fill='none' stroke='white' stroke-width='5' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M20 8L12 16l8 8' fill='none' stroke='black' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") 16 16, pointer;
    }

    .ebook-reader-page-turn-next {
        cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Cpath d='M12 8l8 8-8 8' fill='none' stroke='white' stroke-width='5' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M12 8l8 8-8 8' fill='none' stroke='black' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") 16 16, pointer;
    }
</style>
