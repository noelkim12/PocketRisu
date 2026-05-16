<script lang="ts">
    import { BotIcon, BookOpenIcon, UserIcon } from '@lucide/svelte'
    import type { ReaderHeaderInfo } from './core/readerTypes'

    type Props = {
        header: ReaderHeaderInfo
    }

    let { header }: Props = $props()
    let isUser = $derived(header.role === 'user')
    let roleLabel = $derived(header.role === 'user' ? 'User' : header.role === 'char' ? 'Character' : 'Speaker')
</script>

<div class="mb-2 flex items-center gap-2 text-xs text-textcolor2" aria-label={roleLabel}>
    <div class="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full border border-darkborderc bg-selected/50">
        {#if header.thumbnailUrl}
            <img class="h-full w-full object-cover" src={header.thumbnailUrl} alt="" />
        {:else if header.role === 'user'}
            <UserIcon size={12} class="text-primary" />
        {:else if header.role === 'char'}
            <BotIcon size={12} class="text-textcolor2" />
        {:else}
            <BookOpenIcon size={12} class="text-textcolor2" />
        {/if}
    </div>
    <span class="min-w-0 truncate font-medium" class:text-primary={isUser}>{header.name ?? roleLabel}</span>
</div>
