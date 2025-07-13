import React, { useState, useEffect } from 'react'
import { api, socket } from './api'

function Instance({ instance, onUpdate, onDelete, isSelected, onToggleSelect, viewMode }) {
  const [formData, setFormData] = useState({
    token: instance.token,
    channelId: instance.channelId,
    loggingEnabled: instance.loggingEnabled
  })
  const [loggingEnabled, setLoggingEnabled] = useState(instance.loggingEnabled)
  const [rollsPerHour, setRollsPerHour] = useState(instance.rollsPerHour || 10)
  const [rollsPerHourInput, setRollsPerHourInput] = useState(String(instance.rollsPerHour || 10))
  const [logs, setLogs] = useState([])
  const [showLogs, setShowLogs] = useState(false)
  const [stats, setStats] = useState({
    totalRolls: 0,
    claimedCharacters: [],
    sessionStartTime: null
  })
  const [userInfo, setUserInfo] = useState(instance.userInfo || null)
  const [avatarUrl, setAvatarUrl] = useState(instance.avatarUrl || null)
  const [messageInput, setMessageInput] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const response = await api.createInstance({
        id: instance.id.toString(),
        token: formData.token,
        channelId: formData.channelId,
        loggingEnabled: formData.loggingEnabled
      })
      
      if (response.logs) {
        setLogs(response.logs)
      }
      
      if (response.stats) {
        setStats(response.stats)
      }
      
      if (response.userInfo) {
        setUserInfo(response.userInfo)
      }
      
      if (response.avatarUrl) {
        setAvatarUrl(response.avatarUrl)
      }
      
      onUpdate(instance.id, {
        ...formData,
        isFormVisible: false,
        startTime: Date.now(),
        isRunning: true
      })
    } catch (error) {
      console.error('Failed to create bot instance:', error)
      alert('Failed to create bot instance: ' + error.message)
    }
  }

  const handleCancel = () => {
    onDelete(instance.id)
  }

  const [displayTime, setDisplayTime] = useState(0)

  useEffect(() => {
    let interval
    if (instance.isRunning && !instance.isPaused) {
      interval = setInterval(() => {
        const elapsed = Date.now() - instance.startTime + instance.elapsedTime
        setDisplayTime(elapsed)
      }, 100)
    } else {
      setDisplayTime(instance.elapsedTime)
    }
    return () => clearInterval(interval)
  }, [instance.isRunning, instance.isPaused, instance.startTime, instance.elapsedTime])

  // Sync logging state when instance updates
  useEffect(() => {
    setLoggingEnabled(instance.loggingEnabled)
  }, [instance.loggingEnabled])

  // Sync rolls per hour when instance updates
  useEffect(() => {
    setRollsPerHour(instance.rollsPerHour || 10)
    setRollsPerHourInput(String(instance.rollsPerHour || 10))
  }, [instance.rollsPerHour])

  useEffect(() => {
    if (!instance.isFormVisible && instance.isRunning) {
      // Load initial stats
      api.getInstanceStats(instance.id.toString())
        .then(data => {
          if (data.stats) {
            setStats(data.stats)
          }
        })
        .catch(err => console.error('Failed to load stats:', err))
      
      // Update avatar URL if available
      if (instance.avatarUrl) {
        setAvatarUrl(`http://localhost:3001${instance.avatarUrl}`)
      }

      api.subscribeLogs(instance.id.toString(), (logEntry) => {
        setLogs(prevLogs => [...prevLogs, logEntry].slice(-100))
      })
      
      api.subscribeStats(instance.id.toString(), (newStats) => {
        setStats(newStats)
      })
      
      api.subscribeUserInfo(instance.id.toString(), (newUserInfo) => {
        setUserInfo(newUserInfo)
      })
      
      api.subscribeAvatarUrl(instance.id.toString(), (url) => {
        setAvatarUrl(url)
      })
      
      // Subscribe to rolls per hour updates (from $ru parsing)
      const handleRollsPerHourUpdate = (value) => {
        setRollsPerHour(value)
        setRollsPerHourInput(String(value))
        onUpdate(instance.id, { rollsPerHour: value })
      }
      socket.on(`rollsPerHour-${instance.id}`, handleRollsPerHourUpdate)
      
      return () => {
        api.unsubscribeLogs(instance.id.toString())
        api.unsubscribeStats(instance.id.toString())
        api.unsubscribeUserInfo(instance.id.toString())
        api.unsubscribeAvatarUrl(instance.id.toString())
        socket.off(`rollsPerHour-${instance.id}`, handleRollsPerHourUpdate)
      }
    }
  }, [instance.id, instance.isFormVisible, instance.isRunning])

  const formatTime = (milliseconds) => {
    const totalSeconds = Math.floor(milliseconds / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }

  const handlePauseResume = async () => {
    try {
      if (instance.isPaused) {
        await api.resumeInstance(instance.id.toString())
        onUpdate(instance.id, {
          isPaused: false,
          startTime: Date.now()
        })
      } else {
        await api.pauseInstance(instance.id.toString())
        const elapsed = Date.now() - instance.startTime + instance.elapsedTime
        onUpdate(instance.id, {
          isPaused: true,
          elapsedTime: elapsed
        })
      }
    } catch (error) {
      console.error('Failed to pause/resume:', error)
    }
  }

  const handleTerminate = async () => {
    try {
      await api.terminateInstance(instance.id.toString())
      // Instance will be deleted from server, so remove it from UI
      onDelete(instance.id)
    } catch (error) {
      console.error('Failed to terminate:', error)
    }
  }

  const handleDelete = async () => {
    try {
      if (instance.isRunning) {
        await api.deleteInstance(instance.id.toString())
      }
      onDelete(instance.id)
    } catch (error) {
      console.error('Failed to delete:', error)
    }
  }

  const toggleLogs = () => {
    setShowLogs(!showLogs)
  }

  const clearLogs = async () => {
    try {
      await api.clearInstanceLogs(instance.id.toString())
      setLogs([])
    } catch (error) {
      console.error('Failed to clear logs:', error)
    }
  }

  const getLogLevelClass = (level) => {
    switch(level) {
      case 'error': return 'log-error'
      case 'warn': return 'log-warn'
      case 'info': return 'log-info'
      case 'debug': return 'log-debug'
      default: return ''
    }
  }

  const handleSendMessage = async (e) => {
    e.preventDefault()
    if (!messageInput.trim() || sendingMessage) return
    
    setSendingMessage(true)
    try {
      await api.sendMessage(instance.id.toString(), messageInput)
      setMessageInput('')
    } catch (error) {
      console.error('Failed to send message:', error)
      alert('Failed to send message')
    } finally {
      setSendingMessage(false)
    }
  }

  const handleLoggingToggle = async () => {
    const newState = !loggingEnabled
    try {
      await api.updateLogging(instance.id.toString(), newState)
      setLoggingEnabled(newState)
      onUpdate(instance.id, { loggingEnabled: newState })
    } catch (error) {
      console.error('Failed to update logging:', error)
      const message = error.response?.data?.error || error.message || 'Failed to update logging'
      alert(message)
    }
  }

  const handleRollsPerHourSubmit = async (e) => {
    e.preventDefault()
    const value = parseInt(rollsPerHourInput)
    if (isNaN(value) || value < 0 || value > 60) {
      alert('Rolls per hour must be between 0 and 60')
      setRollsPerHourInput(String(rollsPerHour))
      return
    }
    
    try {
      await api.updateRollsPerHour(instance.id.toString(), value)
      setRollsPerHour(value)
      onUpdate(instance.id, { rollsPerHour: value })
    } catch (error) {
      console.error('Failed to update rolls per hour:', error)
      const message = error.response?.data?.error || error.message || 'Failed to update rolls per hour'
      alert(message)
      setRollsPerHourInput(String(rollsPerHour))
    }
  }

  if (!instance.isFormVisible) {
    return (
      <div className={`instance-card ${viewMode} ${isSelected ? 'selected' : ''}`}>
        <div className="instance-header">
          <input
            type="checkbox"
            className="instance-checkbox"
            checked={isSelected || false}
            onChange={() => onToggleSelect && onToggleSelect(instance.id)}
          />
          <div className="user-info">
            {avatarUrl && (
              <img 
                src={avatarUrl} 
                alt="User Avatar" 
                className="user-avatar"
                crossOrigin="anonymous"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  console.log('Avatar failed to load:', avatarUrl)
                  e.target.onerror = null // Prevent infinite loop
                  e.target.src = `https://cdn.discordapp.com/embed/avatars/0.png`
                }}
              />
            )}
            <h3>{userInfo?.username || `Instance #${instance.id}`}</h3>
          </div>
        </div>
        <div className="instance-details">
          <p><strong>Token:</strong> {instance.token.substring(0, 10)}...</p>
          <p><strong>Channel ID:</strong> {instance.channelId}</p>
          <div className="logging-toggle-container">
            <strong>Logging:</strong>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={loggingEnabled}
                onChange={handleLoggingToggle}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
          <form className="rolls-per-hour-container" onSubmit={handleRollsPerHourSubmit}>
            <strong>Rolls/Hour:</strong>
            <input
              type="number"
              className="rolls-per-hour-input"
              value={rollsPerHourInput}
              onChange={(e) => setRollsPerHourInput(e.target.value)}
              onBlur={handleRollsPerHourSubmit}
              min="0"
              max="60"
              disabled={!instance.isRunning}
            />
          </form>
          <div className="timer-section">
            <p className="timer">
              <strong>Running Time:</strong> {formatTime(displayTime)}
            </p>
            <p className="status">
              <strong>Status:</strong> {
                !instance.isRunning ? 'Terminated' : 
                instance.isPaused ? 'Paused' : 
                'Running'
              }
            </p>
          </div>
          <div className="stats-section">
            <p><strong>Session Rolls:</strong> {stats.totalRolls}</p>
            <p><strong>Claimed Characters:</strong> {
              stats.claimedCharacters.length > 0 
                ? stats.claimedCharacters.join(', ')
                : 'None yet'
            }</p>
          </div>
        </div>
        <div className="control-buttons">
          {instance.isRunning && (
            <>
              <button 
                className={instance.isPaused ? "resume-button" : "pause-button"}
                onClick={handlePauseResume}
              >
                {instance.isPaused ? 'Resume' : 'Pause'}
              </button>
              <button className="terminate-button" onClick={handleTerminate}>
                Terminate
              </button>
            </>
          )}
          <button className="log-button" onClick={toggleLogs}>
            {showLogs ? 'Hide Logs' : 'Show Logs'} ({logs.length})
          </button>
          <button className="delete-button" onClick={handleDelete}>
            Delete Instance
          </button>
        </div>
        
        <form className="message-form" onSubmit={handleSendMessage}>
          <input
            type="text"
            className="message-input"
            placeholder="Type a message..."
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            disabled={!instance.isRunning || sendingMessage}
          />
          <button 
            type="submit" 
            className="send-button"
            disabled={!instance.isRunning || !messageInput.trim() || sendingMessage}
          >
            {sendingMessage ? 'Sending...' : 'Send'}
          </button>
        </form>
        
        {showLogs && (
          <div className="logs-section">
            <div className="logs-header">
              <h4>Logs</h4>
              <button className="clear-logs-button" onClick={clearLogs}>
                Clear
              </button>
            </div>
            <div className="logs-container">
              {logs.length === 0 ? (
                <p className="no-logs">No logs yet...</p>
              ) : (
                logs.map((log, index) => (
                  <div key={index} className={`log-entry ${getLogLevelClass(log.level)}`}>
                    <span className="log-timestamp">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    <span className="log-level">[{log.level.toUpperCase()}]</span>
                    <span className="log-message">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="instance-form-container">
      <form onSubmit={handleSubmit} className="instance-form">
        <h3>New Instance Configuration</h3>
        
        <div className="form-group">
          <label htmlFor={`token-${instance.id}`}>Token:</label>
          <input
            type="text"
            id={`token-${instance.id}`}
            name="token"
            value={formData.token}
            onChange={handleInputChange}
            required
            placeholder="Enter your token"
          />
        </div>

        <div className="form-group">
          <label htmlFor={`channelId-${instance.id}`}>Channel ID:</label>
          <input
            type="text"
            id={`channelId-${instance.id}`}
            name="channelId"
            value={formData.channelId}
            onChange={handleInputChange}
            required
            placeholder="Enter channel ID"
          />
        </div>

        <div className="form-group checkbox-group">
          <label>
            <input
              type="checkbox"
              name="loggingEnabled"
              checked={formData.loggingEnabled}
              onChange={handleInputChange}
            />
            Enable Logging
          </label>
        </div>

        <div className="form-actions">
          <button type="submit" className="submit-button">
            Save Instance
          </button>
          <button type="button" className="cancel-button" onClick={handleCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

export default Instance