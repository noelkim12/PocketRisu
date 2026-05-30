<script lang="ts">
    import { ImagePlusIcon, Settings2Icon, XIcon } from '@lucide/svelte';
    import OptionInput from 'src/lib/UI/GUI/OptionInput.svelte';
    import SelectInput from 'src/lib/UI/GUI/SelectInput.svelte';
    import { getInlayAsset } from 'src/ts/process/files/inlays';
    import { openSettings, OtherBotsTab, SettingsRoute } from 'src/ts/routing';
    import { DBState } from 'src/ts/stores.svelte';
    import type { ComfyImageWorkflowPreset, ComfyVideoWorkflowPreset } from 'src/ts/storage/database.svelte';

    let open = $state(false);
    let rootEl: HTMLDivElement | undefined = $state();
    let menuEl: HTMLDivElement | undefined = $state();
    let position = $state({ x: 0, y: 0, initialized: false });
    let dragState: {
        pointerId: number;
        startClientX: number;
        startClientY: number;
        startX: number;
        startY: number;
        moved: boolean;
    } | null = null;
    let suppressNextClick = false;
    const selectedImagePreset = $derived(getSelectedImagePreset());
    const selectedVideoPreset = $derived(getSelectedVideoPreset());
    const positionStyle = $derived(position.initialized ? `left: ${position.x}px; top: ${position.y}px;` : 'right: 1rem; bottom: 6rem;');
    let menuStyle = $state('left: 0px; bottom: 56px;');
    const fabSize = 48;
    const menuGap = 8;

    $effect(() => {
        if (typeof window === 'undefined' || position.initialized) return;

        requestAnimationFrame(() => {
            position = {
                x: Math.max(window.innerWidth - 64, 16),
                y: Math.max(window.innerHeight - 128, 16),
                initialized: true,
            };
        });
    });

    $effect(() => {
        if (!open || typeof document === 'undefined') return;

        const handleOutsidePointerDown = (event: PointerEvent) => {
            if (!rootEl?.contains(event.target as Node)) {
                open = false;
            }
        };

        document.addEventListener('pointerdown', handleOutsidePointerDown, true);
        return () => document.removeEventListener('pointerdown', handleOutsidePointerDown, true);
    });

    $effect(() => {
        if (!open || typeof window === 'undefined') return;

        void position.x;
        void position.y;
        requestAnimationFrame(updateMenuPlacement);

        window.addEventListener('resize', updateMenuPlacement);
        return () => window.removeEventListener('resize', updateMenuPlacement);
    });

    /**
     * Places the menu on the side with the most available space around the FAB.
     * It prefers below/right when there is room, then flips above/left and clamps
     * the final menu rectangle inside the viewport.
     * @returns Nothing.
     */
    function updateMenuPlacement() {
        if (!menuEl || typeof window === 'undefined') return;

        const menuRect = menuEl.getBoundingClientRect();
        const menuWidth = Math.min(menuRect.width || 352, window.innerWidth - 16);
        const menuHeight = Math.min(menuRect.height || 320, window.innerHeight - 16);
        const fabLeft = position.initialized ? position.x : window.innerWidth - 64;
        const fabTop = position.initialized ? position.y : window.innerHeight - 128;
        const spaceRight = window.innerWidth - (fabLeft + fabSize);
        const spaceLeft = fabLeft;
        const spaceBelow = window.innerHeight - (fabTop + fabSize);
        const spaceAbove = fabTop;

        const preferRight = spaceRight >= menuWidth + menuGap || spaceRight >= spaceLeft;
        const preferBelow = spaceBelow >= menuHeight + menuGap || spaceBelow >= spaceAbove;

        const preferredLeft = preferRight ? 0 : fabSize - menuWidth;
        const preferredTop = preferBelow ? fabSize + menuGap : -menuHeight - menuGap;
        const absoluteLeft = Math.min(Math.max(fabLeft + preferredLeft, 8), Math.max(window.innerWidth - menuWidth - 8, 8));
        const absoluteTop = Math.min(Math.max(fabTop + preferredTop, 8), Math.max(window.innerHeight - menuHeight - 8, 8));

        menuStyle = `left: ${absoluteLeft - fabLeft}px; top: ${absoluteTop - fabTop}px;`;
    }

    /**
     * Keeps the floating selector within the current viewport after drag movement.
     * @param x Desired left coordinate.
     * @param y Desired top coordinate.
     * @returns Clamped viewport-safe coordinate pair.
     */
    function clampPosition(x: number, y: number) {
        if (typeof window === 'undefined') return { x, y };

        return {
            x: Math.min(Math.max(x, 8), Math.max(window.innerWidth - fabSize - 8, 8)),
            y: Math.min(Math.max(y, 8), Math.max(window.innerHeight - fabSize - 8, 8)),
        };
    }

    /**
     * Starts dragging the tool FAB. A tiny movement threshold prevents accidental drag
     * gestures from toggling the menu.
     * @param event Pointer event from the tool FAB button.
     * @returns Nothing.
     */
    function startDrag(event: PointerEvent) {
        if (event.button !== 0) return;

        const rect = rootEl?.getBoundingClientRect();
        dragState = {
            pointerId: event.pointerId,
            startClientX: event.clientX,
            startClientY: event.clientY,
            startX: rect?.left ?? position.x,
            startY: rect?.top ?? position.y,
            moved: false,
        };

        window.addEventListener('pointermove', handleDragMove);
        window.addEventListener('pointerup', endDrag);
        window.addEventListener('pointercancel', endDrag);
    }

    /**
     * Updates the tool FAB position while dragging.
     * @param event Pointer move event from the active drag gesture.
     * @returns Nothing.
     */
    function handleDragMove(event: PointerEvent) {
        if (!dragState || event.pointerId !== dragState.pointerId) return;

        const deltaX = event.clientX - dragState.startClientX;
        const deltaY = event.clientY - dragState.startClientY;
        if (Math.hypot(deltaX, deltaY) > 4) {
            dragState.moved = true;
            suppressNextClick = true;
        }

        const next = clampPosition(dragState.startX + deltaX, dragState.startY + deltaY);
        position = { ...next, initialized: true };
    }

    /**
     * Finishes the active drag gesture and removes global pointer listeners.
     * @param event Pointer end event.
     * @returns Nothing.
     */
    function endDrag(event: PointerEvent) {
        if (dragState && event.pointerId === dragState.pointerId && dragState.moved) {
            suppressNextClick = true;
        }
        dragState = null;
        window.removeEventListener('pointermove', handleDragMove);
        window.removeEventListener('pointerup', endDrag);
        window.removeEventListener('pointercancel', endDrag);
    }

    /**
     * Toggles the menu unless the preceding pointer gesture was a drag.
     * @returns Nothing.
     */
    function toggleOpen() {
        if (suppressNextClick) {
            suppressNextClick = false;
            return;
        }
        open = !open;
    }

    /**
     * Resolves the active ComfyUI image workflow preset from the global database state.
     * @returns Selected image preset, first image preset, or undefined when none exist.
     */
    function getSelectedImagePreset() {
        return DBState.db.comfyConfig.workflowPresets.find((preset) => preset.id === DBState.db.comfyConfig.selectedWorkflowPresetId)
            ?? DBState.db.comfyConfig.workflowPresets[0];
    }

    /**
     * Resolves the active ComfyUI video workflow preset from the global database state.
     * @returns Selected video preset, first video preset, or undefined when none exist.
     */
    function getSelectedVideoPreset() {
        return DBState.db.comfyConfig.video.workflowPresets.find((preset) => preset.id === DBState.db.comfyConfig.video.selectedWorkflowPresetId)
            ?? DBState.db.comfyConfig.video.workflowPresets[0];
    }

    /**
     * Mirrors an image preset into the legacy editable image workflow field.
     * @param preset Image workflow preset selected from the FAB.
     * @returns Nothing.
     */
    function applyImagePreset(preset?: ComfyImageWorkflowPreset) {
        if (!preset) return;
        DBState.db.comfyConfig.selectedWorkflowPresetId = preset.id;
        DBState.db.comfyConfig.workflow = preset.workflow;
    }

    /**
     * Mirrors a video preset into the legacy editable video workflow fields.
     * @param preset Video workflow preset selected from the FAB.
     * @returns Nothing.
     */
    function applyVideoPreset(preset?: ComfyVideoWorkflowPreset) {
        if (!preset) return;
        DBState.db.comfyConfig.video.selectedWorkflowPresetId = preset.id;
        DBState.db.comfyConfig.video.workflow = preset.workflow;
        DBState.db.comfyConfig.video.inputImageNodeId = preset.inputImageNodeId;
        DBState.db.comfyConfig.video.inputImageField = preset.inputImageField;
        DBState.db.comfyConfig.video.outputNodeId = preset.outputNodeId;
        DBState.db.comfyConfig.video.positivePrompt = preset.positivePrompt;
        DBState.db.comfyConfig.video.negativePrompt = preset.negativePrompt;
    }

    /**
     * Applies the selected image preset after the image workflow dropdown changes.
     * @returns Nothing.
     */
    function handleImagePresetChange() {
        applyImagePreset(getSelectedImagePreset());
    }

    /**
     * Applies the active image workflow immediately when the provider is switched to ComfyUI.
     * @returns Nothing.
     */
    function handleProviderChange() {
        if (DBState.db.sdProvider === 'comfyui') {
            applyImagePreset(getSelectedImagePreset());
        }
    }

    /**
     * Applies the selected video preset after the video workflow dropdown changes.
     * @returns Nothing.
     */
    function handleVideoPresetChange() {
        applyVideoPreset(getSelectedVideoPreset());
    }

    /**
     * Opens the active image provider settings page from the tool FAB.
     * ComfyUI keeps its dedicated workflow page, while other providers deep-link
     * to the common image generation tab in Other Bots settings.
     * @returns Nothing.
     */
    function openImageProviderSettings() {
        open = false;
        if (DBState.db.sdProvider === 'comfyui') {
            openSettings(SettingsRoute.ComfyImage);
            return;
        }

        openSettings(SettingsRoute.OtherBots, OtherBotsTab.ImageGeneration);
    }

    /**
     * Opens the ComfyUI video workflow settings page from the tool FAB.
     * @returns Nothing.
     */
    function openVideoWorkflowSettings() {
        open = false;
        openSettings(SettingsRoute.ComfyVideo);
    }
