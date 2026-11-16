import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity, ArrowDown, ArrowLeft, ArrowRight, Award, Bell, BookOpen, Check, ChevronDown,
  CircleHelp, Clock3, Code2, Database, Eye, FileText, Fingerprint, Flag, FlaskConical,
  Globe2, KeyRound, LayoutDashboard, Lightbulb, LockKeyhole, LogOut, Mail, Menu, Moon,
  Radio, Search, Send, Settings2, Shield, ShieldAlert, Sparkles, Sun, Swords, Target,
  Trophy, UserRound, Users, X, Zap,
} from 'lucide-react'
import { httpsCallable } from 'firebase/functions'
import {
  createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword,
  signOut, updateProfile,
} from 'firebase/auth'
import {
  collection, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, doc,
} from 'firebase/firestore'
import { onDisconnect, ref, serverTimestamp as realtimeTimestamp, set } from 'firebase/database'
import { cases, difficultyDetails } from './cases.js'
import { auth, db, firebaseConfigured, functions, realtimeDb } from './firebase.js'

const navigation = [
  { label: 'Home', icon: LayoutDashboard }, { label: 'Dashboard', icon: Activity },
  { label: 'Play Investigation', icon: Swords }, { label: 'Difficulty Levels', icon: Target },
  { label: 'My Teams', icon: Users }, { label: 'Leaderboard', icon: Trophy },
  { label: 'Achievements', icon: Award }, { label: 'My History', icon: BookOpen },
  { label: 'Profile', icon: UserRound },
]

const iconByName = { scan: Target, mail: Mail, database: Database, fingerprint: Fingerprint, shield: Shield, code: Code2, globe: Globe2, footprints: Eye, key: KeyRound, sun: Sun }
const stored = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
}
const playSignal = (muted, frequency = 620) => {
  if (muted) return
  const AudioContextType = window.AudioContext || window.webkitAudioContext
  if (!AudioContextType) return
  const audioContext = new AudioContextType()
  const oscillator = audioContext.createOscillator()
  const gain = audioContext.createGain()
  oscillator.type = 'sine'
  oscillator.frequency.value = frequency
  gain.gain.setValueAtTime(0.035, audioContext.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.13)
  oscillator.connect(gain)
  gain.connect(audioContext.destination)
  oscillator.start()
  oscillator.stop(audioContext.currentTime + 0.13)
  oscillator.onended = () => audioContext.close()
}

