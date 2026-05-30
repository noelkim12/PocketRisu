import { describe, expect, it, vi } from 'vitest'

// Mock heavy reactive modules so loading database.svelte.ts doesn't trigger
// unrelated $effect chains that fail in a stripped-down test environment.
vi.mock('../globalApi.svelte', () => ({
    forageStorage: { realStorage: null },
    downloadFile: () => {},
    saveAsset: () => {},
}))

vi.mock('../stores.svelte', () => ({
    DBState: { db: undefined },
    selectedCharID: { subscribe: () => () => {} },
    selIdState: { subscribe: () => () => {} },
}))

const { setDatabase } = await import('./database.svelte')

describe('ComfyUI config defaults', () => {
    it('backfills comfyConfig.video for older databases', () => {
        const db = {
            comfyConfig: {
                workflow: '',
                posNodeID: '',
                posInputName: 'text',
                negNodeID: '',
                negInputName: 'text',
                timeout: 30,
            },
        } as any

        setDatabase(db)

        expect(db.comfyConfig.selectedWorkflowPresetId).toBe('')
        expect(db.comfyConfig.workflowPresets).toEqual([])
        expect(db.comfyConfig.video).toEqual({
            enabled: false,
            selectedWorkflowPresetId: '',
            workflowPresets: [],
            workflow: '',
            inputImageNodeId: '32',
            inputImageField: 'image',
            outputNodeId: '30',
            positivePrompt: '',
            negativePrompt: '',
            timeout: 300,
            hoverButtonDurationMs: 3000,
        })
    })

    it('does not overwrite existing video settings', () => {
        const db = {
            comfyConfig: {
                workflow: 'legacy-wf',
                posNodeID: '1',
                posInputName: 'text',
                negNodeID: '2',
                negInputName: 'text',
                timeout: 30,
                video: {
                    enabled: true,
                    workflow: '{"30":{}}',
                    inputImageNodeId: '33',
                    inputImageField: 'image2',
                    outputNodeId: '31',
                    positivePrompt: 'hello',
                    negativePrompt: 'world',
                    timeout: 600,
                    hoverButtonDurationMs: 5000,
                },
            },
        } as any

        setDatabase(db)

        expect(db.comfyConfig.selectedWorkflowPresetId).toBe('default')
        expect(db.comfyConfig.workflowPresets).toEqual([{
            id: 'default',
            name: 'Default workflow',
            workflow: 'legacy-wf',
            thumbnailPrompt: '',
            thumbnailInlayId: '',
        }])
        expect(db.comfyConfig.video).toEqual({
            enabled: true,
            selectedWorkflowPresetId: 'default',
            workflowPresets: [{
                id: 'default',
                name: 'Default workflow',
                workflow: '{"30":{}}',
                inputImageNodeId: '33',
                inputImageField: 'image2',
                outputNodeId: '31',
                positivePrompt: 'hello',
                negativePrompt: 'world',
            }],
            workflow: '{"30":{}}',
            inputImageNodeId: '33',
            inputImageField: 'image2',
            outputNodeId: '31',
            positivePrompt: 'hello',
            negativePrompt: 'world',
            timeout: 600,
            hoverButtonDurationMs: 5000,
        })
    })

    it('backfills ComfyUI image preset thumbnail fields', () => {
        const db = {
            comfyConfig: {
                selectedWorkflowPresetId: 'preset-a',
                workflowPresets: [{
                    id: 'preset-a',
                    name: 'Preset A',
                    workflow: '{"1":{}}',
                }],
                workflow: '',
                posNodeID: '',
                posInputName: 'text',
                negNodeID: '',
                negInputName: 'text',
                timeout: 30,
            },
        } as any

        setDatabase(db)

        expect(db.comfyConfig.workflowPresets[0]).toEqual({
            id: 'preset-a',
            name: 'Preset A',
            workflow: '{"1":{}}',
            thumbnailPrompt: '',
            thumbnailInlayId: '',
        })
    })
})
