import React, { useState, useEffect, useRef } from 'react'
import Instance from './Instance'
import { api, socket } from './api'
import { useTheme } from './ThemeContext'
import { useKeyboardShortcuts } from './useKeyboardShortcuts'
import './App.css'

function App() {
  const [instances, setInstances] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedInstances, setSelectedInstances] = useState(new Set())
  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState('normal') // 'normal' or 'compact'
  const { isDarkMode, toggleDarkMode } = useTheme()
  const searchInputRef = useRef(null)

  useEffect(() => {
    loadInstances()
    
    // Listen for instance changes from other tabs/clients
    const handleInstanceCreated = (newInstance) => {
      setInstances(prev => {
        // Check if instance already exists
        if (prev.find(inst => inst.id === newInstance.id)) {
          return prev
        }
        return [...prev, {
          id: newInstance.id,
          token: newInstance.token,
          channelId: newInstance.channelId,
          loggingEnabled: newInstance.loggingEnabled,
          isFormVisible: false,
          startTime: Date.now(),
          elapsedTime: 0,
          isRunning: newInstance.isRunning,
          isPaused: newInstance.isPaused,
          userInfo: newInstance.userInfo,
          avatarUrl: newInstance.avatarUrl
        }]
      })
    }
    
    const handleInstanceDeleted = ({ id }) => {
      setInstances(prev => prev.filter(inst => inst.id !== id))
    }
    
    socket.on('instance-created', handleInstanceCreated)
    socket.on('instance-deleted', handleInstanceDeleted)
    
    return () => {
      socket.off('instance-created', handleInstanceCreated)
      socket.off('instance-deleted', handleInstanceDeleted)
    }
  }, [])

  const loadInstances = async () => {
    try {
      const data = await api.getInstances()
      const formattedInstances = data.instances.map(instance => ({
        id: instance.id,
        token: instance.token,
        channelId: instance.channelId,
        loggingEnabled: instance.loggingEnabled,
        isFormVisible: false,
        startTime: Date.now(),
        elapsedTime: 0,
        isRunning: instance.isRunning,
        isPaused: instance.isPaused,
        userInfo: instance.userInfo,
        avatarUrl: instance.avatarUrl
      }))
      setInstances(formattedInstances)
    } catch (error) {
      console.error('Failed to load instances:', error)
    } finally {
      setLoading(false)
    }
  }

  const createNewInstance = () => {
    const newInstance = {
      id: Date.now(),
      token: '',
      channelId: '',
      loggingEnabled: false,
      isFormVisible: true,
      startTime: null,
      elapsedTime: 0,
      isRunning: false,
      isPaused: false
    }
    setInstances([...instances, newInstance])
  }

  const updateInstance = (id, updatedData) => {
    setInstances(instances.map(instance => 
      instance.id === id ? { ...instance, ...updatedData } : instance
    ))
  }

  const deleteInstance = (id) => {
    setInstances(instances.filter(instance => instance.id !== id))
    setSelectedInstances(prev => {
      const newSet = new Set(prev)
      newSet.delete(id)
      return newSet
    })
  }

  const toggleInstanceSelection = (id) => {
    setSelectedInstances(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  const selectAllInstances = () => {
    if (selectedInstances.size === filteredInstances.length) {
      setSelectedInstances(new Set())
    } else {
      setSelectedInstances(new Set(filteredInstances.map(i => i.id)))
    }
  }

  const bulkOperation = async (operation) => {
    const promises = []
    for (const id of selectedInstances) {
      if (operation === 'start') {
        const instance = instances.find(i => i.id === id)
        if (instance && !instance.isRunning) {
          promises.push(api.resumeInstance(id.toString()))
        }
      } else if (operation === 'stop') {
        promises.push(api.pauseInstance(id.toString()))
      } else if (operation === 'delete') {
        promises.push(api.deleteInstance(id.toString()))
      }
    }
    
    await Promise.all(promises)
    
    if (operation === 'delete') {
      setInstances(prev => prev.filter(i => !selectedInstances.has(i.id)))
      setSelectedInstances(new Set())
    } else {
      loadInstances() // Reload to get updated states
    }
  }

  // Filter instances based on search term
  const filteredInstances = instances.filter(instance => {
    const searchLower = searchTerm.toLowerCase()
    return (
      instance.id.toString().includes(searchLower) ||
      instance.channelId?.toLowerCase().includes(searchLower) ||
      instance.userInfo?.username?.toLowerCase().includes(searchLower)
    )
  })

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onCreateNew: createNewInstance,
    onToggleDarkMode: toggleDarkMode,
    onToggleViewMode: () => setViewMode(prev => prev === 'normal' ? 'compact' : 'normal'),
    onSelectAll: selectAllInstances,
    onSearch: () => searchInputRef.current?.focus(),
    onDeleteSelected: () => bulkOperation('delete'),
    selectedCount: selectedInstances.size
  })

  const handleBackup = async () => {
    try {
      const backup = await api.createBackup()
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `bot-instances-backup-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      alert('Failed to create backup: ' + error.message)
    }
  }

  const handleRestore = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = e.target.files[0]
      if (!file) return
      
      try {
        const text = await file.text()
        const backup = JSON.parse(text)
        
        if (!backup.instances) {
          throw new Error('Invalid backup file')
        }
        
        if (confirm(`This will replace all current instances with ${Object.keys(backup.instances).length} instances from the backup. Continue?`)) {
          await api.restoreBackup(backup)
          loadInstances()
          alert('Backup restored successfully')
        }
      } catch (error) {
        alert('Failed to restore backup: ' + error.message)
      }
    }
    input.click()
  }

  return (
    <div className="app">
      <div className="app-header">
        <h1>Instance Manager</h1>
        <div className="header-controls">
          <button className="backup-button" onClick={handleBackup} title="Download backup">
            💾
          </button>
          <button className="restore-button" onClick={handleRestore} title="Restore from backup">
            📂
          </button>
          <button className="theme-toggle" onClick={toggleDarkMode} title="Toggle dark mode">
            {isDarkMode ? '☀️' : '🌙'}
          </button>
          <button 
            className={`view-toggle ${viewMode === 'compact' ? 'active' : ''}`}
            onClick={() => setViewMode(viewMode === 'normal' ? 'compact' : 'normal')}
            title="Toggle view mode"
          >
            {viewMode === 'normal' ? '⊞' : '⊟'}
          </button>
        </div>
      </div>
      
      <div className="controls-section">
        <button className="create-button" onClick={createNewInstance}>
          Create New Instance
        </button>
        
        <div className="search-bar">
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search instances..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
        
        {selectedInstances.size > 0 && (
          <div className="bulk-actions">
            <span>{selectedInstances.size} selected</span>
            <button onClick={() => bulkOperation('start')}>Start Selected</button>
            <button onClick={() => bulkOperation('stop')}>Stop Selected</button>
            <button onClick={() => bulkOperation('delete')} className="danger">Delete Selected</button>
          </div>
        )}
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', color: '#666' }}>Loading instances...</p>
      ) : (
        <>
          {filteredInstances.length > 0 && (
            <div className="select-all-container">
              <label className="select-all">
                <input
                  type="checkbox"
                  checked={selectedInstances.size === filteredInstances.length && filteredInstances.length > 0}
                  onChange={selectAllInstances}
                />
                Select All
              </label>
            </div>
          )}
          
          <div className={`instances-container ${viewMode}`}>
            {filteredInstances.map(instance => (
              <Instance
                key={instance.id}
                instance={instance}
                onUpdate={updateInstance}
                onDelete={deleteInstance}
                isSelected={selectedInstances.has(instance.id)}
                onToggleSelect={toggleInstanceSelection}
                viewMode={viewMode}
              />
            ))}
          </div>
          
          {filteredInstances.length === 0 && (
            <p className="no-instances">
              {searchTerm ? 'No instances match your search' : 'No instances yet. Create one to get started!'}
            </p>
          )}
        </>
      )}
    </div>
  )
}

export default App