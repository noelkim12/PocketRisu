import { describe, expect, it } from 'vitest'
import type { EbookReaderStatus, ReaderSpeakerRole } from '../readerTypes'

describe('ebook reader types', () => {
    it('defines overlay status values', () => {
        const values: EbookReaderStatus[] = ['idle', 'capturing', 'paginating', 'ready', 'error']
        expect(values).toEqual(['idle', 'capturing', 'paginating', 'ready', 'error'])
    })

    it('defines speaker role values', () => {
        const values: ReaderSpeakerRole[] = ['user', 'char', 'unknown']
        expect(values).toEqual(['user', 'char', 'unknown'])
    })
})
