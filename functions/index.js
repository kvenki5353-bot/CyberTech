import { randomBytes } from 'node:crypto'
import { initializeApp } from 'firebase-admin/app'
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { onUserCreated } from 'firebase-functions/v2/identity'
import { caseKeys, caseRubrics } from './caseKeys.js'

initializeApp()
const db = getFirestore()
const allowedDifficulties = ['Easy', 'Medium', 'Hard']

export const countNewPlayer = onUserCreated(async () => {
  await db.collection('stats').doc('arena').set({ registeredParticipants: FieldValue.increment(1) }, { merge: true })
})

function requireUser(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to use arena operations.')
  return request.auth.uid
}

function requireAdmin(request) {
  const uid = requireUser(request)
  if (request.auth.token.admin !== true) throw new HttpsError('permission-denied', 'Administrator access is required.')
  return uid
}

function inviteCode() { return randomBytes(4).toString('hex').toUpperCase() }
function cleanText(value, maxLength) { return typeof value === 'string' ? value.trim().slice(0, maxLength) : '' }
function clamp(value, minimum, maximum) { return Math.min(maximum, Math.max(minimum, value)) }
function accuracy(answerData, keys) {
  const ids = Object.keys(keys)
  if (!ids.length) return 0
  return ids.filter((id) => answerData?.[id] === keys[id]).length / ids.length
}
function expectedOrderAccuracy(submitted, expected) {
  if (!Array.isArray(submitted) || !expected.length) return 0
  return expected.filter((item, index) => submitted[index] === item).length / expected.length
}
function evidenceAccuracy(submitted, expected) {
  if (!Array.isArray(submitted) || !expected.length) return 0
  return expected.filter((item) => submitted.includes(item)).length / expected.length
}
function reportAccuracy(report, minimumLength) { return clamp(report.length / minimumLength, 0, 1) }

function calculateScore({ caseId, answers, selectedEvidence, timelineOrder, report, hintsUsed, elapsedSeconds }) {
  const key = caseKeys[caseId]
  const rubric = caseRubrics[caseId]
  const allAccuracy = accuracy(answers, key.answers)
  const timelineAccuracy = expectedOrderAccuracy(timelineOrder, key.timeline)
  const evidenceScore = evidenceAccuracy(selectedEvidence, rubric.evidence)
  const reportText = cleanText(report, 500)
  let score
  let breakdown

  if (rubric.focus === 'easy') {
    const reportScore = reportAccuracy(reportText, 50)
    breakdown = { evidence: 30 * evidenceScore, answers: 40 * allAccuracy, timeline: 20 * timelineAccuracy, explanation: 10 * reportScore }
  } else if (rubric.focus === 'medium') {
    const questionIds = Object.keys(key.answers)
    const suspectId = questionIds[0]
    const investigationIds = questionIds.slice(1)
    const suspectScore = key.answers[suspectId] === answers?.[suspectId] ? 1 : 0
    const investigationScore = investigationIds.length ? accuracy(Object.fromEntries(investigationIds.map((id) => [id, key.answers[id]])), Object.fromEntries(investigationIds.map((id) => [id, answers?.[id]]))) : allAccuracy
    breakdown = { evidence: 25 * evidenceScore, investigation: 25 * investigationScore, suspect: 20 * suspectScore, timeline: 20 * timelineAccuracy, report: 10 * reportAccuracy(reportText, 60) }
  } else {
    const questionIds = Object.keys(key.answers)
    const reconstructionAnswer = key.answers[questionIds[0]] === answers?.[questionIds[0]] ? 1 : 0
    const suspectAnswer = key.answers[questionIds[1]] === answers?.[questionIds[1]] ? 1 : 0
    const reasoningAnswer = key.answers[questionIds[2]] === answers?.[questionIds[2]] ? 1 : 0
    breakdown = { evidence: 25 * evidenceScore, reconstruction: 15 * timelineAccuracy + 10 * reconstructionAnswer, suspect: 20 * suspectAnswer, report: 20 * reportAccuracy(reportText, 100), reasoning: 10 * reasoningAnswer }
  }

  const pointsBeforePenalties = Object.values(breakdown).reduce((total, points) => total + points, 0)
  const overtimePenalty = Math.min(10, Math.floor(Math.max(0, elapsedSeconds - 60 * rubric.durationMinutes) / 60))
  const hintPenalty = hintsUsed * 5
  score = clamp(Math.round(pointsBeforePenalties) - hintPenalty - overtimePenalty, 0, 100)
  return { score, breakdown: Object.fromEntries(Object.entries(breakdown).map(([name, points]) => [name, Math.round(points)])), hintPenalty, overtimePenalty }
}

