# stephen

`stephen` is a personal TypeScript CLI for scriptable, agent-friendly workflows. It returns structured JSON by default and provides table output for list-style commands when human inspection is more convenient.

Current npm package:

```bash
npm install -g @stephenyang/stephen
```

After installation:

```bash
stephen --help
```

## Command Overview

```text
stephen ak       Manage local API key records
stephen config   Manage local CLI configuration
stephen disk     Preview or run conservative disk cleanup
stephen video    Sniff, download, and compress video media
stephen 36kr     Fetch 36kr article details and channel lists
stephen toutiao  Fetch Toutiao channels, searches, author feeds, and article details
stephen hn       Fetch Hacker News top/new/best/search lists
```

Output rules:

- JSON is the default output format. Successful responses usually look like `{ "ok": true, "data": ... }`.
- Errors are rendered as JSON, usually `{ "ok": false, "error": { "code": "...", "message": "..." } }`.
- List and summary commands support `-t` / `--table`, equivalent to `--format table`.
- Detail commands stay JSON-only so downstream scripts can consume the full structure.

## Requirements

- Node.js 22+
- npm
- `curl`: used by `36kr` with browser-like request headers
- Playwright Chromium: required by `toutiao` and browser-based `video` sniffing
- `ffmpeg`: required by `video compress`

Install the Playwright browser:

```bash
npx playwright install chromium
```

## `ak` API Key Manager

`ak` stores API key records in a local SQLite database. Keys are encrypted at rest and masked by default in normal output. Record IDs are generated as `sha1(key)`, so records can be retrieved by either ID or original key.

Record fields:

```text
env
userId
userName
email
phone
key
```

Recommended environment names:

```text
bzy-pre
bzy-prod
op-pre
op-prod
gitee
github
gitlab
```

Custom machine-friendly `env` values are also supported.

### Common Commands

Add a record:

```bash
stephen ak add -e github -k ghp_xxx -n Stephen -m stephen@example.com
```

Get a record by key or ID:

```bash
stephen ak get -e github -k ghp_xxx
stephen ak get --id fdb441954fd4573a72fb5a52ce359e0d77c3fa0e
```

List records:

```bash
stephen ak list
stephen ak list -e github
stephen ak list -q ste -f userName,email
stephen ak list -q ghp_ -f key -t
```

Update metadata:

```bash
stephen ak update -e github -k ghp_xxx -n StephenYang
stephen ak update --id fdb441954fd4573a72fb5a52ce359e0d77c3fa0e -m new@example.com
```

Delete a record:

```bash
stephen ak delete --id fdb441954fd4573a72fb5a52ce359e0d77c3fa0e --yes
```

### `ak` Options

```text
-e, --env <env>             Environment
-u, --user-id <userId>      User ID
-n, --user-name <userName>  User name
-m, --email <email>         Email
-p, --phone <phone>         Phone number
-k, --key <key>             API key
-q, --query <query>         Fuzzy query
-f, --field <field>         Search fields, comma-separated
--id <id>                   Record ID
--limit <limit>             List limit, default 50, max 100
--raw-key                   Show the full key
--format <json|table>       Output format
-t, --table                 Table output
```

Query rules:

- `userId`, `userName`, `email`, and `phone` support fuzzy search.
- `key` search only supports low-sensitivity prefix matching.
- Keys are masked unless `--raw-key` is passed.

## `config` Local Configuration

`config` manages local machine configuration. Currently supported key:

```text
ak.dbPath
```

List all config entries:

```bash
stephen config list
stephen config list -t
```

Get one config entry:

```bash
stephen config get ak.dbPath
```

Set the API key database path:

```bash
stephen config set ak.dbPath /Users/stephen/iDrive/stephen/ak.db
```

`ak.dbPath` resolution priority:

1. Local config file value `ak.dbPath`
2. `STEPHEN_AK_DB_PATH`
3. Legacy environment variable `STEPHEN_CLI_AK_DB_PATH`
4. Default `env-paths` data directory

