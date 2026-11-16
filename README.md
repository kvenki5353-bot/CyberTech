# CYBER MYSTERY ARENA

**Investigate. Analyse. Decode. Uncover the Truth!**

CYBER MYSTERY ARENA is a responsive, website-based cybersecurity investigation game for students. Players inspect invented incident briefs, clues, evidence records, and timelines; answer case questions; and submit a verdict for server-side scoring. It is designed as a safe, college-event learning activity rather than a quiz or a live cyber range. The cases use synthetic data and do not require access to real accounts, networks, websites, or devices.

> **Implementation status:** This repository contains a working React/Vite interface and Firebase integration code. Authentication, live multiplayer data, submissions, and scores require a Firebase project configured as described below. They have not been tested against a deployed Firebase project in this repository.

## Table of Contents

- [1. Project Overview](#1-project-overview)
- [2. Technology Stack](#2-technology-stack)
- [3. Project Structure](#3-project-structure)
- [4. Installation and Firebase Setup](#4-installation-and-firebase-setup)
- [5. Participant Guide](#5-participant-guide)
- [6. Difficulty Levels and Scoring](#6-difficulty-levels-and-scoring)
- [7. Teams and Events](#7-teams-and-events)
- [8. Game Rules and Known Limits](#8-game-rules-and-known-limits)
- [9. Leaderboard and Winners](#9-leaderboard-and-winners)
- [10. Administrator Guide](#10-administrator-guide)
- [11. Case Library](#11-case-library)
- [12. Firebase Data Model](#12-firebase-data-model)
- [13. Security and Fair Play](#13-security-and-fair-play)
- [14. Testing](#14-testing)
- [15. Troubleshooting](#15-troubleshooting)
- [16. FAQ](#16-faq)
- [17. Future Improvements](#17-future-improvements)
- [18. Credits and Project Information](#18-credits-and-project-information)

## 1. Project Overview

### What the game does

A case starts with a fictional incident briefing. Investigators review the evidence locker, compare suspect profiles, collect relevant evidence, arrange event cards chronologically, answer three case questions, and submit a verdict. A Firebase callable function checks the answers and scoring inputs, writes a submission and score, and updates the cumulative player or team ranking.

This differs from a standard quiz because participants are asked to connect several pieces of synthetic evidence and explain a reasoned conclusion. The current case interface supports multiple-choice questions, a true/false format, a clue-selection label, and a matching select control. The matching and clue formats still use predefined answer options; they are not free-form evidence tagging or drag-and-drop matching.

### Purpose and safety

- Introduce practical security habits such as independently verifying a sender, preserving evidence, using least privilege, and distinguishing evidence from speculation.
- Give college organizers a case-based competition format with individual and small-team scoring.
- Keep scenarios educational: no malware, working phishing URLs, real credentials, real people, or unauthorized activity are part of the cases.

## 2. Technology Stack

| Area | Technology in this repository | Purpose |
|---|---|---|
| Frontend | React 19, JavaScript, HTML | Component-based single-page application and interactive game screens. |
| Development/build | Vite 6 | Local dev server and production bundle in `dist/`. |
| Styling | Custom CSS plus Tailwind CSS 4 Vite plugin | Responsive styles are primarily in `src/styles.css`; Tailwind is installed and imported, but the UI does not primarily use utility classes. |
| Animation | Framer Motion | Page transitions and case-card reveal effects. |
| Icons | lucide-react | Navigation, evidence, status, and action icons. |
| Authentication | Firebase Authentication, email/password | Registration, sign-in, and session identity. |
| Database | Cloud Firestore | User profiles, teams, events, sessions, submissions, scores, rankings, announcements, and stats. |
| Presence | Firebase Realtime Database | Per-user online/offline state at `/status/{uid}`. |
| Server | Firebase Cloud Functions v2, Node.js 20 | Authenticated operations, private answer validation, team/event operations, hint counts, and scoring. |
| Deployment | Firebase Hosting | Serves the Vite `dist/` folder and rewrites app routes to `index.html`. |
| Tests | Node.js built-in test runner | Checks the case catalog against private answer keys and scoring rubrics. |

Firebase packages are initialized only when every client setting in `src/firebase.js` is present, including the Realtime Database URL. The web app's Firebase API key is a client configuration value, not a substitute for Firebase Security Rules or server authorization. Do not place service-account credentials in `.env.local` or frontend code.

## 3. Project Structure

```text
CyberTec/
|-- .env.example
|-- .firebaserc.example
|-- .gitignore
|-- README.md
|-- database.rules.json
|-- firebase.json
|-- firestore.rules
|-- index.html
|-- package.json
|-- package-lock.json
|-- vite.config.js
|-- src/
|   |-- App.jsx
|   |-- cases.js
|   |-- firebase.js
|   |-- main.jsx
|   `-- styles.css
`-- functions/
   |-- caseKeys.js
   |-- index.js
   |-- package.json
   |-- package-lock.json
   |-- scripts/
   |   `-- set-admin.mjs
   `-- test/
      `-- cases.test.js
```

`node_modules/`, `functions/node_modules/`, and `dist/` are generated or installed directories; they are not source folders. There are no separate `components/`, `pages/`, `assets/`, `services/`, or `public/` directories in the current project. Most React views are functions in `src/App.jsx`; static fictional case content is in `src/cases.js`.

| File/folder | Role |
|---|---|
| `src/App.jsx` | Navigation, signup/sign-in modal, case UI, local UI state, Firebase listeners/callables, team forms, leaderboard, and admin console. |
| `src/cases.js` | Ten public case briefs, suspects, evidence, questions, timelines, hints, and difficulty descriptions. It contains no answer key. |
| `src/firebase.js` | Reads `VITE_FIREBASE_*` values and initializes Firebase Auth, Firestore, Functions, and Realtime Database. |
| `src/styles.css` | Responsive visual design, dark/light themes, motion, and mobile layouts. |
| `functions/index.js` | Callable functions and the account-created participant counter. |
| `functions/caseKeys.js` | Private answers, explanations, evidence rubrics, hint limits, expected timelines, and scoring durations. |
| `functions/scripts/set-admin.mjs` | Grants the Firebase Auth `admin` custom claim using trusted Application Default Credentials. |
| `functions/test/cases.test.js` | Checks that public cases, private keys, and rubrics line up. |
| `firestore.rules` | Client read/write policy for Firestore documents. |
| `database.rules.json` | Realtime Database policy for per-user presence. |
| `firebase.json` | Hosting rewrite, rules paths, Functions runtime, and emulator ports. |
| `.env.example` | Names of the client Firebase configuration values to copy into local configuration. |
| `.firebaserc.example` | Template Firebase project alias; copy locally to `.firebaserc`. |
| `package.json` | Frontend scripts and dependencies. |

## 4. Installation and Firebase Setup

### Prerequisites

- Node.js 20.x and npm. The Cloud Functions package declares Node 20; use that version when developing or deploying Functions.
- Visual Studio Code or another JavaScript editor. No special VS Code extension is required.
- A Firebase account and project for authentication, Firestore, Realtime Database, Functions, and Hosting.
- A Firebase billing plan that permits Cloud Functions deployment (Blaze for deployed Functions).

### Install and open the project

1. Install Node.js 20 LTS and confirm the commands are available:

  ```powershell
  node --version
  npm --version
  ```

2. Open this project folder in VS Code. For example, from PowerShell:

  ```powershell
  cd "C:\path\to\CyberTec"
  code .
  ```

3. In VS Code, choose **Terminal > New Terminal**. Confirm the terminal is at the project root (the folder containing `package.json`).

4. Install the root and Functions dependencies:

  ```powershell
  npm install
  npm install --prefix functions
  ```

### Create and configure Firebase

1. Create a Firebase project in the Firebase console.
2. Add a Web App and copy its configuration values.
3. In Firebase Authentication, enable the **Email/Password** sign-in provider.
4. Create a Cloud Firestore database. Deploy `firestore.rules` before testing signed-in data access.
5. Create a Realtime Database. Its URL is required by the client initializer; deploy `database.rules.json` before relying on presence.
6. Enable Cloud Functions and Hosting. Select a region appropriate for your event when configuring the Firebase project; the current client uses the Functions SDK default region (`us-central1`). Functions deployment requires an eligible billing plan.
7. Copy the environment template and enter the Web App values:

  ```powershell
  Copy-Item .env.example .env.local
  ```

  Fill in these variables in `.env.local`:

  ```dotenv
  VITE_FIREBASE_API_KEY=your-web-api-key
  VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
  VITE_FIREBASE_PROJECT_ID=your-project-id
  VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
  VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
  VITE_FIREBASE_APP_ID=your-web-app-id
  VITE_FIREBASE_DATABASE_URL=https://your-project-default-rtdb.firebaseio.com
  ```

  `src/firebase.js` requires all seven values before it initializes Firebase. The storage bucket is currently not otherwise used by the app, but its value is included in this all-values-present check.

8. Select the Firebase project. Copy `.firebaserc.example` to `.firebaserc` and replace its example project ID, or use the Firebase CLI:

  ```powershell
  Copy-Item .firebaserc.example .firebaserc
  npx firebase-tools login
  npx firebase-tools use YOUR_FIREBASE_PROJECT_ID
  ```

  `.firebaserc` and `.env.local` are ignored by Git. Never commit service-account JSON files.

### Start the website

Run the development server from the project root:

```powershell
npm run dev
```

Vite prints a local URL, normally `http://localhost:5173/`. Open that address in a browser. To stop the server, focus its terminal and press **Ctrl+C**.

Without Firebase settings, the landing page and bundled case archive can be browsed, but registration, sign-in, multiplayer operations, and server-verified submissions cannot work.

### Firebase emulators

The repository defines emulator ports and this script:

```powershell
npm run emulators
```

This starts the Auth, Firestore, Realtime Database, Functions, and Hosting emulators when Firebase CLI and the local environment are ready. **The current client does not call `connectAuthEmulator`, `connectFirestoreEmulator`, `connectFunctionsEmulator`, or `connectDatabaseEmulator`; therefore starting these emulators alone does not connect the website to them.** Use a configured development Firebase project or add emulator connection code before treating this as an end-to-end local backend.

### Test, build, and deploy

Run the case contract tests and create a production bundle:

```powershell
npm test
npm run build
npm run preview
```

`npm run preview` serves the built `dist/` app locally (Vite normally uses port 4173). For Firebase deployment:

```powershell
npx firebase-tools login
npx firebase-tools use YOUR_FIREBASE_PROJECT_ID
npx firebase-tools deploy --only firestore:rules,database,functions,hosting
```

Alternatively, `npm run deploy` runs `npm run build` followed by `firebase deploy`. Hosting serves `dist/`; `firebase.json` rewrites requests to `index.html`. Deployment has not been run against a configured project in this workspace.

### Grant administrator access

1. Register the account through the app and sign in once so its `users/{uid}` profile is created.
2. Obtain the account's Firebase Auth UID from the Firebase console.
3. On a trusted machine authenticated with Google Application Default Credentials, run from the project root:

  ```powershell
  npm install --prefix functions
  npm --prefix functions run set-admin -- YOUR_FIREBASE_AUTH_UID
  ```

4. Sign out and sign back in to refresh the user's ID token.

The script uses `firebase-admin` and grants `{ admin: true }`. Do not grant the claim from browser code or expose Admin SDK credentials to participants.

## 5. Participant Guide

1. Open the Vite URL or deployed Firebase Hosting URL.
2. Choose **Create investigator ID** or **Register to investigate**. Enter a nickname, email, password (at least six characters), and optionally a college. Public college display is a separate opt-in.
3. Use **Sign in** on later visits. Firebase Authentication manages the email and password; the client writes a profile document after registration.
4. Open **Dashboard** for local completed-case count, the current score/rank if Firebase data is available, and a recommended next case. The completed-case count is stored in this browser's `localStorage`, not as a server-owned history field.
5. Open **Play Investigation** to browse the ten bundled cases. Filter by Easy, Medium, or Hard, or search by case title/category.
6. To play alone, open a case without selecting a team. To investigate as a team, use **My Teams** to create a team or join with its code. The app automatically uses the first team returned for the signed-in user; there is no team selector.
7. Choose a case. The mission briefing, fictional incident note, duration, and scoring facts appear. The server creates or resumes a case session when Firebase is available.
8. In **Evidence**, inspect the evidence cards and select the clues you believe matter. The selected evidence is saved in local state and, when connected, to the Firestore session.
9. In **Suspects**, review each fictional profile and its note. Profiles are descriptive; there is no separate suspect-board voting control.
10. In **Questions**, answer the three questions. Some questions are presented as true/false, clue selection, or a matching select; all are scored as indexed options by the function.
11. Use the timeline arrows to rearrange the listed events. The server awards timeline points for items in the correct positions.
12. Hints are requested from Cloud Functions. Each case allows two hints; each server-recorded hint reduces the case score by five points.
13. Easy and Medium reports are optional. Hard reports must have at least 40 characters to submit; the scoring rubric gives report credit based on report length, up to 100 characters for Hard.
14. Submit once using **Submit final verdict**. The server validates the answers and writes the result. If Firebase is not configured, the submit action reports that Firebase is required.
15. View the case result and answer explanations. Open **Leaderboard** for live Firestore rankings, which are visible to signed-in users.

The participant-facing **Home**, **Dashboard**, **Play Investigation**, **Difficulty Levels**, **My Teams**, **Leaderboard**, **Achievements**, **My History**, and **Profile** views are present. Some data is local or illustrative; see [Known Game Rules and Limits](#8-game-rules-and-known-limits).

## 6. Difficulty Levels and Scoring

### Available levels

| Level | Case count | Case time limits | Server scoring weights |
|---|---:|---|---|
| Easy - Beginner Investigator | 3 | 10 or 12 minutes | Evidence 30; answers 40; timeline 20; explanation/report 10. |
| Medium - Cyber Detective | 4 | 18 or 20 minutes | Evidence 25; investigation answers 25; first/suspect question 20; timeline 20; report 10. |
| Hard - Master Investigator | 3 | 25, 26, or 30 minutes | Evidence 25; timeline/reconstruction 15; first reconstruction answer 10; second/suspect answer 20; report 20; reasoning answer 10. |

The app does not define a passing mark. A selected difficulty filters the case library; it does not create an event-specific lock on the player's other cases. There are three questions per case. Each case has five to seven evidence items and three to four timeline entries.

### How the server computes each category

- **Evidence:** expected rubric evidence items selected divided by the number of expected items, multiplied by that level's evidence weight. Extra selected evidence does not remove points.
- **Answers:** correct indexed answer options divided by the number of questions in that scoring category, multiplied by its weight. An incorrect answer earns no points in that category; it does not subtract points directly.
- **Timeline:** expected timeline entries in the exact correct positions divided by the number of expected entries, multiplied by the timeline weight. There is no drag-and-drop control; use the up/down arrow buttons.
- **Report:** report character count divided by a category-specific threshold, capped at 100% of that category's weight. Thresholds are 50 characters for Easy, 60 for Medium, and 100 for Hard. Hard also has a 40-character minimum to submit.
- **Hints:** five points are deducted for each hint, up to two hints per case.
- **Overtime:** after the configured case duration, one point is deducted for each complete minute late, capped at ten points. There is no speed bonus for finishing early.
- **Final score:** rounded category points minus hint and overtime penalties, clamped to 0-100.

**Example:** An Easy case earns all 100 category points. The player uses one hint and finishes two full minutes after the 12-minute limit. Final score: `100 - 5 - 2 = 93`.

The countdown in the interface is a client display. The authoritative start timestamp and elapsed duration are recorded by `beginInvestigation` on the server. Sessions are rejected after three hours, even though the displayed case duration is shorter. Time reaching zero does not automatically submit or close the case.

### Important implementation distinction

The weights are applied in code, but the Easy/Medium/Hard weights do not all map to separate, fully implemented domain-specific scoring dimensions. For example, Medium's first question is called the suspect component by the scorer even when the case question is not literally a suspect selection. The formulas above describe the current function behavior, not a promise of human-reviewed investigation quality.

## 7. Teams and Events

### Create or join a team

1. Register/sign in and open **My Teams**.
2. To create a team, enter a name of 2-30 characters and choose **Create team**. The server creates the team with the creator as owner and returns an eight-character hexadecimal invitation code.
3. Share that code with teammates. Each teammate signs in, enters the code in **Enter an invite code**, and joins directly; no approval step exists.
4. Teams have a maximum of four members. They can be created with one member, but the server will not accept a final team verdict until at least two members have joined.
5. The team owner is the only member who may submit the final verdict. There is no owner transfer, leave-team, disband, or member-removal operation in the current UI/functions.

### What is and is not shared

- A team session is keyed by team ID and case ID. Firestore session progress includes answers, selected evidence, timeline order, report, hint count, and last writer.
- Signed-in team members can read the session under the Firestore rule. The app listens for remote progress and writes changes through `saveInvestigationProgress`.
- Team answers and evidence are scored as one verdict; the resulting points accumulate on the team's ranking document.
- There is no chat, team dashboard, ready check, member approval, one-team-per-event restriction, or team membership selector. A user can join/create more than one team, but the app loads the first returned team and uses it for the case flow.
- A newly created team is not automatically associated with an event lobby.

### Event invitation lobbies

An administrator can create a lobby for a case with its matching difficulty, using a generated or supplied invitation code. A signed-in participant can join while the lobby status is `open` or `live`; a membership document is created under `games/{gameId}/participants/{uid}` and the participant count is incremented once.

**Current limitation:** joining an event opens its assigned case, but the game ID is not passed into the investigation session. Pausing or ending a lobby prevents later joins only when its status is no longer `open`/`live`; it does not close or pause existing case sessions or submissions. Event-level enforcement and scheduled start/end times are future work.

## 8. Game Rules and Known Limits

| Topic | Implemented behavior |
|---|---|
| Registration | Email/password Firebase Auth; nickname required; college optional; public college display has an opt-in checkbox. No age or school verification. |
| Individual play | A signed-in user may open a case without a team. |
| Team size | Joining is capped at four members. Submission requires at least two members and only the owner can submit. |
| One team per participant | Not enforced. No leave or team-switch control exists. |
| Difficulty | Case cards are filtered by level. Difficulty can be changed by returning to the case library; no server-enforced event difficulty is attached to a session. |
| Restart | There is no restart/retake operation. A deterministic per-player/team case score document prevents a second submission for the same case and mode. A completed case can be reopened to view its stored result. |
| Changing case mid-session | The UI has a case-archive path; an active session is not explicitly abandoned or deleted. Reopening the case resumes its server session. |
| Evidence | Cards can be selected/deselected; rubric evidence contributes points. Evidence does not individually unlock questions. |
| Hints | Two per case; server increments hint count, and the score is reduced by five points per hint. |
| Timer expiry | Overtime points are deducted after the case duration. At most ten overtime points are deducted. The function rejects sessions older than three hours. No automatic close, countdown-triggered submit, or event-time enforcement exists. |
| Submission | Three questions must be answered in the UI. The backend accepts one submission per case per individual/team score ID. It scores on the server and writes immutable score/submission docs. |
| Collaboration | Shared Firestore session progress is supported for team members. There is no real-time chat or formal anti-collusion control. |
| Incorrect answers | No negative answer penalty; incorrect answers receive zero in their scoring component. |
| Disqualification/tie rules | Not implemented. No manual disqualification or explicit tie-breaker exists. |

Recommended event rules (not enforced by this code): do not share answer keys, do not submit another team's work, follow the organizer's timing and conduct instructions, and let organizers resolve ties using a published policy before the event starts.

## 9. Leaderboard and Winners

- Cloud Functions maintain `rankings/player_{uid}` and `rankings/team_{teamId}` cumulative score documents. Each accepted case adds that case score to the ranking total.
- The signed-in app listens to up to 500 rankings ordered by `score` descending. The leaderboard can switch between Individual and Team and search display names/college text.
- The first three entries are used for the podium display. College is blank for teams and for individual users who did not opt in.
- The admin CSV export uses the currently loaded ranking rows and includes rank, player/team, college, latest difficulty, cumulative score, and cumulative elapsed seconds (the CSV heading is “Completion time”).
- The app does not have a difficulty filter, adjudication workflow, winner-announcement action, or certificates.
- Equal totals have no explicit tie-breaker. Firestore orders by score only, so equal-score ordering should not be treated as an official tie decision. Organizers should publish a tie policy separately.

Example only (not real scores):

| Example rank | Investigator/team | College | Level shown | Total points |
|---:|---|---|---|---:|
| 1 | Signal Seekers | North College | Hard | 184 |
| 2 | Rowan | - | Medium | 160 |
| 3 | Cipher Crew | - | Easy | 149 |

This sample illustrates a table only; the app's per-case maximum is 100, while leaderboard totals accumulate across cases.

## 10. Administrator Guide

### Access

Admin controls require a Firebase Auth custom claim `{ "admin": true }`. See [Grant administrator access](#grant-administrator-access). The left navigation shows **Admin console** when the current ID token contains this claim. Callable Functions also verify the claim server-side.

### Implemented admin actions

- **Load participants:** calls `adminListParticipants`, returning up to 300 user profile records. The screen does not automatically load this list until the admin presses the button.
- **Create event lobby:** select a case and matching level, enter an event name, optionally choose an invitation code, and create the event. The server generates an eight-character code if the field is empty and checks duplicate codes.
- **Start, pause, end:** event status buttons set `live`, `paused`, or `ended`; new participants can join only `open` or `live` events. There is no scheduled start/end time.
- **Publish announcement:** stores a title and message in `announcements`; signed-in users receive live Firestore updates.
- **Export results:** downloads a CSV of rankings currently held by the client.

### Not implemented in the admin UI

There is no case authoring/editing interface, evidence/question editor, point/rubric editor, hint editor, team management view, active-session monitor, submission-review screen, manual score override, manual leaderboard control, winner announcement workflow, or certificate generator. The ten case briefs are source code in `src/cases.js`; answer keys/rubrics are in `functions/caseKeys.js`. Written reports are saved with submissions, but the UI does not review them. An admin can inspect permitted documents in Firebase Console.

## 11. Case Library

The shipped catalog has ten cases. Names below match the repository; some differ from the alternative names in the original project brief. Every case has a fictional briefing, incident-safety note, three suspect profiles, 5-7 evidence cards, three questions, a timeline, and two hints. Case answer explanations are returned by the server after a submission.

| Case (actual title) | Level / limit | Story and objective | Evidence examples / question focus |
|---|---|---|---|
| **Shadow Trace - Find the Digital Intruder** | Easy / 12 min | Reconstruct the likely account-access path and a sequence of account events. | Sign-in notice, reset message, activity log, interview note, owner statement; identify clues, first event, and safe response. |
| **Phantom Mail - The Suspicious Email** | Easy / 10 min | Assess a room-booking message without following a suspicious link. | Header summary, urgency wording, link preview, official directory, mail gateway log; sender clue, response, true/false link decision. |
| **Zero Hour - The Missing Data** | Medium / 18 min | Determine why a shared folder is missing and how to restore it safely. | Audit event, maintenance note, backup snapshot, service ticket, access scope; cause, recoverability, and response. |
| **Dark Identity - The Anonymous Account** | Medium / 20 min | Assess an unauthorized club post without claiming to identify its author. | Post record, flyer history, club policy, report receipt, draft email; defensible conclusion, verification, role match. |
| **Firewall Files - The Insider Threat** | Hard / 25 min | Evaluate an overly broad project share and recommend proportionate containment. | Permission export, approval note, session log, template history, audit export, policy; scope, response, attribution limits. |
| **Code Crime - The Broken Application** | Hard / 26 min | Review a synthetic cross-account display in a test app and recommend remediation. | QA note, cache release note, test data map, checklist, access report, remediation note; likely change, response, prevention. |
| **Fake Portal - Identify the Fraudulent Website** | Easy / 12 min | Compare a fictional scholarship portal lookalike with an independently listed official URL. | Directory entry, screenshots, redirect note, support note; supported portal, credential response, trusted verification source. |
| **Digital Footprint - Trace the Unknown** | Medium / 20 min | Separate known posting-window facts from unsupported identity claims. | Board log, moderation note, public event schedule, secretary note, retention policy; conclusion, proportionate next step, schedule reliability. |
| **Encrypted Truth - Decode the Secret Message** | Medium / 18 min | Decode a Caesar-shift puzzle and recognize its lack of real security. | Ciphertext, shift instruction, archive catalog, review note, challenge card; decode text, method, security lesson. |
| **Project Eclipse - The Final Cyber Mystery** | Hard / 30 min | Reconstruct how an older presentation copy reached a public notice board without over-attributing blame. | Access export, workspace audit, board history, snapshot, message thread, response checklist, session summary; sequence, supported finding, response. |

The repository does **not** contain cases titled “Dark Web Detective,” “The Phishing File,” or “Project Eclipse 2.0”; those titles should not be advertised as available cases. This is a fixed source catalog, not a database-seeded or administrator-editable case library.

## 12. Firebase Data Model

The client uses Firestore snapshots for live ranking, game-list, and announcement updates. Callables use the Firebase Admin SDK to create/update protected records. The following fields are based on current writes; fields may be absent until the related operation occurs.

| Collection/path | Current fields and purpose |
|---|---|
| Firebase Authentication user | Email and password credential are managed by Firebase Auth; the app does not write an email field into its Firestore profile on signup. |
| `users/{uid}` | `displayName`, `college`, `publicCollege`, `role: "player"`, `createdAt`. Profile is written after successful signup. The account-created trigger increments the global participant count. |
| `teams/{teamId}` | `name`, `inviteCode`, `ownerId`, `memberIds`, `memberCount`, `createdAt`. Created/joined only through callable Functions. |
| `games/{gameId}` | `name`, `caseId`, `difficulty`, `inviteCode`, `status`, `participantCount`, `createdBy`, `createdAt`, optionally `updatedAt`. Status values: `open`, `live`, `paused`, `ended`. |
| `games/{gameId}/participants/{uid}` | `uid`, `joinedAt`. A membership record is created once per user/event. |
| `sessions/{sessionId}` | `ownerId`, optional `teamId`, `caseId`, server `startedAt`, `createdAt`, `status`, `hintsUsed`, `progress` (`answers`, `selectedEvidence`, `timelineOrder`, `report`), optional `lastWriter`, `updatedAt`, and `submittedAt`. The session ID is derived from player/team and case. |
| `scores/{scoreId}` | One per player/team and case: `score`, `displayName`, `teamName`, `college`, `difficulty`, `caseId`, `ownerId`, `memberIds`, `mode`, `elapsedSeconds`, `hintsUsed`, `breakdown`, `createdAt`. |
| `submissions/{submissionId}` | Score fields plus submitted `answers`, `report`, `selectedEvidence`, `timelineOrder`, `status: "verified"`, and `submittedAt`. |
| `rankings/{rankingId}` | Cumulative `score`, `displayName`, `teamName`, `college`, latest `difficulty`, `difficulties`, `ownerId`, `memberIds`, `mode`, `completedCases`, cumulative `elapsedSeconds`, per-case `caseScores`, and `updatedAt`. |
| `announcements/{announcementId}` | `title`, `message`, `createdAt`. Admin callable writes; signed-in clients read. |
| `stats/arena` | `registeredParticipants`; incremented by the Auth user-created trigger and readable publicly under the Firestore rule. |
| Realtime Database `/status/{uid}` | `state` (`online`/`offline`) and `lastChanged`; the user can read/write their own status. `onDisconnect` writes offline. |

`cases`, `evidence`, `questions`, and `achievements` have Firestore rule entries but are not the active source of shipped case content or scoring. They are not seeded by the current project. Public case descriptions/questions are in `src/cases.js`; private answer indexes, explanations, hint limits, evidence indexes, expected timelines, and durations are in `functions/caseKeys.js`.

### Read/write lifecycle

1. Firebase Auth creates and authenticates a participant; the browser then creates their profile document.
2. Callable Functions create teams/events/sessions and record event participation. Direct client writes to these records are denied by Firestore rules.
3. Investigation changes are saved in the session through `saveInvestigationProgress`; the client also keeps an `arena-progress` copy in `localStorage` for resume on that browser.
4. `submitInvestigation` checks session status, ownership/team membership, duplicate score record, server start time, hint count, answer indexes, selected evidence, timeline order, and report. It writes score, submission, ranking, and session status in a transaction.
5. Signed-in clients subscribe to ranking/game/announcement collections. Realtime Database presence is separate from case progress and rankings.

## 13. Security and Fair Play

### Implemented protections

- Email/password identity is managed by Firebase Authentication.
- All scoring answer keys and scoring rubrics are in `functions/caseKeys.js`, outside the Vite source tree.
- Callable Functions require an authenticated user; admin callables require the `admin` custom claim.
- Firestore rules prevent direct client writes to teams, games, sessions, scores, rankings, and submissions. User profile writes are limited to the account owner and selected fields. Team/session reads have membership conditions; stats are public; scores/rankings/announcements require sign-in.
- Score submission uses a deterministic per-user/team-and-case ID and transaction checks to prevent duplicate case submissions.
- Hint count and server start timestamp are stored in the session, not accepted from the submission payload as authoritative values.
- Text fields, report length, case ID, team membership, event status, team size, event level/case pairing, and submission age have server-side checks.
- The case catalog uses invented names and reserved `.invalid` example domains; it contains no live phishing links or exploit instructions.

### Boundaries and missing protections

- The timer still allows overtime with a capped deduction; the UI countdown is not a trusted security boundary. The server rejects sessions after three hours, but it does not enforce an event-level closing timestamp.
- Session writes are callable-validated, but current membership allows any team member to write shared progress. Only the owner can submit the final verdict.
- Team membership has no one-team-per-event constraint, leave/removal workflow, or owner transfer.
- Admin participant listing returns email as an empty string because signup stores email in Auth, not the profile document. Avoid expecting the admin list to expose account email.
- Firebase client config values are not authorization secrets. Protect data with deployed rules and claims; never ship a service-account key in this app.
- This repository has no Firebase Rules unit tests, emulator integration test, penetration test, or deployed-project verification.

## 14. Testing

From the project root:

```powershell
npm test
```

The two Node tests validate ten-case count, all three difficulties, 3-5 suspects, 5-10 evidence items, duration/difficulty/key/rubric alignment, answer index validity, and absence of obvious answer-key fields in public question objects.

Build the website with:

```powershell
npm run build
```

These checks do not test Firebase Authentication, Security Rules evaluation, Cloud Functions against a real Firestore database, event flows, or production hosting. Those need Firebase credentials/project configuration.

## 15. Troubleshooting

| Problem | Checks and response |
|---|---|
| `npm install` fails | Confirm Node/npm are installed and run from the root `package.json`. Try `npm cache verify`, then rerun `npm install`. Install Functions separately with `npm install --prefix functions`. Avoid `npm audit fix --force` unless you review major-version changes. |
| `npm run dev` says `vite` is not recognized | Run `npm install` at the root, confirm it completed, then retry. If Node is installed but not on Windows `PATH`, start a new terminal or add the Node install folder to that terminal's PATH. |
| Port 5173 is occupied | Vite usually offers another port. Or run `npm run dev -- --port 5174`. |
| UI says Firebase is not configured | Create `.env.local` from `.env.example`, fill all seven `VITE_FIREBASE_*` values including the RTDB URL, then stop/restart Vite. `.env.local` changes are loaded at dev-server startup. |
| Signup or sign-in fails | Enable Email/Password in Firebase Authentication. Check the browser message and authorized domain settings in Firebase. Passwords must be at least six characters in the current form. |
| Firestore `permission-denied` | Deploy `firestore.rules`, verify the user is signed in, and verify team membership/admin custom claim where required. `sessions`, `scores`, `rankings`, and `teams` are not client-writable. |
| Presence is missing | Create the Realtime Database, set the exact URL in `.env.local`, deploy `database.rules.json`, and sign in. Presence only records the current authenticated UID. |
| Team create/join fails | The user needs a Firestore profile first. Check code spelling/case (the UI uppercases codes), team capacity (maximum four), and that the code exists. A solo-created team cannot submit until a second member joins. |
| Event invite code fails | Sign in, ensure the lobby is `open` or `live`, and use the exact code. A paused or ended lobby rejects new joins. Existing case sessions are not tied to lobby state. |
| Ranking does not update | Verify the callable Functions are deployed and the submission succeeded. The ranking listener is attached only for signed-in users and watches up to 500 rows. Check browser console/network and Cloud Functions logs. |
| Admin console is absent/locked | Assign the `admin` custom claim with the trusted script, then sign out/in to refresh the ID token. A Firestore `role` field alone does not grant admin access. |
| Functions deployment fails | Confirm Node 20 is available for Functions, Firebase CLI login/project selection is correct, billing permits Functions, and required Firebase services are enabled. Check `firebase deploy` output and Cloud Functions logs. |
| Emulators start but app still calls Firebase | Current app code does not connect client SDKs to emulator ports. Add the corresponding `connect*Emulator` calls or use a Firebase development project. |

## 16. FAQ

**1. Is registration compulsory?**  
Browsing the landing page/case library does not require an account. Sign-in is required to start/save a server session, create/join a team or event, and submit a scored verdict.

**2. Can I play individually?**  
Yes. Open a case while signed in and without using a team.

**3. How many members can join a team?**  
The server allows up to four. It allows creating a team with one person, but requires at least two members to submit a team verdict.

**4. How do I create a team?**  
Open My Teams, enter a 2-30 character name, and choose Create team. The server returns an invitation code.

**5. How do I join a team?**  
Sign in, open My Teams, enter the team's code, and choose Join. The join is direct; there is no approval queue.

**6. Can one person join multiple teams?**  
The backend does not prohibit it. The interface loads the first returned team and does not provide a team selector, so multiple-team workflows are not polished.

**7. Can beginners participate?**  
Yes. Easy is designed for introductory email/account safety scenarios. There is no pass/fail threshold.

**8. What difficulty levels are present?**  
Easy, Medium, and Hard. The case library lists three Easy, four Medium, and three Hard cases.

**9. How are points awarded?**  
Cloud Functions compare answers, evidence indexes, timeline positions, and report length to private rubrics, then apply hint and overtime deductions. Each case is capped at 100.

**10. Can I use hints?**  
Yes. Two hints are available per case; each costs five points.

**11. Is there a time limit?**  
Each case has a displayed duration from 10-30 minutes. After that, a capped overtime deduction applies. The session is rejected after three hours; reaching zero does not automatically submit.

**12. Can I replay an investigation?**  
You can reopen a completed case to view its stored result. A second scored submission for the same individual/team and case is rejected.

**13. Can I change difficulty after starting?**  
There is no in-case difficulty control. Returning to the library lets you open another case. The session is not automatically deleted, and the backend does not bind it to a selected event level.

**14. How is the winner selected?**  
The leaderboard displays cumulative verified points. There is no explicit tie-break rule or winner-announcement workflow; event organizers need to publish those decisions separately.

**15. Can multiple colleges participate?**  
The profile has an optional college field. A participant must be able to register with the Firebase project used by the event. There is no college allowlist.

**16. Is the website mobile-friendly?**  
The React UI and CSS have responsive layouts for mobile and desktop. Authentication and Firebase operations still need a configured project.

**17. Is team chat included?**  
No. Team members share saved case progress, but there is no chat or voice channel.

**18. Are case answers visible in the frontend?**  
They are not included in `src/cases.js`. Private answer indexes and explanations are kept in the Functions source and are returned after a verdict is submitted.

**19. How do I become an administrator?**  
An authorized project operator uses `functions/scripts/set-admin.mjs` with Firebase Admin Application Default Credentials and the account UID. Never send credentials in chat.

**20. How can I contact the organizer?**  
No organizer contact address is configured in the app. Use the event or college technical-fest organizer's published contact details.

## 17. Future Improvements

These items are not implemented as complete features in this repository:

- Firestore-backed case authoring, evidence/question management, and editable scoring settings.
- Event-bound investigation sessions with start/end enforcement, pause handling, scheduled rounds, and participant monitoring.
- Team selection/switching, owner transfer, member removal/leave, one-team-per-event rules, and team chat.
- Admin submission/report review, score adjustment/audit workflow, explicit winner announcement, and certificate generation.
- Server-backed achievements and history; the current achievements screen is partly illustrative and local completed-case state uses browser storage.
- Daily challenge, more cases/levels, tournaments, richer case round types, true evidence-to-suspect matching, and offline submission queue.
- Explicit tie-break policy, automatic result export formatting, and analytics.
- Firebase Emulator client connection, rules tests, callable integration tests, and deployed end-to-end testing.

## 18. Credits and Project Information

| Item | Information |
|---|---|
| Project name | CYBER MYSTERY ARENA |
| Description | Fictional cybersecurity incident investigation game for student learning and events. |
| Category | Cybersecurity education / multiplayer web application. |
| Stack | React, JavaScript, Vite, Tailwind CSS integration, Firebase, Cloud Functions, Framer Motion, Lucide. |
| Development environment | Visual Studio Code; Node.js 20/npm; Firebase CLI. |
| Purpose | Practice evidence-based reasoning and basic cyber safety in a safe simulation. |
| Contributors | [Add student/developer names here] |
| College | [Add college name here] |
| Department | [Add department name here] |
| License | [Choose and add a license before redistributing this project.] |