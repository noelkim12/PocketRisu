import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as inlayMeta from 'src/ts/process/files/inlayMeta'
import { getComfyVideoDisplayAssetId, getComfyVideoDisplayAssetIds, setComfyVideoDisplayAsset } from '../comfyInlayVideoVariant'

vi.mock('src/ts/process/files/inlayMeta', () => ({
    getInlayMeta: vi.fn(),
    getInlayMetasBatch: vi.fn(),
    setInlayMeta: vi.fn(),
    buildInlayMeta: vi.fn(),
}))

type InlayAssetMeta = {
    createdAt: number
    updatedAt: number
    charId?: string
    chatId?: string
    comfyVideoDisplayAssetId?: string
    comfyVideoUpdatedAt?: number
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('comfyInlayVideoVariant', () => {
    const fixedNow = 1234567890

    beforeEach(() => {
        vi.spyOn(Date, 'now').mockReturnValue(fixedNow)
    })

    describe('setComfyVideoDisplayAsset', () => {
        it('preserves existing metadata and stores the generated display asset ID with updatedAt', async () => {
            const existingMeta: InlayAssetMeta = {
                createdAt: 1000,
                updatedAt: 2000,
                charId: 'char-1',
                chatId: 'chat-1',
            }

            vi.mocked(inlayMeta.getInlayMeta).mockResolvedValue(existingMeta)
            vi.mocked(inlayMeta.setInlayMeta).mockResolvedValue(undefined)
            vi.mocked(inlayMeta.buildInlayMeta).mockImplementation((existing) => ({
                createdAt: existing?.createdAt ?? fixedNow,
                updatedAt: fixedNow,
                charId: existing?.charId,
                chatId: existing?.chatId,
            }))

            await setComfyVideoDisplayAsset('original-42', 'generated-99')

            expect(inlayMeta.getInlayMeta).toHaveBeenCalledWith('original-42')
            expect(inlayMeta.buildInlayMeta).toHaveBeenCalledWith(existingMeta)
            expect(inlayMeta.setInlayMeta).toHaveBeenCalledWith('original-42', {
                createdAt: 1000,
                updatedAt: fixedNow,
                charId: 'char-1',
                chatId: 'chat-1',
                comfyVideoDisplayAssetId: 'generated-99',
                comfyVideoUpdatedAt: fixedNow,
            })
        })
    })

    describe('getComfyVideoDisplayAssetId', () => {
        it('returns the stored generated display asset ID when present', async () => {
            vi.mocked(inlayMeta.getInlayMeta).mockResolvedValue({
                createdAt: 1000,
                updatedAt: 2000,
                comfyVideoDisplayAssetId: 'generated-99',
            } as InlayAssetMeta)

            const result = await getComfyVideoDisplayAssetId('original-42')
            expect(result).toBe('generated-99')
            expect(inlayMeta.getInlayMeta).toHaveBeenCalledWith('original-42')
        })

        it('returns null when metadata has no comfyVideoDisplayAssetId', async () => {
            vi.mocked(inlayMeta.getInlayMeta).mockResolvedValue({
                createdAt: 1000,
                updatedAt: 2000,
            } as InlayAssetMeta)

            const result = await getComfyVideoDisplayAssetId('original-42')
            expect(result).toBeNull()
        })

        it('returns null when metadata is missing entirely', async () => {
            vi.mocked(inlayMeta.getInlayMeta).mockResolvedValue(null)

            const result = await getComfyVideoDisplayAssetId('original-42')
            expect(result).toBeNull()
        })
    })

    describe('getComfyVideoDisplayAssetIds', () => {
        it('loads unique IDs once and returns only persisted display variants', async () => {
            vi.mocked(inlayMeta.getInlayMetasBatch).mockResolvedValue({
                'original-42': {
                    createdAt: 1000,
                    updatedAt: 2000,
                    comfyVideoDisplayAssetId: 'generated-99',
                },
                'plain-7': {
                    createdAt: 1000,
                    updatedAt: 2000,
                },
            })

            const result = await getComfyVideoDisplayAssetIds(['original-42', 'plain-7', 'original-42'])

            expect(inlayMeta.getInlayMetasBatch).toHaveBeenCalledWith(['original-42', 'plain-7'])
            expect(result).toEqual({ 'original-42': 'generated-99' })
        })
    })
})
