import { afterEach, describe, expect, it, vi } from 'vitest'
import { collectComfyOutputs, patchLoadImageNode, replaceWorkflowText, randomizeWorkflowSeeds } from './comfyWorkflow'

afterEach(() => {
    vi.restoreAllMocks()
})

describe('comfyWorkflow helpers', () => {
    it('patches LoadImage node input without mutating the original workflow', () => {
        const workflow = { '32': { inputs: { image: 'old.png' }, class_type: 'LoadImage' } }
        const patched = patchLoadImageNode(workflow, '32', 'image', 'new.png')

        expect(workflow['32'].inputs.image).toBe('old.png')
        expect(patched['32'].inputs.image).toBe('new.png')
    })

    it('replaces prompt placeholders recursively across string inputs', () => {
        const workflow = { '21': { inputs: { text: 'A {{risu_prompt}} / {{risu_neg}}' } } }
        const patched = replaceWorkflowText(workflow, 'cat', 'blur')
        expect(patched['21'].inputs.text).toBe('A cat / blur')
    })

    it('randomizes numeric seed fields', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.5)
        const workflow = { '18': { inputs: { noise_seed: 1, seed: 2 } } }
        const patched = randomizeWorkflowSeeds(workflow)
        expect(patched['18'].inputs.seed).toBe(500000000)
        expect(patched['18'].inputs.noise_seed).toBe(500000000)
    })

    it('collects VHS gifs before broad media fallback', () => {
        const entry = {
            outputs: {
                '30': { gifs: [{ filename: 'wan.webp', type: 'temp', format: 'image/webp' }] },
                '99': { images: [{ filename: 'preview.png', type: 'output' }] }
            }
        }
        expect(collectComfyOutputs(entry)[0]).toEqual({ filename: 'wan.webp', type: 'temp', format: 'image/webp' })
    })
})
