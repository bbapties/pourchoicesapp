export function Navigation({ currentScreen, setCurrentScreen, currentUser }) {
  if (!currentUser && currentScreen !== 'welcome') return null

  const navigate = (screen) => {
    setCurrentScreen(screen)
  }

  return (
    <div className="bottom-nav">
      <button
        className={`nav-item ${currentScreen === 'search' ? 'active' : ''}`}
        data-screen="search"
        onClick={() => navigate('search')}
      >
        <div className="nav-icon">🔍</div>
        <div className="nav-label">Search</div>
      </button>
      <button
        className={`nav-item ${currentScreen === 'mybar' ? 'active' : ''}`}
        data-screen="mybar"
        onClick={() => navigate('mybar')}
      >
        <div className="nav-icon">🏠</div>
        <div className="nav-label">My Bar</div>
      </button>
      <button
        className={`nav-item ${currentScreen === 'profile' ? 'active' : ''}`}
        data-screen="profile"
        onClick={() => navigate('profile')}
      >
        <div className="nav-icon">👤</div>
        <div className="nav-label">Profile</div>
      </button>
    </div>
  )
}