async function teamForMember(teamId, uid, transaction) {
  if (!teamId) return null
  const teamRef = db.collection('teams').doc(teamId)
  const teamSnapshot = await transaction.get(teamRef)
  if (!teamSnapshot.exists || !teamSnapshot.data().memberIds.includes(uid)) throw new HttpsError('permission-denied', 'You are not a member of this team.')
  return { ref: teamRef, ...teamSnapshot.data() }
}

export const beginInvestigation = onCall(async (request) => {
  const uid = requireUser(request)
  const caseId = cleanText(request.data?.caseId, 50)
  const teamId = cleanText(request.data?.teamId, 100) || null
  if (!caseKeys[caseId]) throw new HttpsError('not-found', 'This case is not available.')
  const sessionId = `${teamId || uid}_${caseId}`
  const sessionRef = db.collection('sessions').doc(sessionId)
  const sessionData = await db.runTransaction(async (transaction) => {
    const team = await teamForMember(teamId, uid, transaction)
    const snapshot = await transaction.get(sessionRef)
    if (snapshot.exists) return snapshot.data()
    const startedAt = Timestamp.now()
    const data = { ownerId: team ? team.ownerId : uid, teamId, caseId, startedAt, createdAt: FieldValue.serverTimestamp(), status: 'active', hintsUsed: 0, progress: { answers: {}, selectedEvidence: [], timelineOrder: [] } }
    transaction.create(sessionRef, data)
    return data
  })
  return {
    startedAt: sessionData.startedAt.toMillis(),
    elapsedSeconds: Math.floor((Date.now() - sessionData.startedAt.toMillis()) / 1000),
    hintsUsed: sessionData.hintsUsed || 0,
    progress: sessionData.progress || { answers: {}, selectedEvidence: [], timelineOrder: [] },
  }
})

