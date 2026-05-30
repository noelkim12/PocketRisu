<script lang="ts">
    import SettingPage from "src/lib/UI/GUI/SettingPage.svelte";
    import TextInput from "src/lib/UI/GUI/TextInput.svelte";
    import TextAreaInput from "src/lib/UI/GUI/TextAreaInput.svelte";
    import NumberInput from "src/lib/UI/GUI/NumberInput.svelte";
    import SelectInput from "src/lib/UI/GUI/SelectInput.svelte";
    import OptionInput from "src/lib/UI/GUI/OptionInput.svelte";
    import Accordion from "src/lib/UI/Accordion.svelte";
    import Help from "src/lib/Others/Help.svelte";
    import ComfyWorkflowNodes from "src/lib/Setting/Components/ComfyWorkflowNodes.svelte";
    import { language } from "src/lang";
    import { notifyError, notifySuccess } from "src/ts/alert";
    import { isRecord, parseWorkflowJson, type WorkflowNode } from "src/ts/comfy/workflowPreview";
    import { getInlayAsset, setInlayAsset } from "src/ts/process/files/inlays";
    import { generateComfyImageFromWorkflow } from "src/ts/process/stableDiff";
    import type { ComfyImageWorkflowPreset } from "src/ts/storage/database.svelte";
    import { DBState } from "src/ts/stores.svelte";

    let isThumbnailGenerating = $state(false);
    const selectedWorkflowPreset = $derived(getSelectedWorkflowPreset());
    const workflowParseResult = $derived(parseWorkflowJson(DBState.db.comfyConfig.workflow));

    /**
     * Creates a stable ID for a newly saved ComfyUI image workflow preset.
     * @returns Unique preset ID within the current database settings.
     */
    function createPresetId() {
        return `image-workflow-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }

    /**
     * Finds the active ComfyUI image workflow preset selected in settings.
     * @returns Selected image workflow preset, or undefined when no preset is selected.
     */
    function getSelectedWorkflowPreset() {
        return DBState.db.comfyConfig.workflowPresets.find((preset) => preset.id === DBState.db.comfyConfig.selectedWorkflowPresetId);
    }

    /**
     * Copies a ComfyUI image workflow preset into the editable workflow field.
     * @param preset Preset to activate in the settings form.
     * @returns Nothing.
     */
    function applyWorkflowPreset(preset: ComfyImageWorkflowPreset) {
        DBState.db.comfyConfig.workflow = preset.workflow;
    }

    /**
     * Handles preset selection changes by activating the selected workflow JSON.
     * @returns Nothing.
     */
    function handlePresetChange() {
        const preset = getSelectedWorkflowPreset();
        if (preset) {
            applyWorkflowPreset(preset);
        }
    }

    /**
     * Saves edits in the workflow field back to the selected image preset.
     * @returns Nothing.
     */
    function syncSelectedPresetFromCurrent() {
        const preset = getSelectedWorkflowPreset();
        if (!preset) return;

        preset.workflow = DBState.db.comfyConfig.workflow;
    }

    /**
     * Replaces one node inside the current ComfyUI image workflow JSON.
     * @param nodeId Workflow node ID to update.
     * @param node Edited ComfyUI API node object.
     * @returns Nothing.
     */
    function updateWorkflowNode(nodeId: string, node: WorkflowNode) {
        try {
            const workflow: unknown = JSON.parse(DBState.db.comfyConfig.workflow);
            if (!isRecord(workflow)) {
                throw new Error("Workflow JSON must be an object keyed by node ID");
            }

            workflow[nodeId] = node;
            DBState.db.comfyConfig.workflow = JSON.stringify(workflow, null, 2);
            syncSelectedPresetFromCurrent();
            notifySuccess(`Updated ComfyUI node ${nodeId}`);
        } catch (error) {
            notifyError(`Could not update ComfyUI node ${nodeId}: ${error}`);
        }
    }

    /**
     * Converts a generated image data URI into a browser Blob for inlay storage.
     * @param dataUri Image data URI returned by the ComfyUI generation request.
     * @returns Blob and detected extension for the generated image.
     */
    async function dataUriToImageBlob(dataUri: string) {
        const mimeType = dataUri.match(/^data:([^;]+);base64,/)?.[1] ?? 'image/png';
        const extension = mimeType.split('/')[1] || 'png';
        const response = await fetch(dataUri);
        return {
            blob: await response.blob(),
            extension,
        };
    }

    /**
     * Generates a ComfyUI preview thumbnail for the selected workflow preset and stores it in the inlay store.
     * @returns Nothing.
     */
    async function generatePresetThumbnail() {
        const preset = getSelectedWorkflowPreset();
        if (!preset) return;

        const thumbnailPrompt = preset.thumbnailPrompt?.trim();
        if (!thumbnailPrompt) {
            notifyError('Enter a thumbnail prompt first. It will replace {{risu_prompt}} in the workflow.');
            return;
        }

        if (!DBState.db.comfyUiUrl) {
            notifyError('ComfyUI URL is not configured.');
            return;
        }

        isThumbnailGenerating = true;
        try {
            const generatedImage = await generateComfyImageFromWorkflow({
                workflow: preset.workflow,
                genPrompt: thumbnailPrompt,
                neg: '',
                baseUrl: DBState.db.comfyUiUrl,
                timeoutSec: DBState.db.comfyConfig.timeout,
            });

            if (!generatedImage) return;

            const { blob, extension } = await dataUriToImageBlob(generatedImage);
            const thumbnailId = `comfy-preset-thumbnail-${preset.id}-${Date.now().toString(36)}`;
            await setInlayAsset(thumbnailId, {
                name: `${preset.name || preset.id} thumbnail`,
                data: blob,
                ext: extension,
                type: 'image',
            });
            preset.thumbnailInlayId = thumbnailId;
            notifySuccess('ComfyUI preset thumbnail generated.');
        } catch (error) {
            notifyError(`Failed to generate ComfyUI preset thumbnail: ${error}`);
        } finally {
            isThumbnailGenerating = false;
        }
    }

    /**
     * Clears the selected workflow preset thumbnail reference without deleting the stored inlay asset.
     * @returns Nothing.
     */
    function clearPresetThumbnail() {
        const preset = getSelectedWorkflowPreset();
        if (!preset) return;

        preset.thumbnailInlayId = '';
    }

    /**
     * Adds the current ComfyUI image workflow as a new selectable preset.
     * @returns Nothing.
     */
    function addWorkflowPreset() {
        const presetNumber = DBState.db.comfyConfig.workflowPresets.length + 1;
        const preset: ComfyImageWorkflowPreset = {
            id: createPresetId(),
            name: `Workflow ${presetNumber}`,
            workflow: DBState.db.comfyConfig.workflow,
            thumbnailPrompt: '',
            thumbnailInlayId: '',
        };

        DBState.db.comfyConfig.workflowPresets = [...DBState.db.comfyConfig.workflowPresets, preset];
        DBState.db.comfyConfig.selectedWorkflowPresetId = preset.id;
        applyWorkflowPreset(preset);
    }

    /**
     * Duplicates the active ComfyUI image workflow preset for variant editing.
     * @returns Nothing.
     */
    function duplicateWorkflowPreset() {
        const preset = getSelectedWorkflowPreset();
        if (!preset) return;

        const copied: ComfyImageWorkflowPreset = {
            ...preset,
            id: createPresetId(),
            name: `${preset.name} Copy`,
        };

        DBState.db.comfyConfig.workflowPresets = [...DBState.db.comfyConfig.workflowPresets, copied];
        DBState.db.comfyConfig.selectedWorkflowPresetId = copied.id;
        applyWorkflowPreset(copied);
    }

    /**
     * Deletes the active ComfyUI image workflow preset and activates the next one.
     * @returns Nothing.
     */
    function deleteWorkflowPreset() {
        const preset = getSelectedWorkflowPreset();
        if (!preset) return;

        const remaining = DBState.db.comfyConfig.workflowPresets.filter((item) => item.id !== preset.id);
        DBState.db.comfyConfig.workflowPresets = remaining;

        const nextPreset = remaining[0];
        DBState.db.comfyConfig.selectedWorkflowPresetId = nextPreset?.id ?? '';
        if (nextPreset) {
            applyWorkflowPreset(nextPreset);
        }
    }

    /**
     * Validates that the current image workflow is parseable ComfyUI API workflow JSON.
     * @returns Nothing.
     */
    function validateWorkflow() {
        if (workflowParseResult.ok) {
            notifySuccess('ComfyUI image workflow looks valid');
            return;
        }

        notifyError(`Invalid ComfyUI image workflow: ${workflowParseResult.message}`);
    }
</script>

<SettingPage title="ComfyUI Image">
    <Accordion name="ComfyUI Image Workflow" styled disabled>
        <span class="text-textcolor mt-2">Image Generation Provider</span>
        <SelectInput className="mt-2 mb-4" bind:value={DBState.db.sdProvider}>
            <OptionInput value="">None</OptionInput>
            <OptionInput value="comfyui">ComfyUI</OptionInput>
        </SelectInput>
        <span class="text-textcolor2 text-xs mb-4 block">Select ComfyUI here to use these workflow presets for image generation.</span>

        <span class="text-textcolor mt-2">ComfyUI {language.providerURL} <Help key="comfyUrl"/></span>
        <TextInput className="mt-2" marginBottom placeholder="http://127.0.0.1:8188" bind:value={DBState.db.comfyUiUrl}/>

        <div class="mb-4 rounded-lg border border-bordercolor bg-background2 p-3">
            <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                    <span class="text-textcolor text-sm font-semibold">Workflow Presets</span>
                    <span class="text-textcolor2 text-xs block">Save multiple ComfyUI API workflows and choose which one is used for image generation.</span>
                </div>
                <div class="flex flex-wrap gap-2">
                    <button class="rounded-md bg-darkbutton px-2 py-1 text-xs text-textcolor transition-colors hover:bg-textcolor2" onclick={addWorkflowPreset}>
                        Add current as preset
                    </button>
                    <button class="rounded-md bg-darkbutton px-2 py-1 text-xs text-textcolor transition-colors hover:bg-textcolor2 disabled:opacity-50" disabled={!selectedWorkflowPreset} onclick={duplicateWorkflowPreset}>
                        Duplicate
                    </button>
                    <button class="rounded-md bg-darkbutton px-2 py-1 text-xs text-textcolor transition-colors hover:bg-textcolor2 disabled:opacity-50" disabled={!selectedWorkflowPreset} onclick={deleteWorkflowPreset}>
                        Delete
                    </button>
                </div>
            </div>

            {#if DBState.db.comfyConfig.workflowPresets.length > 0}
                <span class="text-textcolor mt-2 text-xs">Selected Preset</span>
                <SelectInput className="mt-2 mb-3" bind:value={DBState.db.comfyConfig.selectedWorkflowPresetId} onchange={handlePresetChange}>
                    {#each DBState.db.comfyConfig.workflowPresets as preset (preset.id)}
                        <OptionInput value={preset.id}>{preset.name}</OptionInput>
                    {/each}
                </SelectInput>

                {#if selectedWorkflowPreset}
                    <span class="text-textcolor mt-2 text-xs">Preset Name</span>
                    <TextInput className="mt-2" marginBottom bind:value={selectedWorkflowPreset.name}/>

                    <div class="mt-3 rounded-md border border-bordercolor bg-background p-3">
                        <div class="mb-2 flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <span class="text-textcolor text-xs font-semibold">Preset Thumbnail</span>
                                <span class="text-textcolor2 text-xs block">Generate a preview with this preset. The prompt replaces <code>{'{{risu_prompt}}'}</code> during the ComfyUI request.</span>
                            </div>
                            {#if selectedWorkflowPreset.thumbnailInlayId}
                                <button class="rounded-md bg-darkbutton px-2 py-1 text-xs text-textcolor transition-colors hover:bg-textcolor2" onclick={clearPresetThumbnail}>
                                    Clear
                                </button>
                            {/if}
                        </div>

                        <div class="flex flex-col gap-3 md:flex-row">
                            <div class="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-md border border-bordercolor bg-background2 text-center text-xs text-textcolor2">
                                {#if selectedWorkflowPreset.thumbnailInlayId}
                                    {#await getInlayAsset(selectedWorkflowPreset.thumbnailInlayId)}
                                        <span>Loading<br />thumbnail...</span>
                                    {:then thumbnail}
                                        {#if thumbnail?.data}
                                            <img src={thumbnail.data} alt="ComfyUI preset thumbnail" class="h-full w-full object-cover" />
                                        {:else}
                                            <span>Thumbnail<br />missing</span>
                                        {/if}
                                    {:catch}
                                        <span>Thumbnail<br />error</span>
                                    {/await}
                                {:else}
                                    <span>No<br />thumbnail</span>
                                {/if}
                            </div>

                            <div class="min-w-0 flex-1">
                                <span class="text-textcolor text-xs">Thumbnail Prompt</span>
                                <TextInput className="mt-2" marginBottom placeholder="portrait, best quality, character concept art" bind:value={selectedWorkflowPreset.thumbnailPrompt}/>
                                <button class="rounded-md bg-darkbutton px-3 py-2 text-sm text-textcolor transition-colors hover:bg-textcolor2 disabled:opacity-50" disabled={isThumbnailGenerating} onclick={generatePresetThumbnail}>
                                    {isThumbnailGenerating ? 'Generating thumbnail...' : 'Generate thumbnail'}
                                </button>
                            </div>
                        </div>
                    </div>
                {/if}
            {:else}
                <div class="rounded-md border border-bordercolor bg-background px-3 py-2 text-xs text-textcolor2">
                    No presets yet. Paste or edit a workflow below, then click “Add current as preset”.
                </div>
            {/if}
        </div>

        <span class="text-textcolor">Workflow API JSON <Help key="comfyWorkflow" /></span>
        <TextAreaInput className="mt-2" margin="bottom" bind:value={DBState.db.comfyConfig.workflow} onInput={syncSelectedPresetFromCurrent}/>

        <ComfyWorkflowNodes
            result={workflowParseResult}
            onUpdateNode={updateWorkflowNode}
            emptyTitle="Workflow Nodes"
            emptyDescription="Preview detected prompt, input, and output nodes for the ComfyUI API workflow. Image generation replaces the risu_prompt placeholder in the workflow at runtime."
        />

        <span class="text-textcolor">Timeout (sec) <Help key="comfyTimeout"/></span>
        <NumberInput className="mt-2" marginBottom bind:value={DBState.db.comfyConfig.timeout} min={1} max={120} />

        <button class="px-3 py-2 rounded-md bg-darkbutton hover:bg-textcolor2 transition-colors" onclick={validateWorkflow}>
            Validate Workflow
        </button>
    </Accordion>
</SettingPage>