</script>

<div bind:this={rootEl} class="fixed z-50 size-12" style={positionStyle}>
    {#if open}
        <div bind:this={menuEl} class="absolute w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-bordercolor bg-background2 p-4 text-textcolor shadow-2xl" style={menuStyle}>
            <div class="mb-3 flex items-start justify-between gap-3">
                <div>
                    <div class="text-sm font-semibold">Tool Quick Switch</div>
                    <div class="text-xs text-textcolor2">Image tools and workflow selectors</div>
                </div>
                <button class="rounded-md p-1 text-textcolor2 transition-colors hover:bg-darkbutton hover:text-textcolor" aria-label="Close tool quick switch" onclick={() => open = false}>
                    <XIcon class="size-4" />
                </button>
            </div>

            <div class="mb-1 flex items-center justify-between gap-2">
                <span class="text-xs text-textcolor2">Image Provider</span>
                <button class="rounded-md p-1 text-textcolor2 transition-colors hover:bg-darkbutton hover:text-textcolor" aria-label="Open image provider settings" title="Open image provider settings" onclick={openImageProviderSettings}>
                    <Settings2Icon class="size-4" />
                </button>
            </div>
            <SelectInput className="mt-1 mb-3 w-full" bind:value={DBState.db.sdProvider} onchange={handleProviderChange}>
                <OptionInput value="">None</OptionInput>
                <OptionInput value="webui">Stable Diffusion WebUI</OptionInput>
                <OptionInput value="novelai">Novel AI</OptionInput>
                <OptionInput value="dalle">Dall-E</OptionInput>
                <OptionInput value="stability">Stability API</OptionInput>
                <OptionInput value="fal">Fal.ai</OptionInput>
                <OptionInput value="comfyui">ComfyUI</OptionInput>
                <OptionInput value="Imagen">Imagen</OptionInput>
                <OptionInput value="openai-compat">OpenAI Compatible</OptionInput>
                <OptionInput value="wavespeed">WaveSpeedAI</OptionInput>
                {#if DBState.db.sdProvider === 'comfy'}
                    <OptionInput value="comfy">ComfyUI (Legacy)</OptionInput>
                {/if}
            </SelectInput>

            {#if DBState.db.sdProvider === 'comfyui'}
                <span class="text-xs text-textcolor2">Image Workflow</span>
                {#if DBState.db.comfyConfig.workflowPresets.length > 0}
                    <SelectInput className="mt-1 mb-3 w-full" bind:value={DBState.db.comfyConfig.selectedWorkflowPresetId} onchange={handleImagePresetChange}>
                        {#each DBState.db.comfyConfig.workflowPresets as preset (preset.id)}
                            <OptionInput value={preset.id}>{preset.name}</OptionInput>
                        {/each}
                    </SelectInput>
                    <div class="mb-3 truncate rounded-md bg-background px-2 py-1 text-xs text-textcolor2" title={selectedImagePreset?.name ?? ''}>
                        Active: {selectedImagePreset?.name ?? 'No workflow preset'}
                    </div>
                    {#if selectedImagePreset?.thumbnailInlayId}
                        <div class="mb-3 flex justify-center rounded-md border border-bordercolor bg-background p-2">
                            <div class="size-28 overflow-hidden rounded-md bg-background2">
                            {#await getInlayAsset(selectedImagePreset.thumbnailInlayId)}
                                <div class="flex h-full items-center justify-center text-xs text-textcolor2">Loading thumbnail...</div>
                            {:then thumbnail}
                                {#if thumbnail?.data}
                                    <img src={thumbnail.data} alt="Active ComfyUI workflow thumbnail" class="h-full w-full object-cover" />
                                {:else}
                                    <div class="flex h-full items-center justify-center text-xs text-textcolor2">Thumbnail missing</div>
                                {/if}
                            {:catch}
                                <div class="flex h-full items-center justify-center text-xs text-textcolor2">Thumbnail error</div>
                            {/await}
                            </div>
                        </div>
                    {/if}
                {:else}
                    <div class="mb-3 rounded-md border border-bordercolor bg-background px-3 py-2 text-xs text-textcolor2">
                        No image workflow presets. Add one in ComfyUI Image settings.
                    </div>
                {/if}
            {/if}

            <div class="mb-1 flex items-center justify-between gap-2">
                <span class="text-xs text-textcolor2">Video Workflow</span>
                <button class="rounded-md p-1 text-textcolor2 transition-colors hover:bg-darkbutton hover:text-textcolor" aria-label="Open ComfyUI video settings" title="Open ComfyUI video settings" onclick={openVideoWorkflowSettings}>
                    <Settings2Icon class="size-4" />
                </button>
            </div>
            {#if DBState.db.comfyConfig.video.workflowPresets.length > 0}
                <SelectInput className="mt-1 mb-3 w-full" bind:value={DBState.db.comfyConfig.video.selectedWorkflowPresetId} onchange={handleVideoPresetChange}>
                    {#each DBState.db.comfyConfig.video.workflowPresets as preset (preset.id)}
                        <OptionInput value={preset.id}>{preset.name}</OptionInput>
                    {/each}
                </SelectInput>
                <div class="truncate rounded-md bg-background px-2 py-1 text-xs text-textcolor2" title={selectedVideoPreset?.name ?? ''}>
                    Active: {selectedVideoPreset?.name ?? 'No workflow preset'}
                </div>
            {:else}
                <div class="rounded-md border border-bordercolor bg-background px-3 py-2 text-xs text-textcolor2">
                    No video workflow presets. Add one in ComfyUI Video settings.
                </div>
            {/if}
        </div>
    {/if}

    <button class="relative z-10 flex size-12 cursor-grab touch-none items-center justify-center rounded-full bg-primary text-white shadow-lg transition-colors hover:bg-primary/90 active:cursor-grabbing" aria-label="Open tool quick switch" aria-expanded={open} onpointerdown={startDrag} onclick={toggleOpen}>
        {#if open}
            <Settings2Icon class="size-5" />
        {:else}
            <ImagePlusIcon class="size-5" />
        {/if}
    </button>
</div>
