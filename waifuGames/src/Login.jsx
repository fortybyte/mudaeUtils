import React, { useState } from 'react'
import axios from 'axios'

function Login({ onLogin }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await axios.post(`http://${window.location.hostname}:3001/api/auth/login`, {
        password
      })
      
      if (response.data.success) {
        localStorage.setItem('authToken', response.data.token)
        onLogin(response.data.token)
      }
    } catch (error) {
      if (error.response?.status === 401) {
        setError('Invalid password')
      } else {
        setError('Connection error. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <h2>Authentication Required</h2>
        <p>Please enter the password to access the bot manager</p>
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <input
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              autoFocus
            />
          </div>
          
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}
          
          <button type="submit" disabled={loading || !password}>
            {loading ? 'Authenticating...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default Login