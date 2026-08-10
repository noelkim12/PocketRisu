import type { Chat, Message } from "../storage/database.svelte"

/**
 * Retains the newest chat messages without mutating the source array.
 * @param messages - Ordered chat history from oldest to newest.
 * @param limit - Maximum number of entries to retain; zero retains none.
 * @returns A new array containing at most the newest `limit` entries.
 */
export function retainRecentMessages(messages: Message[], limit: number): Message[] {
    return limit === 0 ? [] : messages.slice(-limit)
}

/**
 * Applies a chat's configured automatic retention limit when it can remove history.
 * @param chat - Mutable chat record whose optional limit controls retention.
 * @returns Whether older message entries were removed.
 */
export function applyMessageRetention(chat: Chat): boolean {
    const limit = chat.messageRetentionLimit
    if (typeof limit !== "number" || !Number.isInteger(limit) || limit <= 0 || chat.message.length <= limit) {
        return false
    }

    chat.message = retainRecentMessages(chat.message, limit)
    return true
}
