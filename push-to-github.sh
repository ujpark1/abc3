#!/bin/bash
# GitHub에 올리기 — 시스템 터미널(Terminal.app)에서 실행하세요.
# Cursor 터미널에서 git 오류 나면 이 스크립트를 더블클릭하거나:
#   cd /Users/upark/Desktop/abc2/abc3 && bash push-to-github.sh

set -e
cd "$(dirname "$0")"

echo "→ 추적 제거 (이미 add 된 node_modules, .next)"
git rm -r --cached node_modules 2>/dev/null || true
git rm -r --cached .next 2>/dev/null || true

echo "→ 변경사항 스테이징 (.env.local은 .gitignore로 제외됨)"
git add .

echo "→ 커밋"
git commit -m "Update: .gitignore, Daily English app ready for deploy" || echo "(변경 없으면 스킵)"

echo "→ GitHub에 푸시"
git push origin main || git push origin master || echo "원격 이름이 다를 수 있음. git remote -v 로 확인 후 브랜치명 수정"

echo "완료."
