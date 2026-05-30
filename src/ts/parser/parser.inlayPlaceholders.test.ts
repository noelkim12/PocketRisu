import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../storage/database.svelte', () => ({
    appVer: 0,
    getCurrentCharacter: vi.fn(),
    getDatabase: vi.fn(() => ({ comfyUiUrl: '' })),
}))

vi.mock('../stores.svelte', () => ({
    DBState: {
        db: {
            hideAllImages: false,
            inlayImagePriority: true,
        },
    },
    selectedCharID: { subscribe: vi.fn() },
    selIdState: {},
}))

vi.mock('../process/comfy/comfyInlayVideoVariant', () => ({
    getComfyVideoDisplayAssetId: vi.fn(() => Promise.resolve(null)),
    setComfyVideoDisplayAsset: vi.fn(),
}))

import { resolveInlayPlaceholders } from './parser.svelte'

function mockIntersectionObserver() {
    const observe = vi.fn()
    const unobserve = vi.fn()
    const disconnect = vi.fn()
    const constructorSpy = vi.fn()
    const callbacks: IntersectionObserverCallback[] = []

    class MockIntersectionObserver implements IntersectionObserver {
        readonly root = null
        readonly rootMargin = '200px'
        readonly thresholds: ReadonlyArray<number> = []

        constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
            callbacks.push(callback)
            constructorSpy(callback, options)
        }

        disconnect = disconnect
        observe = observe
        takeRecords = () => []
        unobserve = unobserve
    }

    Object.defineProperty(globalThis, 'IntersectionObserver', {
        configurable: true,
        value: MockIntersectionObserver,
    })

    return { constructorSpy, observe, unobserve, disconnect, callbacks }
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
        expect(placeholder?.hasAttribute('data-inlay-resolving')).toBe(false)
    })

    it('keeps default staging-like roots lazy unless eager resolution is requested', () => {
        const { constructorSpy, observe } = mockIntersectionObserver()

        const root = document.createElement('div')
        root.setAttribute('aria-hidden', 'true')
        root.innerHTML = '<span data-inlay-id="staged-id" data-inlay-type="inlay"></span>'
        const placeholder = root.querySelector<HTMLElement>('[data-inlay-id]')

        resolveInlayPlaceholders(root)

        expect(constructorSpy).toHaveBeenCalledTimes(1)
        expect(observe).toHaveBeenCalledWith(placeholder)
        expect(placeholder?.hasAttribute('data-inlay-resolving')).toBe(false)
    })

    it('observes valid placeholder elements even if placeholder styling classes are missing', () => {
        const { constructorSpy, observe } = mockIntersectionObserver()

        const root = document.createElement('div')
        root.innerHTML = '<span data-inlay-id="source-id" data-inlay-type="inlay"></span>'
        const placeholder = root.querySelector<HTMLElement>('[data-inlay-id]')

        resolveInlayPlaceholders(root)

        expect(constructorSpy).toHaveBeenCalledTimes(1)
        expect(observe).toHaveBeenCalledWith(placeholder)
        expect(placeholder?.hasAttribute('data-inlay-resolving')).toBe(false)
    })

    it('marks placeholders as resolving only when they intersect', () => {
        const { callbacks, unobserve } = mockIntersectionObserver()

        const root = document.createElement('div')
        root.innerHTML = '<div class="risu-inlay-placeholder" data-inlay-id="source-id" data-inlay-type="inlay"></div>'
        const placeholder = root.querySelector<HTMLElement>('.risu-inlay-placeholder')!

        resolveInlayPlaceholders(root)

        expect(placeholder.hasAttribute('data-inlay-resolving')).toBe(false)
        callbacks[0]([
            { isIntersecting: true, target: placeholder } as unknown as IntersectionObserverEntry,
        ], {} as IntersectionObserver)

        expect(placeholder.getAttribute('data-inlay-resolving')).toBe('true')
        expect(unobserve).toHaveBeenCalledWith(placeholder)
    })

    it('allows future resolver calls when a previous observer never intersected', () => {
        const first = mockIntersectionObserver()

        const root = document.createElement('div')
        root.innerHTML = '<div class="risu-inlay-placeholder" data-inlay-id="retry-id" data-inlay-type="inlay"></div>'
        const placeholder = root.querySelector<HTMLElement>('.risu-inlay-placeholder')!

        resolveInlayPlaceholders(root)
        expect(first.observe).toHaveBeenCalledWith(placeholder)
        expect(placeholder.hasAttribute('data-inlay-resolving')).toBe(false)

        const second = mockIntersectionObserver()
        resolveInlayPlaceholders(root)

        expect(second.observe).toHaveBeenCalledWith(placeholder)
        expect(placeholder.hasAttribute('data-inlay-resolving')).toBe(false)
    })

    it('eagerly queues placeholders without IntersectionObserver when requested', async () => {
        const { constructorSpy, observe } = mockIntersectionObserver()

        const root = document.createElement('div')
        root.innerHTML = '<div class="risu-inlay-placeholder" data-inlay-id="eager-id" data-inlay-type="inlay"></div>'
        const placeholder = root.querySelector<HTMLElement>('.risu-inlay-placeholder')!

        await resolveInlayPlaceholders(root, { eager: true })

        expect(constructorSpy).not.toHaveBeenCalled()
        expect(observe).not.toHaveBeenCalled()
        expect(root.querySelector('.risu-inlay-placeholder')).toBeNull()
        expect(root.querySelector('img')?.getAttribute('data-inlay-id')).toBe('eager-id')
    })

    it('falls back to eager queueing when IntersectionObserver is unavailable', async () => {
        Object.defineProperty(globalThis, 'IntersectionObserver', {
            configurable: true,
            value: undefined,
        })

        const root = document.createElement('div')
        root.innerHTML = '<div class="risu-inlay-placeholder" data-inlay-id="fallback-id" data-inlay-type="inlay"></div>'

        await expect(resolveInlayPlaceholders(root)).resolves.toBeUndefined()
        expect(root.querySelector('.risu-inlay-placeholder')).toBeNull()
        expect(root.querySelector('img')?.getAttribute('data-inlay-id')).toBe('fallback-id')
    })
})
