export type ChatIndex = number
export type EbookReaderStatus = 'idle' | 'capturing' | 'paginating' | 'ready' | 'error'
export type ReaderHeaderInfo = { chatIndex: ChatIndex; name?: string; thumbnailUrl?: string }
export type ReaderContentButtonDescriptor = { chatIndex: ChatIndex; ordinal: number; selector: string }
export type CapturedReaderMessage = { chatIndex: ChatIndex; chatId?: string; html: string; headerInfo: ReaderHeaderInfo; contentHash: string; contentButtons?: ReaderContentButtonDescriptor[] }
export type CaptureChunkResult = { requestedIndices: ChatIndex[]; capturedMessages: CapturedReaderMessage[]; missingIndices: ChatIndex[]; partial: boolean; startIndex: ChatIndex; endIndex: ChatIndex }
export type ReaderPage = { pageIndex: number; chatIndex: ChatIndex; html: string }
export type ReaderAction = 'copy' | 'tts' | 'bookmark' | 'translate' | 'reroll' | 'unreroll' | 'remove' | 'jumpToOriginal' | 'editInOriginal'
