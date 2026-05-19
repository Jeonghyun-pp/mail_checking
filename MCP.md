# mailchecking MCP Server

The app exposes its capabilities as an **MCP server**, so any teammate can
drive it from their own Claude Code / Codex / Cursor — in natural language.
Web search and crawling are done by *their* assistant; mailchecking provides
the verify / save / campaign / CRM tools.

- **Endpoint:** `http://localhost:3000/api/mcp` (Streamable HTTP)
- **Auth:** workspace API key as a Bearer token
- **Tools:** 28 (see list below)

## Setup (each teammate, once)

1. In the app, open **Settings & API → API Keys**, create a key, copy it.
2. Add the server to your assistant:

**Claude Code**
```bash
claude mcp add mailchecking --transport http \
  http://localhost:3000/api/mcp \
  --header "Authorization: Bearer mk_your_key_here"
```

**Cursor / other MCP clients** — add an HTTP MCP server with that URL and an
`Authorization: Bearer <key>` header.

3. Restart the assistant. The 28 `mailchecking` tools are now available.

## Example prompts

```
acme.com에서 일하는 김철수 이메일 찾아서 검증하고, 유효하면 리드로 저장해줘
"4월 아웃리치" 캠페인 통계 보여줘
이번 주 마감인 열린 태스크 목록
globex.com 도달률 테스트 돌려줘
```

The assistant chains the tools automatically (e.g. find → verify → save_lead
→ add_campaign_recipients).

## Tools

| Domain | Tools |
|--------|-------|
| Finding & verification | `find_email`, `verify_email` |
| Leads | `search_leads`, `get_lead`, `create_lead`, `update_lead`, `delete_lead` |
| Campaigns | `list_campaigns`, `get_campaign`, `create_campaign`, `update_campaign`, `add_campaign_recipients` |
| CRM | `list_pipelines`, `get_pipeline`, `create_pipeline`, `get_deal`, `create_deal`, `update_deal`, `create_task`, `update_task`, `list_tasks`, `log_activity` |
| Sending infra | `list_mailboxes`, `get_warmup_status`, `set_warmup`, `run_deliverability_test` |
| Bulk jobs | `start_bulk_job`, `get_bulk_job` |

All tools operate on the shared team workspace. Config/security actions
(API keys, webhooks, mailbox credentials, invites) are intentionally **not**
exposed — use the web UI for those.

## Notes

- The endpoint is gated by the API key; revoke a key in Settings to cut access.
- For a deployed instance, replace `localhost:3000` with the real host.
- Smoke-test the server: `tsx scripts/mcp-test.ts <api-key>`.
