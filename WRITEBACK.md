# 寫回包格式 v1.0

Claude 在每次課程結束時輸出一個 JSON 寫回包。使用者貼入 App「同步」頁 → 檢查 → 確認寫入。App 依 `data/write_policy.json` 拒絕不允許的操作與重複的 `client_request_id`。

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

- `client_request_id` 由 Claude 產生，格式 `YYYYMMDD-<類型字母><序號>`。同一 id 重貼會被拒絕。
- `add_card` 的 `card_status` 一律由 App 設為「待確認」。升級為「已理解」或「已驗證」由使用者在 App 操作，或日後在寫回包中另以明確操作提出。
- `add_attempt` 可寫入官方題，但必須含 `"source_evidence": "使用者截圖"`，且只轉錄截圖可見內容，不明欄位留白。原創題不需此欄位。
- 新操作：`update_exposure`（更新官方題接觸狀態，需 pt_id）、`update_session`（補充既有學習紀錄的內容欄位，需 session_id）。
- `suggest_*` 只能更新政策檔列出的欄位。
- 不提供刪除或覆寫作答的操作。
- 每筆課程至少包含一個 `add_handoff`，其 `stopped_at` 與 `next_task` 必填，供下次課前讀取。

## Claude 課前讀取的檔案

```
https://raw.githubusercontent.com/<owner>/<repo>/main/data/handoffs.json
https://raw.githubusercontent.com/<owner>/<repo>/main/data/attempts.json
https://raw.githubusercontent.com/<owner>/<repo>/main/data/signatures.json
https://raw.githubusercontent.com/<owner>/<repo>/main/data/hypotheses.json
https://raw.githubusercontent.com/<owner>/<repo>/main/data/cards.json
https://raw.githubusercontent.com/<owner>/<repo>/main/data/sessions.json
https://raw.githubusercontent.com/<owner>/<repo>/main/data/checkpoints.json
```
