import React, { useState, useEffect } from 'react'
import Instance from './Instance'
import { api, socket } from './api'
import './App.css'

function App() {
  const [instances, setInstances] = useState([])
  const [loading, setLoading] = useState(true)

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
          isPaused: newInstance.isPaused
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
        isPaused: instance.isPaused
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
  }

  return (
    <div className="app">
      <h1>Instance Manager</h1>
      <button className="create-button" onClick={createNewInstance}>
        Create New Instance
      </button>
      {loading ? (
        <p style={{ textAlign: 'center', color: '#666' }}>Loading instances...</p>
      ) : (
        <div className="instances-container">
          {instances.map(instance => (
            <Instance
              key={instance.id}
              instance={instance}
              onUpdate={updateInstance}
              onDelete={deleteInstance}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default App