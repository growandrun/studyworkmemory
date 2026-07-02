# 📒 공부 & 업무 기록 — GitHub + Vercel 버전

폰·PC 어디서든 접속해 기록하면 **구글 시트에 실시간 저장**되는 개인 서비스입니다.
한 번만 세팅하면, 이후엔 **코드 수정 → `git push`** 만으로 Vercel이 자동 배포합니다. (복붙 재배포 없음)

```
study-work-vercel/
├── index.html          # 화면 (Pretendard · 파스텔 · 목록/달력)
├── fonts/*.woff2        # Pretendard 서브셋 (zip)
├── api/records.js       # 서버리스 API (구글 시트 읽기/쓰기)
├── package.json         # googleapis 의존성
├── .env.example         # 환경변수 예시
└── .gitignore
```

동작 구조: **브라우저 → `/api/records` (Vercel 함수) → 구글 시트 API → 내 시트**

---

## ⚡ 처음 한 번만 (약 10분)

### A. 구글 시트 만들기
1. [sheets.new](https://sheets.new) 로 빈 시트 생성
2. 주소창의 `https://docs.google.com/spreadsheets/d/`**`이부분`**`/edit` 에서 **시트 ID** 복사해두기
   - `기록` 탭과 제목 줄은 앱이 자동으로 만들어 줍니다.

### B. 서비스 계정 만들기 (앱이 시트에 접근할 열쇠)
1. [Google Cloud Console](https://console.cloud.google.com/) 접속 → 상단에서 **새 프로젝트** 생성
2. **APIs & Services → Library** 에서 **Google Sheets API** 검색 → **사용 설정(Enable)**
3. **APIs & Services → Credentials → Create Credentials → Service account**
   - 이름 아무거나 (예: `study-bot`) → 만들기 → 완료
4. 만들어진 서비스 계정 클릭 → **Keys 탭 → Add key → Create new key → JSON** → 키 파일이 다운로드됩니다.
   - 이 JSON 안에 `client_email` 과 `private_key` 값이 들어 있어요. (곧 사용)
5. **A에서 만든 구글 시트를 이 서비스 계정과 공유**:
   - 시트 우상단 **공유** → JSON의 `client_email` 주소(예: `study-bot@...iam.gserviceaccount.com`)를 **편집자**로 추가

### C. GitHub 에 올리기
이 폴더는 이미 git 커밋이 되어 있습니다. 새 저장소만 연결해 push 하면 됩니다.

- **방법 1 (권장·GitHub CLI):** 이 폴더에서
  ```bash
  gh repo create study-work-tracker --private --source=. --push
  ```
- **방법 2 (수동):** [github.com/new](https://github.com/new) 에서 빈 저장소 생성 후, 이 폴더에서
  ```bash
  git remote add origin https://github.com/<내아이디>/study-work-tracker.git
  git branch -M main
  git push -u origin main
  ```

### D. Vercel 에 배포
1. [vercel.com](https://vercel.com) 에 **GitHub 계정으로 로그인**
2. **Add New → Project** → 방금 만든 GitHub 저장소 **Import**
3. 설정은 기본값 그대로 (프레임워크 없음/Other). 아직 **Deploy 누르기 전에** 아래 환경변수부터 입력:
4. **Environment Variables** 에 3개 추가:

   | 이름 | 값 |
   |------|-----|
   | `SHEET_ID` | A에서 복사한 시트 ID |
   | `GOOGLE_SERVICE_ACCOUNT_EMAIL` | JSON의 `client_email` |
   | `GOOGLE_PRIVATE_KEY` | JSON의 `private_key` **값 전체** (`-----BEGIN...` 부터 `...END PRIVATE KEY-----\n` 까지, 따옴표 없이 붙여넣기) |

   > `private_key` 는 `\n` 이 그대로 들어간 긴 문자열입니다. JSON에 보이는 그대로 복사해 붙여넣으면 코드가 알아서 처리합니다.
5. **Deploy** 클릭 → 잠시 후 `https://study-work-tracker.vercel.app` 같은 주소가 나옵니다.

### E. 폰·PC에서 사용
- **PC**: 주소를 북마크
- **아이폰(사파리)**: 공유 → **홈 화면에 추가**
- **안드로이드(크롬)**: ⋮ → **홈 화면에 추가**

이제 어디서 입력해도 같은 구글 시트에 저장됩니다. 🎉

---

## 🔁 이후 수정할 때 (자동 배포)
코드를 고친 뒤:
```bash
git add .
git commit -m "수정 내용"
git push
```
→ Vercel이 자동으로 새로 배포합니다. **복붙·수동 재배포 없음.**

---

## 🧪 (선택) 내 컴퓨터에서 미리 돌려보기
```bash
npm install -g vercel     # 최초 1회
npm install               # googleapis 설치
vercel dev                # http://localhost:3000
```
- 로컬에서 시트 연동까지 테스트하려면 `.env.example` 을 복사해 `.env.local` 을 만들고 값을 채우세요.

## ❓ 문제 해결
- **화면은 뜨는데 "불러오지 못했어요"** → 환경변수 3개가 맞는지, 시트를 서비스 계정과 **공유**했는지 확인
- **403 / permission** → B-5(시트 공유)를 안 한 경우가 대부분
- **private key 관련 오류** → `GOOGLE_PRIVATE_KEY` 를 따옴표 없이, `\n` 포함해 통째로 넣었는지 확인
- **환경변수를 바꿨는데 반영 안 됨** → Vercel 대시보드에서 **Redeploy** 한 번 실행
