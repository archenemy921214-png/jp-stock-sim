# JP株シミュレーター セットアップ手順

## 1. Supabaseプロジェクトの作成

1. https://supabase.com にアクセスしてプロジェクトを作成
2. Project Settings > API から以下を取得:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

## 2. データベーススキーマの適用

Supabase Dashboard > SQL Editor で `supabase/schema.sql` の内容を実行してください。

## 3. Row Level Security の設定

開発環境では、すべてのテーブルで RLS を無効にするか、以下のポリシーを設定してください:

```sql
-- RLS無効化（開発用）
ALTER TABLE stocks DISABLE ROW LEVEL SECURITY;
ALTER TABLE price_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE indicators DISABLE ROW LEVEL SECURITY;
ALTER TABLE signals DISABLE ROW LEVEL SECURITY;
ALTER TABLE simulated_positions DISABLE ROW LEVEL SECURITY;
ALTER TABLE simulated_trades DISABLE ROW LEVEL SECURITY;
ALTER TABLE settings DISABLE ROW LEVEL SECURITY;
```

## 4. 環境変数の設定

```bash
cp .env.local.example .env.local
# .env.local を編集して実際の値を入力
```

## 5. 起動

```bash
npm install
npm run dev
```

→ http://localhost:3000 にアクセス

## 6. 使い方

1. 「銘柄追加」ボタンから4桁の銘柄コードを入力（例: 7203=トヨタ）
2. 追加と同時に過去データ取得・シミュレーションが自動実行
3. 各銘柄カードの「詳細」でチャートと取引履歴を確認
4. 「更新」ボタンで最新データに同期

## データソース

Yahoo Finance Japan API（`yahoo-finance2` ライブラリ経由）
- 対応銘柄: 東証（.T）全銘柄
- 取得期間: 過去約1年3ヶ月分（MA75計算のためのバッファ込み）
