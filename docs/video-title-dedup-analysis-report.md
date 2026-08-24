# Video Title Naming And MD5 Deduplication Analysis

## Goal

Improve `stephen video download` so page downloads use a parsed page title as the automatic filename and repeated content is handled deterministically.

## Confirmed Behavior

- Page inputs use the parsed page title when one is available.
- Direct MP4 and HLS inputs keep the existing media-URL filename fallback because no page title is available.
- Explicit `outputPath` remains exact and takes precedence over automatic naming.
- Every download is written to a temporary sibling file before it becomes visible as the final output.
- The completed temporary file is hashed with MD5.
- Automatic naming compares the temporary file only with the same-title family in the output directory:
  - `Title.ext`
  - `Title (2).ext`
  - `Title (3).ext`
- If an existing same-title file has the same MD5, the temporary file is removed and the result returns the existing path with `status: "already_downloaded"`.
- If all existing same-title files have different MD5 values, the temporary file is moved to the first free numbered name and the result returns `status: "downloaded"`.
- An explicit output path with different existing content fails with a precise output-conflict error instead of silently overwriting or adding a suffix.
- Failed downloads, failed hashes, and failed finalization remove temporary files and never create a false final result.

## Current Architecture

The current implementation has three boundaries:

1. Sniff providers find media candidates but return no page metadata.
2. `VideoDownloadService` selects a candidate and routes it to a driver.
3. Download drivers infer an output filename directly from the media URL and write the final file.

This means title metadata is lost before routing, and drivers cannot coordinate duplicate handling across MP4 and HLS downloads.

## Design

### Page Metadata

Add a provider result containing `candidates` and optional `title`. HTTP sniffing uses `node-html-parser` to extract title metadata from structured HTML, preferring Open Graph title, then the document title. Browser sniffing reads the final page title after navigation. `VideoSniffResult` carries the optional title without adding it to each media candidate.

### Filename Policy

Add a focused pure filename helper that:

- collapses repeated whitespace;
- removes Windows-invalid and control characters;
- trims trailing spaces and periods;
- protects Windows reserved names;
- limits the base name so the extension and numeric suffix remain valid;
- falls back to the existing media URL name when no usable title exists.

### Download Finalization

Add one download file manager responsible for temporary path creation, streaming MD5 calculation, same-title discovery, duplicate comparison, conflict handling, final rename, and cleanup. Drivers continue to own network transfer only. The service plans the automatic target, passes the temporary path to the selected driver, and finalizes the completed file through the file manager.

This keeps title and duplicate policy out of individual drivers and avoids three divergent implementations.

### Result Contract

Extend `VideoDownloadResult` with:

- `status: "downloaded" | "already_downloaded"`;
- `md5: string`.

Keep existing fields unchanged. JSON output exposes the new fields. Table output adds status while retaining `mediaType` and `outputPath`.

## Error Handling

- `VIDEO_OUTPUT_CONFLICT`: explicit output path exists with different content.
- Existing download and sniff errors remain unchanged.
- Temporary cleanup is attempted for every failure path.
- Cleanup failure is reported as structured error detail and does not masquerade as a successful download.

## Testing

Use TDD for:

- HTTP and browser title extraction;
- title propagation through sniff service;
- Windows filename sanitization;
- title fallback for direct media input;
- temporary-path routing;
- same-MD5 duplicate reuse;
- different-MD5 numeric suffixing;
- explicit-path conflict behavior;
- temporary cleanup after failure;
- JSON and table output compatibility.

Run the full project checks:

```bash
npm run check
npm test
npm run coverage
npm run build
```

## Repository And Release

- Implementation base: `github/master` at `3158055` (`0.1.4`).
- New version: `0.1.5`.
- The discarded local modifications are intentionally not restored.
- The final verified change is committed once and pushed to `github/master`.
