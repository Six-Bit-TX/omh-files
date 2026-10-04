/**
 * Turning a file the reader dropped or picked into the base64 payload the
 * upload endpoint takes.
 *
 * The wire carries bytes as base64 in both directions (`readAll` answers with
 * it, `upload` takes it), so this is the download path's decode run backwards.
 * Nothing here streams: a file is read whole, encoded whole, and sent as one
 * request under the Host's complete-file cap.
 */
/**
 * Encode bytes as base64.
 *
 * `String.fromCharCode` is applied in blocks rather than to the whole array:
 * spreading a multi-megabyte array into an argument list overflows the call
 * stack, which is exactly the size an upload reaches.
 * @param bytes - the file's contents.
 * @returns the base64 payload to send.
 */
export declare function base64Of(bytes: Uint8Array): string;
/**
 * The files one drop or pick carried.
 *
 * A `DataTransfer.files` is a `FileList` and a file input's `files` is one too,
 * but the two arrive through different handlers; this is the one shape both are
 * read as.
 * @param files - what the gesture delivered, or null when it carried none.
 * @returns the files, in the order they were offered.
 */
export declare function filesOf(files: FileList | null): File[];
//# sourceMappingURL=upload.d.ts.map