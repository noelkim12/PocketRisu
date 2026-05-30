<script lang="ts">
    import { generationIndicatorStore } from 'src/ts/stores.svelte'

    const formatKind = (kind: string) => {
        if (kind === 'video') return 'Video'
        if (kind === 'text') return 'Text'
        return 'Image'
    }

    const countJobs = (status: 'queued' | 'running' | 'done' | 'error') => $generationIndicatorStore.jobs.filter((job) => job.status === status).length
    const countProvider = (provider: string, status: 'queued' | 'running') => $generationIndicatorStore.jobs.filter((job) => job.provider === provider && job.status === status).length
    const summaryKind = () => {
        const kinds = new Set($generationIndicatorStore.jobs.map((job) => job.kind))
        if (kinds.size === 1) return formatKind(kinds.values().next().value)
        return 'Generation'
    }
    const title = () => {
        const total = $generationIndicatorStore.jobs.length
        const completed = countJobs('done') + countJobs('error')
        const hasRunning = countJobs('queued') + countJobs('running') > 0
        if (!hasRunning) return `${summaryKind()} complete...(${completed}/${total})`
        return `${summaryKind()} generating...(${completed}/${total})`
    }
    const detail = () => {
        const parts = []
        const providers = [...new Set($generationIndicatorStore.jobs.map((job) => job.provider))]
        for (const provider of providers) {
            const queued = countProvider(provider, 'queued')
            const running = countProvider(provider, 'running')
            const runningLabel = provider === 'ComfyUI' ? 'polling' : 'running'
            if (queued || running) parts.push(`${provider} ${running} ${runningLabel}, ${queued} queued`)
        }
        const failed = countJobs('error')
        if (failed) parts.push(`${failed} failed`)
        return parts.join(' · ')
    }
    const visualStatus = () => {
        if (countJobs('queued') + countJobs('running') > 0) return 'running'
        if (countJobs('error') > 0) return 'error'
        return 'done'
    }
</script>

{#if $generationIndicatorStore.open}
    <div class="fixed top-3 left-1/2 z-50 flex -translate-x-1/2 justify-center pointer-events-none px-3">
        <div class={`generation-progress generation-progress-${visualStatus()}`} role="status" aria-live="polite">
            <span class="generation-progress-icon" aria-hidden="true">
                {#if visualStatus() === 'done'}
                    ✓
                {:else if visualStatus() === 'error'}
                    !
                {/if}
            </span>
            <span class="generation-progress-text">
                <span class="generation-progress-title">{title()}</span>
                <span class="generation-progress-detail">
                    {detail()}
                </span>
            </span>
        </div>
    </div>
{/if}
