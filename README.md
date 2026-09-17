# LSJN2027 訓練紀錄（v0.5.0）

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
| `data/write_policy.json` | 家教 寫回時允許與禁止的操作 |
| `data/progress.json` | 進度表打勾狀態 |
| `data/outline.json` | Master Outline（LR／RC 概念大綱，Heading 1–4 層級） |
| `data/pt140_error_inventory.json` | PT140 錯題清單與 2026 盲審結果（唯一來源） |
| `outline.js` | 大綱模組：折疊檢視、搜尋、編輯、.docx／.json 匯出匯入、寫回操作 |
| `WRITEBACK.md` | 寫回包 JSON 格式說明 |

`data/*.json` 是唯一資料權威。xlsx 只是匯出檢視用，不要把 xlsx 改回來當輸入。

## 更新到 v0.5.0（GitHub 網頁上傳，一次完成）

前提：手機與筆電上沒有未同步的寫回包（「同步」頁右上圓點為綠色「已同步」）。

1. 在電腦解壓縮 `lsat-coach-v0.5.0-upload.zip`，得到資料夾 `v0.5.0-upload`，內含 6 個檔案、`data` 資料夾（7 個 json）、`vendor` 資料夾（1 個 js）。
2. 瀏覽器開 `https://github.com/larrycyweng/LSJN2027`，按「Add file」→「Upload files」。
3. 把 `v0.5.0-upload` **資料夾裡面的全部內容**（不是資料夾本身）一起拖進上傳區：6 個檔案、`data` 資料夾、`vendor` 資料夾。GitHub 會顯示 14 個檔案待上傳，路徑如 `data/outline.json`、`vendor/jszip.min.js`。
4. 下方 Commit changes 訊息填 `v0.5.0 maintenance 2026-09-18`，選「Commit directly to the main branch」，按 Commit changes。
5. 等一到兩分鐟，手機關閉 App 再重新開啟一次。底部分頁應為「今日／進度／大綱／同步」，「同步」頁最下方「版本」應顯示 App 0.5.0。
6. 到「大綱」分頁確認 LR 與 RC 可展開；到「同步」頁按「重新載入 repo 資料」一次。

若步驟 5 仍看到舊版，等一分鐘再重開一次；仍舊則在手機瀏覽器清除此網站的網站資料後重開。

## 原則

### 流程規則
- 教學對話（01 LR、02 RC）只做教與測。對系統、規則或家教表現的異議，在教學對話中以一句話記錄於 handoff 的 open_questions，格式「【移 00】一句話」，移到 00 處理。
- 00 系統對話處理 App、資料、計畫與規則；每次涉及訓練安排前，先讀 live repo 並在開頭報告讀到的狀態。

### 一本書主義
- 教學、練習與官方題選擇全部掛在 LSATLab Notes 的節名、`data/outline.json` 與 `data/pt140_error_inventory.json` 之下。
- 官方題可暴露未教的缺口；暴露後對回筆記節名立即補教，不延後。
- 錯誤指紋一律如實記錄，只保留有學習價值、考場上能快速反應的反饋；不挑選每週強化清單。指紋的修正動作寫在大綱對應節的 Trap 段；指紋、假設、弱點統計、接觸狀態是家教的診斷資料，只存在 data 檔，不在使用者介面顯示。
- 每週時數安排包含全盤複習與強化訓練；教學提醒要點，不重複細節，不過度拆解，避免耗損專注力。

### PT140 錯題清單
- `data/pt140_error_inventory.json` 是 PT140 錯題選題的唯一來源。所有對話在挑選延遲盲審題目前先讀此檔，不得要求使用者重新上傳截圖。
- 盲審結果以寫回包 `update_pt140_review`（01- 或 02- 前綴）填入 `review_2026`，不手動編輯此檔。

### 家教防錯七條（HO-011）
1. 來源閘：任何概念、標籤、規則必須標 [Notes §節名] 或 [補充]，無標記不得使用。
2. 補充三條件：標 [補充] 者須同時寫出服務的具體題幹、筆記為何不覆蓋、使用者同意；缺一不教。
3. 標籤集凍結：七個段落功能（INTRO、VIEW、COUNTER、SUPPORT、EVAL、AUTHOR、EXTEND）、Scope／Logic／Degree 六類誘答、Notes LR 題型家族、Notes RC 題型。不新增標籤集；新增僅限 00 對話決定。
4. 題幹效益檢驗：新增前先答「哪一題若有此項會改變答案」，答不出不加。
5. 解析度規則：地圖與標示只做到題目需要的細度。
6. 一次撤回：使用者指出混淆或低效益即撤回，不辯護，記錄。
7. 稽核欄：每筆 handoff 與每次開課報告列本堂 [補充] 清單，00 維護時檢視數量。

### 書寫
- 錯題本與交接條目以考場小抄的精簡程度書寫。全文不用 em dash。
- 大綱中的操作性規則、步驟、陷阱以精簡英文書寫；使用者原文優先，修正時記錄。

## Master Outline（大綱分頁）
- 骨架固定為 LSATLab Notes 的節名：Heading 1 = LR／RC；Heading 2 = Notes 主要節；Heading 3 = 概念、方法或題型；Heading 4 = 子題。日期、PT、題號、課程、指紋不作為標題。
- 節內標籤只用：Rule、Recognition、Steps、Why It Works、Trap、Official Example、Personal Note、Source、Status。官方題只以 PT／S／Q 引用並連結 `attempts.json`，不存題文。
- 來源分四類：LSATLab Notes、Official Example、User Revision、Supplement。假設與家教自創術語不得標為 Notes。
- 狀態：草稿（家教寫入，待核准）、已核准、待確認、已撤回。收合時只顯示節名與一句用途。
- 你在 App 或 Google Docs 修改過的節標為 protected；之後家教的 `update_section` 對這些節只會顯示為「提案」，需你按接受才覆蓋。
- 匯出 `.docx`（Google Docs 可開啟）與 `.json`（無損備份）。在 Google Docs 修改後「檔案 → 下載 → Microsoft Word」再匯入；匯入先顯示差異預覽（新增、修改、改名、移動、可能刪除、衝突、未變更），預設合併，不自動刪除，重複或跳層的標題會整份拒絕。匯入相同檔案不產生變更。
- Google Docs 格式限制：只保留 Heading 1–4、段落、粗體標籤、項目與編號清單；顏色、字型、表格、圖片不保留。

## 分工

- **App**：進度提醒（checklist）、快速時間紀錄、知識卡片複習、隨手筆記、寫回包入口。
- **家教 專案對話**：教學、截圖轉錄、錯誤診斷、弱點分析、產生寫回包。
- **LawHub / LSAT Lab**：實際練習與測驗。

## 每日流程

1. 打開「今日」看今天任務；學習結束填分鐘數與模式（三個欄位）。
2. 練習作答結果**截圖傳給 家教**，不在 App 輸入題目。家教 教學後產生寫回包。
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