## `disk cleanup`

`disk cleanup` provides conservative Windows disk cleanup. It previews by default and does not delete anything unless `--apply` is passed.

Cleanup levels:

```text
safe    Default level for common safe caches
dev     safe + common developer caches
system  safe + Windows system cleanup actions; apply mode requires --confirm
deep    dev + system, and reports the largest 100 Downloads entries without deleting them
```

Common commands:

```bash
stephen disk cleanup
stephen disk cleanup -t
stephen disk cleanup --level dev
stephen disk cleanup --level deep
stephen disk cleanup --apply
stephen disk cleanup --level system --apply --confirm
stephen disk cleanup --apply --disable-hibernate
```

Notes:

- `--apply` is required before cleanup actions are executed.
- `system` and `deep` require `--confirm` in apply mode.
- Downloads is never deleted; `deep` only reports the largest files and directories for manual review.

## `video`

`video` can sniff video candidates from pages or media URLs, download `mp4` / `m3u8`, and compress local videos with `ffmpeg`.

### Sniff

```bash
stephen video sniff https://example.com/watch/123
stephen video sniff https://example.com/watch/123 -t
stephen video sniff https://example.com/watch/123 --mode browser
stephen video sniff https://cdn.example.com/video.mp4 --mode http
```

Modes:

```text
auto     Default; try browser sniffing first, then HTTP fallback
browser  Use Playwright to capture page network requests
http     Inspect direct URLs, HTML, and scripts without browser execution
```

Proxy examples:

```bash
stephen video sniff https://example.com/watch/123 --proxy http://127.0.0.1:7890
stephen video sniff https://example.com/watch/123 --skip-proxy
```

### Download

```bash
stephen video download https://cdn.example.com/video.mp4
stephen video download https://cdn.example.com/master.m3u8
stephen video download https://example.com/watch/123 --mode browser
stephen video download https://example.com/watch/123 --output-dir ./downloads
```

Download behavior:

- Direct `mp4` URLs are downloaded directly.
- `m3u8` playlists are fetched with their segments and merged into one output.
- Page URLs are sniffed first, then a compatible candidate is downloaded.

### Compress

```bash
stephen video compress ./input.mov
stephen video compress ./input.mov --output-path ./output.mp4
stephen video compress ./input.mov --resolution 1280x720
stephen video compress ./input.mov --video-bitrate 1800k --audio-bitrate 64k
stephen video compress ./input.mov -t
```

Default compression settings:

```text
container      mp4
video codec    libx265
audio codec    aac
audio bitrate  64k
```

## `36kr`

`36kr` uses curl to request 36kr pages and pagination APIs with browser-like headers. It supports article details and two information channels.

### Article Details

Pass the article ID; the CLI builds the article detail URL:

```bash
stephen 36kr article 3853011900142848
```

Output includes:

```text
id
url
title
summary
author
publishTime
content.html
content.paragraphs
coverImage
images
imageSources
stats
organizations
newestArticles
relatedArticles
latestArticles
nextArticle
request
```

### Channel Lists

Supported channels:

```text
AI
technology
```

Examples:

```bash
stephen 36kr list AI
stephen 36kr list technology --pages 3
stephen 36kr list AI --pages 2 -t
```

Notes:

- `--pages` must be between 1 and 20.
- The first page is parsed from `https://36kr.com/information/<channel>/`.
- Later pages use the `pageCallback` from the page and call the 36kr pagination API.

List output includes:

```text
channel
items[].id
items[].title
items[].summary
items[].authorName
items[].publishTime
items[].url
meta.fetchedPages
meta.totalItems
meta.hasNextPage
meta.nextPageCallback
request
```

## `toutiao`

`toutiao` uses Playwright Chromium to collect Toutiao page data. This is useful for pages that require real browser execution, scrolling, or response interception.

