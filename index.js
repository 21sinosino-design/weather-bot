// index.js

// 1. 【セキュリティ】一番最初に .env ファイルの中身を読み込む設定
require('dotenv').config();
const axios = require('axios');

// 天気コードの辞書（前回と同じ）
const weatherCodeMap = {
  0: '快晴', 1: '晴れ', 2: '一部曇り', 3: '曇り', 45: '霧', 48: '霧氷',
  51: '小雨', 53: '雨', 55: '大雨', 61: '小雨', 63: '雨', 65: '大雨',
  71: '小雪', 73: '雪', 75: '大雪', 80: 'にわか雨', 95: '雷雨'
};

async function getWeatherAndNotify() {
  try {
    // --- 1. 天気データの取得（前回と同じ） ---
    console.log('APIから天気データを取得しています...');
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=33.3785&longitude=130.5186&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Asia%2FTokyo';
    
    const response = await axios.get(url);
    const tomorrowMaxTemp = response.data.daily.temperature_2m_max[1];
    const tomorrowMinTemp = response.data.daily.temperature_2m_min[1];
    const tomorrowWeatherCode = response.data.daily.weather_code[1];
    const weatherText = weatherCodeMap[tomorrowWeatherCode] || '不明な天気';

    // LINEに送るメッセージの文章を作成（\n は改行を意味します）
    const messageText = `【明日の天気予報】\n天気: ${weatherText}\n最高気温: ${tomorrowMaxTemp}℃\n最低気温: ${tomorrowMinTemp}℃`;
    
    console.log('以下のメッセージをLINEに送信します:\n' + messageText);

    // --- 2. LINEへの通知送信 ---
    console.log('LINEへ送信中...');

    // LINEの「プッシュメッセージ（こちらから一方的に送る）」用URL
    const lineApiUrl = 'https://api.line.me/v2/bot/message/push';

    // axios.post を使ってLINEへデータを送る
    await axios.post(
      lineApiUrl,
      {
        to: process.env.LINE_USER_ID, // .envに書いた自分のユーザーID
        messages: [
          {
            type: 'text',
            text: messageText // 先ほど作った文章
          }
        ]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` // .envに書いたトークン（鍵）
        }
      }
    );

    console.log('LINEへの通知が大成功しました！スマートフォンのLINEを確認してください。');

  } catch (error) {
    // LINEのAPIからエラーが返ってきた場合、詳細を表示する
    if (error.response) {
      console.error('LINE APIエラー:', error.response.data);
    } else {
      console.error('エラーが発生しました:', error.message);
    }
  }
}

// 実行
getWeatherAndNotify();
