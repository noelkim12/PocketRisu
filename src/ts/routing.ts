// Settings menu routing.
//
// `SettingsMenuIndex` is a numeric store consumed throughout
// `Settings.svelte`'s ~25 menu entries. Migrating to string IDs everywhere is
// a large refactor that touches every entry; instead this module exposes
// named constants for the existing numeric values so external callers can
// avoid magic numbers (and the bugs that come with reorderings).
//
// Add an entry here whenever a new settings page is added in
// `Settings.svelte`. Internal `Settings.svelte` switches still use the raw
// number — that file is the source of truth and changes there should update
// this map too.

import { OtherBotSubmenuIndex, settingsOpen, SettingsMenuIndex, SystemSubmenuIndex } from "./stores.svelte";

export const SettingsRoute = {
    None: -1 as const,
    Migration: 0 as const,
    ChatBot: 1 as const,
    OtherBots: 2 as const,
    Display: 3 as const,
    Plugin: 4 as const,
    Files: 5 as const,
    Advanced: 6 as const,
    GlobalLoreBook: 8 as const,
    GlobalRegex: 9 as const,
    Language: 10 as const,
    Accessibility: 11 as const,
    Persona: 12 as const,
    Prompt: 13 as const,
    Module: 14 as const,
    Hotkey: 15 as const,
    RemoteAccess: 21 as const,
    System: 22 as const,
    InlayImageGallery: 23 as const,
    ComfyVideo: 24 as const,
    ComfyImage: 25 as const,
    DevPanel: 99 as const,
} as const;

export type SettingsRouteValue = (typeof SettingsRoute)[keyof typeof SettingsRoute];

/** Sub-tab indices inside the System settings page. */
export const SystemTab = {
    Dashboard: 0 as const,
    Backups: 1 as const,
    Logs: 2 as const,
} as const;

export type SystemTabValue = (typeof SystemTab)[keyof typeof SystemTab];

/** Sub-tab indices inside the Other Bots settings page. */
export const OtherBotsTab = {
    LongTermMemory: 0 as const,
    Tts: 1 as const,
    EmotionImage: 2 as const,
    ImageGeneration: 3 as const,
} as const;

export type OtherBotsTabValue = (typeof OtherBotsTab)[keyof typeof OtherBotsTab];

/**
 * Open the settings panel and navigate to a specific page (and optional
 * System sub-tab). Use this from anywhere in the app that needs to deep-link
 * into settings.
 */
export function openSettings(route: SettingsRouteValue, subTab?: SystemTabValue | OtherBotsTabValue) {
    SettingsMenuIndex.set(route);
    if (subTab !== undefined && route === SettingsRoute.System) {
        SystemSubmenuIndex.set(subTab as SystemTabValue);
    }
    if (subTab !== undefined && route === SettingsRoute.OtherBots) {
        OtherBotSubmenuIndex.set(subTab as OtherBotsTabValue);
    }
    settingsOpen.set(true);
}
