import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildComfyUrl, downloadComfyFile, pollComfyHistory, queueComfyPrompt, uploadComfyImage } from '../comfyUiClient'

const originalFetch = globalThis.fetch

afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
    vi.useRealTimers()
})

describe('buildComfyUrl', () => {
    it('builds a local ComfyUI route from a plain base URL', () => {
        expect(buildComfyUrl('http://127.0.0.1:8188', '/prompt')).toBe('http://127.0.0.1:8188/prompt')
    })

    it('preserves /api bases used by compatible cloud endpoints', () => {
        expect(buildComfyUrl('https://example.test/api', '/prompt')).toBe('https://example.test/api/prompt')
    })

    it('serializes query params for /view', () => {
        expect(buildComfyUrl('http://127.0.0.1:8188', '/view', {
            filename: 'video.webp',
            subfolder: '',
            type: 'temp'
        })).toBe('http://127.0.0.1:8188/view?filename=video.webp&subfolder=&type=temp')
    })
})

describe('uploadComfyImage', () => {
    it('uploads a blob as multipart image input', async () => {
        const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
            expect(init.method).toBe('POST')
            expect(init.headers).toBeUndefined()
            expect(init.body).toBeInstanceOf(FormData)
            const body = init.body as FormData
            expect(body.get('type')).toBe('input')
            expect(body.get('overwrite')).toBe('true')
            expect(body.has('subfolder')).toBe(false)
            expect(body.get('image')).toBeInstanceOf(File)
            return new Response(JSON.stringify({ name: 'pocketrisu.png', subfolder: '', type: 'input' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            })
        })
        globalThis.fetch = fetchMock as typeof fetch

        const uploaded = await uploadComfyImage({
            baseUrl: 'http://127.0.0.1:8188',
            image: new Blob(['abc'], { type: 'image/png' }),
            filename: 'pocketrisu.png'
        })

        expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8188/upload/image', expect.any(Object))
        expect(uploaded).toEqual({ name: 'pocketrisu.png', subfolder: '', type: 'input' })
    })

    it('includes subfolder only when provided', async () => {
        const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
            const body = init.body as FormData
            expect(body.get('subfolder')).toBe('generated/video')
            return new Response(JSON.stringify({ name: 'pocketrisu.png', subfolder: 'generated/video', type: 'input' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            })
        })
        globalThis.fetch = fetchMock as typeof fetch

        await uploadComfyImage({
            baseUrl: 'https://example.test/api',
            image: new Blob(['abc'], { type: 'image/png' }),
            filename: 'pocketrisu.png',
            subfolder: 'generated/video'
        })

        expect(fetchMock).toHaveBeenCalledWith('https://example.test/api/upload/image', expect.any(Object))
    })

    it('throws a readable error when ComfyUI rejects upload', async () => {
        globalThis.fetch = vi.fn(async () => new Response('bad upload', { status: 500 })) as typeof fetch

        await expect(uploadComfyImage({
            baseUrl: 'http://127.0.0.1:8188',
            image: new Blob(['abc'], { type: 'image/png' }),
            filename: 'pocketrisu.png'
        })).rejects.toThrow('ComfyUI image upload failed: HTTP 500 bad upload')
    })
})

describe('downloadComfyFile', () => {
    it('downloads a returned temp video/webp file with exact metadata', async () => {
        globalThis.fetch = vi.fn(async (url: string) => {
            expect(url).toBe('http://127.0.0.1:8188/view?filename=wan.webp&subfolder=&type=temp')
            return new Response(new Uint8Array([1, 2, 3]), {
                status: 200,
                headers: { 'Content-Type': 'image/webp' }
            })
        }) as typeof fetch

        const result = await downloadComfyFile('http://127.0.0.1:8188', {
            filename: 'wan.webp',
            subfolder: '',
            type: 'temp',
            format: 'image/webp'
        })

        expect(result.mimeType).toBe('image/webp')
        expect(Buffer.from(result.bytes).toString('base64')).toBe('AQID')
    })

    it('throws a readable error when ComfyUI rejects output download', async () => {
        globalThis.fetch = vi.fn(async () => new Response('missing', { status: 404 })) as typeof fetch

        await expect(downloadComfyFile('http://127.0.0.1:8188', {
            filename: 'missing.webp'
        })).rejects.toThrow('ComfyUI output download failed: HTTP 404 missing')
    })
})

describe('queueComfyPrompt and pollComfyHistory', () => {
    it('queues workflow JSON through /prompt', async () => {
        const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
            expect(url).toBe('http://127.0.0.1:8188/prompt')
            expect(init.method).toBe('POST')
            expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
            expect(init.body).toBe(JSON.stringify({ prompt: { '1': { inputs: {} } } }))
            return new Response(JSON.stringify({ prompt_id: 'abc', number: 1, node_errors: {} }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            })
        })
        globalThis.fetch = fetchMock as typeof fetch

        const result = await queueComfyPrompt('http://127.0.0.1:8188', { '1': { inputs: {} } })
        expect(result).toBe('abc')
    })

    it('polls /history/{prompt_id} until outputs appear', async () => {
        vi.useFakeTimers()
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ abc: { outputs: {} } }), { status: 200 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ abc: { outputs: { '30': { gifs: [{ filename: 'x.webp' }] } } } }), { status: 200 }))
        globalThis.fetch = fetchMock as typeof fetch

        const promise = pollComfyHistory('http://127.0.0.1:8188', 'abc', 5000, 1000)
        await vi.advanceTimersByTimeAsync(1000)
        const result = await promise
        expect(result).toEqual({ outputs: { '30': { gifs: [{ filename: 'x.webp' }] } } })
        expect(fetchMock).toHaveBeenCalledTimes(2)
        expect(fetchMock).toHaveBeenNthCalledWith(1, 'http://127.0.0.1:8188/history/abc')
        expect(fetchMock).toHaveBeenNthCalledWith(2, 'http://127.0.0.1:8188/history/abc')
    })
})
