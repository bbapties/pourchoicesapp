import { useState } from 'react'
import { supabase } from '../supabase'

const profilePicOptions = [
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

export function SignupModal({ signupData, setSignupData, onClose, showToast, setCurrentUser, setCurrentScreen, setCurrentModal }) {
  const [usernameValidation, setUsernameValidation] = useState('')
  const [emailValidation, setEmailValidation] = useState('')
  const [phone, setPhone] = useState('')
  const [username, setUsername] = useState(signupData.username)
  const [email, setEmail] = useState(signupData.email)
  const [addToHome, setAddToHome] = useState(signupData.addToHome)
  const [stayLoggedIn, setStayLoggedIn] = useState(signupData.stayLoggedIn)

  const checkUniqueness = async (username, email) => {
    try {
      // Check username uniqueness
      const { data: usernameData, error: usernameError } = await supabase
        .from('users')
        .select('username')
        .eq('username', username)
        .limit(1)

      if (usernameError) throw usernameError

      // Check email uniqueness
      const { data: emailData, error: emailError } = await supabase
        .from('users')
        .select('email')
        .eq('email', email)
        .limit(1)

      if (emailError) throw emailError

      return {
        usernameTaken: usernameData && usernameData.length > 0,
        emailTaken: emailData && emailData.length > 0
      }
    } catch (error) {
      console.error('Error checking uniqueness:', error)
      throw error
    }
  }

  const createUser = async (userData) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .insert([
          {
            username: userData.username,
            email: userData.email,
            phone: userData.phone || null,
            profile_pic_url: userData.profilePic,
            toggles: {
              addToHome: userData.addToHome,
              stayLoggedIn: userData.stayLoggedIn
            }
          }
        ])
        .select()
        .single()

      if (error) throw error

      return data
    } catch (error) {
      console.error('Error creating user:', error)
      throw error
    }
  }

  const validateUsername = (value) => {
    const isValid = /^[a-zA-Z0-9]{3,20}$/.test(value)
    setUsernameValidation(isValid ? 'valid' : 'invalid')
    return isValid
  }

  const handleUsernameChange = (e) => {
    const value = e.target.value
    setUsername(value)
    validateUsername(value)
  }

  const validateEmail = (value) => {
    const isValid = /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(value)
    setEmailValidation(isValid ? 'valid' : 'invalid')
    return isValid
  }

  const handleEmailChange = (e) => {
    const value = e.target.value
    setEmail(value)
    validateEmail(value)
  }

  const selectProfilePic = (type) => {
    setSignupData(prev => ({ ...prev, profilePic: type }))
    // Update current display
  }

  const completeSignup = async () => {
    if (!validateUsername(username) || !validateEmail(email)) {
      showToast('Please fix the validation errors', 'error')
      return
    }

    try {
      // Check username and email uniqueness
      const uniquenessCheck = await checkUniqueness(username, email)

      if (uniquenessCheck.usernameTaken) {
        setUsernameValidation('invalid')
        showToast('Username is already taken. Please choose another.', 'error')
        return
      }

      if (uniquenessCheck.emailTaken) {
        setEmailValidation('invalid')
        showToast('Email is already registered. Please use a different email.', 'error')
        return
      }

      // Create user in database
      const userData = {
        username,
        email,
        phone: phone.trim() || null,
        profilePic: signupData.profilePic,
        addToHome,
        stayLoggedIn
      }

      const newUser = await createUser(userData)

      // Set user in app state
      const appUser = {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        profilePic: newUser.profile_pic_url,
        joined: newUser.created_at
      }

      setCurrentUser(appUser)
      localStorage.setItem('pourChoicesUser', JSON.stringify(appUser))
      localStorage.setItem('pourChoicesRemember', stayLoggedIn.toString())

      onClose()
      setCurrentScreen('search')
      showToast('Welcome to the cellar!', 'success')

    } catch (error) {
      console.error('Signup error:', error)
      showToast('Failed to create account. Please try again.', 'error')
    }
  }

  return (
    <div id="signup-modal" className="modal active">
      <div className="modal-overlay" onClick={onClose}></div>
      <div className="modal-content">
        <div className="modal-header">
          <h2>Join the Cellar</h2>
        </div>

        <div className="signup-step active">
          <div className="input-group">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              placeholder="Choose a username"
              value={username}
              onChange={handleUsernameChange}
            />
            <span className={`validation-icon ${usernameValidation}`}></span>
            <div className="tooltip">3-20 characters, letters and numbers only</div>
          </div>

          <div className="input-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              placeholder="your@email.com"
              value={email}
              onChange={handleEmailChange}
            />
            <span className={`validation-icon ${emailValidation}`}></span>
          </div>

          <div className="profile-pic-section">
            <label>Choose Your Profile Picture</label>
            <div className="profile-pic-selector">
              <div className="current-profile-pic">
                <div className="current-pic-icon selected">
                  <div className="pic-icon">{profilePicOptions.find(p => p.type === signupData.profilePic)?.emoji}</div>
                </div>
                <div className="current-label">Current</div>
              </div>
              <div className="profile-pic-carousel">
                {profilePicOptions.map(option => (
                  <div
                    key={option.type}
                    className={`profile-pic-option ${signupData.profilePic === option.type ? 'selected' : ''}`}
                    data-type={option.type}
                    onClick={() => selectProfilePic(option.type)}
                  >
                    <div className="pic-icon">{option.emoji}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="input-group phone-group">
            <label htmlFor="phone">Phone (Optional)</label>
            <div className="phone-input-container">
              <div className="phone-country-wrapper">
                <select id="phone-country" className="phone-country-select">
                  <option value="US">🇺🇸 +1</option>
                  <option value="CA">🇨🇦 +1</option>
                  <option value="UK">🇬🇧 +44</option>
                  <option value="DE">🇩🇪 +49</option>
                  <option value="FR">🇫🇷 +33</option>
                  <option value="ES">🇪🇸 +34</option>
                  <option value="IT">🇮🇹 +39</option>
                  <option value="AU">🇦🇺 +61</option>
                  <option value="JP">🇯🇵 +81</option>
                </select>
              </div>
              <div className="phone-input-wrapper">
                <input
                  type="tel"
                  id="phone"
                  placeholder="(555) 123-4567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="toggle-group">
            <div className="toggle-item">
              <div className="toggle-label">
                <span className="toggle-icon">📱</span>
                <div>
                  <strong>Add to Home Screen</strong>
                  <div>Install as app for quick access</div>
                </div>
                <input type="checkbox" checked={addToHome} onChange={(e) => setAddToHome(e.target.checked)} />
                <div className="toggle-slider"></div>
              </div>
            </div>

            <div className="toggle-item">
              <div className="toggle-label">
                <span className="toggle-icon">🔒</span>
                <div>
                  <strong>Stay Logged In</strong>
                  <div>Remember me on this device</div>
                </div>
                <input type="checkbox" checked={stayLoggedIn} onChange={(e) => setStayLoggedIn(e.target.checked)} />
                <div className="toggle-slider"></div>
              </div>
            </div>
          </div>

          <div className="signup-actions">
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={completeSignup}>Complete</button>
          </div>
        </div>
      </div>
    </div>
  )
}
