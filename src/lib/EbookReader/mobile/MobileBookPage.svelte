<script lang="ts">
    import SpeakerStrip from '../SpeakerStrip.svelte'
    import type { EbookReaderStatus, ReaderPage } from '../core/readerTypes'
    import { readerLabel } from '../readerLanguage'

    type Props = {
        page?: ReaderPage | null
        previousPage?: ReaderPage | null
        status: EbookReaderStatus
        errorMessage: string
    }

    let { page = null, previousPage = null, status, errorMessage }: Props = $props()
    let showSpeaker = $derived(Boolean(page && previousPage?.chatIndex !== page.chatIndex))
    let pageContainsImage = $derived(Boolean(page?.html.includes('<img')))
</script>

<article class="flex min-h-0 flex-1 flex-col overflow-hidden bg-bg p-3">
    <div class="chattext flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-darkborderc bg-darkbg px-5 py-6 text-textcolor shadow-xl">
        {#if page}
            {#if showSpeaker}
                <SpeakerStrip header={page.headerInfo} />
            {/if}
            <div class="ebook-reader-page-body min-h-0 flex-1 overflow-hidden" class:ebook-reader-page-body-image={pageContainsImage}>
                {@html page.html}
            </div>
        {:else if status === 'error'}
            <p class="text-textcolor2">{errorMessage}</p>
        {:else}
            <p class="text-textcolor2">{readerLabel('ebookReader')}</p>
        {/if}
    </div>
    {#if page}
        <div class="shrink-0 px-3 py-2 text-center text-xs text-textcolor2">{page.pageIndex + 1}</div>
    {/if}
</article>
