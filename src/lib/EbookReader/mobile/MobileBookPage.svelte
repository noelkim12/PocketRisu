<script lang="ts">
    import type { EbookReaderStatus, ReaderPage } from '../core/readerTypes'
    import { readerLabel } from '../readerLanguage'

    type Props = {
        page?: ReaderPage | null
        status: EbookReaderStatus
        errorMessage: string
    }

    let { page = null, status, errorMessage }: Props = $props()
</script>

<article class="min-h-0 flex-1 overflow-hidden bg-bg p-3">
    <div class="chattext h-full overflow-hidden rounded-lg border border-darkborderc bg-darkbg px-5 py-6 text-textcolor shadow-xl">
        {#if page}
            {@html page.html}
        {:else if status === 'error'}
            <p class="text-textcolor2">{errorMessage}</p>
        {:else}
            <p class="text-textcolor2">{readerLabel('ebookReader')}</p>
        {/if}
    </div>
    {#if page}
        <div class="px-3 py-2 text-center text-xs text-textcolor2">{page.pageIndex + 1}</div>
    {/if}
</article>
