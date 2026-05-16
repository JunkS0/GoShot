# 고총 전술전 배포 방법

## GitHub Pages

1. 이 ZIP 안의 파일을 GitHub 저장소 루트에 올립니다.
2. GitHub 저장소의 Settings > Pages에서 `main` 브랜치와 `/root`를 선택합니다.
3. Pages 주소가 열리면 게임 클라이언트가 실행됩니다.

## Render 멀티플레이 서버

1. 같은 저장소를 Render에 연결합니다.
2. Render가 `render.yaml`을 감지하면 Web Service가 만들어집니다.
3. 배포가 끝난 뒤 Render 주소를 복사합니다.
4. 게임 화면 왼쪽 위의 멀티 서버 칸에 주소를 넣습니다.

Render 설정을 직접 입력하는 경우:

```text
Build Command: yarn install
Start Command: yarn start
```

전에 실패한 서비스가 이미 있으면 Render 대시보드의 Start Command가 `start:server`처럼 직접 명령으로 남아 있지 않은지 확인하고, 반드시 `yarn start`로 바꿉니다.

주소 예시:

```text
wss://kotgun-multiplayer-server.onrender.com
```

`https://` 주소를 넣어도 게임이 자동으로 `wss://`로 바꿔서 접속합니다.

## 로컬 테스트

```bash
yarn install
yarn start
```

다른 터미널에서 클라이언트를 엽니다.

```bash
python -m http.server 5177
```

브라우저에서 `http://localhost:5177/`로 접속하면 됩니다.
