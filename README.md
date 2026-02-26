# browser-memory-cli

Claude Code から使える、ローカル実行のブラウザ操作記録CLIです。

## 特徴

- ローカル実行（デフォルトは `./.browser-memory` に状態保存）
- ワークフロー登録/管理
- 実行ログ保存と `correct` による操作訂正
- `tune` でプロンプト改善提案、`--apply` で反映
- LLMは Claude CLI (`claude -p`) を利用しAPI課金を回避
- 将来のproxy差し替えを見据えた provider 分離

## 前提

- Node.js 20+
- `claude` コマンドがインストール済み・認証済み
- Playwright はパッケージに同梱済み
- 初回のみ Chromium の導入が必要:
  - `npm run setup:browser`

## インストール（ローカル）

```bash
cd /Users/urugus/dev/browser-memory-cli
npm link
```

## 使い方

### 1. ワークフロー作成

```bash
browser-memory workflow create \
  --name "請求書取得" \
  --goal "取引先サイトから当月請求書をDL" \
  --success "当月請求書PDFが1件以上ダウンロード済み" \
  --startUrl "https://example.com/login"
```

### 2. 実行

```bash
browser-memory run <workflow-id> --headless=false --maxSteps=30
```

### 3. 訂正登録

```bash
browser-memory correct <run-id> --step 4 --note "請求書一覧タブを先に開く必要あり"
```

### 4. チューニング提案

```bash
browser-memory tune <run-id>
browser-memory tune <run-id> --apply
```

### 5. 資格情報管理（macOS Keychain）

```bash
browser-memory credential set vendor_a_password --value '***'
browser-memory credential get vendor_a_password
browser-memory credential delete vendor_a_password
```

## データ構造

- `./.browser-memory/workflows/*.json`
- `./.browser-memory/runs/*.json`
- `./.browser-memory/corrections/*.json`
- `./.browser-memory/prompt_versions/*.json`
- `./.browser-memory/artifacts/<workflow-id>/`

`BROWSER_MEMORY_HOME` を指定すると保存先を変更できます。

## 開発コマンド

```bash
npm run format
npm run lint
npm run test
npm run changeset
npm run setup:browser
```

## リリース運用（Changesets + GitHub Actions）

- PRで機能変更を入れるときは `npm run changeset` で変更内容を追加
- `main` へマージ後、`Release` workflow が自動で release PR を作成
- release PR をマージすると npm publish と `CHANGELOG.md` 更新が自動実行

必要なGitHub Secrets:

- `CHANGESETS_GITHUB_TOKEN`: `repo` 権限を持つ Personal Access Token（release PR作成用）
- `NPM_TOKEN`: npm publish 権限を持つトークン

必要なGitHub設定:

- Repository Settings > Actions > General > Workflow permissions で
  - `Read and write permissions` を有効化
  - `Allow GitHub Actions to create and approve pull requests` を有効化（`GITHUB_TOKEN`運用時）

## 既知の制約

- MCPサーバーは `mcp serve` のスタブのみ実装
- Playwright未導入時は noop runtime
- 成功条件判定は現状シンプル（ダウンロード件数など）
