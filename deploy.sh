#!/bin/bash
set -e

echo "📦 git push..."
git push origin main

echo "⏳ Vercelのビルドを待機中..."
sleep 30

for i in {1..20}; do
  LATEST=$(npx vercel ls 2>/dev/null | grep "Ready" | head -1 | awk '{print $4}')
  if [ -n "$LATEST" ]; then
    echo "✅ デプロイ完了: $LATEST"
    echo "🔗 本番URLに紐付け中..."
    npx vercel alias set "$LATEST" jp-stock-sim.vercel.app
    echo "🚀 デプロイ完了: https://jp-stock-sim.vercel.app"
    exit 0
  fi
  echo "待機中... ($i/20)"
  sleep 10
done

echo "❌ タイムアウト"
exit 1
