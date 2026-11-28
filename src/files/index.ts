// File handling for the workbench: framework-independent, tested in Node.
export {
  createDocument, documentLabel, editDocument, hasUnsavedChanges, noteDownloadStarted,
  replaceDocument, saveStatus, suggestedFileName,
} from './document';
export type { DownloadRecord, SaveStatus, SourceDocument, SourceOrigin } from './document';
export { cleanFileName, MAX_OPEN_BYTES, readSourceFile, toMclFileName } from './sourceFile';
export type { ReadableFile, ReadOutcome } from './sourceFile';
export { sourceBlob, startDownload } from './download';
export type { DownloadEnvironment, DownloadLink } from './download';
export { LatestRequest } from './latestRequest';
