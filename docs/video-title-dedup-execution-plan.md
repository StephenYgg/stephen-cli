# Video Title Naming And MD5 Deduplication Execution Plan

**Goal:** Use parsed page titles for automatic video filenames and resolve same-title downloads through post-download MD5 comparison.

**Architecture:** Sniff providers return page metadata with media candidates. `VideoDownloadService` routes every selected media candidate through a single file manager that supplies a temporary path and atomically resolves the final title, duplicate status, MD5, and numeric suffix after the driver finishes.

**Tech Stack:** TypeScript, Node.js filesystem and crypto APIs, node-html-parser, Commander, Zod, Playwright, Vitest, tsup.

---

## File Map

- Create `src/video/sniff/title.ts`: parse and normalize page titles.
- Create `src/video/download/file-manager.ts`: sanitize names, create temporary paths, hash files, compare same-title files, finalize or clean up.
- Create `tests/video/title.test.ts`: title extraction and normalization tests.
- Create `tests/video/file-manager.test.ts`: real temporary-directory tests for MD5, suffixes, conflicts, and cleanup.
- Modify `src/video/types.ts`: add provider metadata and download result status/MD5.
- Modify `src/video/sniff/http-provider.ts`: return candidates plus parsed HTML title.
- Modify `src/video/sniff/browser-provider.ts`: return browser candidates plus title.
- Modify `src/video/sniff/service.ts`: preserve provider title in `VideoSniffResult`.
- Modify `src/video/runtime.ts`: read `page.title()` and return browser provider metadata.
- Modify `src/video/download/service.ts`: plan temporary targets and finalize all driver results through the file manager.
- Modify `src/video/command.ts`: construct and inject the file manager; show status in table output.
- Modify related tests under `tests/video` and `tests/cli` for the new contracts.
- Modify `package.json` and `package-lock.json`: add `node-html-parser` and bump `0.1.4` to `0.1.5`.
- Modify `README.md`: document title naming, duplicate semantics, and the fact that MD5 comparison happens after transfer.

## Task 1: Page Title Metadata

- [ ] Add failing tests showing HTTP priority `og:title` then `<title>`, whitespace normalization, missing title, and browser title propagation.

```ts
expect(extractVideoTitleFromHtml('<meta property="og:title" content="  Example   Video  "><title>Fallback</title>'))
  .toBe('Example Video');
expect(extractVideoTitleFromHtml('<title>Document Title</title>')).toBe('Document Title');
expect(extractVideoTitleFromHtml('<html></html>')).toBeUndefined();
```

- [ ] Run the focused tests and verify they fail because title metadata is not implemented.

```bash
npx vitest run tests/video/title.test.ts tests/video/http-provider.test.ts tests/video/sniff.service.test.ts tests/video/runtime.test.ts
```

- [ ] Add the structured HTML parser dependency.

```bash
npm install node-html-parser
```

- [ ] Add `VideoSniffProviderResult` and optional `title` on `VideoSniffResult`, then update provider and runtime signatures consistently.

```ts
export interface VideoSniffProviderResult {
  candidates: VideoCandidate[];
  title?: string;
}

export interface VideoSniffResult extends VideoSniffProviderResult {
  mode: Exclude<VideoSniffMode, 'auto'>;
  sourceUrl: string;
}
```

- [ ] Implement `extractVideoTitleFromHtml()` and browser `page.title()` capture without changing candidate ranking.
- [ ] Re-run the focused tests and verify they pass.

## Task 2: Filename And MD5 Finalization

- [ ] Add failing real-filesystem tests for Windows sanitization, title fallback, same-MD5 reuse, different-MD5 numbering, explicit-path conflict, and temporary cleanup.

```ts
const plan = manager.plan({
  mediaType: 'mp4',
  outputDir: tempDir,
  sourceUrl: 'https://cdn.example.com/video.mp4',
  title: 'A: Video?'
});
expect(plan.targetPath).toBe(join(tempDir, 'A Video.mp4'));

await writeFile(plan.tempPath, Buffer.from('same'));
await writeFile(plan.targetPath, Buffer.from('same'));
await expect(manager.finalize(plan)).resolves.toMatchObject({
  status: 'already_downloaded',
  outputPath: plan.targetPath
});
```

- [ ] Run `npx vitest run tests/video/file-manager.test.ts` and verify the missing module failure.
- [ ] Implement `VideoDownloadFileManager` using sibling `.part` files, streaming `createHash('md5')`, same-title family matching, first-free numeric suffixes, and precise explicit-path conflict errors.
- [ ] Ensure cleanup uses exact temporary paths and ignores only file-not-found; surface all other filesystem failures.
- [ ] Re-run `tests/video/file-manager.test.ts` and verify all cases pass.

## Task 3: Download Service Integration

- [ ] Add failing service tests proving title passes into the file plan, drivers receive only the temporary output path, duplicate results return the existing path, and driver failures call cleanup.

```ts
expect(fileManager.plan).toHaveBeenCalledWith({
  mediaType: 'm3u8',
  outputDir: 'D:/videos',
  sourceUrl: 'https://cdn.example.com/master.m3u8',
  title: 'Example Video'
});
expect(hlsDriver.download).toHaveBeenCalledWith(expect.objectContaining({
  outputPath: 'D:/videos/.example.part'
}));
```

- [ ] Run `npx vitest run tests/video/download.service.test.ts` and verify the new assertions fail.
- [ ] Refactor repeated route returns into one private candidate-download path that plans, invokes the correct driver, finalizes, and cleans up on error.
- [ ] Extend `VideoDownloadResult` with required `status` and `md5`, keeping existing fields stable.
- [ ] Re-run service tests and verify all routes pass.

## Task 4: CLI Output And Compatibility

- [ ] Add failing CLI and output tests for JSON `status`/`md5`, table `status`, title-based path, duplicate notification, and unchanged direct-URL fallback.
- [ ] Run `npx vitest run tests/cli/video-command.test.ts tests/video/output.test.ts` and verify the new assertions fail.
- [ ] Inject the real file manager in `registerVideoCommands()` and add status to table rendering.
- [ ] Update all existing test fixtures to return the required result fields without weakening assertions.
- [ ] Re-run all video and CLI tests.

```bash
npx vitest run tests/video tests/cli/video-command.test.ts
```

## Task 5: Documentation And Version

- [ ] Update `README.md` with title naming, `Title (n)` collision behavior, strict post-download MD5 semantics, and `already_downloaded` output.
- [ ] Bump package and lockfile versions without creating a tag or commit.

```bash
npm version patch --no-git-tag-version
```

- [ ] Verify both package files report `0.1.5` and no unrelated metadata changed.

## Task 6: Full Verification, Install, Commit, And Push

- [ ] Run static checks, all tests, full coverage, and build from a clean dependency installation.

```bash
npm ci
npm run check
npm test
npm run coverage
npm run build
```

- [ ] Inspect `git diff --check`, `git diff --stat`, and the complete diff for secrets, unrelated changes, placeholder text, and accidental generated files.
- [ ] Install the verified local package globally and confirm the global package is `0.1.5`.

```bash
npm install -g .
npm list -g @stephenyang/stephen --depth=0
```

- [ ] Commit the complete verified change once.

```bash
git add README.md package.json package-lock.json src tests docs
git commit -m "feat: name and deduplicate video downloads"
```

- [ ] Push the commit to GitHub master and verify local/remote commit identity.

```bash
git push github master
git status --short --branch
git ls-remote github refs/heads/master
```
