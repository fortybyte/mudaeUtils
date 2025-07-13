import React, { useState, useEffect } from 'react'
import { api } from './api'

function Instance({ instance, onUpdate, onDelete }) {
  const [formData, setFormData] = useState({
    token: instance.token,
    channelId: instance.channelId,
    loggingEnabled: instance.loggingEnabled
  })
  const [logs, setLogs] = useState([])
  const [showLogs, setShowLogs] = useState(false)
  const [stats, setStats] = useState({
    totalRolls: 0,
    claimedCharacters: [],
    sessionStartTime: null
  })

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

      api.subscribeLogs(instance.id.toString(), (logEntry) => {
        setLogs(prevLogs => [...prevLogs, logEntry].slice(-100))
      })
      
      api.subscribeStats(instance.id.toString(), (newStats) => {
        setStats(newStats)
      })
      
      return () => {
        api.unsubscribeLogs(instance.id.toString())
        api.unsubscribeStats(instance.id.toString())
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
      const elapsed = instance.isPaused ? instance.elapsedTime : Date.now() - instance.startTime + instance.elapsedTime
      onUpdate(instance.id, {
        isRunning: false,
        isPaused: false,
        elapsedTime: elapsed
      })
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

  if (!instance.isFormVisible) {
    return (
      <div className="instance-card">
        <h3>Instance #{instance.id}</h3>
        <div className="instance-details">
          <p><strong>Token:</strong> {instance.token.substring(0, 10)}...</p>
          <p><strong>Channel ID:</strong> {instance.channelId}</p>
          <p><strong>Logging:</strong> {instance.loggingEnabled ? 'Enabled' : 'Disabled'}</p>
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