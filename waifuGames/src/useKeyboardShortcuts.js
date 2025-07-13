import { useEffect } from 'react';

export function useKeyboardShortcuts({ 
  onCreateNew,
  onToggleDarkMode,
  onToggleViewMode,
  onSelectAll,
  onSearch,
  onDeleteSelected,
  selectedCount
}) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Check if user is typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        // Only handle Escape to blur the input
        if (e.key === 'Escape') {
          e.target.blur();
        }
        return;
      }

      // Cmd/Ctrl + N: Create new instance
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        onCreateNew();
      }
      
      // Cmd/Ctrl + D: Toggle dark mode
      if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
        e.preventDefault();
        onToggleDarkMode();
      }
      
      // Cmd/Ctrl + L: Toggle view mode
      if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
        e.preventDefault();
        onToggleViewMode();
      }
      
      // Cmd/Ctrl + A: Select all
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault();
        onSelectAll();
      }
      
      // Cmd/Ctrl + F: Focus search
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        onSearch();
      }
      
      // Delete: Delete selected (with confirmation)
      if (e.key === 'Delete' && selectedCount > 0) {
        if (confirm(`Delete ${selectedCount} selected instance(s)?`)) {
          onDeleteSelected();
        }
      }
      
      // ?: Show help
      if (e.key === '?' && !e.shiftKey) {
        e.preventDefault();
        alert(`Keyboard Shortcuts:
        
⌘/Ctrl + N: Create new instance
⌘/Ctrl + D: Toggle dark mode
⌘/Ctrl + L: Toggle view mode
⌘/Ctrl + A: Select all instances
⌘/Ctrl + F: Focus search
Delete: Delete selected instances
?: Show this help`);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCreateNew, onToggleDarkMode, onToggleViewMode, onSelectAll, onSearch, onDeleteSelected, selectedCount]);
}