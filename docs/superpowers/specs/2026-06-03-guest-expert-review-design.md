# Guest Expert Review Link Design

## Goal

Add a lightweight, no-login expert scoring entrance for experts who only need to score projects and should not be forced into the full platform workspace.

Administrators still prepare review projects, expert names/accounts, project assignments, score windows, and score rules in the existing expert review module. The new guest entrance gives each expert one dedicated link. The expert opens that link, sees only their assigned projects, submits scores, and leaves.

## Scope

First phase:

- One guest review link per expert per review round or stage.
- No platform login required for the expert.
- The page shows all projects assigned to that expert within the linked round.
- Projects are displayed in the generated roadshow order when a review screen draw/order exists; otherwise they fall back to the review assignment creation order.
- Experts can score projects independently within the configured review window.
- Submitted scores are stored in the existing `ExpertReviewScore` table and lock after submit.
- Admin backend sees score progress in near real time through the existing review assignment data refresh.
- Final calculation and exports continue to use existing score data and score rules.

Out of scope for first phase:

- Following the roadshow big screen's current project.
- Editing a submitted score.
- Anonymous expert identity. The system still knows which expert link submitted each score.
- Public listing of project materials outside the expert's assigned tasks.

## User Flow

1. Admin creates or imports expert identities before review.
2. Admin creates the review round and assigns projects to experts.
3. Admin generates guest review links for the selected round.
4. Admin sends each expert their own link through WeChat or other channels.
5. Expert opens the link and lands directly on the lightweight scoring page.
6. Expert sees assigned projects, score status, review deadline, and progress count.
7. Projects are listed in roadshow order, so the expert can follow the actual presentation order without the page being controlled by the big screen.
8. Expert opens a project, reviews materials if available, enters a 0.00-100.00 score and optional comment, then submits.
9. Submitted projects show as locked. The expert continues with remaining projects.
10. After all assigned projects are submitted, the page shows a completion message thanking the expert for their work.
11. Admin monitors submitted counts, raw scores, calculable status, and exports scoring details later.

## Data Model

Add `ExpertReviewGuestToken`.

Fields:

- `id`
- `expertUserId`
- `projectReviewStageId`
- `tokenHash`
- `tokenExpiresAt`
- `revokedAt`
- `lastUsedAt`
- `createdById`
- `createdAt`
- `updatedAt`

Indexes and constraints:

- Unique `tokenHash`.
- Unique `(expertUserId, projectReviewStageId)`.
- Index `(projectReviewStageId, revokedAt)`.
- Index `(expertUserId, tokenExpiresAt)`.

Token plaintext is only returned when generated. The database stores only `tokenHash`, matching the review screen token pattern. Regenerating a link updates the existing expert-stage token row with a new hash, expiry, `revokedAt = null`, and `lastUsedAt = null`.

## APIs

Admin APIs:

- `POST /api/expert-reviews/guest-links`
  - Admin or school admin only.
  - Body: `projectReviewStageId`, optional `expertUserIds`.
  - Generates or regenerates one link per expert who has assignments in that stage.
  - Returns expert name, expert id, expiry, and URL.

- `GET /api/expert-reviews/guest-links?projectReviewStageId=...`
  - Admin or school admin only.
  - Lists generated link metadata without exposing raw tokens after creation.

- `POST /api/expert-reviews/guest-links/revoke`
  - Admin or school admin only.
  - Revokes one expert link or all links for a round.

Guest APIs:

- `GET /api/expert-reviews/guest/[token]`
  - No login required.
  - Validates token hash, expiry, and revoke status.
  - Returns the expert display name, round information, assigned projects, existing score state, and material metadata.

- `POST /api/expert-reviews/guest/[token]/scores`
  - No login required.
  - Validates token and checks that `assignmentId` belongs to the token's expert and stage.
  - Uses the same score validation as the existing authenticated score endpoint.
  - Stores into `ExpertReviewScore` with `reviewerId = expertUserId`.
  - Updates assignment status to `submitted` and locks score at submit time.

Material access should use token-aware endpoints or signed preview URLs scoped to the assignment. A guest token must not grant access to unrelated materials.

## Scoring Rules

For the first phase, guest links use independent scoring mode:

- Network review projects follow `startAt` and `deadline`.
- Roadshow projects in guest independent mode also follow `startAt` and `deadline`.
- Guest independent mode does not require a `ReviewDisplaySession` or big screen scoring phase.
- If a review screen draw/order exists, guest assignments are sorted by `ReviewDisplayProjectOrder.orderIndex`; opening the big screen is not required for scoring.
- Score precision remains 0.00-100.00, stored as cents in `totalScore`.
- Existing rules for cancelled packages, excluded assignments, locked assignments, and already submitted scores still apply.

This is intentionally different from the current authenticated roadshow scoring endpoint, which requires the big screen to be in scoring phase. Guest independent scoring exists specifically for cases where the organizer does not open the big screen and only wants experts to submit scores.

## Admin Summary And Calculation

The admin workspace continues to use `ExpertReviewAssignment` and `ExpertReviewScore` as the source of truth.

Admin needs to see:

- Total experts assigned per project.
- Submitted expert count per project.
- Missing expert count per project.
- Raw expert scores after submission, according to existing admin visibility.
- Whether the project is calculable under the configured drop-high/drop-low rule.
- Final score preview or final calculation using existing score rules.
- Export of score details using the existing export path, with guest-submitted scores included automatically.

Because guest scores write to the same score table, later calculation and export do not need a separate guest-score branch.

## Frontend

Admin side:

- Add a "专家免登录评分链接" action near review assignment or review round controls.
- Show a compact table: expert name, assigned count, link status, expiry, copy action, revoke/regenerate action.
- Use one link per expert, not one link per project.

Guest side:

- Route: `/expert-review/guest/[token]`.
- Mobile-first layout.
- No platform navigation, no workspace sidebar, no login prompt.
- Project list first, with submitted/pending status.
- Project list order follows roadshow order when available.
- Project scoring view with score input, optional comment, submit confirmation, and locked submitted state.
- Completion state thanks the expert after every assigned project has a submitted score.
- Clear expired/revoked/error states.

## Security

- Store only token hashes.
- Use long random tokens generated with Node crypto.
- Expire links at the review deadline by default, with admin-configured expiry if needed.
- Rate limit guest score submit and guest info endpoints by token hash and IP.
- Validate every submit by assignment ownership, stage, package status, time window, and prior score state.
- Do not expose other experts, unrelated projects, full user records, or admin-only score settings beyond what the expert needs.
- Audit link generation, revoke, and score submission.

## Testing

Add focused tests for:

- Guest token schema and hashed-token storage.
- Admin link generation requires admin or school admin.
- Generated links are one per expert, not one per project.
- Guest info endpoint requires no login but validates token expiry/revocation.
- Guest endpoint returns only assignments for the token expert and stage.
- Guest scoring works without login.
- Guest scoring does not require roadshow big screen state.
- Guest scoring rejects assignment ids outside the token scope.
- Submitted scores lock and cannot be modified.
- Existing admin scoring summary and export include guest-submitted scores because they use the shared score table.

## Rollout

1. Add schema and idempotent production schema script.
2. Add guest link APIs.
3. Add guest scoring page.
4. Wire admin link generation/copy/revoke controls.
5. Add tests and run build.
6. Apply production schema.
7. Deploy to production.
