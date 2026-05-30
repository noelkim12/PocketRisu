import { describe, expect, it } from 'vitest'
import { parseWorkflowJson, readWorkflowInputLink } from './workflowPreview'

describe('workflowPreview graph parsing', () => {
    it('extracts ComfyUI API links and layers nodes top-down', () => {
        const result = parseWorkflowJson(JSON.stringify({
            '1': { inputs: { ckpt_name: 'model.safetensors' }, class_type: 'CheckpointLoaderSimple', _meta: { title: 'Model' } },
            '2': { inputs: { text: '{{risu_prompt}}', clip: ['1', 1] }, class_type: 'CLIPTextEncode' },
            '3': { inputs: { text: '{{risu_neg}}', clip: ['1', 1] }, class_type: 'CLIPTextEncode' },
            '4': { inputs: { width: 1024, height: 1024, batch_size: 1 }, class_type: 'EmptyLatentImage' },
            '5': { inputs: { model: ['1', 0], positive: ['2', 0], negative: ['3', 0], latent_image: ['4', 0] }, class_type: 'KSampler' },
            '6': { inputs: { samples: ['5', 0], vae: ['1', 2] }, class_type: 'VAEDecode' },
            '7': { inputs: { images: ['6', 0] }, class_type: 'PreviewImage' },
        }))

        expect(result.ok).toBe(true)
        expect(result.edges).toHaveLength(9)
        expect(result.sources).toEqual(['1', '4'])
        expect(result.sinks).toEqual(['7'])
        expect(result.layers).toEqual([
            ['1', '4'],
            ['2', '3'],
            ['5'],
            ['6'],
            ['7'],
        ])
    })

    it('keeps scalar arrays out of graph links unless they reference an existing node', () => {
        const result = parseWorkflowJson(JSON.stringify({
            '1': { inputs: { values: [512, 768] }, class_type: 'SizeLiteral' },
            '2': { inputs: { image: ['missing', 0] }, class_type: 'PreviewImage' },
        }))

        expect(readWorkflowInputLink([512, 768])).toBeUndefined()
        expect(result.edges).toHaveLength(0)
        expect(result.warnings).toEqual(['Node 2.image references missing node missing.'])
    })
})
