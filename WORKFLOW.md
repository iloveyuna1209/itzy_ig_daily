# ITZY 的日常 — Workflow & Human-in-the-Loop 架構圖

本文件定義「ITZY 的日常」三條主要資料管線（IG 日記、YouTube 近期影片、背景音樂歌單）與四大 **Human-in-the-Loop（人工審查與健康檢查迴圈）**。

## 整體 Workflow Graph

```mermaid
flowchart TD
    %% Track 1: IG Diary Ingest
    subgraph IG["1. IG 日記匯入管線 (本機 Agent 驅動)"]
        A1["使用者存檔 .mhtml 至 raw/&lt;member&gt;/"] --> A2["預處理 scripts/extract_mhtml.py --dry-run"]
        A2 --> A3["AI 產出繁體中文翻譯 + 標籤 + Wiki 摘要草案"]
        A3 --> A4["陳列待寫入預覽清單 (目標區塊 / 日期 / 雙語內文 / 圖片張數)"]
        A4 --> H1{"Loop 1 人工審查: 資訊與目標區塊是否正確?"}
        H1 -- "需修改 (改翻譯 / 標籤 / 圖片 / 成員)" --> A3
        H1 -- "核准確認" --> A5["正式抽取圖片至 assets/images/&lt;member&gt;/"]
        A5 --> A6["同步寫入 data/diary.js + wiki/members/*.md + index.md + log.md"]
    end

    %% Track 2: YouTube Recent Videos
    subgraph YT["2. 近期影片管線 (GitHub Actions 每日 12:00)"]
        B1["抓取 @ITZY 與 @JYPEntertainment UULF 長影片 RSS (排除 Shorts)"] --> B2["合併排序取最新 5 支影片"]
        B2 --> B3{"是否已有快取辨識結果?"}
        B3 -- "是 (gemini-video / manual)" --> B5["沿用既有參與成員名單"]
        B3 -- "否 (新影片)" --> B4["Gemini 3.8 Flash 觀看 YouTube 影片辨識參與成員 (失敗降級關鍵字)"]
        B4 --> B5
        B5 --> B6["推送 chore/update-videos 分支並自動開立 / 更新審查 PR"]
        B6 --> H2{"Loop 2 PR 人工審查: 參與成員辨識是否正確?"}
        H2 -- "有誤判 (編輯 data/videos.js 並設 manual 鎖定)" --> B7["修正並鎖定成員名單"]
        H2 -- "無誤" --> B8["Merge PR 合併至 main"]
        B7 --> B8
    end

    %% Track 3: Vinyl Music Player
    subgraph MUSIC["3. 黑膠唱片歌單管線"]
        C1["提供 YouTube 連結 + 封面圖"] --> C2["scripts/check_music.py 驗證嵌入權限 / 歌名 / 發行日 / 封面"]
        C2 --> H3{"Loop 3 人工審查: 歌曲資訊與嵌入狀態是否正常?"}
        H3 -- "禁止嵌入或資訊需調整" --> C1
        H3 -- "確認無誤" --> C3["存圖至 assets/music/ 並更新 data/music.js"]
    end

    %% Final Publish & Lint Loop
    A6 --> L1
    C3 --> L1

    subgraph PUB["4. 發布前健康檢查與部署"]
        L1["Loop 4 scripts/lint_project.py (語法 / 重複 / 斷圖 / Wiki 同步 / raw 隱私)"] --> L2{"Lint 是否全部通過?"}
        L2 -- "失敗 (回頭修正)" --> L1
        L2 -- "通過" --> P1["git commit & push 至 main"]
        B8 --> P2["GitHub Pages 自動部署上線"]
        P1 --> P2
    end
```

## 四大審查迴圈（Loops）總覽

| Loop | 觸發位置 | 執行工具 / 工作流 | 審查重點 |
| --- | --- | --- | --- |
| **Loop 1（已啟用）** | IG `.mhtml` 解析後、寫入網頁前 | `scripts/extract_mhtml.py --dry-run` + `AGENTS.md` SOP | 核對目標成員區塊、日期、圖片張數、韓文原文與繁中翻譯語氣、標籤 |
| **Loop 2（已啟用）** | YouTube 每日自動抓取後、合併上線前 | `.github/workflows/update-videos.yml`（自動開 PR） | 核對 `gemini-3.8-flash` 影片辨識出的參與成員；有誤改 `manual` 鎖定再 Merge |
| **Loop 3（已啟用）** | 黑膠歌單新增前 | `scripts/check_music.py` | 檢查 YouTube 影片是否允許外部嵌入（`playableInEmbed`）、歌名、發行日與封面圖 |
| **Loop 4（已啟用）** | `git push` 發布前 | `scripts/lint_project.py` | 驗證 JS 資料合法、零重複、零斷圖、`wiki/` 筆數完全一致、`raw/` 隱私零外洩 |
