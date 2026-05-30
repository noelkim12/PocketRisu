import { get } from 'svelte/store'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearGenerationIndicators, withGenerationIndicator, withNovelAIQueue } from './generationIndicator'
import { generationIndicatorStore } from './stores.svelte'

function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((res, rej) => {
        resolve = res
        reject = rej
    })
    return { promise, resolve, reject }
}

afterEach(() => {
    clearGenerationIndicators()
    vi.useRealTimers()
})

describe('generation indicator provider queues', () => {
    it('serializes NovelAI jobs while keeping queued jobs visible', async () => {
        const first = deferred<string>()
        const second = deferred<string>()
        const events: string[] = []

        const firstRun = withNovelAIQueue({ kind: 'image', provider: 'NovelAI', message: 'Queued NovelAI image...' }, async () => {
            events.push('first-start')
            return await first.promise
        })
        const secondRun = withNovelAIQueue({ kind: 'image', provider: 'NovelAI', message: 'Queued NovelAI image...' }, async () => {
            events.push('second-start')
            return await second.promise
        })

        await Promise.resolve()

        expect(events).toEqual(['first-start'])
        expect(get(generationIndicatorStore).jobs.map((job) => job.status)).toEqual(['running', 'queued'])

        first.resolve('first')
        await firstRun
        await Promise.resolve()

        expect(events).toEqual(['first-start', 'second-start'])
        expect(get(generationIndicatorStore).jobs.find((job) => job.message === 'Generating NovelAI image...')?.status).toBe('running')

        second.resolve('second')
        await secondRun
    })

    it('continues the NovelAI queue after a failed job', async () => {
        const second = deferred<string>()
        const events: string[] = []

        const firstRun = withNovelAIQueue({ kind: 'image', provider: 'NovelAI', message: 'Queued NovelAI image...' }, async () => {
            events.push('first-start')
            throw new Error('first failed')
        })
        const secondRun = withNovelAIQueue({ kind: 'image', provider: 'NovelAI', message: 'Queued NovelAI image...' }, async () => {
            events.push('second-start')
            return await second.promise
        })

        await expect(firstRun).rejects.toThrow('first failed')
        await Promise.resolve()

        expect(events).toEqual(['first-start', 'second-start'])
        second.resolve('second')
        await secondRun
    })

    it('allows multiple ComfyUI jobs to run concurrently', async () => {
        const first = deferred<string>()
        const second = deferred<string>()
        const events: string[] = []

        const firstRun = withGenerationIndicator({ kind: 'image', provider: 'ComfyUI', message: 'Generating ComfyUI image...' }, async () => {
            events.push('first-start')
            return await first.promise
        })
        const secondRun = withGenerationIndicator({ kind: 'video', provider: 'ComfyUI', message: 'Generating ComfyUI video...' }, async () => {
            events.push('second-start')
            return await second.promise
        })

        await Promise.resolve()

        expect(events).toEqual(['first-start', 'second-start'])
        expect(get(generationIndicatorStore).jobs.filter((job) => job.provider === 'ComfyUI' && job.status === 'running')).toHaveLength(2)

        first.resolve('first')
        second.resolve('second')
        await Promise.all([firstRun, secondRun])
    })

    it('tracks text LLM jobs as generation indicator entries', async () => {
        const pending = deferred<string>()

        const run = withGenerationIndicator({ kind: 'text', provider: 'LLM', message: 'Calling LLM...' }, async () => await pending.promise)

        await Promise.resolve()

        expect(get(generationIndicatorStore).jobs).toMatchObject([{ kind: 'text', provider: 'LLM', status: 'running' }])

        pending.resolve('ok')
        await run
    })

    it('removes completed jobs after their display delay', async () => {
        vi.useFakeTimers()

        await withGenerationIndicator({ kind: 'image', provider: 'ComfyUI', message: 'Generating ComfyUI image...' }, async () => 'done')
        expect(get(generationIndicatorStore).jobs).toHaveLength(1)
        expect(get(generationIndicatorStore).jobs[0].status).toBe('done')

        vi.advanceTimersByTime(2500)

        expect(get(generationIndicatorStore).open).toBe(false)
        expect(get(generationIndicatorStore).jobs).toHaveLength(0)
    })
})
