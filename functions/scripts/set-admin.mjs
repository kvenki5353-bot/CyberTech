import { applicationDefault, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

const uid = process.argv[2]
if (!uid) {
  console.error('Usage: npm run set-admin -- <firebase-auth-uid>')
  process.exitCode = 1
} else {
  initializeApp({ credential: applicationDefault() })
  await getAuth().setCustomUserClaims(uid, { admin: true })
  console.log(`Administrator claim assigned to ${uid}. Ask the user to sign out and back in.`)
}