export default function App() {
  const [page, setPage] = useState('Home')
  const [user, setUser] = useState(null)
  const [admin, setAdmin] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState('register')
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState('')
  const [authForm, setAuthForm] = useState({ name: '', college: '', publicCollege: false, email: '', password: '' })
  const [difficulty, setDifficulty] = useState('All')
  const [activeCase, setActiveCase] = useState(null)
  const [answers, setAnswers] = useState({})
  const [selectedEvidence, setSelectedEvidence] = useState([])
  const [timelineOrder, setTimelineOrder] = useState([])
  const [hintCount, setHintCount] = useState(0)
  const [sessionReady, setSessionReady] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [result, setResult] = useState(null)
  const [submissionBusy, setSubmissionBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [leaderboard, setLeaderboard] = useState([])
  const [games, setGames] = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [registeredCount, setRegisteredCount] = useState(null)
  const [teamName, setTeamName] = useState('')
  const [teamCode, setTeamCode] = useState('')
  const [teamInfo, setTeamInfo] = useState(null)
  const [joinCode, setJoinCode] = useState('')
  const [search, setSearch] = useState('')
  const [leaderMode, setLeaderMode] = useState('Individual')
  const [theme, setTheme] = useState(stored('arena-theme', 'dark'))
  const [muted, setMuted] = useState(stored('arena-muted', true))
  const [mobileMenu, setMobileMenu] = useState(false)

  useEffect(() => {
    if (!auth) return undefined
    return onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser)
      setAdmin(false)
      if (currentUser) {
        try { setAdmin((await currentUser.getIdTokenResult()).claims.admin === true) } catch { setAdmin(false) }
      }
    })
  }, [])

  useEffect(() => {
    if (!db || !user) return undefined
    const stops = [
      onSnapshot(query(collection(db, 'rankings'), orderBy('score', 'desc'), limit(500)), (snapshot) => setLeaderboard(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }))), () => setLeaderboard([])),
      onSnapshot(query(collection(db, 'games'), orderBy('createdAt', 'desc'), limit(20)), (snapshot) => setGames(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }))), () => setGames([])),
      onSnapshot(query(collection(db, 'announcements'), orderBy('createdAt', 'desc'), limit(4)), (snapshot) => setAnnouncements(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }))), () => setAnnouncements([])),
    ]
    return () => stops.forEach((stop) => stop())
  }, [user])

  useEffect(() => {
    if (!db) return undefined
    return onSnapshot(doc(db, 'stats', 'arena'), (snapshot) => setRegisteredCount(snapshot.data()?.registeredParticipants ?? 0), () => setRegisteredCount(null))
  }, [])

  useEffect(() => {
    if (!db || !user || !teamInfo || !activeCase || page !== 'Investigation') return undefined
    return onSnapshot(doc(db, 'sessions', `${teamInfo.id}_${activeCase.id}`), (snapshot) => {
      const session = snapshot.data()
      if (!session?.progress || session.lastWriter === user.uid) return
      setAnswers((current) => ({ ...current, ...(session.progress.answers || {}), ...(session.progress.report ? { report: session.progress.report } : {}) }))
      setSelectedEvidence(session.progress.selectedEvidence || [])
      if (session.progress.timelineOrder?.length) setTimelineOrder(session.progress.timelineOrder)
      setHintCount(session.hintsUsed || 0)
    }, () => {})
  }, [user, teamInfo, activeCase, page])

  useEffect(() => {
    if (!functions || !user) { setTeamInfo(null); return undefined }
    let active = true
    httpsCallable(functions, 'listMyTeams')({}).then(({ data }) => {
      if (active && data.teams?.length) setTeamInfo(data.teams[0])
    }).catch(() => {})
    return () => { active = false }
  }, [user])

  useEffect(() => {
    if (!realtimeDb || !user) return undefined
    const presenceRef = ref(realtimeDb, `status/${user.uid}`)
    const online = { state: 'online', lastChanged: realtimeTimestamp() }
    const offline = { state: 'offline', lastChanged: realtimeTimestamp() }
    onDisconnect(presenceRef).set(offline)
    set(presenceRef, online)
    return () => {
      set(presenceRef, offline)
      onDisconnect(presenceRef).cancel()
    }
  }, [user])

  useEffect(() => {
    if (!activeCase) return undefined
    const progress = { caseId: activeCase.id, answers, selectedEvidence, timelineOrder, hintCount }
    localStorage.setItem('arena-progress', JSON.stringify(progress))
    if (!sessionReady || !functions || !user || result) return undefined
    const timeout = window.setTimeout(() => {
      httpsCallable(functions, 'saveInvestigationProgress')({ caseId: activeCase.id, teamId: teamInfo?.id || null, answers, selectedEvidence, timelineOrder }).catch(() => {})
    }, 350)
    return () => window.clearTimeout(timeout)
  }, [activeCase, answers, selectedEvidence, timelineOrder, hintCount, sessionReady, user, teamInfo, result])

  useEffect(() => {
    if (!activeCase || result) return undefined
    const ticker = window.setInterval(() => setElapsed((seconds) => seconds + 1), 1000)
    return () => window.clearInterval(ticker)
  }, [activeCase, result])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('arena-theme', JSON.stringify(theme))
  }, [theme])

  useEffect(() => { localStorage.setItem('arena-muted', JSON.stringify(muted)) }, [muted])

  const completed = useMemo(() => stored('arena-completed', []), [result])
  const visibleCases = useMemo(() => cases.filter((gameCase) => difficulty === 'All' || gameCase.difficulty === difficulty), [difficulty])
  const filteredScores = useMemo(() => leaderboard.filter((score) => (score.mode || 'Individual') === leaderMode && `${score.displayName || score.teamName || ''} ${score.college || ''}`.toLowerCase().includes(search.toLowerCase())), [leaderboard, leaderMode, search])
  const playerScore = leaderboard.find((score) => score.ownerId === user?.uid && score.mode === 'Individual')?.score
    ?? leaderboard.find((score) => score.mode === 'Team' && score.memberIds?.includes(user?.uid))?.score
    ?? 0
  const myRank = leaderboard.findIndex((score) => score.ownerId === user?.uid || score.memberIds?.includes(user?.uid)) + 1
  const secondsRemaining = Math.max(0, (activeCase?.duration || 0) * 60 - elapsed)
  const timer = `${String(Math.floor(secondsRemaining / 60)).padStart(2, '0')}:${String(secondsRemaining % 60).padStart(2, '0')}`

  const invoke = async (name, data) => {
    if (!functions) throw new Error('Connect Firebase to enable live multiplayer and server-verified scoring.')
    return (await httpsCallable(functions, name)(data)).data
  }

  const openCase = async (gameCase) => {
    if (!user) {
      setNotice('Create an account or sign in to start a timed investigation and save your progress.')
      setAuthMode('register')
      setAuthOpen(true)
      return
    }
    const previousScore = leaderboard.find((score) => Object.hasOwn(score.caseScores || {}, gameCase.id) && score.memberIds?.includes(user.uid))
    if (previousScore) {
      setActiveCase(gameCase)
      setPage('Investigation')
      setResult({ ...previousScore.caseScores?.[gameCase.id], message: 'This case is already closed. Your verified result is shown below.' })
      setSessionReady(false)
      return
    }
    const localProgress = stored('arena-progress', null)
    const resumeLocal = localProgress?.caseId === gameCase.id ? localProgress : null
    setActiveCase(gameCase)
    setPage('Investigation')
    setSessionReady(false)
    setAnswers(resumeLocal?.answers || {})
    setSelectedEvidence(resumeLocal?.selectedEvidence || [])
    setTimelineOrder(resumeLocal?.timelineOrder?.length ? resumeLocal.timelineOrder : [...gameCase.timeline])
    setHintCount(0)
    setElapsed(0)
    setResult(null)
    setNotice('')
    playSignal(muted, 540)
    try {
      const session = await invoke('beginInvestigation', { caseId: gameCase.id, teamId: teamInfo?.id || null })
      const remoteProgress = session.progress || {}
      const progress = Object.keys(remoteProgress.answers || {}).length || remoteProgress.selectedEvidence?.length ? remoteProgress : resumeLocal
      if (progress) {
        setAnswers(progress.answers || {})
        setSelectedEvidence(progress.selectedEvidence || [])
        setTimelineOrder(progress.timelineOrder?.length ? progress.timelineOrder : [...gameCase.timeline])
      }
      setHintCount(session.hintsUsed || 0)
      setElapsed(session.elapsedSeconds || 0)
      setSessionReady(true)
    } catch (error) { setNotice(error.message) }
  }

  const finishAuth = async (event) => {
    event.preventDefault()
    setAuthError('')
    if (!auth) { setAuthError('Firebase is not configured. Add your project values to .env.local, then restart the app.'); return }
    setAuthBusy(true)
    try {
      if (authMode === 'register') {
        const credential = await createUserWithEmailAndPassword(auth, authForm.email.trim(), authForm.password)
        await updateProfile(credential.user, { displayName: authForm.name.trim() })
        await setDoc(doc(db, 'users', credential.user.uid), { displayName: authForm.name.trim(), college: authForm.college.trim(), publicCollege: authForm.publicCollege, role: 'player', createdAt: serverTimestamp() })
        setUser(credential.user)
      } else {
        const credential = await signInWithEmailAndPassword(auth, authForm.email.trim(), authForm.password)
        setUser(credential.user)
      }
      setAuthOpen(false)
      setNotice('You are signed in. Your investigation progress will be saved to this device.')
    } catch (error) { setAuthError(error.message.replace('Firebase: ', '')) }
    finally { setAuthBusy(false) }
  }

  const requestHint = async () => {
    if (!activeCase || hintCount >= activeCase.hints.length) return
    try {
      const response = await invoke('useInvestigationHint', { caseId: activeCase.id, teamId: teamInfo?.id || null })
      setHintCount(response.hintsUsed)
    } catch (error) { setNotice(error.message) }
  }

  const submitCase = async (event) => {
    event.preventDefault()
    if (!user || !activeCase) { setNotice('Sign in before submitting a verdict.'); return }
    setSubmissionBusy(true)
    setNotice('')
    try {
      const response = await invoke('submitInvestigation', {
        caseId: activeCase.id, answers, selectedEvidence, timelineOrder,
        report: answers.report || '', teamId: teamInfo?.id || null,
      })
      setResult(response)
      playSignal(muted, 760)
      const nextCompleted = [...new Set([...completed, activeCase.id])]
      localStorage.setItem('arena-completed', JSON.stringify(nextCompleted))
      localStorage.removeItem('arena-progress')
      setNotice('Verdict submitted and verified by the arena server.')
    } catch (error) { setNotice(error.message) }
    finally { setSubmissionBusy(false) }
  }

  const createTeam = async (event) => {
    event.preventDefault()
    try {
      const data = await invoke('createTeam', { name: teamName.trim() })
      setTeamInfo(data)
      setTeamCode(data.inviteCode)
      setNotice(`Team created. Share invite code ${data.inviteCode} with your teammates.`)
    } catch (error) { setNotice(error.message) }
  }

  const joinTeam = async (event) => {
    event.preventDefault()
    try {
      const data = await invoke('joinTeam', { inviteCode: teamCode.trim().toUpperCase() })
      setTeamInfo(data)
      setNotice(`Joined ${data.name}.`)
    } catch (error) { setNotice(error.message) }
  }

  const joinGame = async (event) => {
    event.preventDefault()
    try {
      const data = await invoke('joinGame', { inviteCode: joinCode.trim().toUpperCase() })
      const assignedCase = cases.find((gameCase) => gameCase.id === data.caseId)
      if (assignedCase) await openCase(assignedCase)
      else setNotice(`Joined game ${data.name}. The assigned case is unavailable in this version.`)
    }
    catch (error) { setNotice(error.message) }
  }

  const shiftTimeline = (index, direction) => {
    const target = index + direction
    if (target < 0 || target >= timelineOrder.length) return
    const next = [...timelineOrder]
    ;[next[index], next[target]] = [next[target], next[index]]
    setTimelineOrder(next)
    localStorage.setItem('arena-progress', JSON.stringify({ caseId: activeCase.id, answers, selectedEvidence, timelineOrder: next, hintCount }))
  }

  const exportResults = () => {
    const header = ['Rank', 'Player or team', 'College', 'Difficulty', 'Score', 'Completion time']
    const rows = leaderboard.map((item, index) => [index + 1, item.displayName || item.teamName || '', item.college || '', item.difficulty || '', item.score || 0, item.elapsedSeconds || ''])
    const csv = [header, ...rows].map((row) => row.map((field) => `"${String(field).replaceAll('"', '""')}"`).join(',')).join('\n')
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    link.download = 'cyber-mystery-results.csv'
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const goTo = (label) => { setPage(label); setActiveCase(null); setMobileMenu(false); setNotice('') }

  return (
    <div className="app-shell">
      <div className="ambient-grid" aria-hidden="true" />
      <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}>
        <button className="brand-lockup" onClick={() => goTo('Home')} aria-label="Cyber Mystery Arena home">
          <span className="brand-mark"><ShieldAlert size={20} /></span><span className="brand-type"><strong>CYBER MYSTERY</strong><small>ARENA / 2026</small></span>
        </button>
        <div className="side-caption">INVESTIGATION DECK</div>
        <nav className="side-nav" aria-label="Main navigation">
          {navigation.map(({ label, icon: Icon }) => <button key={label} className={`nav-link ${page === label || (page === 'Investigation' && label === 'Play Investigation') ? 'active' : ''}`} onClick={() => goTo(label)}><Icon size={17} strokeWidth={1.8} /><span>{label}</span>{label === 'Leaderboard' && <span className="nav-live-dot" />}</button>)}
        </nav>
        {admin && <button className={`nav-link admin-link ${page === 'Admin' ? 'active' : ''}`} onClick={() => goTo('Admin')}><Settings2 size={17} /><span>Admin console</span></button>}
        <div className="side-bottom">
          <div className="system-status"><span className={firebaseConfigured ? 'status-light live' : 'status-light'} /> <span>{firebaseConfigured ? 'ARENA SYSTEMS ONLINE' : 'LOCAL PREVIEW MODE'}</span><small>{firebaseConfigured ? 'FIREBASE CONNECTED' : 'CONNECT FIREBASE TO PLAY'}</small></div>
          {user ? <button className="account-chip" onClick={() => goTo('Profile')}><span className="avatar">{(user.displayName || user.email || 'P').slice(0, 1).toUpperCase()}</span><span className="account-label"><strong>{user.displayName || 'Investigator'}</strong><small>{admin ? 'ADMINISTRATOR' : 'FIELD INVESTIGATOR'}</small></span><ChevronDown size={15} /></button> : <button className="side-login" onClick={() => { setAuthMode('register'); setAuthOpen(true) }}>Create investigator ID <ArrowRight size={14} /></button>}
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="icon-button mobile-menu-button" aria-label="Toggle navigation" onClick={() => setMobileMenu(!mobileMenu)}><Menu size={19} /></button>
          <div className="breadcrumb"><span>ARENA</span><span className="breadcrumb-slash">/</span><strong>{page === 'Investigation' ? 'ACTIVE CASE' : page.toUpperCase()}</strong></div>
          <div className="top-actions">
            <div className="event-indicator"><span className="pulse-dot" />{games.some((game) => game.status === 'live') ? 'LIVE EVENT' : 'OPEN INVESTIGATIONS'}</div>
            <button className="icon-button" aria-label="Toggle light or dark appearance" title="Toggle appearance" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button>
            <button className="icon-button" aria-label="Toggle sound effects" title={muted ? 'Sound muted' : 'Sound on'} onClick={() => { const nextMuted = !muted; setMuted(nextMuted); playSignal(nextMuted, 620) }}><Radio size={17} className={muted ? 'muted-icon' : ''} /></button>
            {user ? <button className="top-avatar" onClick={() => goTo('Profile')}>{(user.displayName || user.email || 'P').slice(0, 1).toUpperCase()}</button> : <button className="button button-small button-outline" onClick={() => { setAuthMode('login'); setAuthOpen(true) }}>Sign in</button>}
          </div>
        </header>

        {notice && <motion.div className="notice" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}><CircleHelp size={16} /><span>{notice}</span><button aria-label="Dismiss message" onClick={() => setNotice('')}><X size={15} /></button></motion.div>}

        <AnimatePresence mode="wait">
          <motion.div key={page} className="page-content" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
            {page === 'Investigation' && activeCase ? <InvestigationView key={activeCase.id} {...{ activeCase, answers, setAnswers, selectedEvidence, setSelectedEvidence, timelineOrder, shiftTimeline, hintCount, requestHint, timer, result, submitCase, submissionBusy, goTo }} /> : null}
            {page !== 'Investigation' && page !== 'Admin' && <>
              {page === 'Home' && <HomeView {...{ cases, games, announcements, leaderboard, registeredCount, completed, user, openCase, setPage, setDifficulty, setAuthOpen, setAuthMode, setJoinCode, joinCode, joinGame, notice }} />}
              {page === 'Dashboard' && <DashboardView {...{ user, playerScore, myRank, completed, cases, openCase, setPage, setAuthOpen, setAuthMode }} />}
              {page === 'Play Investigation' && <CaseLibrary {...{ visibleCases, difficulty, setDifficulty, openCase, completed, search, setSearch, setPage }} />}
              {page === 'Difficulty Levels' && <DifficultyView {...{ setDifficulty, setPage }} />}
              {page === 'My Teams' && <TeamsView {...{ user, teamName, setTeamName, teamCode, setTeamCode, teamInfo, createTeam, joinTeam }} />}
              {page === 'Leaderboard' && <LeaderboardView {...{ filteredScores, leaderboard, leaderMode, setLeaderMode, search, setSearch, myRank, exportResults, admin }} />}
              {page === 'Achievements' && <AchievementsView {...{ completed, cases }} />}
              {page === 'My History' && <HistoryView {...{ completed, cases, openCase }} />}
              {page === 'Profile' && <ProfileView {...{ user, admin, playerScore, myRank, setAuthOpen, setAuthMode, onSignOut: async () => { if (auth) await signOut(auth); setUser(null); goTo('Home') } }} />}
            </>}
            {page === 'Admin' && <AdminView {...{ admin, games, leaderboard, exportResults, notice, invoke, setNotice }} />}
          </motion.div>
        </AnimatePresence>
        <footer className="page-footer"><span>CYBER MYSTERY ARENA <i>·</i> EVERY CLUE MATTERS.</span><span>FICTIONAL TRAINING SIMULATION <Shield size={12} /></span></footer>
      </main>

      <AnimatePresence>
        {authOpen && <AuthDialog {...{ authMode, setAuthMode, authForm, setAuthForm, authBusy, authError, finishAuth, onClose: () => { setAuthOpen(false); setAuthError('') } }} />}
      </AnimatePresence>
    </div>
  )
}

