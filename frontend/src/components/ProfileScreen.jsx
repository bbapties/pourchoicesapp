import { useState } from 'react'
import { EditProfileModal } from './EditProfileModal'

export function ProfileScreen({ currentUser, userCollection, tastings, setCurrentScreen, setCurrentUser, showToast }) {
  const [showEditModal, setShowEditModal] = useState(false)

  return (
    <div id="profile-screen" className="screen active">
      <div className="profile-content">
        <div className="profile-info">
          {/* Display profile pic using emoji */}
          <div id="profile-pic-display" className="profile-pic-large">
            {currentUser?.profilePic ? (
              (() => {
                const picOptions = [
                  { type: 'whiskey-glass', emoji: '🥃' },
                  { type: 'oak-barrel', emoji: '🛢️' },
                  { type: 'rye-stalk', emoji: '🌾' },
                  { type: 'cork-popper', emoji: '🍾' },
                  { type: 'tumbler', emoji: '🥃' },
                  { type: 'copper-still', emoji: '⚗️' },
                  { type: 'amber-bottle', emoji: '🍯' },
                  { type: 'ice-cube', emoji: '🧊' },
                  { type: 'cigar-smoke', emoji: '💨' },
                  { type: 'lime-wedge', emoji: '🍋' },
                  { type: 'distillery-machine', emoji: '⚙️' },
                  { type: 'barrel-tap', emoji: '🚰' }
                ]
                const option = picOptions.find(p => p.type === currentUser.profilePic)
                return option ? option.emoji : '🥃'
              })()
            ) : '🥃'}
          </div>
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
          <button id="edit-profile-btn" className="btn btn-primary" onClick={() => setShowEditModal(true)}>
            Edit Profile
          </button>
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
      {showEditModal && (
        <EditProfileModal
          currentUser={currentUser}
          setCurrentUser={setCurrentUser}
          onClose={() => setShowEditModal(false)}
          showToast={showToast}
        />
      )}
    </div>
  )
}
