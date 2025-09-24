import { useState, useEffect } from 'react'
import { WelcomeScreen } from './components/WelcomeScreen'
import { SearchScreen } from './components/SearchScreen'
import { MyBarScreen } from './components/MyBarScreen'
import { ProfileScreen } from './components/ProfileScreen'
import { TastingScreen } from './components/TastingScreen'
import { ComingSoonScreen } from './components/ComingSoonScreen'
import { SignupModal } from './components/SignupModal'
import { LoginModal } from './components/LoginModal'
import { Navigation } from './components/Navigation'
import { ToastContainer } from './components/ToastContainer'
import '../../styles.css'
import './App.css'

function App() {
  const [currentUser, setCurrentUser] = useState(null)
  const [currentScreen, setCurrentScreen] = useState('welcome')
  const [currentModal, setCurrentModal] = useState(null)
  const [toasts, setToasts] = useState([])

  // App state matching the JS class
  const [signupData, setSignupData] = useState({
    username: '',
    email: '',
    profilePic: 'whiskey-glass',
    addToHome: true,
    stayLoggedIn: true
  })

  const [loginEmail, setLoginEmail] = useState('')
  const [bottles, setBottles] = useState([])
  const [userCollection, setUserCollection] = useState([])
  const [tastings, setTastings] = useState([])
  const [currentSearchResults, setCurrentSearchResults] = useState([])
  const [currentFilters, setCurrentFilters] = useState({
    name: '',
    distillery: '',
    type: '',
    yourRankMin: 0,
    yourRankMax: 100,
    globalRankMin: 0,
    globalRankMax: 100
  })
  const [currentSort, setCurrentSort] = useState('your')

  useEffect(() => {
    checkAuthStatus()
    loadSampleData()
  }, [])

  const checkAuthStatus = () => {
    const savedUser = localStorage.getItem('pourChoicesUser')
    const rememberMe = localStorage.getItem('pourChoicesRemember')

    if (savedUser && rememberMe === 'true') {
      setCurrentUser(JSON.parse(savedUser))
      setCurrentScreen('search')
    } else if (savedUser) {
      setTimeout(() => {
        setCurrentModal('login')
      }, 3000)
    }
  }

  const loadSampleData = () => {
    const sampleBottles = [
      {
        id: 'bottle_1',
        name: 'Glenfiddich 12',
        distillery: 'Glenfiddich Distillery',
        type: 'Single Malt',
        emoji: '🥃',
        status: 'approved'
      },
      {
        id: 'bottle_2',
        name: 'Macallan 18',
        distillery: 'Macallan Distillery',
        type: 'Single Malt',
        emoji: '🥃',
        status: 'approved'
      },
      {
        id: 'bottle_3',
        name: 'Woodford Reserve',
        distillery: 'Woodford Reserve Distillery',
        type: 'Bourbon',
        emoji: '🥃',
        status: 'approved'
      },
      {
        id: 'bottle_4',
        name: 'Johnnie Walker Black',
        distillery: 'Johnnie Walker',
        type: 'Blended',
        emoji: '🥃',
        status: 'approved'
      },
      {
        id: 'bottle_5',
        name: 'Buffalo Trace',
        distillery: 'Buffalo Trace Distillery',
        type: 'Bourbon',
        emoji: '🥃',
        status: 'approved'
      }
    ]

    setBottles(sampleBottles)
  }

  const showScreen = (screen) => {
    setCurrentScreen(screen)
  }

  const showModal = (modal) => {
    setCurrentModal(modal)
  }

  const closeModal = () => {
    setCurrentModal(null)
  }

  const showToast = (message, type = 'info') => {
    const toast = {
      id: Date.now(),
      message,
      type
    }
    setToasts(prev => [...prev, toast])

    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== toast.id))
    }, 3000)
  }

  const renderCurrentScreen = () => {
    switch (currentScreen) {
      case 'welcome':
        return <WelcomeScreen onSignup={() => setCurrentModal('signup')} onLogin={() => setCurrentModal('login')} />
      case 'search':
        return <SearchScreen
          bottles={bottles}
          currentSearchResults={currentSearchResults}
          setCurrentSearchResults={setCurrentSearchResults}
          currentFilters={currentFilters}
          setCurrentFilters={setCurrentFilters}
          currentSort={currentSort}
          setCurrentSort={setCurrentSort}
          showToast={showToast}
          userCollection={userCollection}
          setUserCollection={setUserCollection}
          currentUser={currentUser}
        />
      case 'mybar':
        return <MyBarScreen
          userCollection={userCollection}
          setUserCollection={setUserCollection}
          bottles={bottles}
          showToast={showToast}
          currentUser={currentUser}
        />
      case 'profile':
        return <ProfileScreen
          currentUser={currentUser}
          userCollection={userCollection}
          tastings={tastings}
          setCurrentScreen={setCurrentScreen}
          setCurrentUser={setCurrentUser}
          showToast={showToast}
        />
      case 'tasting':
        return <TastingScreen
          bottles={bottles}
          currentUser={currentUser}
          showToast={showToast}
          setTastings={setTastings}
          setCurrentScreen={setCurrentScreen}
        />
      case 'coming-soon':
        return <ComingSoonScreen setCurrentScreen={setCurrentScreen} />
      default:
        return <WelcomeScreen onSignup={() => setCurrentModal('signup')} onLogin={() => setCurrentModal('login')} />
    }
  }

  const renderCurrentModal = () => {
    if (!currentModal) return null

    switch (currentModal) {
      case 'signup':
        return <SignupModal
          signupData={signupData}
          setSignupData={setSignupData}
          onClose={closeModal}
          showToast={showToast}
          setCurrentUser={setCurrentUser}
          setCurrentScreen={setCurrentScreen}
          setCurrentModal={setCurrentModal}
        />
      case 'login':
        return <LoginModal
          email={loginEmail}
          setEmail={setLoginEmail}
          onClose={closeModal}
          showToast={showToast}
          setCurrentUser={setCurrentUser}
          setCurrentScreen={setCurrentScreen}
          setCurrentModal={setCurrentModal}
        />
      default:
        return null
    }
  }

  return (
    <div className="app">
      {renderCurrentScreen()}
      <Navigation currentScreen={currentScreen} setCurrentScreen={setCurrentScreen} currentUser={currentUser} />
      {renderCurrentModal()}
      <ToastContainer toasts={toasts} />
    </div>
  )
}

export default App
