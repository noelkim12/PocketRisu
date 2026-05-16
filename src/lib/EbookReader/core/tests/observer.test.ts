import { afterEach, describe, expect, it, vi } from 'vitest'
import { observeEbookReaderGeometry } from '../observer'

class TestResizeObserver {
    static instances: TestResizeObserver[] = []

    observedElements: Element[] = []
    disconnected = false

    constructor(private readonly callback: ResizeObserverCallback) {
        TestResizeObserver.instances.push(this)
    }

    observe(element: Element) {
        this.observedElements.push(element)
    }

    unobserve(element: Element) {
        this.observedElements = this.observedElements.filter((observedElement) => observedElement !== element)
    }

    disconnect() {
        this.disconnected = true
        this.observedElements = []
    }

    emit() {
        this.callback([], this as unknown as ResizeObserver)
    }
}

const originalResizeObserver = globalThis.ResizeObserver

afterEach(() => {
    document.body.innerHTML = ''
    globalThis.ResizeObserver = originalResizeObserver
    TestResizeObserver.instances = []
    vi.restoreAllMocks()
})

describe('ebook reader observers', () => {
    it('measures geometry when the default chat screen resizes', () => {
        globalThis.ResizeObserver = TestResizeObserver as unknown as typeof ResizeObserver
        const root = document.createElement('section')
        const chatScreen = document.createElement('div')
        const onMeasure = vi.fn()

        chatScreen.className = 'default-chat-screen'
        root.append(chatScreen)

        const cleanup = observeEbookReaderGeometry({ root, onMeasure })
        const observer = TestResizeObserver.instances[0]

        expect(observer?.observedElements).toEqual([chatScreen])

        observer?.emit()
        expect(onMeasure).toHaveBeenCalledTimes(1)

        cleanup()
        expect(observer?.disconnected).toBe(true)
    })

    it('is a no-op when ResizeObserver is unavailable', () => {
        globalThis.ResizeObserver = undefined as unknown as typeof ResizeObserver
        const root = document.createElement('section')
        const chatScreen = document.createElement('div')
        const onMeasure = vi.fn()

        chatScreen.className = 'default-chat-screen'
        root.append(chatScreen)

        const cleanup = observeEbookReaderGeometry({ root, onMeasure })

        cleanup()

        expect(TestResizeObserver.instances).toHaveLength(0)
        expect(onMeasure).not.toHaveBeenCalled()
    })
})
