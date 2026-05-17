import { afterEach, describe, expect, it, vi } from 'vitest'
import * as client from '../comfyUiClient'
import { generateComfyVideoFromBlob } from '../comfyVideo'

afterEach(() => {
    vi.restoreAllMocks()
})

describe('generateComfyVideoFromBlob', () => {
    it('uploads the image, patches node 32, queues workflow, and returns animated WebP bytes', async () => {
        vi.spyOn(client, 'uploadComfyImage').mockResolvedValue({ name: 'input.png', subfolder: '', type: 'input' })
        vi.spyOn(client, 'queueComfyPrompt').mockResolvedValue('prompt-1')
        vi.spyOn(client, 'pollComfyHistory').mockResolvedValue({
            outputs: { '30': { gifs: [{ filename: 'wan.webp', type: 'temp', format: 'image/webp' }] } }
        })
        vi.spyOn(client, 'downloadComfyFile').mockResolvedValue({ bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/webp' })

        const result = await generateComfyVideoFromBlob({
            baseUrl: 'http://127.0.0.1:8188',
            image: new Blob(['abc'], { type: 'image/png' }),
            filename: 'source.png',
            workflowText: JSON.stringify({ '32': { inputs: { image: 'old.png' } }, '30': { inputs: { format: 'image/webp' } } }),
            inputImageNodeId: '32',
            inputImageField: 'image',
            outputNodeId: '30',
            positivePrompt: 'motion',
            negativePrompt: 'blur',
            timeoutSeconds: 300
        })

        expect(result.mimeType).toBe('image/webp')
        expect(Buffer.from(result.bytes).toString('base64')).toBe('AQID')
        expect(client.queueComfyPrompt).toHaveBeenCalledWith('http://127.0.0.1:8188', expect.objectContaining({
            '32': expect.objectContaining({ inputs: expect.objectContaining({ image: 'input.png' }) })
        }))
    })
})