function PageHeading({ eyebrow, title, description, action }) {
  return <div className="page-heading"><div><div className="eyebrow"><span />{eyebrow}</div><h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</div>
}

function HomeView({ cases: caseList, games, announcements, leaderboard, registeredCount, completed, user, openCase, setPage, setDifficulty, setAuthOpen, setAuthMode, joinCode, setJoinCode, joinGame }) {
  const featured = caseList.find((gameCase) => !completed.includes(gameCase.id)) || caseList[0]
  const top = [...leaderboard].slice(0, 3)
  return <>
    <section className="hero-panel">
      <div className="hero-copy"><div className="eyebrow hero-eyebrow"><span />THE CAMPUS CYBER INVESTIGATION LEAGUE</div><h1>Every mystery<br /><em>leaves a trace.</em></h1><p>Investigate. Analyse. Decode. Uncover the Truth!</p>
        <div className="hero-actions"><button className="button button-primary" onClick={() => user ? setPage('Play Investigation') : (setAuthMode('register'), setAuthOpen(true))}><Swords size={16} />Enter the arena <ArrowRight size={15} /></button><button className="button button-quiet" onClick={() => setPage('Difficulty Levels')}>How to play <ArrowRight size={14} /></button></div>
        <div className="hero-proof"><span><b>10</b> original cases</span><span><b>3</b> difficulty levels</span><span><b>2–4</b> per team</span></div>
      </div>
      <div className="hero-art" aria-label="Stylized investigation radar"><div className="radar-sweep" /><div className="radar-ring ring-one" /><div className="radar-ring ring-two" /><div className="radar-crosshair" /><span className="radar-target target-one" /><span className="radar-target target-two" /><span className="radar-target target-three" /><div className="radar-label label-top">SIGNAL / 03</div><div className="radar-label label-bottom">TRACE DETECTED <span>●</span></div><div className="radar-core"><Fingerprint size={25} /></div><div className="radar-coordinate">37° 46' 49.2" N<br />122° 25' 09.6" W</div></div>
      <div className="hero-index">01 <span>/</span> 10</div>
    </section>
    <section className="stats-strip">
      <div className="stat-block"><span className="stat-icon"><Users size={17} /></span><div><strong>{registeredCount === null ? '—' : registeredCount.toLocaleString()}</strong><small>REGISTERED PLAYERS</small></div></div>
      <div className="stat-block"><span className="stat-icon"><FileText size={17} /></span><div><strong>10</strong><small>CASE FILES</small></div></div>
      <div className="stat-block"><span className="stat-icon"><Trophy size={17} /></span><div><strong>{top[0]?.score ?? '—'}</strong><small>TOP SCORE</small></div></div>
      <div className="stat-block"><span className="stat-icon"><Radio size={17} /></span><div><strong>{games.filter((game) => game.status === 'live').length || '—'}</strong><small>LIVE EVENTS</small></div></div>
    </section>
    <div className="content-grid home-grid">
      <section className="section-block featured-section"><div className="section-heading"><div><div className="eyebrow">CASE FILE / {featured.id.toUpperCase()}</div><h2>Pick up the trail</h2></div><button className="text-link" onClick={() => setPage('Play Investigation')}>All case files <ArrowRight size={14} /></button></div>
        <CaseTile gameCase={featured} onClick={() => openCase(featured)} featured />
      </section>
      <section className="section-block event-section"><div className="section-heading"><div><div className="eyebrow">FIELD OPERATIONS</div><h2>Join an event</h2></div><span className="mini-live"><span />LOBBY</span></div>
        <form className="join-code-form" onSubmit={joinGame}><label htmlFor="event-code">INVITATION CODE</label><div className="input-action"><input id="event-code" value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="e.g. ARENA26" maxLength={12} /><button aria-label="Join event" type="submit"><ArrowRight size={17} /></button></div></form>
        {games.length ? games.slice(0, 2).map((game) => <div className="lobby-row" key={game.id}><span className="lobby-glyph"><Radio size={16} /></span><div><strong>{game.name}</strong><small>{(game.difficulty || 'Mixed')} · {game.participantCount || 0} investigators</small></div><span className={`game-status ${game.status === 'live' ? 'is-live' : ''}`}>{game.status || 'open'}</span></div>) : <div className="empty-lobby"><span className="empty-line" /><p>No live operations at the moment.</p><small>Enter an invite code from your event organizer.</small></div>}
        {!user && <button className="button button-outline join-register" onClick={() => { setAuthMode('register'); setAuthOpen(true) }}>Register to investigate <ArrowRight size={14} /></button>}
      </section>
    </div>
    <div className="content-grid lower-grid">
      <section className="section-block"><div className="section-heading"><div><div className="eyebrow">THE INVESTIGATION LOOP</div><h2>How to play</h2></div><span className="section-number">01—04</span></div>
        <div className="steps-grid">{[['01', 'Choose your case', 'Pick a difficulty and enter a solo or team investigation.'], ['02', 'Read the evidence', 'Inspect the synthetic records and collect the clues that matter.'], ['03', 'Build your theory', 'Answer questions, arrange events, and use hints carefully.'], ['04', 'Submit a verdict', 'The arena verifies your work and updates the live rankings.']].map(([number, title, copy]) => <div className="step-item" key={number}><span>{number}</span><strong>{title}</strong><p>{copy}</p></div>)}</div>
      </section>
      <section className="section-block announcement-section"><div className="section-heading"><div><div className="eyebrow">ARENA DISPATCHES</div><h2>Latest intel</h2></div><Bell size={16} /></div>
        {announcements.length ? announcements.map((item) => <article className="dispatch" key={item.id}><span className="dispatch-dot" /><div><strong>{item.title}</strong><p>{item.message}</p><small>{item.createdAt?.toDate?.().toLocaleDateString() || 'ARENA NOTICE'}</small></div></article>) : <div className="dispatch empty-dispatch"><span className="dispatch-dot" /><div><strong>All channels quiet</strong><p>New event announcements will appear here.</p><small>STANDING BY</small></div></div>}
        <div className="slogan-line"><Sparkles size={14} /> EVERY CLUE MATTERS. EVERY DECISION COUNTS.</div>
      </section>
    </div>
  </>
}

