import { describe, expect, it } from 'vitest'
import type { EbookReaderStatus } from '../readerTypes'

describe('ebook reader types', () => {
    it('defines overlay status values', () => {
        const values: EbookReaderStatus[] = ['idle', 'capturing', 'paginating', 'ready', 'error']
        expect(values).toEqual(['idle', 'capturing', 'paginating', 'ready', 'error'])
    })
})
