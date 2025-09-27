import { useState } from 'react'

export function LoginModal({ email, setEmail, onClose, showToast, setCurrentUser, setCurrentScreen }) {
  const [emailValidation, setEmailValidation] = useState('')

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

  const submitLogin = () => {
    if (!validateEmail(email)) {
      showToast('Please enter a valid email', 'error')
      return
    }

    const mockUser = {
      id: 'user_login_' + Date.now(),
      username: email.split('@')[0],
      email,
      profilePic: 'whiskey-glass',
      joined: new Date().toISOString()
    }

    setCurrentUser(mockUser)
    localStorage.setItem('pourChoicesUser', JSON.stringify(mockUser))
    localStorage.setItem('pourChoicesToken', 'mock_token_' + Date.now())
    localStorage.setItem('pourChoicesRemember', 'true')

    onClose()
    setCurrentScreen('search')
    showToast('Welcome back!', 'success')
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') submitLogin()
  }

  return (
    <div id="login-modal" className="modal active">
      <div className="modal-overlay" onClick={onClose}></div>
      <div className="modal-content">
        <div className="modal-header">
          <h2>Welcome Back</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="input-group">
          <label htmlFor="login-email">Email</label>
          <input
            type="email"
            id="login-email"
            placeholder="your@email.com"
            value={email}
            onChange={handleEmailChange}
            onKeyPress={handleKeyPress}
          />
          <span className={`validation-icon ${emailValidation}`}></span>
        </div>

        <button className="btn btn-primary" onClick={submitLogin}>Log In</button>
      </div>
    </div>
  )
}
