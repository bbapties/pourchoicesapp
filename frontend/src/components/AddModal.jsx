import { useState } from 'react'

export function AddModal({ onClose, showToast, onAddBottle }) {
  const [formData, setFormData] = useState({
    name: '',
    distillery: '',
    type: '',
    otherType: '',
    barcode: '',
    images: []
  })

  const [showOtherType, setShowOtherType] = useState(false)
  const [uploading, setUploading] = useState(false)

  const bottleTypes = ['Blended', 'Bourbon', 'Single Malt', 'Rye', 'Other']

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))

    if (name === 'type') {
      setShowOtherType(value === 'Other')
      if (value !== 'Other') {
        setFormData(prev => ({ ...prev, otherType: '' }))
      }
    }
  }

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Check if image
    if (!file.type.startsWith('image/')) {
      showToast('Image error—try again', 'error')
      return
    }

    // Check size
    if (file.size > 2 * 1024 * 1024) {
      showToast('File too large—compressing to 2MB', 'warning')
    }

    setUploading(true)
    try {
      const ImageCompression = (await import('browser-image-compression')).default
      const options = {
        maxSizeMB: 2,
        maxWidthOrHeight: 1024,
        useWebWorker: true
      }

      const compressedFile = await ImageCompression(file, options)
      const base64 = await blobToBase64(compressedFile)

      setFormData(prev => ({
        ...prev,
        images: [...prev.images, base64]
      }))

      showToast('Photo added successfully!', 'success')
    } catch (error) {
      console.error('Image compression error:', error)
      showToast('Image error—try again', 'error')
    } finally {
      setUploading(false)
    }
  }

  const blobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }



  const handleSubmit = async (e) => {
    e.preventDefault()

    const typeToSubmit = formData.type === 'Other' ? formData.otherType : formData.type

    if (!formData.name.trim() || !formData.distillery.trim() || !typeToSubmit.trim()) {
      showToast('Please fill all required fields', 'error')
      return
    }

    if (formData.type === 'Other' && formData.otherType.trim().length > 50) {
      showToast('Other type limited to 50 chars', 'error')
      return
    }

    const bottleData = {
      name: formData.name.trim(),
      distillery: formData.distillery.trim(),
      type: typeToSubmit.trim(),
      barcode: formData.barcode.trim(),
      images: formData.images
    }

    try {
      const result = await onAddBottle(bottleData)
      if (result.duplicates) {
        const explanations = result.duplicates.map(d => `${d.name} by ${d.distillery}`).join(', ')
        if (!confirm(`Similar bottles found: ${explanations}. Admin will review. Continue?`)) {
          return
        }
        // If user confirms, try again but force (implementation would need force flag)
      }

      showToast('Bottle added successfully!', 'success')
      onClose()
    } catch (error) {
      showToast('Failed to add bottle—try again', 'error')
    }
  }

  const removeImage = (index) => {
    setFormData(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index)
    }))
  }



  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="add-modal-title">
      <div className="modal-content add-modal" onClick={(e) => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose} aria-label="Close modal">×</button>

        <h1 id="add-modal-title">Add New Bottle</h1>

        <form onSubmit={handleSubmit} className="add-form">
          <div className="form-group">
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g., Macallan 18"
              className="form-input"
              aria-label="Bottle name"
              required
            />
          </div>

          <div className="form-group">
            <input
              type="text"
              name="distillery"
              value={formData.distillery}
              onChange={handleChange}
              placeholder="e.g., Macallan Distillery"
              className="form-input"
              aria-label="Distillery"
              required
            />
          </div>

          <div className="form-group">
            <select
              name="type"
              value={formData.type}
              onChange={handleChange}
              className="form-input"
              aria-label="Bottle type"
              required
            >
              <option value="">e.g., Single Malt</option>
              {bottleTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          {showOtherType && (
            <div className="form-group">
              <input
                type="text"
                name="otherType"
                value={formData.otherType}
                onChange={handleChange}
                placeholder="e.g., Rye Whiskey"
                className="form-input"
                aria-label="Other type"
                maxLength={50}
              />
            </div>
          )}

          <div className="form-group">
            <div className="upload-group">
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                className="file-input"
                aria-label="Upload photo"
                id="photo-upload"
              />
              <label htmlFor="photo-upload" className="upload-label">
                📷 Upload Photo
              </label>
              {uploading && <span>Uploading...</span>}
              {formData.images.length < 2 && (
                <span className="upload-tooltip">Clear shots! Max 2MB ×{2 - formData.images.length}</span>
              )}
            </div>
          </div>

          <div className="form-group">
            <input
              type="text"
              name="barcode"
              value={formData.barcode}
              onChange={handleChange}
              placeholder="Enter barcode (optional)"
              className="form-input"
              aria-label="Barcode"
            />
          </div>

          {formData.images.length > 0 && (
            <div className="uploaded-images">
              {formData.images.map((image, index) => (
                <div key={index} className="image-preview">
                  <img src={image} alt={`Uploaded ${index + 1}`} />
                  <button type="button" onClick={() => removeImage(index)}>×</button>
                </div>
              ))}
            </div>
          )}

          <button type="submit" className="btn primary" disabled={uploading}>
            Add Bottle
          </button>
        </form>
      </div>
    </div>
  )
}
