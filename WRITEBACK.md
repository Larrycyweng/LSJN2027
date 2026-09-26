# 寫回包格式 v1.1

家教 在每次課程結束時輸出一個 JSON 寫回包。使用者貼入 App「同步」頁 → 檢查 → 確認寫入。App 依 `data/write_policy.json` 拒絕不允許的操作與重複的 `client_request_id`。

```json
{
  "writeback_version": "1.0",
  "generated": "2026-09-13",
  "items": [
    {"op": "add_session", "client_request_id": "20260913-s1",
     "data": {"session_date": "2026-09-13", "mode": "觀念學習", "effective_minutes": 45, "focus_skill": "結論／理由／讓步區分", "attention": "高", "fatigue": "低"}},
    {"op": "add_card", "client_request_id": "20260913-c1",
     "data": {"title": "讓步 vs 理由", "core": "讓步只限縮立場，不支持主結論。", "common_error": "把 nevertheless 之後的句子當成理由", "corrective_action": "先問：這句對結論是支持還是限縮？", "example": "Although X is costly, it is still the best option.", "scope": "LR", "source": "2026-09-13 課程", "signature_id": ""}},
    {"op": "add_handoff", "client_request_id": "20260913-h1",
     "data": {"date": "2026-09-13", "stopped_at": "論證角色原創題第 6 題", "taught": "結論、理由、背景、反方、讓步", "observed": "讓步句兩次被標為理由；背景句判斷穩定", "next_task": "因果主張與替代原因（Week Zero Day 2）", "open_questions": "中間結論的識別尚未測"}},
    {"op": "add_signature", "client_request_id": "20260913-e1",
     "data": {"error_type": "讓步≠理由", "trigger_signal": "nevertheless / although 後的句子", "attraction": "位置接近結論", "corrective_action": "讓步只限縮立場，不支持主結論", "scope": "LR"}},
    {"op": "suggest_signature_update", "client_request_id": "20260913-e2",
     "data": {"signature_id": "ES-001", "stage": "近移轉通過", "evidence_count": 3, "last_seen": "2026-09-13"}},
    {"op": "suggest_hypothesis_update", "client_request_id": "20260913-y1",
     "data": {"hypothesis_id": "H-001", "independent_observations": 2, "supporting_evidence": "PT123 標籤資料；2026-09-13 原創題讓步誤判 2 次（提示後修正）"}},
    {"op": "add_attempt", "client_request_id": "20260913-a1",
     "data": {"attempt_date": "2026-09-13", "mode": "練習", "material_type": "原創題", "question_type": "論證部分", "skill_tag": "讓步", "timed_answer": "B", "correct_answer": "D", "confidence": "中", "reason_correct": "否", "notes": "原創題 6"}}
  ]
}
```

## 規則

- `client_request_id` 由家教產生，格式 `<聊天代碼>-YYYYMMDD-<類型字母><序號>`，聊天代碼為 `00-`、`01-`、`02-`、`03-`。同一 id 重貼會被拒絕；不加代碼會與其他對話撞號。
- `add_card` 的 `card_status` 一律由 App 設為「待確認」。升級為「已理解」或「已驗證」由使用者在 App 操作，或日後在寫回包中另以明確操作提出。
- `add_attempt` 可寫入官方題，但必須含 `"source_evidence": "使用者截圖"`，且只轉錄截圖可見內容，不明欄位留白。原創題不需此欄位。
- 新操作：`update_exposure`（更新官方題接觸狀態，需 pt_id）、`update_session`（補充既有學習紀錄的內容欄位，需 session_id）。
- `suggest_*` 只能更新政策檔列出的欄位。
- `update_signature`（v0.5.1 起）：修正既有指紋的內容欄位，需 signature_id；可更新 error_type、trigger_signal、why_attractive、corrective_action、attraction、scope、notes、stage、signature_status、evidence_count、last_seen。未列出的欄位不動。
- `update_exposure` 對既有 pt_id（v0.5.1 起）：保留原 created_at 與 client_request_id，本次請求寫入 last_request_id；只覆寫包內提供的欄位。
- 不提供刪除或覆寫作答的操作。
- 每筆課程至少包含一個 `add_handoff`，其 `stopped_at` 與 `next_task` 必填，供下次課前讀取。

