var ACCESS_TOKEN = "ここにLine DevからTOKENを追加";
var URL = "https://api.line.me/v2/bot/message/reply";
var SS_ID = "スプレッドシートのID";
var PUSH = "https://api.line.me/v2/bot/message/push";
var REPLY = "https://api.line.me/v2/bot/message/reply";
var line_endpoint = 'https://api.line.me/v2/bot/message/reply';
var ID = 'スプレッドシートのID';
var HistorySheet = SpreadsheetApp.openById(SS_ID).getSheets()[0];

// 軽減率。キー：入力用省略文字列、　detail：詳細文字列、　rate：計算用軽減率。
// 個数は、3の倍数とする。（各カラム同数でないとカルーセル構築時にエラーになるため）
const DAMAGES = {
  "25%×25%": { "detail": "25%×25%", "rate": 0.5625 },
  "25%×35%": { "detail": "25%×35%", "rate": 0.4875 },
  "25%×50%": { "detail": "25%×50%", "rate": 0.375 },
  "25%×70%": { "detail": "25%×70%", "rate": 0.225 },
  "25%×50%×50%": { "detail": "25%×50%×50%", "rate": 0.1875 },
  "30%×30%": { "detail": "", "rate": 0.49 },
  "30%×30%×30%": { "detail": "30%×30%×30%", "rate": 0.343 },
  "30%×30%×35%": { "detail": "30%×30%×35%", "rate": 0.3185 },
  "30%×30%×50%×50%": { "detail": "30%×30%×50%×50%", "rate": 0.1225 },
  "30%×70%×70%": { "detail": "", "rate": 0.063 },
  "35%×35%": { "detail": "35%×35%", "rate": 0.4225 },
  "35%×50%": { "detail": "35%×50%", "rate": 0.325 },
  "35%×35%×50%": { "detail": "35%×35%×50%", "rate": 0.21125 },
  "35%×50%×50%": { "detail": "35%×50%×50%", "rate": 0.1625 },
  "35%×75%×75%": { "detail": "35%×35%×75%×75%", "rate": 0.040625 },
  "35%×35%×75%×75%": { "detail": "35%×35%×75%×75%", "rate": 0.02640625 },
  "50%×50%": { "detail": "50%×50%", "rate": 0.25 },
  "50%×70%": { "detail": "50%×70%", "rate": 0.15 },
  "70%×70%": { "detail": "70%×70%", "rate": 0.09 },
  "75%×75%": { "detail": "75%×75%", "rate": 0.0625 },
  "---": { "detail": "---", "rate": 0 },  // ３の倍数に揃えるためのプレースホルダ
  //"----":{ "detail": "---", "rate": 0 }, // ２個不足する場合の２個めのプレースホルダ  
}


function doPost(e) {
  Logger.log("=== doPost is called ===");
  Logger.log(JSON.stringify(e));
  var contents = e.postData.contents;
  var obj = JSON.parse(contents);
  var events = obj["events"];
  for (var i = 0; i < events.length; i++) {
    if (events[i].type == "message" && events[i].message.type == "text") {
      reply_message(events[i]);
    }
  }
  return ContentService.createTextOutput("OK");
}


function normalReply(e, reply_text){
  return {
    "replyToken": e.replyToken,
    "messages": [{
      "type": "text",
      "text": reply_text
    }]
  }
}


// 計算の答えを返す。input_rate：軽減率。input_hp：HP。
function buildAnswerReply(input_rate, input_hp){
  const damage = DAMAGES[input_rate]
  if(damage == null) return "ERROR";
  const detail = damage.detail;
  const rate = damage.rate;
  return input_hp + "の 軽減率" + detail + "での実質HPは\n約" + Math.floor(input_hp / rate) + "です。";
}


// HP入力を促すダイアログを返す。input_rate:軽減率。
function buildRequestReply(input_rate){
  const damage = DAMAGES[input_rate]
  if(damage == null) return "ERROR";
  const detail = damage.detail;
  return "軽減率" + detail + "で計算します。\n計算したいパーティーの最大HPを、半角英数字でカンマ区切りをせずに入力してください。";
}


function reply_message(e) {
  const input_text = e.message.text;
  let reply_text = "";
  let postData = null;
  const userId = e.source.userId;
  const history = getLastUserHistory(userId);
  // 入力の続き
  if (history && history.continuous) {
    reply_text = buildAnswerReply(history.text, input_text);
    if (reply_text == "ERROR") return;
    postData = normalReply(e, reply_text)
    setLastUserHistory(userId, input_text, false);
  } else { // 新規入力
    if (input_text == "軽減率一覧") {
      // カルーセルを表示
      postData = createCarousel(e)
    } else if (input_text.startsWith("---")) {
      // プレースホルダーをタップしたとき
      return;
    } else {
      reply_text = buildRequestReply(input_text)
      if (reply_text == "ERROR") return;
      postData = normalReply(e, reply_text)
    } 
    if (reply_text)
      setLastUserHistory(userId, input_text, true);
    else 
      setLastUserHistory(userId, input_text, false);
  }    
    
  if (!postData) return;
  
  const options = {
    "method": "post",
    "headers": {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + ACCESS_TOKEN
    },
    "payload": JSON.stringify(postData)
  };
  const response = UrlFetchApp.fetch(URL, options);

  if (response.getResponseCode() !== 200) {
    values = response.getContentText()
    HistorySheet.appendRow(values);
    throw new Error(response.getContentText());
  }
}


function getLastUserHistory(userId) {
  const userHistory = HistorySheet.getDataRange().getValues();
  for (let i = userHistory.length - 1; 0 < i; i--) {
    if (userHistory[i][1] === userId) {
      return {
        date: userHistory[i][0],
        userId: userHistory[i][1],
        text: userHistory[i][2],
        continuous: userHistory[i][3]
      };
    }
  }
  return undefined;
}


function setLastUserHistory(userId, text, continuous) {
  const values = [new Date(), userId, text, continuous];
  HistorySheet.appendRow(values);
}


// カルーセルを構築する。
function createCarousel(e){
  const dmgarray = Object.keys(DAMAGES);
  const dmgitems = dmgarray.map((k)=> {return {"type":"message", "label":k, "text":k}})
  const itemsPerPage = 3; //１つのカラム内のアイテムの数。最大3（LINE APIの仕様）各カラム同数でないとエラー。
  const pages = Math.ceil(dmgarray.length / itemsPerPage); // カラムの数
  const columns = []
  // dmgitemsを３つずつ区切ってcolumnsに格納。
  for(let page = 0; page < pages; page++){
    columns.push({
      "title": "軽減率一覧",
      "text": "ページ " + (page+1) + " を選択",
      "actions": dmgitems.slice(page * itemsPerPage, (page+1) * itemsPerPage)
    });
  }
  return {
    "replyToken": e.replyToken,
    "messages": [{
      "type": "template",
      "altText": "軽減率計算",
      "template": {
        "type": "carousel",
        "columns": columns
      }
    }]
  };
}
