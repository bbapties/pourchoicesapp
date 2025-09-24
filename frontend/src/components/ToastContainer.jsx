export function ToastContainer({ toasts }) {
  return (
    <div id="toast-container" className="toast-container">
      {toasts.map(toast => (
        <div key={toast.id} className={`toast ${toast.type}`}>
          {toast.message}
        </div>
      ))}
    </div>
  )
}