## 家教 課前讀取的檔案

```
https://raw.githubusercontent.com/<owner>/<repo>/main/data/handoffs.json
https://raw.githubusercontent.com/<owner>/<repo>/main/data/attempts.json
https://raw.githubusercontent.com/<owner>/<repo>/main/data/signatures.json
https://raw.githubusercontent.com/<owner>/<repo>/main/data/hypotheses.json
https://raw.githubusercontent.com/<owner>/<repo>/main/data/cards.json
https://raw.githubusercontent.com/<owner>/<repo>/main/data/sessions.json
https://raw.githubusercontent.com/<owner>/<repo>/main/data/checkpoints.json
```

## v1.1 新增操作

```json
{"op":"update_pt140_review","client_request_id":"01-20260920-r1",
 "data":{"section":3,"q":11,"review_2026":{"date":"2026-09-20","chat":"01","mode":"Review","answer_2025":"C","answer_2026":"A","correct_answer":"A","correct_2026":true,"hint_used":"否","reason_correct":"是","classification":"概念已穩（暫時支持）","attempt_id":"A-20260920-PT140-S3-Q11-R2","explanation_seen":true}}}
```
`attempt_id` 必須對應 `attempts.json` 既有紀錄（先 `add_attempt`，再 `update_pt140_review`）。

```json
{"op":"add_section","client_request_id":"01-20260920-o1",
 "data":{"parent_id":"OL-011","title":"Only If","summary":"Only if introduces the necessary condition.","source_type":"LSATLab Notes","source_ref":"§Reasoning Structures Conditional",
  "blocks":"Rule: \"Y only if X\" gives Y → X.\nTrap: reading only if as if.\nOfficial Example: PT140 S3 Q17 (A-20260915-PT140-S3-Q17)"}}
{"op":"update_section","client_request_id":"01-20260920-o2",
 "data":{"section_id":"OL-011","mode":"append","source_type":"Official Example","source_ref":"PT150 S1 Q5",
  "blocks":[{"type":"p","label":"Official Example","text":"PT150 S1 Q5 (Sufficient Assumption): gap closed by contrapositive.","refs":["A-20260920-PT150-S1-Q05"]}]}}
{"op":"move_section","client_request_id":"01-20260920-o3","data":{"section_id":"OL-020","parent_id":"OL-018","order":2}}
{"op":"suggest_section_deletion","client_request_id":"01-20260920-o4","data":{"section_id":"OL-029","reason":"Merged into Trap Answers"}}
```

規則：
- `blocks` 可為字串（每行一段；`Label: ` 開頭為標籤段，`- ` 為項目，`1. ` 為步驟）或結構化陣列。
- `add_section` 的 `source_type` 必填（LSATLab Notes／Official Example／User Revision／Supplement）；狀態一律先為草稿。標 Supplement 者須符合 README 防錯七條的補充三條件。
- `update_section` 預設取代 blocks；`"mode":"append"` 為追加。對使用者修訂過（protected）的節，App 只記為提案，需使用者接受。
- 不提供整批取代大綱的操作。刪除只能提議。
- Official Example 段以 `refs` 連結 `attempt_id`；不寫題文。
- 每次課後至少一個 `update_section`（把可重用的學習點路由到既有節），不要把整堂課寫進單一節。

## 課前讀取（新增）
```
https://raw.githubusercontent.com/<owner>/<repo>/main/data/outline.json
https://raw.githubusercontent.com/<owner>/<repo>/main/data/pt140_error_inventory.json
https://raw.githubusercontent.com/<owner>/<repo>/main/data/progress.json
```