export const submitInvestigation = onCall(async (request) => {
  const uid = requireUser(request)
  const caseId = cleanText(request.data?.caseId, 50)
  const key = caseKeys[caseId]
  if (!key) throw new HttpsError('not-found', 'This case is not available.')
  const teamId = cleanText(request.data?.teamId, 100) || null
  const answers = request.data?.answers && typeof request.data.answers === 'object' ? request.data.answers : {}
  const selectedEvidence = Array.isArray(request.data?.selectedEvidence) ? request.data.selectedEvidence.slice(0, 20).map(Number).filter(Number.isInteger) : []
  const timelineOrder = Array.isArray(request.data?.timelineOrder) ? request.data.timelineOrder.slice(0, 12).map((item) => cleanText(item, 100)) : []
  const report = cleanText(request.data?.report, 500)
  if (caseRubrics[caseId].focus === 'hard' && report.length < 40) throw new HttpsError('invalid-argument', 'Hard cases require an investigation report of at least 40 characters.')
  const sessionId = `${teamId || uid}_${caseId}`
  const sessionRef = db.collection('sessions').doc(sessionId)
  const scoreId = `${teamId ? `team_${teamId}` : `player_${uid}`}_${caseId}`
  const scoreRef = db.collection('scores').doc(scoreId)
  const submissionRef = db.collection('submissions').doc(scoreId)
  const rankingId = teamId ? `team_${teamId}` : `player_${uid}`
  const rankingRef = db.collection('rankings').doc(rankingId)
  const profileRef = db.collection('users').doc(uid)

  const submission = await db.runTransaction(async (transaction) => {
    const [sessionSnapshot, scoreSnapshot, profileSnapshot, rankingSnapshot] = await Promise.all([transaction.get(sessionRef), transaction.get(scoreRef), transaction.get(profileRef), transaction.get(rankingRef)])
    if (!sessionSnapshot.exists) throw new HttpsError('failed-precondition', 'Start this investigation before submitting a verdict.')
    if (scoreSnapshot.exists) throw new HttpsError('already-exists', 'A verdict has already been submitted for this case.')
    const session = sessionSnapshot.data()
    if (session.status !== 'active') throw new HttpsError('failed-precondition', 'This investigation is no longer active.')
    const team = await teamForMember(teamId, uid, transaction)
    if (team && team.ownerId !== uid) throw new HttpsError('permission-denied', 'Only the team lead can submit the final verdict.')
    if (team && team.memberIds.length < 2) throw new HttpsError('failed-precondition', 'A team needs at least two members before submitting.')
    const startedMillis = session.startedAt.toMillis()
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedMillis) / 1000))
    if (elapsedSeconds > 3 * 60 * 60) throw new HttpsError('deadline-exceeded', 'This investigation session expired. Start a new case session.')
    const hintsUsed = clamp(session.hintsUsed || 0, 0, key.hints)
    const result = calculateScore({ caseId, answers, selectedEvidence, timelineOrder, report, hintsUsed, elapsedSeconds })
    const player = profileSnapshot.data() || {}
    const scoreData = {
      score: result.score, displayName: team?.name || player.displayName || request.auth.token.name || 'Investigator',
      teamName: team?.name || null, college: team || player.publicCollege !== true ? '' : cleanText(player.college, 100), difficulty: key.difficulty,
      caseId, ownerId: uid, memberIds: team?.memberIds || [uid], mode: team ? 'Team' : 'Individual',
      elapsedSeconds, hintsUsed, breakdown: result.breakdown, createdAt: FieldValue.serverTimestamp(),
    }
    transaction.create(scoreRef, scoreData)
    transaction.create(submissionRef, { ...scoreData, ownerId: uid, answers, report, selectedEvidence, timelineOrder, status: 'verified', submittedAt: FieldValue.serverTimestamp() })
    transaction.set(rankingRef, {
      score: (rankingSnapshot.data()?.score || 0) + result.score,
      displayName: scoreData.displayName,
      teamName: scoreData.teamName,
      college: scoreData.college,
      difficulty: key.difficulty,
      difficulties: FieldValue.arrayUnion(key.difficulty),
      ownerId: team ? team.ownerId : uid,
      memberIds: FieldValue.arrayUnion(...(team?.memberIds || [uid])),
      mode: team ? 'Team' : 'Individual',
      completedCases: FieldValue.increment(1),
      elapsedSeconds: (rankingSnapshot.data()?.elapsedSeconds || 0) + elapsedSeconds,
      caseScores: { ...(rankingSnapshot.data()?.caseScores || {}), [caseId]: { score: result.score, elapsedSeconds, hintsUsed, breakdown: result.breakdown } },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    transaction.update(sessionRef, { status: 'submitted', submittedAt: FieldValue.serverTimestamp() })
    return { ...result, elapsedSeconds, hintsUsed }
  })

  return {
    score: submission.score,
    elapsedSeconds: submission.elapsedSeconds,
    hintsUsed: submission.hintsUsed,
    breakdown: submission.breakdown,
    message: 'Your answers and evidence have been verified. Scores reflect evidence selection, accuracy, timeline, report quality, hint use, and elapsed time.',
    explanations: Object.entries(key.explanations).map(([question, explanation]) => ({ question, explanation })),
  }
})

export const useInvestigationHint = onCall(async (request) => {
  const uid = requireUser(request)
  const caseId = cleanText(request.data?.caseId, 50)
  const teamId = cleanText(request.data?.teamId, 100) || null
  const key = caseKeys[caseId]
  if (!key) throw new HttpsError('not-found', 'This case is not available.')
  const sessionRef = db.collection('sessions').doc(`${teamId || uid}_${caseId}`)
  return db.runTransaction(async (transaction) => {
    await teamForMember(teamId, uid, transaction)
    const snapshot = await transaction.get(sessionRef)
    if (!snapshot.exists || snapshot.data().status !== 'active') throw new HttpsError('failed-precondition', 'Start the investigation before requesting a hint.')
    const count = snapshot.data().hintsUsed || 0
    if (count >= key.hints) throw new HttpsError('resource-exhausted', 'No hints remain for this investigation.')
    transaction.update(sessionRef, { hintsUsed: count + 1, updatedAt: FieldValue.serverTimestamp() })
    return { hintsUsed: count + 1 }
  })
})

