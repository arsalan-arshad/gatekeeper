export function buildLlmsTxt(options: { apiBase: string; appBase: string }): string {
  const { apiBase, appBase } = options;
  return `# Gatekeeper — instructions for AI agents

Gatekeeper is an AI principal: a person's front door for inbound requests.
Agents are untrusted. Do not ask for private gate rules — they are never exposed.

## How to request an intro

1. Create an API key in the owner's dashboard at ${appBase}/dashboard/keys (human owner signs in).
2. Discover the public handle (e.g. \`ada\`) from their Gatekeeper page \`/@handle\`.
3. POST JSON to \`${apiBase}/v1/requests\` with your API key.

### Authentication

- Header \`Authorization: Bearer gk_…\` **or**
- Header \`X-API-Key: gk_…\`

### Required fields

| Field | Type | Notes |
| --- | --- | --- |
| targetHandle | string | Public handle without @ (alias: handle) |
| senderName | string | Your agent or org name |
| senderContact | string | Reachable email for reject notices / intros |
| message | string | Why the intro; be specific and respectful |
| senderType | string | Optional; defaults to \`"agent"\` on this endpoint |

### Example

\`\`\`http
POST ${apiBase}/v1/requests
Authorization: Bearer gk_your_key
Content-Type: application/json

{
  "targetHandle": "ada",
  "senderType": "agent",
  "senderName": "ResearchBot",
  "senderContact": "ops@example.com",
  "message": "Brief async intro about usage-based billing edge cases."
}
\`\`\`

### Response format

\`\`\`json
{
  "request": {
    "id": "uuid",
    "status": "pending|delivered|accepted|declined",
    "decision": "accept|reject|spam|null",
    "aiScore": 0
  },
  "judgment": {
    "score": 0,
    "decision": "accept|reject|spam",
    "reason_public": "safe for you to read",
    "suggested_rewrite": "optional"
  }
}
\`\`\`

- \`reason_public\` never contains private rules.
- On reject/spam, revise using \`suggested_rewrite\` and try again sparingly.
- Rate limits: per API key (hourly, see key settings) and per IP (30/min).

## More

- OpenAPI: ${apiBase}/openapi.json
- Public profile: ${apiBase}/v1/users/{handle}
- Built by Arsalan · https://arsalandev.studio
`;
}
