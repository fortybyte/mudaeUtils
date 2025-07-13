import React, { useState, useEffect } from 'react';

function TemplatesModal({ isOpen, onClose, onSelectTemplate }) {
  const [templates, setTemplates] = useState([]);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadTemplates();
    }
  }, [isOpen]);

  const loadTemplates = () => {
    const saved = localStorage.getItem('instanceTemplates');
    if (saved) {
      setTemplates(JSON.parse(saved));
    }
  };

  const saveTemplate = (template) => {
    const newTemplates = [...templates, { ...template, id: Date.now() }];
    setTemplates(newTemplates);
    localStorage.setItem('instanceTemplates', JSON.stringify(newTemplates));
    setShowCreateForm(false);
    setNewTemplateName('');
  };

  const deleteTemplate = (id) => {
    const newTemplates = templates.filter(t => t.id !== id);
    setTemplates(newTemplates);
    localStorage.setItem('instanceTemplates', JSON.stringify(newTemplates));
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2>Instance Templates</h2>
        
        <div className="templates-list">
          {templates.map(template => (
            <div key={template.id} className="template-item">
              <div>
                <h4>{template.name}</h4>
                <p>Channel: {template.channelId}</p>
                <p>Logging: {template.loggingEnabled ? 'Enabled' : 'Disabled'}</p>
              </div>
              <div className="template-actions">
                <button onClick={() => onSelectTemplate(template)}>Use</button>
                <button onClick={() => deleteTemplate(template.id)} className="danger">Delete</button>
              </div>
            </div>
          ))}
        </div>
        
        {templates.length === 0 && (
          <p className="no-templates">No templates saved yet</p>
        )}
        
        <button className="close-button" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

export default TemplatesModal;