### Channels and Keyword Feeds

Supported sources:

```text
tech
AI
光刻机
芯片
半导体
```

Examples:

```bash
stephen toutiao list tech
stephen toutiao list AI --pages 2
stephen toutiao list 光刻机 -t
stephen toutiao list 芯片 --pages 3 -t
stephen toutiao list 半导体
```

Notes:

- `tech` uses the Toutiao technology channel.
- `AI`, `光刻机`, `芯片`, and `半导体` use Toutiao search feeds.
- `--pages` must be between 1 and 5.

List output includes:

```text
source
keyword
items[].id
items[].title
items[].abstract
items[].authorName
items[].commentCount
items[].publishTime
items[].url
items[].sourceUrl
hasMore
next
meta
```

### Article Details

Pass either an article ID or URL:

```bash
stephen toutiao article 1234567890
stephen toutiao article https://www.toutiao.com/article/1234567890/
```

Output includes:

```text
id
url
title
authorName
publishTimeText
content.text
content.paragraphs
request
```

### Author Feeds

Pass either an author token or author homepage URL:

```bash
stephen toutiao author MS4wLjABAAAAVuJhKsIQSKk3hYJ17wPrQUnUnNT7WadBo4T-QiyRk0A
stephen toutiao author 'https://www.toutiao.com/c/user/token/MS4wLjABAAAAVuJhKsIQSKk3hYJ17wPrQUnUnNT7WadBo4T-QiyRk0A/?source=profile'
stephen toutiao author MS4wLjABAAAAVuJhKsIQSKk3hYJ17wPrQUnUnNT7WadBo4T-QiyRk0A --pages 2 -t
```

Fetch article details for the author feed:

```bash
stephen toutiao author MS4wLjABAAAAVuJhKsIQSKk3hYJ17wPrQUnUnNT7WadBo4T-QiyRk0A --with-content
```

Notes:

- `--pages` must be between 1 and 5.
- Without `--with-content`, the command returns only the author article list.
- With `--with-content`, article details are fetched and returned in the `articles` field.

## `hn` Hacker News

`hn` supports Hacker News story lists and search. JSON is the default output format, and list output supports `-t`.

Top stories:

```bash
stephen hn top
stephen hn top --limit 10 -t
```

New stories:

```bash
stephen hn new
stephen hn new --limit 20
```

Best stories:

```bash
stephen hn best
stephen hn best --limit 20 -t
```

Search:

```bash
stephen hn search openai
stephen hn search "browser automation" --sort date --limit 20 -t
```

Options:

```text
--limit <limit>              Number of items, 1 to 100
--sort <relevance|date>      Search sort, default relevance
--format <json|table>        Output format
-t, --table                  Table output
```

Output includes:

```text
items[].id
items[].title
items[].author
items[].score
items[].commentCount
items[].time
items[].url
meta
```

## Commands With Table Output

These commands are useful for quick human inspection:

```bash
stephen ak list -t
stephen config list -t
stephen disk cleanup -t
stephen video sniff <url> -t
stephen video download <url> -t
stephen video compress <file> -t
stephen 36kr list AI -t
stephen toutiao list tech -t
stephen toutiao author <token-or-url> -t
stephen hn top -t
stephen hn new -t
stephen hn best -t
stephen hn search openai -t
```

## Development

Install dependencies:

```bash
npm install
```

Type check:

```bash
npm run check
```

Run tests:

```bash
npm test
```

Run coverage:

```bash
npm run coverage
```

Build:

```bash
npm run build
```

Run the built CLI locally:

```bash
node dist/index.js --help
```

Preview the npm package:

```bash
npm pack --dry-run
```

## Publishing

The current package is a scoped public package:

```text
@stephenyang/stephen
```

Publish:

```bash
npm publish --access public
```

Verify after publishing:

```bash
npm view @stephenyang/stephen version --json
```
