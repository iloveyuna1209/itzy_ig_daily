# ITZY 的日常 — Workflow & Human-in-the-Loop 架構圖

本文件定義「ITZY 的日常」三條主要資料管線（IG 日記、YouTube 近期影片、背景音樂歌單）與其中的 **Human-in-the-Loop（人工審查迴圈）** 及 **Lint 防線**。

## 整體 Workflow Graph

```mermaid
flowchart TD
    %% Track 1: IG Diary Ingest
    subgraph IG["1. IG 日記匯入管線 (本機 Agent 驅動)"]
        A1["使用者存檔 .mhtml 至 raw/&lt;member&gt;/"] --> A2["預處理 scripts/extract_mhtml.py --dry-run"]
        A2 --> A3["AI 產出繁體中文翻譯 + 標籤 + Wiki 摘要草案"]
        A3 --> A4["陳列待寫入預覽清單 (目標區塊 / 日期 / 雙語內文 / 圖片張數)"]
        A4 --> H1{"人工審查 Loop 1: 資訊與目標區塊是否正確?"}
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
        B5 --> H2{"建議 Loop 2: PR 人工確認成員辨識 (或直接寫入)"}
        H2 -- "有誤判 (改為 manual 鎖定)" --> B6["人工修正 data/videos.js 並鎖定"]
        H2 -- "無誤" --> B7["更新 data/videos.js"]
        B6 --> B7
    end

    %% Track 3: Vinyl Music Player
    subgraph MUSIC["3. 黑膠唱片歌單管線"]
        C1["提供 YouTube 連結 + 上傳封面圖"] --> C2["抓取歌名 / 歌手 / 發行日 + 檢查封面"]
        C2 --> H3{"建議 Loop 3: 確認歌曲資訊與嵌入權限"}
        H3 -- "需調整" --> C2
        H3 -- "確認" --> C3["存圖至 assets/music/ 並更新 data/music.js"]
    end

    %% Final Publish & Lint Loop
    A6 --> L1
    B7 --> L1
    C3 --> L1

    subgraph PUB["4. 發布前健康檢查與部署"]
        L1["Pre-Push Lint 檢查 (筆數一致 / 無斷圖 / raw 未被追蹤)"] --> L2{"Lint 是否全部通過?"}
        L2 -- "失敗 (修正斷圖或資料不同步)" --> L1
        L2 -- "通過" --> P1["git commit & push 至 main"]
        P1 --> P2["GitHub Pages 自動部署上線"]
    end
```

## 審查迴圈（Loops）對照表

| Loop | 位置 | 狀態 | 審查重點 |
| --- | --- | --- | --- |
| **Loop 1（已強制啟用）** | IG `.mhtml` 解析後、寫入網頁前 | 已寫入 `AGENTS.md` | 核對目標成員區塊、發布日期、圖片張數、韓文原文與繁體中文翻譯語氣、標籤 |
| **Loop 2（建議升級）** | YouTube 每日自動更新後、上線前 | 目前直推 `main`（可改為開 PR 審查） | 核對 `gemini-3.8-flash` 影片畫面辨識出的參與成員是否正確，有誤可改為 `manual` 鎖定 |
| **Loop 3（建議啟用）** | 音樂歌單新增前 | 輕量確認 | 核對歌名、歌手、發行日、封面裁切效果與 YouTube 影片是否允許外部嵌入 |
| **Loop 4（已內建）** | `git push` 發布前 | 已寫入 `AGENTS.md` | 確保 `raw/` 隱私檔零外洩、`data/diary.js` 與 `wiki/` 同步一致、圖片零斷鏈 |
