# 天気予報 LINE Bot 🤖☀️

LINE で「今日の天気」と **AI が生成したお出かけアドバイス** を、ユーザーが設定した時刻・地域に毎日自動で届ける Bot です。

設定画面（LIFF アプリ）で「場所」と「通知時間」を選ぶだけで、毎朝（または好きな時間に）パーソナライズされた天気メッセージが LINE に届きます。

---

## デモ

ユーザーに届く LINE メッセージの例：

```
【北海道 札幌市の今日の天気】
天気: 雨
最高気温: 16℃
最低気温: 10.9℃
降水確率: 94%

🤖 天気予報botからのひと言:
札幌市の今日は一日を通して雨の予報です。最高気温は16度と肌寒く感じ
られますので、温かい上着を羽織ってお出かけくださいね。降水確率は
94%と大変高くなっておりますので、どうぞ傘をお忘れなく。
```

> 「ひと言」部分は固定文ではなく、その日の天気データをもとに **Google Gemini** が毎回生成しています。

---

## 主な機能

- **全国どこでも地名検索**：設定画面（LIFF）で市区町村名を入力 → ジオコーディング API で候補を取得し、全国どこでも通知地点に設定可能
- **現在地から自動設定**：GPS（位置情報）で現在地を取得し、逆ジオコーディングで地名も自動入力
- **時刻の設定**：通知する時間を 1 時間単位で選択
- **時間指定の自動通知**：毎時実行のスケジューラが、設定時刻に一致したユーザーへ送信
- **天気・降水確率の取得**：Open-Meteo API から当日の天気・最高/最低気温・降水確率を取得して通知
- **AI によるひと言生成**：天気・気温データ（降水確率を含む）を Gemini に渡し、アナウンサー調の柔らかいアドバイスを自動生成（気温に応じた服装の提案、雨の日は傘の案内）
- **フォールバック設計**：AI が一時的に応答しない場合でも、予備メッセージで通知が止まらない

---

## アーキテクチャ

```
[ユーザー]
   │  ① LINE で設定画面(LIFF)を開き、場所・時刻を選択
   ▼
[Firebase Hosting]  public/index.html (LIFF アプリ)
   │  ② 設定を POST
   ▼
[Cloud Functions] saveSettings  ──保存──▶ [Firestore] users コレクション
                                                  ▲
[Cloud Functions] scheduledWeatherBot             │ ③ 毎時0分に実行
   │  ・現在時刻に一致するユーザーを Firestore から検索
   │  ・Open-Meteo API で天気を取得
   │  ・Gemini API でひと言を生成
   ▼
[LINE Messaging API] push  ──▶ [ユーザーの LINE に通知]
```

---

## 技術スタック

| 区分 | 使用技術 |
|------|----------|
| 言語 / 実行環境 | Node.js 24 |
| サーバーレス | Firebase Cloud Functions (2nd Gen) |
| データベース | Cloud Firestore |
| ホスティング | Firebase Hosting |
| フロントエンド | LIFF (LINE Front-end Framework) / HTML / JavaScript |
| 外部 API | LINE Messaging API ・ Google Gemini API ・ Open-Meteo API |
| 主なライブラリ | `@google/generative-ai` ・ `axios` ・ `firebase-admin` |

---

## ディレクトリ構成

```
weather-bot/
├── functions/
│   ├── index.js          # Cloud Functions 本体（saveSettings / scheduledWeatherBot）
│   ├── package.json
│   └── .env.example      # 必要な環境変数の見本（実際の鍵は .env に置き、Git管理外）
├── public/
│   └── index.html        # 設定画面（LIFF アプリ）
├── firebase.json         # Firebase の設定
├── index.js              # 初期プロトタイプ（単体実行版・固定地点での通知）
└── README.md
```

---

## セットアップ

> このリポジトリを自分の環境で動かす場合の手順です。

1. 依存パッケージのインストール
   ```bash
   cd functions
   npm install
   ```

2. 環境変数の設定
   `functions/.env.example` をコピーして `functions/.env` を作成し、各キーを設定します。
   ```bash
   cp .env.example .env
   ```
   | 変数 | 説明 |
   |------|------|
   | `LINE_CHANNEL_ACCESS_TOKEN` | LINE Messaging API のチャネルアクセストークン |
   | `LINE_USER_ID` | テスト送信先のユーザー ID |
   | `GEMINI_API_KEY` | Google AI Studio で発行した Gemini API キー |

3. デプロイ
   ```bash
   npm run deploy
   ```

---

## 工夫した点・学んだこと

- **固定メッセージから AI 生成への発展**：当初は天気コードごとの固定文だった通知を、Gemini を組み込んで毎回異なる自然な文章を生成する形に拡張しました。
- **通知が止まらない設計**：AI API のエラー時にもフォールバック文で通知を継続するよう、`try/catch` で安全網を実装しています。
- **一時的な混雑への耐性**：朝などアクセスが集中する時間帯に Gemini が `503`（高負荷）を返す問題を、実際のログから特定。待ち時間を伸ばしながら数回再試行する指数バックオフを実装し、一時的な混雑では予備メッセージに落ちないよう改善しました。
- **サーバーレス + スケジューラ**：常時起動のサーバーを持たず、Cloud Functions のスケジュール実行だけで「指定時刻通知」を実現しました。
- **秘密情報の分離**：API キーやトークンは `.env` に隔離し、`.gitignore` で確実に Git 管理外としています。