export const saveInvestigationProgress = onCall(async (request) => {
  const uid = requireUser(request)
  const caseId = cleanText(request.data?.caseId, 50)
  const teamId = cleanText(request.data?.teamId, 100) || null
  if (!caseKeys[caseId]) throw new HttpsError('not-found', 'This case is not available.')
  const submittedAnswers = request.data?.answers && typeof request.data.answers === 'object' ? request.data.answers : {}
  const answers = Object.fromEntries(Object.entries(submittedAnswers).filter(([id, value]) => Object.hasOwn(caseKeys[caseId].answers, id) && Number.isInteger(value) && value >= 0 && value <= 3))
  const report = cleanText(submittedAnswers.report, 500)
  const selectedEvidence = Array.isArray(request.data?.selectedEvidence) ? request.data.selectedEvidence.slice(0, 12).map(Number).filter((value) => Number.isInteger(value) && value >= 0 && value <= 10) : []
  const timelineOrder = Array.isArray(request.data?.timelineOrder) ? request.data.timelineOrder.slice(0, 12).map((value) => cleanText(value, 100)) : []
  const sessionRef = db.collection('sessions').doc(`${teamId || uid}_${caseId}`)
  await db.runTransaction(async (transaction) => {
    await teamForMember(teamId, uid, transaction)
    const snapshot = await transaction.get(sessionRef)
    if (!snapshot.exists || snapshot.data().status !== 'active') throw new HttpsError('failed-precondition', 'No active investigation session was found.')
    transaction.update(sessionRef, { progress: { answers, selectedEvidence, timelineOrder, report }, lastWriter: uid, updatedAt: FieldValue.serverTimestamp() })
  })
  return { saved: true }
})

export const listMyTeams = onCall(async (request) => {
  const uid = requireUser(request)
  const snapshot = await db.collection('teams').where('memberIds', 'array-contains', uid).limit(20).get()
  return { teams: snapshot.docs.map((entry) => ({ id: entry.id, name: entry.get('name'), inviteCode: entry.get('inviteCode'), memberCount: entry.get('memberCount'), ownerId: entry.get('ownerId') })) }
})

export const createTeam = onCall(async (request) => {
  const uid = requireUser(request)
  const name = cleanText(request.data?.name, 30)
  if (name.length < 2) throw new HttpsError('invalid-argument', 'Team names must have at least two characters.')
  const userRef = db.collection('users').doc(uid)
  const userSnapshot = await userRef.get()
  if (!userSnapshot.exists) throw new HttpsError('failed-precondition', 'Create your investigator profile first.')
  const teamRef = db.collection('teams').doc()
  const code = inviteCode()
  const team = { name, inviteCode: code, ownerId: uid, memberIds: [uid], memberCount: 1, createdAt: FieldValue.serverTimestamp() }
  await teamRef.set(team)
  return { id: teamRef.id, name, inviteCode: code, memberCount: 1 }
})

export const joinTeam = onCall(async (request) => {
  const uid = requireUser(request)
  const code = cleanText(request.data?.inviteCode, 12).toUpperCase()
  if (code.length < 4) throw new HttpsError('invalid-argument', 'Enter a valid team invitation code.')
  const matches = await db.collection('teams').where('inviteCode', '==', code).limit(1).get()
  if (matches.empty) throw new HttpsError('not-found', 'No team matches that invitation code.')
  const teamRef = matches.docs[0].ref
  const team = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(teamRef)
    const data = snapshot.data()
    if (data.memberIds.includes(uid)) return data
    if (data.memberIds.length >= 4) throw new HttpsError('resource-exhausted', 'This team already has four members.')
    transaction.update(teamRef, { memberIds: FieldValue.arrayUnion(uid), memberCount: data.memberIds.length + 1 })
    return { ...data, memberIds: [...data.memberIds, uid], memberCount: data.memberIds.length + 1 }
  })
  return { id: teamRef.id, name: team.name, inviteCode: team.inviteCode, memberCount: team.memberCount }
})

