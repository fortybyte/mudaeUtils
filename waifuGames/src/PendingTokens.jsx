import React, { useState, useEffect } from 'react'
import { api } from './api'

function PendingTokens({ onTokenSelect }) {
  const [pendingTokens, setPendingTokens] = useState([])
  const [loading, setLoading] = useState(false)

  const loadPendingTokens = async () => {
    try {
      const response = await api.getPendingTokens()
      setPendingTokens(response.tokens)
    } catch (error) {
      console.error('Failed to load pending tokens:', error)
    }
  }

  useEffect(() => {
    loadPendingTokens()
    // Refresh every 10 seconds
    const interval = setInterval(loadPendingTokens, 10000)
    return () => clearInterval(interval)
  }, [])

  const useToken = async (tokenId) => {
    setLoading(true)
    try {
      const response = await api.useToken(tokenId)
      if (response.success) {
        onTokenSelect(response.token, response.username)
        // Reload list
        loadPendingTokens()
      }
    } catch (error) {
      alert('Failed to use token: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  if (pendingTokens.length === 0) {
    return null
  }

  return (
    <div className="pending-tokens">
      <h3>Quick Add Tokens</h3>
      <p className="pending-tokens-hint">
        Run the helper script in Discord console to add tokens here
      </p>
      <div className="pending-tokens-list">
        {pendingTokens.map(token => (
          <div key={token.id} className="pending-token-item">
            <div className="pending-token-info">
              <strong>{token.username}</strong>
              <span className="pending-token-time">
                {new Date(token.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <button 
              onClick={() => useToken(token.id)}
              disabled={loading}
              className="use-token-button"
            >
              Use Token
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default PendingTokens