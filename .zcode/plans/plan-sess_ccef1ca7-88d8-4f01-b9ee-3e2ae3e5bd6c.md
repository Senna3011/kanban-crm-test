## Multi-Provider AI — OpenAI-Compatible

### Problem
Semua kode AI hardcoded ke DeepSeek. Mentor pakai custom provider (base URL + key + model sendiri).

### Solution
Tambah env vars generik yang fallback ke DeepSeek jika tidak diset.

### Files to change (3 files, ~15 lines diff)

**1. `src/lib/ai.ts`** — tambah helper `getAIConfig()`:
```
AI_API_KEY → pakai custom provider
fallback: DEEPSEEK_API_KEY → pakai DeepSeek

AI_API_BASE → custom URL
fallback: https://api.deepseek.com/v1

AI_MODEL → custom model
fallback: deepseek-chat
```
Ganti hardcoded URL/key di `classifyEmail()` dan `generateFollowUpDraft()`.

**2. `src/app/api/ai-status/route.ts`** — status endpoint test provider yang aktif (bukan hardcoded DeepSeek).

**3. `.env.local.example`** — tambah dokumentasi env vars baru.

### Usage
Mentor tinggal set di `.env.local`:
```env
AI_API_KEY="sk-mentor-key"
AI_API_BASE="https://custom-api.example.com/v1"
AI_MODEL="gpt-4o"
```
Tanpa set variabel ini, tetap pakai DeepSeek (backward compatible).