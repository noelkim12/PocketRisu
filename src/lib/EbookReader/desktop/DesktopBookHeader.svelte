<script lang="ts">
    import { BookOpenIcon, CopyIcon, HeadphonesIcon, LanguagesIcon, MessageSquareIcon, PencilIcon, RefreshCcwIcon, RotateCcwIcon, Trash2Icon, BookmarkIcon, XIcon } from '@lucide/svelte'
    import ReaderCustomizationPopover from '../ReaderCustomizationPopover.svelte'
    import type { ReaderAction, ReaderHeaderInfo, EbookReaderStatus } from '../core/readerTypes'
    import { readerLabel } from '../readerLanguage'

    type Props = {
        header?: ReaderHeaderInfo | null
        status: EbookReaderStatus
        pageLabel: string
        chatIndexLabel: string
        showUpdated: boolean
        onAction: (action: ReaderAction) => void
        onClose: () => void
    }

    const actions: { action: ReaderAction; label: string; icon: typeof CopyIcon }[] = [
        { action: 'copy', label: 'Copy', icon: CopyIcon },
        { action: 'tts', label: 'TTS', icon: HeadphonesIcon },
        { action: 'bookmark', label: 'Bookmark', icon: BookmarkIcon },
        { action: 'translate', label: 'Translate', icon: LanguagesIcon },
        { action: 'reroll', label: 'Reroll', icon: RefreshCcwIcon },
        { action: 'unreroll', label: 'Undo reroll', icon: RotateCcwIcon },
        { action: 'remove', label: 'Remove', icon: Trash2Icon },
        { action: 'jumpToOriginal', label: readerLabel('ebookReaderJumpToOriginal'), icon: MessageSquareIcon },
        { action: 'editInOriginal', label: readerLabel('ebookReaderEditInOriginal'), icon: PencilIcon },
    ]

    let { header = null, status, pageLabel, chatIndexLabel, showUpdated, onAction, onClose }: Props = $props()
    let locationLabel = $derived(chatIndexLabel ? `${pageLabel} · ${chatIndexLabel}` : pageLabel)
</script>

<header class="flex items-center justify-between gap-4 border-b border-darkborderc bg-darkbg/95 px-5 py-3 text-textcolor shadow-lg">
    <div class="flex min-w-0 items-center gap-3">
        <div class="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md border border-darkborderc bg-selected">
            {#if header?.thumbnailUrl}
                <img class="h-full w-full object-cover" src={header.thumbnailUrl} alt="" />
            {:else}
                <BookOpenIcon size={22} class="text-primary" />
            {/if}
        </div>
        <div class="min-w-0">
            <h2 id="ebook-reader-title" class="truncate text-lg font-semibold text-textcolor">{header?.name ?? readerLabel('ebookReader')}</h2>
            <p class="text-xs text-textcolor2">
                {#if showUpdated}
                    {readerLabel('ebookReaderUpdated')}
                {:else if status === 'capturing'}
                    {readerLabel('ebookReader')}
                {:else}
                    {locationLabel}
                {/if}
            </p>
        </div>
    </div>

    <div class="flex shrink-0 items-center gap-1">
        {#each actions as item}
            {@const Icon = item.icon}
            <button
                class="rounded-md p-2 text-textcolor2 transition-colors hover:bg-selected hover:text-primary focus:outline-hidden focus:ring-2 focus:ring-selected"
                title={item.label}
                aria-label={item.label}
                onclick={() => onAction(item.action)}
            >
                <Icon size={17} />
            </button>
        {/each}
        <ReaderCustomizationPopover buttonClass="ml-2 rounded-md p-2 text-textcolor2 transition-colors hover:bg-selected hover:text-primary focus:outline-hidden focus:ring-2 focus:ring-selected" iconSize={17} />
        <button
            class="rounded-md p-2 text-textcolor2 transition-colors hover:bg-selected hover:text-primary focus:outline-hidden focus:ring-2 focus:ring-selected"
            onclick={onClose}
            aria-label={readerLabel('ebookReaderClose')}
        >
            <XIcon size={20} />
        </button>
    </div>
</header>
