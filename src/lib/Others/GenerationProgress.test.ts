import { mount, tick, unmount } from 'svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearGenerationIndicators, startGenerationIndicator } from 'src/ts/generationIndicator'
import GenerationProgress from './GenerationProgress.svelte'

afterEach(() => {
    clearGenerationIndicators()
    vi.useRealTimers()
    document.body.innerHTML = ''
})

describe('GenerationProgress', () => {
    it('shows elapsed time for normal LLM chat response generation', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-06-13T00:00:00.000Z'))
        const target = document.createElement('div')
        document.body.append(target)

        const component = mount(GenerationProgress, { target })
        startGenerationIndicator({
            kind: 'text',
            provider: 'LLM',
            message: 'Generating response...',
            detail: 'Waiting for model response',
        })
        await tick()

        expect(target.textContent).toContain('Text generating...(0/1)')
        expect(target.textContent).toContain('LLM 1 running, 0 queued')
        expect(target.textContent).toContain('Elapsed 0:00')

        await vi.advanceTimersByTimeAsync(12_000)
        await tick()

        expect(target.textContent).toContain('Elapsed 0:12')
        unmount(component)
    })

    it('shows live elapsed time for AxLLM generation jobs', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-06-13T00:00:00.000Z'))
        const target = document.createElement('div')
        document.body.append(target)

        const component = mount(GenerationProgress, { target })
        startGenerationIndicator({
            kind: 'text',
            provider: 'AxLLM',
            message: 'Calling AxLLM...',
            detail: 'Waiting for Ax model response',
        })
        await tick()

        expect(target.textContent).toContain('AxLLM 1 running, 0 queued')
        expect(target.textContent).toContain('Elapsed 0:00')

        await vi.advanceTimersByTimeAsync(65_000)
        await tick()

        expect(target.textContent).toContain('Elapsed 1:05')
        unmount(component)
    })
})
