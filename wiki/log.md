# 操作日誌（Log）

> 格式：`## [YYYY-MM-DD] <ingest|query|lint|init> | <摘要>`

## [2026-11-22] init | 建立 ITZY 的日常 LLM Wiki 與 Gallery 網頁初始架構
- 建立 `AGENTS.md` 定義三層架構與匯入 SOP。
- 建立 5 位成員的 `raw/` 資料夾與 `wiki/members/*.md`。
- 建立前端 Gallery 骨架（`index.html`、`styles.css`、`app.js`、`data/diary.js`）。

## [2026-11-22] ingest | yuna - 2026-11-11 Treemingbird 合作貼文 (DflriwBCTrm)
- 新增 `scripts/extract_mhtml.py` 支援解析瀏覽器「另存為單一網頁檔案（.mhtml）」。
- 解析 `raw/yuna/Instagram.mhtml`，抽出 3 張正文照片至 `assets/images/yuna/`，同步更新 `data/diary.js`、`wiki/members/yuna.md` 與 `wiki/index.md`。

## [2026-11-22] update | 新增 ITZY 團體區塊、改版中軸交錯時間軸與背景原圖檢視
- 新增 `itzy`（`@itzy.all.in.us`）團體資料夾 `raw/itzy/` 與 `wiki/members/itzy.md`，於 Gallery 排第 1 位並改為 3×2 卡片佈局。
- 調整背景圖縮小 30% 無縫填滿，並於頂部欄「成員區塊」左側加入查看背景原圖按鈕。
- 全員時間軸改為中軸左右交錯樣式（中間圓圈顯示韓文藝名），並加入多選成員篩選列。

## [2026-11-22] ingest | 批次匯入 5 篇新貼文（itzy、yeji、lia、ryujin、chaeryeong）
- 升級 `scripts/extract_mhtml.py`：支援無文字貼文（無 `<h1>`）精準鎖定彈窗範圍，以及 Reels 影片貼文自動擷取封面縮圖。
- 匯入 `chaeryeong` (2026-11-21)、`itzy` (2026-11-19 Reels)、`yeji` (2026-11-14)、`ryujin` (2026-11-14)、`lia` (2026-11-08)，總計 6 篇全團齊全，已同步更新 `data/diary.js` 與全部 `wiki/` 檔案。
