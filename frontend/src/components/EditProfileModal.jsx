import { useState, useEffect } from 'react'
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

export function EditProfileModal({ currentUser, setCurrentUser, onClose, showToast }) {
  const [usernameValidation, setUsernameValidation] = useState('valid')
  const [emailValidation, setEmailValidation] = useState('valid')
  const [username, setUsername] = useState(currentUser?.username || '')
  const [email, setEmail] = useState(currentUser?.email || '')
  const [profilePic, setProfilePic] = useState(currentUser?.profilePic || 'whiskey-glass')
  const [phoneCountry, setPhoneCountry] = useState('US')
  const [phoneRaw, setPhoneRaw] = useState('')
  const [phoneFormatted, setPhoneFormatted] = useState('')

  const parsePhone = (phoneString) => {
    if (!phoneString) return { country: 'US', raw: '', formatted: '' }

    // Remove spaces and then parse
    const clean = phoneString.replace(/\s/g, '')
    if (clean.startsWith('+1')) {
      const raw = clean.slice(2).replace(/\D/g, '')
      return { country: 'US', raw, formatted: formatPhone('US', raw) }
    } else if (clean.startsWith('+44')) {
      const raw = clean.slice(3).replace(/\D/g, '')
      return { country: 'UK', raw, formatted: formatPhone('UK', raw) }
    } else if (clean.startsWith('+49')) {
      const raw = clean.slice(3).replace(/\D/g, '')
      return { country: 'DE', raw, formatted: formatPhone('DE', raw) }
    } else if (clean.startsWith('+33')) {
      const raw = clean.slice(3).replace(/\D/g, '')
      return { country: 'FR', raw, formatted: formatPhone('FR', raw) }
    } else if (clean.startsWith('+34')) {
      const raw = clean.slice(3).replace(/\D/g, '')
      return { country: 'ES', raw, formatted: formatPhone('ES', raw) }
    } else if (clean.startsWith('+39')) {
      const raw = clean.slice(3).replace(/\D/g, '')
      return { country: 'IT', raw, formatted: formatPhone('IT', raw) }
    } else if (clean.startsWith('+61')) {
      const raw = clean.slice(3).replace(/\D/g, '')
      return { country: 'AU', raw, formatted: formatPhone('AU', raw) }
    } else if (clean.startsWith('+81')) {
      const raw = clean.slice(3).replace(/\D/g, '')
      return { country: 'JP', raw, formatted: formatPhone('JP', raw) }
    }
    // Default to US if not recognized
    const raw = clean.replace(/\D/g, '')
    return { country: 'US', raw, formatted: formatPhone('US', raw) }
  }

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

  const formatPhone = (country, raw) => {
    switch (country) {
      case 'US':
      case 'CA':
        if (!raw) return ''
        const len = raw.length
        if (len === 0) return ''
        if (len <= 3) return `(${raw}`
        if (len <= 6) return `(${raw.slice(0, 3)}) ${raw.slice(3)}`
        return `(${raw.slice(0, 3)}) ${raw.slice(3, 6)}-${raw.slice(6, 10)}`
      case 'UK':
        if (!raw) return ''
        const lenUK = raw.length
        if (lenUK === 0) return ''
        if (lenUK <= 4) return raw
        return `${raw.slice(0, 4)} ${raw.slice(4)}`
      case 'DE':
      case 'FR':
        if (!raw) return ''
        const lenDE = raw.length
        if (lenDE <= 3) return raw
        if (lenDE <= 6) return `${raw.slice(0, 3)} ${raw.slice(3)}`
        return `${raw.slice(0, 3)} ${raw.slice(3, 6)} ${raw.slice(6)}`
      case 'AU':
        if (!raw) return ''
        const lenAU = raw.length
        if (lenAU <= 4) return raw
        if (lenAU <= 7) return `${raw.slice(0, 4)} ${raw.slice(4)}`
        return `${raw.slice(0, 4)} ${raw.slice(4, 7)} ${raw.slice(7)}`
      default:
        return raw
    }
  }

  useEffect(() => {
    const fetchUserData = async () => {
      if (!currentUser) return

      try {
        // Try to get from database to ensure we have latest data
        const { data, error } = await supabase
          .from('users')
          .select('username, email, phone, profile_pic_url')
          .eq('id', currentUser.id)
          .single()

        if (error) throw error

        setUsername(data.username || currentUser.username || '')
        setEmail(data.email || currentUser.email || '')
        setProfilePic(data.profile_pic_url || currentUser.profilePic || 'whiskey-glass')

        // Parse phone if exists
        const phoneData = parsePhone(data.phone || currentUser.phone || '')
        setPhoneCountry(phoneData.country)
        setPhoneRaw(phoneData.raw)
      } catch (err) {
        console.warn('Could not fetch user data from DB, using local data:', err)
        // Fallback to currentUser data
        setUsername(currentUser.username || '')
        setEmail(currentUser.email || '')
        setProfilePic(currentUser.profilePic || 'whiskey-glass')

        const phoneData = parsePhone(currentUser.phone || '')
        setPhoneCountry(phoneData.country)
        setPhoneRaw(phoneData.raw)
      }
    }

    fetchUserData()
  }, [currentUser])

  useEffect(() => {
    setPhoneFormatted(formatPhone(phoneCountry, phoneRaw))
  }, [phoneCountry, phoneRaw])

  const checkUniqueness = async (username, email) => {
    try {
      let usernameTaken = false
      let emailTaken = false

      // Check username only if changed
      if (username !== currentUser.username) {
        const { data: usernameData, error: usernameError } = await supabase
          .from('users')
          .select('username')
          .eq('username', username)
          .limit(1)

        if (usernameError) throw usernameError
        usernameTaken = usernameData && usernameData.length > 0
      }

      // Check email only if changed
      if (email !== currentUser.email) {
        const { data: emailData, error: emailError } = await supabase
          .from('users')
          .select('email')
          .eq('email', email)
          .limit(1)

        if (emailError) throw emailError
        emailTaken = emailData && emailData.length > 0
      }

      return { usernameTaken, emailTaken }
    } catch (error) {
      console.error('Error checking uniqueness:', error)
      throw error
    }
  }

  const updateUser = async (userData) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .update({
          username: userData.username,
          email: userData.email,
          phone: userData.phone || null,
          profile_pic_url: userData.profilePic
        })
        .eq('id', currentUser.id)
        .select()
        .single()

      if (error) throw error
      return data
    } catch (error) {
      console.error('Error updating user:', error)
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
    setProfilePic(type)
  }

  const saveProfile = async () => {
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

      // Update user in database
      const userData = {
        username,
        email,
        phone: phoneFormatted ? `${getCountryCode(phoneCountry)} ${phoneFormatted}` : null,
        profilePic
      }

      const updatedUser = await updateUser(userData)

      // Update app state
      const appUser = {
        ...currentUser,
        username: updatedUser.username,
        email: updatedUser.email,
        profilePic: updatedUser.profile_pic_url,
        phone: updatedUser.phone
      }

      setCurrentUser(appUser)
      localStorage.setItem('pourChoicesUser', JSON.stringify(appUser))

      onClose()
      showToast('Profile updated successfully!', 'success')

    } catch (error) {
      console.error('Update error:', error)
      showToast('Failed to update profile. Please try again.', 'error')
    }
  }

  return (
    <div id="edit-profile-modal" className="modal active">
      <div className="modal-overlay" onClick={onClose}></div>
      <div className="modal-content">
        <div className="modal-header">
          <h2>Edit Profile</h2>
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
                  <div className="pic-icon">{profilePicOptions.find(p => p.type === profilePic)?.emoji}</div>
                </div>
                <div className="current-label">Current</div>
              </div>
              <div className="profile-pic-carousel">
                {profilePicOptions.map(option => (
                  <div
                    key={option.type}
                    className={`profile-pic-option ${profilePic === option.type ? 'selected' : ''}`}
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

          <div className="signup-actions">
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={saveProfile}>Save</button>
          </div>
        </div>
      </div>
    </div>
  )
}