function DashboardView({ user, playerScore, myRank, completed, cases: caseList, openCase, setPage, setAuthOpen, setAuthMode }) {
  const nextCase = caseList.find((gameCase) => !completed.includes(gameCase.id)) || caseList[0]
  return <>
    <PageHeading eyebrow="YOUR FIELD DESK" title={user ? `Welcome back, ${user.displayName?.split(' ')[0] || 'investigator'}.` : 'Your next case starts here.'} description="A clear view of your investigations, progress, and standing in the arena." action={<button className="button button-primary" onClick={() => user ? setPage('Play Investigation') : (setAuthMode('register'), setAuthOpen(true))}><Swords size={15} />Start an investigation</button>} />
    <div className="metric-grid"><Metric label="TOTAL POINTS" value={playerScore} icon={Zap} accent="lime" /><Metric label="CASES CLOSED" value={completed.length} icon={Check} accent="cyan" /><Metric label="CURRENT RANK" value={myRank || '—'} icon={Trophy} accent="orange" /><Metric label="INVESTIGATOR LEVEL" value={completed.length > 3 ? 'SENIOR' : 'ROOKIE'} icon={Shield} accent="blue" /></div>
    <div className="content-grid dashboard-grid"><section className="section-block"><div className="section-heading"><div><div className="eyebrow">RECOMMENDED NEXT</div><h2>{nextCase.title}</h2></div><span className={`difficulty-tag ${nextCase.difficulty.toLowerCase()}`}>{nextCase.difficulty}</span></div><CaseTile gameCase={nextCase} onClick={() => openCase(nextCase)} featured /></section>
      <section className="section-block"><div className="section-heading"><div><div className="eyebrow">YOUR PROGRESS</div><h2>Investigation record</h2></div><button className="icon-link" onClick={() => setPage('My History')} aria-label="View investigation history"><ArrowRight size={17} /></button></div><div className="progress-copy"><span>{completed.length} / {caseList.length} CASES COMPLETE</span><strong>{Math.round(completed.length / caseList.length * 100)}%</strong></div><div className="progress-track"><i style={{ width: `${completed.length / caseList.length * 100}%` }} /></div><div className="badge-row"><span className="badge-symbol"><Award size={18} /></span><div><strong>{completed.length ? 'First case closed' : 'Your first badge awaits'}</strong><small>{completed.length ? 'Investigator · earned' : 'Complete any case to earn it'}</small></div></div><div className="badge-row"><span className="badge-symbol badge-symbol-muted"><Target size={18} /></span><div><strong>Evidence collector</strong><small>Find every clue in a case</small></div><span className="locked-label">LOCKED</span></div></section>
    </div>
  </>
}

function CaseLibrary({ visibleCases, difficulty, setDifficulty, openCase, completed, search, setSearch, setPage }) {
  const foundCases = visibleCases.filter((gameCase) => `${gameCase.title} ${gameCase.subtitle} ${gameCase.category}`.toLowerCase().includes(search.toLowerCase()))
  return <>
    <PageHeading eyebrow="CASE ARCHIVE / 10 FILES" title="Play Investigation" description="Every case is a self-contained fictional simulation. Collect clues, connect the timeline, and submit your verdict." action={<div className="case-total"><strong>{foundCases.length.toString().padStart(2, '0')}</strong><small>AVAILABLE FILES</small></div>} />
    <div className="library-tools"><div className="segmented-control" role="group" aria-label="Filter cases by difficulty">{['All', 'Easy', 'Medium', 'Hard'].map((level) => <button key={level} className={difficulty === level ? 'selected' : ''} onClick={() => setDifficulty(level)}>{level}</button>)}</div><label className="search-box"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search case files" aria-label="Search case files" /><kbd>⌕</kbd></label></div>
    <div className="case-grid">{foundCases.map((gameCase, index) => <CaseTile key={gameCase.id} gameCase={gameCase} onClick={() => openCase(gameCase)} completed={completed.includes(gameCase.id)} index={index} />)}</div>
    {!foundCases.length && <EmptyState icon={Search} title="No case files found" copy="Try another title or difficulty filter." />}
    <div className="simulation-note"><Shield size={15} /><span>All evidence is invented for training. No real links, malware, or unauthorized activity.</span><button onClick={() => setPage('Difficulty Levels')}>About difficulty <ArrowRight size={14} /></button></div>
  </>
}

