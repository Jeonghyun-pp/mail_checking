# Deployment — Oracle Cloud Always Free + Tailscale (월 $0)

mailchecking을 팀(≤3명)이 공유하는 단일 인스턴스로 띄우는 가이드.
공개 노출 없이 Tailscale 사설망으로만 접속한다.

```
[Oracle ARM VM]  docker compose
  ├─ postgres   ─┐
  ├─ redis      ─┤  내부 네트워크
  ├─ app  (next start)  127.0.0.1:3000
  └─ worker (tsx worker)
        ↑
   tailscale serve  →  https://mailchecking.<tailnet>.ts.net  (팀원만 접속)
```

비용: VM $0 (Always Free) · Tailscale $0 (3명 이하) · 도메인/TLS $0.

---

## 사전 준비 (로컬, 한 번)

VM에서 코드를 받으려면 **private Git 저장소**가 필요하다.

```powershell
# 프로젝트 루트에서 — 현재 작업을 모두 커밋
git add -A
git commit -m "Add production deployment setup"
# GitHub/GitLab에 private repo를 만들고 remote 등록 후 push
git remote add origin <your-private-repo-url>
git push -u origin master
```

> `.env.production` 은 `.gitignore` 처리됨 — 절대 커밋되지 않는다.

---

## 1단계 — Oracle Cloud VM 생성

1. https://cloud.oracle.com 가입 (무료. 신용카드 등록은 본인확인용이며 Always Free 자원은 과금되지 않는다).
2. **Compute → Instances → Create Instance**
   - **Image**: Canonical Ubuntu 24.04
   - **Shape**: *Ampere* → `VM.Standard.A1.Flex` → **2 OCPU / 12 GB RAM**
     (Always Free 한도는 합산 4 OCPU / 24 GB — 이 안에서 자유롭게)
   - **SSH keys**: 로컬 공개키 업로드 (`~/.ssh/id_ed25519.pub`. 없으면 `ssh-keygen -t ed25519`)
   - **Networking**: 기본값. 퍼블릭 IP는 최초 SSH 접속용으로만 쓴다.
3. 생성 후 퍼블릭 IP 확인.

> **ARM 용량 부족(Out of capacity)** 오류가 나면: 다른 Availability Domain 선택, OCPU를 1로 낮춰 재시도, 또는 잠시 후 재시도. 인기 리전에서 흔하다.

---

## 2단계 — VM 기본 설정

```bash
ssh ubuntu@<퍼블릭-IP>

# Docker 설치
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu
exit            # docker 그룹 적용을 위해 재접속
ssh ubuntu@<퍼블릭-IP>

docker --version          # 동작 확인
```

---

## 3단계 — Tailscale 설치 + HTTPS 노출

```bash
# 설치
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up         # 출력된 URL을 브라우저로 열어 본인 계정으로 로그인
```

Tailscale **관리 콘솔**(login.tailscale.com)에서:
- **DNS → MagicDNS** 활성화
- **DNS → HTTPS Certificates** 활성화
- **Machines** 에서 이 VM 이름을 `mailchecking` 으로 변경

그다음 VM에서 앱 포트를 tailnet에 노출:

```bash
sudo tailscale serve --bg 3000
sudo tailscale serve status      # https://mailchecking.<tailnet>.ts.net 확인
```

이 `<tailnet>.ts.net` 주소가 최종 접속 URL이다. 이후 단계에서 사용한다.

> 공개 인터넷에는 아무 포트도 열지 않는다. Tailscale은 WireGuard로 동작하므로 Oracle 방화벽 인그레스 규칙이 필요 없다.

---

## 4단계 — 앱 배포

```bash
git clone <your-private-repo-url> mail_checking
cd mail_checking

cp .env.production.example .env.production
nano .env.production
```

`.env.production` 채울 값:

| 키 | 값 |
|----|----|
| `POSTGRES_PASSWORD` | `openssl rand -hex 24` 결과 |
| `AUTH_SECRET` | `openssl rand -hex 32` 결과 (**반드시 교체** — 세션 위조 방지) |
| `APP_URL` | `https://mailchecking.<tailnet>.ts.net` (3단계의 실제 주소) |
| `VERIFY_HELO_DOMAIN` / `VERIFY_MAIL_FROM` | 가능하면 본인이 통제하는 도메인 |

빌드 + 기동 (Prisma 엔진이 VM의 arm64로 빌드된다):

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

> 자주 쓰는 명령이 길다 — 셸 alias를 걸어두면 편하다:
> ```bash
> echo "alias mc='docker compose --env-file .env.production -f docker-compose.prod.yml'" >> ~/.bashrc && source ~/.bashrc
> ```
> 이후 `mc ps`, `mc logs -f app worker`, `mc up -d --build` 처럼 사용.

확인:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f app worker
```

`migrate` 서비스가 마이그레이션을 적용한 뒤 종료(Exit 0)되고, `app`·`worker`·`postgres`·`redis`가 모두 Up 상태면 정상.

---

## 5단계 — 첫 관리자 계정

브라우저(Tailscale 연결된 상태)에서 `https://mailchecking.<tailnet>.ts.net/signup` 접속.
**최초 가입 계정은 초대코드 없이 자동으로 ADMIN**이 된다.

이후 팀원 가입에는 ADMIN이 발급한 1회용 InviteCode가 필요하다 (Settings에서 발급).

---

## 6단계 — 자동 백업

```bash
chmod +x scripts/backup-db.sh
crontab -e
```

추가 (매일 새벽 3시, 최근 14개 보관):

```cron
0 3 * * * cd /home/ubuntu/mail_checking && ./scripts/backup-db.sh >> backups/backup.log 2>&1
```

복구가 필요하면:

```bash
gunzip -c backups/db-YYYYMMDD-HHMMSS.sql.gz | \
  docker compose --env-file .env.production -f docker-compose.prod.yml \
  exec -T postgres psql -U mailchecking -d mailchecking
```

---

## 팀원 온보딩 (각 1회)

**ADMIN이 준비:**
1. Tailscale 관리 콘솔에서 팀원을 tailnet에 초대 (**Users → Invite**). 무료 플랜은 3명까지.
2. 앱 **Settings**에서 팀원용 InviteCode 발급.
3. 앱 **Settings → API Keys**에서 팀원용 API 키 발급(`mk_...`).

**팀원이 직접:**
1. 본인 기기에 Tailscale 설치 후 초대 수락 → tailnet 합류.
2. `https://mailchecking.<tailnet>.ts.net/signup` 에서 InviteCode로 가입.
3. 본인 Claude Code에 MCP 서버 등록:
   ```bash
   claude mcp add mailchecking --transport http \
     https://mailchecking.<tailnet>.ts.net/api/mcp \
     --header "Authorization: Bearer mk_발급받은_키"
   ```
4. 발송에 쓸 메일함을 앱 **Accounts**에서 SMTP/IMAP 자격증명으로 연결하고 워밍업 시작.

> 발송은 각자 연결한 메일함을 통해 나간다 — 앱 차원의 공용 SMTP는 없다.

---

## 운영

**업데이트 배포** (마이그레이션은 `migrate` 서비스가 자동 적용):
```bash
cd ~/mail_checking
git pull
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

**로그 확인:**
```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f app worker
```

**비밀번호 재설정:**
```bash
docker compose --env-file .env.production -f docker-compose.prod.yml \
  exec app npx tsx scripts/set-password.ts <email> <new-password>
```

**접근 차단:** 앱 Settings에서 API 키를 폐기하거나, Tailscale 콘솔에서 해당 사용자/기기를 제거.
