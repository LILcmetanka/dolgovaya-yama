#!/bin/bash
# Временная сборка с хуком window.__g в scratchpad; GameScene возвращается как был.
set -e
SP=$1; cd "$2"
cp src/game/GameScene.ts $SP/GameScene.ts.bak
sed -i '/this.payout = new PayoutWindow(this, () => this.take());/s/$/ (window as unknown as { __g: unknown }).__g = this;/' src/game/GameScene.ts
npx vite build --outDir $SP/dist --emptyOutDir >/dev/null 2>&1 || echo BUILD FAILED
cp $SP/GameScene.ts.bak src/game/GameScene.ts
grep -q "__g = this" src/game/GameScene.ts && echo "HOOK LEFT IN SOURCE" || echo "hook build ok, GameScene restored"
