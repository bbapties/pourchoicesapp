export function ProfileScreen({ currentUser, userCollection, tastings, setCurrentScreen, setCurrentUser, showToast }) {
  return (
    <div id="profile-screen" className="screen active">
      <div className="profile-content">
        <div className="profile-info">
          <div id="profile-pic-display" className="profile-pic-large">🥃</div>
          <h1 id="profile-username">{currentUser?.username || 'Username'}</h1>
          <p id="profile-email">{currentUser?.email || 'email@example.com'}</p>
        </div>
        <div className="profile-stats">
          <div className="stat-item">
            <div id="total-tastings" className="stat-number">{tastings.length}</div>
            <div className="stat-label">Tastings</div>
          </div>
          <div className="stat-item">
            <div id="total-bottles" className="stat-number">{userCollection.length}</div>
            <div className="stat-label">Bottles</div>
          </div>
          <div className="stat-item">
            <div id="avg-rating" className="stat-number">--</div>
            <div className="stat-label">Avg Rating</div>
          </div>
        </div>
        <div className="profile-actions">
          <button id="logout-btn" className="btn btn-secondary" onClick={() => {
            localStorage.removeItem('pourChoicesUser')
            localStorage.removeItem('pourChoicesRemember')
            setCurrentUser(null)
            setCurrentScreen('welcome')
            showToast('You have been logged out', 'info')
          }}>
            Log Out
          </button>
        </div>
      </div>
    </div>
  )
}
