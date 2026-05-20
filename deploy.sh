#!/bin/bash
set -e

echo "📦 git push..."
git push origin main

echo "⏳ Vercelのビルドを待機中..."
sleep 60

for i in {1..20}; do
  LATEST=$(npx vercel ls 2>/dev/null | grep "vercel.app" | head -1 | grep -o 'https://[^ ]*')
  if [ -n "$LATEST" ]; then
    echo "✅ デプロイ完了: $LATEST"
    echo "🔗 本番URLに紐付け中..."
    npx vercel alias set "$LATEST" jp-stock-sim.vercel.app 2>&1
    echo "🚀 完了: https://jp-stock-sim.vercel.app"
    exit 0
  fi
  echo "待機中... ($i/20)"
  sleep 10
done

echo "❌ タイムアウト"
exit 1