function CaseTile({ gameCase, onClick, featured = false, completed = false, index = 0 }) {
  const Icon = iconByName[gameCase.icon] || Fingerprint
  return <motion.button className={`case-card ${featured ? 'case-featured' : ''} tone-${gameCase.color}`} onClick={onClick} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.04, 0.2) }}>
    <div className="case-card-top"><span className="case-category"><Icon size={15} />{gameCase.category}</span><span className={`difficulty-tag ${gameCase.difficulty.toLowerCase()}`}>{gameCase.difficulty}</span></div>
    <div className="case-card-main"><div className="case-card-art"><div className="art-circle"><Icon size={25} /></div><div className="art-grid" /></div><div className="case-card-copy"><span className="file-id">FILE / {gameCase.id.toUpperCase()}</span><h3>{gameCase.title}</h3><p>{gameCase.subtitle}</p>{featured && <p className="featured-brief">{gameCase.briefing}</p>}</div></div>
    <div className="case-card-bottom"><span><Clock3 size={14} />{gameCase.duration} MIN</span><span><FileText size={14} />{gameCase.evidence.length} EVIDENCE</span><span className="case-cta">{completed ? <><Check size={14} />CLOSED</> : featured ? <>OPEN CASE <ArrowRight size={14} /></> : <>INVESTIGATE <ArrowRight size={14} /></>}</span></div>
  </motion.button>
}

function DifficultyView({ setDifficulty, setPage }) {
  const info = [
    { level: 'Easy', number: '01', color: 'lime', icon: 'radar', goals: ['Identify suspicious messages', 'Match evidence to a safe response', 'Build a simple incident timeline'] },
    { level: 'Medium', number: '02', color: 'cyan', icon: 'scan', goals: ['Analyse simulated system records', 'Compare accounts and statements', 'Reconstruct a multi-step timeline'] },
    { level: 'Hard', number: '03', color: 'orange', icon: 'shield', goals: ['Correlate several evidence sources', 'Separate facts from attribution', 'Write a reasoned investigation report'] },
  ]
  return <><PageHeading eyebrow="CHOOSE YOUR INVESTIGATION LEVEL" title="Difficulty Levels" description="Select the pace and depth that fits your crew. You can change levels before opening a case." />
    <div className="difficulty-grid">{info.map(({ level, number, color, icon, goals }) => { const Icon = iconByName[icon] || Target; const detail = difficultyDetails[level]; return <article className={`difficulty-card difficulty-${color}`} key={level}><div className="difficulty-card-top"><span>LEVEL / {number}</span><Icon size={21} /></div><h2>{level}</h2><h3>{detail.label}</h3><p>{detail.description}</p><ul>{goals.map((goal) => <li key={goal}><Check size={14} />{goal}</li>)}</ul><div className="score-breakdown"><small>SCORING MODEL</small><span>{detail.points}</span></div><button className="button button-outline" onClick={() => { setDifficulty(level); setPage('Play Investigation') }}>Browse {level.toLowerCase()} cases <ArrowRight size={15} /></button></article> })}</div>
    <div className="hint-policy"><Lightbulb size={17} /><span><strong>Hints are limited.</strong> Each hint reduces the maximum score for that case. Your timer begins when the server records the investigation start.</span></div>
  </>
}

