import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const isIOS = () => {
  const userAgent = window.navigator.userAgent.toLowerCase()
  return /iphone|ipad|ipod/.test(userAgent)
}

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
  const [username, setUsername] = useState(signupData.username)
  const [email, setEmail] = useState(signupData.email)
  const [addToHome, setAddToHome] = useState(signupData.addToHome)
  const [stayLoggedIn, setStayLoggedIn] = useState(signupData.stayLoggedIn)
  const [phoneCountry, setPhoneCountry] = useState('US')
  const [phoneRaw, setPhoneRaw] = useState('')
  const [phoneFormatted, setPhoneFormatted] = useState('')
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showIOSInstructions, setShowIOSInstructions] = useState(false)

  const getCountryCode = (country) => {
    const codes = {
      US: '+1',
      CA: '+1',
      UK: '+44',
      DE: '+49',
      FR: '+33',
      ES: '+34',
      IT: '+39',
      AU: '+61',
      JP: '+81'
    }
    return codes[country] || '+1'
  }

  const getPhoneFormat = (country) => {
    switch (country) {
      case 'US':
      case 'CA':
        return (raw) => {
          if (!raw) return ''
          const len = raw.length
          if (len === 0) return ''
          if (len <= 3) return `(${raw}`
          if (len <= 6) return `(${raw.slice(0, 3)}) ${raw.slice(3)}`
          return `(${raw.slice(0, 3)}) ${raw.slice(3, 6)}-${raw.slice(6, 10)}`
        }
      case 'UK':
        return (raw) => {
          if (!raw) return ''
          const len = raw.length
          if (len === 0) return ''
          if (len <= 4) return raw
          return `${raw.slice(0, 4)} ${raw.slice(4)}`
        }
      case 'DE':
      case 'FR':
        return (raw) => {
          if (!raw) return ''
          const len = raw.length
          if (len <= 3) return raw
          if (len <= 6) return `${raw.slice(0, 3)} ${raw.slice(3)}`
          return `${raw.slice(0, 3)} ${raw.slice(3, 6)} ${raw.slice(6)}`
        }
      case 'AU':
        return (raw) => {
          if (!raw) return ''
          const len = raw.length
          if (len <= 4) return raw
          if (len <= 7) return `${raw.slice(0, 4)} ${raw.slice(4)}`
          return `${raw.slice(0, 4)} ${raw.slice(4, 7)} ${raw.slice(7)}`
        }
      default:
        return (raw) => raw
    }
  }

  useEffect(() => {
    const formatFunc = getPhoneFormat(phoneCountry)
    setPhoneFormatted(formatFunc(phoneRaw))
  }, [phoneCountry, phoneRaw])

  useEffect(() => {
    const handler = (e) => {
      console.log('beforeinstallprompt event fired')
      e.preventDefault()
      setDeferredPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

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

  const handlePhoneChange = (e) => {
    const value = e.target.value.replace(/\D/g, '') // keep only digits
    setPhoneRaw(value)
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
        phone: phoneFormatted ? `${getCountryCode(phoneCountry)} ${phoneFormatted}` : null,
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
        phone: newUser.phone,
        profilePic: newUser.profile_pic_url,
        joined: newUser.created_at
      }

      setCurrentUser(appUser)
      localStorage.setItem('pourChoicesUser', JSON.stringify(appUser))
      localStorage.setItem('pourChoicesRemember', stayLoggedIn.toString())

      onClose()
      setCurrentScreen('search')
      showToast('Welcome to the cellar!', 'success')

      if (addToHome) {
        setTimeout(() => {
          if (isIOS()) {
            setShowIOSInstructions(true)
          } else if (deferredPrompt) {
            deferredPrompt.prompt()
            deferredPrompt.userChoice.then((choiceResult) => {
              if (choiceResult.outcome === 'accepted') {
                showToast('App added to Home Screen!', 'success')
              }
              setDeferredPrompt(null)
            }).catch((err) => {
              setDeferredPrompt(null)
            })
          }
        }, 2000)
      }

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
          <div className="input-group relative">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              placeholder="Choose a username"
              className="px-3 pr-8"
              value={username}
              onChange={handleUsernameChange}
            />
            <span className={`validation-icon absolute right-2 top-1/2 transform ${usernameValidation === 'valid' ? 'text-green-500' : usernameValidation === 'invalid' ? 'text-red-500' : 'hidden'}`}>{usernameValidation ? (usernameValidation === 'valid' ? '✓' : '✗') : ''}</span>
            <div className="tooltip">3-20 characters, letters and numbers only</div>
          </div>

          <div className="input-group relative">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              placeholder="your@email.com"
              className="px-3 pr-8"
              value={email}
              onChange={handleEmailChange}
            />
            <span className={`validation-icon absolute right-2 top-1/2 transform ${emailValidation === 'valid' ? 'text-green-500' : emailValidation === 'invalid' ? 'text-red-500' : 'hidden'}`}>{emailValidation ? (emailValidation === 'valid' ? '✓' : '✗') : ''}</span>
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
                <select id="phone-country" className="phone-country-select" value={phoneCountry} onChange={(e) => setPhoneCountry(e.target.value)}>
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
                  value={phoneFormatted}
                  onChange={handlePhoneChange}
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
      {showIOSInstructions && (
        <div className="modal ios-instructions-modal active">
          <div className="modal-overlay" onClick={() => setShowIOSInstructions(false)}></div>
          <div className="modal-content">
            <div className="modal-header">
              <h3>Add to Home Screen</h3>
            </div>
            <div className="modal-body">
              <p>To install the app on your iPhone/iPad:</p>
              <ol style={{ textAlign: 'left', paddingLeft: '20px' }}>
                <li>Tap the Share button at the bottom of Safari (looks like a square with an arrow)</li>
                <li>Scroll down and tap "Add to Home Screen" (square with upward arrow icon)</li>
                <li>Tap "Add" in the top right corner</li>
              </ol>
              <p>This will create a shortcut to the app on your home screen.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setShowIOSInstructions(false)}>Got it</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
