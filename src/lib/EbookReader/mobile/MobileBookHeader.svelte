<script lang="ts">
    import { BookmarkIcon, BookOpenIcon, CopyIcon, HeadphonesIcon, LanguagesIcon, MessageSquareIcon, PencilIcon, RefreshCcwIcon, RotateCcwIcon, Trash2Icon, XIcon } from '@lucide/svelte'
    import ReaderCustomizationPopover from '../ReaderCustomizationPopover.svelte'
    import type { EbookReaderStatus, ReaderAction, ReaderHeaderInfo } from '../core/readerTypes'
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

<header class="border-b border-darkborderc bg-darkbg/95 px-3 py-2 text-textcolor shadow-lg">
    <div class="flex items-center justify-between gap-2">
        <div class="flex min-w-0 items-center gap-2">
            <div class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-darkborderc bg-selected">
                {#if header?.thumbnailUrl}
                    <img class="h-full w-full object-cover" src={header.thumbnailUrl} alt="" />
                {:else}
                    <BookOpenIcon size={18} class="text-primary" />
                {/if}
            </div>
            <div class="min-w-0">
                <h2 id="ebook-reader-title" class="truncate text-base font-semibold">{header?.name ?? readerLabel('ebookReader')}</h2>
                <p class="text-xs text-textcolor2">{showUpdated ? readerLabel('ebookReaderUpdated') : status === 'ready' ? locationLabel : readerLabel('ebookReader')}</p>
            </div>
        </div>
        <div class="flex shrink-0 items-center gap-1">
            <ReaderCustomizationPopover buttonClass="rounded-md p-2 text-textcolor2 hover:bg-selected hover:text-primary" iconSize={18} />
            <button class="rounded-md p-2 text-textcolor2 hover:bg-selected hover:text-primary" onclick={onClose} aria-label={readerLabel('ebookReaderClose')}>
                <XIcon size={19} />
            </button>
        </div>
    </div>
    <div class="mt-2 flex gap-1 overflow-x-auto pb-1">
        {#each actions as item}
            {@const Icon = item.icon}
            <button class="shrink-0 rounded-md border border-darkborderc px-2 py-1.5 text-textcolor2 hover:bg-selected hover:text-primary" title={item.label} aria-label={item.label} onclick={() => onAction(item.action)}>
                <Icon size={15} />
            </button>
        {/each}
    </div>
</header>