export const joinGame = onCall(async (request) => {
  const uid = requireUser(request)
  const code = cleanText(request.data?.inviteCode, 12).toUpperCase()
  const matches = await db.collection('games').where('inviteCode', '==', code).limit(1).get()
  if (matches.empty) throw new HttpsError('not-found', 'No event matches that invitation code.')
  const gameRef = matches.docs[0].ref
  const participantRef = gameRef.collection('participants').doc(uid)
  const game = await db.runTransaction(async (transaction) => {
    const [snapshot, participantSnapshot] = await Promise.all([transaction.get(gameRef), transaction.get(participantRef)])
    const data = snapshot.data()
    if (!['open', 'live'].includes(data.status)) throw new HttpsError('failed-precondition', 'This event is not accepting participants.')
    if (!participantSnapshot.exists) {
      transaction.create(participantRef, { uid, joinedAt: FieldValue.serverTimestamp() })
      transaction.update(gameRef, { participantCount: FieldValue.increment(1) })
    }
    return data
  })
  return { id: gameRef.id, name: game.name, caseId: game.caseId, difficulty: game.difficulty }
})

export const adminCreateGame = onCall(async (request) => {
  const uid = requireAdmin(request)
  const name = cleanText(request.data?.name, 60)
  const caseId = cleanText(request.data?.caseId, 50)
  const difficulty = cleanText(request.data?.difficulty, 12)
  if (!name || !caseKeys[caseId] || !allowedDifficulties.includes(difficulty) || caseKeys[caseId].difficulty !== difficulty) throw new HttpsError('invalid-argument', 'Provide a name, available case, and its matching difficulty.')
  const requestedCode = cleanText(request.data?.inviteCode, 12).toUpperCase()
  const code = requestedCode || inviteCode()
  if (!/^[A-Z0-9-]{4,12}$/.test(code)) throw new HttpsError('invalid-argument', 'Invitation codes must be 4–12 letters, numbers, or hyphens.')
  const duplicate = await db.collection('games').where('inviteCode', '==', code).limit(1).get()
  if (!duplicate.empty) throw new HttpsError('already-exists', 'That invitation code is already in use.')
  const gameRef = db.collection('games').doc()
  await gameRef.set({ name, caseId, difficulty, inviteCode: code, status: 'open', participantCount: 0, createdBy: uid, createdAt: FieldValue.serverTimestamp() })
  return { id: gameRef.id, inviteCode: code }
})

export const adminSetGameStatus = onCall(async (request) => {
  requireAdmin(request)
  const gameId = cleanText(request.data?.gameId, 100)
  const status = cleanText(request.data?.status, 20)
  if (!['open', 'live', 'paused', 'ended'].includes(status)) throw new HttpsError('invalid-argument', 'Choose a supported event status.')
  const gameRef = db.collection('games').doc(gameId)
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(gameRef)
    if (!snapshot.exists) throw new HttpsError('not-found', 'Event not found.')
    transaction.update(gameRef, { status, updatedAt: FieldValue.serverTimestamp() })
  })
  return { status }
})

export const adminAnnounce = onCall(async (request) => {
  requireAdmin(request)
  const title = cleanText(request.data?.title, 80)
  const message = cleanText(request.data?.message, 400)
  if (!title || !message) throw new HttpsError('invalid-argument', 'An announcement needs a title and message.')
  const announcement = await db.collection('announcements').add({ title, message, createdAt: FieldValue.serverTimestamp() })
  return { id: announcement.id }
})

export const adminListParticipants = onCall(async (request) => {
  requireAdmin(request)
  const snapshot = await db.collection('users').orderBy('createdAt', 'desc').limit(300).get()
  return { participants: snapshot.docs.map((entry) => ({ uid: entry.id, displayName: entry.get('displayName') || '', college: entry.get('college') || '', email: entry.get('email') || '' })) }
})