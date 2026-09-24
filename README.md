# 丑三つの間

<img width="1591" height="812" alt="スクリーンショット 2026-09-23 22 30 43" src="https://github.com/user-attachments/assets/1088508a-82af-4127-a746-7836b417dea5" />


深夜、見知らぬ和室に閉じ込められるところから始まる、日本語の短編ホラー脱出ゲームです。ブラウザだけで遊べます。

**▶ 遊ぶ: https://iwatanabe-7.github.io/ushimitsu-no-ma/**

## あそびかた

- 部屋の中の6か所(掛け軸・押入れ・仏壇・畳・鏡台・出口の襖)を調べて手がかりを集めます。
- 押入れの人形から鍵を見つけ、仏壇の引き出しを開けると暗証番号の手がかりが手に入ります。
- 掛け軸・畳・仏壇で見つけた3つの数字を、出口の襖のダイヤル錠に合わせれば脱出成功です。
- クリア時間の目安は5分程度です。

## 技術構成

- JavaScript のみで実装(フレームワーク・ビルド不要)。ゲーム画面・UIはすべて `<canvas>` 内に JavaScript で描画しており、`<body>` に UI 用の HTML タグや文字列は含みません。
- 外部サーバーとの通信は一切行いません(Web フォント等の外部リソース読み込みなし。フォントは OS 標準の明朝体・ゴシック体を使用)。
- ジャンプスケア演出に使う画像は `assets/ghost.jpg` として別ファイルに保存しており、HTML への埋め込みはありません。
- GitHub Pages でホスティング

## ファイル構成

```
index.html        エントリーファイル(<canvas> のみ)
game.js           ゲームロジック・描画処理
assets/ghost.jpg  ジャンプスケア用画像
```

## ローカルで動かす

`index.html` を直接開いても遊べますが、ブラウザによっては `file://` から画像を読み込めない場合があるため、簡易サーバー経由での起動を推奨します。

```bash
git clone https://github.com/iwatanabe-7/ushimitsu-no-ma.git
cd ushimitsu-no-ma
python3 -m http.server 8000
# http://localhost:8000/ をブラウザで開く
```
