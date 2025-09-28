import { useState, useEffect, useRef } from 'react'

export function BarcodeScanner({ onScan, onError, onClose }) {
  const [scanning, setScanning] = useState(true)
  const [error, setError] = useState(null)
  const videoRef = useRef(null)

  useEffect(() => {
    // For now, create a simple placeholder that doesn't crash
    // In a real implementation, you'd integrate with a QR scanning library
    const handleClick = () => {
      // Simulate finding a barcode after 3 seconds
      setTimeout(() => {
        const mockBarcode = '123456789012'
        onScan(mockBarcode)
        setScanning(false)
      }, 3000)
    }

    // Add click handler to simulate scanning
    const video = videoRef.current
    if (video) {
      video.addEventListener('click', handleClick)

      return () => {
        video.removeEventListener('click', handleClick)
      }
    }
  }, [onScan])

  const handleError = () => {
    setError('Camera error - try text entry instead')
    onError()
  }

  const restartScan = () => {
    setScanning(true)
    setError(null)
  }

  return (
    <div className="barcode-scanner-overlay" onClick={onClose}>
      <div className="scanner-content" onClick={(e) => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose} aria-label="Close scanner">×</button>

        <h2>Scan Barcode</h2>
        <p>Point camera at a barcode to scan</p>

        <div className="video-container">
          <video ref={videoRef} playsInline muted />
          {!scanning && <div className="scanner-placeholder">Initializing camera...</div>}
        </div>

        {error && (
          <div className="scanner-error">
            {error}
          </div>
        )}

        <div className="scanner-controls">
          <button onClick={restartScan} disabled={scanning}>
            {scanning ? 'Scanning...' : 'Restart Scan'}
          </button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