function InvestigationView({ activeCase, answers, setAnswers, selectedEvidence, setSelectedEvidence, timelineOrder, shiftTimeline, hintCount, requestHint, timer, result, submitCase, submissionBusy, goTo }) {
  const [activeTab, setActiveTab] = useState('Evidence')
  const evidenceCollected = (id) => selectedEvidence.includes(Number(id))
  const toggleEvidence = (id) => {
    const evidenceIndex = Number(id)
    setSelectedEvidence((current) => current.includes(evidenceIndex) ? current.filter((entry) => entry !== evidenceIndex) : [...current, evidenceIndex])
  }
  const progress = Math.round((Object.keys(answers).filter((key) => key !== 'report').length / activeCase.questions.length) * 100)
  const Icon = iconByName[activeCase.icon] || Fingerprint
  return <div className="investigation-layout">
    <div className="investigation-top"><button className="back-link" onClick={() => goTo('Play Investigation')}><ArrowLeft size={15} />CASE ARCHIVE</button><div className="investigation-status"><span className="pulse-dot" />CASE IN PROGRESS</div><div className="case-timer"><Clock3 size={15} /><strong>{timer}</strong><small>REMAINING</small></div></div>
    <div className="case-title-row"><div><div className="eyebrow">{activeCase.difficulty.toUpperCase()} INVESTIGATION <span className="eyebrow-divider">/</span> {activeCase.category.toUpperCase()}</div><h1>{activeCase.title}<span>:</span> {activeCase.subtitle}</h1></div><div className="case-progress"><strong>{progress}%</strong><span>CASE PROGRESS</span><div className="progress-track"><i style={{ width: `${progress}%` }} /></div></div></div>
    <div className="case-workspace">
      <section className="workspace-main">
        {result ? <ResultPanel result={result} gameCase={activeCase} onBack={() => goTo('Leaderboard')} /> : <>
          <div className="briefing-card"><div className="briefing-icon"><Icon size={21} /></div><div><div className="eyebrow">MISSION BRIEFING</div><p>{activeCase.briefing}</p><small><Shield size={12} />{activeCase.incident}</small></div></div>
          <div className="workspace-tabs" role="tablist">{['Evidence', 'Suspects', 'Questions'].map((tab) => <button key={tab} role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? 'tab-active' : ''} onClick={() => setActiveTab(tab)}>{tab}{tab === 'Evidence' && <span>{activeCase.evidence.length}</span>}{tab === 'Questions' && <span>{activeCase.questions.length}</span>}</button>)}</div>
          {activeTab === 'Evidence' && <div className="evidence-grid">{activeCase.evidence.map((item, index) => { const picked = evidenceCollected(String(index)); return <button key={item.title} className={`evidence-card ${picked ? 'evidence-picked' : ''}`} onClick={() => toggleEvidence(String(index))}><div className="evidence-meta"><span>{item.type}</span><span className="evidence-index">E-{String(index + 1).padStart(2, '0')}</span></div><strong>{item.title}</strong><p>{item.detail}</p><span className="evidence-action">{picked ? <><Check size={13} /> COLLECTED</> : <><PlusIcon /> COLLECT CLUE</>}</span></button>})}</div>}
          {activeTab === 'Suspects' && <div className="suspect-grid">{activeCase.suspects.map((suspect, index) => <article className="suspect-card" key={suspect.name}><div className="suspect-avatar">{suspect.name.split(' ').map((part) => part[0]).join('')}</div><span className="suspect-number">PERSON OF INTEREST / 0{index + 1}</span><h3>{suspect.name}</h3><small>{suspect.role}</small><p>{suspect.note}</p><span className="suspect-status"><span />UNDER REVIEW</span></article>)}</div>}
          {activeTab === 'Questions' && <form className="question-list" onSubmit={submitCase}>{activeCase.questions.map((question, index) => <fieldset className={`question-card question-${question.type || 'multiple-choice'}`} key={question.id}><legend><span>Q{String(index + 1).padStart(2, '0')}</span><span className="question-prompt">{question.prompt}<small>{question.type === 'true-false' ? 'TRUE OR FALSE' : question.type === 'clue' ? 'FIND THE CLUE' : question.type === 'match' ? 'MATCH SUSPECT / EVIDENCE' : 'SELECT ONE'}</small></span></legend>{question.type === 'match' ? <select className="question-match-select" aria-label={question.prompt} value={answers[question.id] ?? ''} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: Number(event.target.value) }))}><option value="" disabled>Select a match</option>{question.options.map((option, optionIndex) => <option value={optionIndex} key={option}>{option}</option>)}</select> : <div className="answer-options">{question.options.map((option, optionIndex) => <label className={answers[question.id] === optionIndex ? 'answer-selected' : ''} key={option}><input type="radio" name={question.id} checked={answers[question.id] === optionIndex} onChange={() => setAnswers((current) => ({ ...current, [question.id]: optionIndex }))} /><span className="answer-letter">{question.type === 'true-false' ? (optionIndex ? 'F' : 'T') : String.fromCharCode(65 + optionIndex)}</span><span>{option}</span><Check className="answer-check" size={14} /></label>)}</div>}</fieldset>)}
            <label className="report-field"><span>FINAL INVESTIGATION REPORT <small>{activeCase.difficulty === 'Hard' ? 'REQUIRED / 40+ CHARACTERS' : 'OPTIONAL / 500 CHARACTERS'}</small></span><textarea maxLength={500} value={answers.report || ''} onChange={(event) => setAnswers((current) => ({ ...current, report: event.target.value }))} placeholder="Summarize your conclusion and cite the clues that support it." /></label>
            <button className="button button-primary submit-verdict" type="submit" disabled={submissionBusy || Object.keys(answers).filter((key) => key !== 'report').length < activeCase.questions.length || (activeCase.difficulty === 'Hard' && (answers.report || '').trim().length < 40)}>{submissionBusy ? <span className="spinner" /> : <Flag size={16} />}{submissionBusy ? 'Submitting to arena...' : 'Submit final verdict'}<ArrowRight size={15} /></button>
            {!window.navigator.onLine && <p className="offline-note">You appear offline. Answers remain on this device until connection returns.</p>}
          </form>}
          <div className="workspace-bottom"><div className="collected-summary"><span className="locker-icon"><LockKeyhole size={15} /></span><div><strong>Evidence locker</strong><small>{selectedEvidence.length} / {activeCase.evidence.length} clues collected</small></div><span className="locker-count">{String(selectedEvidence.length).padStart(2, '0')}</span></div><button className="hint-button" onClick={requestHint} disabled={hintCount >= activeCase.hints.length}><Lightbulb size={15} />Use a hint <small>{activeCase.hints.length - hintCount} LEFT</small></button></div>
          {hintCount > 0 && <div className="hint-reveal"><Lightbulb size={15} /><div><strong>FIELD NOTE / HINT {hintCount}</strong><p>{activeCase.hints[hintCount - 1]}</p></div><span>-5 PTS</span></div>}
        </>}
      </section>
      {!result && <aside className="workspace-side"><div className="side-panel"><div className="side-panel-heading"><div><span className="eyebrow">CASE FILE</span><h3>Incident details</h3></div><FileText size={17} /></div><div className="case-facts"><div><span>DIFFICULTY</span><strong>{activeCase.difficulty}</strong></div><div><span>TIME LIMIT</span><strong>{activeCase.duration} MIN</strong></div><div><span>POINTS AVAILABLE</span><strong>100 PTS</strong></div><div><span>HINT PENALTY</span><strong>-5 / HINT</strong></div></div></div>
        <div className="side-panel timeline-panel"><div className="side-panel-heading"><div><span className="eyebrow">SEQUENCE RECONSTRUCTION</span><h3>Timeline builder</h3></div><Activity size={17} /></div><p className="timeline-help">Use the arrows to arrange events in chronological order.</p><ol className="timeline-list">{timelineOrder.map((event, index) => <li key={`${event}-${index}`}><span className="timeline-index">{String(index + 1).padStart(2, '0')}</span><span>{event}</span><span className="timeline-controls"><button aria-label={`Move ${event} earlier`} disabled={index === 0} onClick={() => shiftTimeline(index, -1)}><ArrowLeft size={13} /></button><button aria-label={`Move ${event} later`} disabled={index === timelineOrder.length - 1} onClick={() => shiftTimeline(index, 1)}><ArrowRight size={13} /></button></span></li>)}</ol></div>
        <div className="side-safe-note"><Shield size={15} /><span>Fictional training environment. Never test findings against real people or systems.</span></div>
      </aside>}
    </div>
  </div>
}

function PlusIcon() { return <span className="plus-glyph">+</span> }

function ResultPanel({ result, gameCase, onBack }) {
  return <section className="result-panel"><div className="result-mark"><Trophy size={26} /></div><div className="eyebrow">VERDICT VERIFIED / CASE CLOSED</div><h2>{result.score ?? 0}<span> / 100</span></h2><p>{result.message || 'Your investigation has been checked by the arena.'}</p><div className="result-stats"><div><span>CASE</span><strong>{gameCase.title}</strong></div><div><span>RANKING</span><strong>{result.rank ? `#${result.rank}` : 'Leaderboard updated'}</strong></div><div><span>HINTS USED</span><strong>{result.hintsUsed ?? 0}</strong></div></div>{result.explanations?.length > 0 && <div className="explanation-list"><h3>Case debrief</h3>{result.explanations.map((item) => <p key={item.question}><Check size={14} /><span><strong>{gameCase.questions.find((question) => question.id === item.question)?.prompt || item.question}</strong> {item.explanation}</span></p>)}</div>}<button className="button button-primary" onClick={onBack}>Return to arena rankings <ArrowRight size={15} /></button></section>
}

function TeamsView({ user, teamName, setTeamName, teamCode, setTeamCode, teamInfo, createTeam, joinTeam }) {
  return <><PageHeading eyebrow="MULTIPLAYER / CREW ROSTER" title="My Teams" description="Investigate together. A team shares one case session and submits one final verdict." action={<span className="team-capacity"><Users size={15} />2–4 MEMBERS</span>} />
    {!user && <div className="setup-callout"><LockKeyhole size={17} /><span>Sign in to create a team or use an invitation code.</span></div>}
    {teamInfo && <div className="current-team"><div className="team-emblem"><Users size={20} /></div><div><span className="eyebrow">ACTIVE CREW</span><h2>{teamInfo.name}</h2><p>{teamInfo.memberCount || 1} / 4 investigators · Team progress is shared</p></div><div className="team-invite"><small>INVITE CODE</small><strong>{teamInfo.inviteCode}</strong></div></div>}
    <div className="team-forms"><section className="section-block team-form-block"><div className="section-heading"><div><div className="eyebrow">START A CREW</div><h2>Create a team</h2></div><Users size={18} /></div><p>Choose a name. The arena will generate a unique invitation code for your teammates.</p><form onSubmit={createTeam}><label>TEAM NAME<input required minLength={2} maxLength={30} value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="e.g. Packet Detectives" /></label><button className="button button-primary" disabled={!user}><Users size={15} />Create team <ArrowRight size={14} /></button></form></section>
      <section className="section-block team-form-block"><div className="section-heading"><div><div className="eyebrow">JOIN A CREW</div><h2>Enter an invite code</h2></div><KeyRound size={18} /></div><p>Ask your team lead for their four-to-eight character invitation code.</p><form onSubmit={joinTeam}><label>INVITATION CODE<input required minLength={4} maxLength={12} value={teamCode} onChange={(event) => setTeamCode(event.target.value.toUpperCase())} placeholder="TEAM-7K2P" /></label><button className="button button-outline" disabled={!user}><ArrowRight size={15} />Join team</button></form></section></div>
    <div className="team-rules"><div><span>01</span><p><strong>One verdict per case.</strong> Team answers are submitted by the team lead.</p></div><div><span>02</span><p><strong>Shared investigation.</strong> Discuss clues and build your timeline together.</p></div><div><span>03</span><p><strong>Fair play.</strong> Each member must have an arena account before joining.</p></div></div>
  </>
}

