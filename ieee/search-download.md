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

- Don't search and download in one step — separate CLI calls
- Don't use `--browser firefox` on non-institutional networks (will error)
- Never use URL `p=<N>` for Wanfang pagination — only for IEEE
