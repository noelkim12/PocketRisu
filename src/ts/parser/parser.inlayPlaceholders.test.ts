import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveInlayPlaceholders } from './parser.svelte'

function mockIntersectionObserver() {
    const observe = vi.fn()
    const constructorSpy = vi.fn()

    class MockIntersectionObserver implements IntersectionObserver {
        readonly root = null
        readonly rootMargin = '200px'
        readonly thresholds: ReadonlyArray<number> = []

        constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
            constructorSpy(callback, options)
        }

        disconnect = vi.fn()
        observe = observe
        takeRecords = () => []
        unobserve = vi.fn()
    }

    Object.defineProperty(globalThis, 'IntersectionObserver', {
        configurable: true,
        value: MockIntersectionObserver,
    })

    return { constructorSpy, observe }
}

describe('resolveInlayPlaceholders', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
    })

    it('ignores already-rendered inlay images so Ebook Reader does not wrap them again', () => {
        const { constructorSpy, observe } = mockIntersectionObserver()

        const root = document.createElement('div')
        root.innerHTML = `
            <div class="x-risu-risu-comfy-video-image-wrap x-risu-risu-inlay-image">
                <img data-inlay-id="source-id" src="/api/asset/source-id">
                <div class="x-risu-risu-comfy-video-action-bar">
                    <button type="button">Generate video</button>
                </div>
            </div>
        `

        resolveInlayPlaceholders(root)

        expect(constructorSpy).not.toHaveBeenCalled()
        expect(observe).not.toHaveBeenCalled()
        expect(root.querySelector('img')?.hasAttribute('data-inlay-resolving')).toBe(false)
    })

    it('still observes unresolved inlay placeholder elements', () => {
        const { constructorSpy, observe } = mockIntersectionObserver()

        const root = document.createElement('div')
        root.innerHTML = '<div class="risu-inlay-placeholder" data-inlay-id="source-id" data-inlay-type="inlay"></div>'
        const placeholder = root.querySelector<HTMLElement>('.risu-inlay-placeholder')

        resolveInlayPlaceholders(root)

        expect(constructorSpy).toHaveBeenCalledTimes(1)
        expect(observe).toHaveBeenCalledWith(placeholder)
        expect(placeholder?.getAttribute('data-inlay-resolving')).toBe('true')
    })

    it('observes valid placeholder elements even if placeholder styling classes are missing', () => {
        const { constructorSpy, observe } = mockIntersectionObserver()

        const root = document.createElement('div')
        root.innerHTML = '<span data-inlay-id="source-id" data-inlay-type="inlay"></span>'
        const placeholder = root.querySelector<HTMLElement>('[data-inlay-id]')

        resolveInlayPlaceholders(root)

        expect(constructorSpy).toHaveBeenCalledTimes(1)
        expect(observe).toHaveBeenCalledWith(placeholder)
        expect(placeholder?.getAttribute('data-inlay-resolving')).toBe('true')
    })
})
