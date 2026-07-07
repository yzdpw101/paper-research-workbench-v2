# IEEE Xplore fast path (Reasonix v2)

> **Code pattern**: Multi-line evaluate code must use `--code-file` (shell-safe). Write code to a temp file first, then pass it. Short one-liners without `$`/`{}` can use `--code`.

## Preflight

v2 uses `browser-launcher.js` + `config.js` — no separate `init.js` needed. ${SKILL_DIR} resolves automatically in Reasonix. Run `init-wizard.js` once if `.state/.setup-done` is missing.

## URL parameter reference

Base search URL:
```
https://ieeexplore.ieee.org/search/searchresult.jsp?queryText=<encoded>
```

|   Parameter | Format | Example   |
|  -----------|--------|---------  |
|   ContentType | `&refinements=ContentType:<Type>` | `ContentType:Conferences`   |
|   Year range | `&ranges=<YYYY>_<YYYY>_Year` | `&ranges=2024_2025_Year`   |
|   Single year | `&ranges=<YYYY>_<YYYY>_Year` | `&ranges=2024_2024_Year`   |
|   Pagination | `&pageNumber=<N>` | `&pageNumber=2`   |
|   Rows per page | `&rowsPerPage=<N>` | `&rowsPerPage=50` (10/25/50/75/100)   |

**⚠️ Year uses `&ranges=`, NOT `&refinements=`.**

### ContentType values

|   Value | Description   |
|  -------|-------------  |
|   `Conferences` | Conference papers   |
|   `Journals` | Journal papers   |
|   `Magazines` | Magazines   |
|   `Books` | Books   |
|   `Early Access Articles` | Early access   |
|   `Standards` | Standards   |

> Omitting = all types. ContentType cannot be combined; Year and ContentType can be used together.

## Search flow (progressive)

```
1. Search → ieee-search.js → show titles + arnumbers (compact list)
2. User says "摘要" → add --expand → show snippets
3. User says "详情/第X篇" → ieee-detail.js → show metadata
4. User says "下载" → ieee-download.js → file directly
```

**Display**: Directly output the returned JSON. Do not analyze or recommend.

## Search — one-shot CLI

```
node "${SKILL_DIR}/scripts/ieee-search.js" \
  --q "<keyword>" \
  --type Journals \
  --year "2024-2025" \
  --rows 25 \
  --page 1 \
  --expand
```

- `--q` : Search keyword (**required**)
- `--type` : ContentType — Journals | Conferences | Magazines | Books | Early Access Articles | Standards
- `--year` : Year range, e.g. "2023-2025" or "2024"
- `--rows` : Results per page (10/25/50/75/100), default 25
- `--page` : Page number, default 1
- `--expand` : Expand abstracts; each item gets a `.snippet` field

**Output**: JSON with `accessReady`, `totalResults`, `perPage`, `totalPages`, `items[]` (each with `arnumber`, `title`, `url`, and optional `snippet`).

### Login handling

`ieee-search.js` calls `ensureLoggedIn(page, 'ieee')` which:
1. Checks storageState for saved session
2. If expired, attempts auto-login from credential-vault
3. If no credentials, proceeds anyway (IP authentication may work)
4. Returns `accessReady` boolean — log a warning if false but don't block

## Detail page — metadata extraction

```
node "${SKILL_DIR}/scripts/ieee-detail.js" --arnumber <n>
```

Extracts: title, authors, abstract, publishedIn, pubDate, doi, keywords (author + IEEE). **Does not extract full text.**

## PDF download

> **Download precondition**: Verify access before triggering download. If detail page shows "Purchase PDF" or "Sign in to access", do not attempt.

```
node "${SKILL_DIR}/scripts/ieee-download.js" \
  --arnumber <n> \
  --save-as "<output-path>.pdf" \
  --timeout 60000
```

- `--arnumber` : Paper arnumber (**required**)
- `--save-as` : Output path (optional; defaults to `.state/downloads/<auto-name>.pdf`)
- `--timeout` : Download timeout in ms, default 60000. For CDP mode, uses fallback file-system polling (every 500ms, max --timeout).

Uses `page.goto(stampPDF)` with browser cookies for direct download. In CDP mode (`--connect-existing`), `page.on('download')` may not fire — falls back to polling the browser's download directory from Preferences. Output JSON includes `download.path`.

## Figures

See dedicated reference: `ieee/figures.md`.

```
node "${SKILL_DIR}/scripts/ieee-figures.js" \
  --arnumber <n> \
  --out-dir "./figures" \
  --parallel 5
```

## Parallel search (multi-keyword)

```
node "${SKILL_DIR}/scripts/parallel-search.js" \
  --q "keyword1,keyword2,keyword3" \
  --platform ieee \
  --parallel 3 \
  --expand
```

- `--q` : Comma-separated keywords (**required** unless `--queries`)
- `--platform` : `ieee` (default) or `wanfang`
- `--queries` : JSON file with `[{keyword, platform, options}]` objects (alternative to `--q`)
- `--parallel` : Max context-pool concurrency (default: from config)
- `--expand` : Expand abstracts (IEEE only)
- `--no-snippet` : Omit abstracts (Wanfang only)

## Parallel download (multi-paper)

```
node "${SKILL_DIR}/scripts/parallel-download.js" \
  --arnumbers "1234567,2345678,3456789" \
  --save-dir "~/Desktop/papers" \
  --parallel 3
```

- `--arnumbers` : Comma-separated IEEE article numbers (**required** unless `--arnumbers-file`)
- `--arnumbers-file` : JSON file with `[n1, n2, ...]` or `{arnumbers: [...]}`
- `--save-dir` : Output directory (**required**)
- `--parallel` : Max concurrent downloads (default: from config)
- `--timeout` : Per-download timeout in ms (default: from config)

## Global parameters (apply to all IEEE commands)

|   Parameter | Description   |
|  -----------|-------------  |
|   `--browser <firefox\|chrome\|msedge>` | Temporary browser override   |
|   `--no-kill` | Don't kill zombie processes after completion   |
|   `--connect-existing` | Connect via CDP to already-running browser   |
|   `--cdp-port <n>` | CDP port (default 9222)   |
|   `--debug` | Verbose logging   |
|   `--no-close` | Keep browser open after completion   |

## IEEE login

If search/detail/download fails due to authentication:
1. Run `node "${SKILL_DIR}/scripts/init-wizard.js"` to store IEEE credentials (encrypted with AES-256-GCM)
2. `auto-login.js` automatically fills login forms when needed
3. CDP mode: connect to user's logged-in Chrome (`--connect-existing`)

## Don'ts

- Never `request.fetch` / `route.fetch` for downloads — use `page.goto(stampPDF)` + browser cookies
- Never bypass `ensureLoggedIn` — it handles IP auth gracefully
- Don't search and download in one step — separate CLI calls
- Don't use `--browser firefox` on non-institutional networks (will error)
- Never use URL `p=<N>` for Wanfang pagination — only for IEEE
