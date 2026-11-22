# ITZY 的日常 — LLM Wiki Schema

本檔案定義此專案的目錄結構、資料格式與 AI 維護規範（參考 LLM Wiki 三層架構）。

## 1. 目錄架構

```text
ITZY的日常/
├── AGENTS.md                 # 本 Schema（SOP 與資料規範）
├── .gitignore                # 排除 raw/（避免個人 IG 登入 HTML 外洩至公開 repo）
├── raw/                      # 【Layer 1: Raw Sources】不可變原始資料（僅留本機，不上傳 Git）
│   ├── yeji/                 # 瀏覽器「網頁，完整」存下的 *.html + *_files/
│   ├── lia/
│   ├── ryujin/
│   ├── chaeryeong/
│   └── yuna/
├── assets/
│   └── images/               # 本地化後的乾淨貼文圖片與影片縮圖（<member>/YYYY-MM-DD_<slug>_01.jpg）
├── wiki/                     # 【Layer 2: The Wiki】AI 維護的持久化知識庫
│   ├── index.md              # 全站索引（成員、貼文、主題）
│   ├── log.md                # Append-only 操作日誌
│   └── members/              # 成員個人檔案與動態摘要
│       ├── yeji.md
│       ├── lia.md
│       ├── ryujin.md
│       ├── chaeryeong.md
│       └── yuna.md
├── data/
│   └── diary.js              # 供前端網頁讀取的結構化日記資料（由 AI 同步更新）
├── index.html                # Gallery & 全員時間軸視覺化日記網頁
├── styles.css                # 樣式表
└── app.js                    # 前端互動（視圖切換、搜尋/日期/標籤篩選、Lightbox）
```

## 2. 成員識別碼對照表

| id | 藝名 | 中文 | 韓文 | Instagram |
| --- | --- | --- | --- | --- |
| `itzy` | ITZY | 全員 | 있지 | `@itzy.all.in.us` |
| `yeji` | Yeji | 禮志 | 예지 | `@yezyizhere` |
| `lia` | Lia | 莉亞 | 리아 | `@lia_loves___` |
| `ryujin` | Ryujin | 留真 | 류진 | `@iamfinethankyouandryu` |
| `chaeryeong` | Chaeryeong | 彩領 | 채령 | `@chaerrry0` |
| `yuna` | Yuna | 有娜 | 유나 | `@igotyuandme` |

## 3. 核心操作（Operations）

### A. Ingest（匯入新貼文）
當使用者於 `raw/<member>/` 放入瀏覽器「另存新檔 → 網頁，單一檔案（`.mhtml`）」或「網頁，完整（`.html` + `*_files/`）」並要求解析時：
1. **優先用腳本預處理**（絕不修改 `raw/` 內容）：
   - 若為 `.mhtml`：執行 `python scripts/extract_mhtml.py <mhtml_path> <member_id>`（**有抓到幾張就全留，不加 `--first-only`**），自動抽取 `postUrl`、`date`（轉 `UTC+8`）、`originalText`、`mediaType` 並將正文圖片輸出至 `assets/images/<member>/`。
2. **擷取與補齊欄位**：
   - `date`：貼文發布日期（`YYYY-MM-DD`），優先取 `<time datetime="...">` 或 meta 資訊。
   - `postUrl`：原始 IG 貼文連結（如 `https://www.instagram.com/p/.../` 或 `/reel/.../`）。
   - `mediaType`：`'image'` | `'carousel'` | `'video'`（Reels 或影片貼文）。
   - `originalText`：原始韓文（或混合英文）內文，保留換行、Hashtag 與 Emoji。
   - `translatedText`：流暢自然的**繁體中文**翻譯（保留語氣、梗與 Emoji，不直譯硬翻）。
   - `images`：從對應 `*_files/` 篩選出該貼文的正文照片/影片封面縮圖（排除頭像、側邊推薦圖與 UI icon），複製並命名至 `assets/images/<member>/<YYYY-MM-DD>_<id>_01.<ext>`。
   - `sourceFile`：對應的 `raw/<member>/...` 檔名（僅供本機溯源，不暴露個人路徑）。
   - `tags`：自動標記 2–4 個關鍵標籤（如 `回歸`、`日常`、`私服`、`演唱會`、`Reels`）。
3. **寫入與同步**：
   - 更新 `data/diary.js`（依 `date` 新到舊排序；同 `postUrl` 或同 `id` 不可重複寫入）。
   - 若該成員尚無 `coverImage` 或新貼文為最新，前端會自動取最新一筆貼文首圖作為卡片預覽（亦可手動指定 `member.coverImage`）。
   - 更新對應的 `wiki/members/<member>.md`（新增日記摘要、更新最新動態）。
   - 更新 `wiki/index.md`（更新貼文計數與最新索引）。
   - 追加一筆紀錄至 `wiki/log.md`：`## [YYYY-MM-DD] ingest | <member> - <簡短標題>`。

### B. Query（查詢與彙整）
- 先讀 `wiki/index.md` 定位相關成員或時間區間，再讀取對應檔案回答問題。
- 有價值的跨成員彙整可存成 `wiki/topics/<topic>.md` 並登錄至 `wiki/index.md`。

### C. Lint（健康檢查）
- 檢查 `data/diary.js` 與 `wiki/members/*.md` 筆數是否一致。
- 檢查 `assets/images/` 是否有斷圖或孤兒檔案。
- 檢查部署前 `git status` 確認 `raw/` 沒有被意外追蹤。

## 4. `data/diary.js` 資料結構

```js
window.DIARY_DATA = {
  updatedAt: '2026-11-22',
  members: [
    {
      id: 'yeji',
      name: 'YEJI',
      koName: '예지',
      zhName: '禮志',
      handle: '@yezyizhere',
      accent: '#ff4d79',
      subtitle: 'Leader · Main Dancer',
      coverImage: '', // 留空則自動取該成員最新貼文首圖
    },
  ],
  entries: [
    {
      id: 'yeji-2026-11-22-01',
      memberId: 'yeji',
      date: '2026-11-22',
      mediaType: 'image', // 'image' | 'carousel' | 'video'
      originalText: '...',
      translatedText: '...',
      images: ['assets/images/yeji/2026-11-22_01_01.jpg'],
      tags: ['日常'],
      postUrl: 'https://www.instagram.com/p/EXAMPLE/',
      sourceFile: 'raw/yeji/example.html',
    },
  ],
};
```
