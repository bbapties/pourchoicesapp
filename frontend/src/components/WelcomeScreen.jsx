import { useState, useEffect } from 'react'

export function WelcomeScreen({ onSignup, onLogin }) {
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    // Animate in after a slight delay
    setTimeout(() => setIsLoaded(true), 100)
  }, [])

  return (
    <div id="welcome-screen" className={`screen active ${isLoaded ? 'loaded' : ''}`}>
      <div className="welcome-background"></div>
      <div className="welcome-overlay">
        <div className="welcome-content">
          <div className="welcome-buttons">
            <button id="signup-btn" className="btn btn-primary" onClick={() => { console.log('Sign Up clicked'); onSignup(); }}>
              Sign Up
            </button>
            <button id="login-btn" className="btn btn-secondary" onClick={() => { console.log('Log In clicked'); onLogin(); }}>
              Log In
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
