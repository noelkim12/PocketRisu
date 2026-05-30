<script lang="ts">
    import SettingPage from "src/lib/UI/GUI/SettingPage.svelte";
    import CheckInput from "src/lib/UI/GUI/CheckInput.svelte";
    import TextInput from "src/lib/UI/GUI/TextInput.svelte";
    import TextAreaInput from "src/lib/UI/GUI/TextAreaInput.svelte";
    import NumberInput from "src/lib/UI/GUI/NumberInput.svelte";
    import SelectInput from "src/lib/UI/GUI/SelectInput.svelte";
    import OptionInput from "src/lib/UI/GUI/OptionInput.svelte";
    import Accordion from "src/lib/UI/Accordion.svelte";
    import { DBState } from "src/ts/stores.svelte";
    import { notifyError, notifySuccess } from "src/ts/alert";
    import type { ComfyVideoWorkflowPreset } from "src/ts/storage/database.svelte";
    import ComfyWorkflowNodes from "src/lib/Setting/Components/ComfyWorkflowNodes.svelte";
    import { isRecord, isWorkflowNode, parseWorkflowJson, type WorkflowNode, type WorkflowNodeSummary } from "src/ts/comfy/workflowPreview";

    const workflowParseResult = $derived(parseWorkflowJson(DBState.db.comfyConfig.video.workflow));
    const selectedWorkflowPreset = $derived(getSelectedWorkflowPreset());

    /**
     * Creates a stable browser-side preset ID for newly added ComfyUI workflows.
     * @returns Unique preset identifier for the current settings list.
     */
    function createPresetId() {
        return `workflow-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }

    /**
     * Finds the currently selected workflow preset from persisted video settings.
     * @returns Matching preset, or undefined when using legacy single-workflow fields.
     */
    function getSelectedWorkflowPreset() {
        return DBState.db.comfyConfig.video.workflowPresets.find((preset) => preset.id === DBState.db.comfyConfig.video.selectedWorkflowPresetId);
    }

    /**
     * Copies a preset into the editable workflow fields used by preview and validation.
     * @param preset Preset whose workflow and node settings should become active.
     * @returns Nothing.
     */
    function applyWorkflowPreset(preset: ComfyVideoWorkflowPreset) {
        DBState.db.comfyConfig.video.workflow = preset.workflow;
        DBState.db.comfyConfig.video.inputImageNodeId = preset.inputImageNodeId;
        DBState.db.comfyConfig.video.inputImageField = preset.inputImageField;
        DBState.db.comfyConfig.video.outputNodeId = preset.outputNodeId;
        DBState.db.comfyConfig.video.positivePrompt = preset.positivePrompt;
        DBState.db.comfyConfig.video.negativePrompt = preset.negativePrompt;
    }

    /**
     * Selects a preset and mirrors it into the existing video workflow fields.
     * @returns Nothing.
     */
    function handlePresetChange() {
        const preset = getSelectedWorkflowPreset();
        if (preset) {
            applyWorkflowPreset(preset);
        }
    }

    /**
     * Saves the current editable workflow fields back into the selected preset.
     * @returns Nothing.
     */
    function syncSelectedPresetFromCurrent() {
        const preset = getSelectedWorkflowPreset();
        if (!preset) return;

        preset.workflow = DBState.db.comfyConfig.video.workflow;
        preset.inputImageNodeId = DBState.db.comfyConfig.video.inputImageNodeId;
        preset.inputImageField = DBState.db.comfyConfig.video.inputImageField;
        preset.outputNodeId = DBState.db.comfyConfig.video.outputNodeId;
        preset.positivePrompt = DBState.db.comfyConfig.video.positivePrompt;
        preset.negativePrompt = DBState.db.comfyConfig.video.negativePrompt;
    }

    /**
     * Replaces one node inside the current ComfyUI video workflow JSON.
     * @param nodeId Workflow node ID to update.
     * @param node Edited ComfyUI API node object.
     * @returns Nothing.
     */
    function updateWorkflowNode(nodeId: string, node: WorkflowNode) {
        try {
            const workflow: unknown = JSON.parse(DBState.db.comfyConfig.video.workflow);
            if (!isRecord(workflow)) {
                throw new Error("Workflow JSON must be an object keyed by node ID");
            }

            workflow[nodeId] = node;
            DBState.db.comfyConfig.video.workflow = JSON.stringify(workflow, null, 2);
            syncSelectedPresetFromCurrent();
            notifySuccess(`Updated ComfyUI node ${nodeId}`);
        } catch (error) {
            notifyError(`Could not update ComfyUI node ${nodeId}: ${error}`);
        }
    }

    /**
     * Adds the current workflow settings as a new selectable preset.
     * @returns Nothing.
     */
    function addWorkflowPreset() {
        const presetNumber = DBState.db.comfyConfig.video.workflowPresets.length + 1;
        const preset: ComfyVideoWorkflowPreset = {
            id: createPresetId(),
            name: `Workflow ${presetNumber}`,
            workflow: DBState.db.comfyConfig.video.workflow,
            inputImageNodeId: DBState.db.comfyConfig.video.inputImageNodeId,
            inputImageField: DBState.db.comfyConfig.video.inputImageField,
            outputNodeId: DBState.db.comfyConfig.video.outputNodeId,
            positivePrompt: DBState.db.comfyConfig.video.positivePrompt,
            negativePrompt: DBState.db.comfyConfig.video.negativePrompt,
        };

        DBState.db.comfyConfig.video.workflowPresets = [...DBState.db.comfyConfig.video.workflowPresets, preset];
        DBState.db.comfyConfig.video.selectedWorkflowPresetId = preset.id;
        applyWorkflowPreset(preset);
    }

    /**
     * Duplicates the selected preset so the user can safely experiment with variants.
     * @returns Nothing.
     */
    function duplicateWorkflowPreset() {
        const preset = getSelectedWorkflowPreset();
        if (!preset) return;

        const copied: ComfyVideoWorkflowPreset = {
            ...preset,
            id: createPresetId(),
            name: `${preset.name} Copy`,
        };

        DBState.db.comfyConfig.video.workflowPresets = [...DBState.db.comfyConfig.video.workflowPresets, copied];
        DBState.db.comfyConfig.video.selectedWorkflowPresetId = copied.id;
        applyWorkflowPreset(copied);
    }

    /**
     * Removes the selected preset and activates the next remaining preset when possible.
     * @returns Nothing.
     */
    function deleteWorkflowPreset() {
        const preset = getSelectedWorkflowPreset();
        if (!preset) return;

        const remaining = DBState.db.comfyConfig.video.workflowPresets.filter((item) => item.id !== preset.id);
        DBState.db.comfyConfig.video.workflowPresets = remaining;

        const nextPreset = remaining[0];
        DBState.db.comfyConfig.video.selectedWorkflowPresetId = nextPreset?.id ?? "";
        if (nextPreset) {
            applyWorkflowPreset(nextPreset);
        }
    }

    function selectInputNode(node: WorkflowNodeSummary, field?: string) {
        DBState.db.comfyConfig.video.inputImageNodeId = node.id;
        DBState.db.comfyConfig.video.inputImageField = field ?? suggestedInputField(node);
        syncSelectedPresetFromCurrent();
    }

    function suggestedInputField(node: WorkflowNodeSummary) {
        if (node.inputFieldCandidates.includes("image")) {
            return "image";
        }
        return node.inputFieldCandidates[0] ?? DBState.db.comfyConfig.video.inputImageField;
    }

    function selectOutputNode(node: WorkflowNodeSummary) {
        DBState.db.comfyConfig.video.outputNodeId = node.id;
        syncSelectedPresetFromCurrent();
    }

    function validateWorkflow() {
        try {
            const workflow: unknown = JSON.parse(DBState.db.comfyConfig.video.workflow);
            if (!isRecord(workflow)) {
                throw new Error("Workflow JSON must be an object keyed by node ID");
            }

            const inputNode = workflow[DBState.db.comfyConfig.video.inputImageNodeId];
            const outputNode = workflow[DBState.db.comfyConfig.video.outputNodeId];

            if (!isWorkflowNode(inputNode) || !isRecord(inputNode.inputs)) {
                throw new Error(`Input image node ${DBState.db.comfyConfig.video.inputImageNodeId} is missing`);
            }
            if (!isWorkflowNode(outputNode) || !isRecord(outputNode.inputs)) {
                throw new Error(`Output node ${DBState.db.comfyConfig.video.outputNodeId} is missing`);
            }

            notifySuccess("ComfyUI video workflow looks valid");
        } catch (error) {
            notifyError(`Invalid ComfyUI video workflow: ${error}`);
        }
    }
</script>

<SettingPage title="ComfyUI Video">
    <Accordion name="ComfyUI Video Workflow" styled disabled>
        <div class="flex items-center mt-2 mb-4">
            <CheckInput bind:check={DBState.db.comfyConfig.video.enabled} name="Enable ComfyUI video generation" />
        </div>

        <span class="text-textcolor mt-2">ComfyUI URL</span>
        <TextInput className="mt-2" marginBottom placeholder="http://127.0.0.1:8188" bind:value={DBState.db.comfyUiUrl}/>

        <div class="mb-4 rounded-lg border border-bordercolor bg-background2 p-3">
            <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                    <span class="text-textcolor text-sm font-semibold">Workflow Presets</span>
                    <span class="text-textcolor2 text-xs block">Save multiple ComfyUI API workflows and choose which one is used for video generation.</span>
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

            {#if DBState.db.comfyConfig.video.workflowPresets.length > 0}
                <span class="text-textcolor mt-2 text-xs">Selected Preset</span>
                <SelectInput className="mt-2 mb-3" bind:value={DBState.db.comfyConfig.video.selectedWorkflowPresetId} onchange={handlePresetChange}>
                    {#each DBState.db.comfyConfig.video.workflowPresets as preset (preset.id)}
                        <OptionInput value={preset.id}>{preset.name}</OptionInput>
                    {/each}
                </SelectInput>

                {#if selectedWorkflowPreset}
                    <span class="text-textcolor mt-2 text-xs">Preset Name</span>
                    <TextInput className="mt-2" marginBottom bind:value={selectedWorkflowPreset.name}/>
                {/if}
            {:else}
                <div class="rounded-md border border-bordercolor bg-background px-3 py-2 text-xs text-textcolor2">
                    No presets yet. Paste or edit a workflow below, then click “Add current as preset”.
                </div>
            {/if}
        </div>

        <span class="text-textcolor mt-2">Workflow API JSON</span>
        <TextAreaInput className="mt-2" margin="bottom" bind:value={DBState.db.comfyConfig.video.workflow} onInput={syncSelectedPresetFromCurrent}/>

        <ComfyWorkflowNodes
            result={workflowParseResult}
            selectedInputNodeId={DBState.db.comfyConfig.video.inputImageNodeId}
            selectedInputField={DBState.db.comfyConfig.video.inputImageField}
            selectedOutputNodeId={DBState.db.comfyConfig.video.outputNodeId}
            showInputActions
            showOutputActions
            onSelectInput={selectInputNode}
            onSelectOutput={selectOutputNode}
            onUpdateNode={updateWorkflowNode}
            emptyTitle="Workflow Nodes"
            emptyDescription="Select detected input/output nodes, or keep using the manual fields below."
        />

        <div class="grid grid-cols-2 gap-3">
            <div>
                <span class="text-textcolor mt-2">Input Image Node ID</span>
                <TextInput className="mt-2" marginBottom bind:value={DBState.db.comfyConfig.video.inputImageNodeId} oninput={syncSelectedPresetFromCurrent}/>
            </div>
            <div>
                <span class="text-textcolor mt-2">Input Image Field</span>
                <TextInput className="mt-2" marginBottom bind:value={DBState.db.comfyConfig.video.inputImageField} oninput={syncSelectedPresetFromCurrent}/>
            </div>
            <div>
                <span class="text-textcolor mt-2">Output Node ID</span>
                <TextInput className="mt-2" marginBottom bind:value={DBState.db.comfyConfig.video.outputNodeId} oninput={syncSelectedPresetFromCurrent}/>
            </div>
            <div>
                <span class="text-textcolor mt-2">Timeout (sec)</span>
                <NumberInput className="mt-2" marginBottom min={1} max={900} bind:value={DBState.db.comfyConfig.video.timeout}/>
            </div>
        </div>

        <span class="text-textcolor mt-2">Positive Prompt</span>
        <TextAreaInput className="mt-2" margin="bottom" bind:value={DBState.db.comfyConfig.video.positivePrompt} onInput={syncSelectedPresetFromCurrent}/>

        <span class="text-textcolor mt-2">Negative Prompt</span>
        <TextAreaInput className="mt-2" margin="bottom" bind:value={DBState.db.comfyConfig.video.negativePrompt} onInput={syncSelectedPresetFromCurrent}/>

        <span class="text-textcolor mt-2">Output Format</span>
        <span class="text-textcolor2 text-xs mb-4 block">
            Fixed to animated WebP (image/webp). The bundled WAN workflow uses VHS_VideoCombine node 30 with format: "image/webp", and its result is read from outputs["30"].gifs[0].
        </span>

        <span class="text-textcolor mt-2">Hover Button Duration (ms)</span>
        <NumberInput className="mt-2" marginBottom min={0} max={10000} bind:value={DBState.db.comfyConfig.video.hoverButtonDurationMs}/>

        <button class="px-3 py-2 rounded-md bg-darkbutton hover:bg-textcolor2 transition-colors" onclick={validateWorkflow}>
            Validate Workflow
        </button>
    </Accordion>
</SettingPage>
