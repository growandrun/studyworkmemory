// Vercel 서버리스 함수 — 구글 시트를 DB처럼 사용 (서비스 계정 인증)
//   GET    /api/records            → 전체 기록(최신순)
//   POST   /api/records            → 추가   (body: 기록)
//   PUT    /api/records            → 수정   (body: id 포함 기록)
//   PATCH  /api/records            → 상태변경 (body: { id, status })
//   DELETE /api/records            → 삭제   (body: { id })
// 모든 변경 요청은 갱신된 전체 목록을 반환합니다.

const { google } = require('googleapis');

const SHEET_NAME = '기록';
const HEADERS = ['ID', '유형', '제목', '분류', '날짜', '상태', '소요(분)', '메모', '등록일시', '수정일시'];
const RANGE_ALL = `${SHEET_NAME}!A2:J`;

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let key = process.env.GOOGLE_PRIVATE_KEY || '';
  // Vercel 환경변수에 개행이 \n 문자열로 저장되는 경우 실제 줄바꿈으로 복원
  if (key.indexOf('\\n') !== -1) key = key.replace(/\\n/g, '\n');
  return new google.auth.JWT(email, null, key, ['https://www.googleapis.com/auth/spreadsheets']);
}

async function sheetsClient() {
  const auth = getAuth();
  await auth.authorize();
  return google.sheets({ version: 'v4', auth });
}

const SHEET_ID = process.env.SHEET_ID;

function p2(n) { return String(n).padStart(2, '0'); }
function nowKST() {
  const d = new Date(Date.now() + 9 * 3600 * 1000); // UTC → KST
  return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()) +
         ' ' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes());
}
function todayKST() { return nowKST().slice(0, 10); }

// '기록' 탭과 헤더가 없으면 만들어 준다. 탭의 숫자 sheetId 도 반환.
async function ensureSheet(sheets) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  let sheet = meta.data.sheets.find(s => s.properties.title === SHEET_NAME);
  if (!sheet) {
    const res = await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: SHEET_NAME } } }] },
    });
    const props = res.data.replies[0].addSheet.properties;
    sheet = { properties: props };
  }
  const head = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${SHEET_NAME}!A1:J1` });
  if (!head.data.values || head.data.values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: `${SHEET_NAME}!A1`, valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] },
    });
  }
  return sheet.properties.sheetId;
}

function rowToRecord(row) {
  return {
    id: String(row[0] || ''),
    type: row[1] || '',
    title: row[2] || '',
    category: row[3] || '',
    date: row[4] || '',
    status: row[5] || '',
    minutes: row[6] || '',
    memo: row[7] || '',
    createdAt: row[8] || '',
    updatedAt: row[9] || '',
  };
}

async function getRows(sheets) {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: RANGE_ALL });
  return res.data.values || [];
}

async function listRecords(sheets) {
  const rows = await getRows(sheets);
  return rows.map(rowToRecord).reverse(); // 아래(최신) → 위로
}

// id 로 실제 시트 행번호(1-based, 헤더 포함) 찾기
function findRowIndex(rows, id) {
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) return i + 2; // +2: 헤더(1) + 0-index 보정
  }
  return -1;
}

async function addRecord(sheets, d) {
  const now = nowKST();
  const id = 'R' + Date.now();
  const row = [
    id, d.type || '공부', d.title || '', d.category || '',
    d.date || todayKST(), d.status || '예정',
    d.minutes || '', d.memo || '', now, now,
  ];
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID, range: RANGE_ALL, valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS', requestBody: { values: [row] },
  });
  return listRecords(sheets);
}

async function updateRecord(sheets, d) {
  const rows = await getRows(sheets);
  const rowNum = findRowIndex(rows, d.id);
  if (rowNum === -1) throw new Error('기록을 찾을 수 없습니다: ' + d.id);
  const existing = rows[rowNum - 2];
  const createdAt = existing[8] || nowKST();
  const row = [
    d.id, d.type || '공부', d.title || '', d.category || '',
    d.date || todayKST(), d.status || '예정',
    d.minutes || '', d.memo || '', createdAt, nowKST(),
  ];
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID, range: `${SHEET_NAME}!A${rowNum}:J${rowNum}`,
    valueInputOption: 'USER_ENTERED', requestBody: { values: [row] },
  });
  return listRecords(sheets);
}

async function updateStatus(sheets, id, status) {
  const rows = await getRows(sheets);
  const rowNum = findRowIndex(rows, id);
  if (rowNum === -1) throw new Error('기록을 찾을 수 없습니다: ' + id);
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: [
        { range: `${SHEET_NAME}!F${rowNum}`, values: [[status]] },
        { range: `${SHEET_NAME}!J${rowNum}`, values: [[nowKST()]] },
      ],
    },
  });
  return listRecords(sheets);
}

async function deleteRecord(sheets, sheetTabId, id) {
  const rows = await getRows(sheets);
  const rowNum = findRowIndex(rows, id);
  if (rowNum === -1) throw new Error('기록을 찾을 수 없습니다: ' + id);
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: { sheetId: sheetTabId, dimension: 'ROWS', startIndex: rowNum - 1, endIndex: rowNum },
        },
      }],
    },
  });
  return listRecords(sheets);
}

module.exports = async function handler(req, res) {
  try {
    if (!SHEET_ID || !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
      res.status(500).send('환경변수(SHEET_ID / GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY)가 설정되지 않았습니다.');
      return;
    }

    const sheets = await sheetsClient();
    const sheetTabId = await ensureSheet(sheets);

    let body = req.body;
    if (typeof body === 'string' && body) { try { body = JSON.parse(body); } catch (_) { body = {}; } }
    body = body || {};

    let result;
    switch (req.method) {
      case 'GET':    result = await listRecords(sheets); break;
      case 'POST':   result = await addRecord(sheets, body); break;
      case 'PUT':    result = await updateRecord(sheets, body); break;
      case 'PATCH':  result = await updateStatus(sheets, body.id, body.status); break;
      case 'DELETE': result = await deleteRecord(sheets, sheetTabId, body.id); break;
      default:
        res.setHeader('Allow', 'GET, POST, PUT, PATCH, DELETE');
        res.status(405).send('허용되지 않은 메서드: ' + req.method);
        return;
    }
    res.status(200).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).send((err && err.message) || '서버 오류');
  }
};
