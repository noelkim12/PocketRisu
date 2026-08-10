import { describe, expect, it } from "vitest"

import type { Chat, Message } from "../storage/database.svelte"
import { applyMessageRetention, retainRecentMessages } from "./chatRetention"

const messages: Message[] = [
    { role: "user", data: "first" },
    { role: "char", data: "second" },
    { role: "user", data: "third" },
]

describe("retainRecentMessages", () => {
    it("keeps the newest entries when the limit is smaller than the history", () => {
        const retained = retainRecentMessages(messages, 2)

        expect(retained.map((message) => message.data)).toEqual(["second", "third"])
    })

    it("keeps all entries when the limit covers the history", () => {
        expect(retainRecentMessages(messages, 3)).toEqual(messages)
        expect(retainRecentMessages(messages, 5)).toEqual(messages)
    })

    it("returns no entries for a zero limit", () => {
        expect(retainRecentMessages(messages, 0)).toEqual([])
    })

    it("does not mutate the source history", () => {
        retainRecentMessages(messages, 1)

        expect(messages.map((message) => message.data)).toEqual(["first", "second", "third"])
    })
})

describe("applyMessageRetention", () => {
    it("applies a configured positive limit to a chat", () => {
        const chat: Chat = {
            message: [...messages],
            note: "",
            name: "Retention test",
            localLore: [],
            messageRetentionLimit: 2,
        }

        expect(applyMessageRetention(chat)).toBe(true)
        expect(chat.message.map((message) => message.data)).toEqual(["second", "third"])
    })

    it("leaves a chat unchanged when automatic retention is disabled", () => {
        const chat: Chat = {
            message: [...messages],
            note: "",
            name: "Unlimited test",
            localLore: [],
        }

        expect(applyMessageRetention(chat)).toBe(false)
        expect(chat.message).toHaveLength(3)
    })
})
