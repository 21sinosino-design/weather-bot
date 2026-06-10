// functions/index.js

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const axios = require("axios");
const cors = require("cors")({ origin: true });

// 💡追加: Gemini APIのパッケージを読み込む
const { GoogleGenerativeAI } = require("@google/generative-ai");

if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = admin.firestore();
require("dotenv").config();

// 💡追加: Gemini AIの準備（.envから鍵を読み込む）
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const weatherCodeMap = {
  0: '快晴', 1: '晴れ', 2: '一部曇り', 3: '曇り', 45: '霧', 48: '霧氷',
  51: '小雨', 53: '雨', 55: '大雨', 61: '小雨', 63: '雨', 65: '大雨',
  71: '小雪', 73: '雪', 75: '大雪', 80: 'にわか雨', 95: '雷雨'
};

// ===================================================================
// ① 【受取窓口】（前回から変更なし）
// ===================================================================
exports.saveSettings = onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      if (req.method !== "POST") return res.status(405).send("POSTのみ許可");
      const { userId, time, lat, lng, locationName } = req.body;
      if (!userId || !time || !lat || !lng) return res.status(400).send("データ不足");

      await db.collection("users").doc(userId).set({
        userId, notificationTime: time, lat, lng, locationName,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      res.status(200).send({ success: true, message: "設定を保存しました" });
    } catch (error) {
      console.error("保存エラー:", error);
      res.status(500).send({ success: false, error: "サーバーエラー" });
    }
  });
});

// ===================================================================
// ② 【新・AI搭載Bot】天気データを元にGeminiにアドバイスを作らせる
// ===================================================================
exports.scheduledWeatherBot = onSchedule({
  schedule: "0 * * * *",
  timeZone: "Asia/Tokyo"
}, async (event) => {
  try {
    const jstDate = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
    const currentHour = String(jstDate.getUTCHours()).padStart(2, '0');
    const timeToSearch = `${currentHour}:00`;

    const usersSnapshot = await db.collection("users").where("notificationTime", "==", timeToSearch).get();
    if (usersSnapshot.empty) return;

    const lineApiUrl = 'https://api.line.me/v2/bot/message/push';
    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;

    for (const doc of usersSnapshot.docs) {
      const { userId, lat, lng, locationName } = doc.data();

      // 天気データの取得（当日分・降水確率を含む）
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FTokyo`;
      const response = await axios.get(weatherUrl);
      const daily = response.data.daily;

      const todayMaxTemp = daily.temperature_2m_max[0];
      const todayMinTemp = daily.temperature_2m_min[0];
      const todayWeatherCode = daily.weather_code[0];
      const todayPrecip = daily.precipitation_probability_max[0];
      const weatherText = weatherCodeMap[todayWeatherCode] || '不明な天気';
      const pp = (v) => (v == null ? '--' : v); // 降水確率が無い日の安全表示

      // 💡変更: 固定のif文を消して、Gemini API に指示（プロンプト）を出す
      let aiAdvice = "";
      try {
        // 高速で軽量な gemini-1.5-flash モデルを使用
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        // AIへの指示書（プロンプト設計）
        const prompt = `あなたは優秀なお天気アシスタントです。
        以下の今日の天気データをもとに、LINEで送るための短いお出かけアドバイスを2〜3文で作成してください。
        場所: ${locationName}
        天気: ${weatherText}
        最高気温: ${todayMaxTemp}度
        最低気温: ${todayMinTemp}度
        降水確率: ${pp(todayPrecip)}%
        条件:
        - ニュースのアナウンサーのような柔らかいトーンで出力してください。
        - 気温に応じた服装のアドバイス（例: 上着が必要、薄着で快適、重ね着がおすすめ など）を必ず一言添えてください。
        - 降水確率が高い場合は傘の用意をやさしく促してください。`;

        // AIにテキストを生成させる（ここで少し待ちます）
        const result = await model.generateContent(prompt);
        aiAdvice = result.response.text();
      } catch (aiError) {
        console.error("Gemini APIエラー:", aiError);
        // 万が一AIがダウンしていた場合の安全網（フォールバック）
        aiAdvice = "今日も一日がんばりましょう！"; 
      }

      // 最終的なメッセージの組み立て
      const messageText = `【${locationName}の今日の天気】\n天気: ${weatherText}\n最高気温: ${todayMaxTemp}℃\n最低気温: ${todayMinTemp}℃\n降水確率: ${pp(todayPrecip)}%\n\n🤖 天気予報botからのひと言:\n${aiAdvice}`;

      await axios.post(lineApiUrl, {
        to: userId,
        messages: [{ type: 'text', text: messageText.trim() }]
      }, {
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
      });
      
      console.log(`ユーザー ${userId} にAIメッセージを送信しました！`);
    }
  } catch (error) {
    console.error("定期実行エラー:", error);
  }
});