function LeaderboardView({ filteredScores, leaderboard, leaderMode, setLeaderMode, search, setSearch, myRank, exportResults, admin }) {
  const podium = filteredScores.slice(0, 3)
  return <><PageHeading eyebrow="LIVE RANKINGS / SERVER-VERIFIED" title="Leaderboard" description="Scores update only after a case verdict is checked by the arena server." action={admin && <button className="button button-outline" onClick={exportResults}><ArrowDown size={15} />Export CSV</button>} />
    <div className="leaderboard-controls"><div className="segmented-control" role="group" aria-label="Leaderboard mode">{['Individual', 'Team'].map((mode) => <button className={leaderMode === mode ? 'selected' : ''} key={mode} onClick={() => setLeaderMode(mode)}>{mode === 'Individual' ? <UserRound size={14} /> : <Users size={14} />}{mode}</button>)}</div><label className="search-box"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find investigator" aria-label="Search leaderboard" /></label><span className="live-updating"><span />LIVE UPDATING</span></div>
    {podium.length > 0 && <div className="podium-grid">{[podium[1], podium[0], podium[2]].filter(Boolean).map((player, index) => { const rank = index === 1 ? 1 : index === 0 ? 2 : 3; return <div className={`podium-card podium-${rank}`} key={player.id}><span className="podium-crown">{rank === 1 ? <Trophy size={18} /> : `0${rank}`}</span><div className="podium-avatar">{(player.displayName || player.teamName || '?').slice(0, 1).toUpperCase()}</div><strong>{player.displayName || player.teamName || 'Investigator'}</strong><small>{player.college || player.difficulty || 'ARENA PLAYER'}</small><b>{player.score || 0}<small>PTS</small></b></div>})}</div>}
    <section className="leaderboard-table-wrap"><div className="table-heading"><div><span className="eyebrow">ARENA STANDINGS</span><h2>{leaderMode} rankings <small>{filteredScores.length} entries</small></h2></div><span className="current-rank"><Trophy size={15} />YOUR RANK <b>{myRank ? `#${myRank}` : '—'}</b></span></div>
      {filteredScores.length ? <div className="table-scroll"><table><thead><tr><th>RANK</th><th>INVESTIGATOR</th><th>COLLEGE</th><th>CASE LEVEL</th><th>SCORE</th><th>TIME</th></tr></thead><tbody>{filteredScores.map((player, index) => <tr key={player.id}><td><span className={`rank-number ${index < 3 ? 'top-rank' : ''}`}>{String(index + 1).padStart(2, '0')}</span></td><td><span className="table-player"><span className="table-avatar">{(player.displayName || player.teamName || '?').slice(0, 1).toUpperCase()}</span>{player.displayName || player.teamName || 'Investigator'}</span></td><td>{player.college || '—'}</td><td><span className={`difficulty-tag ${(player.difficulty || 'easy').toLowerCase()}`}>{player.difficulty || '—'}</span></td><td className="score-cell">{player.score || 0}<small> PTS</small></td><td>{player.elapsedSeconds ? `${Math.floor(player.elapsedSeconds / 60)}:${String(player.elapsedSeconds % 60).padStart(2, '0')}` : '—'}</td></tr>)}</tbody></table></div> : <EmptyState icon={Trophy} title="No verified scores yet" copy="Complete an investigation and your score will appear here." />}
    </section>
  </>
}

function AchievementsView({ completed, cases: caseList }) {
  const badges = [{ title: 'First signal', description: 'Close your first investigation.', icon: Radio, unlocked: completed.length >= 1 }, { title: 'Evidence collector', description: 'Investigate three case files.', icon: Search, unlocked: completed.length >= 3 }, { title: 'Master analyst', description: 'Close a Hard case.', icon: FlaskConical, unlocked: completed.some((id) => caseList.find((gameCase) => gameCase.id === id)?.difficulty === 'Hard') }, { title: 'Full dossier', description: 'Complete every investigation in the archive.', icon: FileText, unlocked: completed.length >= caseList.length }, { title: 'Team signal', description: 'Submit a verdict with a registered team.', icon: Users, unlocked: false }, { title: 'No hints needed', description: 'Close a case without using a hint.', icon: Target, unlocked: false }]
  return <><PageHeading eyebrow="FIELD COMMENDATIONS" title="Achievements" description="Badges recognize careful investigations, evidence discipline, and teamwork." action={<div className="case-total"><strong>{badges.filter((badge) => badge.unlocked).length.toString().padStart(2, '0')}</strong><small>UNLOCKED</small></div>} /><div className="achievement-grid">{badges.map(({ title, description, icon: Icon, unlocked }, index) => <article className={`achievement-card ${unlocked ? 'unlocked' : ''}`} key={title}><span className="achievement-number">BADGE / 0{index + 1}</span><div className="achievement-icon"><Icon size={22} /></div><h3>{title}</h3><p>{description}</p><span className="achievement-state">{unlocked ? <><Check size={13} />EARNED</> : <><LockKeyhole size={12} />LOCKED</>}</span></article>)}</div></>
}

function HistoryView({ completed, cases: caseList, openCase }) {
  const historyCases = caseList.filter((gameCase) => completed.includes(gameCase.id))
  return <><PageHeading eyebrow="PERSONAL CASE FILES" title="My History" description="Review closed cases or return to an investigation you have not completed." />{historyCases.length ? <div className="case-grid">{historyCases.map((gameCase) => <CaseTile key={gameCase.id} gameCase={gameCase} onClick={() => openCase(gameCase)} completed />)}</div> : <EmptyState icon={BookOpen} title="Your record is still open" copy="Completed investigations will be listed here." />}</>
}

function ProfileView({ user, admin, playerScore, myRank, setAuthOpen, setAuthMode, onSignOut }) {
  return <><PageHeading eyebrow="INVESTIGATOR IDENTITY" title="Profile" description="Your arena account is used to save progress and validate your results." />{user ? <section className="profile-panel"><div className="profile-avatar">{(user.displayName || user.email || 'I').slice(0, 1).toUpperCase()}</div><div className="profile-main"><span className="eyebrow">{admin ? 'ARENA ADMINISTRATOR' : 'FIELD INVESTIGATOR'}</span><h2>{user.displayName || 'Investigator'}</h2><p>{user.email}</p><div className="profile-stats"><div><span>COLLEGE</span><strong>Public display is opt-in</strong></div><div><span>VERIFIED POINTS</span><strong>{playerScore}</strong></div><div><span>ARENA RANK</span><strong>{myRank ? `#${myRank}` : 'Unranked'}</strong></div></div></div><button className="button button-outline" onClick={onSignOut}><LogOut size={15} />Sign out</button></section> : <div className="empty-state profile-empty"><UserRound size={25} /><h2>No investigator ID yet</h2><p>Register to save progress, join a team, and submit a verified verdict.</p><button className="button button-primary" onClick={() => { setAuthMode('register'); setAuthOpen(true) }}>Register <ArrowRight size={15} /></button></div>}</>
}

