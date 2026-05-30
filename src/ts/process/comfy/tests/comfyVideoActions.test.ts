import { afterEach, describe, expect, it, vi } from 'vitest'
import { extractPositivePromptFromXnaiPromptText, wrapImageWithComfyVideoAction } from '../comfyVideoActions'

afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
})

describe('wrapImageWithComfyVideoAction', () => {
    it('wraps the same image with an action button and delay variable', () => {
        const img = document.createElement('img')
        img.src = '/api/asset/abc'

        const wrapper = wrapImageWithComfyVideoAction(img, {
            durationMs: 3000,
            inlayId: 'source-id',
            onGenerate: vi.fn(),
        })

        expect(wrapper.classList.contains('x-risu-risu-comfy-video-image-wrap')).toBe(true)
        expect(wrapper.classList.contains('x-risu-risu-inlay-image')).toBe(true)
        expect(wrapper.tagName).toBe('DIV')
        expect(wrapper.style.getPropertyValue('--risu-comfy-video-delay')).toBe('3000ms')
        expect(wrapper.querySelector('img')).toBe(img)
        expect(img.src).toContain('/api/asset/abc')
        expect(wrapper.querySelector('button')?.textContent).toBe('Generate video')
        expect(wrapper.querySelector('.x-risu-risu-comfy-video-generating-status')?.textContent).toBe('Generating video...')
    })

    it('prevents click defaults, stops propagation, and calls onGenerate with image element and inlay id', () => {
        const img = document.createElement('img')
        const onGenerate = vi.fn()
        const parentClick = vi.fn()
        const wrapper = wrapImageWithComfyVideoAction(img, { durationMs: 3000, inlayId: 'source-id', onGenerate })
        const button = wrapper.querySelector('button')

        wrapper.addEventListener('click', parentClick)

        const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true })
        const dispatchResult = button?.dispatchEvent(clickEvent)

        expect(dispatchResult).toBe(false)
        expect(clickEvent.defaultPrevented).toBe(true)
        expect(parentClick).not.toHaveBeenCalled()
        expect(onGenerate).toHaveBeenCalledWith({ img, inlayId: 'source-id', positivePrompt: null })
    })

    it('extracts the positive section from XNAI prompt text', () => {
        expect(extractPositivePromptFromXnaiPromptText(`
            [Positive]
            dungeon, violet lighting

            [Negative]
            blur
        `)).toBe('dungeon, violet lighting')
    })

    it('returns null when XNAI positive prompt markers are missing or empty', () => {
        expect(extractPositivePromptFromXnaiPromptText('dungeon, violet lighting')).toBeNull()
        expect(extractPositivePromptFromXnaiPromptText('[Positive]\n\n[Negative]\nblur')).toBeNull()
        expect(extractPositivePromptFromXnaiPromptText(null)).toBeNull()
    })

    it('passes captured XNAI positive prompt to onGenerate when prompt preview is nearby', () => {
        const container = document.createElement('div')
        container.className = 'x-risu-lb-xnai-inlay'
        const img = document.createElement('img')
        const onGenerate = vi.fn()
        const wrapper = wrapImageWithComfyVideoAction(img, { durationMs: 3000, inlayId: 'source-id', onGenerate })
        const prompt = document.createElement('pre')
        prompt.className = 'x-risu-lb-xnai-fullsize-prompt'
        prompt.textContent = '[Positive]\n2girls, dungeon, violet lighting\n\n[Negative]\nblur'

        container.appendChild(wrapper)
        container.appendChild(prompt)
        document.body.appendChild(container)

        wrapper.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

        expect(onGenerate).toHaveBeenCalledWith({
            img,
            inlayId: 'source-id',
            positivePrompt: '2girls, dungeon, violet lighting',
        })

        container.remove()
    })

    it('preserves prompt line breaks represented by br elements', () => {
        const container = document.createElement('div')
        container.className = 'x-risu-lb-xnai-inlay'
        const img = document.createElement('img')
        const onGenerate = vi.fn()
        const wrapper = wrapImageWithComfyVideoAction(img, { durationMs: 3000, inlayId: 'source-id', onGenerate })
        const prompt = document.createElement('pre')
        prompt.className = 'x-risu-lb-xnai-fullsize-prompt'
        prompt.append('[Positive]')
        prompt.appendChild(document.createElement('br'))
        prompt.append('first line')
        prompt.appendChild(document.createElement('br'))
        prompt.append('second line')
        prompt.appendChild(document.createElement('br'))
        prompt.append('[Negative]')

        container.appendChild(wrapper)
        container.appendChild(prompt)
        document.body.appendChild(container)

        wrapper.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

        expect(onGenerate).toHaveBeenCalledWith({
            img,
            inlayId: 'source-id',
            positivePrompt: 'first line\nsecond line',
        })

        container.remove()
    })

    it('shows generating status and prevents duplicate clicks while generation is pending', () => {
        const img = document.createElement('img')
        let resolveGenerate: (() => void) | undefined
        const onGenerate = vi.fn(() => new Promise<void>((resolve) => {
            resolveGenerate = resolve
        }))
        const wrapper = wrapImageWithComfyVideoAction(img, { durationMs: 3000, inlayId: 'source-id', onGenerate })
        const button = wrapper.querySelector('button')
        const status = wrapper.querySelector<HTMLElement>('.x-risu-risu-comfy-video-generating-status')

        button?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        button?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

        expect(onGenerate).toHaveBeenCalledTimes(1)
        expect(wrapper.classList.contains('x-risu-risu-comfy-video-generating')).toBe(true)
        expect(button?.disabled).toBe(true)
        expect(button?.hidden).toBe(true)
        expect(status?.hidden).toBe(false)
        expect(status?.textContent).toBe('Generating video...')

        resolveGenerate?.()
    })

    it('resets generating state after generation resolves', async () => {
        const img = document.createElement('img')
        const onGenerate = vi.fn().mockResolvedValue(undefined)
        const wrapper = wrapImageWithComfyVideoAction(img, { durationMs: 3000, inlayId: 'source-id', onGenerate })
        document.body.appendChild(wrapper)
        const button = wrapper.querySelector('button')
        const status = wrapper.querySelector<HTMLElement>('.x-risu-risu-comfy-video-generating-status')

        button?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        await Promise.resolve()

        expect(wrapper.classList.contains('x-risu-risu-comfy-video-generating')).toBe(false)
        expect(button?.disabled).toBe(false)
        expect(button?.hidden).toBe(false)
        expect(status?.hidden).toBe(true)

        wrapper.remove()
    })

    it('resets generating state after generation rejects', async () => {
        const img = document.createElement('img')
        const onGenerate = vi.fn().mockRejectedValue(new Error('generation failed'))
        const wrapper = wrapImageWithComfyVideoAction(img, { durationMs: 3000, inlayId: 'source-id', onGenerate })
        document.body.appendChild(wrapper)
        const button = wrapper.querySelector('button')
        const status = wrapper.querySelector<HTMLElement>('.x-risu-risu-comfy-video-generating-status')

        button?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        await Promise.resolve()

        expect(wrapper.classList.contains('x-risu-risu-comfy-video-generating')).toBe(false)
        expect(button?.disabled).toBe(false)
        expect(button?.hidden).toBe(false)
        expect(status?.hidden).toBe(true)

        wrapper.remove()
    })

    it('activates the touch class on pointerdown and removes it after durationMs', () => {
        vi.useFakeTimers()
        const img = document.createElement('img')
        const wrapper = wrapImageWithComfyVideoAction(img, { durationMs: 1500, inlayId: 'source-id', onGenerate: vi.fn() })

        wrapper.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))

        expect(wrapper.classList.contains('x-risu-risu-comfy-video-touch-active')).toBe(true)

        vi.advanceTimersByTime(1499)
        expect(wrapper.classList.contains('x-risu-risu-comfy-video-touch-active')).toBe(true)

        vi.advanceTimersByTime(1)
        expect(wrapper.classList.contains('x-risu-risu-comfy-video-touch-active')).toBe(false)
    })
})
