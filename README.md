# LSJN2027 訓練紀錄（v0.3.0）

個人 LSAT 訓練的知識管理與行動紀錄介面。部署在 GitHub Pages，資料存在本 repo 的 `data/` 資料夾，手機上每日輸入控制在 3 分鐘內。

本程式不取代 LawHub，不存官方題目全文，不做任何自動擷取。它只保存官方題號、表現資料、錯誤指紋、診斷假設與檢查點決定。

## 檔案

| 檔案 | 用途 |
| --- | --- |
| `index.html` | 介面 |
| `app.js` | 輸入、彙整、上下文包、xlsx 匯出、GitHub 同步 |
| `sw.js`、`manifest.webmanifest`、`icon.svg` | 讓手機可加到主畫面並離線開啟 |
| `data/settings.json` | 計畫參數、階段日期、受控選項（來自追蹤器「設定」頁，v1.1-zh-TW） |
| `data/sessions.json` | 學習紀錄 |
| `data/attempts.json` | 題目紀錄 |
| `data/exposure.json` | 官方題接觸狀態（已含 PT123、PT141） |
| `data/signatures.json` | 錯誤指紋 |
| `data/hypotheses.json` | 診斷假設（已含 H-001 到 H-006） |
| `data/checkpoints.json` | 四個檢查點 |
| `data/cards.json` | 知識卡片（複習用） |
| `data/handoffs.json` | 每次課程的接續摘要 |
| `data/write_policy.json` | Claude 寫回時允許與禁止的操作 |
| `data/progress.json` | 進度表打勾狀態 |
| `WRITEBACK.md` | 寫回包 JSON 格式說明 |

`data/*.json` 是唯一資料權威。xlsx 只是匯出檢視用，不要把 xlsx 改回來當輸入。

## 部署步驟（一次完成，約 15 分鐘）

1. 在 GitHub 建立新的公開 repo，名稱例如 `lsat-coach`。不要勾選任何初始化檔案。
2. 把本資料夾內全部檔案上傳到 repo 根目錄（網頁介面 Add file → Upload files，或用 git push）。`data/` 資料夾要一起上傳。`.nojekyll` 是空檔，也要保留。
3. 進入 repo 的 Settings → Pages。Source 選 Deploy from a branch，Branch 選 `main`、資料夾選 `/ (root)`，按 Save。
4. 等一到兩分鐘，網址會是 `https://<你的帳號>.github.io/lsat-coach/`。
5. 建立寫入用的權杖：GitHub 右上頭像 → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token。
   - Repository access 選 Only select repositories，只選這個 repo。
   - Permissions → Repository permissions → Contents 設為 Read and write。其他都不要開。
   - 到期日建議設到 2027 年 1 月底之後。
   - 產生後只會顯示一次，先複製。
6. 用手機瀏覽器開啟網址，進入「設定」頁，確認 owner 與 repo 自動帶入正確，貼上權杖，按「保存設定」。權杖只存在這支手機瀏覽器的 localStorage，不會寫進 repo。
7. 手機加到主畫面：iPhone 用 Safari 分享 → 加入主畫面；Android 用 Chrome 選單 → 加到主畫面。

## 分工

- **App**：進度提醒（checklist）、快速時間紀錄、知識卡片複習、隨手筆記、寫回包入口。
- **Claude 專案對話**：教學、截圖轉錄、錯誤診斷、弱點分析、產生寫回包。
- **LawHub / LSAT Lab**：實際練習與測驗。

## 每日流程

1. 打開「今日」看今天任務；學習結束填分鐘數與模式（三個欄位）。
2. 練習作答結果**截圖傳給 Claude**，不在 App 輸入題目。Claude 教學後產生寫回包。
3. 「同步」頁貼入寫回包 → 檢查（核對題號與答案是否與截圖一致）→ 確認寫入 → 立即同步。
4. 「進度」頁把完成的排程打勾。
5. 空檔時到「複習」回想到期卡片；路上想到的問題用「快速筆記」丟進去，下次課程處理。

## 弱點排序的規則

- 只用官方題計算；原創題另列。
- 每個題型或能力標籤至少要有 `weakness_min_n`（預設 3）題才進入排序，否則列為「樣本不足」。
- 排序分數 = 錯題數 ×（1 − 正確率）+ 0.5 × 理由錯誤數。無錯題者不列為 drill 候選。
- 盲審正確但第一次錯，偏向配速或注意力問題；盲審也錯，偏向理解問題。App 只呈現數字，判斷在課程中完成。

## 把資料帶進 AI 對話

方法一：「匯出」頁按「產生上下文包」再「複製」，貼進專案對話。上下文包只含題號與表現資料。

方法二：告知家教你的 owner 與 repo 名稱。公開 repo 的原始 JSON 網址是：

```
https://raw.githubusercontent.com/<owner>/<repo>/main/data/attempts.json
```

其他檔案以此類推。家教可以直接讀取這些檔案。

## 編號規則（與追蹤器一致）

- 學習紀錄：`S-20260913-01`
- 官方題作答：`A-20260913-PT150-LR1-Q05`；同題重做自動加 `-R2`
- 原創題作答：`A-20260913-ORIG-01`
- 錯誤指紋：`ES-001`
- 診斷假設：`H-001`

## 自動計算

- 第一次正確、盲審正確：由答案比對得出。
- 檢討標記：答錯、低信心、逾時、猜測或理由不正確任一成立即為「是」。
- 可作乾淨完整模考：接觸狀態為「未接觸」才為「是」。
- 週次與階段：依 `settings.json` 的 `plan_start` 與 `phases` 計算，時區 America/Los_Angeles。

## 已知限制

- 單一使用者設計，同步採合併後以 `updated_at` 較新者為準。同一筆紀錄在兩支裝置離線各改一次時，較晚儲存的會覆蓋較早的。
- 沒有刪除功能。錯誤紀錄用備註標示，或直接在 repo 編輯 JSON。
- 若 `data/settings.json` 的階段日期或受控選項要改，直接編輯該檔並 commit；App 重新載入後生效。改讀書計畫時再改此檔。
- xlsx 匯出依賴 cdnjs 的 SheetJS，需要網路。

## 版本

- 0.3.0（2026-09-12）：刪除題目表單、批次貼上、上下文包、xlsx 匯出與各編輯表單；新增學習進度表（checklist 含四檢查點驗收標準）、快速筆記；學習紀錄簡化為三欄；追蹤頁改唯讀；寫回包支援官方題（須附截圖證據）、接觸狀態更新與紀錄補充；來源改為 LawHub／LSAT Lab／專案對話／其他。
- 0.2.0（2026-09-12）：今日任務、弱點排序、知識卡片與到期複習、課程接續摘要、寫回包貼入與冪等檢查、write_policy。分頁改為 今日／題目／複習／追蹤／同步。
- 0.1.0（2026-09-12）：學習紀錄、題目紀錄、批次貼上、待檢討清單與盲審補填、錯誤指紋、診斷假設、檢查點、官方題接觸、上下文包、xlsx 與 JSON 匯出、GitHub 同步、離線 App 殼。