function AdminView({ admin, games, leaderboard, exportResults, invoke, setNotice }) {
  const [eventForm, setEventForm] = useState({ name: '', caseId: cases[0].id, difficulty: 'Easy', inviteCode: '', status: 'open' })
  const [announcement, setAnnouncement] = useState({ title: '', message: '' })
  const [busy, setBusy] = useState(false)
  const [participants, setParticipants] = useState([])
  const createEvent = async (event) => { event.preventDefault(); setBusy(true); try { const result = await invoke('adminCreateGame', eventForm); setNotice(`Event created with invitation code ${result.inviteCode}.`); setEventForm({ name: '', caseId: cases[0].id, difficulty: 'Easy', inviteCode: '', status: 'open' }) } catch (error) { setNotice(error.message) } finally { setBusy(false) } }
  const changeStatus = async (gameId, status) => { try { await invoke('adminSetGameStatus', { gameId, status }); setNotice(`Event status changed to ${status}.`) } catch (error) { setNotice(error.message) } }
  const publishAnnouncement = async (event) => { event.preventDefault(); try { await invoke('adminAnnounce', announcement); setAnnouncement({ title: '', message: '' }); setNotice('Announcement published.') } catch (error) { setNotice(error.message) } }
  const loadParticipants = async () => { try { const result = await invoke('adminListParticipants', {}); setParticipants(result.participants || []) } catch (error) { setNotice(error.message) } }
  if (!admin) return <div className="empty-state admin-locked"><LockKeyhole size={26} /><h2>Administrator access required</h2><p>This panel is restricted to accounts with the Firebase admin custom claim.</p></div>
  return <><PageHeading eyebrow="RESTRICTED / ADMINISTRATOR ACCESS" title="Arena control room" description="Manage events and announcements. Case answers and score validation remain server-controlled." action={<button className="button button-outline" onClick={exportResults}><ArrowDown size={15} />Export results</button>} />
    <div className="admin-metrics"><Metric label="REGISTERED PLAYERS" value={participants.length || '—'} icon={Users} accent="cyan" /><Metric label="ACTIVE EVENTS" value={games.filter((game) => game.status === 'live').length} icon={Radio} accent="lime" /><Metric label="RANKED PLAYERS / TEAMS" value={leaderboard.length} icon={Check} accent="orange" /></div>
    <div className="admin-grid"><section className="section-block admin-block"><div className="section-heading"><div><div className="eyebrow">EVENT OPERATIONS</div><h2>Create event lobby</h2></div><Radio size={17} /></div><form className="admin-form" onSubmit={createEvent}><label>EVENT NAME<input required maxLength={60} value={eventForm.name} onChange={(event) => setEventForm({ ...eventForm, name: event.target.value })} placeholder="Campus Cyber Fest" /></label><label>DIFFICULTY<select value={eventForm.difficulty} onChange={(event) => { const selectedCase = cases.find((gameCase) => gameCase.difficulty === event.target.value); setEventForm({ ...eventForm, difficulty: event.target.value, caseId: selectedCase?.id || eventForm.caseId }) }}>{['Easy', 'Medium', 'Hard'].map((level) => <option key={level}>{level}</option>)}</select></label><label>INVESTIGATION<select value={eventForm.caseId} onChange={(event) => { const selectedCase = cases.find((gameCase) => gameCase.id === event.target.value); setEventForm({ ...eventForm, caseId: event.target.value, difficulty: selectedCase.difficulty }) }}>{cases.filter((gameCase) => gameCase.difficulty === eventForm.difficulty).map((gameCase) => <option value={gameCase.id} key={gameCase.id}>{gameCase.title}</option>)}</select></label><label>INVITE CODE<input maxLength={12} value={eventForm.inviteCode} onChange={(event) => setEventForm({ ...eventForm, inviteCode: event.target.value.toUpperCase() })} placeholder="AUTO-GENERATE" /></label><button className="button button-primary" disabled={busy}>{busy ? 'Creating...' : 'Create invitation lobby'} <ArrowRight size={14} /></button></form></section>
      <section className="section-block admin-block"><div className="section-heading"><div><div className="eyebrow">LOBBY MONITOR</div><h2>Event control</h2></div><button className="text-link" onClick={loadParticipants}>Load participants <ArrowRight size={14} /></button></div>{games.length ? games.map((game) => <div className="admin-event-row" key={game.id}><div><strong>{game.name}</strong><small>{game.inviteCode || 'No invite code'} · {game.difficulty}</small></div><span className="game-status">{game.status}</span><div className="event-control-buttons"><button onClick={() => changeStatus(game.id, 'live')} title="Start event"><Zap size={14} /></button><button onClick={() => changeStatus(game.id, 'paused')} title="Pause event"><Clock3 size={14} /></button><button onClick={() => changeStatus(game.id, 'ended')} title="End event"><Flag size={14} /></button></div></div>) : <p className="muted-copy">No event lobbies created yet.</p>}{participants.length > 0 && <div className="participant-list">{participants.map((participant) => <div key={participant.uid}><span>{participant.displayName}</span><small>{participant.college}</small></div>)}</div>}</section>
      <section className="section-block admin-block"><div className="section-heading"><div><div className="eyebrow">ARENA DISPATCHES</div><h2>Publish announcement</h2></div><Bell size={17} /></div><form className="admin-form" onSubmit={publishAnnouncement}><label>TITLE<input required maxLength={80} value={announcement.title} onChange={(event) => setAnnouncement({ ...announcement, title: event.target.value })} /></label><label>MESSAGE<textarea required maxLength={400} value={announcement.message} onChange={(event) => setAnnouncement({ ...announcement, message: event.target.value })} /></label><button className="button button-outline">Publish announcement <Send size={14} /></button></form></section></div>
  </>
}

function Metric({ label, value, icon: Icon, accent }) { return <div className={`metric-card metric-${accent}`}><span className="metric-icon"><Icon size={17} /></span><div><small>{label}</small><strong>{value}</strong></div><span className="metric-line" /></div> }

function AuthDialog({ authMode, setAuthMode, authForm, setAuthForm, authBusy, authError, finishAuth, onClose }) {
  const registering = authMode === 'register'
  return <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}><motion.section className="auth-modal" initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }} onClick={(event) => event.stopPropagation()}><button className="modal-close icon-button" aria-label="Close sign-in dialog" onClick={onClose}><X size={17} /></button><span className="modal-emblem"><Fingerprint size={22} /></span><div className="eyebrow">ARENA ACCESS / PLAYER ID</div><h2>{registering ? 'Join the investigation.' : 'Welcome back.'}</h2><p>{registering ? 'Create your investigator profile to enter cases and save progress.' : 'Sign in to continue your investigation.'}</p>
    <form className="auth-form" onSubmit={finishAuth}>{registering && <><label>INVESTIGATOR NAME<input required maxLength={40} autoComplete="name" value={authForm.name} onChange={(event) => setAuthForm({ ...authForm, name: event.target.value })} placeholder="Your name or nickname" /></label><label>COLLEGE <small>OPTIONAL</small><input maxLength={80} autoComplete="organization" value={authForm.college} onChange={(event) => setAuthForm({ ...authForm, college: event.target.value })} placeholder="College or university" /></label><label className="college-optin"><input type="checkbox" checked={authForm.publicCollege} onChange={(event) => setAuthForm({ ...authForm, publicCollege: event.target.checked })} /><span>Display my college on public rankings</span></label></>}<label>EMAIL ADDRESS<input required type="email" autoComplete="email" value={authForm.email} onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })} placeholder="you@college.edu" /></label><label>PASSWORD<input required minLength={6} type="password" autoComplete={registering ? 'new-password' : 'current-password'} value={authForm.password} onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })} placeholder="At least 6 characters" /></label>{authError && <p className="auth-error"><ShieldAlert size={14} />{authError}</p>}<button className="button button-primary auth-submit" disabled={authBusy}>{authBusy ? <span className="spinner" /> : registering ? <UserRound size={15} /> : <LockKeyhole size={15} />}{authBusy ? 'Checking credentials...' : registering ? 'Create investigator ID' : 'Sign in'}<ArrowRight size={15} /></button></form>
    <div className="auth-switch">{registering ? 'Already have an investigator ID?' : 'New to the arena?'} <button onClick={() => setAuthMode(registering ? 'login' : 'register')}>{registering ? 'Sign in' : 'Register'}</button></div><div className="auth-privacy"><Shield size={12} />Only your name, email, and optional college are collected.</div>
  </motion.section></motion.div>
}

function EmptyState({ icon: Icon, title, copy }) { return <div className="empty-state"><Icon size={24} /><h3>{title}</h3><p>{copy}</p></div> }