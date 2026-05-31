# GitHub Issue Drafts

## 1. Bootstrap Next.js mobile web app

Create the initial Next.js app with a mobile-first iPhone-style layout.

Acceptance criteria:

- App runs locally.
- Main screen shows raw text input.
- UI is usable at iPhone viewport widths.

## 2. Implement AI extraction API

Implement `/api/extract` to turn raw text into the JSON contract in `docs/AI_EXTRACTION_CONTRACT.md`.

Acceptance criteria:

- Reads OpenAI key from `.env`.
- Does not log secrets.
- Returns one of the allowed classifications.
- Handles malformed AI output safely.

## 3. Build approval chat UI

Show AI results as a messenger-style approval flow.

Acceptance criteria:

- Confirmed events ask for approval before saving.
- Negotiating events show candidate times or follow-up questions.
- User can approve, edit, or reject.

## 4. Add Prisma and database models

Add PostgreSQL-backed persistence.

Acceptance criteria:

- Prisma schema includes `RawInput`, `ExtractionDraft`, `Event`, `Todo`, `ChecklistItem`, `Notification`.
- `.env.example` documents required variables.
- Approved events can be saved.

## 5. Implement virtual calendar and TODO views

Create Today, Week, and TODO screens.

Acceptance criteria:

- Approved events appear in Today/Week views.
- TODO items can be checked off.
- Checklist items are visible on event detail.

## 6. Implement meeting-time negotiation logic

Compute candidate times from participant availability constraints.

Acceptance criteria:

- Extracted constraints are visible per participant.
- Conflicting constraints are explained.
- App proposes a time or a follow-up message instead of registering prematurely.

## 7. Add notification generation

Generate reminders for approved events.

Acceptance criteria:

- 30-minute reminder is generated.
- Departure/checklist reminder is generated when checklist or location exists.
- Browser notification permission flow is handled.
