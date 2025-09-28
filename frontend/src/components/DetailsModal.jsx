import { useState, useEffect } from 'react'

export function DetailsModal({ bottle, onClose, showToast, onAddToCollection, onStartTasting }) {
  const [showPopover, setShowPopover] = useState({ your: false, global: false })

  useEffect(() => {
    // Close popover when clicking outside
    const handleClickOutside = () => {
      setShowPopover({ your: false, global: false })
    }

    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  if (!bottle) return null

  const pendingIcon = bottle.status === 'pending' ? '⏳' : ''

  const handleAddToCollection = async () => {
    await onAddToCollection(bottle.id, 100) // Default 100% volume
    showToast('Added to your collection!', 'success')
    onClose()
  }

  const handlePopoverClick = (type, event) => {
    event.stopPropagation()
    setShowPopover(prev => ({ ...prev, [type]: !prev[type] }))
  }

  const renderRankings = () => {
    const yourRank = bottle.rankings?.your || 50
    const globalRank = bottle.rankings?.global || 50

    return (
      <div className="rankings">
        <div className="badge">
          <span className="label">Your: {yourRank}/100</span>
          <div
            className="popover-trigger"
            onClick={(e) => handlePopoverClick('your', e)}
            aria-label="Your ranking info"
          >
            ?
          </div>
          {showPopover.your && (
            <div className="popover" role="tooltip">
              You beat {yourRank}% of tasters! Head-to-head wins—like fighters!
            </div>
          )}
        </div>
        <div className="badge">
          <span className="label">Global: {globalRank}/100</span>
          <div
            className="popover-trigger"
            onClick={(e) => handlePopoverClick('global', e)}
            aria-label="Global ranking info"
          >
            ?
          </div>
          {showPopover.global && (
            <div className="popover" role="tooltip">
              Overall community ranking. Head-to-head wins—like fighters!
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal-content details-modal" onClick={(e) => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose} aria-label="Close modal">×</button>

        <div className="modal-images">
          {(bottle.images && bottle.images.length > 0) ? (
            <img src={bottle.images[0]} alt={`${bottle.name} bottle`} onError={(e) => { e.target.style.display = 'none' }} />
          ) : (
            <div className="placeholder-image">{bottle.emoji}</div>
          )}
          {bottle.images && bottle.images.length > 1 && (
            <div className="image-count">+{bottle.images.length - 1} more</div>
          )}
        </div>

        <div className="bottle-info">
          <h1 id="modal-title" className="bottle-name">
            {bottle.name} {pendingIcon}
          </h1>
          <p className="bottle-distillery">{bottle.distillery}</p>
          <p className="bottle-type">{bottle.type}</p>

          {renderRankings()}
        </div>

        <div className="modal-actions">
          <button
            className="btn primary"
            onClick={onStartTasting}
            aria-label="Start tasting this bottle"
          >
            Start Tasting
          </button>
          <button
            className="btn secondary"
            onClick={handleAddToCollection}
            aria-label="Add to collection"
          >
            Add to Collection
          </button>
        </div>
      </div>
    </div>
  )
}
