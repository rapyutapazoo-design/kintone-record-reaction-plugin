# レコードリアクション（kintone プラグイン）

レコード詳細画面に「いいね」「お気に入り」などのリアクションボタンを表示し、誰がいつ付けたかをレコード内のサブテーブルに記録するプラグインです。

## 機能
- ボタンの種類（キー・絵文字・表示名・色・配置先・回数欄・紙吹雪）をプラグイン設定で定義できます（最大12件）。
- 記録はサブテーブル `reactions` に「1人×1リアクション=1行」で保存します。もう一度押すと取り消せます。
- 書き込みは `kintone.plugin.app.proxy` と API トークン経由なので、押す人にレコード編集権限は不要です。競合時は再試行します。
- 回数は任意の NUMBER フィールドにも書き戻せます（標準の一覧・グラフで利用可能）。
- モバイルでプロキシが使えない場合は、閲覧のみ表示に切り替わります。

### 初期セット
| キー | 絵文字 | 表示名 |
| --- | --- | --- |
| like | 👍 | いいね |
| favorite | ⭐ | お気に入り |
| want_to_go | 📍 | 行きたい |
| interested | 👀 | 気になる |

## ビルド
```
npm install
npm run verify   # test → typecheck → build → check:plugin → package:plugin
```
`dist/plugin.zip` が生成されます。秘密鍵は初回に `keys/private.ppk` へ自動生成されます。**必ずバックアップしてください**（紛失するとプラグイン ID が変わります）。`keys/` と `dist/` は Git 管理外です。

## 導入
フォームの作り方・アクセス権・API トークンは [docs/app-setup.md](docs/app-setup.md) を参照してください。セキュリティ上の注意は [docs/security.md](docs/security.md)、実機確認項目は [docs/manual-test.md](docs/manual-test.md) です。

## 将来拡張
- 音・振動の演出設定（型 `Effects` は用意済みで、現在は固定 OFF）
- 専用アイコンの差し替え
- 一覧画面でのリアクション表示
